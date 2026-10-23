export interface Repository {
  id: number
  full_name: string
  name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  language: string | null
  license: string | null
  updated_at: string
  topics: string[]
  archived: boolean
}

export interface SavedRepository {
  repo: Repository
  note: string
  collection: string
  decision: 'exploring' | 'shortlist' | 'chosen'
}

export interface Workspace {
  saved: SavedRepository[]
  collections: string[]
}

export const STORAGE_KEY = 'repoveya.workspace.v1'
export const emptyWorkspace: Workspace = { saved: [], collections: ['Мой стек'] }

export function isRepository(value: unknown): value is Repository {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'number' &&
    typeof r.full_name === 'string' &&
    typeof r.name === 'string' &&
    typeof r.html_url === 'string' &&
    r.html_url.startsWith('https://github.com/') &&
    (r.description === null || typeof r.description === 'string') &&
    typeof r.stargazers_count === 'number' &&
    typeof r.forks_count === 'number' &&
    typeof r.open_issues_count === 'number' &&
    typeof r.updated_at === 'string' &&
    (r.language === null || typeof r.language === 'string') &&
    (r.license === null || typeof r.license === 'string') &&
    Array.isArray(r.topics) &&
    r.topics.every((t) => typeof t === 'string') &&
    typeof r.archived === 'boolean'
  )
}

export function readWorkspace(): Workspace {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!value || !Array.isArray(value.saved) || !Array.isArray(value.collections))
      return emptyWorkspace
    return {
      saved: value.saved.filter(
        (s: SavedRepository) =>
          s &&
          isRepository(s.repo) &&
          typeof s.note === 'string' &&
          typeof s.collection === 'string' &&
          ['exploring', 'shortlist', 'chosen'].includes(s.decision),
      ),
      collections: [
        ...new Set<string>(
          value.collections.filter((c: unknown) => typeof c === 'string' && c.trim()),
        ),
      ],
    }
  } catch {
    return emptyWorkspace
  }
}

export function filterRepositories(repos: Repository[], query: string, category: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return repos.filter((r) => {
    const haystack =
      `${r.full_name} ${r.description || ''} ${r.language || ''} ${r.topics.join(' ')}`.toLowerCase()
    const matches =
      category === 'all' ||
      (category === 'frontend' && /react|vue|svelte|frontend|nextjs|astro/.test(haystack)) ||
      (category === 'tools' && /vite|vitest|tooling|build-tool|testing/.test(haystack)) ||
      (category === 'backend' && /database|backend|prisma|supabase|hono|orm/.test(haystack)) ||
      (category === 'design' && /css|tailwind|component|ui-library/.test(haystack))
    return matches && words.every((w) => haystack.includes(w))
  })
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

export function toMarkdown(saved: SavedRepository[]) {
  return (
    '# Repoveya — технологические решения\n\n' +
    saved
      .map(
        (s) =>
          `## ${s.repo.full_name}\n\n${s.repo.html_url}\n\n${s.repo.description || ''}\n\n` +
          `Коллекция: ${s.collection || 'Без коллекции'}\n\nРешение: ${s.decision}\n\n` +
          `Заметки:\n${s.note || 'Пока нет заметок.'}\n`,
      )
      .join('\n---\n\n')
  )
}

export function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function searchGithub(query: string, sort: string, page: number, signal: AbortSignal) {
  const params = new URLSearchParams({
    q: `${query.trim() || 'stars:>10000'} archived:false`,
    sort: sort === 'updated' ? 'updated' : 'stars',
    order: 'desc',
    per_page: '12',
    page: String(page),
  })
  const response = await fetch(`https://api.github.com/search/repositories?${params}`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'GitHub временно ограничил запросы. Попробуйте позже или вернитесь к подборке.'
        : 'Не удалось получить репозитории. Проверьте соединение и повторите поиск.',
    )
  const data = await response.json()
  if (!Array.isArray(data.items))
    throw new Error('GitHub вернул неожиданный ответ. Повторите поиск.')
  const items: Repository[] = data.items
    .map((r: Record<string, unknown>) => ({
      ...r,
      license: (r.license as { spdx_id?: string } | null)?.spdx_id || null,
      updated_at: r.pushed_at,
      topics: r.topics || [],
    }))
    .filter(isRepository)
  return { items, total: Number(data.total_count) || 0 }
}
