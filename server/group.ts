import { DurableObject } from 'cloudflare:workers'
import type { Snapshot } from '../shared/online'
import { Auth } from './auth'
import { Database } from './database'
import { HttpError, json, need, readJson } from './http'
import { Live } from './live'
import { Lobbies } from './lobbies'
import { Social } from './social'

export interface Env {
  GROUP: DurableObjectNamespace<GameGroup>
  APP_URL: string
  INVITE_CODE?: string
  REQUIRE_INVITE: string
}

export class GameGroup extends DurableObject<Env> {
  private readonly db: Database
  private readonly live: Live
  private readonly auth: Auth
  private readonly social: Social
  private readonly lobbies: Lobbies

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.db = new Database(state.storage)
    this.live = new Live(state, this.db)
    this.social = new Social(this.db, this.live.online)
    this.lobbies = new Lobbies(this.db, this.social, this.live.online)
    this.auth = new Auth(this.db, new URL(env.APP_URL), env.INVITE_CODE, env.REQUIRE_INVITE === 'true', (user, session) => {
      this.live.disconnect(user, session)
      this.presence(user)
    })
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const path = url.pathname
      if (path.startsWith('/auth/')) {
        this.prune()
        return await this.auth.webpage(request, url)
      }
      need(request.headers.get('Origin') === this.auth.app.origin, 'Anfrage aus einer fremden Website abgelehnt.', 403)
      if (path === '/live') {
        const { response, user } = await this.live.connect(request)
        this.presence(user)
        return response
      }
      if (path === '/api/auth/exchange' && request.method === 'POST') {
        const body = await readJson(request)
        return json(await this.auth.exchange(body.code, body.verifier))
      }

      const body = request.method === 'POST' ? await readJson(request) : {}
      const actor = await this.auth.actor(request)
      this.advanceDeadlines()
      if (request.method === 'GET') {
        if (path === '/api/state') return json(this.snapshot(actor))
        if (path === '/api/users') return json(this.social.search(actor.id, url.searchParams.get('q') ?? ''))
      } else if (request.method === 'POST') {
        this.prune()
        if (path === '/api/auth/renew') return json(await this.auth.renew(actor))
        if (path === '/api/auth/logout') {
          this.auth.logout(actor.id, actor.session)
          return json({ ok: true })
        }
        if (path === '/api/auth/delete') {
          const affected = new Set(this.social.friendIds(actor.id))
          await this.auth.deleteAccount(actor, body.password, () => this.lobbies.leave(actor.id, affected))
          this.live.notify(affected)
          return json({ ok: true })
        }
        if (path === '/api/live-ticket') return json(await this.live.ticket(actor))
        if (path === '/api/action') {
          const affected = new Set([actor.id])
          this.db.atomic(() => {
            if (!this.social.act(actor.id, body, affected)) this.lobbies.act(actor.id, body, affected)
            this.revise()
          })
          if (body.type === 'cambio-play') await this.scheduleDeadline()
          this.live.notify(affected)
          return json(this.snapshot(actor))
        }
      }
      throw new HttpError(404, 'Adresse nicht gefunden.')
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error('Stichrunde request failed', error instanceof Error ? error.name : 'UnknownError')
      return json({ error: 'Der Spieldienst ist gerade nicht erreichbar.' }, 500)
    }
  }

  private snapshot(user: { id: string; name: string }): Snapshot {
    return {
      revision: this.ctx.storage.kv.get<number>('revision') ?? 0,
      user: { id: user.id, name: user.name },
      ...this.social.list(user.id),
      invitations: this.lobbies.invitations(user.id),
      lobby: this.lobbies.view(user.id),
    }
  }

  private prune() {
    const now = Date.now()
    const last = this.ctx.storage.kv.get<number>('cleanup') ?? 0
    if (now - last < 60 * 60_000) return
    this.db.atomic(() => {
      this.db.prune(now)
      this.ctx.storage.kv.put('cleanup', now)
    })
  }

  private revise() {
    this.ctx.storage.kv.put('revision', (this.ctx.storage.kv.get<number>('revision') ?? 0) + 1)
  }

  private advanceDeadlines() {
    const affected = new Set<string>()
    this.db.atomic(() => {
      if (this.lobbies.advanceDeadlines(Date.now(), affected)) this.revise()
    })
    this.live.notify(affected)
  }

  private async scheduleDeadline() {
    const deadline = this.lobbies.deadline()
    if (deadline !== null && deadline !== undefined) await this.ctx.storage.setAlarm(deadline)
  }

  async alarm() {
    this.advanceDeadlines()
    await this.scheduleDeadline()
  }

  private presence(user: string) {
    const affected = new Set(this.social.friendIds(user))
    const room = this.lobbies.current(user)
    if (room) this.lobbies.observers(room.id, affected)
    this.live.notify(affected, user)
  }

  webSocketMessage(socket: WebSocket) {
    socket.close(1008, 'Unbekannte Live-Nachricht')
  }

  webSocketClose(socket: WebSocket) {
    const user = this.live.owner(socket)
    if (user) this.presence(user)
  }

  webSocketError(socket: WebSocket) {
    if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'Verbindung unterbrochen')
    const user = this.live.owner(socket)
    if (user) this.presence(user)
  }
}
