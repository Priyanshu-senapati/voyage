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

test('booking pace reads how a saved plan is booking up on a chosen day', async ({ page }) => {
  await signIn(page, 'ravi')
  await page.getByRole('link', { name: 'Booking pace' }).click()
  await page.getByRole('combobox', { name: 'Plan', exact: true }).selectOption('1')
  const lines = page.getByRole('table', { name: 'Booking pace by line' }).locator('tbody tr')
  await expect(lines.first()).toBeVisible()
  await expect(page.getByRole('tab', { name: '1 Nov' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Week began')).toHaveCount(0)

  await page.getByRole('tab', { name: '1 Dec' }).click()
  await expect(page.getByText('The first December week starts today.', { exact: false })).toBeVisible()
  const started = page.getByRole('button', { name: /^Week started/ })
  await started.click()
  await expect(started).toHaveAttribute('aria-pressed', 'true')
  await expect(lines.filter({ hasText: 'Week began' })).toHaveCount(await lines.count())
  await page.getByRole('button', { name: 'Show all lines' }).click()
  await expect(started).toHaveAttribute('aria-pressed', 'false')
})

test('the 2017 replay compares buying the forecast with re-buying last year', async ({ page }) => {
  await signIn(page, 'asha')
  await page.getByRole('link', { name: '2017 replay' }).click()
  await expect(page.getByText('€1.27M', { exact: true })).toBeVisible()
  await expect(page.getByText(/finished €112K ahead/)).toBeVisible()

  const weeks = page.getByRole('table', { name: 'Replay by week' })
  await weeks.getByRole('button', { name: '2 Jan' }).first().click()
  await expect(weeks.getByRole('heading', { name: 'What the forecast knew on 4 Sep 2016' })).toBeVisible()
  await expect(weeks.getByRole('row', { name: /^Buying the forecast/ })).toContainText('€10,520')

  await page.getByRole('tab', { name: 'Resort Hotel' }).click()
  await expect(weeks.locator('tbody tr').filter({ hasText: 'City Hotel' })).toHaveCount(0)
})

test('the demo shows booking pace and the replay without a key', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Explore a saved demo plan/ }).click()
  await page.getByRole('link', { name: 'Booking pace' }).click()
  await expect(page.getByRole('table', { name: 'Booking pace by line' }).locator('tbody tr')).toHaveCount(40)
  await page.getByRole('link', { name: '2017 replay' }).click()
  await expect(page.getByText('€1.27M', { exact: true })).toBeVisible()
})
