import { useEffect } from 'react'

/**
 * The browser tab's title, per route.
 *
 * This used to also write canonical, Open Graph and Twitter tags. It no longer does:
 * those describe a public website so that search engines and chat apps can index and
 * preview it, and there is no public website here. This is source for something you run
 * yourself, so the only thing worth setting is what the tab says.
 */

export const APP_NAME = 'Marquo'

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}
