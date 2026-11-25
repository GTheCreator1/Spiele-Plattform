import { chromium, devices, expect, test } from '@playwright/test'
import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test'
import { createRoom, hand, joinRoom } from './room'

const verified = 'Kartenmischung und Spielverlauf nachgerechnet.'

function messageBox(page: Page) {
  return page.getByRole('textbox', { name: 'Nachricht', exact: true })
}

test('Einladungslink, separater Chromium, Chat, Reconnect und zwei vollständige Xeri-Modi', async ({ browser, baseURL }, info) => {
  const second = await chromium.launch(info.project.use.launchOptions)
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
    const hostContext = await browser.newContext({ baseURL, reducedMotion: 'no-preference' })
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
    await guest.setViewportSize({ width: 320, height: 740 })
    await expect.poll(() => guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
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
        await host.bringToFront()
        await expect.poll(() => host.evaluate(() => document.visibilityState)).toBe('visible')
        const throwButton = host.getByRole('button', { name: 'Reinwerfen', exact: true })
        await expect(throwButton).toBeVisible()
        await expect(host.locator('.flight-layer')).toHaveCount(0)
        await host.evaluate(() => {
          const observer = new MutationObserver(() => {
            if (document.querySelector('.flight-layer')) {
              document.documentElement.dataset.throwAnimated = 'yes'
              observer.disconnect()
            }
          })
          observer.observe(document.body, { childList: true })
        })
        await throwButton.click()
        const target = own.getByRole('button', { name: /Platz 1 .*Verdeckt/ })
        await target.click()
        await expect(target).toHaveCount(0)
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

test('Xeri mit vier Menschen behält die Partie nach Signalisierungs- und Host-Ausfall', async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ baseURL, reducedMotion: 'reduce' })))
  try {
    const [host, first, second, third] = await Promise.all(contexts.map((context) => context.newPage())) as [Page, Page, Page, Page]
    const hostContext = contexts[0]!
    const signals: WebSocketRoute[] = []
    let allowSignaling = true
    await hostContext.routeWebSocket('ws://127.0.0.1:8790/**', (socket) => {
      if (allowSignaling) {
        socket.connectToServer()
        signals.push(socket)
      } else void socket.close()
    })
    const link = await createRoom(host, 'Nord', 'xeri', 4)
    await joinRoom(first, 'Ost', link)
    await joinRoom(second, 'Süd', link)
    await joinRoom(third, 'West', link)
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    for (const page of [host, first, second, third]) await expect(hand(page)).toHaveCount(4)

    allowSignaling = false
    await signals.at(-1)!.close()
    await expect(host.getByRole('button', { name: 'Erneut verbinden' })).toBeVisible()
    await hand(host).first().click()
    await hand(first).first().click()
    await expect(hand(host)).toHaveCount(3)
    allowSignaling = true
    await host.getByRole('button', { name: 'Erneut verbinden' }).click()
    await expect(host.getByText('Spielraum ist erreichbar.')).toBeVisible({ timeout: 15_000 })

    const name = await hand(second).first().getAttribute('aria-label')
    await hostContext.setOffline(true)
    await expect(host.getByRole('button', { name: 'Erneut verbinden' })).toBeVisible()
    await expect(hand(second).first()).toBeDisabled({ timeout: 20_000 })
    await hostContext.setOffline(false)
    await expect(hand(second).first()).toBeEnabled({ timeout: 25_000 })
    await expect(hand(second).first()).toHaveAttribute('aria-label', name!)

    const pages = [host, first, second, third]
    for (let move = 2; move < 48; move++) await hand(pages[move % 4]!).first().click()
    for (const page of pages) await expect(page.getByText(verified, { exact: true })).toBeVisible()
    await host.close()
    await expect(first.getByRole('button', { name: 'Erneut verbinden' })).toBeVisible({ timeout: 25_000 })
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('ab6super6 synchronisiert zwei Reinwürfe im selben Zwei-Sekunden-Fenster', async ({ browser, baseURL }) => {
  const [hostContext, nextContext, otherContext] = await Promise.all([
    browser.newContext({ baseURL, reducedMotion: 'reduce' }),
    browser.newContext({ baseURL, reducedMotion: 'reduce' }),
    browser.newContext({ baseURL, reducedMotion: 'reduce' }),
  ])
  try {
    const [host, next, other] = await Promise.all([hostContext.newPage(), nextContext.newPage(), otherContext.newPage()])
    const link = await createRoom(host, 'Eins', 'ab6super6', 3)
    await joinRoom(next, 'Zwei', link)
    await joinRoom(other, 'Drei', link)
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    for (const page of [host, next, other]) await page.getByRole('button', { name: 'Verdecken und bereit' }).click()
    await host.getByRole('button', { name: 'Karte ziehen' }).click()
    await host.getByRole('button', { name: 'Gezogene Karte ablegen' }).click()
    const targets = [host, other].map((page) => page.getByRole('region', { name: 'Deine Auslage' }).getByRole('button', { name: /Platz 1 .*Verdeckt/ }))

    for (const page of [host, other]) await page.getByRole('button', { name: 'Reinwerfen', exact: true }).click()
    await expect(pageDrawnBy(next)).toHaveCount(0)
    await next.getByRole('button', { name: 'Karte ziehen' }).click()
    await expect(pageDrawnBy(host)).toHaveAttribute('aria-label', 'Gezogen: Verdeckt')
    await Promise.all(targets.map((target) => target.click()))
    for (const target of targets) await expect(target).toHaveCount(0)
    await expect(host.getByRole('region', { name: 'Auslage von Drei' }).getByRole('button', { name: /Platz 1 .*Verdeckt/ })).toHaveCount(0)

    const pile = (page: Page) => page.locator('[data-flight="pile"]')
    const finalTop = await pile(host).getAttribute('aria-label')
    for (const page of [next, other]) await expect(pile(page)).toHaveAttribute('aria-label', finalTop!)
    for (const page of [host, next, other]) await expect(page.getByRole('button', { name: 'Reinwerfen', exact: true })).toHaveCount(0)
  } finally {
    await Promise.all([hostContext.close(), nextContext.close(), otherContext.close()])
  }
})

function pageDrawnBy(page: Page) {
  return page.getByLabel(/^Gezogen:/)
}
