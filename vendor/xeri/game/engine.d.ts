export type Suit = 'S' | 'H' | 'C' | 'D'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
export type Card = `${Rank}${Suit}`

export type Move = { seat: number; card: Card; captures: boolean; bonus: number; collected: number; remainder: number }
export type Score = { cards: number; bonus: number; total: number }

export type GameState = {
  seats: 2 | 4
  hands: Card[][]
  deck: Card[]
  table: Card[]
  publicCards: Card[]
  taken: Card[][]
  bonuses: number[]
  turn: number | null
  lastCapture: number | null
  lastMove: Move | null
  deal: number
  version: number
  finished: boolean
}

export type GameView = {
  seat: number
  seats: 2 | 4
  hand: Card[]
  handCounts: number[]
  table: Card[]
  publicCards: Card[]
  collected: Card[][]
  deckCount: number
  scores: [Score, Score]
  turn: number | null
  lastMove: Move | null
  deal: number
  version: number
  finished: boolean
  winner: 0 | 1 | null
}

export const SUITS: ReadonlyArray<{ id: Suit; symbol: string; name: string; red?: boolean }>
export const DECK: ReadonlyArray<Card>
export function rankOf(card: Card): Rank
export function cardLabel(card: Card): string
export function newGame(seats: 2 | 4, deck?: ReadonlyArray<Card>): GameState
export function playCard(game: GameState, seat: number, card: Card): (GameState & { lastMove: Move }) | null
export function viewFor(game: GameState, seat: number): GameView
