import * as v from 'valibot'
import { isCard } from '../vendor/xeri/game/engine.js'
import type { Card } from '../vendor/xeri/game/engine.js'
import { invitePattern, matchPattern, partyGames, seedPattern, validNickname, validSettings } from './online.ts'
import { maxAuditEvents } from './game-match.ts'

const object = v.strictObject
const bool = v.boolean()
const natural = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const int = v.pipe(v.number(), v.safeInteger())
const index = v.pipe(natural, v.maxValue(5))
const name = v.pipe(v.string(), v.check(validNickname))
const id = v.pipe(v.string(), v.regex(/^[0-9a-f-]{36}$/))
const invite = v.pipe(v.string(), v.regex(invitePattern))
const match = v.pipe(v.string(), v.regex(matchPattern))
const seed = v.pipe(v.string(), v.regex(seedPattern))
const text = v.pipe(v.string(), v.minLength(1), v.maxLength(500))
const statusText = v.pipe(v.string(), v.maxLength(240))
const game = v.picklist(partyGames)
const card = v.pipe(v.string(), v.check((value: string) => isCard(value)), v.transform((value) => value as Card))
const cambioCard = v.union([card, v.picklist(['joker-1', 'joker-2', 'joker-3'])])
const cards = v.pipe(v.array(card), v.maxLength(52))
const player = object({ id, name })
const target = object({ seat: index, slot: natural })
const score = object({ cards: natural, bonus: natural, total: natural })

const xeriView = object({
  seat: index, seats: v.picklist([2, 4]), hand: v.pipe(v.array(card), v.maxLength(4)),
  handCounts: v.pipe(v.array(v.pipe(natural, v.maxValue(4))), v.maxLength(4)),
  table: cards, publicCards: cards, collected: v.pipe(v.array(cards), v.length(2)), deckCount: natural,
  scores: v.tuple([score, score]), turn: v.nullable(index),
  lastMove: v.nullable(object({ seat: index, card, captures: bool, bonus: natural, collected: natural, remainder: natural })),
  deal: natural, version: v.pipe(natural, v.maxValue(48)), finished: bool, winner: v.nullable(v.picklist([0, 1])),
})

const cambioView = object({
  phase: v.picklist(['setup', 'playing', 'finished']), seat: index, turn: index, version: natural, now: natural,
  players: v.pipe(v.array(object({ ready: bool, cards: v.pipe(v.array(object({ slot: natural, card: v.nullable(cambioCard) })), v.maxLength(55)) })), v.maxLength(6)),
  deckCount: natural, top: v.nullable(cambioCard), drawn: v.nullable(cambioCard), hasDrawn: bool,
  reaction: v.nullable(object({ id: natural, until: v.nullable(natural) })),
  effect: v.nullable(object({
    id: natural, seat: index, kind: v.picklist(['add', 'own', 'other', 'blind-swap', 'king']),
    chosen: v.pipe(v.array(target), v.maxLength(2)),
  })),
  final: v.nullable(object({ knocker: index, remaining: natural })),
  result: v.nullable(v.pipe(v.array(object({ seat: index, total: int, outcome: v.picklist(['win', 'tie', 'loss']), invalidKnock: bool })), v.maxLength(6))),
  lastThrow: v.nullable(object({ seat: index, target, card: cambioCard, correct: bool, penalized: v.nullable(index) })),
  unpaidPenalties: natural, startViewed: bool,
})

const settings = v.pipe(object({ game, capacity: natural }), v.check(validSettings))
const seat = object({ seat: index, player: v.nullable(player), bot: bool, ready: bool, online: bool })
const round = v.pipe(object({ id: match, game, capacity: natural, humans: v.pipe(v.array(index), v.maxLength(6)) }), v.check((value) => {
  return validSettings(value) && value.humans[0] === 0 &&
    value.humans.every((seat, i) => seat < value.capacity && (i === 0 || seat > value.humans[i - 1]!)) &&
    (value.humans.length === value.capacity || (value.game === 'xeri' && value.capacity === 4))
}))
const commitments = v.pipe(v.array(object({ seat: index, hash: seed })), v.maxLength(6))
const seeding = object({ round, step: v.picklist(['commit', 'reveal']), commitments })

const snapshot = v.pipe(object({
  id: invite, revision: natural, self: index, game, capacity: natural, phase: v.picklist(['open', 'seeding', 'playing', 'finished']),
  seats: v.pipe(v.array(seat), v.maxLength(6)), match: v.nullable(match),
  xeri: v.nullable(xeriView), cambio: v.nullable(cambioView), seeding: v.nullable(seeding), notice: statusText,
}), v.check((lobby) => {
  if (!validSettings(lobby) || lobby.seats.length !== lobby.capacity || !lobby.seats[lobby.self]?.player ||
    !lobby.seats.every((seat, index) => seat.seat === index && !(seat.player && seat.bot))) return false
  if (lobby.phase === 'open') return lobby.match === null && lobby.seeding === null && !lobby.xeri && !lobby.cambio
  if (lobby.phase === 'seeding') return !!lobby.seeding && lobby.match === lobby.seeding.round.id && !lobby.xeri && !lobby.cambio
  if (!lobby.match || lobby.seeding) return false
  if (lobby.game === 'xeri') {
    return !!lobby.xeri && !lobby.cambio && lobby.xeri.seat === lobby.self && lobby.xeri.seats === lobby.capacity &&
      lobby.xeri.finished === (lobby.phase === 'finished') && lobby.xeri.handCounts.length === lobby.capacity
  }
  return !!lobby.cambio && !lobby.xeri && lobby.cambio.seat === lobby.self && lobby.cambio.players.length === lobby.capacity &&
    (lobby.cambio.phase === 'finished') === (lobby.phase === 'finished')
}))

const cambioAction = v.union([
  object({ type: v.picklist(['peek-start', 'ready', 'draw', 'knock']) }),
  object({ type: v.literal('effect-skip') }),
  object({ type: v.literal('discard'), slot: v.optional(natural) }),
  object({ type: v.literal('throw'), window: natural, target }),
  object({ type: v.literal('effect-select'), seat: v.optional(index), targets: v.optional(v.pipe(v.array(target), v.maxLength(2))) }),
  object({ type: v.literal('effect-finish'), swap: v.optional(bool) }),
])
const move = v.variant('type', [
  object({ type: v.literal('xeri-play'), id, match, version: natural, card }),
  object({ type: v.literal('cambio-play'), id, match, version: natural, action: cambioAction }),
])
const onlineAction = v.union([
  move,
  object({ type: v.literal('lobby-settings'), settings }),
  object({ type: v.literal('lobby-ready'), ready: bool }),
  object({ type: v.literal('lobby-bot'), seat: index, enabled: bool }),
  object({ type: v.picklist(['lobby-start', 'lobby-rematch', 'lobby-cancel']) }),
  object({ type: v.literal('lobby-release'), seat: index }),
  object({ type: v.literal('chat'), id, text }),
])
const matchEvent = v.union([object({ at: natural, tick: v.literal(true) }), object({ at: natural, seat: index, move })])
const proof = object({
  round, commitments, contributions: v.pipe(v.array(object({ seat: index, secret: seed })), v.maxLength(6)),
  events: v.pipe(natural, v.maxValue(maxAuditEvents)),
})

export const helloChallenge = object({ type: v.literal('challenge'), nonce: match, proof: seed })
export const fromGuest = v.variant('type', [
  object({ type: v.literal('hello'), token: invite, name }),
  object({ type: v.literal('action'), request: id, action: onlineAction }),
  object({ type: v.literal('commit'), match, hash: seed }),
  object({ type: v.literal('reveal'), match, secret: seed }),
  object({ type: v.literal('ping') }),
  object({ type: v.literal('leave') }),
])
export const fromHost = v.variant('type', [
  object({ type: v.literal('welcome'), seat: index }),
  object({ type: v.literal('snapshot'), lobby: snapshot }),
  object({ type: v.literal('ack'), request: id, error: v.nullable(statusText) }),
  object({ type: v.literal('chat'), message: object({ id: natural, from: player, text, sentAt: natural }) }),
  object({ type: v.literal('ended'), reason: statusText }),
  object({ type: v.literal('pong') }),
  object({ type: v.literal('proof'), proof }),
  object({ type: v.literal('proof-events'), match, offset: natural, events: v.pipe(v.array(matchEvent), v.minLength(1), v.maxLength(24)) }),
  object({ type: v.literal('proof-unavailable'), match }),
])
export type HostMessage = v.InferOutput<typeof fromHost>
export type GuestMessage = v.InferOutput<typeof fromGuest>
export const parseAction = (input: unknown) => v.parse(onlineAction, input)
