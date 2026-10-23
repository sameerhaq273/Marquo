import { describe, expect, it } from 'vitest'
import { theme } from './theme'

/**
 * Regression. Transitions were cut for everything but animations only for elements
 * tagged `data-animate`, and half the animated elements had no such tag - including
 * three `spin 1s linear infinite` loaders that kept turning for a reader who had asked
 * the system to stop motion. Both properties belong on the universal selector, where a
 * future animation is covered without anyone remembering an attribute.
 */
describe('reduced motion', () => {
  const body = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, unknown> | undefined
  const query = body?.['@media (prefers-reduced-motion: reduce)'] as Record<string, Record<string, string>> | undefined

  it('is handled at all', () => {
    expect(query).toBeDefined()
  })

  it('cuts animation and transition on the universal selector', () => {
    const all = query?.['*, *::before, *::after']
    expect(all).toBeDefined()
    expect(all?.animationDuration).toContain('!important')
    expect(all?.animationIterationCount).toContain('!important')
    expect(all?.transitionDuration).toContain('!important')
  })

  it('no longer depends on an attribute that has to be remembered', () => {
    expect(query?.['[data-animate]']).toBeUndefined()
  })
})
