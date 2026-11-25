import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function createRoom(host: Page, name: string, game: 'xeri' | 'ab6super6', seats: number) {
  await host.goto(`./#/spiele/${game}`)
  await host.getByLabel('Spitzname').fill(name)
  await host.getByLabel('Spielerplätze').selectOption(String(seats))
  await host.getByRole('button', { name: 'Privaten Raum erstellen' }).click()
  await expect(host.getByText('Spielraum ist erreichbar.')).toBeVisible({ timeout: 15_000 })
  const link = await host.getByLabel('Einladungslink', { exact: true }).inputValue()
  expect(new URL(link).hash).toMatch(/^#\/lobby\/[0-9a-f]{48}$/)
  return link
}

export async function joinRoom(guest: Page, name: string, link: string) {
  await guest.goto(link)
  await guest.getByLabel('Spitzname').fill(name)
  await guest.getByRole('button', { name: 'Raum beitreten' }).click()
  await expect(guest.getByText('Mit dem Host verbunden.')).toBeVisible({ timeout: 15_000 })
  await guest.getByRole('button', { name: 'Bereit', exact: true }).click()
}

export function hand(page: Page) {
  return page.getByRole('group', { name: 'Deine Handkarten' }).getByRole('button')
}
