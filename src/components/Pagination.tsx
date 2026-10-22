import MuiPagination from '@mui/material/Pagination'
import PaginationItem from '@mui/material/PaginationItem'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { Icon } from './Icon'

const PAGE_SIZES = [20, 50, 100]

interface Props {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}

const Previous = () => <Icon name="chevron_left" size={18} />
const Next = () => <Icon name="chevron_right" size={18} />

export function Pagination({ page, pageSize, total, onPage, onPageSize }: Props) {
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <Stack
      direction="row"
      sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 3, rowGap: 1.5, px: { xs: 0.5, sm: 2 }, py: 1.5, mt: { xs: 1.5, sm: 0 }, borderTop: 1, borderColor: 'divider' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography id="rows-per-page" variant="body2" sx={{ color: 'text.secondary' }}>
          Rows per page
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={pageSize}
          onChange={(_, size: number | null) => size && onPageSize(size)}
          aria-labelledby="rows-per-page"
        >
          {PAGE_SIZES.map((size) => (
            <ToggleButton key={size} value={size} sx={{ minWidth: 40, py: 0.25, fontVariantNumeric: 'tabular-nums' }}>
              {size}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Stack component="nav" aria-label="Pagination" direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {from}–{to} of {total}
        </Typography>
        <MuiPagination
          count={pageCount}
          page={page}
          onChange={(_, next) => onPage(next)}
          shape="rounded"
          color="primary"
          siblingCount={phone ? 0 : 1}
          boundaryCount={1}
          renderItem={(item) => <PaginationItem slots={{ previous: Previous, next: Next }} {...item} />}
        />
      </Stack>
    </Stack>
  )
}
