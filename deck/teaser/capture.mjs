// Captures the frames of the cover-slide teaser from the live Buy Desk demo (see deck/README.md, "Teaser GIF").
// Run from deck/:  node teaser/capture.mjs      then:  python teaser/make_gif.py
// Writes deck/renders/teaser/*.png and frames.json. Needs the installed Chrome (no browser download).
// If the hosted demo is down:  npm --prefix web run dev   then   TEASER_URL=http://localhost:5173/ node teaser/capture.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const URL_ = process.env.TEASER_URL ?? 'https://voyance-1029341879804.asia-south1.run.app/'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renders', 'teaser')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })
const frames = []

try {
  try {
    await page.goto(URL_, { timeout: 30_000 })
  } catch (err) {
    console.error(`Could not open ${URL_}: ${err.message.split('\n')[0]}`)
    console.error('Run `npm --prefix web run dev` and pass its URL in the TEASER_URL env var, e.g. TEASER_URL=http://localhost:5173/')
    process.exit(1)
  }
  await page.getByRole('button', { name: /Explore (the live demo|a saved demo plan)/ }).first().click()

  const modeTab = (name) =>
    page.getByRole('tablist', { name: 'Buy Desk mode' }).getByRole('tab', { name: new RegExp(`^${name}`) })
  const queue = page.getByRole('region', { name: 'Lines to review' })
  const caseView = page.getByRole('region', { name: 'Selected line' })
  const planRow = page
    .getByRole('table', { name: 'Buy list' }).locator('tbody tr')
    .filter({ hasText: 'Goa' }).filter({ hasText: 'Hotel B' }).filter({ hasText: '22–28 Dec' })
  const queueLine = () => queue.getByRole('button').filter({ hasText: 'Goa · Hotel B' }).filter({ hasText: '22–28 Dec' })

  const settle = async (ms = 700) => {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(ms)
  }
  const centre = async (locator) => {
    const b = await locator.boundingBox()
    return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]
  }
  const toTop = () => page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0
  })
  const shot = async (step, hold_ms, caption, cursor = null) => {
    const file = `${step}.png`
    await page.screenshot({ path: path.join(OUT, file) })
    frames.push({ step, file, hold_ms, caption, cursor })
    console.log(`  ${step}: ${file}`)
  }

  await queue.getByRole('tab', { name: /^Waiting/ }).waitFor()
  await settle()

  // The numbers in the captions come from the screen, not from memory
  await modeTab('Plan').click()
  await planRow.waitFor()
  await settle()
  await planRow.evaluate((el) => el.scrollIntoView({ block: 'center' })) // the same scroll as the "row" and "why" frames
  await planRow.click()
  const sheet = page.locator('dialog.sheet')
  await sheet.waitFor()
  await settle()
  const sheetText = await sheet.innerText()
  const searches = sheetText.match(/([\d,]+) searches found/)?.[1]
  const rooms = sheetText.match(/Buy (\d+) rooms/)?.[1]
  const buyBy = sheetText.match(/buy by (\d+) (\w{3})/)
  if (!searches || !rooms || !buyBy) throw new Error(`the line's detail sheet does not show what the captions need:\n${sheetText}`)
  const date = `${buyBy[1]} ${buyBy[2]}`
  console.log(`  on screen: ${searches} searches, ${rooms} rooms, buy by ${date}`)
  const listCaption = '₹2 cr budget in, a ranked buy list out'

  // S1 hook = the same view as S4
  await shot('hook', 3000, `Goa, Christmas week: ${searches} searches hit 'sold out'`)
  // S2 list
  await page.getByRole('button', { name: 'Close details' }).click()
  await settle()
  await toTop()
  await settle(400)
  await shot('list', 1500, listCaption)
  // S3 row, cursor on the row
  await planRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await settle(400)
  const rowCentre = await centre(planRow)
  await shot('row', 1000, listCaption, rowCentre)
  // S4 why
  await planRow.click()
  await sheet.waitFor()
  await settle()
  await shot('why', 3000, `Buy ${rooms} rooms by ${date}, before it sells out`)
  await page.getByRole('button', { name: 'Close details' }).click()
  await settle(400)

  // S5 review: the same line in the waiting queue
  await modeTab('Review').click()
  await queue.getByRole('tab', { name: /^Waiting/ }).click()
  await queueLine().first().scrollIntoViewIfNeeded()
  await queueLine().first().click()
  await caseView.getByRole('heading', { name: 'Goa · Hotel B' }).waitFor()
  await settle()
  const approve = page.getByRole('button', { name: /Approve line/ })
  await approve.scrollIntoViewIfNeeded() // the button sits below the fold at 1280x720
  await settle(400)
  await shot('review', 1500, 'A second person signs off', await centre(approve))
  // S6 approve, then show it in the Decided tab
  await approve.click()
  await settle(500)
  await queue.getByRole('tab', { name: /^Decided/ }).click()
  await queueLine().first().scrollIntoViewIfNeeded()
  await queueLine().first().click()
  await caseView.getByText('Approved by Ravi').waitFor()
  await settle()
  await shot('approved', 2000, 'Approved. Every decision logged.')

  writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames, null, 2))
  console.log(`wrote ${frames.length} frames and frames.json to ${OUT}`)
} finally {
  await browser.close()
}
