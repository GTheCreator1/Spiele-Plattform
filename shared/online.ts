import type { Card, GameView } from '../vendor/xeri/game/engine.js'
import type { CambioAction, CambioView } from '../src/games/ab6super6/engine'

export type Player = { id: string; name: string }
export type Friend = Player & { online: boolean }
export type FriendRequest = Player & { incoming: boolean }
export type OnlineGame = 'xeri' | 'ab6super6'
export type Invitation = { id: string; game: OnlineGame; from: Player; lobbyId: string; players: number; capacity: number; expires: number }
export type Seat = { seat: number; player: Player | null; bot: boolean; ready: boolean; online: boolean }
export type Message = { id: number; from: Player | null; text: string; sentAt: number }

export type Lobby = {
  id: string
  game: OnlineGame
  host: string
  capacity: number
  phase: 'open' | 'playing' | 'finished'
  seats: Seat[]
  match: string | null
  xeri: GameView | null
  cambio: CambioView | null
  chat: Message[]
}

export type Snapshot = {
  revision: number
  user: Player
  friends: Friend[]
  requests: FriendRequest[]
  invitations: Invitation[]
  lobby: Lobby | null
}

export type OnlineAction =
  | { type: 'friend-request' | 'friend-accept' | 'friend-decline' | 'friend-remove'; player: string }
  | { type: 'lobby-create'; game: OnlineGame; capacity: number }
  | { type: 'lobby-invite'; player: string }
  | { type: 'invite-accept' | 'invite-decline'; invitation: string }
  | { type: 'lobby-ready'; ready: boolean }
  | { type: 'lobby-bot'; seat: number; enabled: boolean }
  | { type: 'lobby-start' | 'lobby-leave' | 'lobby-rematch' }
  | { type: 'chat'; id: string; text: string }
  | { type: 'xeri-play'; id: string; match: string; version: number; card: Card }
  | { type: 'cambio-play'; id: string; match: string; version: number; action: CambioAction }

export const liveProtocol = 'stichrunde.v1'
export const heartbeatMs = 30_000
export const onlineNames = { xeri: 'Xeri (Ξερή)', ab6super6: 'ab6super6' } satisfies Record<OnlineGame, string>
