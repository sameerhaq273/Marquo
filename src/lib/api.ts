/** Smart-TV rating (sources/compat.py): right audio for the user's TV, in shades of green */
export interface Compat {
  tier: 'best' | 'recommended' | 'safe' | 'ok'
  label: string
  reason: string
  /** Where the audio was read from */
  checked: 'name' | 'details'
}

export interface Torrent {
  /** Id of the site it came from (see ApiConfig.sources) */
  source: string
  /** Shared type: movie | tv | game | app | book | music | adult | other */
  kind: string
  title: string
  /** Release year read off the name; null when the name doesn't say */
  year?: string | null
  /** Detail page path on the source site, e.g. /torrent/123/Name/ */
  path: string
  /** Full detail page URL on the source site */
  link: string
  /** Present when the source returns it with the results (The Pirate Bay) */
  magnet?: string
  /** Rated from the name; null = not one of the TV formats */
  compat?: Compat | null
  /** The name doesn't say what the audio is: check the details */
  compat_needs_details?: boolean
  seeds: string
  leeches: string
  size: string
  uploader: string
  upload_date: string
}

export interface SearchResponse {
  results: Torrent[]
  /** e.g. one site failed or has no such category; the rest still returned */
  warnings: string[]
}

/** Home screen card (a site's featured movie / popular TV torrent) */
export interface FeaturedItem {
  source: string
  kind: string
  /** Clean name, e.g. "Sunny Dancer" */
  title: string
  year: string | null
  /** "S01E02" / "Season 2" for TV */
  episode: string | null
  /** Full release name */
  release: string
  /** WEB-DL, BluRay, WEBRip… when the release says */
  print: string | null
  resolution: string | null
  image: string | null
  /** Poster candidates, best first (the UI falls back along the list) */
  images: string[]
  size: string
  seeds: string
  leeches: string
  path: string
  link: string
  magnet: string | null
  compat?: Compat | null
}

export interface Source {
  id: string
  name: string
  url: string
}

export interface Category {
  id: string
  label: string
  /** Source ids that have this category */
  sources: string[]
}

export interface ApiConfig {
  sources: Source[]
  categories: Category[]
  mock: boolean
}

/**
 * Where the API lives. Empty in development and whenever the frontend is served by the
 * same origin as the API, so the Vite proxy keeps working; set VITE_API_BASE at build time
 * when the two are deployed apart (a static frontend plus a Python host).
 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/** Prefixes a path with the API's origin, if there is one */
export const apiUrl = (path: string) => `${API_BASE}${path}`

async function getJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), { signal, ...init })
  let data: (T & { error?: string }) | undefined
  try {
    data = await response.json()
  } catch {
    // Vite's proxy answers with an empty 500 when server.py isn't running. Anything else
    // that isn't JSON is a different problem, and saying "start the server" sends you off
    // debugging the wrong one.
    throw new Error(
      response.status >= 500
        ? "Can't reach the scraper API. Start it with: python server.py"
        : `Request failed (${response.status})`,
    )
  }
  if (!response.ok || !data) {
    throw new Error(data?.error ?? `Request failed (${response.status})`)
  }
  return data
}

/** Magnet -> .torrent conversion (server.py talks to magnet2torrent.com) */
export type TorrentFileResult =
  | { status: 'ready'; token: string; filename: string }
  | { status: 'pending'; gid?: string }
  | { status: 'failed'; error: string }

export function startTorrentFile(magnet: string) {
  return getJson<TorrentFileResult>('/api/torrent-file', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ magnet }),
  })
}

export function torrentFileStatus(gid: string) {
  return getJson<TorrentFileResult>(`/api/torrent-file/status?${new URLSearchParams({ gid })}`)
}

export const torrentFileUrl = (token: string) => apiUrl(`/api/torrent-file/download/${encodeURIComponent(token)}`)

export function getConfig() {
  return getJson<ApiConfig>('/api/config')
}

/** Saved by the server once a day; notices say when an older save is shown */
export function getFeatured() {
  return getJson<{ items: FeaturedItem[]; notices?: string[] }>('/api/featured')
}

export function searchTorrents(query: string, sources: string[], category: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query })
  // No sources = server searches all of them
  if (sources.length) params.set('sources', sources.join(','))
  if (category) params.set('category', category)
  return getJson<SearchResponse>(`/api/search?${params}`, signal)
}

/** For sources whose results don't include a magnet (1337x keeps it on the detail page) */
export async function getMagnet(source: string, path: string) {
  const params = new URLSearchParams({ source, path })
  const { magnet } = await getJson<{ magnet: string }>(`/api/magnet?${params}`)
  return magnet
}

export interface DetailsItem {
  label: string
  value: string
}

export interface DetailsSection {
  id: string
  title: string
  /** Material Symbols name */
  icon: string
  items: DetailsItem[]
}

/** /api/details: a torrent's detail page, read and organized by sources/analyze.py */
export interface TorrentDetails {
  source: string
  path: string
  /** The torrent's page on its own site */
  link: string
  kind: string
  title: string
  year: string | null
  episode: string | null
  release: string
  badges: string[]
  summary: string | null
  poster: string | null
  /** Poster candidates, best first */
  posters: string[]
  imdb: string | null
  screenshots: string[]
  facts: DetailsItem[]
  sections: DetailsSection[]
  files: {
    total: number
    groups: { type: string; label: string; count: number; size: string | null }[]
    list: { name: string; size: string | null; type: string }[]
    truncated: boolean
  }
  links: { label: string; url: string }[]
  warnings: string[]
  magnet: string | null
  info_hash: string | null
  /** Set when the main site failed and a backup mirror answered */
  notices: string[]
  /** Rated from the details */
  compat: Compat | null
}

/** TV rating from a torrent's details (lighter than getDetails; cached by the server) */
export async function getCompat(source: string, path: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ source, path })
  const { compat } = await getJson<{ compat: Compat | null }>(`/api/compat?${params}`, signal)
  return compat
}

export function getDetails(source: string, path: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ source, path })
  return getJson<TorrentDetails>(`/api/details?${params}`, signal)
}
