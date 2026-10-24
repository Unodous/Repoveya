import { describe, expect, it } from 'vitest'
import seed from './seed.json'
import {
  exportBackup,
  mergeWorkspace,
  parseBackup,
  removeCollection,
  renameCollection,
} from './workspace'
import type { Workspace } from './domain'

const current: Workspace = {
  collections: ['Мой стек'],
  saved: [
    {
      repo: seed[0],
      collection: 'Мой стек',
      note: 'Моя заметка\nВторая строка',
      decision: 'chosen',
    },
  ],
}

describe('portable workspace', () => {
  it('round-trips every note, decision and empty collection', () => {
    const original = { ...current, collections: [...current.collections, 'Пустая коллекция'] }
    expect(parseBackup(exportBackup(original))).toEqual(original)
  })
  it('rejects corrupt, unsupported and unsafe backups without accepting partial data', () => {
    expect(() => parseBackup('{')).toThrow('повреждён')
    expect(() => parseBackup('{"format":"repoveya","version":2}')).toThrow('версии 1')
    const unsafe = structuredClone(current)
    unsafe.saved[0].repo.html_url = 'https://github.com.evil.example/react/react'
    expect(() => parseBackup(exportBackup(unsafe))).toThrow('некорректные')
    unsafe.saved[0].repo = { ...seed[0], full_name: '../..', html_url: 'https://github.com/../..' }
    expect(() => parseBackup(exportBackup(unsafe))).toThrow('некорректные')
  })
  it('rejects duplicate IDs and invalid counts or dates', () => {
    expect(() =>
      parseBackup(exportBackup({ ...current, saved: [...current.saved, ...current.saved] })),
    ).toThrow('повторяются')
    for (const patch of [{ stargazers_count: -1 }, { updated_at: 'broken-date' }, { id: 0 }]) {
      const broken = {
        ...current,
        saved: [{ ...current.saved[0], repo: { ...seed[0], ...patch } }],
      }
      expect(() => parseBackup(exportBackup(broken))).toThrow('некорректные')
    }
  })
  it('merges new entries without overwriting current notes and canonicalizes collection names', () => {
    const incoming: Workspace = {
      collections: ['мой стек', 'Бэкенд'],
      saved: [
        { ...current.saved[0], note: 'Старая заметка', decision: 'exploring' },
        { repo: seed[1], collection: 'мой стек', note: 'Альтернатива', decision: 'shortlist' },
        { repo: seed[2], collection: 'Из файла', note: '', decision: 'exploring' },
      ],
    }
    const result = mergeWorkspace(current, incoming)
    expect(result.collections).toEqual(['Мой стек', 'Бэкенд', 'Из файла'])
    expect(result.saved).toHaveLength(3)
    expect(result.saved[0]).toEqual(current.saved[0])
    expect(result.saved[1].collection).toBe('Мой стек')
    expect(current.saved).toHaveLength(1)
    expect(mergeWorkspace(result, incoming)).toEqual(result)
  })
  it('renames and removes collections without losing repositories or notes', () => {
    const renamed = renameCollection(current, 'Мой стек', ' Рабочий проект ')
    expect(renamed.saved[0].collection).toBe('Рабочий проект')
    const removed = removeCollection(renamed, 'Рабочий проект')
    expect(removed.collections).toEqual([])
    expect(removed.saved[0]).toEqual({ ...current.saved[0], collection: '' })
    expect(() =>
      renameCollection({ ...current, collections: ['Мой стек', 'Другой'] }, 'Мой стек', 'другой'),
    ).toThrow('уже есть')
  })
})
