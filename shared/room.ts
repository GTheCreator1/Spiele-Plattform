import { applyMatchEvent, commitSecret, matchFinished, maxAuditEvents, newMatch, privateViews, seedFor } from './game-match.ts'
import type { Commitment, Contribution, GameMove, Lobby, MatchEvent, Message, OnlineAction, Player, ProofStart, RoomSettings, Round } from './online.ts'
import { isPlayableGame, seedPattern, validNickname, validSettings } from './online.ts'
import { digest, randomHex } from './random.ts'

type Occupant = {
  player: Player | null
  token: string | null
  bot: boolean
  online: boolean
  ready: boolean
}
type Ceremony = {
  round: Round
  step: 'commit' | 'reveal'
  started: number
  commitments: Map<number, string>
  secrets: Map<number, string>
}
type Match = {
  round: Round
  seed: string
  proof: Omit<ProofStart, 'events'>
  state: ReturnType<typeof newMatch>
  events: MatchEvent[]
  proofComplete: boolean
  receipts: Map<string, string>
}

function need(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason)
}

function person(name: string, token: string | null, ready = false): Occupant {
  return { player: { id: crypto.randomUUID(), name }, token, bot: false, online: true, ready }
}

export const chatLimit = 40
const seedTimeout = 35_000

export class Room {
  readonly id: string
  private settings: RoomSettings
  private readonly now: () => number
  private phase: Lobby['phase'] = 'open'
  private seats: (Occupant | null)[]
  private match: Match | null = null
  private ceremony: Ceremony | null = null
  private revision = 0
  private notice = ''
  private chatId = 0
  private readonly chat: Message[] = []
  private readonly chatRate = new Map<string, number[]>()
  private readonly chatReceipts = new Set<string>()

  constructor(id: string, settings: RoomSettings, name: string, now: () => number) {
    need(validSettings(settings) && validNickname(name), 'Wähle ein Spiel und einen gültigen Spitznamen.')
    this.id = id
    this.settings = settings
    this.now = now
    this.seats = Array<Occupant | null>(settings.capacity).fill(null)
    this.seats[0] = person(name, null, true)
  }

  private changed(notice = '') {
    this.notice = notice
    this.revision++
  }

  join(token: string, name: string) {
    need(validNickname(name), 'Der Spitzname ist ungültig.')
    const previous = this.seats.findIndex((seat) => seat?.token === token)
    if (previous > 0) {
      this.seats[previous]!.online = true
      if (this.ceremony) this.progress(this.ceremony)
      this.changed()
      return previous
    }
    need(this.phase === 'open', 'Die Partie läuft bereits.')
    need(!this.seats.some((seat) => seat?.player?.name.toLowerCase() === name.toLowerCase()),
      'Dieser Spitzname ist im Raum bereits vergeben.')
    const place = this.seats.indexOf(null)
    need(place > 0, 'Der Spielraum ist voll.')
    this.seats[place] = person(name, token)
    this.changed()
    return place
  }

  disconnect(seat: number, leave = false) {
    const player = this.seats[seat]
    if (!player?.player || seat === 0) return
    if (leave) {
      this.chatRate.delete(player.player.id)
      this.seats[seat] = null
      if (this.phase !== 'open') this.reset(`${player.player.name} hat den Tisch verlassen. Die Lobby ist wieder offen.`)
      else this.changed()
    } else {
      player.online = false
      this.changed()
    }
  }

  snapshot(self: number): Lobby {
    return {
      id: this.id, revision: this.revision, self, ...this.settings, phase: this.phase, notice: this.notice,
      seats: this.seats.map((value, seat) => ({
        seat, player: value?.player ?? null, bot: Boolean(value?.bot), ready: Boolean(value?.ready), online: Boolean(value?.online),
      })),
      match: this.match?.round.id ?? this.ceremony?.round.id ?? null,
      ...privateViews(this.match?.state ?? null, self, this.now()),
      seeding: this.ceremony ? {
        round: this.ceremony.round, step: this.ceremony.step,
        commitments: this.ordered(this.ceremony.round, this.ceremony.commitments, (seat, hash) => ({ seat, hash })),
      } : null,
    }
  }

  chatHistory() { return this.chat.slice() }

  proof() {
    const match = this.match
    if (!match || this.phase !== 'finished') return null
    return match.proofComplete
      ? { match: match.round.id, proof: { ...match.proof, events: match.events.length }, events: match.events.slice() }
      : { match: match.round.id, proof: null, events: [] }
  }

  deadline() {
    if (this.ceremony) return this.ceremony.started + seedTimeout
    const state = this.match?.state
    return state?.type === 'ab6super6' && this.phase === 'playing' && state.data.final?.remaining === 0
      ? state.data.reaction?.until ?? null : null
  }

  tick() {
    const elapsed = this.now()
    if (this.ceremony && elapsed >= this.ceremony.started + seedTimeout) {
      this.reset('Zufallsbeiträge fehlen. Du kannst die Partie erneut starten.')
      return true
    }
    const match = this.match
    if (this.phase !== 'playing' || !match || match.state.type !== 'ab6super6') return false
    const event = { at: elapsed, tick: true } as const
    const next = applyMatchEvent(match.state, match.round, match.seed, event)
    if (next === match.state) return false
    match.state = next
    this.record(match, event)
    return true
  }

  private reset(notice = '') {
    this.match = null
    this.ceremony = null
    this.phase = 'open'
    for (const [index, seat] of this.seats.entries()) if (seat) seat.ready = seat.bot || index === 0
    this.changed(notice)
  }

  private seated() {
    return this.seats.every((seat) => seat && seat.online)
  }

  private start() {
    const { game, capacity } = this.settings
    need(isPlayableGame(game), 'Für THESLIBBI ist derzeit die Lobby verfügbar.')
    need(this.phase === 'open' && this.seated() && this.seats.every((seat) => seat?.ready),
      'Alle Plätze müssen verbunden und bereit sein.')
    const round = {
      id: randomHex(16), game, capacity,
      humans: this.seats.flatMap((seat, index) => seat?.player ? [index] : []),
    }
    const secret = randomHex(32)
    this.ceremony = {
      round, step: 'commit', started: this.now(),
      commitments: new Map([[0, commitSecret(this.id, round, 0, secret)]]),
      secrets: new Map([[0, secret]]),
    }
    this.phase = 'seeding'
    this.progress(this.ceremony)
    this.changed()
  }

  contribute(seat: number, match: string, type: 'commit' | 'reveal', value: string) {
    const ceremony = this.ceremony
    if (!ceremony || ceremony.round.id !== match || !ceremony.round.humans.includes(seat) || seat === 0) return false
    need(seedPattern.test(value), 'Ungültiger Zufallsbeitrag.')
    const map = type === 'commit' ? ceremony.commitments : ceremony.secrets
    if (map.get(seat) === value) return false
    need(!map.has(seat) && ceremony.step === type, 'Die Zufallsphase ist bereits abgeschlossen.')
    if (type === 'reveal') {
      need(ceremony.commitments.get(seat) === commitSecret(this.id, ceremony.round, seat, value),
        'Der Zufallsbeitrag passt nicht zur Zusage.')
    }
    map.set(seat, value)
    this.progress(ceremony)
    this.changed()
    return true
  }

  private ordered<T>(round: Round, values: Map<number, string>, map: (seat: number, value: string) => T): T[] {
    return round.humans.flatMap((seat) => {
      const value = values.get(seat)
      return value === undefined ? [] : [map(seat, value)]
    })
  }

  private progress(ceremony: Ceremony) {
    const { round } = ceremony
    if (ceremony.commitments.size !== round.humans.length) return
    ceremony.step = 'reveal'
    if (ceremony.secrets.size !== round.humans.length || !this.seated()) return
    const commitments = this.ordered<Commitment>(round, ceremony.commitments, (seat, hash) => ({ seat, hash }))
    const contributions = this.ordered<Contribution>(round, ceremony.secrets, (seat, secret) => ({ seat, secret }))
    const seed = seedFor(this.id, round, commitments, contributions)
    this.match = {
      round, seed, proof: { round, commitments, contributions }, state: newMatch(round, seed),
      events: [], proofComplete: true, receipts: new Map(),
    }
    this.phase = 'playing'
    this.ceremony = null
  }

  private record(match: Match, event: MatchEvent) {
    if (match.events.length < maxAuditEvents) match.events.push(event)
    else match.proofComplete = false
    if (matchFinished(match.state)) this.phase = 'finished'
    this.changed()
  }

  private play(seat: number, move: GameMove) {
    const match = this.match
    need(match?.round.id === move.match, 'Dieser Zug gehört zu einer anderen Partie.')
    const receipt = `${seat}/${move.id}`
    const hash = digest(move)
    if (match.receipts.has(receipt)) {
      need(match.receipts.get(receipt) === hash, 'Diese Aktions-ID wurde bereits benutzt.')
      return false
    }
    need(this.phase === 'playing' && this.seated(), 'Die Partie wartet auf die Verbindung aller Mitspieler.')
    const event = { seat, move, at: this.now() }
    match.state = applyMatchEvent(match.state, match.round, match.seed, event)
    match.receipts.set(receipt, hash)
    if (match.receipts.size > maxAuditEvents * 2) match.receipts.delete(match.receipts.keys().next().value!)
    this.record(match, event)
    return true
  }

  private sendChat(from: Player, id: string, message: string) {
    const text = message.trim()
    need(text.length > 0 && text.length <= 500 && !/[\p{Cc}\p{Cf}]/u.test(text), 'Nachrichten brauchen 1 bis 500 sichtbare Zeichen.')
    const receipt = `${from.id}/${id}`
    if (this.chatReceipts.has(receipt)) return null
    const now = this.now()
    const recent = (this.chatRate.get(from.id) ?? []).filter((sent) => now - sent < 10_000)
    need(recent.length < 6, 'Du sendest zu schnell. Warte einen Moment.')
    this.chatRate.set(from.id, [...recent, now])
    this.chatReceipts.add(receipt)
    if (this.chatReceipts.size > 240) this.chatReceipts.delete(this.chatReceipts.values().next().value!)
    const item = { id: ++this.chatId, from, text, sentAt: now }
    this.chat.push(item)
    if (this.chat.length > chatLimit) this.chat.shift()
    return item
  }

  action(seat: number, action: OnlineAction): { changed: boolean; message?: Message } {
    const member = this.seats[seat]
    need(member?.player && member.online, 'Dieser Sitz gehört zu keinem verbundenen Mitspieler.')
    const { type } = action
    if (type === 'chat') {
      const message = this.sendChat(member.player, action.id, action.text)
      return { changed: false, message: message ?? undefined }
    }
    if (type === 'xeri-play' || type === 'cambio-play') return { changed: this.play(seat, action) }
    if (type === 'lobby-ready') {
      need(this.phase === 'open', 'Die nächste Partie wird bereits vorbereitet.')
      member.ready = action.ready
      this.changed()
      return { changed: true }
    }
    need(seat === 0, 'Nur wer den Raum geöffnet hat, kann die Lobby verwalten.')
    switch (type) {
      case 'lobby-start':
        this.start()
        break
      case 'lobby-cancel':
        need(this.phase === 'seeding', 'Es läuft keine Zufallsphase.')
        this.reset('Die Vorbereitung wurde abgebrochen.')
        break
      case 'lobby-rematch':
        need(this.phase === 'finished', 'Die Partie läuft noch.')
        this.reset()
        break
      case 'lobby-settings':
        need(this.phase === 'open' && this.seats.slice(1).every((value) => value === null) && validSettings(action.settings),
          'Das Spiel lässt sich nur im leeren Raum wechseln.')
        this.settings = action.settings
        this.seats = [member, ...Array<null>(action.settings.capacity - 1).fill(null)]
        this.changed()
        break
      case 'lobby-release': {
        const target = this.seats[action.seat]
        need(this.phase === 'open' && action.seat !== 0 && target?.player && !target.online, 'Nur getrennte Sitze in der offenen Lobby können freigegeben werden.')
        this.chatRate.delete(target.player.id)
        this.seats[action.seat] = null
        this.changed()
        break
      }
      case 'lobby-bot':
        need(this.phase === 'open' && this.settings.game === 'xeri' && this.settings.capacity === 4 && action.seat > 0 &&
          action.seat < 4 && !this.seats[action.seat]?.player, 'Für diesen Platz ist jetzt kein Bot möglich.')
        this.seats[action.seat] = action.enabled ? { player: null, token: null, bot: true, online: true, ready: true } : null
        this.changed()
        break
    }
    return { changed: true }
  }
}
