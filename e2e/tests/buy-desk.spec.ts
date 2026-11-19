import { expect, test, type Page } from '@playwright/test'
import { KEYS } from '../keys'

async function signIn(page: Page, name: keyof typeof KEYS) {
  await page.goto('/')
  // a hosted demo makes its own keys at deploy time and hands them out in /config.js
  const served = await page.evaluate(
    (who) => (window as { __VOYANCE__?: { demoKeys?: Record<string, string> } }).__VOYANCE__?.demoKeys?.[who],
    name,
  )
  await page.getByLabel('API key').fill(served ?? KEYS[name])
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByText('Loading your plans…')).toHaveCount(0)
}

const modeTab = (page: Page, name: 'Plan' | 'Review') =>
  page.getByRole('tablist', { name: 'Buy Desk mode' }).getByRole('tab', { name: new RegExp(`^${name}`) })
const buyRows = (page: Page) => page.getByRole('table', { name: 'Buy list' }).locator('tbody tr')
const queue = (page: Page) => page.getByRole('region', { name: 'Lines to review' })
const caseView = (page: Page) => page.getByRole('region', { name: 'Selected line' })
const slider = (page: Page, label: string) => page.getByLabel(label, { exact: true })

test.describe.configure({ mode: 'serial' })

test('the demo opens without a key: review first, then plan and risk curve', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Explore a saved demo plan/ }).click()
  await expect(queue(page).getByRole('tab', { name: 'Waiting · 36' })).toBeVisible()
  await expect(caseView(page).getByRole('heading', { name: 'Udaipur · Hotel A' })).toBeVisible()

  await modeTab(page, 'Plan').click()
  await expect(buyRows(page)).toHaveCount(40)
  await page.getByRole('tab', { name: 'Risk curve' }).click()
  await expect(page.getByText(/At risk 0\.3, you give up/)).toBeVisible()
})

test('a wrong key is refused', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('API key').fill('vy_not-a-real-key')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('That API key was not accepted.')
})

test('a buyer previews, saves, and sees the plan wait for an approver', async ({ page }) => {
  await signIn(page, 'asha')
  await expect(modeTab(page, 'Plan')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Not saved').first()).toBeVisible()
  await expect(buyRows(page)).toHaveCount(40)

  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/^Plan #1 saved: 40 lines/)).toBeVisible()
  await expect(page.getByText('Plan #1', { exact: true })).toBeVisible()

  await modeTab(page, 'Review').click()
  await expect(caseView(page)).toContainText('Waiting for an approver.')
  await expect(page.getByRole('button', { name: /Approve line/ })).toHaveCount(0)
})

test('an approver from the sign-in picker approves and rejects lines', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ravi/ }).click()
  await expect(modeTab(page, 'Review')).toHaveAttribute('aria-selected', 'true')
  await expect(caseView(page).getByRole('heading', { name: 'Udaipur · Hotel A' })).toBeVisible()

  await page.getByRole('button', { name: /Approve line/ }).click()
  // the next waiting line comes up straight away
  await expect(caseView(page).getByRole('heading', { name: 'Kochi · Hotel A' })).toBeVisible()
  await page.getByRole('button', { name: /Reject/ }).click()
  await expect(page.getByText('2 of 40 decided')).toBeVisible()
  await expect(queue(page).getByRole('tab', { name: 'Decided · 2' })).toBeVisible()
})

test('decisions are final and survive a reload', async ({ page }) => {
  await signIn(page, 'meera')
  await queue(page).getByRole('tab', { name: /Decided/ }).click()
  await expect(caseView(page)).toContainText('Approved by Ravi')
  await expect(page.getByRole('button', { name: /Approve line/ })).toHaveCount(0)
})

test('the plan exports as CSV', async ({ page }) => {
  await signIn(page, 'ravi')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toBe('plan-1.csv')
})

test('a what-if re-plans against the base plan and cannot be saved', async ({ page }) => {
  await signIn(page, 'asha')
  await slider(page, 'Risk setting').fill('0.8') // an unsaved change, so there is something to save once the what-if is gone
  await slider(page, 'Demand vs forecast').fill('0.2')
  await expect(page.getByText('What-if', { exact: true })).toBeVisible()
  await expect(page.getByText('against the plan without the what-if').first()).toBeAttached()
  await expect(page.getByRole('button', { name: 'Save plan' })).toBeDisabled()
  await expect(
    page.getByText("What-ifs explore a different December. Saved plans use the planner's own forecast."),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Reset what-ifs' }).click()
  await expect(page.getByText('What-if', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save plan' })).toBeEnabled()
})

test("putting the event-weeks slider back on the planner's guess lets the plan be saved", async ({ page }) => {
  await signIn(page, 'asha')
  await slider(page, 'Risk setting').fill('0.8') // an unsaved change, so there is something to save
  await slider(page, 'Event weeks').fill('2')
  await expect(page.getByRole('button', { name: 'Save plan' })).toBeDisabled()
  await slider(page, 'Event weeks').fill('1.5')
  await expect(page.getByText('Planner’s guess')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save plan' })).toBeEnabled()
  await expect(page.getByText('What-if', { exact: true })).toHaveCount(0)
})

test('moving a slider previews without saving, and going back restores the plan', async ({ page }) => {
  await signIn(page, 'asha')
  await slider(page, 'Risk setting').fill('0.8')
  await expect(page.getByText('Not saved').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back to plan #1' }).click()
  await expect(page.getByText('Plan #1', { exact: true })).toBeVisible()
})

test('the risk curve loads for the live budget', async ({ page }) => {
  await signIn(page, 'ravi')
  await modeTab(page, 'Plan').click()
  await page.getByRole('tab', { name: 'Risk curve' }).click()
  await expect(page.getByText(/At risk 0\.3, you give up/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('img', { name: /Expected profit falls/ })).toBeVisible()
})

test('nobody approves their own plan', async ({ page }) => {
  await signIn(page, 'ravi')
  await modeTab(page, 'Plan').click()
  await slider(page, 'Risk setting').fill('0.5')
  await expect(page.getByText('Not saved').first()).toBeVisible()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/^Plan #2 saved/)).toBeVisible()
  await modeTab(page, 'Review').click()
  await expect(caseView(page)).toContainText('You made this plan, so another approver decides it.')
  await expect(page.getByRole('button', { name: /Approve line/ })).toHaveCount(0)
})

test("another company can't see the plans", async ({ page }) => {
  await signIn(page, 'zed')
  await expect(page.getByText('Other Distributor')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No plans to review yet' })).toBeVisible()
})

test('the plans page lists saved plans and opens one for review', async ({ page }) => {
  await signIn(page, 'ravi')
  await page.getByRole('link', { name: 'Plans' }).click()
  const plans = page.getByRole('table', { name: 'Plans' }).locator('tbody tr')
  await expect(plans).toHaveCount(2)
  await plans.filter({ hasText: '#1' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('combobox', { name: 'Plan to review' })).toHaveValue('1')
})

test('the markets page shows every hotel-week and filters by city', async ({ page }) => {
  await signIn(page, 'asha')
  await page.getByRole('link', { name: 'Markets' }).click()
  const markets = page.getByRole('table', { name: 'Markets' }).locator('tbody tr')
  await expect(markets).toHaveCount(40)
  await page.getByRole('combobox').selectOption('Goa')
  await expect(markets).toHaveCount(8)
})

test('the audit log is for admins only', async ({ page }) => {
  await signIn(page, 'ravi')
  await page.getByRole('link', { name: 'Audit log' }).click()
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, 'meera')
  await page.goto('/#/audit')
  const log = page.getByRole('table', { name: 'Audit log' })
  await expect(log).toContainText('Saved a plan')
  await expect(log).toContainText('Approved a line')
  await expect(log).toContainText('Rejected a line')
})

// What the API itself answers, to check a screen against (the same key the page signed in with)
async function apiGet<T>(page: Page, path: string, who: keyof typeof KEYS): Promise<T> {
  const served = await page.evaluate(
    (w) => (window as { __VOYANCE__?: { demoKeys?: Record<string, string> } }).__VOYANCE__?.demoKeys?.[w],
    who,
  )
  const res = await page.request.get(path, { headers: { 'X-API-Key': served ?? KEYS[who] } })
  expect(res.ok()).toBeTruthy()
  return res.json() as Promise<T>
}

type Totals = { profit: number; turned_away: number }

test('the replay race recomputes its headline from the replay engine', async ({ page }) => {
  await signIn(page, 'asha')
  await page.getByRole('link', { name: 'Replay race' }).click()
  await expect(page.getByRole('heading', { name: 'Voyance vs. re-buying last year' })).toBeVisible()
  await expect(page.getByText('Historical 2017 bookings · not live inventory')).toBeVisible()

  const { totals } = await apiGet<{ totals: Record<string, Totals> }>(page, '/v1/replay', 'asha')
  const v = totals.voyance
  const r = totals.rebuy_last_year
  const hero = page.getByRole('region', { name: 'Headline result' })
  await expect(hero).toContainText(`+${(((v.profit - r.profit) / r.profit) * 100).toFixed(1)}%`)
  await expect(hero).toContainText(`${(((r.turned_away - v.turned_away) / r.turned_away) * 100).toFixed(1)}%`)
  await expect(page.getByText(/matches the engine's own totals/)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Why Voyance performed better' })).toBeVisible()

  const weeks = page.getByRole('table', { name: 'Replay by week' })
  await weeks.getByRole('button', { name: '2 Jan' }).first().click()
  await expect(weeks.getByRole('heading', { name: 'What the forecast knew on 4 Sep 2016' })).toBeVisible()
  await expect(weeks.getByRole('row', { name: /^Voyance €/ })).toContainText('€10,520')
  await page.getByRole('tab', { name: 'Resort Hotel' }).click()
  await expect(weeks.locator('tbody > tr').filter({ hasText: 'City Hotel' })).toHaveCount(0)
})

type PositionApi = { summary: Record<string, number>; lines: { city: string }[] }

test('the position monitor shows the API status of every line, with search, filters and sorting', async ({ page }) => {
  await signIn(page, 'ravi')
  await page.getByRole('link', { name: 'Position monitor' }).click()
  await page.getByRole('combobox', { name: 'Plan', exact: true }).selectOption('1')
  const rows = page.getByRole('table', { name: 'Position by line' }).locator('tbody > tr')
  const nov = await apiGet<PositionApi>(page, '/v1/plans/1/position?as_of=2027-11-01', 'ravi')
  await expect(rows).toHaveCount(nov.lines.length)
  for (const [status, label] of [['short', 'Short'], ['on_pace', 'On pace'], ['over', 'Over']]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label} ${nov.summary[status]}\\b`) })).toBeVisible()
  }

  const short = page.getByRole('button', { name: /^Short \d/ })
  await short.click()
  await expect(short).toHaveAttribute('aria-pressed', 'true')
  await expect(rows).toHaveCount(nov.summary.short)
  await page.getByRole('button', { name: 'Clear filters' }).click()

  await page.getByRole('combobox', { name: 'Destination' }).selectOption('Kochi')
  await expect(rows).toHaveCount(nov.lines.filter((l) => l.city === 'Kochi').length)
  await page.getByRole('searchbox', { name: 'Search lines' }).fill('Hotel A')
  await expect(rows.filter({ hasNotText: 'Hotel A' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters' }).click()

  await page.getByRole('button', { name: 'Spend', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Spend' })).toHaveAttribute('aria-sort', 'descending')
  await rows.first().getByRole('button').first().click()
  await expect(page.getByText('Spend at stake')).toBeVisible()

  await page.getByRole('tab', { name: '1 Dec' }).click()
  const dec = await apiGet<PositionApi>(page, '/v1/plans/1/position?as_of=2027-12-01', 'ravi')
  await expect(page.getByRole('button', { name: new RegExp(`^Week started ${dec.summary.started}\\b`) })).toBeVisible()
})

type PlanApi = {
  id: number
  exposure: { at_cap: boolean }[]
  passed: { city: string; week: string; hotel: string; reason: string }[]
}

test('a buyer plans with exposure caps; the exposure page and action queue explain them', async ({ page }) => {
  await signIn(page, 'asha')
  await slider(page, 'Budget').fill('10000000')
  await page.getByLabel('Most in one city').selectOption('0.2')
  await page.getByLabel('Most with one hotel').selectOption('0.1')
  await expect(page.getByText(/These caps give up about/)).toBeVisible()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/^Plan #3 saved/)).toBeVisible()

  await page.getByRole('link', { name: 'Exposure caps' }).click()
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toHaveValue('3')
  const plan = await apiGet<PlanApi>(page, '/v1/plans/3', 'asha')
  const atCap = plan.exposure.filter((e) => e.at_cap).length
  expect(atCap).toBeGreaterThan(0)
  await expect(page.locator('.badge', { hasText: /^At cap$/ })).toHaveCount(atCap)
  await expect(page.getByRole('heading', { name: "What's preventing more purchases" })).toBeVisible()
  await page.getByRole('table', { name: 'Exposure by city' }).getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: 'What makes up this exposure' })).toBeVisible()

  await page.getByRole('link', { name: 'Action queue' }).click()
  await page.getByRole('tab', { name: '1 Aug 2027' }).click()
  const queue = await apiGet<{ items: { action: string }[] }>(page, '/v1/plans/3/queue?as_of=2027-08-01', 'asha')
  const rows = page.getByRole('table', { name: 'Action queue' }).locator('tbody > tr')
  await expect(rows).toHaveCount(queue.items.length)
  // nothing in a new plan is approved yet, so the API's approval gate holds every buy back
  const waiting = queue.items.filter((i) => i.action === 'awaiting_approval').length
  expect(waiting).toBeGreaterThan(0)
  await expect(page.getByRole('tab', { name: `Needs approval ${waiting}` })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Approved buys 0' })).toBeVisible()

  // a hotel-week the optimizer passed on shows its own reason under "Why not?"
  expect(plan.passed.length).toBeGreaterThan(0)
  const skipped = plan.passed[0]
  const row = rows.filter({ hasText: `${skipped.city} · ${skipped.hotel}` }).filter({ hasText: skipped.week.replace('-', '–') })
  await row.getByRole('button').first().click()
  await expect(page.getByRole('table', { name: 'Action queue' }).getByRole('heading', { name: /^Why not\?/ })).toBeVisible()
  await expect(page.getByText(skipped.reason, { exact: false })).toBeVisible()
})

test('the demo shows the replay race and the plan screens without a key', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Explore a saved demo plan/ }).click()
  await page.getByRole('link', { name: 'Position monitor' }).click()
  await expect(page.getByRole('table', { name: 'Position by line' }).locator('tbody > tr')).toHaveCount(39)
  await page.getByRole('link', { name: 'Action queue' }).click()
  await expect(page.getByRole('table', { name: 'Action queue' }).locator('tbody > tr')).toHaveCount(39)
  await page.getByRole('link', { name: 'Exposure caps' }).click()
  await expect(page.getByText(/was made without exposure caps/)).toBeVisible()
  await page.getByRole('link', { name: 'Replay race' }).click()
  await expect(page.getByRole('region', { name: 'Headline result' })).toContainText('+9.6%')
})

test('the plan screens say when there is no plan, and show an API failure', async ({ page }) => {
  await signIn(page, 'zed')
  for (const name of ['Action queue', 'Position monitor', 'Exposure caps']) {
    await page.getByRole('link', { name }).click()
    await expect(page.getByRole('heading', { name: 'No saved plans yet' })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, 'ravi')
  await page.route('**/v1/plans/*/queue*', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'The planner is busy' }) }),
  )
  await page.route('**/v1/replay', (route) => route.abort())
  await page.getByRole('link', { name: 'Action queue' }).click()
  await expect(page.getByText('The planner is busy')).toBeVisible()
  await page.getByRole('link', { name: 'Replay race' }).click()
  await expect(page.getByText("Can't reach the Voyance API. Check that it is running.")).toBeVisible()
})

test('the landing page leads with the pitch and the demo opens the Buy Desk', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Buy December's rooms")
  await expect(page.getByText('+9.6%')).toBeVisible()
  // the hero and nav "Sign in" are links, so the only button named "Sign in" is still the form submit
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Explore the live demo' }).click()
  await expect(page.getByRole('heading', { name: 'Buy Desk', exact: true })).toBeVisible()
})
