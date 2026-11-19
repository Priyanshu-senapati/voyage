// Hosted-demo people and their keys. The server's /config.js sets window.__VOYANCE__.demoKeys at run time
// (deploy/server.py); VITE_DEMO_KEYS='{"asha":"vy_…",…}' does the same at build time for dev and tests.
// These keys are public by design — never put real data behind them.

export type DemoPerson = { name: string; label: string; role: string; does: string; key: string }

const PEOPLE = [
  { name: 'asha', label: 'Asha', role: 'Buyer', does: 'Makes plans' },
  { name: 'ravi', label: 'Ravi', role: 'Approver', does: 'Approves lines' },
  { name: 'meera', label: 'Meera', role: 'Admin', does: 'Sees the audit log' },
  { name: 'zed', label: 'Zed', role: 'Admin', does: 'At another company' },
]

declare global {
  interface Window {
    __VOYANCE__?: { demoKeys?: Record<string, string> }
  }
}

function resolveKeys(): Record<string, string> {
  let built: Record<string, string> = {}
  try {
    built = JSON.parse(import.meta.env.VITE_DEMO_KEYS ?? '{}')
  } catch {
    // ignore a malformed build setting
  }
  return { ...built, ...window.__VOYANCE__?.demoKeys }
}

export const DEMO_KEYS = resolveKeys()

// The demo people that actually have a key (empty off the hosted demo)
export function demoPeople(): DemoPerson[] {
  return PEOPLE.filter((p) => DEMO_KEYS[p.name]).map((p) => ({ ...p, key: DEMO_KEYS[p.name] }))
}
