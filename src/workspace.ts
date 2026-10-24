import { isRepository } from './domain'
import type { SavedRepository, Workspace } from './domain'

export const decisionLabels = {
  exploring: 'Изучаю',
  shortlist: 'В шорт-листе',
  chosen: 'Выбран в проект',
}
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

const isSaved = (value: unknown): value is SavedRepository => {
  if (!value || typeof value !== 'object') return false
  const s = value as SavedRepository
  return (
    isRepository(s.repo) &&
    typeof s.note === 'string' &&
    s.note.length <= 20000 &&
    typeof s.collection === 'string' &&
    s.collection.length <= 40 &&
    Object.hasOwn(decisionLabels, s.decision)
  )
}

export function exportBackup(workspace: Workspace) {
  return JSON.stringify(
    { format: 'repoveya', version: 1, exportedAt: new Date().toISOString(), workspace },
    null,
    2,
  )
}

export function parseBackup(text: string): Workspace {
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new Error('Файл слишком большой. Максимальный размер — 5 МБ.')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Файл повреждён или не является JSON-копией Repoveya.')
  }
  if (value?.format !== 'repoveya' || value?.version !== 1)
    throw new Error('Нужна резервная копия Repoveya версии 1.')
  const w = value.workspace
  if (
    !w ||
    !Array.isArray(w.saved) ||
    !Array.isArray(w.collections) ||
    w.saved.length > 1000 ||
    w.collections.length > 200 ||
    !w.saved.every(isSaved) ||
    !w.collections.every((c: unknown) => typeof c === 'string' && c.trim() && c.length <= 40)
  ) {
    throw new Error('В копии есть некорректные данные. Текущая библиотека не изменена.')
  }
  if (new Set(w.saved.map((s: SavedRepository) => s.repo.id)).size !== w.saved.length)
    throw new Error('В копии повторяются репозитории. Проверьте исходный файл.')
  // Return only supported fields, never arbitrary properties from a file.
  return {
    saved: w.saved.map((s: SavedRepository) => ({
      repo: s.repo,
      note: s.note,
      collection: s.collection,
      decision: s.decision,
    })),
    collections: [...new Set<string>(w.collections.map((c: string) => c.trim()))],
  }
}

export function mergeWorkspace(current: Workspace, incoming: Workspace): Workspace {
  const collections = [...current.collections]
  const canonical = (name: string) => {
    if (!name.trim()) return ''
    const found = collections.find((c) => c.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    if (found) return found
    collections.push(name.trim())
    return name.trim()
  }
  incoming.collections.forEach(canonical)
  const existing = new Set(current.saved.map((s) => s.repo.id))
  return {
    collections,
    saved: [
      ...current.saved,
      ...incoming.saved
        .filter((s) => !existing.has(s.repo.id))
        .map((s) => ({ ...s, collection: canonical(s.collection) })),
    ],
  }
}

export function renameCollection(workspace: Workspace, oldName: string, input: string): Workspace {
  const name = input.trim()
  if (!name || name.length > 40) throw new Error('Введите название от 1 до 40 символов.')
  if (
    workspace.collections.some(
      (c) => c !== oldName && c.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new Error('Коллекция с таким названием уже есть.')
  return {
    collections: workspace.collections.map((c) => (c === oldName ? name : c)),
    saved: workspace.saved.map((s) => (s.collection === oldName ? { ...s, collection: name } : s)),
  }
}

export function removeCollection(workspace: Workspace, name: string): Workspace {
  return {
    collections: workspace.collections.filter((c) => c !== name),
    saved: workspace.saved.map((s) => (s.collection === name ? { ...s, collection: '' } : s)),
  }
}
