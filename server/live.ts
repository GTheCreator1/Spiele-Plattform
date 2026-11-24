import { heartbeatMs, liveProtocol } from '../shared/online'
import type { Actor } from './auth'
import type { Database } from './database'
import { digest, need, randomToken, tokenPattern } from './http'

type SocketState = { user: string; session: string; expires: number; connected: number }

export class Live {
  constructor(private readonly state: DurableObjectState, private readonly db: Database) {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  online = (user: string) => this.state.getWebSockets(user).some((socket) => {
    const data = socket.deserializeAttachment() as SocketState
    const now = Date.now()
    const last = this.state.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? data.connected
    return socket.readyState === WebSocket.OPEN && now < data.expires && now - last < heartbeatMs * 2.6
  })

  async ticket(actor: Actor) {
    need(this.db.allow(`tickets:${actor.id}`, 15, 60_000), 'Zu viele Verbindungsversuche. Warte einen Moment.', 429)
    const ticket = randomToken()
    const hash = await digest(ticket)
    const inserted = this.db.first(
      'INSERT INTO tickets SELECT ?, id, ? FROM sessions WHERE id=? AND expires>? RETURNING hash',
      hash, Date.now() + 30_000, actor.session, Date.now(),
    )
    need(inserted, 'Die Sitzung ist abgelaufen.', 401)
    return { ticket }
  }

  async connect(request: Request) {
    need(request.headers.get('Upgrade')?.toLowerCase() === 'websocket', 'WebSocket-Verbindung erforderlich.', 426)
    const supplied = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map((part) => part.trim())
    const token = supplied?.[1]
    need(supplied?.[0] === liveProtocol && token && tokenPattern.test(token), 'Verbindungsticket fehlt.', 401)
    const hash = await digest(token)
    const data = this.db.atomic(() => {
      const now = Date.now()
      const row = this.db.first<SocketState>(
        `SELECT s.user, s.id AS session, s.expires, ? AS connected FROM tickets t JOIN sessions s ON s.id=t.session
         WHERE t.hash=? AND t.expires>? AND s.expires>?`, now, hash, now, now,
      )
      need(row, 'Dieses Verbindungsticket ist abgelaufen.', 401)
      this.db.run('DELETE FROM tickets WHERE hash=?', hash)
      return row
    })
    need(this.state.getWebSockets(data.session).length < 6, 'Zu viele geöffnete Tabs für diese Sitzung.', 429)
    const pair = new WebSocketPair()
    this.state.acceptWebSocket(pair[1], [data.user, data.session])
    pair[1].serializeAttachment(data)
    return { response: new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': liveProtocol } }), user: data.user }
  }

  notify(users: Iterable<string>, except?: string) {
    for (const user of users) {
      if (user === except) continue
      for (const socket of this.state.getWebSockets(user)) {
        const data = socket.deserializeAttachment() as SocketState
        if (socket.readyState !== WebSocket.OPEN) continue
        try {
          if (Date.now() >= data.expires) socket.close(1008, 'Sitzung abgelaufen')
          else socket.send('changed')
        } catch {
          // Closing and WebSocket error events perform the presence update.
        }
      }
    }
  }

  disconnect(user: string, session?: string) {
    for (const socket of this.state.getWebSockets(session ?? user)) {
      if (socket.readyState === WebSocket.OPEN) socket.close(1008, 'Sitzung beendet')
    }
  }

  owner(socket: WebSocket) {
    return (socket.deserializeAttachment() as SocketState | null)?.user
  }
}
