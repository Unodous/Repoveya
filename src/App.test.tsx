import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import seed from './seed.json'
import { STORAGE_KEY } from './domain'

beforeEach(() => {
  localStorage.clear()
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
})
