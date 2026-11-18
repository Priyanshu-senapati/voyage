// Screenshots of the Buy Desk for the deck and video.
// Run after `npm run build` and `npm run preview` (port 4173):  node scripts/capture.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { chromium, devices } from '@playwright/test'

const url = process.env.CAPTURE_URL ?? 'http://localhost:4173/'
const out = process.argv[2] ?? 'mockup'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
// skip the sign-in screen: the deck frame is the demo session
const demo = () => sessionStorage.setItem('voyance.session', JSON.stringify({ mode: 'demo' }))

// Deck and video frame: 1280x720 at 2x, Ravi reviewing line 1
const desk = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
await desk.addInitScript(demo)
await desk.goto(url)
await desk.evaluate(() => document.fonts.ready)
await desk.waitForTimeout(400)
await desk.screenshot({ path: `${out}/buy-desk.png` })

const phone = await browser.newPage({ ...devices['iPhone 13'] })
await phone.addInitScript(demo)
await phone.goto(url)
await phone.evaluate(() => document.fonts.ready)
await phone.waitForTimeout(400)
await phone.screenshot({ path: `${out}/buy-desk-phone.png`, fullPage: true })

await browser.close()
console.log(`wrote ${out}/buy-desk.png and ${out}/buy-desk-phone.png`)
