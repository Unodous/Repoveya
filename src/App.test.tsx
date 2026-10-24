import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import seed from './seed.json'
import { STORAGE_KEY } from './domain'
import { exportBackup } from './workspace'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.stubGlobal('scrollTo', vi.fn())
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

describe('Repoveya workspace', () => {
  it('filters the curated catalog and handles no results', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getAllByRole('article')).toHaveLength(12)
    await user.type(screen.getByRole('textbox', { name: 'Поиск репозиториев' }), 'supabase')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'supabase' })).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Поиск репозиториев' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Поиск репозиториев' }),
      'no-such-project-xyz',
    )
    expect(screen.getByText('Пока ничего не нашлось')).toBeInTheDocument()
  })

  it('persists notes, decisions and collections across a remount', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Сохранить react/react' }))
    await user.click(screen.getByRole('button', { name: 'react' }))
    await user.type(screen.getByLabelText('Заметки'), 'Выбрали для личного кабинета.')
    await user.selectOptions(screen.getByLabelText('Статус решения'), 'chosen')
    await user.selectOptions(screen.getByLabelText('Коллекция', { exact: true }), 'Мой стек')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved[0].note).toBe(
      'Выбрали для личного кабинета.',
    )
    first.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Сохранённое/ }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'react' }))
    expect(screen.getByLabelText('Заметки')).toHaveValue('Выбрали для личного кабинета.')
    expect(screen.getByLabelText('Статус решения')).toHaveValue('chosen')
  })

  it('compares projects and enforces the three project limit', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const name of ['react/react', 'vuejs/core', 'sveltejs/svelte'])
      await user.click(screen.getByRole('button', { name: `Сравнить ${name}` }))
    await user.click(screen.getByRole('button', { name: 'Сравнить vitejs/vite' }))
    expect(screen.getByText(/Можно сравнить до трёх/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сравнить' }))
    const table = screen.getByRole('table')
    expect(within(table).getByText('Звёзды')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'react' })).toBeInTheDocument()
    expect(within(table).getByText('core', { exact: true })).toBeInTheDocument()
  })

  it('creates collections and rejects duplicate names', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Создать коллекцию' }))
    await user.type(screen.getByLabelText('Название'), 'Мой стек')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать коллекцию' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('уже есть')
    await user.clear(screen.getByLabelText('Название'))
    await user.type(screen.getByLabelText('Название'), 'Новый SaaS')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать коллекцию' }),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Новый SaaS')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).collections).toContain('Новый SaaS')
  })

  it('shows GitHub results from the real search adapter', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          total_count: 1,
          items: [{ ...seed[0], pushed_at: seed[0].updated_at, license: { spdx_id: 'MIT' } }],
        }),
      }),
    )
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Поиск репозиториев' }), 'react')
    await user.click(screen.getByRole('button', { name: 'Найти на GitHub' }))
    expect(await screen.findByText('Результаты: react')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('q=react'), expect.any(Object))
  })

  it('keeps the catalog available when GitHub rate limits the request', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Найти на GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ограничил запросы')
    expect(screen.getAllByRole('article')).toHaveLength(12)
  })
  it('filters saved projects by decision and searches their notes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: ['Мой стек'],
        saved: [
          { repo: seed[0], note: 'Личный кабинет', collection: 'Мой стек', decision: 'chosen' },
          { repo: seed[1], note: 'Альтернатива', collection: '', decision: 'exploring' },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Сохранённое/ }))
    await user.click(screen.getByRole('button', { name: /Выбран в проект\s*1/ }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.type(screen.getByRole('textbox', { name: 'Поиск репозиториев' }), 'кабинет')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.type(screen.getByRole('textbox', { name: 'Поиск репозиториев' }), ' несуществующий')
    expect(screen.getByText('Пока ничего не нашлось')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Сбросить фильтры' })[0])
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('restores a removed repository with its note and decision', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: [],
        saved: [{ repo: seed[0], note: 'Не потерять', collection: '', decision: 'shortlist' }],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Удалить из сохранённого react/react' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved[0]).toMatchObject({
      note: 'Не потерять',
      decision: 'shortlist',
    })
  })

  it('renames and deletes a collection in the UI while preserving notes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: ['Мой стек'],
        saved: [
          { repo: seed[0], note: 'Важная заметка', collection: 'Мой стек', decision: 'chosen' },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Мой стек\s*1/ }))
    await user.click(screen.getByRole('button', { name: 'Переименовать коллекцию' }))
    await user.clear(screen.getByLabelText('Название'))
    await user.type(screen.getByLabelText('Название'), 'Новый проект')
    await user.click(screen.getByRole('button', { name: 'Сохранить название' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Новый проект')
    await user.click(screen.getByRole('button', { name: 'Удалить коллекцию' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить коллекцию' }),
    )
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved[0]).toMatchObject({
      note: 'Важная заметка',
      collection: '',
    })
  })

  it('previews an import before merging and keeps existing notes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: [],
        saved: [{ repo: seed[0], note: 'Текущая заметка', collection: '', decision: 'chosen' }],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Сохранённое/ }))
    await user.click(screen.getByRole('button', { name: 'Ваши данные' }))
    const text = exportBackup({
      collections: ['Импорт'],
      saved: [
        { repo: seed[0], note: 'Устаревшая заметка', collection: 'Импорт', decision: 'exploring' },
        { repo: seed[1], note: 'Новая заметка', collection: 'Импорт', decision: 'shortlist' },
      ],
    })
    const file = new File([text], 'backup.json', { type: 'application/json' })
    // jsdom does not expose File.text; the browser uses the native implementation.
    Object.defineProperty(file, 'text', { value: async () => text })
    await user.upload(screen.getByLabelText('Файл резервной копии'), file)
    expect(
      await screen.findByText('Добавится проектов: 1. Уже есть в библиотеке: 1.'),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Добавить в библиотеку' }))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved
    expect(saved).toHaveLength(2)
    expect(saved[0].note).toBe('Текущая заметка')
    expect(saved[1].note).toBe('Новая заметка')
  })

  it('persists comparison for this tab and restores the current route', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Сравнить react/react' }))
    await user.click(screen.getByRole('button', { name: 'Сравнить vuejs/core' }))
    await user.click(screen.getByRole('button', { name: 'Сравнить' }))
    expect(window.location.hash).toBe('#view=compare')
    first.unmount()
    render(<App />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('requeries GitHub when changing sort rather than sorting only the loaded page', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_count: 100,
        items: [{ ...seed[0], pushed_at: seed[0].updated_at, license: { spdx_id: 'MIT' } }],
      }),
    })
    vi.stubGlobal('fetch', fetcher)
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Найти на GitHub' }))
    await screen.findByText('Результаты: популярные проекты')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Сортировка' }), 'updated')
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher.mock.calls[1][0]).toContain('sort=updated')
  })

  it('refreshes repository metadata without overwriting personal context', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collections: [],
        saved: [{ repo: seed[0], note: 'Почему выбрал', collection: '', decision: 'chosen' }],
      }),
    )
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...seed[0],
          stargazers_count: 300000,
          pushed_at: seed[0].updated_at,
          license: { spdx_id: 'MIT' },
        }),
      }),
    )
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'react' }))
    await user.click(screen.getByRole('button', { name: 'Обновить данные с GitHub' }))
    expect(await screen.findByText('300K звёзд')).toBeInTheDocument()
    expect(screen.getByLabelText('Заметки')).toHaveValue('Почему выбрал')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).saved[0].repo.stargazers_count).toBe(
      300000,
    )
  })

  it('responds to browser history navigation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Сохранённое/ }))
    window.history.replaceState(null, '', '#view=explore')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Хороший проект')
  })
})
