import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Material Symbols Rounded, outlined (FILL 0); the `.icon` class is styled in the theme.
 * The font is loaded in index.html with only the icons we use (icon_names=...);
 * add a new icon's name there too or it renders as text.
 */
interface Props {
  name: string
  size?: number
  sx?: SxProps<Theme>
  className?: string
  /** Set for icons that carry meaning on their own; otherwise hidden from screen readers */
  label?: string
}

export function Icon({ name, size = 20, sx, className = '', label }: Props) {
  return (
    <Box
      component="span"
      className={`icon ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      title={label}
      sx={[{ fontSize: size }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {name}
    </Box>
  )
}
