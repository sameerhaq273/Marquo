import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useState, type ReactNode } from 'react'
import type { TorrentDetails } from '../lib/api'
import { proxied } from '../lib/images'
import { CompatBadge } from './CompatBadge'
import { kindColor, kindInfo } from '../lib/kinds'
import type { DetailsPreview } from '../lib/routes'
import type { SourceInfo } from '../lib/sources'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { MagnetIcon } from './MagnetIcon'
import { Poster } from './Poster'
import { SourceChip, type CopyState } from './ResultsTable'

const FILE_ICONS: Record<string, string> = {
  video: 'movie', audio: 'music_note', subtitle: 'subtitles', image: 'image', ebook: 'menu_book',
  archive: 'folder_zip', disc: 'album', executable: 'terminal', text: 'description', sample: 'movie',
  promo: 'campaign', other: 'draft',
}
const FILES_SHOWN = 20

interface Props {
  details: TorrentDetails | null
  preview?: DetailsPreview
  error: string
  source?: SourceInfo
  /** Demo data has no real site pages to link to */
  linkToSite: boolean
  copyState?: CopyState
  onClose: () => void
  onRetry: () => void
  onCopy: () => void
  onOpenClient: () => void
  onFindReleases: (title: string) => void
  /** Set while the .torrent file is being made */
  fileBusy: boolean
  onDownloadFile: () => void
}

export function DetailsDialog({
  details,
  preview,
  error,
  source,
  linkToSite,
  copyState,
  onClose,
  onRetry,
  onCopy,
  onOpenClient,
  onFindReleases,
  fileBusy,
  onDownloadFile,
}: Props) {
  const kindId = details?.kind ?? preview?.kind
  const kind = kindInfo(kindId)
  const busy = copyState === 'loading'
  const copied = copyState === 'copied'

  return (
    <Dialog
      wide
      onClose={onClose}
      title={details?.title ?? preview?.title ?? 'Torrent details'}
      icon={<Icon name={kind.icon} label={kind.label} size={22} sx={kindColor(kindId)} />}
      footer={(close) => (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto' }, gap: 1.5, width: { xs: 1, sm: 'auto' }, ml: 'auto' }}>
          <Button variant="outlined" color="inherit" onClick={() => close()} sx={{ borderColor: 'divider', height: { xs: 44, sm: 40 } }}>
            Close
          </Button>
          <Button
            variant={copied ? 'contained' : 'outlined'}
            color={copied ? 'success' : 'inherit'}
            disabled={!details?.magnet || busy}
            onClick={onCopy}
            startIcon={copied ? <Icon name="check" size={18} sx={{ animation: 'pop 280ms cubic-bezier(0.2, 0.7, 0.3, 1)' }} /> : <MagnetIcon size={20} />}
            sx={{ height: { xs: 44, sm: 40 }, px: 2.5, fontWeight: 600, ...(!copied && { borderColor: 'divider' }) }}
          >
            {copied ? 'Copied' : 'Copy magnet'}
          </Button>
        </Box>
      )}
    >
      {error ? (
        <Alert
          severity="error"
          icon={<Icon name="error" size={22} />}
          sx={{ my: 2.5 }}
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Couldn't load the details
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {error}
          </Typography>
        </Alert>
      ) : !details ? (
        <Loading />
      ) : (
        <Content
          details={details}
          source={source}
          linkToSite={linkToSite}
          busy={busy}
          onOpenClient={onOpenClient}
          onFindReleases={onFindReleases}
          fileBusy={fileBusy}
          onDownloadFile={onDownloadFile}
        />
      )}
    </Dialog>
  )
}

function Content({
  details,
  source,
  linkToSite,
  busy,
  onOpenClient,
  onFindReleases,
  fileBusy,
  onDownloadFile,
}: {
  details: TorrentDetails
  source?: SourceInfo
  linkToSite: boolean
  busy: boolean
  onOpenClient: () => void
  onFindReleases: (title: string) => void
  fileBusy: boolean
  onDownloadFile: () => void
}) {
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const [allFiles, setAllFiles] = useState(false)
  const [brokenShots, setBrokenShots] = useState<string[]>([])
  const screenshots = details.screenshots.filter((src) => !brokenShots.includes(src))
  const kind = kindInfo(details.kind)
  const meta = [kind.label, details.episode, details.year].filter(Boolean).join(' · ')
  const files = allFiles ? details.files.list : details.files.list.slice(0, FILES_SHOWN)

  return (
    <Stack spacing={3} sx={{ py: 2.5, animation: 'fade-in 220ms ease-out both' }}>
      {/* Poster + key facts */}
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { sm: '180px 1fr' } }}>
        <Poster
          sources={details.posters?.length ? details.posters : [details.poster]}
          kind={details.kind}
          loading="eager"
          sx={{ width: { xs: 144, sm: 1 }, borderRadius: 2 }}
        />
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1, color: 'text.secondary', typography: 'body2' }}>
            <SourceChip info={source} id={details.source} />
            <span>{meta}</span>
          </Stack>
          <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: 'text.secondary', wordBreak: 'break-all' }}>
            {details.release}
          </Typography>
          {(details.badges.length > 0 || details.compat) && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {details.compat && <CompatBadge compat={details.compat} explain />}
              {details.badges.map((b, i) => (
                <Chip
                  key={b}
                  label={b}
                  size="small"
                  color={i === 0 ? 'secondary' : 'default'}
                  sx={{ height: 22, borderRadius: 1, fontSize: 12, fontWeight: 600 }}
                />
              ))}
            </Stack>
          )}
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, columnGap: 2, rowGap: 1 }}>
            {details.facts.map((f) => (
              <Box key={f.label} sx={{ minWidth: 0 }}>
                <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
                  {f.label}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  noWrap
                  title={f.value}
                  sx={{
                    m: 0,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: f.label === 'Seeds' ? 'success.main' : f.label === 'Leeches' ? 'error.main' : 'text.primary',
                  }}
                >
                  {f.value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1, pt: 0.5 }}>
            <Action phone={phone} icon="travel_explore" label="Find other releases" onClick={() => onFindReleases(details.title)} />
            <Action phone={phone} icon="arrow_outward" label="Open in torrent client" onClick={onOpenClient} disabled={!details.magnet || busy} />
            <Action
              phone={phone}
              icon="download"
              label={fileBusy ? 'Getting .torrent file…' : 'Download .torrent'}
              onClick={onDownloadFile}
              disabled={!details.magnet || busy || fileBusy}
              working={fileBusy}
            />
            {linkToSite && (
              <Action phone={phone} icon="open_in_new" label={`Open on ${new URL(details.link).hostname.replace(/^www\./, '')}`} href={details.link} />
            )}
            {details.links.map((l) => (
              <ExternalLink key={l.url} href={l.url} label={l.label} />
            ))}
          </Stack>
        </Stack>
      </Box>

      {details.notices?.length > 0 && (
        <Alert severity="info" icon={<Icon name="info" />}>
          {details.notices.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </Alert>
      )}

      {details.warnings.length > 0 && (
        <Alert severity="warning" icon={<Icon name="warning" />}>
          {details.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Alert>
      )}

      {details.summary && (
        <Box component="section">
          <Heading icon="info">Overview</Heading>
          <Typography variant="body2" sx={{ lineHeight: 1.7, whiteSpace: 'pre-line', textWrap: 'pretty' }}>
            {details.summary}
          </Typography>
        </Box>
      )}

      {details.sections.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }}>
          {details.sections.map((s) => (
            <Paper key={s.id} component="section" sx={{ p: 2, borderRadius: 4, bgcolor: 'sunken' }}>
              <Heading icon={s.icon}>{s.title}</Heading>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', columnGap: 2, rowGap: 0.75, typography: 'body2' }}>
                {s.items.map((item) => (
                  <Box key={item.label} sx={{ display: 'contents' }}>
                    <Box component="dt" sx={{ color: 'text.secondary' }}>
                      {item.label}
                    </Box>
                    <Box component="dd" sx={{ m: 0, minWidth: 0, wordBreak: 'break-word' }}>
                      {item.value}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {screenshots.length > 0 && (
        <Box component="section">
          <Heading icon="image">Screenshots</Heading>
          <Stack direction="row" sx={{ gap: 1, overflowX: 'auto', mx: -0.5, px: 0.5, pb: 0.5 }}>
            {screenshots.map((src) => (
              <Box
                key={src}
                component="a"
                href={proxied(src) ?? src}
                target="_blank"
                rel="noreferrer noopener"
                sx={{ flexShrink: 0, overflow: 'hidden', borderRadius: 2, border: 1, borderColor: 'divider', display: 'block' }}
              >
                {/* Old uploads often point at image hosts that no longer exist: drop those */}
                <Box
                  component="img"
                  src={proxied(src) ?? src}
                  alt="Screenshot"
                  loading="lazy"
                  onError={() => setBrokenShots((b) => [...b, src])}
                  sx={{ display: 'block', height: 112, width: 'auto', maxWidth: 'none', objectFit: 'cover' }}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {details.files.total > 0 && (
        <Box component="section">
          <Heading icon="folder_zip">
            Files{' '}
            <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
              ({details.files.total})
            </Box>
          </Heading>
          <Stack direction="row" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
            {details.files.groups.map((g) => (
              <Chip
                key={g.type}
                size="small"
                icon={<Icon name={FILE_ICONS[g.type] ?? 'draft'} size={14} />}
                label={`${g.label} · ${g.count}${g.size ? ` · ${g.size}` : ''}`}
                sx={{ fontSize: 12, '& .MuiChip-icon': { ml: 1 } }}
              />
            ))}
          </Stack>
          <Paper sx={{ borderRadius: 3, bgcolor: 'sunken' }}>
            <List dense disablePadding>
              {files.map((f, i) => (
                <ListItem key={`${f.name}-${i}`} divider={i < files.length - 1} sx={{ gap: 1, py: 1 }}>
                  <Icon name={FILE_ICONS[f.type] ?? 'draft'} size={18} sx={{ color: 'text.disabled' }} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
                    {f.name}
                  </Typography>
                  {f.size && (
                    <Typography variant="caption" sx={{ flexShrink: 0, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                      {f.size}
                    </Typography>
                  )}
                </ListItem>
              ))}
            </List>
          </Paper>
          {details.files.list.length > FILES_SHOWN && (
            <Button size="small" onClick={() => setAllFiles((v) => !v)} sx={{ mt: 1, px: 1, ml: -1 }}>
              {allFiles ? 'Show fewer files' : `Show all ${details.files.list.length} files`}
            </Button>
          )}
          {details.files.truncated && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
              Only the first {details.files.list.length} files are listed.
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  )
}

function Heading({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Typography component="h3" variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}>
      <Icon name={icon} size={18} sx={{ color: 'primary.main' }} />
      {children}
    </Typography>
  )
}

const spin = { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }

/** Outlined text button on desktop, icon button (with a tooltip) on phones */
function Action({
  phone,
  icon,
  label,
  onClick,
  href,
  disabled = false,
  working = false,
}: {
  phone: boolean
  icon: string
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  working?: boolean
}) {
  const glyph = <Icon name={working ? 'progress_activity' : icon} size={phone ? 22 : 18} sx={working ? spin : undefined} />
  const link = href ? { component: 'a' as const, href, target: '_blank', rel: 'noreferrer noopener' } : {}
  if (phone) {
    return (
      <Tooltip title={label}>
        <span>
          <IconButton
            {...link}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-busy={working || undefined}
            sx={{ width: 44, height: 44, border: 1, borderColor: 'divider', color: working ? 'primary.main' : 'text.secondary' }}
          >
            {glyph}
          </IconButton>
        </span>
      </Tooltip>
    )
  }
  return (
    <Button {...link} size="small" variant="outlined" color="inherit" onClick={onClick} disabled={disabled} startIcon={glyph} sx={{ borderColor: 'divider', fontWeight: 500 }}>
      {label}
    </Button>
  )
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <Button
      size="small"
      component="a"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      endIcon={<Icon name="open_in_new" size={16} />}
      sx={{ fontWeight: 500 }}
    >
      {label}
    </Button>
  )
}

function Loading() {
  return (
    <Box aria-busy="true" aria-label="Loading details" sx={{ display: 'grid', gap: 2.5, py: 2.5, gridTemplateColumns: { sm: '180px 1fr' } }}>
      <Skeleton variant="rounded" sx={{ width: { xs: 144, sm: 1 }, height: 'auto', aspectRatio: '2 / 3' }} />
      <Stack spacing={1.5}>
        <Skeleton width="33%" />
        <Skeleton width="66%" />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={36} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={96} />
      </Stack>
    </Box>
  )
}
