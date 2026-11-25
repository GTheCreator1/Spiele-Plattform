import type { DataConnection } from 'peerjs'
import { parse } from 'valibot'
import { keyedBytes, mac, sameHex } from '../../shared/random.ts'
import { helloChallenge } from '../../shared/wire.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const maxFrame = 16_000
export const linkLabel = 'stichrunde-v1'

function data(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > maxFrame) throw new Error('Ungültiger Datenrahmen.')
  return JSON.parse(raw)
}

function iv(counter: number) {
  const bytes = new ArrayBuffer(12)
  new DataView(bytes).setBigUint64(4, BigInt(counter))
  return bytes
}

function frame(raw: unknown): [number, string] {
  const value = data(raw)
  if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || value[0] < 0 ||
    typeof value[1] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value[1])) throw new Error('Unlesbarer Datenrahmen.')
  return [value[0] as number, value[1]]
}

export function makeChallenge(invite: string, nonce: string) {
  return JSON.stringify({ type: 'challenge', nonce, proof: mac(invite, [linkLabel, 'challenge', nonce]) })
}

export function checkChallenge(invite: string, raw: unknown) {
  const { nonce, proof } = parse(helloChallenge, data(raw))
  if (!sameHex(proof, mac(invite, [linkLabel, 'challenge', nonce]))) throw new Error('Der Raum konnte nicht bestätigt werden.')
  return nonce
}

export class SecureLink {
  private readonly connection: DataConnection
  private readonly receive: (value: unknown) => void
  private readonly failed: () => void
  private readonly readKey: Promise<CryptoKey>
  private readonly writeKey: Promise<CryptoKey>
  private incoming = Promise.resolve()
  private outgoing = Promise.resolve()
  private received = 0
  private sent = 0
  private pending = 0
  private queued = 0
  private closed = false

  constructor(connection: DataConnection, invite: string, nonce: string, host: boolean,
    receive: (value: unknown) => void, failed: () => void) {
    this.connection = connection
    this.receive = receive
    this.failed = failed
    const key = (side: string, use: KeyUsage) => crypto.subtle.importKey(
      'raw', keyedBytes(invite, [linkLabel, 'channel-aes-gcm', nonce, side]), 'AES-GCM', false, [use],
    )
    this.readKey = key(host ? 'guest' : 'host', 'decrypt')
    this.writeKey = key(host ? 'host' : 'guest', 'encrypt')
  }

  accept(raw: unknown) {
    if (this.closed) return
    if (++this.pending > 64 || typeof raw !== 'string' || raw.length > maxFrame) return this.abort()
    this.incoming = this.incoming.then(async () => {
      if (this.closed) return
      const [counter, cipher] = frame(raw)
      if (counter !== this.received) throw new Error('Ungültige Nachrichtenfolge.')
      const bytes = Uint8Array.from(atob(cipher), (char) => char.charCodeAt(0))
      const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv(counter) }, await this.readKey, bytes)
      if (this.closed) return
      this.received++
      this.receive(JSON.parse(decoder.decode(clear)))
    }).catch(() => this.abort()).finally(() => { this.pending-- })
  }

  send(value: unknown) {
    if (this.closed) return Promise.resolve()
    if (++this.queued > 64) {
      this.abort()
      return Promise.resolve()
    }
    this.outgoing = this.outgoing.then(async () => {
      if (this.closed || !this.connection.open) return
      const clear = encoder.encode(JSON.stringify(value))
      if (clear.length > 11_900) throw new Error('Nachricht ist zu groß.')
      const counter = this.sent++
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(counter) }, await this.writeKey, clear)
      if (this.closed || !this.connection.open) return
      this.connection.send(JSON.stringify([counter, btoa(String.fromCharCode(...new Uint8Array(cipher)))]))
    }).catch(() => this.abort()).finally(() => { this.queued-- })
    return this.outgoing
  }

  close() {
    this.closed = true
    this.connection.close()
  }

  private abort() {
    if (this.closed) return
    this.close()
    this.failed()
  }
}
