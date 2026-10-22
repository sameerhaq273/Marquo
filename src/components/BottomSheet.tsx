import Box from '@mui/material/Box'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** id of the sheet's heading */
  labelledBy?: string
  /** Accessible name when there's no heading */
  label?: string
  /** Called once the slide-down has finished */
  onExited?: () => void
}

const noop = () => {}

// Slides up a touch slower than it leaves, like iOS sheets
const SLIDE = { enter: 280, exit: 200 }

/** Phone bottom drawer: grab handle, rounded top, content height up to 90% of the screen; swipe down to close. */
export function BottomSheet({ open, onClose, children, labelledBy, label, onExited }: Props) {
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={noop}
      disableSwipeToOpen
      disableDiscovery
      transitionDuration={SLIDE}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': labelledBy,
          'aria-label': labelledBy ? undefined : label,
          sx: { maxHeight: '90dvh', display: 'flex', flexDirection: 'column', borderRadius: '16px 16px 0 0', backgroundImage: 'none' },
        },
        transition: { appear: true, easing: { enter: 'cubic-bezier(0.32, 0.72, 0, 1)', exit: 'cubic-bezier(0.4, 0, 1, 1)' }, onExited },
      }}
    >
      {/* Grab handle */}
      <Box aria-hidden sx={{ flexShrink: 0, display: 'flex', justifyContent: 'center', pt: 1, pb: 1.25 }}>
        <Box sx={{ width: 36, height: 5, borderRadius: 3, bgcolor: 'divider' }} />
      </Box>
      {children}
    </SwipeableDrawer>
  )
}
