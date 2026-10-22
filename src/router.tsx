import { createBrowserRouter } from 'react-router'
import { AppLayout } from './AppLayout'
import { DetailsRoute } from './pages/DetailsRoute'
import { HomePage } from './pages/HomePage'
import { NotFound } from './pages/NotFound'
import { SearchPage } from './pages/SearchPage'

/**
 * /                        home: featured movies & TV
 * /t/:source/:id           home + a featured torrent's details dialog
 * /search?q=…&page=…       merged results
 * /search/t/:source/:id    results + a row's details dialog (keeps ?q=…&page=…)
 *
 * The details dialog is a child route, so the page underneath stays mounted (no refetch),
 * the dialog has its own shareable URL, and Back closes it.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        element: <HomePage />,
        children: [
          { index: true, element: null },
          { path: 't/:source/:id', element: <DetailsRoute /> },
        ],
      },
      {
        path: 'search',
        element: <SearchPage />,
        children: [{ path: 't/:source/:id', element: <DetailsRoute /> }],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
