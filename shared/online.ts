import type { Card, GameView } from '../vendor/xeri/game/engine.js'
import type { CambioAction, CambioView } from '../src/games/ab6super6/engine.ts'
import { theslibbiSeats } from '../src/games/theslibbi/engine.ts'
import type { TheslibbiView } from '../src/games/theslibbi/engine.ts'

export type Player = { id: string; name: string }
export const roomGames = ['xeri', 'ab6super6', 'theslibbi'] as const
export type OnlineGame = typeof roomGames[number]
export type Seat = { seat: number; player: Player | null; bot: boolean; ready: boolean; online: boolean }
export type Message = { id: number; from: Player; text: string; sentAt: number }
export type RoomSettings = { game: OnlineGame; capacity: number }

export type Round = {
  id: string
  game: OnlineGame
  capacity: number
  humans: number[]
}
export type Commitment = { seat: number; hash: string }
export type Contribution = { seat: number; secret: string }
export type Seeding = { round: Round; step: 'commit' | 'reveal'; commitments: Commitment[] }
export type Lobby = RoomSettings & {
  id: string
  revision: number
  self: number
  phase: 'open' | 'seeding' | 'playing' | 'finished'
  seats: Seat[]
  match: string | null
  xeri: GameView | null
  cambio: CambioView | null
  theslibbi?: TheslibbiView
  seeding: Seeding | null
  notice: string
}

export type GameMove =
  | { type: 'xeri-play'; id: string; match: string; version: number; card: Card }
  | { type: 'cambio-play'; id: string; match: string; version: number; action: CambioAction }
  | { type: 'theslibbi-play'; id: string; match: string; version: number; card: number }

export type OnlineAction =
  | { type: 'lobby-settings'; settings: RoomSettings }
  | { type: 'lobby-ready'; ready: boolean }
  | { type: 'lobby-bot'; seat: number; enabled: boolean }
  | { type: 'lobby-start' | 'lobby-rematch' | 'lobby-cancel' }
  | { type: 'lobby-release'; seat: number }
  | { type: 'chat'; id: string; text: string }
  | GameMove

export type MatchEvent = { at: number; seat: number; move: GameMove } | { at: number; tick: true }
export type ProofStart = {
  round: Round
  commitments: Commitment[]
  contributions: Contribution[]
  events: number
}
export type AuditStatus = 'idle' | 'checking' | 'verified' | 'single' | 'failed' | 'unavailable'

export const invitePattern = /^[0-9a-f]{48}$/
export const matchPattern = /^[0-9a-f]{32}$/
export const seedPattern = /^[0-9a-f]{64}$/
export const onlineNames = { xeri: 'Xeri (Ξερή)', ab6super6: 'ab6super6', theslibbi: 'THESLIBBI' } satisfies Record<OnlineGame, string>
export const capacities: Record<OnlineGame, readonly number[]> = {
  xeri: [2, 4], ab6super6: [2, 3, 4, 5, 6], theslibbi: theslibbiSeats,
}

export function isGameMove(action: OnlineAction): action is GameMove {
  return action.type === 'xeri-play' || action.type === 'cambio-play' || action.type === 'theslibbi-play'
}

export function validNickname(name: string) {
  return name.length >= 1 && name.length <= 24 && name === name.trim() && !/[\p{Cc}\p{Cf}]/u.test(name)
}

export function validSettings({ game, capacity }: RoomSettings) {
  return roomGames.includes(game) && capacities[game].includes(capacity)
}
