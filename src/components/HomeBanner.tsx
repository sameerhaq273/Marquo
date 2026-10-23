import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Source } from '../lib/api'
import { DISPLAY_FONT } from '../theme'
import { LogoMark } from './Logo'

/**
 * The marquee over the home screen: the mark, the name and what the app does, on a dark
 * board lit from below by its own bulb row.
 *
 * Dark in both schemes on purpose - a marquee is a thing you see lit at night, and it keeps
 * the featured posters underneath as the only colour competing for attention.
 */
export function HomeBanner({ sources }: { sources: Source[] }) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        px: { xs: 2.5, sm: 4 },
        py: { xs: 3, sm: 4 },
        color: 'common.white',
        background: 'linear-gradient(160deg, #27272a 0%, #18181b 55%, #09090b 100%)',
        animation: 'fade-up 320ms cubic-bezier(0.2, 0, 0, 1) both',
      }}
    >
      {/* The glow the bulbs throw across the board */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 90% at 12% 115%, rgba(234, 88, 12, 0.5) 0%, rgba(234, 88, 12, 0) 60%)',
          pointerEvents: 'none',
        }}
      />
      {/* Bulb row along the bottom edge, the way a real marquee is lit */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'repeating-linear-gradient(90deg, #fdba74 0 7px, rgba(253, 186, 116, 0.12) 7px 18px)',
        }}
      />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ position: 'relative', alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 2, sm: 2.5 } }}
      >
        <LogoMark size={56} sx={{ boxShadow: '0 10px 30px rgba(234, 88, 12, 0.45)', borderRadius: 3.5 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{ fontFamily: DISPLAY_FONT, fontSize: { xs: 30, sm: 38 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}
          >
            Marquo
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: { xs: 14, sm: 16 }, color: 'rgba(255, 255, 255, 0.78)' }}>
            One search. Every site. Magnet links, posters and the full release details, merged into one list.
          </Typography>
          {sources.length > 0 && (
            <Stack direction="row" sx={{ mt: 1.75, flexWrap: 'wrap', gap: 0.75 }}>
              {sources.map((s) => (
                <Box
                  key={s.id}
                  component="span"
                  sx={{
                    px: 1.25,
                    py: 0.375,
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {s.name}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  )
}
