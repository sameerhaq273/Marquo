import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Fade from '@mui/material/Fade'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Modal from '@mui/material/Modal'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from './Icon'

/** Phones need at least this many characters before searching */
export const MIN_QUERY = 3

interface Props {
  query: string
  onQuery: (query: string) => void
  onSubmit: (e: FormEvent) => void
  /** The search that's on screen: its query and whether it's still loading */
  shownQuery: string
  loading: boolean
}

const spin = { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }

/**
 * Phones: a small "Search" pill at the bottom centre (like the iPhone home screen's). Tapping it
 * opens a full-page search: the field on top, focused so the keyboard comes up, and Clear +
 * Search at the bottom centre. It stays open while the search runs, then goes back to the pill.
 */
export function MobileSearch({ query, onQuery, onSubmit, shownQuery, loading }: Props) {
  const [open, setOpen] = useState(false)
  // The query sent from this page: close once its results (or error) are on screen
  const [sent, setSent] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const viewport = useVisualViewport(open)

  const text = query.trim()
  const canSearch = text.length >= MIN_QUERY
  const searching = sent !== null

  if (sent !== null && sent === shownQuery && !loading) {
    setSent(null)
    setOpen(false)
  }

  function openSearch() {
    // Mount and focus during the tap itself: iOS only raises the keyboard for a focus made then
    flushSync(() => setOpen(true))
    inputRef.current?.focus()
  }

  function close() {
    setOpen(false)
    setSent(null)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSearch || searching) return
    inputRef.current?.blur()
    setSent(text)
    onSubmit(e)
  }

  return (
    <>
      <ButtonBase
        onClick={openSearch}
        aria-haspopup="dialog"
        aria-label={shownQuery ? `Search (now showing: ${shownQuery})` : 'Search'}
        sx={{
          display: { xs: 'flex', sm: 'none' },
          position: 'fixed',
          zIndex: 'appBar',
          left: '50%',
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          transform: 'translateX(-50%)',
          height: 44,
          px: 2.5,
          gap: 0.75,
          ...pill,
          '&:active': { transform: 'translateX(-50%) scale(0.96)' },
        }}
      >
        <Icon name="search" size={18} />
        Search
      </ButtonBase>

      <Modal open={open} onClose={close} disableAutoFocus aria-label="Search torrents" slotProps={{ backdrop: { sx: { bgcolor: 'background.default' } } }}>
        <Fade in={open}>
          <Box
            sx={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: viewport.top,
              // Follows the visible area, so the buttons sit right above the keyboard
              height: viewport.height,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.default',
              outline: 0,
            }}
          >
            <Box component="form" role="search" onSubmit={submit} sx={{ display: 'contents' }}>
              {/* Top: the search field */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 'calc(12px + env(safe-area-inset-top))', pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <IconButton onClick={close} aria-label="Close search" sx={{ width: 44, height: 44, color: 'text.secondary', flexShrink: 0 }}>
                  <Icon name="chevron_left" size={26} />
                </IconButton>
                <TextField
                  inputRef={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder="Search torrents…"
                  autoComplete="off"
                  fullWidth
                  slotProps={{
                    // 16px stops iOS zooming in on focus
                    htmlInput: { 'aria-label': 'Torrent name', spellCheck: false, enterKeyHint: 'search', style: { height: 27, fontSize: 16 } },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                      sx: { '& input::-webkit-search-cancel-button': { display: 'none' } },
                    },
                  }}
                />
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', px: 3, pt: 3 }}>
                <Typography variant="body2" aria-live="polite" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                  {searching
                    ? `Searching for “${sent}”…`
                    : text.length > 0 && !canSearch
                      ? `Type at least ${MIN_QUERY} characters`
                      : 'Every word you type must be in the name.'}
                </Typography>
              </Box>

              {/* Bottom centre: Clear + Search */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, px: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <Button
                  type="button"
                  disabled={!query || searching}
                  onClick={() => {
                    onQuery('')
                    inputRef.current?.focus()
                  }}
                  startIcon={<Icon name="close" size={18} />}
                  sx={{ height: 44, px: 2.5, ...pill }}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canSearch || searching}
                  startIcon={<Icon name={searching ? 'progress_activity' : 'search'} size={18} sx={searching ? spin : undefined} />}
                  sx={{ height: 44, px: 3, borderRadius: 999, fontWeight: 600, boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)' }}
                >
                  {searching ? 'Searching…' : 'Search'}
                </Button>
              </Box>
            </Box>
          </Box>
        </Fade>
      </Modal>
    </>
  )
}

/** iOS-style frosted pill */
const pill = {
  borderRadius: 999,
  color: 'text.primary',
  typography: 'body2',
  fontWeight: 600,
  bgcolor: 'color-mix(in srgb, var(--mui-palette-background-paper) 78%, transparent)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: 1,
  borderColor: 'divider',
  boxShadow: '0 8px 24px rgb(0 0 0 / 0.18), 0 1px 3px rgb(0 0 0 / 0.12)',
  transition: 'transform 120ms ease',
} as const

/** The part of the screen the keyboard doesn't cover (iOS doesn't resize the page for it) */
function useVisualViewport(active: boolean) {
  const [box, setBox] = useState<{ top: number | string; height: number | string }>({ top: 0, height: '100dvh' })
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => setBox({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return box
}
