import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import { useId } from 'react'
import { DISPLAY_FONT } from '../theme'

/**
 * Marquo's mark: a cinema marquee. A rounded sign board with a play triangle on it and the
 * bulb row hanging underneath, on a tile in the app orange.
 *
 * Drawn here rather than shipped as a file so it follows the theme and stays sharp at any
 * size; `public/favicon.svg` is the same drawing, flattened for the browser tab.
 * At 16px the bulbs read as a texture under the board, which is what keeps it from looking
 * like every other play-button logo.
 */
export function LogoMark({ size = 32, sx }: { size?: number; sx?: SxProps<Theme> }) {
  // Several marks can be on screen at once (header and banner), so the gradients need their own ids
  const id = useId().replace(/:/g, '')
  const tile = `tile-${id}`
  const glow = `glow-${id}`

  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      aria-hidden
      sx={[{ width: size, height: size, flexShrink: 0, display: 'block' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <defs>
        {/* Bulb glow: warm amber at the top falling into the brand orange */}
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="0.55" stopColor="#ea580c" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.95" r="0.6">
          <stop offset="0" stopColor="#fed7aa" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fed7aa" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" rx="14" fill={`url(#${tile})`} />
      {/* The light the bulbs throw back up onto the tile */}
      <rect width="64" height="64" rx="14" fill={`url(#${glow})`} />

      {/* Sign board. Solid rather than outlined: a stroke this size thins to mush in a 16px tab */}
      <rect x="10" y="11" width="44" height="31" rx="8" fill="#fff" />
      {/* Play triangle knocked out of the board, optically centred rather than measured */}
      <path d="M27.5 19.4 L42 26.5 L27.5 33.6 Z" fill="#ea580c" />

      {/* Bulb row */}
      <g fill="#fff">
        <circle cx="18" cy="51.5" r="4" />
        <circle cx="32" cy="51.5" r="4" />
        <circle cx="46" cy="51.5" r="4" />
      </g>
    </Box>
  )
}

/** The mark plus the name, for the header and the home banner */
export function Logo({ size = 28, fontSize = 18, sx }: { size?: number; fontSize?: number; sx?: SxProps<Theme> }) {
  return (
    <Box sx={[{ display: 'flex', alignItems: 'center', gap: 1 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <LogoMark size={size} />
      <Box
        component="span"
        sx={{
          fontFamily: DISPLAY_FONT,
          fontSize,
          fontWeight: 700,
          // The name is short, so it can afford to sit a little tighter than body text
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: 'text.primary',
        }}
      >
        Marquo
      </Box>
    </Box>
  )
}
