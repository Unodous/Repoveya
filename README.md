# Repoveya

A Russian-language workspace for discovering GitHub repositories, comparing alternatives, and documenting technology decisions. Built with React, TypeScript, and Vite.

## Run locally

Use the Node version in `.node-version` (or a compatible modern Node release):

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No API key or environment variables are required.

```sh
npm run check  # types, ESLint, Prettier, Vitest
npm run build  # production output in dist/
npm run preview
```

## Features

- Curated catalog of 12 real projects, with an explicitly dated GitHub metadata snapshot (2026-10-23).
- Local search, category filters, and sorting by stars or last push.
- Live public GitHub search with pagination, cancellation of obsolete requests, and rate-limit/network error messages.
- Saved repositories with personal notes, collection assignment, and decision status.
- Create, rename, and remove collections without deleting repositories or notes.
- Decision overview, decision filters, search in personal notes, and undo for accidental removal.
- Versioned JSON backups with validation and a merge preview; existing notes take precedence.
- Direct GitHub repository URL lookup, language/star filters, and metadata refresh.
- Browser back/forward navigation and comparison persistence within the current tab.
- Side-by-side comparison of two or three repositories, including stars, forks, open issues/PRs, language, license, and last push.
- Markdown export of saved decisions and comparisons.
- Light/dark themes, keyboard shortcut `/`, native modal focus trapping, and responsive layouts.

## Try these flows

1. Search `supabase` in the curated catalog, then clear the query and try a category filter.
2. Search `react state management` using **Найти на GitHub**. Try another query or the next page.
3. Save a repository, open its title, write a note, choose a collection and decision status. Reload the page and check **Сохранённое**.
4. Create a collection in **Сохранённое**. Assign repositories to it using the detail dialog.
5. Add two or three repositories to comparison and open **Сравнение**. Export the comparison.
6. Export saved notes, switch theme, and test the layout at a narrow screen width.

## Data and limitations

This is a testable frontend MVP, with no backend, sign-in, or cross-device sync. Notes, collections, and theme are stored in this origin's `localStorage`. Clearing browser data removes them; use JSON backup in **Ваши данные** for a restorable copy or Markdown for a readable export. Import merges new projects and preserves existing notes. Files are processed locally; the import limit is 5 MB, 1,000 repositories and 200 collections. A different browser or domain has separate data. The application shows a warning when browser storage cannot be written.

The public GitHub API is queried directly from the visitor's browser, without credentials. Its anonymous search limits apply. Search text is sent to GitHub; personal notes stay local. The curated catalog remains usable if live search is unavailable. Its statistics do not update automatically; a live search loads current results. Comparison values are captured when added and can be refreshed through a repository dialog. Language/star filters apply to the full server search; category filters apply to the current page. Exact repository lookup ignores language/star filters. Search pagination is limited to 83 pages of 12 results. `open_issues_count` includes both open issues and pull requests. An absent license value is not a claim that the repository has no license—check its source before adoption.

The interface font optionally loads from Google Fonts and falls back to system fonts if unavailable. No analytics are included.

## Structure

- `src/App.tsx`: workspace interface and orchestration
- `src/domain.ts`: typed data model, persistence validation, filtering, exports, and GitHub adapter
- `src/seed.json`: curated GitHub metadata snapshot
- `src/Icon.tsx`: inline SVG icons
- `src/LibraryTools.tsx`, `src/workspace.ts`: backup, restore, and collection management
- `src/Modal.tsx`: accessible native dialog
- `src/App.test.tsx`, `src/domain.test.ts`: behavior and data-validation tests

The original line-ending PR #2 is separate from this feature branch. This work does not merge or close it.
