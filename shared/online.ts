import type { Card, GameView } from '../vendor/xeri/game/engine.js'
import type { CambioAction, CambioView } from '../src/games/ab6super6/engine.ts'

export type Player = { id: string; name: string }
export const playableGames = ['xeri', 'ab6super6'] as const
export const roomGames = [...playableGames, 'theslibbi'] as const
export type PlayableGame = typeof playableGames[number]
export type OnlineGame = typeof roomGames[number]
export type Seat = { seat: number; player: Player | null; bot: boolean; ready: boolean; online: boolean }
export type Message = { id: number; from: Player; text: string; sentAt: number }
export type RoomSettings = { game: OnlineGame; capacity: number }

export type Round = {
  id: string
  game: PlayableGame
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
  seeding: Seeding | null
  notice: string
}

export type GameMove =
  | { type: 'xeri-play'; id: string; match: string; version: number; card: Card }
  | { type: 'cambio-play'; id: string; match: string; version: number; action: CambioAction }

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
export const capacities = { xeri: [2, 4], ab6super6: [2, 3, 4, 5, 6], theslibbi: [2, 3, 4] } satisfies Record<OnlineGame, number[]>

export function isPlayableGame(game: OnlineGame): game is PlayableGame {
  return playableGames.some((id) => id === game)
}

export function validNickname(name: string) {
  return name.length >= 1 && name.length <= 24 && name === name.trim() && !/[\p{Cc}\p{Cf}]/u.test(name)
}

export function validSettings({ game, capacity }: RoomSettings) {
  return roomGames.includes(game) && capacities[game].includes(capacity)
}
