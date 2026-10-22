import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <Stack sx={{ alignItems: 'center', textAlign: 'center', px: 2, py: 8 }}>
      <Box sx={{ display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%', bgcolor: 'action.hover', color: 'text.secondary' }}>
        {icon}
      </Box>
      <Typography variant="subtitle1" component="h2" sx={{ mt: 2, fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 384, color: 'text.secondary', textWrap: 'pretty' }}>
        {body}
      </Typography>
      {children}
    </Stack>
  )
}
