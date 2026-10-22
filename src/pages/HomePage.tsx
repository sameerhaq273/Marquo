import Box from '@mui/material/Box'
import { Outlet } from 'react-router'
import { FeaturedGrid } from '../components/FeaturedGrid'
import { HomeBanner } from '../components/HomeBanner'
import { useApp } from '../lib/appContext'
import { useTitle } from '../lib/seo'

/** "/" : the Marquo banner, featured movies and TV shows; "/t/:source/:id" opens a card's details over it */
export function HomePage() {
  const app = useApp()
  useTitle()
  return (
    <>
      {/* Side padding matches FeaturedGrid's, so the banner lines up with the cards */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 } }}>
        <HomeBanner sources={app.api?.sources ?? []} />
      </Box>
      <FeaturedGrid copyStates={app.copyStates} onCopy={app.onCopy} safeSearch={app.filters.safeSearch} />
      <Outlet context={app} />
    </>
  )
}
