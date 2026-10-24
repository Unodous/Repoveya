import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRepository, MAX_SEARCH_PAGES, searchGithub } from './domain'
import seed from './seed.json'

const apiRepo = { ...seed[0], pushed_at: seed[0].updated_at, license: { spdx_id: 'MIT' } }
const signal = new AbortController().signal
afterEach(() => vi.unstubAllGlobals())

describe('GitHub adapter', () => {
  it('applies language and stars to the server query and preserves incomplete-result status', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [apiRepo], total_count: 100, incomplete_results: true }),
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await searchGithub('react', 'updated', 2, signal, {
      language: 'C++',
      stars: '100',
    })
    const url = new URL(fetcher.mock.calls[0][0])
    expect(url.searchParams.get('q')).toBe('react archived:false language:C++ stars:>=100')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('sort')).toBe('updated')
    expect(result.incomplete).toBe(true)
    expect(result.items[0].license).toBe('MIT')
  })
  it('resolves exact repository names and URLs without a full-text search', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => apiRepo })
    vi.stubGlobal('fetch', fetcher)
    const result = await searchGithub('https://github.com/react/react/', 'stars', 1, signal)
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/react/react',
      expect.objectContaining({ signal }),
    )
    expect(result.items).toEqual([seed[0]])
    expect(result.direct).toBe(true)
  })
  it('keeps requests in the supported result window and blocks invalid repository paths', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(searchGithub('react', 'stars', MAX_SEARCH_PAGES + 1, signal)).rejects.toThrow(
      'предел',
    )
    await expect(fetchRepository('../..', signal)).rejects.toThrow('ссылка')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('explains 404 and rejects malformed repository responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...apiRepo, stargazers_count: -1 }),
        }),
    )
    await expect(fetchRepository('react/missing', signal)).rejects.toThrow('не найден')
    await expect(fetchRepository('react/react', signal)).rejects.toThrow('неполные данные')
  })
})
