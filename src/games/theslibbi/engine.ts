import { shuffleCards } from '../../../shared/random.ts'
import type { RandomIndex } from '../../../shared/random.ts'

export const theslibbiSeats = [2, 3, 4] as const
export const theslibbiHandSize = 4
export const theslibbiDeckSize = 100
const deck = Array.from({ length: theslibbiDeckSize }, (_, index) => index + 1)

type LastAction = { seat: number; kind: 'played' | 'mistake' }
type RoundStatus = { lives: number; played: number[]; version: number; last: LastAction | null; outcome: 'win' | 'loss' | null }
export type TheslibbiState = RoundStatus & { hands: number[][] }
export type TheslibbiView = RoundStatus & { seat: number; hand: number[]; handCounts: number[] }

export function newTheslibbi(players: number, index?: RandomIndex): TheslibbiState {
  if (!theslibbiSeats.some((size) => size === players)) throw new RangeError('THESLIBBI ist für zwei bis vier Personen.')
  const shuffled = shuffleCards(deck, index)
  const hands = Array.from({ length: players }, (_, seat) =>
    shuffled.slice(seat * theslibbiHandSize, (seat + 1) * theslibbiHandSize).sort((first, second) => first - second),
  )
  return { hands, lives: players, played: [], version: 0, last: null, outcome: null }
}

export function playTheslibbi(state: TheslibbiState, seat: number, card: number): TheslibbiState {
  if (state.outcome) throw new Error('Die Sortierrunde ist beendet.')
  if (state.hands[seat]?.[0] !== card) throw new Error('Du kannst nur deine kleinste Handkarte ausspielen.')

  const version = state.version + 1
  if (state.hands.some(([lowest]) => lowest !== undefined && lowest < card)) {
    const lives = state.lives - 1
    return { ...state, lives, version, last: { seat, kind: 'mistake' }, outcome: lives === 0 ? 'loss' : null }
  }

  const hands = state.hands.map((hand, owner) => owner === seat ? hand.slice(1) : hand)
  const played = [...state.played, card]
  const outcome = hands.every((hand) => hand.length === 0) ? 'win' : null
  return { ...state, hands, played, version, last: { seat, kind: 'played' }, outcome }
}

export function viewTheslibbi(state: TheslibbiState, seat: number): TheslibbiView {
  const { played, lives, version, last, outcome, hands } = state
  return {
    seat, played: [...played], lives, version, last: last && { ...last }, outcome,
    hand: [...(hands[seat] ?? [])], handCounts: hands.map((hand) => hand.length),
  }
}
