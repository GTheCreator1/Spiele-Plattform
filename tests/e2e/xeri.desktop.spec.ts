import { expect, test } from '@playwright/test'

test('Xeri zählt nach 48 Zügen alle Karten und startet eine Revanche', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#/spiele/xeri/tisch?stufe=easy')
  await expect(page.getByText('Austeilung 1 von 6')).toBeVisible()
  const hand = page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')

  for (let move = 0; move < 24; move++) {
    await expect(hand.first()).toBeEnabled()
    await hand.first().click()
  }

  await expect(page.getByRole('status')).toHaveText(/Partie beendet/)
  await expect(page.getByText('Austeilung 6 von 6')).toBeVisible()
  await expect(hand).toHaveCount(0)
  const scores = await page.getByRole('group', { name: /Punktestand / }).allTextContents()
  expect(scores).toHaveLength(2)
  const cards = scores.map((text) => Number(text.match(/(\d+) Karten/)?.[1]))
  expect(cards.reduce((total, value) => total + value, 0)).toBe(52)
  await expect(page.locator('.flight-layer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Revanche' }).click()
  await expect(page.getByText('Austeilung 1 von 6')).toBeVisible()
  await expect(hand).toHaveCount(4)
})

test('Größenwechsel während eines Kartenflugs hält den Spielzug fest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./#/spiele/xeri/tisch')
  const hand = page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
  await hand.first().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.flight-layer')).toHaveCount(1, { timeout: 450 })
  await page.setViewportSize({ width: 430, height: 760 })
  await expect(page.locator('.flight-layer')).toHaveCount(0, { timeout: 450 })
  await expect(hand).toHaveCount(3)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toContainText('Du bist am Zug')
})

test('der Produktionsbuild startet Xeri nach Verbindungsverlust', async ({ page, context }) => {
  await page.goto('./')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Offline. Bereits gespeicherte Inhalte bleiben verfügbar.')).toBeVisible()
  await page.getByRole('link', { name: 'Xeri spielen' }).click()
  await page.getByRole('link', { name: 'Partie starten' }).click()
  await expect(page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')).toHaveCount(4)
})
