import { Peer, SerializationType } from 'peerjs'
import type { DataConnection, PeerOptions } from 'peerjs'
import { parse } from 'valibot'
import type { AuditStatus, Lobby, Message, OnlineAction, RoomSettings } from '../../shared/online'
import { invitePattern, validNickname } from '../../shared/online'
import { digest, randomFraction, randomHex } from '../../shared/random'
import { chatLimit, Room } from '../../shared/room'
import { fromHost, parseAction } from '../../shared/wire'
import type { GuestMessage } from '../../shared/wire'
import { HostPeers } from './host-peers'
import { PeerAudit } from './peer-audit'
import { forgetGuest, guestToken } from './peer-storage'
import { checkChallenge, linkLabel, SecureLink } from './secure-link'

export type StartRoom =
  | { kind: 'host'; name: string; settings: RoomSettings }
  | { kind: 'guest'; name: string; invite: string }
export type RoomStatus = {
  lobby: Lobby | null
  messages: Message[]
  audit: AuditStatus
  connected: boolean
  status: string
  retry: boolean
  invite: string
  host: boolean
}

type Pending = { action: OnlineAction; timer: number; resolve: () => void; reject: (error: Error) => void }
const connectMs = 13_000
const now = () => Math.floor(performance.timeOrigin + performance.now())

function peerOptions(): PeerOptions {
  if (import.meta.env.DEV && import.meta.env.MODE === 'e2e') {
    const credential: string | undefined = import.meta.env.VITE_STICHRUNDE_TEST_RELAY_KEY
    return { host: '127.0.0.1', port: 8790, secure: false, config: credential ? {
      iceTransportPolicy: 'relay',
      iceServers: [{ urls: 'turn:127.0.0.1:3479?transport=tcp', username: 'stichrunde', credential }],
    } : { iceServers: [] } }
  }
  return { secure: true }
}

export class PeerSession {
  private readonly invite: string
  private readonly room: string
  private readonly host: HostPeers | null
  private readonly token: string | null
  private readonly audit: PeerAudit | null
  private state: RoomStatus
  private peer: Peer | null = null
  private guest: DataConnection | null = null
  private link: SecureLink | null = null
  private self: number | null = null
  private last = 0
  private proofSince = 0
  private attempt = 0
  private stopped = false
  private disposed = false
  private everConnected = false
  private retry: number | undefined
  private timeout: number | undefined
  private readonly heartbeat: number
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly input: StartRoom, private readonly update: (state: RoomStatus) => void) {
    if (!validNickname(input.name)) throw new Error('Gib einen Spitznamen mit höchstens 24 Zeichen ein.')
    this.invite = input.kind === 'host' ? randomHex(24) : input.invite
    if (!invitePattern.test(this.invite)) throw new Error('Dieser Einladungslink ist ungültig.')
    this.room = digest([linkLabel, 'address', this.invite]).slice(0, 48)
    this.host = input.kind === 'host'
      ? new HostPeers(new Room(this.room, input.settings, input.name, now), this.invite, now, (lobby, messages, audit) => this.set({ lobby, messages, audit }))
      : null
    this.token = input.kind === 'guest' ? guestToken(this.invite, input.name) : null
    this.audit = input.kind === 'guest' ? new PeerAudit(this.invite) : null
    this.state = { lobby: null, messages: [], audit: 'idle', connected: false,
      status: 'Verbindung wird aufgebaut …', retry: false, invite: this.invite, host: Boolean(this.host) }
    this.set({})
    this.heartbeat = window.setInterval(this.pulse, 4_000)
    window.addEventListener('online', this.resume)
    window.addEventListener('offline', this.offline)
    document.addEventListener('visibilitychange', this.visible)
    this.open()
  }

  private set(value: Partial<RoomStatus>) {
    if (this.disposed) return
    this.state = { ...this.state, ...value }
    this.update(this.state)
  }

  private open() {
    if (this.disposed || this.stopped) return
    if (!navigator.onLine) {
      this.set({ status: 'Keine Internetverbindung. Der Browser versucht es nach der Rückkehr erneut.', connected: false, retry: true })
      return
    }
    window.clearTimeout(this.timeout)
    this.timeout = window.setTimeout(() => {
      if (this.host && this.everConnected && this.peer && !this.peer.open) this.peer.disconnect()
      this.interrupted('Der Verbindungsaufbau dauert zu lange.')
    }, connectMs)
    if (this.host && this.peer && !this.peer.destroyed && this.everConnected) {
      // PeerJS reconnects its signaling socket without tearing down working channels.
      if (this.peer.open) this.hostReady()
      else if (this.peer.disconnected) this.peer.reconnect()
      return
    }
    const old = this.peer
    this.peer = null
    old?.destroy()
    const id = this.host ? `stichrunde-${this.room}` : `stichrunde-gast-${randomHex(16)}`
    const peer = new Peer(id, peerOptions())
    const current = () => !this.disposed && this.peer === peer
    this.peer = peer
    peer.on('open', () => {
      if (!current()) return
      if (this.host) this.hostReady()
      else if (!this.guest) this.connectGuest(peer)
    })
    peer.on('connection', (connection) => {
      if (current() && this.host) this.host.attach(connection)
      else connection.close()
    })
    peer.on('disconnected', () => {
      if (!current()) return
      if (this.host || !this.state.connected) this.interrupted('PeerJS-Signalisierung unterbrochen.')
    })
    peer.on('error', (error) => {
      if (!current()) return
      if (error.type === 'browser-incompatible' || error.type === 'ssl-unavailable') {
        this.end('Dieser Browser kann keine sichere WebRTC-Verbindung öffnen.')
      } else if (this.host && peer.open && error.type === 'webrtc') {
        // An individual data channel can fail while the other seats stay connected.
        return
      } else if (this.host && error.type === 'unavailable-id') {
        this.interrupted('Die Spielraumadresse ist noch belegt. Der Browser versucht es erneut.')
      } else if (error.type === 'peer-unavailable' || !this.state.connected || this.host) {
        this.interrupted(error.type === 'peer-unavailable' ? 'Der Host ist nicht erreichbar.' : 'Die WebRTC-Verbindung ist unterbrochen.')
      }
    })
  }

  private hostReady() {
    window.clearTimeout(this.timeout)
    window.clearTimeout(this.retry)
    this.retry = undefined
    this.everConnected = true
    this.attempt = 0
    this.set({ connected: true, status: 'Spielraum ist erreichbar.', retry: false })
    this.host?.publish()
  }

  private connectGuest(peer: Peer) {
    const connection = peer.connect(`stichrunde-${this.room}`, { label: linkLabel, reliable: true, serialization: SerializationType.None })
    const current = () => !this.disposed && this.guest === connection
    this.guest = connection
    this.audit!.newLink()
    this.self = null
    if (this.state.audit === 'checking') this.proofSince = now()
    connection.on('close', () => {
      if (current()) this.interrupted('Verbindung zum Host verloren.')
    })
    connection.on('error', () => {
      if (current()) this.interrupted('WebRTC konnte den Host nicht erreichen.')
    })
    connection.on('data', (raw) => {
      if (!current()) return
      if (this.link) {
        this.link.accept(raw)
        return
      }
      try {
        const nonce = checkChallenge(this.invite, raw)
        this.link = new SecureLink(connection, this.invite, nonce, false, (value) => this.receive(value),
          () => { if (current()) this.interrupted('Ein sicherer Datenrahmen konnte nicht bestätigt werden.') })
        void this.link.send({ type: 'hello', name: this.input.name, token: this.token! } satisfies GuestMessage)
      } catch {
        this.end('Der Spielraum hat die Einladung nicht bestätigt.')
      }
    })
  }

  private receive(payload: unknown) {
    const message = parse(fromHost, payload)
    this.last = now()
    if (message.type === 'ended') return this.end(message.reason)
    if (message.type === 'welcome') {
      if (this.self !== null || message.seat === 0) throw new Error('Ungültiger Sitz.')
      this.self = message.seat
      this.everConnected = true
      this.attempt = 0
      window.clearTimeout(this.timeout)
      this.set({ connected: true, status: 'Mit dem Host verbunden.', retry: false })
      return
    }
    if (this.self === null) throw new Error('Verbindungsbestätigung fehlt.')
    const audit = this.audit!
    if (message.type === 'snapshot') {
      const { lobby } = message
      if (lobby.self !== this.self || lobby.id !== this.room) throw new Error('Spielstand gehört zu einem anderen Raum.')
      if (this.state.lobby && lobby.revision < this.state.lobby.revision) return
      try {
        const contribution = audit.update(lobby)
        if (contribution) void this.link?.send(contribution)
      } catch (error) {
        audit.status = 'failed'
        this.set({ lobby, audit: 'failed' })
        return this.end(error instanceof Error ? error.message : 'Die Zufallsphase wurde verändert.')
      }
      if (audit.status === 'checking' && (this.state.lobby?.match !== lobby.match || !this.proofSince)) this.proofSince = now()
      if (audit.status !== 'checking') this.proofSince = 0
      this.set({ lobby, audit: audit.status })
    } else if (message.type === 'chat') {
      if (this.state.messages.some(({ id }) => id === message.message.id)) return
      this.set({ messages: [...this.state.messages, message.message].sort((a, b) => a.id - b.id).slice(-chatLimit) })
    } else if (message.type === 'ack') {
      const pending = this.pending.get(message.request)
      if (!pending) return
      window.clearTimeout(pending.timer)
      this.pending.delete(message.request)
      if (message.error) return pending.reject(new Error(message.error))
      if (pending.action.type === 'xeri-play' || pending.action.type === 'cambio-play') audit.acknowledge(pending.action)
      pending.resolve()
    } else if (message.type === 'proof' || message.type === 'proof-events' || message.type === 'proof-unavailable') {
      const lobby = this.state.lobby
      const match = message.type === 'proof' ? message.proof.round.id : message.match
      if (!lobby || lobby.match !== match || lobby.phase !== 'finished') return
      try {
        if (message.type === 'proof') audit.begin(lobby, message.proof)
        else if (message.type === 'proof-events') audit.append(lobby, message.match, message.offset, message.events)
        else audit.status = 'unavailable'
        this.set({ audit: audit.status })
      } catch {
        audit.status = 'failed'
        this.set({ audit: 'failed' })
      }
    }
  }

  async act(input: OnlineAction) {
    if (this.disposed || this.stopped || !this.state.connected) throw new Error('Die Verbindung wird wiederhergestellt.')
    const action = parseAction(input)
    if (this.host) return this.host.action(action)
    const link = this.link
    if (!link || this.self === null) throw new Error('Der Spielraum ist noch nicht verbunden.')
    const request = crypto.randomUUID()
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(request)
        reject(new Error('Der Host hat die Aktion noch nicht bestätigt. Prüfe den aktuellen Spielstand.'))
      }, 8_000)
      this.pending.set(request, { action, timer, resolve, reject })
      void link.send({ type: 'action', request, action } satisfies GuestMessage)
    })
  }

  private dropGuest() {
    const connection = this.guest
    this.guest = null
    this.link?.close()
    this.link = null
    this.self = null
    connection?.close()
    this.rejectPending()
  }

  private interrupted(status: string) {
    if (this.disposed || this.stopped || this.retry !== undefined) return
    window.clearTimeout(this.timeout)
    if (!this.host) this.dropGuest()
    const preserve = Boolean(this.host && this.everConnected && this.peer && !this.peer.destroyed)
    const bounded = this.attempt >= 4
    const next = this.host ? 'Versuche die Signalisierung erneut zu verbinden.'
      : 'Wenn der Host den Tab geschlossen oder neu geladen hat, brauchst du einen neuen Link.'
    this.set({ connected: preserve && navigator.onLine, status: bounded ? `${status} ${next}` : `${status} Wiederverbindung läuft …`, retry: true })
    if (bounded || !navigator.onLine) return
    this.retry = window.setTimeout(() => {
      this.retry = undefined
      this.open()
    }, Math.min(7_500, 750 * 2 ** this.attempt++) + Math.floor(250 * randomFraction()))
  }

  private offline = () => {
    this.host?.disconnectAll()
    this.peer?.disconnect()
    this.interrupted('Keine Internetverbindung.')
    this.set({ connected: false, retry: true })
  }

  private resume = () => {
    if (!this.stopped) this.reconnect()
  }

  private visible = () => {
    if (document.hidden || this.stopped || this.disposed) return
    if (!this.host && this.state.connected) {
      this.last = now()
      void this.link?.send({ type: 'ping' } satisfies GuestMessage)
    } else if (this.state.retry && this.retry === undefined) this.reconnect()
  }

  reconnect() {
    if (this.disposed || this.stopped || (!this.state.retry && this.state.connected)) return
    window.clearTimeout(this.retry)
    this.retry = undefined
    this.attempt = 0
    this.set({ status: 'Verbindung wird erneut aufgebaut …' })
    this.open()
  }

  private pulse = () => {
    if (this.disposed || this.stopped) return
    if (this.host) return this.host.refreshLinks()
    if (this.state.audit === 'checking' && now() - this.proofSince > 16_000) this.set({ audit: 'unavailable' })
    if (!this.state.connected) return
    if (now() - this.last > 20_000) this.interrupted('Der Host antwortet nicht.')
    else void this.link?.send({ type: 'ping' } satisfies GuestMessage)
  }

  private end(status: string) {
    this.stopped = true
    this.dropGuest()
    this.peer?.destroy()
    this.set({ connected: false, status, retry: false, audit: this.state.audit === 'checking' ? 'unavailable' : this.state.audit })
  }

  private rejectPending() {
    for (const value of this.pending.values()) {
      window.clearTimeout(value.timer)
      value.reject(new Error('Die Verbindung wurde unterbrochen.'))
    }
    this.pending.clear()
  }

  close(notify = true) {
    if (this.disposed) return
    this.disposed = true
    window.clearTimeout(this.retry)
    window.clearTimeout(this.timeout)
    window.clearInterval(this.heartbeat)
    window.removeEventListener('online', this.resume)
    window.removeEventListener('offline', this.offline)
    document.removeEventListener('visibilitychange', this.visible)
    this.rejectPending()
    if (notify && this.input.kind === 'guest') forgetGuest(this.invite)
    const announce = this.host ? this.host.close(notify) : notify ? this.link?.send({ type: 'leave' } satisfies GuestMessage) : undefined
    void Promise.resolve(announce).finally(() => {
      this.guest = null
      this.link?.close()
      this.peer?.destroy()
      this.peer = null
    })
  }
}
