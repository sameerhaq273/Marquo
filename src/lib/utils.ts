const PREFIXES = ['', 'K', 'M', 'G', 'T', 'P']

/** "5.7 GB" or "845 MB" -> bytes, for sorting. Unknown sizes sort last. */
export function parseSize(size: string) {
  const match = size.match(/([\d.,]+)\s*([KMGTP]?)(i?)B/i)
  if (!match) return -1
  const base = match[3] ? 1024 : 1000
  return parseFloat(match[1].replace(/,/g, '')) * base ** PREFIXES.indexOf(match[2].toUpperCase())
}

/** Sites send counts as "1,234", as "1234" or as a bare number; all three read the same */
export function toNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const n = parseInt(String(value).replace(/,/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for browsers that block the async clipboard API
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    if (!ok) throw new Error('Clipboard access is blocked. Use the magnet button to open it instead.')
  }
}

let audio: AudioContext | undefined

/** A 1000 Hz, 200 ms confirmation tone, played when a magnet link is copied. */
export function beep() {
  try {
    audio ??= new AudioContext()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = 1000
    gain.gain.setValueAtTime(0.08, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.2)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.2)
  } catch {
    // Audio is optional
  }
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is optional
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Upload dates come in each site's own format: "2026-10-06" (Pirate Bay),
 * "Oct. 05th '26" or "3am" for today (1337x). Returns a timestamp for sorting; unknown = 0.
 */
export function parseDate(text: string) {
  const value = text.trim()
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3])
  const short = value.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+'?(\d{2,4})$/)
  if (short) {
    const year = short[3].length === 2 ? 2000 + +short[3] : +short[3]
    return Date.UTC(year, Math.max(0, MONTHS.indexOf(short[1].toLowerCase())), +short[2])
  }
  if (/^\d{1,2}(:\d{2})?\s*(am|pm)$/i.test(value) || /today|ago/i.test(value)) return Date.now()
  if (/yesterday/i.test(value)) return Date.now() - 86_400_000
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
