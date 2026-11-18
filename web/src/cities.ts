// Each city owns one ink everywhere it appears: row mark, filter, run strip.
export const CITY_INK: Record<string, string> = {
  Goa: 'var(--city-goa)',
  Jaipur: 'var(--city-jaipur)',
  Udaipur: 'var(--city-udaipur)',
  Manali: 'var(--city-manali)',
  Kochi: 'var(--city-kochi)',
}

export const CITIES = Object.keys(CITY_INK)

// December weeks in planning order; the run strip has one cell per week
export const WEEKS = ['1-7 Dec', '8-14 Dec', '15-21 Dec', '22-28 Dec']
export const WEEK_STARTS = ['1', '8', '15', '22']
