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
