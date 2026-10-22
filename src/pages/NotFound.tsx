import Button from '@mui/material/Button'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'

export function NotFound() {
  return (
    <EmptyState icon={<Icon name="search_off" size={26} />} title="Page not found" body="There's nothing at this address.">
      <Button component={Link} to="/" variant="outlined" color="inherit" startIcon={<Icon name="home" size={18} />} sx={{ mt: 2, borderColor: 'divider', fontWeight: 500 }}>
        Go home
      </Button>
    </EmptyState>
  )
}
