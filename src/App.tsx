import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import seed from './seed.json'
import Icon from './Icon'
import {
  downloadFile,
  fetchRepository,
  isRepository,
  MAX_SEARCH_PAGES,
  SEARCH_PAGE_SIZE,
  filterRepositories,
  formatNumber,
  readWorkspace,
  searchGithub,
  STORAGE_KEY,
  toMarkdown,
} from './domain'
import type { Repository, SavedRepository, Workspace } from './domain'
import Modal from './Modal'
import LibraryTools from './LibraryTools'
import { decisionLabels, renameCollection, removeCollection } from './workspace'
import './App.css'
import './Workspace.css'

const categories = [
  ['all', 'Все проекты'],
  ['frontend', 'Фронтенд'],
  ['backend', 'Бэкенд'],
  ['design', 'Дизайн и UI'],
  ['tools', 'Инструменты'],
]
const colors: Record<string, string> = {
  TypeScript: '#4b88c9',
  JavaScript: '#d7ae29',
  Rust: '#ad725c',
  Go: '#36a6b3',
  CSS: '#9678c6',
  Python: '#6887b8',
}
const repoColors = ['#eaf4f0', '#eff1ff', '#fdf0e8', '#e8f1ff', '#f2eafa']

function readComparison(): Repository[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem('repoveya.compare') || '[]')
    return Array.isArray(saved) ? saved.filter(isRepository).slice(0, 3) : []
  } catch {
    return []
  }
}

function readRoute() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const value = params.get('view')
  return {
    view: value === 'saved' || value === 'compare' ? value : 'explore',
    collection: value === 'saved' ? params.get('collection') : null,
  }
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace)
  const [view, setView] = useState(() => readRoute().view)
  const [collection, setCollection] = useState<string | null>(() => readRoute().collection)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('curated')
  const [compare, setCompare] = useState<Repository[]>(readComparison)
  const [detail, setDetail] = useState<Repository | null>(null)
  const [createCollection, setCreateCollection] = useState(false)
  const [collectionName, setCollectionName] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [editCollection, setEditCollection] = useState<string | null>(null)
  const [deleteCollection, setDeleteCollection] = useState<string | null>(null)
  const [dataTools, setDataTools] = useState(false)
  const [decisionFilter, setDecisionFilter] = useState('all')
  const [language, setLanguage] = useState('')
  const [minStars, setMinStars] = useState('')
  const [removed, setRemoved] = useState<SavedRepository | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const detailRequest = useRef<AbortController | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)

  const [toast, setToast] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [live, setLive] = useState<{
    items: Repository[]
    total: number
    query: string
    sort: string
    page: number
    language: string
    stars: string
    incomplete: boolean
    direct: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('repoveya.theme') === 'dark'
    } catch {
      return false
    }
  })
  const request = useRef<AbortController | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    try {
      sessionStorage.setItem('repoveya.compare', JSON.stringify(compare))
    } catch {
      /* Comparison works in memory. */
    }
  }, [compare])
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      detailRequest.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), 12000)
    return () => clearTimeout(timer)
  }, [removed])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
      // A later successful write clears an earlier quota or availability error.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError(false)
    } catch {
      // Storage failures must be visible even when the user has not edited anything.
      setStorageError(true)
    }
  }, [workspace])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      localStorage.setItem('repoveya.theme', dark ? 'dark' : 'light')
    } catch {
      /* Theme remains available for this session. */
    }
  }, [dark])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
      request.current?.abort()
    }
  }, [])

  const navigate = (next: string, name: string | null = null) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    request.current?.abort()
    setLoading(false)
    setError('')
    const params = new URLSearchParams({ view: next })
    if (name) params.set('collection', name)
    window.history.pushState(null, '', `#${params}`)
    setView(next)
    setCollection(name)
    setQuery('')
    setCategory('all')
    setDecisionFilter('all')
    setLanguage('')
    setMinStars('')
  }
  useEffect(() => {
    const onRouteChange = () => {
      if (window.location.hash === '#main') return
      const route = readRoute()
      request.current?.abort()
      setLoading(false)
      setError('')
      setView(route.view)
      setCollection(route.collection)
      setQuery('')
      setCategory('all')
      setDecisionFilter('all')
      setLanguage('')
      setMinStars('')
    }
    window.addEventListener('hashchange', onRouteChange)
    return () => window.removeEventListener('hashchange', onRouteChange)
  }, [])
  const savedFor = (id: number) => workspace.saved.find((s) => s.repo.id === id)
  const toggleSaved = (repo: Repository) => {
    const previous = savedFor(repo.id)
    const exists = Boolean(previous)
    if (previous) setRemoved(previous)
    setWorkspace((w) => ({
      ...w,
      saved: exists
        ? w.saved.filter((s) => s.repo.id !== repo.id)
        : [...w.saved, { repo, note: '', collection: collection || '', decision: 'exploring' }],
    }))
    setToast(exists ? '' : 'Сохранено в вашей библиотеке')
  }
  const updateSaved = (id: number, patch: Partial<SavedRepository>) =>
    setWorkspace((w) => ({
      ...w,
      saved: w.saved.map((s) => (s.repo.id === id ? { ...s, ...patch } : s)),
    }))
  const toggleCompare = (repo: Repository) => {
    if (compare.some((r) => r.id === repo.id))
      setCompare((items) => items.filter((r) => r.id !== repo.id))
    else if (compare.length < 3) setCompare((items) => [...items, repo])
    else setToast('Можно сравнить до трёх репозиториев. Уберите один, чтобы добавить другой.')
  }
  const runSearch = async (
    page = 1,
    search = query,
    order = sort,
    filters = { language, stars: minStars },
  ) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setCategory('all')
    try {
      const result = await searchGithub(search, order, page, controller.signal, filters)
      if (!controller.signal.aborted)
        setLive({ ...result, ...filters, query: search, sort: order, page })
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof TypeError
            ? 'Нет соединения с GitHub. Проверьте интернет и повторите поиск.'
            : e instanceof Error
              ? e.message
              : 'Не удалось выполнить поиск.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    if (view === 'explore') void runSearch()
  }
  const resetCatalog = () => {
    request.current?.abort()
    setLive(null)
    setQuery('')
    setLoading(false)
    setError('')
    setCategory('all')
    setLanguage('')
    setMinStars('')
  }
  const source =
    view === 'saved'
      ? workspace.saved
          .filter(
            (s) =>
              (collection === null || s.collection === collection) &&
              (decisionFilter === 'all' || s.decision === decisionFilter),
          )
          .map((s) => s.repo)
      : live?.items || (seed as Repository[])
  const filtered = filterRepositories(
    source,
    view === 'explore' && live ? '' : view === 'saved' ? '' : query,
    category,
  ).filter((r) => {
    // Server filters apply to the full GitHub result set, not just one loaded page.
    if (
      !(view === 'explore' && live) &&
      ((language && r.language !== language) || r.stargazers_count < Number(minStars))
    )
      return false
    if (view !== 'saved' || !query.trim()) return true
    const saved = savedFor(r.id)
    const text =
      `${r.full_name} ${r.description || ''} ${r.language || ''} ${r.topics.join(' ')} ${saved?.note || ''} ${saved?.collection || ''}`.toLowerCase()
    return query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((word) => text.includes(word))
  })
  const repos =
    sort === 'curated'
      ? filtered
      : [...filtered].sort((a, b) =>
          sort === 'updated'
            ? Date.parse(b.updated_at) - Date.parse(a.updated_at)
            : b.stargazers_count - a.stargazers_count,
        )
  const exportSaved = () => {
    downloadFile(
      'repoveya-decisions.md',
      toMarkdown(workspace.saved.filter((s) => collection === null || s.collection === collection)),
      'text/markdown;charset=utf-8',
    )
    setToast('Файл с решениями скачан')
  }
  const saveCollection = (e: FormEvent) => {
    e.preventDefault()
    const name = collectionName.trim()
    if (!name) {
      setCollectionError('Введите название коллекции.')
      return
    }
    if (
      workspace.collections.some(
        (c) => c !== editCollection && c.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setCollectionError('Коллекция с таким названием уже есть.')
      return
    }
    setWorkspace((w) =>
      editCollection
        ? renameCollection(w, editCollection, name)
        : { ...w, collections: [...w.collections, name] },
    )
    setEditCollection(null)
    setCreateCollection(false)
    setCollectionName('')
    setCollectionError('')
    navigate('saved', name)
  }
  const detailSaved = detail ? savedFor(detail.id) : undefined
  const openDetail = (repo: Repository) => {
    detailRequest.current?.abort()
    setRefreshing(false)
    setRefreshError('')
    setDetail(repo)
  }
  const closeDetail = () => {
    detailRequest.current?.abort()
    setDetail(null)
    setRefreshing(false)
  }
  const refreshDetail = async () => {
    if (!detail) return
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setRefreshing(true)
    setRefreshError('')
    try {
      const repo = await fetchRepository(detail.full_name, controller.signal)
      if (controller.signal.aborted) return
      setDetail(repo)
      setWorkspace((w) => ({
        ...w,
        saved: w.saved.map((s) => (s.repo.id === repo.id ? { ...s, repo } : s)),
      }))
      setCompare((repos) => repos.map((r) => (r.id === repo.id ? repo : r)))
      setLive((value) =>
        value ? { ...value, items: value.items.map((r) => (r.id === repo.id ? repo : r)) } : value,
      )
      setToast('Данные проекта обновлены с GitHub')
    } catch (e) {
      if (!controller.signal.aborted)
        setRefreshError(
          e instanceof TypeError
            ? 'Нет соединения с GitHub. Ваши заметки сохранены.'
            : e instanceof Error
              ? e.message
              : 'Не удалось обновить данные.',
        )
    } finally {
      if (!controller.signal.aborted) setRefreshing(false)
    }
  }
  const collectionSaved = workspace.saved.filter(
    (s) => collection === null || s.collection === collection,
  )

  const title =
    view === 'explore'
      ? 'Обзор репозиториев'
      : view === 'compare'
        ? 'Сравнение проектов'
        : collection || 'Сохранённое'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            navigate('explore')
          }}
          aria-label="Repoveya — на главную"
        >
          <span className="brand-mark">
            <Icon name="fork" size={23} />
          </span>
          repoveya<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">P</span>
          <span>
            Личное пространство<small>Ваш следующий стек</small>
          </span>
          <Icon name="chevron" size={15} />
        </div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          <button
            className={`nav-item ${view === 'explore' ? 'active' : ''}`}
            aria-current={view === 'explore' ? 'page' : undefined}
            onClick={() => navigate('explore')}
          >
            <Icon name="compass" />
            <span className="nav-text">Обзор</span>
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${view === 'saved' ? 'active' : ''}`}
            aria-current={view === 'saved' ? 'page' : undefined}
            onClick={() => navigate('saved')}
          >
            <Icon name="bookmark" />
            <span className="nav-text">Сохранённое</span>
            <span className="nav-count">{workspace.saved.length}</span>
          </button>
          <button
            className={`nav-item ${view === 'compare' ? 'active' : ''}`}
            aria-current={view === 'compare' ? 'page' : undefined}
            onClick={() => navigate('compare')}
          >
            <Icon name="compare" />
            <span className="nav-text">Сравнение</span>
            <span className="nav-count">{compare.length}</span>
          </button>
        </nav>
        <div className="collection-title">
          <span className="nav-label">КОЛЛЕКЦИИ</span>
          <button
            className="icon-button"
            aria-label="Создать коллекцию"
            onClick={() => {
              setCreateCollection(true)
              setCollectionError('')
            }}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <nav className="collections" aria-label="Коллекции">
          {workspace.collections.map((name) => (
            <button
              key={name}
              className={`nav-item ${collection === name ? 'active' : ''}`}
              onClick={() => navigate('saved', name)}
            >
              <Icon name="folder" size={18} />
              <span className="truncate">{name}</span>
              <span className="nav-count">
                {workspace.saved.filter((s) => s.collection === name).length}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Icon name="code" size={22} />
            <strong>Не просто звёздочка.</strong>
            <p>
              Сохраняйте контекст.
              <br />
              Помните, почему выбрали.
            </p>
            <button onClick={() => navigate('saved')}>
              Собрать свой стек <Icon name="arrow" size={16} />
            </button>
          </div>
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            <Icon name={dark ? 'sun' : 'moon'} size={17} />
            {dark ? 'Светлая тема' : 'Тёмная тема'}
            <span className="theme-switch">
              <i />
            </span>
          </button>
          <div className="local-status">
            <span />
            Локальное сохранение <Icon name="info" size={13} />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="grid" size={16} />
            <span>Пространство</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="beta">WORKSPACE 0.2</span>
            <a
              href="https://github.com/Unodous/Repoveya"
              target="_blank"
              rel="noreferrer"
              className="icon-button"
              aria-label="Исходный код на GitHub"
            >
              <Icon name="github" size={20} />
            </a>
            <span className="profile-avatar" title="Локальный профиль">
              P
            </span>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={`${view !== 'compare' && compare.length ? 'has-dock' : ''} ${view === 'saved' ? 'library-main' : ''}`}
        >
          {storageError && (
            <div className="notice error" role="alert">
              Хранилище браузера недоступно. Изменения действуют только до перезагрузки. Откройте
              «Ваши данные» и скачайте резервную копию, чтобы не потерять их.
            </div>
          )}
          {offline && (
            <div className="notice" role="status">
              <Icon name="info" size={18} /> Вы не в сети. Подборка, сохранённые проекты и заметки
              доступны; поиск GitHub заработает после подключения.
            </div>
          )}
          {view === 'explore' && (
            <>
              <div className="page-eyebrow">МЕНЬШЕ ПОИСКА. БОЛЬШЕ СОЗДАНИЯ.</div>
              <section className="hero">
                <div className="hero-content">
                  <div className="hero-kicker">
                    <span />
                    ВАШ КОМПАС В OPEN SOURCE
                  </div>
                  <h1>
                    Хороший проект
                    <br />
                    начинается с <em>выбора.</em>
                  </h1>
                  <p>
                    Находите инструменты, сравнивайте альтернативы
                    <br className="desktop-br" /> и собирайте стек, в котором уверены.
                  </p>
                  <div className="hero-bottom">
                    <span>
                      <Icon name="check" size={15} /> Реальные проекты
                    </span>
                    <span>
                      <Icon name="check" size={15} /> Ваши решения
                    </span>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-grid" />
                  <div className="floating-label">Built with intention.</div>
                  <div className="art-card card-react">
                    <span className="art-logo react-symbol">✳</span>
                    <div>
                      <strong>React</strong>
                      <small>Интерфейс</small>
                    </div>
                    <span className="art-check">✓</span>
                  </div>
                  <div className="art-card card-supabase">
                    <span className="art-logo supabase-symbol">ϟ</span>
                    <div>
                      <strong>Supabase</strong>
                      <small>Бэкенд</small>
                    </div>
                    <span className="art-check">✓</span>
                  </div>
                  <div className="art-center">
                    <Icon name="fork" size={32} />
                  </div>
                  <div className="stack-label">
                    <span />
                    ваш следующий проект
                  </div>
                  <div className="art-caption">ОТ ИДЕИ → К СТЕКУ</div>
                </div>
              </section>
              <div className="intro-line">
                <h2>
                  Найдите свою следующую зависимость<span>.</span>
                </h2>
                <span>
                  Выбирайте осознанно <Icon name="spark" size={16} />
                </span>
              </div>
            </>
          )}
          {view === 'saved' && (
            <div className="page-heading">
              <div className="page-eyebrow">ВАША БИБЛИОТЕКА</div>
              <h1>
                {title}
                <span>.</span>
              </h1>
              <p>
                {collection
                  ? 'Инструменты и решения для одной идеи.'
                  : 'Сохранённые проекты и контекст ваших решений.'}
              </p>
            </div>
          )}

          {view === 'saved' && (
            <>
              <div className="library-overview">
                {[['all', 'Всего проектов'], ...Object.entries(decisionLabels)].map(
                  ([id, label]) => (
                    <button
                      key={id}
                      className={`summary-card ${decisionFilter === id ? 'selected' : ''}`}
                      aria-pressed={decisionFilter === id}
                      onClick={() => setDecisionFilter(id)}
                    >
                      <span>{label}</span>
                      <strong>
                        {id === 'all'
                          ? collectionSaved.length
                          : collectionSaved.filter((s) => s.decision === id).length}
                      </strong>
                      <i className={`decision-dot ${id}`} />
                    </button>
                  ),
                )}
              </div>
              <div className="library-actions">
                <span>
                  <Icon name="lock" size={15} /> Ваша библиотека, на вашем устройстве
                </span>
                <button className="secondary" onClick={() => setDataTools(true)}>
                  <Icon name="download" size={16} /> Ваши данные
                </button>
              </div>
              <div className="collection-manager">
                <label>
                  Коллекция
                  <select
                    aria-label="Фильтр коллекций"
                    value={collection || ''}
                    onChange={(e) => navigate('saved', e.target.value || null)}
                  >
                    <option value="">Все сохранённые</option>
                    {workspace.collections.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {collection && (
                  <div className="collection-controls">
                    <button
                      className="icon-button"
                      aria-label="Переименовать коллекцию"
                      onClick={() => {
                        setEditCollection(collection)
                        setCollectionName(collection)
                        setCollectionError('')
                        setCreateCollection(true)
                      }}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Удалить коллекцию"
                      onClick={() => setDeleteCollection(collection)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                )}
                <button
                  className="secondary new-collection-button"
                  aria-label="Новая коллекция"
                  onClick={() => {
                    setCreateCollection(true)
                    setCollectionError('')
                  }}
                >
                  <Icon name="plus" size={16} />
                  <span className="new-collection-label">Новая коллекция</span>
                </button>
              </div>
            </>
          )}
          {view !== 'compare' && (
            <>
              <form className="search-form" onSubmit={onSearch}>
                <Icon name="search" size={22} />
                <input
                  ref={searchInput}
                  aria-label="Поиск репозиториев"
                  placeholder={
                    view === 'explore'
                      ? 'Название, тема или ссылка GitHub'
                      : 'Поиск по проектам и заметкам…'
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <kbd>/</kbd>
                {query && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Очистить поиск"
                    onClick={() => setQuery('')}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
                {view === 'explore' && (
                  <button className="primary search-submit" disabled={loading}>
                    <Icon name={loading ? 'refresh' : 'github'} size={17} />
                    {loading ? 'Ищем…' : 'Найти на GitHub'}
                    <Icon name="arrow" size={16} />
                  </button>
                )}
              </form>
              {view === 'explore' && (
                <details className="search-filters">
                  <summary>
                    <Icon name="sliders" size={17} /> Уточнить поиск{' '}
                    <span>
                      {[language, minStars ? `от ${minStars} звёзд` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <Icon name="chevron" size={15} />
                  </summary>
                  <div className="search-options">
                    <label>
                      Язык
                      <select
                        aria-label="Язык программирования"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        <option value="">Любой</option>
                        {[
                          'TypeScript',
                          'JavaScript',
                          'Python',
                          'Rust',
                          'Go',
                          'Java',
                          'C++',
                          'C#',
                          'CSS',
                        ].map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Звёзды
                      <select
                        aria-label="Минимум звёзд"
                        value={minStars}
                        onChange={(e) => setMinStars(e.target.value)}
                      >
                        <option value="">Любое число</option>
                        <option value="100">От 100</option>
                        <option value="1000">От 1 000</option>
                        <option value="10000">От 10 000</option>
                      </select>
                    </label>
                    <span className="search-hint">Можно вставить ссылку на репозиторий</span>
                  </div>{' '}
                  <div className="discovery-shortcuts" aria-label="Идеи для поиска">
                    <span>С чего начать</span>
                    {[
                      ['react state management', 'Управление состоянием'],
                      ['topic:ui-components', 'UI-компоненты'],
                      ['topic:database', 'Базы данных'],
                    ].map(([q, label]) => (
                      <button
                        key={q}
                        onClick={() => {
                          setQuery(q)
                          void runSearch(1, q)
                        }}
                      >
                        {label}
                        <Icon name="arrow" size={13} />
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <div className="catalog-toolbar">
                <div className="category-tabs" aria-label="Категории">
                  {categories.map(([id, label]) => (
                    <button
                      key={id}
                      className={category === id ? 'selected' : ''}
                      aria-pressed={category === id}
                      onClick={() => setCategory(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="sort-label">
                  <span>Сортировка:</span>
                  <select
                    aria-label="Сортировка"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value)
                      if (view === 'explore' && live)
                        void runSearch(1, live.query, e.target.value, {
                          language: live.language,
                          stars: live.stars,
                        })
                    }}
                  >
                    <option value="curated">По умолчанию</option>
                    <option value="stars">По звёздам</option>
                    <option value="updated">По обновлению</option>
                  </select>
                </label>
              </div>
              {view === 'explore' && live && category !== 'all' && (
                <p className="filter-explanation">
                  Категория фильтрует текущую страницу результатов.
                </p>
              )}
              {view === 'saved' && (decisionFilter !== 'all' || category !== 'all' || query) && (
                <div className="active-filters">
                  <span>
                    {decisionFilter !== 'all'
                      ? decisionLabels[decisionFilter as SavedRepository['decision']]
                      : 'Фильтр библиотеки'}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDecisionFilter('all')
                      setCategory('all')
                      setQuery('')
                    }}
                  >
                    Сбросить фильтры <Icon name="close" size={14} />
                  </button>
                </div>
              )}
              <div className="results-heading">
                <div>
                  <h3>
                    {view === 'saved'
                      ? 'В вашей библиотеке'
                      : live
                        ? `Результаты: ${live.query || 'популярные проекты'}`
                        : 'Выбрано для вдохновения'}
                  </h3>
                  <span className="result-count">{repos.length}</span>
                  {loading && (
                    <span className="loading-label" role="status">
                      Загрузка…
                    </span>
                  )}
                </div>
                <div className="results-actions">
                  {view === 'saved' ? (
                    <button className="text-button" disabled={!source.length} onClick={exportSaved}>
                      <Icon name="download" size={15} />
                      Скачать заметки
                    </button>
                  ) : live ? (
                    <>
                      <span className="source-note">
                        GitHub · {formatNumber(live.total)} найдено
                      </span>
                      <button className="text-button" onClick={resetCatalog}>
                        К подборке <Icon name="arrow" size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="source-note">
                      <span className="status-dot" />
                      Снимок GitHub · 23.10.2026
                    </span>
                  )}
                </div>
              </div>
              {error && (
                <div className="notice error" role="alert">
                  <Icon name="info" />
                  <span>{error}</span>
                  <button className="text-button" onClick={() => void runSearch()}>
                    Повторить
                  </button>
                </div>
              )}
              {view === 'explore' &&
                live &&
                (query !== live.query || language !== live.language || minStars !== live.stars) && (
                  <div className="notice">
                    Показаны результаты предыдущего запроса. Нажмите «Найти на GitHub», чтобы
                    обновить поиск.
                  </div>
                )}
              {view === 'explore' && live?.direct && (
                <p className="filter-explanation">
                  Открыт точный репозиторий по ссылке. Фильтры языка и звёзд к нему не применяются.
                </p>
              )}
              {view === 'explore' && live?.incomplete && (
                <div className="notice">
                  GitHub вернул неполные результаты. Уточните запрос или повторите поиск.
                </div>
              )}
              <div className={`repo-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
                {repos.map((repo) => (
                  <article className="repo-card" key={repo.id}>
                    <div className="repo-card-top">
                      <span
                        className="repo-avatar"
                        style={{ background: repoColors[repo.id % repoColors.length] }}
                      >
                        {repo.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="owner">{repo.full_name.split('/')[0]}</span>
                      <button
                        className={`icon-button save-button ${savedFor(repo.id) ? 'is-saved' : ''}`}
                        aria-label={`${savedFor(repo.id) ? 'Удалить из сохранённого' : 'Сохранить'} ${repo.full_name}`}
                        aria-pressed={!!savedFor(repo.id)}
                        onClick={() => toggleSaved(repo)}
                      >
                        <Icon name="bookmark" size={19} />
                      </button>
                    </div>
                    <button className="repo-title" onClick={() => openDetail(repo)}>
                      {repo.name}
                      <Icon name="arrow" size={17} />
                    </button>
                    <p className="repo-description">
                      {repo.description || 'Автор пока не добавил описание проекта.'}
                    </p>
                    <div className="repo-topics">
                      {repo.topics.slice(0, 2).map((topic) => (
                        <button
                          key={topic}
                          onClick={() => {
                            setQuery(topic)
                            if (view === 'explore' && live) void runSearch(1, topic)
                          }}
                        >
                          {topic}
                        </button>
                      ))}
                      {repo.archived && <span className="archive-tag">Архив</span>}
                    </div>
                    <div className="repo-metrics">
                      <span>
                        <Icon name="star" size={15} />
                        {formatNumber(repo.stargazers_count)}
                      </span>
                      <span>
                        <Icon name="fork" size={15} />
                        {formatNumber(repo.forks_count)}
                      </span>
                      <span className="language">
                        <i style={{ background: colors[repo.language || ''] || '#899382' }} />
                        {repo.language || 'Не указан'}
                      </span>
                    </div>
                    {view === 'saved' && savedFor(repo.id)?.note && (
                      <button className="card-note" onClick={() => openDetail(repo)}>
                        <Icon name="edit" size={14} />
                        <span>{savedFor(repo.id)?.note}</span>
                      </button>
                    )}
                    <div className="repo-card-footer">
                      <span>
                        {savedFor(repo.id) ? (
                          <>
                            <span className="tiny-check">✓</span>
                            {decisionLabels[savedFor(repo.id)!.decision]}
                          </>
                        ) : repo.license && repo.license !== 'NOASSERTION' ? (
                          repo.license
                        ) : (
                          'Лицензия не указана'
                        )}
                      </span>
                      <button
                        className={`compare-button ${compare.some((r) => r.id === repo.id) ? 'compared' : ''}`}
                        aria-pressed={compare.some((r) => r.id === repo.id)}
                        aria-label={`Сравнить ${repo.full_name}`}
                        onClick={() => toggleCompare(repo)}
                      >
                        <Icon
                          name={compare.some((r) => r.id === repo.id) ? 'check' : 'plus'}
                          size={14}
                        />
                        Сравнить
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!repos.length && !loading && (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon name={view === 'saved' ? 'bookmark' : 'search'} size={30} />
                  </span>
                  <h2>
                    {view === 'saved' && !collectionSaved.length && !query
                      ? 'Здесь начинается ваш стек'
                      : 'Пока ничего не нашлось'}
                  </h2>
                  <p>
                    {view === 'saved' && !collectionSaved.length
                      ? 'Сохраняйте проекты значком закладки. В карточке можно добавить заметку и выбрать коллекцию.'
                      : 'Попробуйте другой запрос или уберите фильтр категории.'}
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      if (view === 'saved' && !collectionSaved.length) navigate('explore')
                      else if (view === 'saved') {
                        setQuery('')
                        setCategory('all')
                        setDecisionFilter('all')
                      } else {
                        setCategory('all')
                        resetCatalog()
                      }
                    }}
                  >
                    {view === 'saved'
                      ? collectionSaved.length
                        ? 'Сбросить фильтры'
                        : 'Открыть каталог'
                      : 'Вернуться к подборке'}
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
              )}
              {view === 'explore' && live && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={live.page <= 1 || loading}
                    onClick={() =>
                      void runSearch(live.page - 1, live.query, live.sort, {
                        language: live.language,
                        stars: live.stars,
                      })
                    }
                  >
                    ← Назад
                  </button>
                  <span>
                    Страница {live.page} из{' '}
                    {Math.max(
                      1,
                      Math.min(MAX_SEARCH_PAGES, Math.ceil(live.total / SEARCH_PAGE_SIZE)),
                    )}
                  </span>
                  <button
                    className="secondary"
                    disabled={
                      live.page >= MAX_SEARCH_PAGES ||
                      live.page * SEARCH_PAGE_SIZE >= live.total ||
                      loading
                    }
                    onClick={() =>
                      void runSearch(live.page + 1, live.query, live.sort, {
                        language: live.language,
                        stars: live.stars,
                      })
                    }
                  >
                    Далее →
                  </button>
                </div>
              )}
              <footer className="page-footer">
                <span>
                  <Icon name="fork" size={16} />
                  Хорошие инструменты. Осознанные решения.
                </span>
                <span>Сделано для тех, кто создаёт.</span>
              </footer>
            </>
          )}

          {view === 'compare' && (
            <>
              <div className="page-heading">
                <div className="page-eyebrow">РЕШЕНИЯ, А НЕ ДОГАДКИ</div>
                <h1>
                  Сравните перед выбором<span>.</span>
                </h1>
                <p>
                  До трёх проектов рядом. Звёзды помогают ориентироваться — решение остаётся за
                  вами.
                </p>
              </div>
              {compare.length < 2 ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon name="compare" size={32} />
                  </span>
                  <h2>Добавьте {compare.length ? 'ещё один проект' : 'проекты для сравнения'}</h2>
                  <p>Нажмите «Сравнить» на двух или трёх карточках каталога.</p>
                  <button className="primary" onClick={() => navigate('explore')}>
                    Выбрать проекты <Icon name="arrow" size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="comparison-actions">
                    <span className="source-note">
                      Данные на момент добавления · обновление через поиск GitHub
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        downloadFile(
                          'repoveya-comparison.md',
                          '# Сравнение Repoveya\n\n' +
                            compare
                              .map(
                                (r) =>
                                  `## ${r.full_name}\n${r.html_url}\n\n${r.description || ''}\n\nЗвёзд: ${r.stargazers_count} · Форков: ${r.forks_count} · Открытых issues и PR: ${r.open_issues_count}\nЯзык: ${r.language || '—'} · Лицензия: ${r.license || 'Не указана'}\nПоследний push: ${r.updated_at}\n\n`,
                              )
                              .join(''),
                          'text/markdown;charset=utf-8',
                        )
                      }
                    >
                      <Icon name="download" size={16} />
                      Скачать сравнение
                    </button>
                  </div>
                  <div className="comparison-scroll">
                    <table className="comparison-table">
                      <caption className="sr-only">Сравнение выбранных GitHub-репозиториев</caption>
                      <thead>
                        <tr>
                          <th>Репозиторий</th>
                          {compare.map((r) => (
                            <th key={r.id}>
                              <button
                                className="icon-button remove-compare"
                                aria-label={`Убрать ${r.full_name} из сравнения`}
                                onClick={() => toggleCompare(r)}
                              >
                                <Icon name="close" size={16} />
                              </button>
                              <span className="compare-owner">{r.full_name.split('/')[0]}</span>
                              <button className="repo-title" onClick={() => openDetail(r)}>
                                {r.name}
                              </button>
                              <a href={r.html_url} target="_blank" rel="noreferrer">
                                Открыть GitHub <Icon name="external" size={13} />
                              </a>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['Описание', ...compare.map((r) => r.description || '—')],
                          ['Звёзды', ...compare.map((r) => formatNumber(r.stargazers_count))],
                          ['Форки', ...compare.map((r) => formatNumber(r.forks_count))],
                          [
                            'Открытые issues и PR',
                            ...compare.map((r) => formatNumber(r.open_issues_count)),
                          ],
                          ['Основной язык', ...compare.map((r) => r.language || 'Не указан')],
                          [
                            'Лицензия',
                            ...compare.map((r) =>
                              r.license && r.license !== 'NOASSERTION' ? r.license : 'Не указана',
                            ),
                          ],
                          [
                            'Последний push',
                            ...compare.map((r) =>
                              new Date(r.updated_at).toLocaleDateString('ru-RU'),
                            ),
                          ],
                        ].map(([label, ...values]) => (
                          <tr key={label!}>
                            <th scope="row">{label}</th>
                            {values.map((value, i) => (
                              <td key={compare[i].id} data-project={compare[i].full_name}>
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">Моё решение</th>
                          {compare.map((r) => (
                            <td key={r.id} data-project={r.full_name}>
                              <button className="secondary" onClick={() => openDetail(r)}>
                                <Icon name="bookmark" size={16} />
                                {savedFor(r.id)
                                  ? decisionLabels[savedFor(r.id)!.decision]
                                  : 'Добавить решение'}
                              </button>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="notice">
                    <Icon name="info" size={18} />
                    Популярность не определяет качество. Перед внедрением проверьте документацию,
                    лицензию и совместимость с вашим проектом.
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {compare.length > 0 && view !== 'compare' && (
        <div className="compare-dock">
          <div className="dock-label">
            <Icon name="compare" />
            <strong>На сравнение</strong>
            <span>{compare.length}/3</span>
          </div>
          <button
            className="icon-button mobile-clear-compare"
            aria-label="Очистить сравнение"
            onClick={() => setCompare([])}
          >
            <Icon name="close" size={18} />
          </button>
          <div className="dock-repos">
            {compare.map((r) => (
              <span key={r.id}>
                {r.name}
                <button
                  aria-label={`Убрать ${r.full_name} из сравнения`}
                  onClick={() => toggleCompare(r)}
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
          </div>
          <button
            className="primary"
            disabled={compare.length < 2}
            onClick={() => navigate('compare')}
          >
            Сравнить <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
      {removed && (
        <div className="undo-bar" role="status">
          <span>
            <strong>{removed.repo.name}</strong> удалён из сохранённого
          </span>
          <button
            onClick={() => {
              setWorkspace((w) => ({
                ...w,
                saved: w.saved.some((s) => s.repo.id === removed.repo.id)
                  ? w.saved.map((s) =>
                      s.repo.id === removed.repo.id
                        ? {
                            ...removed,
                            collection: w.collections.includes(removed.collection)
                              ? removed.collection
                              : '',
                          }
                        : s,
                    )
                  : [
                      ...w.saved,
                      {
                        ...removed,
                        collection: w.collections.includes(removed.collection)
                          ? removed.collection
                          : '',
                      },
                    ],
              }))
              setRemoved(null)
              setToast('Проект и заметки восстановлены')
            }}
          >
            Вернуть
          </button>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление об удалении"
            onClick={() => setRemoved(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {toast && !removed && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}

      {detail && (
        <Modal title={detail.full_name} onClose={closeDetail} wide>
          <p className="detail-description">{detail.description}</p>
          <div className="detail-metrics">
            <span>
              <Icon name="star" />
              {formatNumber(detail.stargazers_count)} звёзд
            </span>
            <span>
              <Icon name="fork" />
              {formatNumber(detail.forks_count)} форков
            </span>
            <span>{detail.language}</span>
          </div>
          <div className="detail-actions">
            <a className="primary" href={detail.html_url} target="_blank" rel="noreferrer">
              Открыть на GitHub
              <Icon name="external" size={16} />
            </a>
            <button className="secondary" onClick={() => toggleSaved(detail)}>
              <Icon name={detailSaved ? 'check' : 'bookmark'} size={17} />
              {detailSaved ? 'Сохранено · удалить' : 'Сохранить проект'}
            </button>
            <button className="secondary" onClick={() => toggleCompare(detail)}>
              <Icon name="compare" size={17} />
              {compare.some((r) => r.id === detail.id) ? 'Убрать из сравнения' : 'Сравнить'}
            </button>
          </div>
          {removed?.repo.id === detail.id && !detailSaved && (
            <div className="notice">
              <span>Проект удалён вместе с заметками.</span>
              <button
                className="text-button"
                onClick={() => {
                  setWorkspace((w) => ({
                    ...w,
                    saved: [
                      ...w.saved,
                      {
                        ...removed,
                        collection: w.collections.includes(removed.collection)
                          ? removed.collection
                          : '',
                      },
                    ],
                  }))
                  setRemoved(null)
                  setToast('Проект и заметки восстановлены')
                }}
              >
                Вернуть проект и заметки
              </button>
            </div>
          )}
          <div className="detail-divider" />
          <div className="section-label">
            <h3>Контекст вашего выбора</h3>
            <span className="source-note">
              {detailSaved ? 'Сохраняется в этом браузере' : 'Сначала сохраните проект'}
            </span>
          </div>
          {detailSaved ? (
            <>
              <div className="field-row">
                <label>
                  Коллекция
                  <select
                    value={detailSaved.collection}
                    onChange={(e) => updateSaved(detail.id, { collection: e.target.value })}
                  >
                    <option value="">Без коллекции</option>
                    {workspace.collections.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус решения
                  <select
                    value={detailSaved.decision}
                    onChange={(e) =>
                      updateSaved(detail.id, {
                        decision: e.target.value as SavedRepository['decision'],
                      })
                    }
                  >
                    {Object.entries(decisionLabels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="note-label">
                Заметки
                <textarea
                  rows={5}
                  maxLength={20000}
                  placeholder="Для какой задачи подходит? Какие альтернативы рассмотрели? Что стоит проверить?"
                  value={detailSaved.note}
                  onChange={(e) => updateSaved(detail.id, { note: e.target.value })}
                />
              </label>
              <small className="source-note">
                Автосохранение · заметки остаются на вашем устройстве. Сделайте экспорт перед
                очисткой браузера.
              </small>
            </>
          ) : (
            <div className="note-placeholder">
              <Icon name="bookmark" />
              <p>
                Сохраните репозиторий, чтобы записать аргументы, назначить коллекцию и зафиксировать
                решение.
              </p>
            </div>
          )}
          {refreshError && (
            <div className="notice error" role="alert">
              {refreshError}
            </div>
          )}
          <div className="detail-refresh">
            <button
              className="text-button"
              disabled={refreshing}
              onClick={() => void refreshDetail()}
            >
              <Icon name="refresh" size={16} />
              {refreshing ? 'Обновляем…' : 'Обновить данные с GitHub'}
            </button>
            {detail.archived && <span className="archive-tag">Проект в архиве</span>}
          </div>
          <div className="detail-foot">
            Последний push: {new Date(detail.updated_at).toLocaleDateString('ru-RU')} · Лицензия:{' '}
            {detail.license && detail.license !== 'NOASSERTION' ? detail.license : 'не указана'}
          </div>
        </Modal>
      )}
      {dataTools && (
        <LibraryTools
          workspace={workspace}
          setWorkspace={setWorkspace}
          onClose={() => setDataTools(false)}
        />
      )}
      {deleteCollection && (
        <Modal title="Удалить коллекцию?" onClose={() => setDeleteCollection(null)}>
          <p className="modal-description">
            Коллекция «{deleteCollection}» будет удалена. Репозитории, заметки и решения останутся в
            сохранённом, без коллекции.
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setDeleteCollection(null)}>
              Оставить
            </button>
            <button
              className="primary"
              onClick={() => {
                setWorkspace((w) => removeCollection(w, deleteCollection))
                setDeleteCollection(null)
                navigate('saved')
                setToast('Коллекция удалена. Проекты и заметки сохранены.')
              }}
            >
              Удалить коллекцию
            </button>
          </div>
        </Modal>
      )}
      {createCollection && (
        <Modal
          title={editCollection ? 'Переименовать коллекцию' : 'Новая коллекция'}
          onClose={() => {
            setCreateCollection(false)
            setEditCollection(null)
            setCollectionName('')
          }}
        >
          <p className="modal-description">
            Объедините инструменты одного проекта или направления.
          </p>
          <form onSubmit={saveCollection}>
            <label className="note-label">
              Название
              <input
                autoFocus
                maxLength={40}
                placeholder="Например, мой следующий SaaS"
                value={collectionName}
                onChange={(e) => {
                  setCollectionName(e.target.value)
                  setCollectionError('')
                }}
              />
            </label>
            {collectionError && (
              <p className="field-error" role="alert">
                {collectionError}
              </p>
            )}
            <button className="primary modal-submit">
              {editCollection ? 'Сохранить название' : 'Создать коллекцию'}{' '}
              <Icon name="plus" size={17} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default App
