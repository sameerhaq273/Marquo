import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MuiLink from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useLocation } from 'react-router'
import { memo } from 'react'
import { visuallyHidden } from '../lib/a11y'
import type { Torrent } from '../lib/api'
import { defaultDir, type SortDir, type SortKey } from '../lib/filters'
import { compatStyle } from '../lib/compat'
import { kindColor, kindInfo } from '../lib/kinds'
import { detailsTo, type DetailsPreview } from '../lib/routes'
import { badgeColors, torrentKey, type SourceInfo } from '../lib/sources'
import { elevation } from '../theme'
import { Icon } from './Icon'
import { MagnetIcon } from './MagnetIcon'

export type CopyState = 'loading' | 'copied' | 'error'

interface Props {
  torrents: Torrent[]
  loading: boolean
  sort: SortKey
  sortDir: SortDir
  /** Header click; the parent cycles natural → reversed → best match */
  onSort: (key: SortKey) => void
  sources: Record<string, SourceInfo>
  copyStates: Record<string, CopyState>
  onCopy: (torrent: Torrent) => void
  onOpen: (torrent: Torrent) => void
  /** .torrent conversions in progress (by torrentKey) */
  fileStates: Record<string, number>
  onDownloadFile: (torrent: Torrent) => void
}

const SKELETON_ROWS = 10

/**
 * Fixed widths (table-layout: fixed): re-sorting the rows never shifts the columns.
 * Name has no width, so it takes all the space the others leave.
 */
const COLUMNS: { label: string; key?: SortKey; width?: number; align?: 'right' | 'center' }[] = [
  { label: 'Name', key: 'name' },
  { label: 'Source', width: 136, align: 'center' },
  { label: 'Size', key: 'size', width: 104, align: 'right' },
  { label: 'Seeds', key: 'seeds', width: 88, align: 'right' },
  { label: 'Leeches', key: 'leeches', width: 104, align: 'right' },
  // Date on the first line, uploader below
  { label: 'Uploaded', key: 'date', width: 152 },
  { label: 'Actions', width: 168 },
]

/**
 * Size and date, set apart from the rest of the line.
 *
 * Neutral on purpose: the source chip beside them carries the site's colour, and two
 * coloured chips in a row would make neither of them mean anything.
 */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        px: 0.875,
        py: 0.125,
        borderRadius: 1,
        bgcolor: 'sunken',
        color: 'text.primary',
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Box>
  )
}

function SortArrow({ className }: { className?: string }) {
  return <Icon name="arrow_downward" size={16} className={className} />
}

/**
 * Memoised: this renders up to 100 rows, and without it every keystroke in the search box
 * re-rendered all of them. Its props are stable - the handlers come from the app context,
 * and the rows array is memoised by the page - so the comparison actually holds.
 */
export const ResultsTable = memo(function ResultsTable({ torrents, loading, sort, sortDir, onSort, sources, copyStates, onCopy, onOpen, fileStates, onDownloadFile }: Props) {
  return (
    <>
      {/* Desktop: table with sticky column headers under the sticky toolbar */}
      <Table sx={{ display: { xs: 'none', lg: 'table' }, tableLayout: 'fixed', width: 1 }}>
        <colgroup>
          {COLUMNS.map((c) => (
            <Box component="col" key={c.label} sx={{ width: c.width }} />
          ))}
        </colgroup>
        <TableHead>
          <TableRow>
            {COLUMNS.map((c) => {
              const active = c.key !== undefined && sort === c.key
              const next = !c.key ? '' : !active ? 'sort' : sortDir === defaultDir(c.key) ? 'reverse the order' : 'clear sorting'
              return (
                <TableCell
                  key={c.label}
                  align={c.align}
                  sortDirection={active ? sortDir : false}
                  sx={{
                    position: 'sticky',
                    top: 'var(--sticky-top)',
                    zIndex: 10,
                    bgcolor: 'background.default',
                    borderBottom: 0,
                    boxShadow: (t) => `inset 0 -1px 0 ${t.vars?.palette.divider}`,
                  }}
                >
                  {c.key ? (
                    <Tooltip title={`Click to ${next}`} placement="top">
                      <TableSortLabel
                        active={active}
                        direction={active ? sortDir : defaultDir(c.key)}
                        onClick={() => onSort(c.key!)}
                        IconComponent={SortArrow}
                      >
                        {c.label}
                      </TableSortLabel>
                    </Tooltip>
                  ) : c.label === 'Actions' ? (
                    <Box component="span" sx={visuallyHidden}>
                      Actions
                    </Box>
                  ) : (
                    c.label
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i}>
                  {COLUMNS.map((c, j) => (
                    <TableCell key={c.label}>
                      <Skeleton width={j === 0 ? '75%' : '80%'} sx={{ ml: c.align ? 'auto' : 0, mr: c.align === 'center' ? 'auto' : 0 }} />
                      {c.key === 'date' && <Skeleton width="55%" sx={{ fontSize: 12 }} />}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : torrents.map((t, i) => (
                <TableRow key={torrentKey(t)} hover data-animate sx={{ '&:last-child td': { borderBottom: 0 }, animation: 'fade-in 240ms ease-out both', animationDelay: `${Math.min(i, 20) * 12}ms` }}>
                  <TableCell>
                    <Title torrent={t} />
                  </TableCell>
                  <TableCell align="center">
                    <SourceChip info={sources[t.source]} id={t.source} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {t.size}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {t.seeds}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {t.leeches}
                  </TableCell>
                  <TableCell sx={{ py: 1 }}>
                    <Typography variant="body2" noWrap>
                      {t.upload_date}
                    </Typography>
                    <Typography variant="caption" noWrap title={t.uploader} sx={{ display: 'block', color: 'text.secondary' }}>
                      {t.uploader}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1 }}>
                    <Actions torrent={t} state={copyStates[torrentKey(t)]} fileSince={fileStates[torrentKey(t)]} onCopy={onCopy} onOpen={onOpen} onDownloadFile={onDownloadFile} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>

      {/* Phones / tablets: cards (one column on phones, two on tablets) */}
      <Box
        component="ul"
        sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, listStyle: 'none', m: 0, p: { xs: 0, sm: 2 } }}
      >
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <Paper component="li" key={i} sx={{ p: 2, borderRadius: 4, boxShadow: elevation.card }}>
                <Skeleton width="85%" />
                <Skeleton width="60%" />
                <Stack direction="row" sx={{ mt: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="40%" />
                  <Skeleton variant="circular" width={32} height={32} />
                </Stack>
              </Paper>
            ))
          : torrents.map((t, i) => (
              <Paper
                component="li"
                key={torrentKey(t)}
                data-animate
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  p: 2,
                  pb: 1.25,
                  borderRadius: 4,
                  minWidth: 0,
                  boxShadow: elevation.card,
                  // New cards ease in, one after another within each batch of 10
                  animation: 'fade-up 280ms cubic-bezier(0.2, 0.7, 0.3, 1) both',
                  animationDelay: `${(i % 10) * 35}ms`,
                  transition: 'box-shadow 200ms',
                  '@media (hover: hover)': { '&:hover': { boxShadow: elevation.raised } },
                }}
              >
                <Title torrent={t} lines={2} />
                <Stack
                  direction="row"
                  sx={{ flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.75, color: 'text.secondary', typography: 'caption' }}
                >
                  <SourceChip info={sources[t.source]} id={t.source} />
                  {/* Size is the thing people weigh after the name, so it reads as a chip
                      rather than loose text - neutral, so the source chip keeps its colour */}
                  <MetaChip>{t.size}</MetaChip>
                  <MetaChip>{t.upload_date}</MetaChip>
                  {t.uploader && (
                    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.uploader}
                    </Box>
                  )}
                </Stack>
                <Stack direction="row" sx={{ mt: 'auto', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, typography: 'body2', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    <Box component="span" title="Seeds" sx={{ display: 'inline-flex', alignItems: 'center', color: 'success.main' }}>
                      <Icon name="arrow_upward" size={16} label="Seeds" />
                      {t.seeds}
                    </Box>
                    <Box component="span" title="Leeches" sx={{ display: 'inline-flex', alignItems: 'center', color: 'error.main' }}>
                      <Icon name="arrow_downward" size={16} label="Leeches" />
                      {t.leeches}
                    </Box>
                  </Stack>
                  <Actions compact torrent={t} state={copyStates[torrentKey(t)]} fileSince={fileStates[torrentKey(t)]} onCopy={onCopy} onOpen={onOpen} onDownloadFile={onDownloadFile} />
                </Stack>
              </Paper>
            ))}
      </Box>
    </>
  )
})

export function SourceChip({ info, id }: { info?: SourceInfo; id: string }) {
  return <Chip label={info?.name ?? id} size="small" sx={[{ height: 22, fontSize: 12 }, badgeColors(info?.badge)]} />
}

/** Category icon + title; the title opens the details dialog (a route, so it has its own URL) */
function Title({ torrent, lines = 1 }: { torrent: Torrent; lines?: number }) {
  const location = useLocation()
  const kind = kindInfo(torrent.kind)
  const preview: DetailsPreview = { title: torrent.title, kind: torrent.kind }
  const compat = torrent.compat
  const link = (
    <MuiLink
      component={RouterLink}
      to={{ pathname: detailsTo(torrent), search: location.search }}
      state={{ preview }}
      title={compat ? undefined : torrent.title}
      underline="hover"
      color="inherit"
      noWrap={lines === 1}
      sx={[
        { minWidth: 0, fontWeight: 500, '&:hover': { color: 'primary.main' } },
        lines > 1 && { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' },
        compatStyle(compat),
      ]}
    >
      {torrent.title}
    </MuiLink>
  )
  return (
    <Stack direction="row" sx={{ alignItems: lines > 1 ? 'flex-start' : 'center', gap: 1, minWidth: 0 }}>
      <Icon name={kind.icon} label={kind.label} size={20} sx={[kindColor(torrent.kind), lines > 1 && { mt: '1px' }]} />
      {compat ? (
        // The colour says it will play on a TV; what that means is explained in the
        // details, not repeated on every row someone is scanning
        <Box sx={{ minWidth: 0 }}>{link}</Box>
      ) : (
        link
      )}
    </Stack>
  )
}

interface ActionsProps {
  torrent: Torrent
  state?: CopyState
  /** Set while its .torrent file is being made: when it started */
  fileSince?: number
  onCopy: (torrent: Torrent) => void
  onOpen: (torrent: Torrent) => void
  onDownloadFile: (torrent: Torrent) => void
  /** Icon buttons only (cards) */
  compact?: boolean
}

const popIn = { animation: 'pop 280ms cubic-bezier(0.2, 0.7, 0.3, 1)' }
const spin = { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }

function Actions({ torrent, state, fileSince, onCopy, onOpen, onDownloadFile, compact = false }: ActionsProps) {
  const busy = state === 'loading'
  const copied = state === 'copied'
  const iconSize = compact ? 20 : 18
  return (
    <Stack direction="row" sx={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 0.25 : 0.5 }}>
      <Tooltip title={busy ? 'Fetching magnet…' : copied ? 'Copied' : 'Copy magnet link'}>
        <span>
          <IconButton
            disabled={busy}
            onClick={() => onCopy(torrent)}
            aria-label={`Copy magnet link for ${torrent.title}`}
            sx={{ color: copied ? 'success.main' : 'text.secondary' }}
          >
            {busy ? (
              <Icon name="progress_activity" size={iconSize} sx={spin} />
            ) : copied ? (
              <Icon name="check" size={iconSize} sx={popIn} />
            ) : (
              <MagnetIcon size={iconSize + 2} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <DownloadFileButton torrent={torrent} since={fileSince} disabled={busy} onDownloadFile={onDownloadFile} size={iconSize} />
      <Tooltip title="Open in torrent client">
        <span>
          <IconButton
            disabled={busy}
            onClick={() => onOpen(torrent)}
            aria-label={`Open ${torrent.title} in torrent client`}
            sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
          >
            <Icon name="arrow_outward" size={iconSize} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  )
}

/** Saves the torrent as a .torrent file (made from its magnet by magnet2torrent.com) */
export function DownloadFileButton({
  torrent,
  since,
  disabled = false,
  onDownloadFile,
  size = 18,
}: {
  torrent: Torrent
  since?: number
  disabled?: boolean
  onDownloadFile: (torrent: Torrent) => void
  size?: number
}) {
  const working = since !== undefined
  return (
    <Tooltip title={working ? 'Getting the .torrent file… rarely shared torrents can take a few minutes' : 'Download .torrent file'}>
      <span>
        <IconButton
          disabled={disabled}
          onClick={() => !working && onDownloadFile(torrent)}
          aria-label={working ? `Getting .torrent file for ${torrent.title}` : `Download .torrent file for ${torrent.title}`}
          aria-busy={working || undefined}
          sx={{ color: working ? 'primary.main' : 'text.secondary', '&:hover': { color: 'primary.main' } }}
        >
          <Icon name={working ? 'progress_activity' : 'download'} size={size} sx={working ? spin : undefined} />
        </IconButton>
      </span>
    </Tooltip>
  )
}
