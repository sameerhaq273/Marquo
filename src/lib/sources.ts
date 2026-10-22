import type { Theme } from '@mui/material/styles'
import type { FeaturedItem, Source, Torrent } from './api'

export interface SourceInfo {
  name: string
  /** Index into the theme's palette.badges, handed out by the site's position in /api/config */
  badge: number
}

export function sourceInfoMap(sources: Source[]): Record<string, SourceInfo> {
  return Object.fromEntries(sources.map((s, i) => [s.id, { name: s.name, badge: i }]))
}

/** Badge colors for a source, so new sites get one automatically (theme CSS variables, light / dark) */
export const badgeColors = (badge: number | undefined) => (theme: Theme) => {
  const badges = (theme.vars ?? theme).palette.badges
  if (badge === undefined || !badges?.length) return { bgcolor: (theme.vars ?? theme).palette.action.hover }
  const { bg, fg } = badges[badge % badges.length]
  return { bgcolor: bg, color: fg }
}

/** Unique across sources (paths alone could collide) */
export const torrentKey = (t: Torrent) => `${t.source}:${t.path}`

/** Torrent shape for the shared copy / open handlers */
export const featuredToTorrent = (item: FeaturedItem): Torrent => ({
  source: item.source,
  kind: item.kind,
  title: item.release,
  path: item.path,
  link: item.link,
  magnet: item.magnet ?? undefined,
  seeds: item.seeds,
  leeches: item.leeches,
  size: item.size,
  uploader: '',
  upload_date: '',
})
