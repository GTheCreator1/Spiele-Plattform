import { SerializationType } from 'peerjs'
import type { DataConnection } from 'peerjs'
import { parse } from 'valibot'
import { auditMatch } from '../../shared/game-match'
import type { AuditStatus, Lobby, Message, OnlineAction } from '../../shared/online'
import { randomHex } from '../../shared/random'
import { fromGuest, parseAction } from '../../shared/wire'
import type { HostMessage } from '../../shared/wire'
import type { Room } from '../../shared/room'
import { linkLabel, makeChallenge, SecureLink } from './secure-link'

type Remote = { link?: SecureLink; seat?: number; seen: number; count: number; burstAt: number; sentProof?: string }
const alive = 40_000
const greeting = 12_000

export class HostPeers {
  private readonly connections = new Map<DataConnection, Remote>()
  private readonly members = new Map<number, Remote>()
  private clock: number | undefined
  private audited = ''
  private audit: AuditStatus = 'idle'
  private disposed = false

  constructor(private readonly room: Room, private readonly invite: string, private readonly now: () => number,
    private readonly update: (lobby: Lobby, chat: Message[], audit: AuditStatus) => void) {}

  attach(connection: DataConnection) {
    if (this.disposed || connection.label !== linkLabel || connection.serialization !== SerializationType.None ||
      !connection.reliable || this.connections.size >= 14) {
      connection.close()
      return
    }
    const remote: Remote = { seen: this.now(), count: 0, burstAt: this.now() }
    this.connections.set(connection, remote)
    const remove = () => this.remove(connection)
    connection.on('close', remove)
    connection.on('error', () => { remove(); connection.close() })
    connection.on('data', (raw) => {
      if (this.disposed || !this.connections.has(connection)) return
      if (this.now() >= remote.burstAt + 1_000) {
        remote.count = 0
        remote.burstAt = this.now()
      }
      if (!remote.link || ++remote.count > 40) {
        remote.link?.close()
        connection.close()
        remove()
        return
      }
      remote.link.accept(raw)
    })
    connection.on('open', () => {
      if (this.disposed || !this.connections.has(connection)) return
      const nonce = randomHex(16)
      remote.link = new SecureLink(connection, this.invite, nonce, true, (value) => this.receive(remote, value), remove)
      connection.send(makeChallenge(this.invite, nonce))
    })
  }

  private remove(connection: DataConnection) {
    const remote = this.connections.get(connection)
    this.connections.delete(connection)
    const seat = remote?.seat
    if (this.disposed || seat === undefined || this.members.get(seat) !== remote) return
    this.members.delete(seat)
    this.room.disconnect(seat)
    this.publish()
  }

  action(value: OnlineAction) {
    if (this.room.tick()) this.publish()
    const result = this.room.action(0, parseAction(value))
    if (result.message) this.broadcast({ type: 'chat', message: result.message })
    if (result.message || result.changed) this.publish()
  }

  private receive(remote: Remote, payload: unknown) {
    const message = parse(fromGuest, payload)
    const link = remote.link!
    remote.seen = this.now()
    if (remote.seat === undefined) {
      if (message.type !== 'hello') throw new Error('Spitzname fehlt.')
      let seat: number
      try {
        seat = this.room.join(message.token, message.name)
      } catch (error) {
        void link.send({ type: 'ended', reason: problem(error) } satisfies HostMessage).finally(() => link.close())
        return
      }
      remote.seat = seat
      const previous = this.members.get(seat)
      this.members.set(seat, remote)
      previous?.link?.close()
      void link.send({ type: 'welcome', seat } satisfies HostMessage)
      this.publish()
      void this.sendHistory(remote)
      return
    }
    const seat = remote.seat
    if (this.members.get(seat) !== remote || this.disposed) return
    if (this.room.tick()) this.publish()
    if (message.type === 'ping') {
      void link.send({ type: 'pong' } satisfies HostMessage)
    } else if (message.type === 'leave') {
      this.members.delete(seat)
      this.room.disconnect(seat, true)
      link.close()
      this.publish()
    } else if (message.type === 'commit' || message.type === 'reveal') {
      const value = message.type === 'commit' ? message.hash : message.secret
      if (this.room.contribute(seat, message.match, message.type, value)) this.publish()
    } else if (message.type === 'action') {
      try {
        const result = this.room.action(seat, message.action)
        void link.send({ type: 'ack', request: message.request, error: null } satisfies HostMessage)
        if (result.message) this.broadcast({ type: 'chat', message: result.message })
        if (result.changed || result.message) this.publish()
        else void link.send({ type: 'snapshot', lobby: this.room.snapshot(seat) } satisfies HostMessage)
      } catch (error) {
        void link.send({ type: 'ack', request: message.request, error: problem(error) } satisfies HostMessage)
        void link.send({ type: 'snapshot', lobby: this.room.snapshot(seat) } satisfies HostMessage)
      }
    } else {
      throw new Error('Unzulässige Nachricht.')
    }
  }

  private async sendHistory(remote: Remote) {
    for (const message of this.room.chatHistory()) {
      await remote.link?.send({ type: 'chat', message } satisfies HostMessage)
    }
  }

  private broadcast(message: HostMessage) {
    for (const remote of this.members.values()) void remote.link?.send(message)
  }

  refreshLinks() {
    const now = this.now()
    for (const [connection, remote] of this.connections) {
      if (now - remote.seen > (remote.seat === undefined ? greeting : alive)) {
        this.remove(connection)
        connection.close()
      }
    }
  }

  disconnectAll() {
    for (const connection of this.connections.keys()) {
      this.remove(connection)
      connection.close()
    }
  }

  publish() {
    if (this.disposed) return
    const lobby = this.room.snapshot(0)
    const proof = this.room.proof()
    if (!proof) {
      this.audited = ''
      this.audit = 'idle'
    } else if (this.audited !== proof.match) {
      this.audited = proof.match
      this.audit = 'unavailable'
      if (proof.proof) {
        try {
          auditMatch(lobby.id, proof.proof, proof.events, 0, new Map(), new Map(), lobby)
          this.audit = proof.proof.round.humans.length === 1 ? 'single' : 'verified'
        } catch { this.audit = 'failed' }
      }
    }
    this.update(lobby, this.room.chatHistory(), this.audit)
    for (const [seat, remote] of this.members) {
      void remote.link?.send({ type: 'snapshot', lobby: this.room.snapshot(seat) } satisfies HostMessage)
      if (proof && remote.sentProof !== proof.match) {
        remote.sentProof = proof.match
        void this.sendProof(remote, proof)
      }
    }
    window.clearTimeout(this.clock)
    const until = this.room.deadline()
    if (until !== null) this.clock = window.setTimeout(() => { this.room.tick(); this.publish() }, Math.max(1, until - this.now()))
  }

  private async sendProof(remote: Remote, packageToSend: NonNullable<ReturnType<Room['proof']>>) {
    const { proof, events, match } = packageToSend
    const link = remote.link!
    if (!proof) {
      await link.send({ type: 'proof-unavailable', match } satisfies HostMessage)
      return
    }
    await link.send({ type: 'proof', proof } satisfies HostMessage)
    for (let offset = 0; offset < events.length && !this.disposed; offset += 24) {
      await link.send({ type: 'proof-events', match, offset, events: events.slice(offset, offset + 24) } satisfies HostMessage)
    }
  }

  async close(notify: boolean) {
    this.disposed = true
    window.clearTimeout(this.clock)
    if (notify) {
      await Promise.all([...this.members.values()].map((remote) => remote.link?.send({ type: 'ended', reason: 'Der Host hat den Raum geschlossen.' } satisfies HostMessage)))
    }
    this.disconnectAll()
    this.connections.clear()
    this.members.clear()
  }
}

function problem(error: unknown) {
  return (error instanceof Error ? error.message : 'Die Aktion konnte nicht ausgeführt werden.').slice(0, 240)
}
