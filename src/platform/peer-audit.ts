import { auditMatch, commitSecret, maxAuditEvents, viewDigest } from '../../shared/game-match'
import type { AuditStatus, GameMove, Lobby, MatchEvent, ProofStart, Round } from '../../shared/online'
import { seedPattern } from '../../shared/online'
import { digest, randomHex } from '../../shared/random'
import type { GuestMessage } from '../../shared/wire'
import { readRound, storeRound } from './peer-storage'

type Locked = { match: string; setup: string; secret: string; host: string; commitments?: string }

export class PeerAudit {
  private lock: Locked | null
  private match: string | null = null
  private observations = new Map<number, string>()
  private receipts = new Map<string, string>()
  private conflicting = false
  private overflowed = false
  private proof: ProofStart | null = null
  private events: MatchEvent[] = []
  private sent = ''
  status: AuditStatus = 'idle'

  constructor(private readonly invite: string) {
    this.lock = readRound<Locked>(invite)
  }

  newLink() {
    this.sent = ''
    this.proof = null
    this.events = []
  }

  update(lobby: Lobby): GuestMessage | undefined {
    if (this.match !== lobby.match) {
      this.match = lobby.match
      this.observations = new Map()
      this.receipts = new Map()
      this.conflicting = false
      this.overflowed = false
      this.proof = null
      this.events = []
      this.sent = ''
      this.status = 'idle'
    }
    const view = lobby.xeri ?? lobby.cambio ?? lobby.theslibbi
    if (view) {
      const { version } = view
      const hash = viewDigest(lobby)
      const prior = this.observations.get(version)
      if (prior && prior !== hash) this.conflicting = true
      if (prior || this.observations.size <= maxAuditEvents) this.observations.set(version, hash)
      else this.overflowed = true
      if (lobby.phase === 'finished' && this.status === 'idle') {
        this.status = this.overflowed || lobby.theslibbi?.outcome === 'loss' ? 'unavailable' : 'checking'
      }
      return
    }
    const seeding = lobby.seeding
    if (!seeding) {
      if (this.lock) storeRound(this.invite, null)
      this.lock = null
      return
    }
    const { round, step, commitments } = seeding
    const humans = lobby.seats.filter((seat) => seat.player).map((seat) => seat.seat)
    if (round.game !== lobby.game || round.capacity !== lobby.capacity ||
      digest(round.humans) !== digest(humans) || !round.humans.includes(lobby.self)) throw new Error('Die Sitzordnung der Vorbereitung ist ungültig.')
    const host = commitments.find(({ seat }) => seat === 0)?.hash
    if (!host) throw new Error('Die Zufallszusage des Hosts fehlt.')
    if (this.lock?.match !== round.id) this.lock = { match: round.id, setup: digest(round), secret: randomHex(32), host }
    if (this.lock.host !== host || this.lock.setup !== digest(round) || !seedPattern.test(this.lock.secret)) {
      throw new Error('Die Zufallszusage oder Sitzordnung wurde geändert.')
    }
    const mine = commitSecret(lobby.id, round, lobby.self, this.lock.secret)
    if (step === 'reveal') {
      const listed = commitments.map(({ seat }) => seat)
      if (digest(listed) !== digest(round.humans) || commitments.find((item) => item.seat === lobby.self)?.hash !== mine) {
        throw new Error('Die Zufallszusagen sind unvollständig.')
      }
      const locked = digest(commitments)
      if (this.lock.commitments && this.lock.commitments !== locked) throw new Error('Die Zufallszusagen wurden geändert.')
      this.lock.commitments = locked
    }
    storeRound(this.invite, this.lock)
    const sent = `${round.id}/${step}`
    if (this.sent === sent) return
    this.sent = sent
    return step === 'commit' ? { type: 'commit', match: round.id, hash: mine } : { type: 'reveal', match: round.id, secret: this.lock.secret }
  }

  acknowledge(move: GameMove) {
    if (this.match !== move.match) return
    if (this.receipts.has(move.id) || this.receipts.size < maxAuditEvents) this.receipts.set(move.id, digest(move))
    else this.overflowed = true
  }

  private locked(round: Round, proof: ProofStart) {
    return this.lock?.match === round.id && this.lock.setup === digest(round) && this.lock.commitments === digest(proof.commitments)
  }

  begin(lobby: Lobby, proof: ProofStart) {
    if (lobby.phase !== 'finished' || lobby.match !== proof.round.id) throw new Error('Prüfdaten vor Abschluss der Partie.')
    if (lobby.theslibbi?.outcome === 'loss') throw new Error('Bei einer Niederlage bleiben ungespielte Karten privat.')
    this.proof = proof
    this.events = []
    if (proof.events === 0) this.verify(lobby)
  }

  append(lobby: Lobby, match: string, offset: number, events: MatchEvent[]) {
    const proof = this.proof
    if (!proof || proof.round.id !== match || lobby.match !== match || offset !== this.events.length ||
      this.events.length + events.length > proof.events) throw new Error('Das Prüfprotokoll ist unvollständig.')
    this.events.push(...events)
    if (this.events.length === proof.events) this.verify(lobby)
  }

  private verify(lobby: Lobby) {
    const proof = this.proof!
    if (this.overflowed) {
      this.status = 'unavailable'
      this.proof = null
      this.events = []
      return
    }
    try {
      if (this.conflicting || !this.locked(proof.round, proof)) throw new Error('Die aufgezeichnete Zufallszusage fehlt oder wurde geändert.')
      auditMatch(lobby.id, proof, this.events, lobby.self, this.observations, this.receipts, lobby)
      this.status = proof.round.humans.length > 1 ? 'verified' : 'single'
    } catch {
      this.status = 'failed'
    }
    this.proof = null
    this.events = []
  }
}
