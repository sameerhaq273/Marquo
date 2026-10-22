import type { Torrent } from './api'

/**
 * Detail routes look like /search/t/<source>/<id>. The id is the torrent's path on its site,
 * base64url-encoded: site paths contain slashes, dots and "?" that would break a URL segment.
 */
export function encodeId(path: string) {
  const bytes = new TextEncoder().encode(path)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeId(id: string) {
  try {
    const base64 = id.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** Relative link from a page (home or search) to its details dialog route */
export const detailsTo = (torrent: Pick<Torrent, 'source' | 'path'>) => `t/${torrent.source}/${encodeId(torrent.path)}`

/** What a row / card already knows, shown while the details load */
export interface DetailsPreview {
  title: string
  kind: string
}
