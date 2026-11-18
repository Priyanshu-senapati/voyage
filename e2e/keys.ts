// Fixed keys for the throwaway test API (32+ characters with the vy_ prefix, as seed_demo.py requires).
// They only ever exist in e2e/.tmp, which is deleted on every run.
export const KEYS = {
  asha: 'vy_e2e-asha-000000000000000000000000',
  ravi: 'vy_e2e-ravi-000000000000000000000000',
  meera: 'vy_e2e-meera-00000000000000000000000',
  zed: 'vy_e2e-zed-0000000000000000000000000',
} as const

export const KEY_ENV = Object.fromEntries(
  Object.entries(KEYS).map(([name, key]) => [`VOYANCE_DEMO_KEY_${name.toUpperCase()}`, key]),
)
