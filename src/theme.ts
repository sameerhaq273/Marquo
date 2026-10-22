import { createTheme } from '@mui/material/styles'

/**
 * All styling lives here: brand, neutrals, typography, shape, component defaults, and the
 * light / dark color schemes (picked from the system setting through CSS variables).
 */

// Neutral scale (zinc) and brand (orange)
const grey = {
  50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa',
  500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#09090b',
}

/**
 * Radius, one step tighter than the raw scale, so corners read as crisp rather than soft.
 * Every radius in the app comes from here instead of a number typed into a component.
 */
export const radius = { xs: 4, sm: 5, md: 7, lg: 8, xl: 10, '2xl': 12, '3xl': 16, '4xl': 20, full: 999 }

/**
 * One control scale. A button, an icon button and a field of the same size share a height
 * **and** a radius, so they sit on one row without anything looking a pixel out.
 */
export const control = {
  sm: { height: 32, radius: radius.lg },
  md: { height: 40, radius: radius.xl },
  lg: { height: 48, radius: radius['2xl'] },
}

/**
 * Elevation does the work that borders used to.
 *
 * Surfaces are told apart by fill and shadow, never by an outline: a screen of bordered
 * boxes reads as a grid of cages and the eye has to process every line before any content.
 * So the shadow has to be visible at a glance, not a hairline nobody notices. A border is
 * allowed only where it is a control's own affordance - a field outline, a checkbox box -
 * never to fence off a region.
 *
 * Dark mode drops the card shadow: a soft shadow does not read on near-black, so the
 * paper fill separates the card instead.
 */
const shade = (alpha: number) => `rgb(24 24 27 / ${alpha})`
export const elevation = {
  card: `0 1px 2px 0 ${shade(0.04)}, 0 6px 16px -6px ${shade(0.12)}`,
  raised: `0 2px 4px 0 ${shade(0.05)}, 0 12px 24px -8px ${shade(0.18)}`,
  pop: `0 8px 16px -4px ${shade(0.1)}, 0 24px 48px -12px ${shade(0.26)}`,
  dialog: `0 32px 64px -16px ${shade(0.32)}`,
}

// Category icon colors; red is reserved for Adult (18+)
const kindLight = {
  movie: '#0284c7', tv: '#7c3aed', game: '#059669', app: '#1d4ed8',
  book: '#d97706', music: '#c026d3', adult: '#dc2626', other: grey[500],
}
const kindDark = {
  movie: '#38bdf8', tv: '#a78bfa', game: '#34d399', app: '#60a5fa',
  book: '#fbbf24', music: '#e879f9', adult: '#ef4444', other: grey[400],
}

// Smart-TV rating shades (strongest = best)
const compatLight = { best: '#15803d', recommended: '#16a34a', safe: '#4d7c0f', ok: '#65a30d' }
const compatDark = { best: '#4ade80', recommended: '#86efac', safe: '#a3e635', ok: '#d9f99d' }

// Source badges, handed out by a site's position in /api/config
const badgesLight = [
  { bg: '#ffedd5', fg: '#9a3412' }, { bg: '#e0f2fe', fg: '#075985' }, { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#d1fae5', fg: '#065f46' }, { bg: '#ffe4e6', fg: '#9f1239' }, { bg: '#fef3c7', fg: '#78350f' },
]
const badgesDark = [
  { bg: '#431407', fg: '#fdba74' }, { bg: '#082f49', fg: '#7dd3fc' }, { bg: '#2e1065', fg: '#c4b5fd' },
  { bg: '#022c22', fg: '#6ee7b7' }, { bg: '#4c0519', fg: '#fda4af' }, { bg: '#451a03', fg: '#fcd34d' },
]

declare module '@mui/material/styles' {
  interface Palette {
    kind: typeof kindLight
    badges: typeof badgesLight
    compat: typeof compatLight
    /** A recess inside a card: the step *below* paper, for nested panels and code blocks */
    sunken: string
  }
  interface PaletteOptions {
    kind?: typeof kindLight
    badges?: typeof badgesLight
    compat?: typeof compatLight
    sunken?: string
  }
  interface Theme {
    elevation: typeof elevation
    control: typeof control
    radius: typeof radius
  }
  interface ThemeOptions {
    elevation?: typeof elevation
    control?: typeof control
    radius?: typeof radius
  }
}

const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
/** Body text; loaded in index.html with display=swap */
export const BODY_FONT = `"Plus Jakarta Sans", ${SYSTEM_STACK}`
/** Headings and the wordmark */
export const DISPLAY_FONT = `"Outfit", ${SYSTEM_STACK}`

/** Buttons dip slightly while pressed */
const PRESS = 'transform 120ms cubic-bezier(0.2, 0, 0, 1)'

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  // Same widths the layout was designed with
  breakpoints: { values: { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280 } },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#ea580c', dark: '#c2410c', light: '#fb923c', contrastText: '#fff' },
        secondary: { main: grey[900], contrastText: '#fff' },
        success: { main: '#047857' },
        error: { main: '#be123c' },
        warning: { main: '#b45309' },
        info: { main: '#0369a1' },
        grey,
        background: { default: grey[50], paper: '#fff' },
        sunken: grey[100],
        text: { primary: grey[900], secondary: grey[600], disabled: grey[400] },
        divider: grey[200],
        kind: kindLight,
        badges: badgesLight,
        compat: compatLight,
      },
    },
    dark: {
      palette: {
        primary: { main: '#f97316', dark: '#ea580c', light: '#fdba74', contrastText: '#fff' },
        secondary: { main: grey[100], contrastText: grey[900] },
        success: { main: '#34d399' },
        error: { main: '#fb7185' },
        warning: { main: '#fbbf24' },
        info: { main: '#38bdf8' },
        grey,
        background: { default: grey[950], paper: grey[900] },
        sunken: grey[800],
        text: { primary: grey[100], secondary: grey[400], disabled: grey[600] },
        divider: grey[800],
        kind: kindDark,
        badges: badgesDark,
        compat: compatDark,
      },
    },
  },
  shape: { borderRadius: radius.md },
  elevation,
  control,
  radius,
  typography: {
    // Body: Plus Jakarta Sans. The fallback is the system UI font, which is close enough in
    // width that the webfont swapping in doesn't move the layout (CLS).
    fontFamily: BODY_FONT,
    fontSize: 14,
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.6 },
    // Display: Outfit, on headings and the wordmark only. Tighter tracking, since it is
    // being set large and Outfit's default spacing reads loose above ~24px.
    h1: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.03em' },
    h2: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.02em' },
    h4: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.015em' },
    h6: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.015em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased' },
        // Microanimations: items easing in, the "copied" tick popping
        '@keyframes fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        '@keyframes fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        '@keyframes pop': { '0%': { opacity: 0, transform: 'scale(0.4)' }, '60%': { opacity: 1, transform: 'scale(1.15)' }, '100%': { transform: 'none' } },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
          '[data-animate]': { animation: 'none !important' },
        },
        // Material Symbols Rounded, outlined (FILL 0); loaded in index.html
        '.icon': {
          fontFamily: '"Material Symbols Rounded"',
          fontWeight: 'normal',
          fontStyle: 'normal',
          lineHeight: 1,
          width: '1em',
          height: '1em',
          display: 'inline-block',
          flexShrink: 0,
          overflow: 'hidden',
          letterSpacing: 'normal',
          textTransform: 'none',
          whiteSpace: 'nowrap',
          direction: 'ltr',
          userSelect: 'none',
          fontFeatureSettings: '"liga"',
          WebkitFontSmoothing: 'antialiased',
          fontVariationSettings: '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: control.md.radius, whiteSpace: 'nowrap', transition: `${PRESS}, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms`, '&:active': { transform: 'scale(0.97)' } } },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: control.md.radius, transition: `${PRESS}, background-color 150ms, color 150ms`, '&:active': { transform: 'scale(0.9)' } } },
    },
    // A <tr> can't round or clip its own background, so the radius sits on the first and
    // last cells and the hover fill is painted on the cells rather than the row.
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          transition: 'background-color 150ms',
          '& > .MuiTableCell-root:first-of-type': { borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md },
          '& > .MuiTableCell-root:last-of-type': { borderTopRightRadius: radius.md, borderBottomRightRadius: radius.md },
          '&.MuiTableRow-hover:hover': { backgroundColor: 'transparent' },
          '&.MuiTableRow-hover:hover > .MuiTableCell-root': { backgroundColor: theme.vars.palette.action.hover },
        }),
      },
    },
    // Cards and panels separate by fill and shadow, never by an outline
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: radius['4xl'],
          boxShadow: elevation.card,
          // Clip, not hidden: the corners still cut what's inside, but the card is no
          // scroll box, so a sticky header inside it can still pin to the page.
          overflow: 'clip',
          // A soft shadow doesn't read on near-black; the paper fill does the separating
          ...theme.applyStyles('dark', { boxShadow: 'none' }),
        }),
      },
    },
    MuiMenu: { styleOverrides: { paper: { borderRadius: radius['2xl'], boxShadow: elevation.pop } } },
    MuiPopover: { styleOverrides: { paper: { borderRadius: radius['2xl'], boxShadow: elevation.pop } } },
    MuiTextField: { defaultProps: { variant: 'filled', hiddenLabel: true, size: 'small' } },
    /**
     * A field is a hole in the page, so it is a recess: a grey fill and no line at all at
     * rest. MUI's filled variant rounds only its top two corners and hangs an underline
     * under it, which reads as half a control; both are turned off here.
     *
     * The border is there at rest but transparent, so the box doesn't resize when focus
     * turns it the brand colour.
     */
    MuiFilledInput: {
      defaultProps: { disableUnderline: true },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: control.md.radius,
          backgroundColor: theme.vars.palette.sunken,
          border: '1px solid transparent',
          transition: 'background-color 150ms, border-color 150ms, box-shadow 150ms',
          '&:hover': { backgroundColor: theme.vars.palette.action.hover },
          '&.Mui-focused': {
            backgroundColor: theme.vars.palette.sunken,
            borderColor: theme.vars.palette.primary.main,
            boxShadow: `0 0 0 3px rgb(${theme.vars.palette.primary.mainChannel} / 0.16)`,
          },
          '&.Mui-error': { borderColor: theme.vars.palette.error.main },
          '&.Mui-error.Mui-focused': {
            borderColor: theme.vars.palette.error.main,
            boxShadow: `0 0 0 3px rgb(${theme.vars.palette.error.mainChannel} / 0.16)`,
          },
          '&.Mui-disabled': { backgroundColor: 'transparent', borderColor: theme.vars.palette.divider },
        }),
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: radius.lg, transition: 'background-color 150ms, color 150ms' } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: radius['3xl'], boxShadow: elevation.dialog } } },
    MuiTooltip: { defaultProps: { arrow: true, enterDelay: 300 } },
    MuiTableCell: {
      styleOverrides: {
        // Dashed: it separates rows without drawing a hard line across the page
        root: ({ theme }) => ({ borderBottomStyle: 'dashed', borderBottomColor: theme.vars.palette.divider }),
        head: ({ theme }) => ({
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'nowrap',
        }),
      },
    },
  },
})
