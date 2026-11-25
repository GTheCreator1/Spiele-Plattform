import { expect, test } from '@playwright/test'
import { createRoom, hand, joinRoom } from './room'

test('Produktionsbuild verbindet zwei Browser über den öffentlichen PeerJS-Dienst', async ({ browser, baseURL }) => {
  const [hostContext, guestContext] = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })])
  try {
    const [host, guest] = await Promise.all([hostContext.newPage(), guestContext.newPage()])
    const signallers: string[] = []
    host.on('websocket', (socket) => signallers.push(new URL(socket.url()).hostname))
    const url = await createRoom(host, 'Prüfung A', 'xeri', 2)
    expect(signallers).toContain('0.peerjs.com')
    await joinRoom(guest, 'Prüfung B', url)
    await host.getByRole('button', { name: 'Partie starten', exact: true }).click()
    await expect(hand(host)).toHaveCount(4)
    await expect(hand(guest)).toHaveCount(4)
    await hand(host).first().click()
    await hand(guest).first().click()
    await expect(hand(host)).toHaveCount(3)
    await expect(hand(guest)).toHaveCount(3)
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})
