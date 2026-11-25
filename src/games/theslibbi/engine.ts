import { shuffleCards } from '../../../shared/random.ts'
import type { RandomIndex } from '../../../shared/random.ts'

const levelCounts = new Map([[2, 12], [3, 10], [4, 8]])
export const theslibbiSeats: readonly number[] = [...levelCounts.keys()]
export const theslibbiMaxLevel = Math.max(...levelCounts.values())
export const theslibbiDeckSize = 100
const deck = Array.from({ length: theslibbiDeckSize }, (_, index) => index + 1)

type LastAction =
  | { seat: number; kind: 'played' | 'mistake' }
  | { seat: number; kind: 'level-up'; card: number }
type RoundStatus = {
  level: number
  levelCount: number
  lives: number
  played: number[]
  version: number
  last: LastAction | null
  outcome: 'win' | 'loss' | null
}
export type TheslibbiState = RoundStatus & { hands: number[][] }
export type TheslibbiView = RoundStatus & { seat: number; hand: number[]; handCounts: number[]; score: number }

export function theslibbiLevelCount(players: number) {
  return levelCounts.get(players)
}

export function theslibbiScore(players: number, level: number, played: number) {
  return players * (level - 1) * level / 2 + played
}

function dealHands(players: number, level: number, index?: RandomIndex) {
  const shuffled = shuffleCards(deck, index)
  return Array.from({ length: players }, (_, seat) =>
    shuffled.slice(seat * level, (seat + 1) * level).sort((first, second) => first - second),
  )
}

export function newTheslibbi(players: number, index?: RandomIndex): TheslibbiState {
  const levelCount = theslibbiLevelCount(players)
  if (levelCount === undefined) throw new RangeError('THESLIBBI ist für zwei bis vier Personen.')
  return { level: 1, levelCount, hands: dealHands(players, 1, index), lives: players, played: [], version: 0, last: null, outcome: null }
}

export function playTheslibbi(state: TheslibbiState, seat: number, card: number, nextDealIndex?: RandomIndex): TheslibbiState {
  if (state.outcome) throw new Error('Die Sortierrunde ist beendet.')
  if (state.hands[seat]?.[0] !== card) throw new Error('Du kannst nur deine kleinste Handkarte ausspielen.')

  const version = state.version + 1
  if (state.hands.some(([lowest]) => lowest !== undefined && lowest < card)) {
    const lives = state.lives - 1
    return { ...state, lives, version, last: { seat, kind: 'mistake' }, outcome: lives === 0 ? 'loss' : null }
  }

  const hands = state.hands.map((hand, owner) => owner === seat ? hand.slice(1) : hand)
  const levelComplete = hands.every((hand) => hand.length === 0)
  if (levelComplete && state.level < state.levelCount) {
    const level = state.level + 1
    return {
      ...state, level, version, hands: dealHands(hands.length, level, nextDealIndex), played: [],
      last: { seat, kind: 'level-up', card },
    }
  }
  const played = [...state.played, card]
  const outcome = levelComplete ? 'win' : null
  return { ...state, hands, played, version, last: { seat, kind: 'played' }, outcome }
}

export function viewTheslibbi(state: TheslibbiState, seat: number): TheslibbiView {
  const { level, levelCount, played, lives, version, last, outcome, hands } = state
  return {
    seat, level, levelCount, score: theslibbiScore(hands.length, level, played.length),
    played: [...played], lives, version, last: last && { ...last }, outcome,
    hand: [...(hands[seat] ?? [])], handCounts: hands.map((hand) => hand.length),
  }
}
