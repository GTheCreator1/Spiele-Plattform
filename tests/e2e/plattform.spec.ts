import { expect, test } from '@playwright/test'

test('Katalog und soziale Ansichten wechseln innerhalb desselben Dokuments', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Willkommen am Spieltisch.' })).toBeVisible()
  await page.locator('html').evaluate((element) => { element.dataset.spaTest = 'offen' })
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' }).filter({ visible: true })

  await nav.getByRole('link', { name: 'Spiele', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Spielebibliothek', level: 1 })).toBeVisible()
  const catalog = page.getByRole('region', { name: 'Spielebibliothek' })
  await expect(catalog.getByRole('link')).toHaveCount(4)
  await catalog.getByRole('button', { name: 'Spielbar', exact: true }).click()
  await expect(catalog.getByRole('link')).toHaveCount(1)
  await catalog.getByRole('button', { name: 'In Entwicklung', exact: true }).click()
  await expect(catalog.getByRole('link')).toHaveCount(3)
  await catalog.getByRole('link', { name: 'ab6super6' }).click()
  await expect(page.getByRole('heading', { name: 'ab6super6', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Partie starten' })).toHaveCount(0)

  await nav.getByRole('link', { name: 'Freunde' }).click()
  await page.getByRole('button', { name: 'Anfragen' }).click()
  await expect(page.getByRole('heading', { name: 'Freundschaftsanfragen' })).toBeVisible()
  await nav.getByRole('link', { name: 'Nachrichten' }).click()
  await expect(page.getByRole('heading', { name: 'Ingame-Chat' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-spa-test', 'offen')
})

test('Einladungsfenster und Geräteeinstellungen funktionieren bei direktem Aufruf', async ({ page }) => {
  await page.goto('./#/profil')
  await expect(page.getByRole('heading', { name: 'Profil und Einstellungen' })).toBeVisible()
  const motion = page.getByRole('switch', { name: 'Animationen' })
  const sound = page.getByRole('switch', { name: 'Soundeffekte' })
  await expect(motion).toBeChecked()
  await motion.uncheck()
  await sound.uncheck()
  await page.reload()
  await expect(motion).not.toBeChecked()
  await expect(sound).not.toBeChecked()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-motion', 'off')

  const invitations = page.getByRole('button', { name: 'Einladungen', exact: true })
  await invitations.click()
  const dialog = page.getByRole('dialog', { name: 'Einladungen' })
  await expect(dialog.getByRole('heading', { name: 'In Entwicklung' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(invitations).toBeFocused()
})

test('Xeri startet aus dem Katalog und akzeptiert einen Zug ohne Überlauf', async ({ page, isMobile }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Xeri spielen' }).click()
  await page.getByRole('radio', { name: 'Schwer' }).check()
  await page.getByRole('link', { name: 'Partie starten' }).click()
  await expect(page.getByText('Gegen Computer · Schwer')).toBeVisible()
  const hand = page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
  await expect(hand).toHaveCount(4)
  await hand.first().click()
  await expect(hand).toHaveCount(3)
  await expect(page.getByRole('status')).toContainText('Du bist am Zug')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  )
  await expect(hand.first()).toBeEnabled()

  if (isMobile) {
    await page.setViewportSize({ width: 844, height: 390 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
    await hand.first().tap()
    await expect(hand).toHaveCount(2)
  }
})
