import Box from '@mui/material/Box'
import MuiDialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'

/** Plays the closing animation, then runs `after` (or the dialog's onClose) */
export type CloseDialog = (after?: () => void) => void

interface Props {
  /** Called once the closing animation has finished; the parent then unmounts the dialog */
  onClose: () => void
  title: string
  icon: ReactNode
  children: ReactNode
  /** A function gets `close`, for buttons that should animate the dialog out */
  footer: ReactNode | ((close: CloseDialog) => ReactNode)
  /** Wider on desktop, for content-heavy dialogs like torrent details */
  wide?: boolean
}

// Quick: in fast, out faster
const FADE = { enter: 200, exit: 150 }

/**
 * Fades in as a centered dialog on desktop; slides up as a bottom drawer on phones (swipe down
 * to close). Parents mount it to open it: closing first animates out, then calls onClose.
 */
export function Dialog({ onClose, title, icon, children, footer, wide = false }: Props) {
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const titleId = useId()
  const [open, setOpen] = useState(true)
  // What to run once the closing animation ends (null: onClose)
  const [afterClose, setAfterClose] = useState<{ run: () => void } | null>(null)
  const latestOnClose = useRef(onClose)
  useEffect(() => {
    latestOnClose.current = onClose
  })

  const close = useCallback<CloseDialog>((after) => {
    setAfterClose(after ? { run: after } : null)
    setOpen(false)
  }, [])
  const exited = () => (afterClose ? afterClose.run() : latestOnClose.current())
  const dismiss = () => close()

  const header = (
    <>
      <Box sx={{ display: 'flex', color: 'text.secondary' }}>{icon}</Box>
      <Box
        component="h2"
        id={titleId}
        sx={{ m: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', typography: 'subtitle1', fontWeight: 600 }}
      >
        {title}
      </Box>
      <IconButton onClick={dismiss} aria-label="Close" sx={{ color: 'text.secondary' }}>
        <Icon name="close" size={22} />
      </IconButton>
    </>
  )
  const footerContent = typeof footer === 'function' ? footer(close) : footer

  if (phone) {
    return (
      <BottomSheet open={open} onClose={dismiss} onExited={exited} labelledBy={titleId}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, pl: 2, pr: 1 }}>{header}</Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 2, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          {children}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, px: 2, pt: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>{footerContent}</Box>
      </BottomSheet>
    )
  }

  return (
    <MuiDialog
      open={open}
      onClose={dismiss}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={wide ? 'md' : 'sm'}
      transitionDuration={FADE}
      slotProps={{
        paper: { sx: { maxHeight: '85dvh', maxWidth: wide ? 896 : 512 } },
        transition: { onExited: exited },
      }}
    >
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, pl: 2.5, pr: 1.5 }}>
        {header}
      </DialogTitle>
      <DialogContent dividers sx={{ px: 2.5, py: 0 }}>
        {children}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 2, gap: 1.5, '& > :not(style) ~ :not(style)': { ml: 0 } }}>{footerContent}</DialogActions>
    </MuiDialog>
  )
}
