import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useState } from 'react'
import type { Compat } from '../lib/api'
import { COMPAT_LABEL, compatTooltip } from '../lib/compat'
import { Icon } from './Icon'

/**
 * "Smart TV compatible", with the reasoning behind an info button.
 *
 * The rating has a lot to say - which audio, which video, how big, and whether it was read
 * from the name or the details - and none of that belongs on a row someone is scanning.
 * The badge states the conclusion; the button is there when the conclusion is doubted.
 *
 * Only the details dialog carries the info button. On a result row the conclusion is
 * enough, and an explanation popping out of a list someone is scanning is noise.
 *
 * Where it does appear it opens on click as well as hover, because a tooltip that only
 * opens on hover does nothing at all on a touch screen.
 */
export function CompatBadge({
  compat,
  size = 'small',
  explain = false,
}: {
  compat: Compat
  size?: 'small' | 'tiny'
  /** Only the details dialog explains itself; a row just states the conclusion */
  explain?: boolean
}) {
  const [open, setOpen] = useState(false)
  const tiny = size === 'tiny'

  return (
    <Box
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: (t) => (t.vars ?? t).palette.compat[compat.tier] }}
    >
      <Box component="span" sx={{ fontSize: tiny ? 11 : 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {COMPAT_LABEL}
      </Box>
      {explain && (
        <Tooltip
          title={compatTooltip(compat)}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          enterTouchDelay={0}
        >
          <IconButton
            size="small"
            aria-label={`Why: ${compatTooltip(compat)}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            sx={{ p: 0.25, color: 'inherit' }}
          >
            <Icon name="info" size={tiny ? 13 : 15} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
