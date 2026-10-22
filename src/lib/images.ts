/**
 * Every picture goes through our API (/api/image), so the browser never has to reach torrent
 * sites or image hosts itself: blockers, Safe Browsing, hotlink rules and network blocks
 * can stop those requests, while the server usually gets through.
 */
import { apiUrl } from './api'

export function proxied(url: string | null | undefined) {
  if (!url) return null
  if (url.startsWith('/') || url.startsWith('data:')) return url
  return apiUrl(`/api/image?${new URLSearchParams({ url })}`)
}
