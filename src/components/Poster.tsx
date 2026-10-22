import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import { useState } from 'react'
import { proxied } from '../lib/images'
import { kindInfo } from '../lib/kinds'
import { Icon } from './Icon'

interface Props {
  /** Candidate pictures, best first; the next one is tried if one fails to load */
  sources: (string | null | undefined)[]
  kind?: string
  sx?: SxProps<Theme>
  /** Image loading hint; cards below the fold use lazy */
  loading?: 'lazy' | 'eager'
  /**
   * The first row of cards is the largest thing painted above the fold, so it is the LCP
   * element. `high` asks the browser to fetch it before the lazy ones queued behind it.
   */
  fetchPriority?: 'high' | 'auto' | 'low'
}

/**
 * Whole image (contain), never cropped, on top of a blurred, zoomed copy of itself
 * so banners and small thumbnails still fill the frame. Falls back to the category icon.
 */
export function Poster({ sources, kind, sx, loading = 'lazy', fetchPriority = 'auto' }: Props) {
  const candidates = [...new Set(sources.filter((s): s is string => Boolean(s)))]
  const [failed, setFailed] = useState(0)
  const src = proxied(candidates[failed])

  return (
    <Box
      sx={[
        { position: 'relative', overflow: 'hidden', bgcolor: 'action.hover', aspectRatio: '2 / 3', width: '100%' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {src ? (
        <>
          <Box
            component="img"
            src={src}
            alt=""
            aria-hidden
            loading={loading}
            sx={{ position: 'absolute', inset: 0, width: 1, height: 1, objectFit: 'cover', transform: 'scale(1.25)', filter: 'blur(24px)', opacity: 0.7 }}
          />
          <Box
            component="img"
            key={src}
            src={src}
            alt=""
            loading={loading}
            fetchPriority={fetchPriority}
            onError={() => setFailed((n) => n + 1)}
            sx={{ position: 'relative', display: 'block', width: 1, height: 1, objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.15))' }}
          />
        </>
      ) : (
        <Box sx={{ display: 'grid', placeItems: 'center', width: 1, height: 1, color: 'text.disabled' }}>
          <Icon name={kindInfo(kind).icon} size={48} />
        </Box>
      )}
    </Box>
  )
}
