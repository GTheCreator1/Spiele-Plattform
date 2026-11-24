import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const password = 'Browser-Tests-2026!'
const nextPassword = 'Wiederherstellung-2026!'
const invitedWith = process.env.STICHRUNDE_TEST_INVITE!
const suffix = () => randomBytes(3).toString('hex')

async function register(page: Page, username: string, withInvalidInvite = false) {
  await page.goto('./#/profil')
  await page.getByRole('button', { name: 'Konto erstellen' }).click()
  await page.getByLabel('Benutzername').fill(username)
  await page.getByLabel('Passwort', { exact: false }).first().fill(password)
  await page.getByLabel('Passwort wiederholen').fill(password)
  await page.getByLabel('Einladungscode').fill(withInvalidInvite ? 'ungueltig' : invitedWith)
  await page.getByRole('button', { name: 'Konto erstellen' }).click()
  if (withInvalidInvite) {
    await expect(page.getByRole('alert')).toContainText('Einladungscode ist ungültig')
    await page.getByLabel('Benutzername').fill(username)
    await page.locator('input[name=password]').fill(password)
    await page.getByLabel('Passwort wiederholen').fill(password)
    await page.getByLabel('Einladungscode').fill(invitedWith)
    await page.getByRole('button', { name: 'Konto erstellen' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Recovery-Codes sichern' })).toBeVisible()
  const codes = await page.locator('code').allTextContents()
  expect(codes).toHaveLength(3)
  await page.getByRole('link', { name: 'Weiter zur Plattform' }).click()
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible()
  return codes
}

async function makeFriends(first: Page, second: Page, name: string) {
  await first.getByRole('link', { name: 'Freunde', exact: true }).click()
  await second.getByRole('link', { name: 'Freunde', exact: true }).click()
  await first.getByLabel('Benutzername').fill(name)
  await first.getByRole('button', { name: 'Suchen' }).click()
  await first.getByRole('button', { name: 'Anfragen' }).click()
  await expect(first.getByText('Anfrage offen')).toBeVisible()
  await second.getByRole('button', { name: 'Annehmen' }).click()
  await expect(first.getByRole('button', { name: 'Entfernen' })).toBeVisible()
}

async function createLobby(host: Page, guest: Page, game: 'xeri' | 'ab6super6', seats: string) {
  await host.goto(`./#/spiele/${game}`)
  await host.getByLabel('Spielerplätze').selectOption(seats)
  await host.getByRole('button', { name: 'Private Lobby erstellen' }).click()
  await host.getByRole('button', { name: 'Einladen', exact: true }).click()
  await guest.getByRole('button', { name: /^Einladungen/ }).click()
  await guest.getByRole('dialog').getByRole('button', { name: 'Annehmen' }).click()
  await expect(guest.getByRole('heading', { name: 'Spielplätze' })).toBeVisible()
  await guest.getByRole('button', { name: 'Bereit', exact: true }).click()
  if (game === 'xeri' && seats === '4') {
    for (let index = 0; index < 2; index++) await host.getByRole('button', { name: 'Bot hinzufügen' }).first().click()
  }
  await host.getByRole('button', { name: 'Partie starten' }).click()
}

test('getrennte Konten, Live-Freundschaft, Einladung, Chat und beide Xeri-Onlinemodi', async ({ browser, baseURL, request }) => {
  const hostContext = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const guestContext = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  try {
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    const uri = 'http://127.0.0.1:8789/api/state'
    const blocked = await request.get(uri, { headers: { Origin: 'https://different.example' } })
    expect(blocked.status()).toBe(403)
    const denied = await request.get(uri, { headers: { Origin: new URL(baseURL!).origin } })
    expect(denied.status()).toBe(401)
    const name = `Gast_${suffix()}`
    await register(host, `Host_${suffix()}`, true)
    await register(guest, name)
    await makeFriends(host, guest, name)
    await createLobby(host, guest, 'xeri', '2')
    const hostHand = host.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
    const guestHand = guest.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
    await expect(hostHand).toHaveCount(4)
    await expect(guestHand).toHaveCount(4)
    const ownCards = await hostHand.evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
    const otherCards = await guestHand.evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
    expect(ownCards.every((label) => !otherCards.includes(label))).toBe(true)

    await host.getByRole('button', { name: 'Öffnen', exact: true }).click()
    await host.getByRole('textbox', { name: 'Nachricht', exact: true }).fill('Hallo <Gruppe> & Schönes Spiel ♥')
    await host.getByRole('button', { name: 'Senden', exact: true }).click()
    await guest.getByRole('button', { name: 'Öffnen (1)' }).click()
    await expect(guest.getByText('Hallo <Gruppe> & Schönes Spiel ♥', { exact: true })).toBeVisible()

    await guest.reload()
    await expect(guestHand).toHaveCount(4)
    await expect(guestHand.first()).toBeDisabled()
    for (let move = 0; move < 48; move++) {
      const active = move % 2 === 0 ? hostHand : guestHand
      await active.first().click()
    }
    await expect(host.getByRole('status')).toContainText('Partie beendet')
    await expect(guest.getByRole('status')).toContainText('Partie beendet')
    await expect(hostHand).toHaveCount(0)
    await expect(guestHand).toHaveCount(0)
    await host.getByRole('button', { name: 'Zurück zur Lobby' }).click()
    await expect(guest.getByRole('heading', { name: 'Spielplätze' })).toBeVisible()
    await host.getByRole('button', { name: 'Lobby verlassen' }).click()
    await guest.getByRole('button', { name: 'Lobby verlassen' }).click()
    await createLobby(host, guest, 'xeri', '4')
    await expect(host.getByText('Dein Team', { exact: true })).toBeVisible()
    for (let move = 0; move < 24; move++) await (move % 2 === 0 ? hostHand : guestHand).first().click()
    await expect(host.getByRole('status')).toContainText('Partie beendet')
    await expect(guest.getByRole('status')).toContainText('Partie beendet')
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})

test('ab6super6 bleibt nach dem Klopfen bis zum letzten Fristablauf verdeckt', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({ baseURL })
  const guestContext = await browser.newContext({ baseURL })
  try {
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    const name = `Zwei_${suffix()}`
    await register(host, `Eins_${suffix()}`)
    await register(guest, name)
    await makeFriends(host, guest, name)
    await createLobby(host, guest, 'ab6super6', '2')
    await host.getByRole('button', { name: 'Untere Karten ansehen' }).click()
    const own = host.getByRole('region', { name: 'Deine Auslage' })
    await expect(own.getByRole('button', { name: /Verdeckt/ })).toHaveCount(2)
    await expect(guest.getByRole('region', { name: /^Auslage von/ }).getByRole('button', { name: /Verdeckt/ })).toHaveCount(4)
    await host.getByRole('button', { name: 'Verdecken und bereit' }).click()
    await guest.getByRole('button', { name: 'Verdecken und bereit' }).click()
    await host.getByRole('button', { name: 'Klopfen', exact: true }).click()
    for (const page of [guest, host]) {
      await page.getByRole('button', { name: 'Karte ziehen' }).click()
      await page.getByRole('button', { name: 'Gezogene Karte ablegen' }).click()
      const skip = page.getByRole('button', { name: 'Auslassen', exact: true })
      try {
        await skip.click({ timeout: 1200 })
      } catch {
        await expect(page.getByRole('button', { name: 'Auslassen', exact: true })).toHaveCount(0)
      }
      if (page === guest) {
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
        await expect(host.locator('.flight-layer')).toHaveCount(0)
        const effect = host.getByRole('button', { name: 'Auslassen', exact: true })
        if (await effect.isVisible()) await effect.click()
      }
    }
    await expect(host.getByText('Endwertung', { exact: true })).toBeVisible({ timeout: 9000 })
    await expect(guest.getByText('Endwertung', { exact: true })).toBeVisible()
    await expect(own.getByRole('button', { name: /Verdeckt/ })).toHaveCount(0)
    await expect(own.getByText(/Punkte ·/)).toBeVisible()
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})

test('Recovery-Code ist einmalig und Kontolöschung widerruft die Sitzung', async ({ page }) => {
  const username = `Recovery_${suffix()}`
  const [code] = await register(page, username)
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await page.getByRole('button', { name: 'Passwort wiederherstellen' }).click()
  await page.getByLabel('Benutzername').fill(username)
  await page.getByLabel('Recovery-Code').fill(code!)
  await page.locator('input[name=password]').fill(nextPassword)
  await page.getByLabel('Passwort wiederholen').fill(nextPassword)
  await page.getByRole('button', { name: 'Passwort wiederherstellen' }).click()
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await page.getByRole('button', { name: 'Passwort wiederherstellen' }).click()
  await page.getByLabel('Benutzername').fill(username)
  await page.getByLabel('Recovery-Code').fill(code!)
  await page.locator('input[name=password]').fill(password)
  await page.getByLabel('Passwort wiederholen').fill(password)
  await page.getByRole('button', { name: 'Passwort wiederherstellen' }).click()
  await expect(page.getByRole('alert')).toContainText('ungültig')
  await page.getByRole('link', { name: 'Anmelden', exact: true }).click()
  await page.getByLabel('Benutzername').fill(username)
  await page.getByLabel('Passwort', { exact: true }).fill(nextPassword)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.getByRole('button', { name: 'Konto löschen', exact: true }).click()
  await page.getByLabel('Passwort bestätigen').fill(nextPassword)
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible()
})
