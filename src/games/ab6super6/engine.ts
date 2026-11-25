import { DECK } from '../../../vendor/xeri/game/engine.js'
import type { Card } from '../../../vendor/xeri/game/engine.js'
import { shuffleCards, uniformIndex } from '../../../shared/random.ts'
import type { RandomIndex } from '../../../shared/random.ts'

export type CambioCard = Card | 'joker-1' | 'joker-2' | 'joker-3'
export const cambioDeck: readonly CambioCard[] = Object.freeze([...DECK, 'joker-1', 'joker-2', 'joker-3'])
export const reactionMs = 2_000

export type Slot = { slot: number; card: CambioCard }
export type Target = { seat: number; slot: number }
export type EffectKind = 'add' | 'own' | 'other' | 'blind-swap' | 'king'
type Effect = { id: number; seat: number; kind: EffectKind; chosen?: Target[] }
type Player = { cards: Slot[]; nextSlot: number; ready: boolean; peeked: boolean }
type Reaction = { id: number; until: number | null }
type Drawn = { card: CambioCard }
type FinalRound = { knocker: number; remaining: number }
type Debt = { seat: number; count: number }
export type Result = { seat: number; total: number; outcome: 'win' | 'tie' | 'loss'; invalidKnock: boolean }
export type ThrowEvent = { seat: number; target: Target; card: CambioCard; correct: boolean; penalized: number | null }

export type CambioState = {
  phase: 'setup' | 'playing' | 'finished'
  players: Player[]
  deck: CambioCard[]
  discard: CambioCard[]
  turn: number
  drawn: Drawn | null
  reaction: Reaction | null
  effects: Effect[]
  final: FinalRound | null
  debts: Debt[]
  result: Result[] | null
  lastThrow: ThrowEvent | null
  version: number
}

export type CambioAction =
  | { type: 'peek-start' | 'ready' | 'draw' | 'knock' }
  | { type: 'effect-skip' }
  | { type: 'discard'; slot?: number }
  | { type: 'throw'; window: number; target: Target }
  | { type: 'effect-select'; seat?: number; targets?: Target[] }
  | { type: 'effect-finish'; swap?: boolean }

export class CambioError extends Error {}

function check(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new CambioError(detail)
}

export function cambioRank(card: CambioCard) {
  return card.startsWith('joker-') ? 'Joker' : card.slice(0, -1)
}

export function cambioPoints(card: CambioCard) {
  const rank = cambioRank(card)
  if (rank === 'Joker') return 0
  if (rank === 'K') return card.endsWith('H') || card.endsWith('D') ? -1 : 10
  if (rank === 'A') return 1
  if (rank === 'J' || rank === 'Q') return 10
  return Number(rank)
}

export function newCambio(seats: number, index: RandomIndex = uniformIndex): CambioState {
  check(Number.isInteger(seats) && seats >= 2 && seats <= 6, 'ab6super6 benötigt zwei bis sechs Spieler.')
  const deck = shuffleCards(cambioDeck, index)
  const players = Array.from({ length: seats }, (_, seat) => ({
    cards: Array.from({ length: 4 }, (_, slot) => ({ slot, card: deck[slot * seats + seat]! })),
    nextSlot: 4, ready: false, peeked: false,
  }))
  return {
    phase: 'setup', players, deck: deck.slice(seats * 4), discard: [], turn: 0, drawn: null,
    reaction: null, effects: [], final: null, debts: [], result: null, lastThrow: null, version: 0,
  }
}

function effectFor(card: CambioCard): EffectKind | undefined {
  const rank = cambioRank(card)
  if (rank === '6') return 'add'
  if (rank === '7' || rank === '8') return 'own'
  if (rank === '9' || rank === '10') return 'other'
  if (rank === 'J' || rank === 'Q') return 'blind-swap'
  if (rank === 'K' && cambioPoints(card) === 10) return 'king'
}

function take(state: CambioState, random: RandomIndex) {
  if (state.deck.length === 0 && state.discard.length > 1) {
    state.deck = shuffleCards(state.discard.slice(0, -1), random)
    state.discard = state.discard.slice(-1)
  }
  return state.deck.pop()
}

function addCard(player: Player, card: CambioCard) {
  player.cards.push({ slot: player.nextSlot++, card })
}

function settleDebts(state: CambioState, random: RandomIndex) {
  while (state.debts[0]) {
    const first = state.debts[0]
    const card = take(state, random)
    if (!card) return
    addCard(state.players[first.seat]!, card)
    first.count--
    if (!first.count) state.debts.shift()
  }
}

function locate(state: CambioState, target: Target) {
  return state.players[target.seat]?.cards.find(({ slot }) => slot === target.slot)
}

function place(state: CambioState, seat: number, card: CambioCard, correct: boolean) {
  state.discard.push(card)
  const effect = correct && effectFor(card)
  if (effect) state.effects.push({ id: state.version, seat, kind: effect })
}

export function scoreCambio(players: readonly { cards: Slot[] }[], knocker: number): Result[] {
  const totals = players.map(({ cards }) => cards.reduce((sum, { card }) => sum + cambioPoints(card), 0))
  const knockTotal = totals[knocker]!
  const invalidKnock = knockTotal > 6
  const onlyLowest = totals.every((value, seat) => seat === knocker || value > knockTotal)
  const eligible = totals.map((total, seat) => seat === knocker && (invalidKnock || !onlyLowest) ? Infinity : total)
  const lowest = Math.min(...eligible)
  const tied = eligible.filter((total) => total === lowest).length > 1
  return totals.map((total, seat) => ({
    seat, total, invalidKnock: seat === knocker && invalidKnock,
    outcome: eligible[seat] === lowest ? (tied ? 'tie' : 'win') : 'loss',
  }))
}

function finish(state: CambioState, now: number) {
  if (state.final?.remaining !== 0) return
  if (state.reaction && (state.reaction.until === null || state.reaction.until > now)) return
  state.reaction = null
  if (state.effects.length) return
  state.phase = 'finished'
  state.result = scoreCambio(state.players, state.final.knocker)
}

export function advanceCambioClock(previous: CambioState, now: number) {
  if (previous.phase !== 'playing' || previous.final?.remaining !== 0 || !previous.reaction ||
    previous.reaction.until === null || previous.reaction.until > now) return previous
  const next = structuredClone(previous)
  next.version++
  next.lastThrow = null
  finish(next, now)
  return next
}

function throwCard(state: CambioState, actor: number, action: Extract<CambioAction, { type: 'throw' }>, now: number) {
  const reaction = state.reaction
  const top = state.discard.at(-1)
  check(reaction && top && reaction.id === action.window && (reaction.until === null || now < reaction.until),
    'Dieses Reaktionsfenster ist geschlossen.')
  const { seat, slot } = action.target
  const card = locate(state, action.target)
  check(card, 'Diese Karte liegt nicht mehr aus.')
  check(!state.effects[0]?.chosen?.some((target) => target.seat === seat && target.slot === slot),
    'Diese Karte gehört zu einer laufenden Spezialaktion.')
  const correct = cambioRank(card.card) === cambioRank(top)
  const source = state.players[seat]!
  source.cards = source.cards.filter((entry) => entry.slot !== slot)
  place(state, actor, card.card, correct)
  const penalized = !correct ? actor : seat !== actor ? seat : null
  if (penalized !== null) state.debts.push({ seat: penalized, count: 2 })
  state.lastThrow = { seat: actor, target: action.target, card: card.card, correct, penalized }
}

function swap(state: CambioState, first: Target, second: Target) {
  const a = locate(state, first)!
  const b = locate(state, second)!
  const previous = a.card
  a.card = b.card
  b.card = previous
}

function applyEffect(state: CambioState, actor: number, action: Extract<CambioAction, { type: 'effect-skip' | 'effect-select' | 'effect-finish' }>, random: RandomIndex) {
  const effect = state.effects[0]
  check(effect?.seat === actor, 'Diese Spezialaktion ist noch nicht an der Reihe.')
  if (action.type === 'effect-skip') {
    state.effects.shift()
    return
  }
  if (action.type === 'effect-finish') {
    check(effect.chosen, 'Wähle zuerst die Karten aus.')
    if (effect.kind === 'king' && action.swap) swap(state, effect.chosen[0]!, effect.chosen[1]!)
    state.effects.shift()
    return
  }
  check(!effect.chosen, 'Die Karten wurden bereits gewählt.')
  if (effect.kind === 'add') {
    const seat = action.seat
    check(seat !== undefined && seat !== actor && state.players[seat], 'Wähle einen anderen Spieler.')
    const card = take(state, random)
    check(card, 'Zurzeit ist keine Zusatzkarte verfügbar. Du kannst den Effekt auslassen.')
    addCard(state.players[seat]!, card)
    state.effects.shift()
    return
  }

  const pair = effect.kind === 'blind-swap' || effect.kind === 'king'
  const targets = action.targets
  check(targets?.length === (pair ? 2 : 1) && targets.every((target) => locate(state, target)), 'Wähle vorhandene Karten.')
  const [first, second] = targets
  check(first && (!second || first.seat !== second.seat || first.slot !== second.slot), 'Wähle verschiedene Karten.')
  check(effect.kind !== 'own' || first.seat === actor, 'Wähle eine eigene Karte.')
  check(effect.kind !== 'other' || first.seat !== actor, 'Wähle eine fremde Karte.')
  if (effect.kind === 'blind-swap') {
    swap(state, first, second!)
    state.effects.shift()
  } else {
    effect.chosen = targets
  }
}

export function playCambio(previous: CambioState, actor: number, action: CambioAction, now: number, random: RandomIndex = uniformIndex): CambioState {
  check(Number.isInteger(actor) && previous.players[actor] && (previous.phase === 'setup' || previous.phase === 'playing'),
    'Die Partie ist beendet oder der Sitz ist ungültig.')
  const state = structuredClone(previous)
  const player = state.players[actor]!
  state.version++
  state.lastThrow = null
  if (state.phase === 'setup') {
    check(!player.ready, 'Du bist bereits bereit.')
    if (action.type === 'peek-start') {
      check(!player.peeked, 'Die Startkarten wurden bereits angeschaut.')
      player.peeked = true
    } else {
      check(action.type === 'ready', 'Warte, bis alle Spieler bereit sind.')
      player.ready = true
      if (state.players.every(({ ready }) => ready)) state.phase = 'playing'
    }
    return state
  }

  if (action.type === 'throw') {
    throwCard(state, actor, action, now)
  } else if (action.type === 'effect-select' || action.type === 'effect-finish' || action.type === 'effect-skip') {
    applyEffect(state, actor, action, random)
  } else {
    check(actor === state.turn && state.final?.remaining !== 0, 'Du bist gerade nicht am Zug.')
    if (action.type === 'draw') {
      check(!state.drawn, 'Du hast bereits gezogen.')
      const card = take(state, random)
      check(card, 'Im Ziehstapel ist zurzeit keine Karte verfügbar.')
      state.drawn = { card }
      if (state.reaction?.until === null) state.reaction.until = now + reactionMs
    } else if (action.type === 'knock') {
      check(!state.drawn && !state.final, 'Klopfen ist nur zu Beginn des eigenen Zuges erlaubt.')
      state.final = { knocker: actor, remaining: state.players.length }
      state.turn = (actor + 1) % state.players.length
    } else {
      check(action.type === 'discard' && state.drawn, 'Ziehe zuerst eine Karte.')
      check(!state.reaction || (state.reaction.until !== null && now >= state.reaction.until), 'Warte auf das Ende der Reaktionsfrist.')
      check(!state.effects.length, 'Die laufenden Spezialaktionen werden zuerst ausgeführt.')
      let outgoing = state.drawn.card
      if (action.slot !== undefined) {
        const slot = locate(state, { seat: actor, slot: action.slot })
        check(slot, 'Diese Karte liegt nicht mehr aus.')
        outgoing = slot.card
        slot.card = state.drawn.card
      }
      state.drawn = null
      place(state, actor, outgoing, true)
      if (state.final) state.final.remaining--
      state.reaction = { id: state.version, until: state.final?.remaining === 0 ? now + reactionMs : null }
      state.turn = (actor + 1) % state.players.length
    }
  }
  settleDebts(state, random)
  finish(state, now)
  return state
}

export function viewCambio(state: CambioState, seat: number, now = Date.now()) {
  const effect = state.effects[0]
  const selected = effect?.seat === seat ? effect.chosen ?? [] : []
  const players = state.players.map((player, owner) => ({
    ready: player.ready,
    cards: player.cards.map(({ slot, card }) => {
      const atStart = state.phase === 'setup' && owner === seat && slot >= 2 && player.peeked && !player.ready
      const seen = atStart || state.phase === 'finished' || selected.some((target) => target.seat === owner && target.slot === slot)
      return { slot, card: seen ? card : null }
    }),
  }))
  return {
    phase: state.phase, seat, players, version: state.version, turn: state.turn, now,
    deckCount: state.deck.length, top: state.discard.at(-1) ?? null,
    drawn: seat === state.turn ? state.drawn?.card ?? null : null,
    hasDrawn: state.drawn !== null,
    reaction: state.reaction,
    effect: effect ? { id: effect.id, seat: effect.seat, kind: effect.kind, chosen: selected } : null,
    unpaidPenalties: state.phase === 'finished' ? state.debts.reduce((sum, debt) => sum + debt.count, 0) : 0,
    final: state.final, result: state.result, lastThrow: state.lastThrow,
    startViewed: state.players[seat]?.peeked ?? false,
  }
}

export type CambioView = ReturnType<typeof viewCambio>
