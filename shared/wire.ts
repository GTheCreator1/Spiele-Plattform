import * as v from 'valibot'
import { isCard } from '../vendor/xeri/game/engine.js'
import type { Card } from '../vendor/xeri/game/engine.js'
import { theslibbiDeckSize, theslibbiLevelCount, theslibbiMaxLevel, theslibbiScore, theslibbiSeats } from '../src/games/theslibbi/engine.ts'
import { invitePattern, matchPattern, roomGames, seedPattern, validNickname, validSettings } from './online.ts'
import { maxAuditEvents } from './game-match.ts'

const object = v.strictObject
const bool = v.boolean()
const natural = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const int = v.pipe(v.number(), v.safeInteger())
const index = v.pipe(natural, v.maxValue(5))
const name = v.pipe(v.string(), v.check(validNickname))
const id = v.pipe(v.string(), v.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
const invite = v.pipe(v.string(), v.regex(invitePattern))
const match = v.pipe(v.string(), v.regex(matchPattern))
const seed = v.pipe(v.string(), v.regex(seedPattern))
const text = v.pipe(v.string(), v.minLength(1), v.maxLength(500))
const statusText = v.pipe(v.string(), v.maxLength(240))
const game = v.picklist(roomGames)
const card = v.pipe(v.string(), v.check((value: string) => isCard(value)), v.transform((value) => value as Card))
const numberCard = v.pipe(natural, v.minValue(1), v.maxValue(theslibbiDeckSize))
const cambioCard = v.union([card, v.picklist(['joker-1', 'joker-2', 'joker-3'])])
const cards = v.pipe(v.array(card), v.maxLength(52))
const player = object({ id, name })
const target = object({ seat: index, slot: natural })
const score = object({ cards: natural, bonus: natural, total: natural })

const xeriView = v.pipe(object({
  seat: index, seats: v.picklist([2, 4]), hand: v.pipe(v.array(card), v.maxLength(4)),
  handCounts: v.pipe(v.array(v.pipe(natural, v.maxValue(4))), v.maxLength(4)),
  table: cards, publicCards: cards, collected: v.pipe(v.array(cards), v.length(2)), deckCount: natural,
  scores: v.tuple([score, score]), turn: v.nullable(index),
  lastMove: v.nullable(object({ seat: index, card, captures: bool, bonus: natural, collected: natural, remainder: natural })),
  deal: natural, version: v.pipe(natural, v.maxValue(48)), finished: bool, winner: v.nullable(v.picklist([0, 1])),
}), v.check((view) => {
  const played = new Set(view.publicCards)
  const onTable = [...view.table, ...view.collected.flat()]
  const totalHands = view.handCounts.reduce((sum, count) => sum + count, 0)
  return view.handCounts.length === view.seats && view.hand.length === view.handCounts[view.seat] &&
    view.deckCount + totalHands + onTable.length === 52 && played.size === view.version + 4 &&
    onTable.length === played.size && new Set(onTable).size === played.size && onTable.every((card) => played.has(card)) &&
    new Set(view.hand).size === view.hand.length && view.hand.every((card) => !played.has(card)) &&
    (view.finished ? view.turn === null : view.turn !== null && view.turn < view.seats) &&
    view.scores.every((score, team) => score.cards === view.collected[team]?.length && score.total === score.cards + score.bonus)
}))

const cambioView = v.pipe(object({
  phase: v.picklist(['setup', 'playing', 'finished']), seat: index, turn: index, version: natural, now: natural,
  players: v.pipe(v.array(object({ ready: bool, cards: v.pipe(v.array(object({ slot: natural, card: v.nullable(cambioCard) })), v.maxLength(55)) })), v.maxLength(6)),
  deckCount: natural, canDraw: bool, top: v.nullable(cambioCard), drawn: v.nullable(cambioCard), hasDrawn: bool,
  reaction: v.nullable(object({ id: natural, until: v.nullable(natural) })),
  effect: v.nullable(object({
    id: natural, seat: index, kind: v.picklist(['add', 'own', 'other', 'blind-swap', 'king']),
    chosen: v.pipe(v.array(target), v.maxLength(2)),
  })),
  final: v.nullable(object({ knocker: index, remaining: natural })),
  result: v.nullable(v.pipe(v.array(object({ seat: index, total: int, outcome: v.picklist(['win', 'tie', 'loss']), invalidKnock: bool })), v.maxLength(6))),
  lastThrow: v.nullable(object({ seat: index, target, card: cambioCard, correct: bool, penalized: v.nullable(index) })),
  lastDiscard: v.nullable(object({ seat: index, slot: v.nullable(natural), card: cambioCard })),
  unpaidPenalties: natural, startViewed: bool,
}), v.check((view) => {
  const { players, effect, drawn, hasDrawn, seat, phase, result, lastThrow, lastDiscard } = view
  if (view.turn >= players.length || !players[seat] || view.deckCount > 55 ||
    (drawn !== null) !== (hasDrawn && view.turn === seat) ||
    (result !== null) !== (phase === 'finished') ||
    (result && (result.length !== players.length || result.some((line, seat) => line.seat !== seat))) ||
    (lastDiscard && (lastDiscard.seat >= players.length || lastDiscard.card !== view.top || lastThrow)) ||
    (lastThrow && (lastThrow.target.seat >= players.length || lastThrow.seat >= players.length || lastThrow.card !== view.top))) return false

  const chosen = effect?.chosen ?? []
  if (effect && (effect.seat >= players.length || (effect.seat !== seat && chosen.length > 0) ||
    chosen.some(({ seat, slot }) => !players[seat]?.cards.some((entry) => entry.slot === slot)))) return false

  return players.every((player, owner) => player.cards.every(({ slot, card }, index) => {
    const visibleAtStart = phase === 'setup' && owner === seat && view.startViewed && !player.ready && slot >= 2
    const visible = phase === 'finished' || visibleAtStart || chosen.some((target) => target.seat === owner && target.slot === slot)
    return (card !== null) === visible && (index === 0 || slot > player.cards[index - 1]!.slot)
  }))
}))

const settings = v.pipe(object({ game, capacity: natural }), v.check(validSettings))
const seat = object({ seat: index, player: v.nullable(player), bot: bool, ready: bool, online: bool })
const round = v.pipe(object({ id: match, game, capacity: natural, humans: v.pipe(v.array(index), v.maxLength(6)) }), v.check((value) => {
  return validSettings(value) && value.humans[0] === 0 &&
    value.humans.every((seat, i) => seat < value.capacity && (i === 0 || seat > value.humans[i - 1]!)) &&
    (value.humans.length === value.capacity || (value.game === 'xeri' && value.capacity === 4))
}))
const commitments = v.pipe(v.array(object({ seat: index, hash: seed })), v.maxLength(6))
const seeding = object({ round, step: v.picklist(['commit', 'reveal']), commitments })

function ascending(cards: number[], after: number) {
  return cards.every((card, index) => card > (cards[index - 1] ?? after))
}

const maxTheslibbiSeats = theslibbiSeats.at(-1)!
const levelNumber = v.pipe(natural, v.minValue(1), v.maxValue(theslibbiMaxLevel))
const theslibbiLastAction = v.variant('kind', [
  object({ seat: index, kind: v.picklist(['played', 'mistake']) }),
  object({ seat: index, kind: v.literal('level-up'), card: numberCard }),
])
const theslibbiView = v.pipe(object({
  seat: index, version: natural, lives: natural, outcome: v.nullable(v.picklist(['win', 'loss'])),
  level: levelNumber, levelCount: levelNumber, score: natural,
  hand: v.pipe(v.array(numberCard), v.maxLength(theslibbiMaxLevel)),
  handCounts: v.pipe(v.array(v.pipe(natural, v.maxValue(theslibbiMaxLevel))), v.maxLength(maxTheslibbiSeats)),
  played: v.pipe(v.array(numberCard), v.maxLength(maxTheslibbiSeats * theslibbiMaxLevel)),
  last: v.nullable(theslibbiLastAction),
}), v.check(({ seat, hand, handCounts, level, levelCount, score, lives, played, version, outcome, last }) => {
  const players = handCounts.length
  const remaining = handCounts.reduce((sum, count) => sum + count, 0)
  if (levelCount !== theslibbiLevelCount(players) || level > levelCount || handCounts.some((count) => count > level) ||
    score !== theslibbiScore(players, level, played.length) || version !== score + players - lives ||
    handCounts[seat] !== hand.length || lives > players || remaining + played.length !== players * level ||
    !ascending(played, 0) || !ascending(hand, played.at(-1) ?? 0) ||
    (version === 0) !== (last === null)) return false
  if (last) {
    const count = handCounts[last.seat]
    if (count === undefined || (last.kind === 'played' && (!played.length || count === level)) ||
      (last.kind === 'mistake' && (lives === players || count === 0)) ||
      (last.kind === 'level-up' && (level === 1 || played.length > 0))) return false
  }
  if (lives === 0) return outcome === 'loss' && remaining > 0 && last?.kind === 'mistake'
  if (remaining === 0) return level === levelCount && outcome === 'win' && last?.kind === 'played'
  return outcome === null
}))

const snapshot = v.pipe(object({
  id: invite, revision: natural, self: index, game, capacity: natural, phase: v.picklist(['open', 'seeding', 'playing', 'finished']),
  seats: v.pipe(v.array(seat), v.maxLength(6)), match: v.nullable(match),
  xeri: v.nullable(xeriView), cambio: v.nullable(cambioView), theslibbi: v.optional(theslibbiView),
  seeding: v.nullable(seeding), notice: statusText,
}), v.check((lobby) => {
  const { xeri, cambio, theslibbi, seeding } = lobby
  if (!validSettings(lobby) || lobby.seats.length !== lobby.capacity || !lobby.seats[lobby.self]?.player ||
    !lobby.seats.every((seat, index) => seat.seat === index && !(seat.player && seat.bot))) return false
  if (lobby.game === 'theslibbi' && lobby.seats.some((seat) => seat.bot || (!seat.player && lobby.phase !== 'open'))) return false
  if (lobby.phase === 'open') return lobby.match === null && !seeding && !xeri && !cambio && !theslibbi
  if (lobby.phase === 'seeding') return !!seeding && lobby.match === seeding.round.id && seeding.round.game === lobby.game &&
    seeding.round.capacity === lobby.capacity && !xeri && !cambio && !theslibbi
  if (!lobby.match || seeding) return false
  const finished = lobby.phase === 'finished'
  if (lobby.game === 'xeri') {
    return !!xeri && !cambio && !theslibbi && xeri.seat === lobby.self && xeri.seats === lobby.capacity &&
      xeri.finished === finished && xeri.handCounts.length === lobby.capacity
  }
  if (lobby.game === 'theslibbi') {
    return !!theslibbi && !xeri && !cambio && theslibbi.seat === lobby.self && theslibbi.handCounts.length === lobby.capacity &&
      (theslibbi.outcome !== null) === finished
  }
  return !!cambio && !xeri && !theslibbi && cambio.seat === lobby.self && cambio.players.length === lobby.capacity &&
    (cambio.phase === 'finished') === finished
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
  object({ type: v.literal('theslibbi-play'), id, match, version: natural, card: numberCard }),
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
