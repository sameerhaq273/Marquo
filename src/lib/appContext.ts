import { useOutletContext } from 'react-router'
import type { CopyState } from '../components/ResultsTable'
import type { ApiConfig, Compat, Torrent } from './api'
import type { Filters, SortKey } from './filters'
import type { SourceInfo } from './sources'

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

/** Shared state the layout owns and hands to pages (and their details route) via <Outlet context> */
export interface AppContext {
  api: ApiConfig | null
  sourceInfo: Record<string, SourceInfo>
  filters: Filters
  applyFilters: (filters: Filters) => void
  sortBy: (key: SortKey) => void

  query: string
  status: SearchStatus
  error: string
  results: Torrent[]
  /** results after the sensitive filter, hide-dead and sorting */
  visible: Torrent[]
  /** How many results the sensitive filter took out, for the empty state */
  sensitiveCount: number
  warnings: string[]
  retry: () => void

  page: number
  pageSize: number
  goToPage: (page: number) => void
  setPageSize: (size: number) => void

  copyStates: Record<string, CopyState>
  /** TV ratings read from torrents' details (by torrentKey); these win over the name-based ones */
  compatChecks: Record<string, Compat | null>
  setCompat: (key: string, compat: Compat | null) => void
  onCopy: (torrent: Torrent) => void
  onOpen: (torrent: Torrent) => void
  /** .torrent conversions in progress (by torrentKey) -> start time */
  fileStates: Record<string, number>
  onDownloadFile: (torrent: Torrent) => void
  findReleases: (title: string) => void
}

export const useApp = () => useOutletContext<AppContext>()
