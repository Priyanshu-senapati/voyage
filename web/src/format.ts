const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

// Indian units: ₹6,828 · ₹1.66L · ₹1.22 cr
export function inr(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}₹${trim((abs / 1e7).toFixed(2))} cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)}L`
  return `${sign}₹${grouped.format(abs)}`
}

export const count = (value: number) => grouped.format(Math.round(value))

export const percent = (value: number) => `${Math.round(value * 100)}%`

// "15-21 Dec" from the API, set with a proper range dash
export const weekLabel = (week: string) => week.replace('-', '–')

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

function trim(fixed: string): string {
  return fixed.replace(/\.?0+$/, '')
}

// What the risk setting means, in words
export function riskWord(value: number): string {
  if (value === 0) return 'Chase profit'
  if (value < 0.2) return 'Bold'
  if (value < 0.5) return 'Balanced'
  if (value < 0.8) return 'Careful'
  return 'Very careful'
}

const euros = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

// Euros, for the 2017 replay (real bookings at two hotels in Portugal): €4,469 · €112K · €1.27M
export function eur(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e6) return `${sign}€${trim((abs / 1e6).toFixed(2))}M`
  if (abs >= 1e5) return `${sign}€${Math.round(abs / 1e3)}K`
  return `${sign}€${euros.format(abs)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2 Jan" (or "2 Jan 2017") for an ISO date
export function dayMonth(iso: string, withYear = false): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}${withYear ? ` ${year}` : ''}`
}

export const monthName = (month: number) => MONTHS[month - 1]

export const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
