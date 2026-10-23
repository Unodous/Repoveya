import type { CSSProperties } from 'react'

const paths: Record<string, string> = {
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  compare: 'M7 3v18 M17 3v18 M3 8h8 M13 16h8 M4 5l3 3 3-3 M14 19l3-3 3 3',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  external: 'M14 3h7v7 M21 3l-11 11 M10 4H4v16h16v-6',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6 6 18',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  fork: 'M6 3v5a6 6 0 0 0 6 6v7 M18 3v5a6 6 0 0 1-6 6 M4 3h4 M16 3h4',
  folder: 'M3 7V4h7l2 3h9v13H3V7Z',
  check: 'm5 12 4 4L19 6',
  chevron: 'm8 10 4 4 4-4',
  grid: 'M3 3h7v7H3V3Z M14 3h7v7h-7V3Z M3 14h7v7H3v-7Z M14 14h7v7h-7v-7Z',
  moon: 'M20 15A8.5 8.5 0 0 1 9 4a9 9 0 1 0 11 11Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M19 5l-1 1 M6 18l-1 1',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  github:
    'M9 19c-5 1.5-5-2-7-2 M15 22v-4c0-1 .2-1.7-.5-2.4 4-.5 7-2 7-6.3 0-1.7-.6-3-1.6-4.1.3-1.2.3-2.6-.2-3.7 0 0-1.3-.4-4.2 1.5a14 14 0 0 0-7 0C5.6 1.1 4.3 1.5 4.3 1.5c-.5 1.1-.5 2.5-.2 3.7C3.1 6.3 2.5 7.6 2.5 9.3c0 4.3 3 5.8 7 6.3-.5.6-.7 1.2-.5 2.4v4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7v.1',
  refresh: 'M20 9a8 8 0 0 0-14-4L3 8 M3 3v5h5 M4 15a8 8 0 0 0 14 4l3-3 M21 21v-5h-5',
  code: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
}

export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: string
  size?: number
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.code} />
    </svg>
  )
}
