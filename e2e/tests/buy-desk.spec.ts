import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Written by start-api.mjs when the API starts: { asha, ravi, meera, zed }
const keys = (): Record<string, string> => JSON.parse(readFileSync(join(import.meta.dirname, '..', '.tmp', 'keys.json'), 'utf8'))

async function signIn(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('API key').fill(keys()[name])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

const rows = (page: Page) => page.getByRole('table', { name: 'Buy list' }).locator('tbody tr')
const why = (page: Page) => page.getByRole('complementary')

test.describe.configure({ mode: 'serial' })

test('the demo opens without an API key', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the demo' }).click()
  await expect(page.getByRole('heading', { name: /December buy plan/ })).toBeVisible()
  await expect(rows(page)).toHaveCount(40)
  await expect(why(page).getByRole('heading', { name: 'Udaipur · Hotel A' })).toBeVisible()
})

test('a wrong key is refused', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('API key').fill('vy_not-a-real-key')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('That API key was not accepted.')
})

test('a buyer creates a plan but cannot approve it', async ({ page }) => {
  await signIn(page, 'asha')
  await expect(page.getByRole('heading', { name: 'No plans yet' })).toBeVisible()

  await page.getByRole('button', { name: 'Create plan' }).click()
  await expect(page.getByText(/^Plan #1: 40 lines/)).toBeVisible()
  await expect(rows(page)).toHaveCount(40)
  await expect(page.getByText('Created by Asha')).toBeVisible()

  await why(page).getByRole('button', { name: 'Approve line' }).click()
  await expect(page.getByRole('alert')).toContainText('needs role: approver or admin')
  await expect(rows(page).first()).toContainText('Pending')
})

test("an approver decides lines on someone else's plan", async ({ page }) => {
  await signIn(page, 'ravi')
  await expect(rows(page)).toHaveCount(40)

  await why(page).getByRole('button', { name: 'Approve line' }).click()
  await expect(rows(page).nth(0)).toContainText('Approved')
  // selection moves on to the next pending line
  await expect(why(page).getByText('Pending')).toBeVisible()
  await why(page).getByRole('button', { name: 'Reject' }).click()
  await expect(rows(page).nth(1)).toContainText('Rejected')
  await expect(page.getByText('1 rejected · 38 waiting')).toBeVisible()
})

test('decisions are final and survive a reload', async ({ page }) => {
  await signIn(page, 'meera')
  await expect(rows(page).nth(0)).toContainText('Approved')
  await rows(page).nth(0).click()
  await expect(why(page)).toContainText('Approved by Ravi')
  await expect(why(page).getByRole('button', { name: 'Approve line' })).toHaveCount(0)
})

test('the plan exports as CSV', async ({ page }) => {
  await signIn(page, 'ravi')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV' }).click()
  expect((await download).suggestedFilename()).toBe('plan-1.csv')
})

test("another company can't see the plan", async ({ page }) => {
  await signIn(page, 'zed')
  await expect(page.getByRole('heading', { name: 'No plans yet' })).toBeVisible()
})
