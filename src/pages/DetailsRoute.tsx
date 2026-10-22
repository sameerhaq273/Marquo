import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { DetailsDialog } from '../components/DetailsDialog'
import { getDetails, type Torrent, type TorrentDetails } from '../lib/api'
import { useApp } from '../lib/appContext'
import { decodeId, type DetailsPreview } from '../lib/routes'
import { torrentKey } from '../lib/sources'

/**
 * ".../t/:source/:id" : loads the torrent's detail page from its own site (the server
 * reads and analyzes it) and shows it in a dialog over the page underneath.
 */
export function DetailsRoute() {
  const { source = '', id = '' } = useParams()
  const path = decodeId(id)
  const location = useLocation()
  const navigate = useNavigate()
  const app = useApp()
  const preview = (location.state as { preview?: DetailsPreview } | null)?.preview

  const requestKey = `${source}:${path}`
  const [loaded, setLoaded] = useState<{ key: string; details?: TorrentDetails; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    getDetails(source, path, controller.signal).then(
      (details) => setLoaded({ key: requestKey, details }),
      (e) => !controller.signal.aborted && setLoaded({ key: requestKey, error: e instanceof Error ? e.message : 'Something went wrong.' }),
    )
    return () => controller.abort()
  }, [source, path, requestKey, attempt])

  const current = loaded?.key === requestKey ? loaded : null
  const details = current?.details ?? null

  // The rating read from details also recolors this torrent's row in the results
  const { setCompat } = app
  useEffect(() => {
    if (details && path) setCompat(`${source}:${path}`, details.compat)
  }, [details, source, path, setCompat])
  const error = !path ? 'This link is broken: the torrent id could not be read.' : (current?.error ?? '')

  useEffect(() => {
    if (!details) return
    const previous = document.title
    document.title = `${details.title} · Torrent Search`
    return () => {
      document.title = previous
    }
  }, [details])

  function close() {
    // Opened from a list: go back so the list keeps its scroll position.
    // Opened from a pasted link: replace with the page underneath.
    if (location.key !== 'default') navigate(-1)
    else navigate({ pathname: location.pathname.replace(/\/t\/[^/]+\/[^/]+\/?$/, '') || '/', search: location.search }, { replace: true })
  }

  const torrent: Torrent | null =
    details && path
      ? {
          source,
          kind: details.kind,
          title: details.release,
          path,
          link: details.link,
          magnet: details.magnet ?? undefined,
          seeds: details.facts.find((f) => f.label === 'Seeds')?.value ?? '0',
          leeches: details.facts.find((f) => f.label === 'Leeches')?.value ?? '0',
          size: details.facts.find((f) => f.label === 'Size')?.value ?? '',
          uploader: '',
          upload_date: '',
        }
      : null

  return (
    <DetailsDialog
      details={details}
      preview={preview}
      error={error}
      source={app.sourceInfo[source]}
      linkToSite={!app.api?.mock}
      copyState={torrent ? app.copyStates[torrentKey(torrent)] : undefined}
      onClose={close}
      onRetry={() => {
        setLoaded(null)
        setAttempt((a) => a + 1)
      }}
      onCopy={() => torrent && app.onCopy(torrent)}
      onOpenClient={() => torrent && app.onOpen(torrent)}
      fileBusy={Boolean(torrent && app.fileStates[torrentKey(torrent)])}
      onDownloadFile={() => torrent && app.onDownloadFile(torrent)}
      onFindReleases={app.findReleases}
    />
  )
}
