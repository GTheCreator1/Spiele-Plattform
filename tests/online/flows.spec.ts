import { chromium, devices, expect, test } from '@playwright/test'
import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test'
import { createRoom, hand, joinRoom } from './room'

const verified = 'Kartenmischung und Spielverlauf nachgerechnet.'

function messageBox(page: Page) {
  return page.getByRole('textbox', { name: 'Nachricht', exact: true })
}

function ownNumbers(page: Page) {
  return page.getByRole('region', { name: 'Deine Handkarten' }).locator('.theslibbi-card-value')
}

function playNumber(page: Page, card?: number) {
  return page.getByRole('button', { name: card === undefined ? /Karte \d+ ausspielen/ : `Karte ${card} ausspielen`, exact: true })
}

async function readNumberLevel(pages: Page[], level: number, levelCount: number) {
  const hands = await Promise.all(pages.map(async (page, seat) => {
    await expect(page.getByRole('heading', { name: `Level ${level} von ${levelCount}`, exact: true })).toBeVisible()
    await expect(ownNumbers(page)).toHaveCount(level)
    await expect(page.getByRole('list', { name: 'Andere Hände' }).locator('.theslibbi-card-value')).toHaveCount(0)
    const cards = await ownNumbers(page).allTextContents()
    return cards.map((card) => ({ seat, card: Number(card) }))
  }))
  const dealt = hands.flat().sort((first, second) => first.card - second.card)
  expect(new Set(dealt.map(({ card }) => card)).size).toBe(dealt.length)
  return dealt
}

async function startNumberRound(pages: Page[], levelCount: number) {
  await pages[0]!.getByRole('button', { name: 'Partie starten', exact: true }).click()
  return readNumberLevel(pages, 1, levelCount)
}

async function playNumberLevel(pages: Page[], dealt: Awaited<ReturnType<typeof readNumberLevel>>, discarded = 0) {
  for (const [index, { seat, card }] of dealt.slice(discarded).entries()) {
    const page = pages[seat]!
    await expect(page.getByText(`${discarded + index} von ${dealt.length} abgelegt`, { exact: true })).toBeVisible()
    await playNumber(page, card).click()
  }
}

async function completeNumberRound(pages: Page[], levelCount: number, lives: number, startLevel = 1, initialScore = 0) {
  let dealt: Awaited<ReturnType<typeof readNumberLevel>> = []
  let score = initialScore
  for (let level = startLevel; level <= levelCount; level++) {
    dealt = await readNumberLevel(pages, level, levelCount)
    for (const page of pages) {
      await expect(page.getByText(score === 1 ? '1 Punkt' : `${score} Punkte`, { exact: true })).toBeVisible()
      await expect(page.getByText(`${lives} von ${pages.length} Leben`, { exact: true })).toBeVisible()
      if (level === levelCount) {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      }
    }
    await playNumberLevel(pages, dealt)
    score += dealt.length
  }
  for (const page of pages) {
    await expect(page.getByRole('heading', { name: 'Runde gewonnen' })).toBeVisible()
    await expect(page.getByText(verified, { exact: true })).toBeVisible()
    await expect(page.getByText(`${score} Punkte`, { exact: true })).toBeVisible()
    const pile = page.getByRole('region', { name: 'Gemeinsame Ablage' })
    await expect(pile.getByRole('listitem')).toHaveText(dealt.slice(0, -1).map(({ card }) => String(card)))
    await expect(pile.getByRole('img', { name: `Zahlenkarte ${dealt.at(-1)!.card}` })).toBeVisible()
  }
}

test('THESLIBBI zeigt zu viert dieselben übersprungenen Karten und synchronisiert den Wiedereinstieg', async ({ browser, baseURL }, info) => {
  const secondBrowser = await chromium.launch(info.project.use.launchOptions)
  const contexts = await Promise.all([
    browser.newContext({ baseURL, reducedMotion: 'no-preference' }),
    secondBrowser.newContext({ ...devices['iPhone 13'], baseURL }),
    secondBrowser.newContext({ ...devices['iPad (gen 7)'], baseURL }),
    browser.newContext({ baseURL }),
  ])
  try {
    const [hostContext, phoneContext, tabletContext, guestContext] = contexts
    const [host, phone, tablet, guest] = await Promise.all([
      hostContext.newPage(), phoneContext.newPage(), tabletContext.newPage(), guestContext.newPage(),
    ])
    const link = await createRoom(host, 'Mika', 'theslibbi', 4)
    await expect(host.getByRole('button', { name: 'Partie starten', exact: true })).toBeDisabled()
    await joinRoom(phone, 'Kim', link)
    await joinRoom(tablet, 'Toni', link)
    await joinRoom(guest, 'Robin', link)

    const ready = 'Alle Plätze sind verbunden und bereit.'
    const guests = [phone, tablet, guest]
    const pages = [host, ...guests]
    const names = ['Mika', 'Kim', 'Toni', 'Robin']
    for (const page of pages) {
      await expect(page.getByRole('heading', { name: 'THESLIBBI', exact: true })).toBeVisible()
      await expect(page.getByText('Privater Raum · 4/4 Plätze')).toBeVisible()
      await expect(page.getByText(ready, { exact: true })).toBeVisible()
      await expect(page.locator('.member-row strong')).toHaveText(names)
      if (page !== host) await expect(page.getByRole('button', { name: 'Partie starten', exact: true })).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }

    await Promise.all(guests.map((page) => page.getByRole('button', { name: 'Warten', exact: true }).click()))
    await expect(host.locator('.member-row').getByText('Wartet', { exact: true })).toHaveCount(3)
    await Promise.all(guests.map((page) => page.getByRole('button', { name: 'Bereit', exact: true }).click()))
    await expect(host.getByText(ready, { exact: true })).toBeVisible()

    await host.getByRole('button', { name: 'Öffnen', exact: true }).click()
    await messageBox(host).fill('Alle da?')
    await host.getByRole('button', { name: 'Senden', exact: true }).click()
    await phone.getByRole('button', { name: 'Öffnen (1)', exact: true }).click()
    await expect(phone.getByRole('list', { name: 'Chatnachrichten' }).getByText('Alle da?')).toBeVisible()

    const dealt = await startNumberRound(pages, 8)
    await phone.setViewportSize({ width: 320, height: 740 })
    await phone.emulateMedia({ reducedMotion: 'reduce' })
    await expect(phone.locator('.theslibbi-hand-slot').first()).toHaveCSS('animation-name', 'none')
    await expect(host.locator('.theslibbi-hand-slot').first()).toHaveCSS('animation-name', 'theslibbi-deal')
    for (const page of pages) {
      await expect(page.getByText('Der Chat pausiert während der Sortierrunde.')).toBeVisible()
      await expect(messageBox(page)).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }

    const wrong = dealt[2]!
    const remaining = dealt[3]!
    const skippedLabels = dealt.slice(0, 2).map(({ card, seat }) => `${card} · ${names[seat]}`)
    const skippedCards = (page: Page) => page.getByRole('region', { name: 'Übersprungene Karten' }).getByRole('listitem')
    await playNumber(pages[wrong.seat]!, wrong.card).click()
    for (const page of pages) {
      await expect(page.getByText('3 von 4 Leben')).toBeVisible()
      await expect(page.getByText('3 von 4 abgelegt')).toBeVisible()
      await expect(page.getByText('0 Punkte', { exact: true })).toBeVisible()
      await expect(skippedCards(page)).toHaveText(skippedLabels)
      await expect(page.getByRole('region', { name: 'Gemeinsame Ablage' }).getByRole('img', { name: `Zahlenkarte ${wrong.card}` })).toBeVisible()
    }
    for (const [seat, page] of pages.entries()) {
      await expect(ownNumbers(page)).toHaveText(seat === remaining.seat ? [String(remaining.card)] : [])
    }
    await playNumberLevel(pages, dealt, 3)
    await readNumberLevel(pages, 2, 8)
    for (const page of pages) await expect(page.getByText(`Level 1 mit der ${remaining.card} abgeschlossen.`)).toBeVisible()

    const guestHand = await ownNumbers(guest).allTextContents()
    await guestContext.setOffline(true)
    for (const page of [host, tablet]) {
      await expect(page.getByText('Die Partie wartet auf alle Mitspieler.')).toBeVisible({ timeout: 15_000 })
      await expect(playNumber(page)).toBeDisabled()
    }
    await guestContext.setOffline(false)
    await expect(guest.getByText('Mit dem Host verbunden.')).toBeVisible({ timeout: 20_000 })
    await expect(playNumber(host)).toBeEnabled()
    await expect(guest.getByRole('heading', { name: 'Level 2 von 8', exact: true })).toBeVisible()
    await expect(ownNumbers(guest)).toHaveText(guestHand)
    await expect(skippedCards(guest)).toHaveText(skippedLabels)

    await completeNumberRound(pages, 8, 3, 2, 1)
    await expect(phone.getByRole('heading', { name: 'Lobbychat' })).toBeVisible()
    await expect(phone.getByText('Der Chat pausiert während der Sortierrunde.')).toHaveCount(0)
    await host.getByRole('button', { name: 'Zurück zur Lobby' }).click()
    await guest.getByRole('button', { name: 'Raum verlassen', exact: true }).click()
    await expect(host.getByText('Privater Raum · 3/4 Plätze')).toBeVisible()
    await expect(phone.getByText('Freier Platz', { exact: true })).toHaveCount(1)
    await host.getByRole('button', { name: 'Raum verlassen', exact: true }).click()
    await expect(phone.getByText('Der Host hat den Raum geschlossen.')).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await secondBrowser.close()
  }
})

for (const [size, levelCount] of [[2, 12], [3, 10]] as const) {
  test(`THESLIBBI beendet ${levelCount} Level mit ${size} Personen`, async ({ browser, baseURL }) => {
    const contexts = await Promise.all(Array.from({ length: size }, () => browser.newContext({ baseURL, reducedMotion: 'reduce' })))
    try {
      const pages = await Promise.all(contexts.map((context) => context.newPage()))
      const link = await createRoom(pages[0]!, 'Mika', 'theslibbi', size)
      for (const [seat, page] of pages.slice(1).entries()) await joinRoom(page, `Gast ${seat + 1}`, link)
      await startNumberRound(pages, levelCount)
      await completeNumberRound(pages, levelCount, size)
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  })
}

test('THESLIBBI beendet Level 2 bei null Leben und setzt Level und Punkte bei einer neuen Partie zurück', async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 2 }, () => browser.newContext({ baseURL, reducedMotion: 'reduce' })))
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    const link = await createRoom(pages[0]!, 'Mika', 'theslibbi', 2)
    await joinRoom(pages[1]!, 'Kim', link)
    const first = (await startNumberRound(pages, 12)).at(-1)!
    await playNumber(pages[first.seat]!, first.card).click()
    const dealt = await readNumberLevel(pages, 2, 12)
    for (const page of pages) await expect(page.getByText('1 von 2 Leben')).toBeVisible()
    const wrong = dealt.find(({ seat }) => seat !== dealt[0]!.seat)!
    await playNumber(pages[wrong.seat]!, wrong.card).click()
    for (const [seat, page] of pages.entries()) {
      await expect(page.getByRole('heading', { name: 'Runde verloren' })).toBeVisible()
      await expect(playNumber(page)).toHaveCount(0)
      const higher = dealt.filter((entry) => entry.seat === seat && entry.card > wrong.card).map(({ card }) => String(card))
      await expect(ownNumbers(page)).toHaveText(higher)
      await expect(page.getByText('0 Punkte', { exact: true })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Übersprungene Karten' }).getByRole('listitem')).toHaveCount(
        1 + dealt.filter(({ card }) => card < wrong.card).length,
      )
      await expect(page.getByRole('list', { name: 'Andere Hände' }).locator('.theslibbi-card-value')).toHaveCount(0)
      await expect(page.getByText(verified, { exact: true })).toHaveCount(0)
    }
    await pages[0]!.getByRole('button', { name: 'Zurück zur Lobby' }).click()
    await pages[1]!.getByRole('button', { name: 'Bereit', exact: true }).click()
    await startNumberRound(pages, 12)
    for (const page of pages) {
      await expect(page.getByText('0 Punkte', { exact: true })).toBeVisible()
      await expect(page.getByText('2 von 2 Leben', { exact: true })).toBeVisible()
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

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
