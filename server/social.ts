import type { Friend, FriendRequest, Player } from '../shared/online'
import type { Database } from './database'
import { idPattern, need } from './http'

type Relationship = Player & { sender: string; accepted: number }

export class Social {
  constructor(private readonly db: Database, private readonly isOnline: (id: string) => boolean) {}

  list(user: string) {
    const rows = this.db.query<Relationship>(`
      SELECT u.id, u.name, r.sender, r.accepted
      FROM relationships r JOIN users u ON u.id=CASE WHEN r.low=? THEN r.high ELSE r.low END
      WHERE r.low=? OR r.high=? ORDER BY u.handle
    `, user, user, user)
    const friends: Friend[] = []
    const requests: FriendRequest[] = []
    for (const { id, name, accepted, sender } of rows) {
      if (accepted) friends.push({ id, name, online: this.isOnline(id) })
      else requests.push({ id, name, incoming: sender !== user })
    }
    return { friends, requests }
  }

  friendIds(user: string) {
    return this.db.query<{ id: string }>(
      'SELECT CASE WHEN low=? THEN high ELSE low END AS id FROM relationships WHERE (low=? OR high=?) AND accepted=1',
      user, user, user,
    ).map(({ id }) => id)
  }

  search(user: string, term: string): Player[] {
    need(/^[a-zA-Z0-9_-]{3,24}$/.test(term), 'Gib mindestens drei Zeichen eines Benutzernamens ein.')
    need(this.db.allow(`search:${user}`, 20, 60_000), 'Zu viele Suchen. Versuche es gleich erneut.', 429)
    return this.db.query<Player>(
      'SELECT id, name FROM users WHERE substr(handle, 1, ?) = ? AND id != ? ORDER BY handle LIMIT 12',
      term.length, term.toLowerCase(), user,
    )
  }

  friends(user: string, target: string) {
    const [low, high] = [user, target].sort() as [string, string]
    return Boolean(this.db.first('SELECT low FROM relationships WHERE low=? AND high=? AND accepted=1', low, high))
  }

  act(user: string, body: Record<string, unknown>, affected: Set<string>) {
    const { type, player } = body
    if (type !== 'friend-request' && type !== 'friend-accept' && type !== 'friend-decline' && type !== 'friend-remove') return false
    need(typeof player === 'string' && idPattern.test(player) && player !== user, 'Wähle einen gültigen Benutzer.')
    const [low, high] = [user, player].sort() as [string, string]
    const existing = this.db.first<{ sender: string; accepted: number }>(
      'SELECT sender, accepted FROM relationships WHERE low=? AND high=?', low, high,
    )

    if (type === 'friend-request') {
      need(this.db.first('SELECT id FROM users WHERE id=?', player), 'Dieser Benutzer ist nicht verfügbar.', 404)
      need(!existing || existing.sender === user || existing.accepted, 'Du hast bereits eine Anfrage von dieser Person.', 409)
      if (!existing) {
        need(this.db.allow(`friends:${user}`, 12, 60_000), 'Zu viele Freundschaftsanfragen.', 429)
        this.db.run('INSERT INTO relationships(low, high, sender) VALUES (?, ?, ?)', low, high, user)
      }
    } else if (type === 'friend-accept') {
      need(existing && existing.sender === player, 'Diese Anfrage ist nicht mehr offen.', 409)
      this.db.run('UPDATE relationships SET accepted=1 WHERE low=? AND high=?', low, high)
    } else if (type === 'friend-decline') {
      need(existing && !existing.accepted, 'Diese Anfrage ist nicht mehr offen.', 409)
      this.db.run('DELETE FROM relationships WHERE low=? AND high=?', low, high)
    } else {
      this.db.run('DELETE FROM relationships WHERE low=? AND high=?', low, high)
    }

    affected.add(player)
    return true
  }
}
