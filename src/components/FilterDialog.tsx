import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Tooltip from '@mui/material/Tooltip'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import type { Category, Source } from '../lib/api'
import {
  DEFAULT_FILTERS,
  MAX_YEAR,
  MIN_YEAR,
  type Filters,
} from '../lib/filters'
import { SENSITIVE_CATEGORIES } from '../lib/sensitive'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

/**
 * A glyph per shared category id (sources/__init__.py CATEGORIES), plus one for "All".
 * Add a category on the server and it falls back to the generic mark rather than breaking.
 */
const CATEGORY_ICONS: Record<string, string> = {
  '': 'select_all',
  movies: 'movie',
  tv: 'tv',
  music: 'music_note',
  games: 'sports_esports',
  apps: 'apps',
  documentaries: 'videocam',
  anime: 'animation',
  other: 'category',
  adult: '18_up_rating',
}

/** Mount only while open: the draft starts from the applied filters each time. */
interface Props {
  onClose: () => void
  filters: Filters
  onApply: (filters: Filters) => void
  sources: Source[]
  categories: Category[]
}

export function FilterDialog({ onClose, filters, onApply, sources, categories }: Props) {
  const [draft, setDraft] = useState(filters)
  const checked = sources.filter((s) => !draft.excludedSources.includes(s.id))

  // "All" first, then each category, noting the ones only some checked sources have
  const categoryOptions = [
    { id: '', label: 'All categories', note: undefined as string | undefined, hint: undefined as string | undefined, disabled: false },
    ...categories.map((c) => {
      const supported = checked.filter((s) => c.sources.includes(s.id))
      // A sensitive category would return nothing while the sensitive filter hides it all
      const blocked = draft.safeSearch && SENSITIVE_CATEGORIES.includes(c.id)
      return {
        id: c.id,
        label: c.label,
        disabled: blocked || supported.length === 0,
        // Why Adult is unavailable is an aside, so it hangs off an info icon instead of
        // adding a second line to one option and not the others
        hint: blocked ? 'Turn off the sensitive filter below to search this' : undefined,
        note: blocked
          ? undefined
          : supported.length === 0
            ? 'Not on selected sources'
            : supported.length < checked.length
              ? `${supported.map((s) => s.name).join(', ')} only`
              : undefined,
      }
    }),
  ]

  return (
    <Dialog
      onClose={onClose}
      title="Filters"
      icon={<Icon name="tune" size={22} />}
      footer={(close) => (
        <>
          <Button
            onClick={() => setDraft(DEFAULT_FILTERS)}
            sx={{ height: { xs: 44, sm: 40 }, px: 2, mr: 'auto', color: 'text.secondary', flexShrink: 0 }}
          >
            Reset
          </Button>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto' }, gap: 1.5 }}>
          <Button variant="outlined" color="inherit" onClick={() => close()} sx={{ borderColor: 'divider', height: { xs: 44, sm: 40 } }}>
            <Box component="span" sx={{ display: { sm: 'none' } }}>
              Close
            </Box>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Cancel
            </Box>
          </Button>
          <Button variant="contained" onClick={() => {
              onApply(draft)
              close()
            }} sx={{ height: { xs: 44, sm: 40 }, px: 2.5 }}>
            Apply filters
          </Button>
          </Box>
        </>
      )}
    >
      <Stack divider={<Divider flexItem />}>
        <Section title="Sources" hint="Results from every checked site are merged into one list.">
          {/* A type-ahead rather than a checkbox list: this grows every time a site is added */}
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={sources}
            value={checked}
            getOptionLabel={(s) => s.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText="No site by that name"
            onChange={(_, next) => {
              // Clearing the last one would search nothing, so the final site stays put
              if (!next.length) return
              setDraft({ ...draft, excludedSources: sources.filter((s) => !next.some((n) => n.id === s.id)).map((s) => s.id) })
            }}
            renderOption={(props, option, { selected }) => {
              const { key, ...rest } = props as typeof props & { key: string }
              return (
                <li key={key} {...rest}>
                  <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />
                  <Label primary={option.name} secondary={new URL(option.url).hostname} />
                </li>
              )
            }}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...rest } = getItemProps({ index })
                return (
                  <Chip
                    key={key}
                    {...rest}
                    size="small"
                    label={option.name}
                    // The last remaining site keeps its chip but loses the remove button
                    onDelete={value.length === 1 ? undefined : rest.onDelete}
                  />
                )
              })
            }
            renderInput={(params) => (
              <TextField {...params} placeholder={checked.length === sources.length ? 'All sites' : 'Add a site'} />
            )}
          />
          {checked.length === 1 && sources.length > 1 && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
              At least one source has to stay checked.
            </Typography>
          )}
        </Section>

        <Section title="Category">
          <RadioGroup
            aria-label="Category"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}
          >
            {categoryOptions.map((o) => (
              <FormControlLabel
                key={o.id || 'all'}
                value={o.id}
                disabled={o.disabled}
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                    <Icon
                      name={CATEGORY_ICONS[o.id] ?? 'category'}
                      size={20}
                      sx={{ flexShrink: 0, color: o.disabled ? 'text.disabled' : 'text.secondary' }}
                    />
                    <Label primary={o.label} secondary={o.note} />
                    {o.hint && <HintIcon hint={o.hint} />}
                  </Box>
                }
                sx={{ mr: 0 }}
              />
            ))}
          </RadioGroup>
        </Section>

        <Section
          title="Year"
          hint="Read from the release name. Combines with the category and every other filter."
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, maxWidth: 320 }}>
            <YearField
              label="From"
              value={draft.yearFrom}
              onChange={(yearFrom) => setDraft({ ...draft, yearFrom })}
              placeholder={String(MIN_YEAR)}
            />
            <Box component="span" sx={{ color: 'text.secondary' }}>
              &ndash;
            </Box>
            <YearField
              label="To"
              value={draft.yearTo}
              onChange={(yearTo) => setDraft({ ...draft, yearTo })}
              placeholder={String(MAX_YEAR)}
            />
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
            Leave either side empty to leave that end open. Releases whose name carries no year
            - most games, apps and music - fall outside a year range.
          </Typography>
        </Section>

        <Section title="Results">
          <Stack spacing={0.5}>
            <FormControlLabel
              labelPlacement="start"
              control={<Switch checked={draft.hideDead} onChange={(e) => setDraft({ ...draft, hideDead: e.target.checked })} />}
              label={<Label primary="Hide dead torrents" secondary="Results with 0 seeds" />}
              sx={{ m: 0, width: 1, justifyContent: 'space-between' }}
            />
            <FormControlLabel
              labelPlacement="start"
              control={
                <Switch
                  checked={draft.safeSearch}
                  onChange={(e) => {
                    const safeSearch = e.target.checked
                    setDraft({
                      ...draft,
                      safeSearch,
                      // Keeping a sensitive category selected here would return nothing
                      category: safeSearch && SENSITIVE_CATEGORIES.includes(draft.category) ? '' : draft.category,
                    })
                  }}
                />
              }
              label={
                <Label
                  primary="Hide sensitive results"
                  secondary="Adult (18+), nudity and other explicit releases, by category and by name"
                />
              }
              sx={{ m: 0, width: 1, justifyContent: 'space-between' }}
            />
          </Stack>
        </Section>

      </Stack>
    </Dialog>
  )
}

/**
 * The aside on a disabled option. A plain Tooltip opens on hover, which a touch screen
 * never sends, so this one also opens on tap - and the option it sits on is disabled, whose
 * label would otherwise swallow the tap before it arrives.
 */
function HintIcon({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false)
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip
        open={open}
        title={hint}
        enterTouchDelay={0}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        slotProps={{ popper: { disablePortal: true } }}
      >
        <Box
          component="span"
          role="button"
          tabIndex={0}
          aria-label={hint}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen((v) => !v)
            }
          }}
          sx={{
            display: 'flex',
            color: 'text.disabled',
            cursor: 'pointer',
            // The option is disabled, which would otherwise stop the tap reaching this
            pointerEvents: 'auto',
            borderRadius: 1,
            // A 16px glyph is a 16px target; pad it out to something a thumb can hit
            p: 1,
            m: -1,
          }}
        >
          <Icon name="info" size={16} />
        </Box>
      </Tooltip>
    </ClickAwayListener>
  )
}

/** One end of the year range. Empty means open, so the box clears to null rather than 0. */
function YearField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  placeholder: string
}) {
  return (
    <TextField
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const text = e.target.value.trim()
        onChange(text === '' ? null : Number(text))
      }}
      slotProps={{
        htmlInput: { 'aria-label': `${label} year`, min: MIN_YEAR, max: MAX_YEAR, step: 1, inputMode: 'numeric' },
      }}
      sx={{ flex: 1 }}
    />
  )
}

function Label({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <Box component="span" sx={{ display: 'block', py: 0.25 }}>
      <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 500 }}>
        {primary}
      </Typography>
      {secondary && (
        <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {secondary}
        </Typography>
      )}
    </Box>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ py: 2 }}>
      <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.4 }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  )
}
