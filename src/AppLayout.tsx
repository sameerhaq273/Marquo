import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Slide from '@mui/material/Slide'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { FilterDialog } from './components/FilterDialog'
import { Icon } from './components/Icon'
import { SortMenu } from './components/SortMenu'
import { MobileSearch } from './components/MobileSearch'
import type { CopyState } from './components/ResultsTable'
import {
  getConfig,
  getMagnet,
  searchTorrents,
  startTorrentFile,
  torrentFileStatus,
  torrentFileUrl,
  type ApiConfig,
  type Compat,
  type Torrent,
} from './lib/api'
import { visuallyHidden } from './lib/a11y'
import type { AppContext, SearchStatus } from './lib/appContext'
import {
  activeSources,
  countActive,
  inYearRange,
  DEFAULT_FILTERS,
  FILTERS_VERSION,
  nextSort,
  normalizeFilters,
  searchKey,
  type Filters,
  type SortKey,
} from './lib/filters'
import { isSensitive } from './lib/sensitive'
import { sourceInfoMap, torrentKey } from './lib/sources'
import { elevation } from './theme'
import { beep, copyText, parseDate, parseSize, readStored, toNumber, writeStored } from './lib/utils'

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const FILE_TIMEOUT = 10 * 60 * 1000 // give up on a conversion after 10 minutes

const sortValue: Record<Exclude<SortKey, 'match' | 'name'>, (t: Torrent) => number> = {
  size: (t) => parseSize(t.size),
  seeds: (t) => toNumber(t.seeds),
  leeches: (t) => toNumber(t.leeches),
  date: (t) => parseDate(t.upload_date),
}

/**
 * Sticky search bar + filters on every page. The search itself is driven by the URL
 * (/search?q=…&page=…), so back/forward, reloads and shared links all work.
 */
export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const onSearchRoute = location.pathname === '/search' || location.pathname.startsWith('/search/')
  const q = onSearchRoute ? (searchParams.get('q') ?? '').trim() : ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [config, setConfig] = useState<ApiConfig | null | 'offline'>(null)
  const [query, setQuery] = useState(q)
  const [syncedQ, setSyncedQ] = useState(q)
  const [searchData, setSearchData] = useState<{ key: string; results: Torrent[]; warnings: string[]; error: string } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [filters, setFilters] = useState<Filters>(() => normalizeFilters(readStored('filters', DEFAULT_FILTERS)))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pageSize, setPageSize] = useState(() => readStored('pageSize', 20))
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({})
  const [compatChecks, setCompatChecks] = useState<Record<string, Compat | null>>({})
  const [fileStates, setFileStates] = useState<Record<string, number>>({})
  // Stable, so pages can call it from effects
  const setCompat = useCallback(
    (key: string, compat: Compat | null) =>
      setCompatChecks((prev) => (key in prev && JSON.stringify(prev[key]) === JSON.stringify(compat) ? prev : { ...prev, [key]: compat })),
    [],
  )
  const [toast, setToast] = useState<Toast | null>(null)

  const mainRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestedKey = useRef('')
  const magnetCache = useRef(new Map<string, string>())

  const api = typeof config === 'object' ? config : null
  const sources = useMemo(() => api?.sources ?? [], [api])
  const categories = api?.categories ?? []
  const allIds = useMemo(() => sources.map((s) => s.id), [sources])
  const sourceInfo = useMemo(() => sourceInfoMap(sources), [sources])

  // Keep the search box in step with the URL (back / forward / links)
  if (q !== syncedQ) {
    setSyncedQ(q)
    setQuery(q)
  }

  useEffect(() => {
    getConfig().then(setConfig, () => setConfig('offline'))
    inputRef.current?.focus()
  }, [])

  // Ctrl+S (Cmd+S on a Mac) puts the cursor in the search box from anywhere on the page.
  // The browser's own "save page" is suppressed, which is the point of picking this one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => writeStored('filters', { ...filters, version: FILTERS_VERSION }), [filters])
  useEffect(() => writeStored('pageSize', pageSize), [pageSize])

  // Table headers stick right under the toolbar, whatever height it wraps to
  useLayoutEffect(() => {
    const sticky = stickyRef.current
    const main = mainRef.current
    if (!sticky || !main) return
    // Round down so headers tuck under the toolbar instead of leaving a sub-pixel gap
    const update = () => main.style.setProperty('--sticky-top', `${Math.floor(sticky.getBoundingClientRect().height)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(sticky)
    return () => observer.disconnect()
  }, [])

  // Search whenever the query or the server-side filters (sources, category) change.
  // The answer is stored with the key it belongs to and the status is derived from it, so
  // returning from home or a details dialog to the same search doesn't refetch.
  // Nothing is searched until /api/config has answered: the source list comes from it, and
  // firing early sent no sources at all, which the server reads as "search every site" -
  // so an unchecked source came back anyway on a cold load or a refresh.
  const wantedKey = q && config ? `${q}|${searchKey(filters)}|${nonce}` : ''
  useEffect(() => {
    if (!wantedKey || searchData?.key === wantedKey || requestedKey.current === wantedKey) return
    requestedKey.current = wantedKey
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const ids = api ? activeSources(api.sources.map((s) => s.id), filters) : []
    searchTorrents(q, ids, filters.category, controller.signal).then(
      (data) => setSearchData({ key: wantedKey, results: data.results, warnings: data.warnings, error: '' }),
      (e) => {
        if (controller.signal.aborted) return
        const message = e instanceof Error ? e.message : 'Something went wrong.'
        setSearchData({ key: wantedKey, results: [], warnings: [], error: message })
      },
    )
  }, [wantedKey, searchData, q, api, filters])

  const current = searchData?.key === wantedKey ? searchData : null
  const status: SearchStatus = !wantedKey ? 'idle' : !current ? 'loading' : current.error ? 'error' : 'success'
  const results = useMemo(() => current?.results ?? [], [current])
  // A fresh [] each render would defeat the context memo below
  const warnings = useMemo(() => current?.warnings ?? [], [current])
  const error = current?.error ?? ''

  // Sensitive results are counted separately, so the empty state can say which filter hid them
  const allowed = useMemo(
    () => (filters.safeSearch ? results.filter((t) => !isSensitive(t)) : results),
    [results, filters.safeSearch],
  )
  const sensitiveCount = results.length - allowed.length

  const visible = useMemo(() => {
    let list = filters.hideDead ? allowed.filter((t) => toNumber(t.seeds) > 0) : allowed
    list = list.filter((t) => inYearRange(t.year, filters))
    if (filters.sort !== 'match') {
      const dir = filters.sortDir === 'asc' ? 1 : -1
      const compare =
        filters.sort === 'name'
          ? (a: Torrent, b: Torrent) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
          : (a: Torrent, b: Torrent) => sortValue[filters.sort as keyof typeof sortValue](a) - sortValue[filters.sort as keyof typeof sortValue](b)
      list = [...list].sort((a, b) => compare(a, b) * dir)
    }
    return list
  }, [allowed, filters])

  function setPage(next: number, replace = false) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next > 1) params.set('page', String(next))
        else params.delete('page')
        return params
      },
      { replace },
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = query.trim()
    if (!text) {
      navigate('/')
      return
    }
    if (onSearchRoute && text === q && location.pathname === '/search') {
      setNonce((n) => n + 1) // same query again: search again
      setPage(1, true)
      return
    }
    navigate(`/search?${new URLSearchParams({ q: text })}`)
  }

  function applyFilters(next: Filters) {
    setFilters(next)
    if (page > 1) setPage(1, true)
  }

  function setCopyState(key: string, state: CopyState | null) {
    setCopyStates((prev) => {
      const next = { ...prev }
      if (state) next[key] = state
      else delete next[key]
      return next
    })
  }

  async function resolveMagnet(torrent: Torrent) {
    if (torrent.magnet) return torrent.magnet
    const key = torrentKey(torrent)
    const cached = magnetCache.current.get(key)
    if (cached) return cached
    const magnet = await getMagnet(torrent.source, torrent.path)
    magnetCache.current.set(key, magnet)
    return magnet
  }

  async function onCopy(torrent: Torrent) {
    const key = torrentKey(torrent)
    setCopyState(key, 'loading')
    try {
      await copyText(await resolveMagnet(torrent))
      setCopyState(key, 'copied')
      beep()
      setToast({ id: Date.now(), kind: 'success', message: 'Magnet link copied to clipboard' })
      setTimeout(() => setCopyState(key, null), 2000)
    } catch (e) {
      setCopyState(key, null)
      setToast({ id: Date.now(), kind: 'error', message: e instanceof Error ? e.message : 'Could not copy magnet link' })
    }
  }

  /**
   * Magnet -> .torrent file via magnet2torrent.com, saved through the browser's normal download.
   * Known torrents come back at once; others need the site to fetch metadata from peers,
   * polled on the site's own schedule (5s, 10s, 20s… capped at a minute).
   */
  async function onDownloadFile(torrent: Torrent) {
    const key = torrentKey(torrent)
    if (fileStates[key]) return
    setFileStates((prev) => ({ ...prev, [key]: Date.now() }))
    try {
      let result = await startTorrentFile(await resolveMagnet(torrent))
      const gid = result.status === 'pending' ? result.gid : undefined
      if (result.status === 'pending') {
        setToast({ id: Date.now(), kind: 'info', message: 'Getting the .torrent file… rarely shared torrents can take a few minutes.' })
      }
      const deadline = Date.now() + FILE_TIMEOUT
      let delay = 5000
      while (result.status === 'pending') {
        if (!gid || Date.now() > deadline) throw new Error('magnet2torrent.com is still working on it. Try again later.')
        await sleep(delay)
        delay = Math.min(delay * 2, 60_000)
        result = await torrentFileStatus(gid)
      }
      if (result.status === 'failed') throw new Error(result.error)
      const link = document.createElement('a')
      link.href = torrentFileUrl(result.token)
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setToast({ id: Date.now(), kind: 'success', message: `Saved ${result.filename}` })
    } catch (e) {
      setToast({ id: Date.now(), kind: 'error', message: e instanceof Error ? e.message : 'Could not get the .torrent file' })
    } finally {
      setFileStates((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  async function onOpen(torrent: Torrent) {
    const key = torrentKey(torrent)
    setCopyState(key, 'loading')
    try {
      window.location.href = await resolveMagnet(torrent)
      setToast({ id: Date.now(), kind: 'success', message: 'Opening in your torrent client…' })
    } catch (e) {
      setToast({ id: Date.now(), kind: 'error', message: e instanceof Error ? e.message : 'Could not get magnet link' })
    } finally {
      setCopyState(key, null)
    }
  }

  const activeCount = countActive(filters, allIds)
  const hiddenCount = results.length - visible.length
  const resultSummary = !onSearchRoute
    ? ''
    : status === 'loading'
      ? 'Searching…'
      : status !== 'success'
        ? ''
        : hiddenCount > 0
          ? `${visible.length} of ${results.length} results`
          : `${results.length} ${results.length === 1 ? 'result' : 'results'}`
  const onHome = location.pathname === '/' || location.pathname.startsWith('/t/')

  /**
   * The handlers above are redeclared on every render, so a context built straight from them
   * would be a new object each keystroke - and every page under the Outlet, down to all 100
   * result rows, would re-render while someone types in the search box. Measured at roughly
   * two seconds of blocked main thread per character.
   *
   * So the latest handlers live in a ref, and the context calls through to it with callbacks
   * that never change identity. Only real data changes rebuild the context.
   */
  const latest = useRef({ applyFilters, onCopy, onOpen, onDownloadFile, setPage, filters })
  // Updated before paint, so the handlers are current by the time anyone can click
  useLayoutEffect(() => {
    latest.current = { applyFilters, onCopy, onOpen, onDownloadFile, setPage, filters }
  })

  const stable = useMemo(
    () => ({
      applyFilters: (next: Filters) => latest.current.applyFilters(next),
      sortBy: (key: SortKey) => latest.current.applyFilters(nextSort(latest.current.filters, key)),
      retry: () => setNonce((n) => n + 1),
      goToPage: (next: number) => {
        latest.current.setPage(next)
        window.scrollTo({ top: 0 })
      },
      setPageSize: (size: number) => {
        setPageSize(size)
        latest.current.setPage(1, true)
      },
      onCopy: (torrent: Torrent) => latest.current.onCopy(torrent),
      onOpen: (torrent: Torrent) => latest.current.onOpen(torrent),
      onDownloadFile: (torrent: Torrent) => latest.current.onDownloadFile(torrent),
      findReleases: (title: string) => navigate(`/search?${new URLSearchParams({ q: title })}`),
    }),
    [navigate],
  )

  const context: AppContext = useMemo(
    () => ({
      api,
      sourceInfo,
      filters,
      query: q,
      status,
      error,
      results,
      visible,
      sensitiveCount,
      warnings,
      page,
      pageSize,
      copyStates,
      compatChecks,
      setCompat,
      fileStates,
      ...stable,
    }),
    [
      api,
      sourceInfo,
      filters,
      q,
      status,
      error,
      results,
      visible,
      sensitiveCount,
      warnings,
      page,
      pageSize,
      copyStates,
      compatChecks,
      setCompat,
      fileStates,
      stable,
    ],
  )

  return (
    <Box component="main" ref={mainRef} sx={{ mx: 'auto', width: 1, maxWidth: 1700, px: { xs: 2, sm: 3 }, pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', sm: 4 } }}>
      {/* Off screen until it is tabbed to, so a keyboard reader can pass the search bar,
          the sort button and the filters without walking through them on every page. */}
      <Box
        component="a"
        href="#results"
        sx={{
          position: 'fixed',
          left: 16,
          top: 16,
          zIndex: (t) => t.zIndex.tooltip + 1,
          px: 2,
          py: 1,
          borderRadius: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: 6,
          textDecoration: 'none',
          transform: 'translateY(calc(-100% - 24px))',
          '&:focus-visible': { transform: 'none' },
        }}
      >
        Skip to results
      </Box>
      {/* The layout names the app for a screen reader on pages that draw no heading of their
          own. The home banner has a visible h1, so it would be the second one there. */}
      {!onHome && (
        <Box component="h1" sx={visuallyHidden}>
          Marquo - search every torrent site at once
        </Box>
      )}

      {/* Sticky: home, search, filters, result count. Phones: home, query, filters (search is the pill at the bottom) */}
      <Box ref={stickyRef} sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'background.default', pt: { xs: 'calc(12px + env(safe-area-inset-top))', sm: 3 } }}>
        {/* The toolbar is the panel's head: same fill, no shadow of its own, so head and
            body read as one card rather than two stacked boxes. On phones it stands alone. */}
        <Paper sx={{ borderRadius: { xs: 4, sm: '12px 12px 0 0' }, boxShadow: { xs: elevation.card, sm: 'none' } }}>
          <Stack direction="row" sx={{ flexWrap: { xs: 'nowrap', sm: 'wrap' }, alignItems: 'center', gap: { xs: 1, sm: 1.5 }, p: { xs: 1, sm: 2 } }}>
            <Tooltip title="Home">
              <IconButton
                component={Link}
                to="/"
                aria-label="Home"
                aria-current={onHome ? 'page' : undefined}
                sx={{ width: 44, height: 44, flexShrink: 0, ...(onHome ? { color: 'primary.main', bgcolor: 'action.selected' } : { color: 'text.secondary' }) }}
              >
                <Icon name="home" size={24} />
              </IconButton>
            </Tooltip>

            {/* Phones: what's being shown */}
            <Box sx={{ display: { xs: 'block', sm: 'none' }, flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {onSearchRoute && q ? q : 'Marquo'}
              </Typography>
              <Typography variant="caption" noWrap component="p" aria-live="polite" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {resultSummary || (onHome ? 'Featured movies and TV' : '\u00a0')}
              </Typography>
            </Box>

            <Box
              component="form"
              onSubmit={onSubmit}
              role="search"
              sx={{ display: { xs: 'none', sm: 'flex' }, minWidth: 0, flex: '1 1 20rem', gap: 1.5, alignItems: 'center' }}
            >
              <TextField
                inputRef={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search torrents…"
                autoComplete="off"
                fullWidth
                sx={{ flex: 1, minWidth: 0 }}
                slotProps={{
                  htmlInput: { 'aria-label': 'Torrent name', spellCheck: false, style: { height: 27 } },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: query ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label="Clear search"
                          onClick={() => {
                            setQuery('')
                            inputRef.current?.focus()
                          }}
                        >
                          <Icon name="close" size={18} />
                        </IconButton>
                      </InputAdornment>
                    ) : (
                      <InputAdornment position="end">
                        <ShortcutHint />
                      </InputAdornment>
                    ),
                    sx: { '& input::-webkit-search-cancel-button': { display: 'none' } },
                  },
                }}
              />
              <Button type="submit" variant="contained" disabled={status === 'loading' && onSearchRoute} sx={{ height: 44, px: 2.5, flexShrink: 0 }}>
                Search
              </Button>
            </Box>

            <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <ApiBadge config={config} />
              <SortMenu compact filters={filters} onChange={applyFilters} />
              <IconButton aria-haspopup="dialog" aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'} onClick={() => setFiltersOpen(true)} sx={{ width: 44, height: 44 }}>
                <Badge badgeContent={activeCount} color="primary">
                  <Icon name="tune" size={22} />
                </Badge>
              </IconButton>
            </Box>

            <SortMenu filters={filters} onChange={applyFilters} />

            <Button
              variant="outlined"
              color="inherit"
              aria-haspopup="dialog"
              onClick={() => setFiltersOpen(true)}
              startIcon={<Icon name="tune" size={18} />}
              endIcon={activeCount > 0 ? <Chip label={activeCount} size="small" color="primary" sx={{ height: 20, minWidth: 20, '& .MuiChip-label': { px: 0.75 } }} /> : undefined}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, height: 44, borderColor: 'divider', color: 'text.primary', fontWeight: 500 }}
            >
              Filters
            </Button>

            <Stack direction="row" sx={{ display: { xs: 'none', sm: 'flex' }, ml: 'auto', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" aria-live="polite" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {resultSummary}
              </Typography>
              <ApiBadge config={config} />
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <Paper
        component="section"
        sx={{
          mt: { xs: 1.5, sm: 0 },
          bgcolor: { xs: 'transparent', sm: 'background.paper' },
          borderRadius: { xs: 0, sm: '0 0 12px 12px' },
          boxShadow: { xs: 'none', sm: elevation.card },
        }}
      >
        {/* tabIndex -1 so the skip link can actually land focus here, not just scroll */}
        <Box id="results" tabIndex={-1} sx={{ outline: 0 }}>
          <Outlet context={context} />
        </Box>
      </Paper>

      <MobileSearch query={query} onQuery={setQuery} onSubmit={onSubmit} shownQuery={q} loading={status === 'loading'} />

      {filtersOpen && (
        <FilterDialog
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onApply={applyFilters}
          sources={sources}
          categories={categories}
        />
      )}

      <Snackbar
        key={toast?.id}
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slots={{ transition: Slide }}
        slotProps={{ transition: { direction: 'up' } as object }}
        sx={{ bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', sm: 24 } }}
      >
        {toast ? (
          <Alert
            severity={toast.kind}
            variant="filled"
            icon={<Icon name={toast.kind === 'success' ? 'check_circle' : toast.kind === 'info' ? 'info' : 'error'} size={20} />}
            onClose={() => setToast(null)}
            sx={{ alignItems: 'center' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}

/**
 * The Ctrl+S hint that sits at the end of the empty search box. Hidden from assistive tech:
 * it is decoration for a shortcut the field already works without, and a screen reader
 * reading "Ctrl S" after the placeholder is noise.
 *
 * Mac reports its modifier as Meta, so the glyph has to follow the platform or the hint is
 * simply wrong there.
 */
function ShortcutHint() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  return (
    <Box
      aria-hidden
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        height: 22,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {mac ? '⌘' : 'Ctrl'} S
    </Box>
  )
}

function ApiBadge({ config }: { config: ApiConfig | null | 'offline' }) {
  if (config === 'offline') return <Chip label="API offline" size="small" color="error" variant="outlined" />
  if (config?.mock) {
    return (
      <Tooltip title="server.py is running with --mock: results are sample data">
        <Chip label="Demo data" size="small" color="warning" variant="outlined" />
      </Tooltip>
    )
  }
  return null
}
