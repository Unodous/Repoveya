import { beforeEach, describe, expect, it } from 'vitest'
import {
  emptyWorkspace,
  filterRepositories,
  readWorkspace,
  STORAGE_KEY,
  toMarkdown,
} from './domain'
import seed from './seed.json'

beforeEach(() => localStorage.clear())
describe('workspace data', () => {
  it('recovers from malformed storage and rejects unsafe repository URLs', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    expect(readWorkspace()).toEqual(emptyWorkspace)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: ['Мой стек', 'Мой стек', 14],
        saved: [
          {
            repo: { ...seed[0], html_url: 'javascript:alert(1)' },
            note: '',
            collection: '',
            decision: 'exploring',
          },
        ],
      }),
    )
    expect(readWorkspace()).toEqual({ saved: [], collections: ['Мой стек'] })
  })
  it('searches across names, descriptions and topics without case sensitivity', () => {
    expect(filterRepositories(seed, 'REACT declarative', 'all').map((r) => r.full_name)).toEqual([
      'react/react',
    ])
    expect(filterRepositories(seed, 'supabase', 'backend')).toHaveLength(1)
    expect(filterRepositories(seed, 'supabase', 'tools')).toHaveLength(0)
  })
  it('exports decision context without dropping multiline notes', () => {
    const markdown = toMarkdown([
      { repo: seed[0], collection: 'MVP', decision: 'chosen', note: 'First reason\nSecond reason' },
    ])
    expect(markdown).toContain('https://github.com/react/react')
    expect(markdown).toContain('First reason\nSecond reason')
    expect(markdown).toContain('MVP')
  })
})
