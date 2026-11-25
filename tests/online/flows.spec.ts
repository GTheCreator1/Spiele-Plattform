import { chromium, devices, expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

const verified = 'Kartenmischung und Spielverlauf nachgerechnet.'

async function createRoom(host: Page, name: string, game: 'xeri' | 'ab6super6', seats: number) {
  await host.goto(`./#/spiele/${game}`)
  await host.getByLabel('Spitzname').fill(name)
  await host.getByLabel('Spielerplätze').selectOption(String(seats))
  await host.getByRole('button', { name: 'Privaten Raum erstellen' }).click()
  await expect(host.getByText('Spielraum ist erreichbar.')).toBeVisible()
  const link = await host.getByLabel('Einladungslink', { exact: true }).inputValue()
  expect(new URL(link).hash).toMatch(/^#\/lobby\/[0-9a-f]{48}$/)
  return link
}

async function joinRoom(guest: Page, name: string, link: string) {
  await guest.goto(link)
  await guest.getByLabel('Spitzname').fill(name)
  await guest.getByRole('button', { name: 'Raum beitreten' }).click()
  await expect(guest.getByText('Mit dem Host verbunden.')).toBeVisible({ timeout: 15_000 })
  await guest.getByRole('button', { name: 'Bereit', exact: true }).click()
}

function hand(page: Page) {
  return page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
}

function messageBox(page: Page) {
  return page.getByRole('textbox', { name: 'Nachricht', exact: true })
}

test('Einladungslink, separater Chromium, Chat, Reconnect und zwei vollständige Xeri-Modi', async ({ browser, baseURL }) => {
  const second = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  })
  const hostContext = await browser.newContext({ baseURL, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  const guestContext = await second.newContext({ baseURL, reducedMotion: 'reduce' })
  try {
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    const link = await createRoom(host, 'Alex', 'xeri', 2)
    await host.getByRole('button', { name: 'Link kopieren' }).click()
    await expect(host.getByText('Link kopiert.', { exact: true })).toBeVisible()
    expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(link)
    await joinRoom(guest, 'Jamie', link)
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    await expect(hand(host)).toHaveCount(4)
    await expect(hand(guest)).toHaveCount(4)
    const labels = await hand(guest).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
    const other = await hand(host).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
    expect(labels.every((card) => !other.includes(card))).toBe(true)
    await expect(guest.getByRole('button', { name: 'Partie starten', exact: true })).toHaveCount(0)

    await host.getByRole('button', { name: 'Öffnen', exact: true }).click()
    const text = '<mark> & Schönes Spiel ♥'
    await messageBox(host).fill(text)
    await host.getByRole('button', { name: 'Senden', exact: true }).click()
    await guest.getByRole('button', { name: 'Öffnen (1)' }).click()
    await expect(guest.getByText(text, { exact: true })).toBeVisible()
    await expect(guest.getByRole('list', { name: 'Chatnachrichten' }).locator('mark')).toHaveCount(0)

    await guestContext.setOffline(true)
    await expect(host.getByText('Die Partie wartet auf alle Mitspieler.')).toBeVisible({ timeout: 15_000 })
    await expect(hand(host).first()).toBeDisabled()
    await guestContext.setOffline(false)
    await expect(guest.getByText('Mit dem Host verbunden.')).toBeVisible({ timeout: 15_000 })
    await guest.reload()
    await expect(hand(guest)).toHaveCount(4, { timeout: 15_000 })
    expect(await hand(guest).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))).toEqual(labels)

    for (let move = 0; move < 48; move++) await hand(move % 2 === 0 ? host : guest).first().click()
    await expect(host.getByText(verified, { exact: true })).toBeVisible()
    await expect(guest.getByText(verified, { exact: true })).toBeVisible()
    await host.getByRole('button', { name: 'Raum verlassen' }).click()
    await expect(guest.getByText('Der Host hat den Raum geschlossen.')).toBeVisible()

    const teams = await createRoom(host, 'Alex', 'xeri', 4)
    await joinRoom(guest, 'Jamie', teams)
    for (let bot = 0; bot < 2; bot++) await host.getByRole('button', { name: 'Bot hinzufügen' }).first().click()
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    await expect(host.getByText('Dein Team', { exact: true })).toBeVisible()
    for (let move = 0; move < 24; move++) await hand(move % 2 === 0 ? host : guest).first().click()
    await expect(host.getByText(verified, { exact: true })).toBeVisible()
    await expect(guest.getByText(verified, { exact: true })).toBeVisible()
  } finally {
    await hostContext.close()
    await guestContext.close()
    await second.close()
  }
})

test('ab6super6 mit sechs Personen, privater Startsicht und kompletter Schlussrunde', async ({ browser, baseURL }) => {
  const contexts: BrowserContext[] = []
  try {
    const hostContext = await browser.newContext({ baseURL })
    contexts.push(hostContext)
    const host = await hostContext.newPage()
    const link = await createRoom(host, 'Eins', 'ab6super6', 6)
    const pages = [host]
    for (const [index, name] of ['Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'].entries()) {
      const context = await browser.newContext(index === 0 ? { baseURL, ...devices['iPhone 13'] } : { baseURL })
      contexts.push(context)
      const guest = await context.newPage()
      pages.push(guest)
      await joinRoom(guest, name, link)
    }
    await expect(host.getByText('Privater Raum · 6/6 Plätze')).toBeVisible()
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    const guest = pages[1]!
    const own = host.getByRole('region', { name: 'Deine Auslage' })
    await host.getByRole('button', { name: 'Untere Karten ansehen' }).click()
    await expect(own.getByRole('button', { name: /Verdeckt/ })).toHaveCount(2)
    await expect(guest.getByRole('region', { name: 'Auslage von Eins' }).getByRole('button', { name: /Verdeckt/ })).toHaveCount(4)
    await expect.poll(() => guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await guest.setViewportSize({ width: 844, height: 390 })
    await expect.poll(() => guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
    for (const page of pages) await page.getByRole('button', { name: 'Verdecken und bereit' }).click()

    await host.getByRole('button', { name: 'Klopfen', exact: true }).click()
    for (const [index, page] of [...pages.slice(1), host].entries()) {
      await page.getByRole('button', { name: 'Karte ziehen' }).click()
      await page.getByRole('button', { name: 'Gezogene Karte ablegen' }).click()
      await expect(page.getByRole('button', { name: 'Gezogene Karte ablegen' })).toHaveCount(0)
      const skip = page.getByRole('button', { name: 'Auslassen', exact: true })
      if (await skip.isVisible()) await skip.click()
      if (index === 0) {
        await host.evaluate(() => {
          const observer = new MutationObserver(() => {
            if (document.querySelector('.flight-layer')) {
              document.documentElement.dataset.throwAnimated = 'yes'
              observer.disconnect()
            }
          })
          observer.observe(document.body, { childList: true })
        })
        await host.getByRole('button', { name: 'Reinwerfen', exact: true }).click()
        await own.getByRole('button', { name: /Platz 1 .*Verdeckt/ }).click()
        await expect(host.locator('html')).toHaveAttribute('data-throw-animated', 'yes')
        if (await host.getByRole('button', { name: 'Auslassen', exact: true }).isVisible()) {
          await host.getByRole('button', { name: 'Auslassen', exact: true }).click()
        }
      }
    }
    for (const page of pages) {
      await expect(page.getByText('Endwertung', { exact: true })).toBeVisible()
      await expect(page.getByText(verified, { exact: true })).toBeVisible()
    }
    await expect(own.getByRole('button', { name: /Verdeckt/ })).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
