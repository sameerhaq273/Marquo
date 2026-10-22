import type { Theme } from '@mui/material/styles'
import type { Compat } from './api'

/** Name color for a smart-TV rating (theme palette.compat, light / dark); bolder for better tiers */
export const compatStyle = (compat: Compat | null | undefined) => (theme: Theme) =>
  compat
    ? {
        color: (theme.vars ?? theme).palette.compat[compat.tier],
        fontWeight: compat.tier === 'best' ? 700 : 600,
      }
    : {}

/**
 * The badge text: short enough to sit beside a title without crowding it. The whole
 * explanation lives behind the info control rather than on the screen.
 */
export const COMPAT_LABEL = 'Smart TV compatible'

/** The full wording, shown only when the info control is used */
export const compatTooltip = (compat: Compat) =>
  `${compat.label}: ${compat.reason}${compat.checked === 'name' ? ' (from the name)' : ''}`
