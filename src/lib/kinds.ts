import type { Theme } from '@mui/material/styles'

/**
 * Shared result types from the server (sources/__init__.py KINDS) -> icon + label.
 * Colors live in the theme (palette.kind); red is reserved for Adult (18+).
 */
export const KINDS: Record<string, { icon: string; label: string }> = {
  movie: { icon: 'movie', label: 'Movie' },
  tv: { icon: 'tv', label: 'TV' },
  game: { icon: 'sports_esports', label: 'Game' },
  app: { icon: 'apps', label: 'Application' },
  book: { icon: 'menu_book', label: 'Book' },
  music: { icon: 'music_note', label: 'Music' },
  adult: { icon: '18_up_rating', label: 'Adult (18+)' },
  other: { icon: 'category', label: 'Other' },
}

export const kindInfo = (kind?: string) => {
  const id = kind && kind in KINDS ? kind : 'other'
  return { id: id as keyof Theme['palette']['kind'], ...KINDS[id] }
}

/** Icon color for a kind; a theme CSS variable, so it follows light / dark by itself */
export const kindColor = (kind?: string) => {
  const id = kindInfo(kind).id
  return (theme: Theme) => ({ color: (theme.vars ?? theme).palette.kind[id] })
}
