import type { Invitation, Lobby, Message, OnlineGame, Seat } from '../shared/online'
import { advanceCambioClock, CambioError, newCambio, playCambio, viewCambio } from '../src/games/ab6super6/engine'
import type { CambioState } from '../src/games/ab6super6/engine'
import { chooseCard } from '../vendor/xeri/game/ai.js'
import { isCard, newGame, playCard, shuffle, viewFor } from '../vendor/xeri/game/engine.js'
import type { GameState } from '../vendor/xeri/game/engine.js'
import type { Database } from './database'
import type { Social } from './social'
import { HttpError, idPattern, need } from './http'
import { parseCambio } from './cambio-action'

type Room = {
  id: string
  game: OnlineGame
  host: string
  capacity: number
  phase: Lobby['phase']
  match: string | null
  state: string | null
  seat: number
}
type SeatRow = { seat: number; user: string | null; ready: number; name: string | null }
type InviteRow = { id: string; room: string; game: OnlineGame; sender: string; name: string; count: number; capacity: number; expires: number }
type ChatRow = { id: number; user: string; name: string; text: string; sent: number }
const thirtyDays = 30 * 86_400_000

function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32
}

export class Lobbies {
  constructor(
    private readonly db: Database,
    private readonly social: Social,
    private readonly isOnline: (id: string) => boolean,
  ) {}

  current(user: string) {
    return this.db.first<Room>(
      'SELECT r.*, s.seat FROM seats s JOIN rooms r ON r.id=s.room WHERE s.user=?', user,
    )
  }

  view(user: string): Lobby | null {
    const room = this.current(user)
    if (!room) return null
    const seats = this.getSeats(room.id)
    const players: Seat[] = Array.from({ length: room.capacity }, (_, seat) => {
      const current = seats.find((item) => item.seat === seat)
      const player = current?.user ? { id: current.user, name: current.name! } : null
      return { seat, player, bot: current?.user === null, ready: Boolean(current?.ready), online: player ? this.isOnline(player.id) : Boolean(current) }
    })
    const chat: Message[] = this.db.query<ChatRow>(`
      SELECT m.id, m.user, u.name, m.text, m.sent FROM messages m JOIN users u ON u.id=m.user
      WHERE m.room=? AND m.sent>? ORDER BY m.id DESC LIMIT 80`, room.id, Date.now() - thirtyDays,
    ).reverse().map(({ id, user, name, text, sent }) => ({ id, from: { id: user, name }, text, sentAt: sent }))

    return {
      id: room.id, game: room.game, host: room.host, capacity: room.capacity, phase: room.phase, seats: players,
      match: room.match,
      xeri: room.state && room.game === 'xeri' ? viewFor(JSON.parse(room.state) as GameState, room.seat) : null,
      cambio: room.state && room.game === 'ab6super6' ? viewCambio(JSON.parse(room.state) as CambioState, room.seat) : null,
      chat,
    }
  }

  invitations(user: string): Invitation[] {
    return this.db.query<InviteRow>(`
      SELECT i.id, i.room, i.sender, u.name, r.game, r.capacity, i.expires,
        (SELECT count(*) FROM seats WHERE room=i.room) AS count
      FROM invitations i JOIN rooms r ON r.id=i.room JOIN users u ON u.id=i.sender
      WHERE i.recipient=? AND i.expires>? AND r.phase='open' ORDER BY i.expires DESC LIMIT 30`, user, Date.now(),
    ).filter((invite) => invite.count < invite.capacity).map((invite) => ({
      id: invite.id, game: invite.game, from: { id: invite.sender, name: invite.name }, lobbyId: invite.room,
      players: invite.count, capacity: invite.capacity, expires: invite.expires,
    }))
  }

  observers(room: string, affected: Set<string>) {
    for (const { user } of this.getSeats(room)) if (user) affected.add(user)
    for (const { recipient } of this.db.query<{ recipient: string }>(
      'SELECT recipient FROM invitations WHERE room=? AND expires>?', room, Date.now(),
    )) affected.add(recipient)
  }

  leave(user: string, affected: Set<string>) {
    const room = this.current(user)
    if (!room) return
    this.observers(room.id, affected)
    this.db.run('DELETE FROM seats WHERE user=?', user)
    this.db.run('DELETE FROM invitations WHERE room=? AND sender=?', room.id, user)
    const remaining = this.getSeats(room.id).find((seat) => seat.user)
    if (!remaining?.user) {
      this.db.run('DELETE FROM rooms WHERE id=?', room.id)
    } else {
      if (room.host === user) this.db.run('UPDATE rooms SET host=? WHERE id=?', remaining.user, room.id)
      if (room.phase !== 'open') this.reset(room.id)
    }
  }

  private getSeats(room: string) {
    return this.db.query<SeatRow>(
      'SELECT s.seat, s.user, s.ready, u.name FROM seats s LEFT JOIN users u ON u.id=s.user WHERE room=? ORDER BY seat',
      room,
    )
  }

  private reset(room: string) {
    this.db.run("UPDATE rooms SET phase='open', match=NULL, state=NULL, final_at=NULL WHERE id=?", room)
    this.db.run('DELETE FROM moves WHERE room=?', room)
    this.db.run('UPDATE seats SET ready=0 WHERE room=? AND user IS NOT NULL', room)
  }

  private invite(user: string, room: Room, player: unknown, affected: Set<string>) {
    need(room.phase === 'open', 'Die Lobby ist bereits gestartet.', 409)
    need(this.getSeats(room.id).length < room.capacity, 'Die Lobby ist voll.', 409)
    need(typeof player === 'string' && this.social.friends(user, player), 'Du kannst nur bestätigte Freunde einladen.', 403)
    need(!this.current(player), 'Diese Person ist bereits in einer Lobby.', 409)
    const now = Date.now()
    const existing = this.db.first<{ expires: number }>('SELECT expires FROM invitations WHERE room=? AND recipient=?', room.id, player)
    if (existing && existing.expires > now) return
    need(this.db.allow(`invite:${user}`, 15, 60_000), 'Zu viele Einladungen in kurzer Zeit.', 429)
    this.db.run(`INSERT INTO invitations VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(room, recipient) DO UPDATE SET id=excluded.id, sender=excluded.sender, expires=excluded.expires`,
    crypto.randomUUID(), room.id, user, player, now + 5 * 60_000)
    affected.add(player)
  }

  private answerInvite(user: string, invite: unknown, accept: boolean, affected: Set<string>) {
    need(typeof invite === 'string' && idPattern.test(invite), 'Die Einladung ist ungültig.')
    const row = this.db.first<{ room: string; sender: string; expires: number }>(
      'SELECT room, sender, expires FROM invitations WHERE id=? AND recipient=?', invite, user,
    )
    need(row && row.expires > Date.now(), 'Die Einladung ist abgelaufen.', 409)
    affected.add(row.sender)
    if (accept) {
      need(!this.current(user), 'Verlasse zuerst deine aktive Lobby.', 409)
      const room = this.db.first<Room>('SELECT * FROM rooms WHERE id=?', row.room)
      need(room?.phase === 'open', 'Diese Lobby ist bereits geschlossen oder gestartet.', 409)
      need(this.social.friends(row.sender, user), 'Die Freundschaft zu dieser Einladung besteht nicht mehr.', 403)
      const occupied = new Set(this.getSeats(room.id).map(({ seat }) => seat))
      const seat = Array.from({ length: room.capacity }, (_, index) => index).find((index) => !occupied.has(index))
      need(seat !== undefined, 'Die Lobby ist voll.', 409)
      this.db.run('INSERT INTO seats(room, seat, user) VALUES (?, ?, ?)', room.id, seat, user)
      this.observers(room.id, affected)
    }
    this.db.run('DELETE FROM invitations WHERE id=?', invite)
  }

  private bot(room: Room, seat: unknown, enabled: unknown) {
    need(room.game === 'xeri' && room.capacity === 4 && room.phase === 'open', 'Bots sind in offenen Xeri-Team-Lobbys verfügbar.', 409)
    need(typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < room.capacity && typeof enabled === 'boolean',
      'Wähle einen gültigen Sitzplatz.')
    if (enabled) {
      need(!this.getSeats(room.id).some((item) => item.seat === seat), 'Dieser Platz ist bereits belegt.', 409)
      this.db.run('INSERT INTO seats(room, seat, user, ready) VALUES (?, ?, NULL, 1)', room.id, seat)
    } else {
      this.db.run('DELETE FROM seats WHERE room=? AND seat=? AND user IS NULL', room.id, seat)
    }
  }

  private start(room: Room) {
    const players = this.getSeats(room.id)
    need(room.phase === 'open' && players.length === room.capacity && players.every(({ user, ready }) => ready && (!user || this.isOnline(user))),
      'Alle Plätze müssen belegt sein und die Spieler müssen verbunden und bereit sein.', 409)
    const state = room.game === 'xeri'
      ? this.botTurns(newGame(room.capacity === 4 ? 4 : 2, shuffle(undefined, secureRandom)), players)
      : newCambio(room.capacity, secureRandom)
    this.db.run("UPDATE rooms SET phase='playing', match=?, state=? WHERE id=?", crypto.randomUUID(), JSON.stringify(state), room.id)
    this.db.run('DELETE FROM invitations WHERE room=?', room.id)
  }

  private botTurns(game: GameState, seats: SeatRow[]) {
    let state = game
    while (state.turn !== null && seats[state.turn]?.user === null) {
      const card = chooseCard(viewFor(state, state.turn), 'normal', secureRandom)
      const next = card && playCard(state, state.turn, card)
      if (!next) throw new Error('Bot action could not be applied')
      state = next
    }
    return state
  }

  private move(room: Room, user: string, body: Record<string, unknown>) {
    const { id, match, version } = body
    need(typeof id === 'string' && idPattern.test(id) && typeof match === 'string' && match === room.match, 'Dieser Zug gehört zu einer anderen Partie.', 409)
    const receipt = this.db.first<{ user: string }>('SELECT user FROM moves WHERE room=? AND match=? AND id=?', room.id, match, id)
    if (receipt) {
      need(receipt.user === user, 'Ungültige Aktions-ID.', 409)
      return
    }
    need(room.phase === 'playing' && room.state, 'Dieser Spielzug ist nicht möglich.', 409)
    const current = JSON.parse(room.state) as GameState | CambioState
    let state: GameState | CambioState
    if (room.game === 'ab6super6') {
      need(body.type === 'cambio-play', 'Diese Aktion gehört zu einem anderen Spiel.')
      const action = parseCambio(body.action)
      need(action.type === 'throw' || action.type === 'ready' || action.type === 'peek-start' || version === current.version,
        'Der Spielstand wurde aktualisiert. Versuche es erneut.', 409)
      try {
        state = playCambio(current as CambioState, room.seat, action, Date.now(), secureRandom)
      } catch (error) {
        if (error instanceof CambioError) throw new HttpError(409, error.message)
        throw error
      }
    } else {
      need(body.type === 'xeri-play' && isCard(body.card), 'Diese Karte ist ungültig.')
      need(version === current.version, 'Der Spielstand wurde aktualisiert. Versuche es erneut.', 409)
      const next = playCard(current as GameState, room.seat, body.card)
      need(next, 'Diese Karte kannst du gerade nicht ausspielen.', 409)
      state = this.botTurns(next, this.getSeats(room.id))
    }
    this.db.run('INSERT INTO moves VALUES (?, ?, ?, ?)', room.id, match, id, user)
    if ('finished' in state) {
      this.db.run('UPDATE rooms SET phase=?, state=? WHERE id=?', state.finished ? 'finished' : 'playing', JSON.stringify(state), room.id)
    } else {
      this.saveCambio(room.id, state)
    }
  }

  private saveCambio(room: string, state: CambioState) {
    const phase = state.phase === 'finished' ? 'finished' : 'playing'
    const finalAt = state.final?.remaining === 0 ? state.reaction?.until ?? null : null
    this.db.run('UPDATE rooms SET phase=?, state=?, final_at=? WHERE id=?', phase, JSON.stringify(state), finalAt, room)
  }

  deadline() {
    return this.db.first<{ at: number | null }>('SELECT min(final_at) AS at FROM rooms WHERE final_at IS NOT NULL')?.at
  }

  advanceDeadlines(now: number, affected: Set<string>) {
    const due = this.db.query<{ id: string; state: string }>('SELECT id, state FROM rooms WHERE final_at <= ?', now)
    for (const room of due) {
      const state = advanceCambioClock(JSON.parse(room.state) as CambioState, now)
      this.saveCambio(room.id, state)
      this.observers(room.id, affected)
    }
    return due.length > 0
  }

  private chat(room: string, user: string, body: Record<string, unknown>) {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const id = body.id
    need(typeof id === 'string' && idPattern.test(id) && text.length >= 1 && text.length <= 500, 'Nachrichten benötigen 1 bis 500 Zeichen.')
    if (this.db.first('SELECT id FROM messages WHERE room=? AND user=? AND client_id=?', room, user, id)) return
    need(this.db.allow(`chat:${user}`, 6, 10_000), 'Du sendest zu schnell. Warte einen Moment.', 429)
    this.db.run('INSERT INTO messages(room, user, client_id, text, sent) VALUES (?, ?, ?, ?, ?)', room, user, id, text, Date.now())
  }

  act(user: string, body: Record<string, unknown>, affected: Set<string>) {
    const type = body.type
    const room = this.current(user)
    if (type === 'lobby-create') {
      if (room) return
      const { game, capacity } = body
      need(typeof capacity === 'number' && Number.isInteger(capacity) &&
        (game === 'xeri' && (capacity === 2 || capacity === 4) || game === 'ab6super6' && capacity >= 2 && capacity <= 6),
      'Wähle ein Spiel und eine gültige Spielerzahl.')
      const id = crypto.randomUUID()
      this.db.run('INSERT INTO rooms(id, game, host, capacity) VALUES (?, ?, ?, ?)', id, game as string, user, capacity)
      this.db.run('INSERT INTO seats(room, seat, user, ready) VALUES (?, 0, ?, 1)', id, user)
      return
    }
    if (type === 'invite-accept' || type === 'invite-decline') {
      this.answerInvite(user, body.invitation, type === 'invite-accept', affected)
      return
    }
    if (type === 'lobby-leave') {
      this.leave(user, affected)
      return
    }
    need(room, 'Du bist in keiner Lobby.', 404)
    this.observers(room.id, affected)
    if (type === 'lobby-invite') return this.invite(user, room, body.player, affected)
    if (type === 'chat') return this.chat(room.id, user, body)
    if (type === 'xeri-play' || type === 'cambio-play') return this.move(room, user, body)
    if (type === 'lobby-ready') {
      need(room.phase === 'open' && typeof body.ready === 'boolean', 'Die Bereitschaft kann gerade nicht geändert werden.', 409)
      this.db.run('UPDATE seats SET ready=? WHERE user=?', Number(body.ready), user)
      return
    }
    need(room.host === user, 'Nur der Host darf diese Aktion ausführen.', 403)
    if (type === 'lobby-bot') return this.bot(room, body.seat, body.enabled)
    if (type === 'lobby-start') return this.start(room)
    if (type === 'lobby-rematch') {
      need(room.phase === 'finished', 'Die Partie läuft noch.', 409)
      return this.reset(room.id)
    }
    need(false, 'Unbekannte Lobbyaktion.')
  }
}
