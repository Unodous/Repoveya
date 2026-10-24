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

const repositoryName = /^[a-zA-Z0-9][a-zA-Z0-9-]*\/(?!\.{1,2}$)[\w.-]+$/

const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function isRepository(value: unknown): value is Repository {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    count(r.id) &&
    (r.id as number) > 0 &&
    typeof r.full_name === 'string' &&
    repositoryName.test(r.full_name) &&
    typeof r.name === 'string' &&
    typeof r.html_url === 'string' &&
    r.html_url.toLowerCase() === `https://github.com/${r.full_name}`.toLowerCase() &&
    (r.description === null || typeof r.description === 'string') &&
    count(r.stargazers_count) &&
    count(r.forks_count) &&
    count(r.open_issues_count) &&
    typeof r.updated_at === 'string' &&
    Number.isFinite(Date.parse(r.updated_at)) &&
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
          s.note.length <= 20000 &&
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

export interface SearchFilters {
  language: string
  stars: string
}
export const SEARCH_PAGE_SIZE = 12
// Keep every request within GitHub's first 1,000 search results.
export const MAX_SEARCH_PAGES = Math.floor(1000 / SEARCH_PAGE_SIZE)

function normalizeRepository(value: Record<string, unknown>): Repository {
  const repo = {
    id: value.id,
    full_name: value.full_name,
    name: value.name,
    description: value.description,
    html_url: value.html_url,
    stargazers_count: value.stargazers_count,
    forks_count: value.forks_count,
    open_issues_count: value.open_issues_count,
    language: value.language,
    license: (value.license as { spdx_id?: string } | null)?.spdx_id || null,
    updated_at: value.pushed_at,
    topics: value.topics || [],
    archived: value.archived,
  }
  if (!isRepository(repo))
    throw new Error('GitHub вернул неполные данные проекта. Повторите запрос позже.')
  return repo
}

async function githubRequest(path: string, signal: AbortSignal) {
  const response = await fetch(`https://api.github.com/${path}`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'GitHub временно ограничил запросы. Попробуйте позже или вернитесь к подборке.'
        : response.status === 404
          ? 'Репозиторий не найден или закрыт. Проверьте ссылку.'
          : response.status === 422
            ? 'GitHub не смог обработать запрос. Уточните поисковые условия.'
            : 'Не удалось получить репозитории. Проверьте соединение и повторите поиск.',
    )
  return response.json()
}

export async function fetchRepository(fullName: string, signal: AbortSignal) {
  if (!repositoryName.test(fullName))
    throw new Error('Нужна ссылка вида github.com/owner/repository.')
  return normalizeRepository(await githubRequest(`repos/${fullName}`, signal))
}

export async function searchGithub(
  query: string,
  sort: string,
  page: number,
  signal: AbortSignal,
  filters: SearchFilters = { language: '', stars: '' },
) {
  const direct = query.trim().match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+)\/?$/)
  if (direct) {
    const repo = await fetchRepository(direct[1], signal)
    return { items: [repo], total: 1, incomplete: false, direct: true }
  }
  if (page < 1 || page > MAX_SEARCH_PAGES)
    throw new Error('Достигнут предел выдачи GitHub. Уточните запрос.')
  const qualifiers = [
    query.trim() || (filters.stars ? '' : 'stars:>1000'),
    'archived:false',
    filters.language ? `language:${filters.language}` : '',
    filters.stars ? `stars:>=${filters.stars}` : '',
  ]
  const params = new URLSearchParams({
    q: qualifiers.filter(Boolean).join(' '),
    sort: sort === 'updated' ? 'updated' : 'stars',
    order: 'desc',
    per_page: String(SEARCH_PAGE_SIZE),
    page: String(page),
  })
  const data = await githubRequest(`search/repositories?${params}`, signal)
  if (!Array.isArray(data.items))
    throw new Error('GitHub вернул неожиданный ответ. Повторите поиск.')
  return {
    items: data.items.map(normalizeRepository) as Repository[],
    total: Number(data.total_count) || 0,
    incomplete: Boolean(data.incomplete_results),
    direct: false,
  }
}
