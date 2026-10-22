import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Horseshoe magnet in its own colours (red body, silver poles), outlined two-tone like the
 * Material Symbols set: a solid outline over a light fill. Tilted so it can't read as a "U".
 * Material Symbols has no magnet, so it's drawn here.
 */
export function MagnetIcon({ size = 20, sx }: { size?: number; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          '--magnet-body': '#dc2626',
          '--magnet-pole': '#71717a',
          '@media (prefers-color-scheme: dark)': { '--magnet-body': '#f87171', '--magnet-pole': '#a1a1aa' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <g transform="rotate(45 12 12) translate(12 12) scale(0.92) translate(-12 -11.75)" strokeWidth={1.6} strokeLinejoin="round">
        {/* Body */}
        <path
          d="M5 8v5a7 7 0 0 0 14 0V8h-4v5a3 3 0 0 1-6 0V8z"
          fill="var(--magnet-body)"
          fillOpacity={0.22}
          stroke="var(--magnet-body)"
        />
        {/* Poles */}
        <rect x="5" y="3.5" width="4" height="4.5" rx="0.6" fill="var(--magnet-pole)" fillOpacity={0.3} stroke="var(--magnet-pole)" />
        <rect x="15" y="3.5" width="4" height="4.5" rx="0.6" fill="var(--magnet-pole)" fillOpacity={0.3} stroke="var(--magnet-pole)" />
      </g>
    </Box>
  )
}
