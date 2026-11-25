import assert from 'node:assert/strict'
import test from 'node:test'
import type { DataConnection } from 'peerjs'
import { checkChallenge, makeChallenge, SecureLink } from '../../src/platform/secure-link.ts'

const invite = 'a'.repeat(48)
const nonce = 'b'.repeat(32)

class Wire {
  open = true
  packets: string[] = []
  send(packet: string) { this.packets.push(packet) }
  close() { this.open = false }
  get connection() { return this as unknown as DataConnection }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((done) => { resolve = done })
  return { promise, resolve }
}

test('Challenge bestätigt den Einladungslink und ein fremder Link liefert keinen gültigen Nachweis', () => {
  const challenge = makeChallenge(invite, nonce)
  assert.equal(checkChallenge(invite, challenge), nonce)
  assert.throws(() => checkChallenge('c'.repeat(48), challenge), /bestätigt/)
  assert.throws(() => checkChallenge(invite, 'x'.repeat(16_001)), /Datenrahmen/)
})

test('verschlüsselte Kanäle prüfen Richtung, Reihenfolge und Wiederholungen auf einer simulierten Verbindung', async () => {
  const sender = new Wire()
  const receiver = new Wire()
  const received = deferred<unknown>()
  const rejected = deferred<void>()
  const host = new SecureLink(sender.connection, invite, nonce, true, () => assert.fail(), () => assert.fail())
  const guest = new SecureLink(receiver.connection, invite, nonce, false, received.resolve, () => rejected.resolve())
  const message = { type: 'example', private: '9H, 4D' }
  await host.send(message)
  const packet = sender.packets[0]!
  assert.ok(!packet.includes(message.private))
  guest.accept(packet)
  assert.deepEqual(await received.promise, message)
  guest.accept(packet)
  await rejected.promise
  assert.equal(receiver.open, false)

  const wrong = new Wire()
  const direction = deferred<void>()
  const invalid = new SecureLink(wrong.connection, invite, nonce, true, () => assert.fail(), () => direction.resolve())
  invalid.accept(packet)
  await direction.promise
  assert.equal(wrong.open, false)
})
