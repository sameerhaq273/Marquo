import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { defaultDir, DIRECTION_WORDS, SORT_LABELS, sortSummary, type Filters, type SortDir, type SortKey } from '../lib/filters'
import { Icon } from './Icon'

/**
 * Sorting, as its own control beside Filters rather than buried inside the dialog.
 *
 * It belongs out here because it is the thing people reach for most while reading a list of
 * results, and because it says what it is doing: the button carries the current ordering,
 * so there is no need to read the dates and work it out.
 *
 * Each option names its outcome in words a reader already has - "Seeds, most first" rather
 * than "descending".
 */

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
  /** Phones show the icon alone; there is no room for the wording */
  compact?: boolean
}

export function SortMenu({ filters, onChange, compact = false }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = Boolean(anchor)
  const active = filters.sort !== 'match'

  function pick(sort: SortKey, sortDir: SortDir) {
    onChange({ ...filters, sort, sortDir })
    setAnchor(null)
  }

  const trigger = compact ? (
    <IconButton
      aria-haspopup="menu"
      aria-label={`Sort: ${sortSummary(filters)}`}
      onClick={(e) => setAnchor(e.currentTarget)}
      sx={{ width: 44, height: 44, ...(active && { color: 'primary.main' }) }}
    >
      <Icon name="swap_vert" size={22} />
    </IconButton>
  ) : (
    <Button
      variant="outlined"
      color="inherit"
      aria-haspopup="menu"
      onClick={(e) => setAnchor(e.currentTarget)}
      startIcon={<Icon name="swap_vert" size={18} />}
      sx={{
        display: { xs: 'none', sm: 'inline-flex' },
        height: 44,
        borderColor: 'divider',
        fontWeight: 500,
        maxWidth: 260,
        color: active ? 'primary.main' : 'text.primary',
        '& .MuiButton-startIcon': { mr: 0.75 },
      }}
    >
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sortSummary(filters)}
      </Box>
    </Button>
  )

  return (
    <>
      {trigger}
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 248, maxHeight: '70dvh' } } }}
      >
        <Typography variant="overline" sx={{ display: 'block', px: 2, pt: 1, color: 'text.secondary', lineHeight: 1.6 }}>
          Sort by
        </Typography>

        <MenuItem selected={filters.sort === 'match'} onClick={() => pick('match', 'desc')}>
          <ListItemIcon>{filters.sort === 'match' && <Icon name="check" size={18} />}</ListItemIcon>
          <ListItemText>{SORT_LABELS.match}</ListItemText>
        </MenuItem>

        {(Object.keys(SORT_LABELS) as SortKey[])
          .filter((key) => key !== 'match')
          .map((key) => {
            // The natural ordering first: most seeds, biggest, newest, A to Z
            const dirs: SortDir[] = [defaultDir(key), defaultDir(key) === 'asc' ? 'desc' : 'asc']
            return [
              <Divider key={`${key}-divider`} sx={{ my: 0.5 }} />,
              ...dirs.map((dir) => {
                const selected = filters.sort === key && filters.sortDir === dir
                return (
                  <MenuItem key={`${key}-${dir}`} selected={selected} onClick={() => pick(key, dir)}>
                    <ListItemIcon>{selected && <Icon name="check" size={18} />}</ListItemIcon>
                    <ListItemText
                      primary={SORT_LABELS[key]}
                      secondary={DIRECTION_WORDS[key][dir]}
                      slotProps={{ secondary: { sx: { fontSize: 12 } } }}
                    />
                  </MenuItem>
                )
              }),
            ]
          })}
      </Menu>
    </>
  )
}
