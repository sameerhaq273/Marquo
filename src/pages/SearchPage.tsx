import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Pagination } from '../components/Pagination'
import { ResultsTable } from '../components/ResultsTable'
import { getCompat, type Torrent } from '../lib/api'
import { useApp } from '../lib/appContext'
import { useTitle } from '../lib/seo'
import { torrentKey } from '../lib/sources'

/** Phones: cards shown at first, and added each time the list nears its end */
const BATCH = 10
/** How far below the screen (px) the end of the list starts the next batch */
const AHEAD = 480

/**
 * "/search?q=…&page=…" : merged results; "/search/t/:source/:id" opens a row's details over it.
 * Desktop and tablets page through the results; phones scroll through them endlessly. Either way
 * sorting and filters apply to every result, not only the ones on screen.
 */
export function SearchPage() {
  const app = useApp()
  const { status, results, visible, filters, page, pageSize } = app
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))

  // A result page per query is endless and thin on its own, so it is described for anyone
  // who shares the link but kept out of the index.
  useTitle(app.query ? `${app.query} torrents` : 'Search')

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pageCount)

  // A new search, filter or sort starts the endless list again from the top
  const listKey = `${app.query}|${JSON.stringify(filters)}|${visible.length}`
  const [shown, setShown] = useState({ key: listKey, count: BATCH })
  if (shown.key !== listKey) setShown({ key: listKey, count: BATCH })
  const shownCount = shown.key === listKey ? shown.count : BATCH
  const hasMore = phone && shownCount < visible.length

  const slice = useMemo(
    () => (phone ? visible.slice(0, shownCount) : visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)),
    [phone, visible, shownCount, currentPage, pageSize],
  )
  // Ratings read from details replace the ones guessed from the name. Memoised because a
  // new array every render would re-render all 100 rows on each keystroke in the search box.
  const pageRows: Torrent[] = useMemo(
    () =>
      slice.map((t) => {
        const key = torrentKey(t)
        return key in app.compatChecks ? { ...t, compat: app.compatChecks[key], compat_needs_details: false } : t
      }),
    [slice, app.compatChecks],
  )
  useDetailsCompatCheck(pageRows)

  if (!app.query) return <Navigate to="/" replace />

  return (
    <>
      {app.warnings.length > 0 && (
        <Alert severity="warning" icon={<Icon name="warning" />} sx={{ m: 2 }}>
          {app.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Alert>
      )}

      {status === 'error' && (
        <Alert
          severity="error"
          icon={<Icon name="error" size={22} />}
          sx={{ m: 2 }}
          action={
            <Button color="inherit" size="small" onClick={app.retry}>
              Try again
            </Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Search failed
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {app.error}
          </Typography>
        </Alert>
      )}

      {status === 'success' && results.length === 0 && (
        <EmptyState
          icon={<Icon name="search_off" size={26} />}
          title="No torrents found"
          body={`Nothing has all the words in “${app.query}”. Try fewer or different words, or fewer filters.`}
        />
      )}

      {status === 'success' && results.length > 0 && visible.length === 0 && app.sensitiveCount === results.length && (
        <EmptyState
          icon={<Icon name="search_off" size={26} />}
          title="Every result is 18+"
          body={`All ${results.length} results are hidden by the sensitive filter.`}
        >
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => app.applyFilters({ ...filters, safeSearch: false })}
            sx={{ mt: 2, borderColor: 'divider', fontWeight: 500 }}
          >
            Show 18+ results
          </Button>
        </EmptyState>
      )}

      {status === 'success' && results.length > 0 && visible.length === 0 && app.sensitiveCount < results.length && (
        <EmptyState
          icon={<Icon name="search_off" size={26} />}
          title="Every result is a dead torrent"
          body={app.sensitiveCount > 0 ? 'Every result the sensitive filter left has 0 seeds.' : 'All results have 0 seeds.'}
        >
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => app.applyFilters({ ...filters, hideDead: false })}
            sx={{ mt: 2, borderColor: 'divider', fontWeight: 500 }}
          >
            Show dead torrents
          </Button>
        </EmptyState>
      )}

      {(status === 'loading' || status === 'idle' || (status === 'success' && visible.length > 0)) && (
        <ResultsTable
          torrents={pageRows}
          loading={status !== 'success'}
          sort={filters.sort}
          sortDir={filters.sortDir}
          onSort={app.sortBy}
          sources={app.sourceInfo}
          copyStates={app.copyStates}
          onCopy={app.onCopy}
          onOpen={app.onOpen}
          fileStates={app.fileStates}
          onDownloadFile={app.onDownloadFile}
        />
      )}

      {status === 'success' && hasMore && (
        <LoadMore key={shownCount} onLoad={() => setShown({ key: listKey, count: shownCount + BATCH })} />
      )}

      {status === 'success' && phone && visible.length > BATCH && !hasMore && (
        <Typography variant="caption" component="p" sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          All {visible.length} results shown
        </Typography>
      )}

      {status === 'success' && visible.length > 0 && !phone && (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={visible.length}
          onPage={app.goToPage}
          onPageSize={app.setPageSize}
        />
      )}

      <Outlet context={app} />
    </>
  )
}

/**
 * Sits after the last card; once it comes within a few cards of the screen, the next batch is
 * added. Re-mounted per batch (key), so a fresh observer re-checks even if it's still in view.
 */
function LoadMore({ onLoad }: { onLoad: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(onLoad)
  useEffect(() => {
    latest.current = onLoad
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let done = false
    const load = () => {
      if (done) return
      done = true
      cleanup()
      latest.current()
    }
    // About three cards before the end
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && load(), { rootMargin: `0px 0px ${AHEAD}px 0px` })
    // Backup for browsers that delay observers (background tabs, some webviews)
    const check = () => el.getBoundingClientRect().top < window.innerHeight + AHEAD && load()
    const cleanup = () => {
      observer.disconnect()
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
    observer.observe(el)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return cleanup
  }, [])
  return (
    <Box ref={ref} role="status" aria-label="Loading more results" sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
      <CircularProgress size={24} />
    </Box>
  )
}

const CHECKS_AT_ONCE = 3

/**
 * Rows whose name doesn't say what the audio is get their TV rating from the torrent's
 * details instead: only the rows on screen, a few at a time, cancelled when the page changes.
 */
function useDetailsCompatCheck(rows: Torrent[]) {
  const app = useApp()
  const latest = useRef({ rows, app })
  useEffect(() => {
    latest.current = { rows, app }
  })
  const pending = rows.filter((t) => t.compat_needs_details).map(torrentKey).join('|')

  useEffect(() => {
    if (!pending) return
    const { rows: current, app: ctx } = latest.current
    const queue = current.filter((t) => t.compat_needs_details)
    const controller = new AbortController()
    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const torrent = queue.shift()!
        try {
          ctx.setCompat(torrentKey(torrent), await getCompat(torrent.source, torrent.path, controller.signal))
        } catch {
          // Details unavailable: keep the rating from the name
          if (!controller.signal.aborted) ctx.setCompat(torrentKey(torrent), torrent.compat ?? null)
        }
      }
    }
    void Promise.all(Array.from({ length: CHECKS_AT_ONCE }, worker))
    return () => controller.abort()
  }, [pending])
}
