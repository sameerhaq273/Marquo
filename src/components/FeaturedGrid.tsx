import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getFeatured, type FeaturedItem, type Torrent } from '../lib/api'
import { compatStyle } from '../lib/compat'
import { kindColor, kindInfo } from '../lib/kinds'
import { detailsTo, type DetailsPreview } from '../lib/routes'
import { isSensitive } from '../lib/sensitive'
import { elevation } from '../theme'
import { featuredToTorrent, torrentKey } from '../lib/sources'
import { Icon } from './Icon'
import { MagnetIcon } from './MagnetIcon'
import { Poster } from './Poster'
import type { CopyState } from './ResultsTable'

const SECTIONS = [
  { kind: 'movie', title: 'Featured movies', icon: 'movie', limit: 12 },
  { kind: 'tv', title: 'Popular TV shows', icon: 'tv', limit: 12 },
]

// 2 / 3 / 4 / 6 cards per row
const CARD_SIZE = { xs: 6, sm: 4, md: 3, xl: 2 }

interface Props {
  copyStates: Record<string, CopyState>
  onCopy: (torrent: Torrent) => void
  /** The Filters dialog's sensitive filter; cards follow it like search results do */
  safeSearch: boolean
}

export function FeaturedGrid({ copyStates, onCopy, safeSearch }: Props) {
  const [items, setItems] = useState<FeaturedItem[] | null>(null)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getFeatured().then(
      (data) => {
        if (cancelled) return
        setItems(data.items)
        setNotices(data.notices ?? [])
      },
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load featured torrents'),
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error) {
    return (
      <Alert
        severity="error"
        icon={<Icon name="error" />}
        sx={{ m: { xs: 2, sm: 3 } }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setError('')
              setItems(null)
              setAttempt((a) => a + 1)
            }}
          >
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    )
  }

  return (
    <Stack spacing={4} sx={{ p: { xs: 2, sm: 3 } }}>
      {notices.length > 0 && (
        <Alert severity="info" icon={<Icon name="info" />}>
          {notices.join(' ')}
        </Alert>
      )}
      {SECTIONS.map((section, sectionIndex) => {
        const first = sectionIndex === 0
        const list = items
          ?.filter((i) => i.kind === section.kind && !(safeSearch && isSensitive(i)))
          .slice(0, section.limit)
        if (list && list.length === 0) return null
        return (
          <Box component="section" key={section.kind} aria-labelledby={`featured-${section.kind}`}>
            <Stack direction="row" sx={{ mb: 1.5, alignItems: 'center', gap: 1 }}>
              <Icon name={section.icon} size={22} sx={{ color: 'primary.main' }} />
              <Typography id={`featured-${section.kind}`} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
                {section.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                on 1337x right now
              </Typography>
            </Stack>
            <Grid container spacing={2} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {list
                ? list.map((item, i) => {
                    const torrent = featuredToTorrent(item)
                    return (
                      <Grid key={torrentKey(torrent)} size={CARD_SIZE} component="li">
                        <FeaturedCard
                          item={item}
                          copyState={copyStates[torrentKey(torrent)]}
                          onCopy={() => onCopy(torrent)}
                          // Widest row is 6 cards; those are the ones above the fold
                          priority={first && i < 6}
                        />
                      </Grid>
                    )
                  })
                : Array.from({ length: section.limit }, (_, i) => (
                    <Grid key={i} size={CARD_SIZE} component="li">
                      <SkeletonCard />
                    </Grid>
                  ))}
            </Grid>
          </Box>
        )
      })}
    </Stack>
  )
}

function FeaturedCard({
  item,
  copyState,
  onCopy,
  priority = false,
}: {
  item: FeaturedItem
  copyState?: CopyState
  onCopy: () => void
  /** Above the fold: fetched eagerly, since one of these is the page's LCP element */
  priority?: boolean
}) {
  const kind = kindInfo(item.kind)
  const busy = copyState === 'loading'
  const copied = copyState === 'copied'
  const preview: DetailsPreview = { title: item.release, kind: item.kind }
  const meta = [item.episode, item.year].filter(Boolean).join(' · ')

  return (
    <Card
      sx={{
        height: 1,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fade-up 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both',
        transition: 'box-shadow 200ms, transform 200ms cubic-bezier(0.2, 0, 0, 1)',
        '@media (hover: hover)': { '&:hover': { boxShadow: elevation.raised, transform: 'translateY(-2px)' } },
      }}
    >
      <CardActionArea component={Link} to={detailsTo(item)} state={{ preview }} title={item.release} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <Box sx={{ position: 'relative' }}>
          <Poster
            sources={item.images?.length ? item.images : [item.image]}
            kind={item.kind}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
          />
          <Stack direction="row" sx={{ position: 'absolute', top: 8, left: 8, right: 8, flexWrap: 'wrap', gap: 0.5 }}>
            {item.print && <Chip label={item.print} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 600, borderRadius: 1, bgcolor: 'rgb(9 9 11 / 0.8)', color: '#fff' }} />}
            {item.resolution && <Chip label={item.resolution} size="small" color="primary" sx={{ height: 20, fontSize: 11, fontWeight: 600, borderRadius: 1 }} />}
          </Stack>
        </Box>
        <CardContent sx={{ flex: 1, p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Icon name={kind.icon} label={kind.label} size={18} sx={kindColor(item.kind)} />
            <Typography
              variant="body2"
              noWrap
              sx={[{ fontWeight: 600 }, compatStyle(item.compat)]}
            >
              {item.title}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ mt: 0.5, flexWrap: 'wrap', columnGap: 1, color: 'text.secondary', typography: 'caption', fontVariantNumeric: 'tabular-nums' }}>
            {meta && <span>{meta}</span>}
            <span>{item.size}</span>
            <Box component="span" sx={{ color: 'success.main', fontWeight: 500 }}>
              {item.seeds} seeds
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
      <CardActions sx={{ px: 1.5, pb: 1.5, pt: 0 }}>
        <Button
          fullWidth
          variant={copied ? 'contained' : 'outlined'}
          color={copied ? 'success' : 'inherit'}
          size="small"
          disabled={busy}
          onClick={onCopy}
          aria-label={`Copy magnet link for ${item.release}`}
          startIcon={busy ? <Icon name="progress_activity" size={18} /> : copied ? <Icon name="check" size={18} sx={{ animation: 'pop 280ms cubic-bezier(0.2, 0.7, 0.3, 1)' }} /> : <MagnetIcon size={20} />}
          sx={{ height: 36, fontWeight: 500, ...(!copied && { borderColor: 'divider' }) }}
        >
          {busy ? 'Fetching…' : copied ? 'Copied' : 'Copy magnet'}
        </Button>
      </CardActions>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card>
      <Skeleton variant="rectangular" sx={{ aspectRatio: '2 / 3', height: 'auto' }} />
      <Box sx={{ p: 1.5 }}>
        <Skeleton width="75%" />
        <Skeleton width="50%" />
        <Skeleton variant="rounded" height={36} sx={{ mt: 1 }} />
      </Box>
    </Card>
  )
}
