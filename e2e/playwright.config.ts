import { defineConfig } from '@playwright/test'
import { KEY_ENV, KEYS } from './keys'

const API_PORT = process.env.E2E_API_PORT ?? '8001'
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5174'
// E2E_BASE_URL tests a running deploy instead, e.g. `python deploy/start.py` seeded with the keys from keys.ts
const TARGET = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './tests',
  // one shared API database: the flows build on each other, so run them in order
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: TARGET ?? `http://localhost:${WEB_PORT}`,
    // the Chrome already on the machine; set PW_CHANNEL=chromium after `npx playwright install chromium`
    channel: process.env.PW_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: TARGET
    ? []
    : [
        {
          command: 'node start-api.mjs',
          url: `http://127.0.0.1:${API_PORT}/docs`,
          env: { E2E_API_PORT: API_PORT, ...KEY_ENV },
          timeout: 60_000,
        },
        {
          command: `npm --prefix ../web run dev -- --port ${WEB_PORT} --strictPort`,
          url: `http://localhost:${WEB_PORT}`,
          env: { VOYANCE_API: `http://127.0.0.1:${API_PORT}`, VITE_DEMO_KEYS: JSON.stringify(KEYS) },
          timeout: 60_000,
        },
      ],
})
