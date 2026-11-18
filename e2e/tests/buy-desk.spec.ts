import { expect, test, type Page } from '@playwright/test'
import { KEYS } from '../keys'

async function signIn(page: Page, name: keyof typeof KEYS) {
  await page.goto('/')
  await page.getByLabel('API key').fill(KEYS[name])
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('slider').first()).toBeEnabled()
}

const rows = (page: Page) => page.getByRole('table', { name: 'Buy list' }).locator('tbody tr')
const side = (page: Page) => page.getByRole('complementary', { name: 'Details' })
const riskSlider = (page: Page) => page.getByRole('slider').nth(1)

test.describe.configure({ mode: 'serial' })

test('the demo opens without an API key, risk curve included', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the demo' }).click()
  await expect(page.getByRole('heading', { name: /December buy plan/ })).toBeVisible()
  await expect(rows(page)).toHaveCount(40)
  await expect(side(page).getByRole('heading', { name: 'Udaipur · Hotel A' })).toBeVisible()

  await side(page).getByRole('tab', { name: 'Risk curve' }).click()
  await expect(side(page)).toContainText('Risk 0.3 gives up')
})

test('a wrong key is refused', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('API key').fill('vy_not-a-real-key')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('That API key was not accepted.')
})

test('a buyer previews, saves, and is told who approves', async ({ page }) => {
  await signIn(page, 'asha')
  await expect(page.getByRole('banner')).toContainText('Asha')
  await expect(page.getByRole('banner')).toContainText('Buyer')

  // nothing saved yet: the default budget is previewed
  await expect(page.getByText('Preview, not saved')).toBeVisible()
  await expect(rows(page)).toHaveCount(40)
  await expect(rows(page).first()).toContainText('Unsaved')
  await expect(page.getByRole('button', { name: 'Discard' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/^Plan #1 saved: 40 lines/)).toBeVisible()
  await expect(page.getByText('Created by Asha')).toBeVisible()
  await expect(side(page)).toContainText('An approver or admin decides each line.')
  await expect(side(page).getByRole('button', { name: 'Approve line' })).toHaveCount(0)
})

test('the sign-in picker opens the approver, who decides lines', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ravi/ }).click()
  await expect(page.getByRole('banner')).toContainText('Approver')
  await expect(rows(page)).toHaveCount(40)

  await side(page).getByRole('button', { name: 'Approve line' }).click()
  await expect(rows(page).nth(0)).toContainText('Approved')
  // selection moves on to the next pending line
  await side(page).getByRole('button', { name: 'Reject' }).click()
  await expect(rows(page).nth(1)).toContainText('Rejected')
  await expect(page.getByText('1 rejected · 38 waiting')).toBeVisible()
})

test('decisions are final and survive a reload', async ({ page }) => {
  await signIn(page, 'meera')
  await expect(rows(page).nth(0)).toContainText('Approved')
  await rows(page).nth(0).click()
  await expect(side(page)).toContainText('Approved by Ravi')
  await expect(side(page).getByRole('button', { name: 'Approve line' })).toHaveCount(0)
})

test('the plan exports as CSV', async ({ page }) => {
  await signIn(page, 'ravi')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV' }).click()
  expect((await download).suggestedFilename()).toBe('plan-1.csv')
})

test('moving a slider previews without saving, and discard goes back', async ({ page }) => {
  await signIn(page, 'ravi')
  await riskSlider(page).fill('0.8')
  await expect(page.getByText('Preview, not saved')).toBeVisible()
  await expect(page.getByText('save to send for approval')).toBeVisible()

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByText('Preview, not saved')).toHaveCount(0)
  await expect(page.getByText('Created by Asha')).toBeVisible()
})

test('the risk curve loads for the live budget', async ({ page }) => {
  await signIn(page, 'ravi')
  await side(page).getByRole('tab', { name: 'Risk curve' }).click()
  await expect(side(page)).toContainText('Risk 0.3 gives up', { timeout: 20_000 })
  await expect(side(page).getByRole('img')).toBeVisible()
})

test('nobody approves their own plan', async ({ page }) => {
  await signIn(page, 'ravi')
  await riskSlider(page).fill('0.5')
  await expect(page.getByText('Preview, not saved')).toBeVisible()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/^Plan #2 saved/)).toBeVisible()
  await expect(side(page)).toContainText('You made this plan, so someone else must approve it.')
  await expect(side(page).getByRole('button', { name: 'Approve line' })).toHaveCount(0)
})

test("another company can't see the plans", async ({ page }) => {
  await signIn(page, 'zed')
  await expect(page.getByRole('banner')).toContainText('Other Distributor')
  await expect(page.getByText('Preview, not saved')).toBeVisible()
  await expect(page.getByText('Created by')).toHaveCount(0)
})
