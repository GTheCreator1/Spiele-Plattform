import { argon2id } from '@noble/hashes/argon2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { Database } from './database'
import { HttpError, digest, equalHex, need, randomToken, readBody, tokenPattern } from './http'
import { authPage, expiredAuthPage, recoveryPage } from './auth-page'
import type { AuthMode, Challenge } from './auth-page'

const day = 86_400_000
const accessMs = 45 * 60_000
const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/
const statePattern = /^[a-f0-9]{32}$/
const credentialsError = 'Benutzername oder Zugangsdaten sind ungültig.'

type SessionRow = { id: string; user: string; expires: number }
type UserRow = { id: string; name: string; password: string }
export type Actor = { id: string; name: string; session: string; expires: number }

export class Auth {
  private hashing = false

  constructor(
    private readonly db: Database,
    readonly app: URL,
    private readonly inviteCode: string | undefined,
    private readonly requireInvite: boolean,
    private readonly disconnect: (user: string, session?: string) => void,
  ) {}

  async webpage(request: Request, url: URL) {
    const mode = url.pathname.split('/')[2]
    const isResume = mode === 'resume'
    if (!(mode === 'register' || mode === 'login' || mode === 'recover' || isResume)) return expiredAuthPage(this.app.href)
    let fields = url.searchParams
    if (request.method === 'POST') {
      need(!isResume && request.headers.get('origin') === url.origin, 'Anfrage aus einem fremden Fenster abgelehnt.', 403)
      need(request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'), 'Formular erforderlich.', 415)
      fields = new URLSearchParams(await readBody(request))
    }
    const state = fields.get('state') ?? ''
    const challenge = fields.get('challenge') ?? ''
    if (!statePattern.test(state) || !tokenPattern.test(challenge)) return expiredAuthPage(this.app.href)
    const flow = { state, challenge }

    if (isResume) {
      const session = await this.cookieSession(request, url)
      if (!session) return this.redirect(flow, 'expired')
      return this.redirect(flow, await this.issueExchange(session, flow))
    }
    if (request.method === 'GET') return this.form(mode, flow)
    if (request.method !== 'POST') throw new HttpError(405, 'Methode nicht unterstützt.')

    try {
      return await this.submit(mode, fields, flow, request, url)
    } catch (error) {
      if (error instanceof HttpError) return this.form(mode, flow, { detail: error.message, status: error.status })
      throw error
    }
  }

  private form(mode: AuthMode, flow: Challenge, error?: { detail: string; status: number }) {
    return authPage(mode, flow, this.app.href, Boolean(this.inviteCode) || this.requireInvite, error)
  }

  private async submit(mode: AuthMode, fields: URLSearchParams, flow: Challenge, request: Request, url: URL) {
    const username = fields.get('username')?.trim() ?? ''
    const password = fields.get('password') ?? ''
    need(usernamePattern.test(username), 'Benutzernamen benötigen 3 bis 24 Buchstaben, Ziffern, Unterstriche oder Bindestriche.')
    need(password.length >= 12 && password.length <= 128, 'Das Passwort benötigt 12 bis 128 Zeichen.')
    if (mode !== 'login') need(fields.get('confirm') === password, 'Die Passwörter stimmen nicht überein.')

    const handle = username.toLowerCase()
    const scopes = await Promise.all([digest(request.headers.get('CF-Connecting-IP') ?? 'local'), digest(handle)])
    const ipAllowed = this.db.allow(`auth-ip:${scopes[0]}`, 30, 60_000)
    need(ipAllowed && this.db.allow(`auth-user:${scopes[1]}`, 8, 300_000), 'Zu viele Versuche. Warte einige Minuten.', 429)
    const user = this.db.first<UserRow>('SELECT id, name, password FROM users WHERE handle=?', handle)
    let id: string
    let credential: string
    let codes: string[] = []

    if (mode === 'register') {
      need(!this.requireInvite || this.inviteCode, 'Die Anmeldung für neue Mitglieder wird noch eingerichtet.', 503)
      if (this.inviteCode) {
        const invite = fields.get('invite') ?? ''
        const [provided, expected] = await Promise.all([digest(invite), digest(this.inviteCode)])
        need(equalHex(provided, expected), 'Der Einladungscode ist ungültig.', 403)
      }
      need(!user, 'Dieser Benutzername ist bereits vergeben.', 409)
      id = crypto.randomUUID()
      const hashed = await this.hashPassword(password)
      credential = hashed
      codes = Array.from({ length: 3 }, () => randomToken(16))
      const hashes = await Promise.all(codes.map(digest))
      this.db.atomic(() => {
        need(!this.db.first('SELECT id FROM users WHERE handle=?', handle), 'Dieser Benutzername ist bereits vergeben.', 409)
        this.db.run('INSERT INTO users VALUES (?, ?, ?, ?)', id, username, handle, hashed)
        for (const hash of hashes) this.db.run('INSERT INTO recovery VALUES (?, ?)', id, hash)
      })
    } else if (mode === 'recover') {
      const code = (fields.get('code') ?? '').toLowerCase().replace(/[-\s]/g, '')
      const key = await digest(code)
      need(user && statePattern.test(code) && this.db.first('SELECT hash FROM recovery WHERE user=? AND hash=?', user.id, key), credentialsError, 400)
      const hashed = await this.hashPassword(password)
      credential = hashed
      id = user.id
      this.db.atomic(() => {
        need(this.db.first('DELETE FROM recovery WHERE user=? AND hash=? RETURNING hash', id, key), credentialsError)
        this.db.run('UPDATE users SET password=? WHERE id=?', hashed, id)
        this.db.run('DELETE FROM sessions WHERE user=?', id)
      })
      this.disconnect(id)
    } else {
      const verified = await this.verifyPassword(password, user?.password)
      need(user && verified && this.db.first('SELECT id FROM users WHERE id=? AND password=?', user.id, user.password), credentialsError, 401)
      id = user.id
      credential = user.password
    }

    const previous = await this.cookieSession(request, url)
    if (previous) this.logout(previous.user, previous.id)
    const session = await this.createSession(id, credential)
    const cookie = this.cookieHeader(url, session.cookie, 30 * 86400)
    const exchange = await this.issueExchange(session, flow)
    return codes.length ? recoveryPage(codes, this.returnUrl(flow, exchange), cookie) : this.redirect(flow, exchange, cookie)
  }

  private async hashPassword(password: string, salt = randomToken(16)) {
    need(!this.hashing, 'Eine Anmeldung läuft gerade. Bitte versuche es erneut.', 429)
    this.hashing = true
    try {
      const value = argon2id(password, salt, { p: 1, t: 2, m: 19_456, dkLen: 32 })
      return `1.${salt}.${bytesToHex(value)}`
    } finally {
      this.hashing = false
    }
  }

  private async verifyPassword(password: string, stored: string | undefined) {
    const salt = stored?.split('.')[1] ?? '00000000000000000000000000000000'
    const candidate = await this.hashPassword(password, salt)
    return equalHex(candidate, stored ?? '0'.repeat(candidate.length))
  }

  private async createSession(user: string, credential: string) {
    const id = crypto.randomUUID()
    const cookie = randomToken()
    const expires = Date.now() + 30 * day
    const hash = await digest(cookie)
    const inserted = this.db.first(
      'INSERT INTO sessions SELECT ?, id, ?, ? FROM users WHERE id=? AND password=? RETURNING id', id, hash, expires, user, credential,
    )
    need(inserted, 'Die Zugangsdaten haben sich geändert. Melde dich erneut an.', 409)
    return { id, user, expires, cookie }
  }

  private cookieName(url: URL) {
    return url.protocol === 'https:' ? '__Host-stichrunde' : 'stichrunde-local'
  }

  private cookieHeader(url: URL, value: string, seconds: number) {
    const secure = url.protocol === 'https:' ? '; Secure' : ''
    return `${this.cookieName(url)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`
  }

  private async cookieSession(request: Request, url: URL) {
    const prefix = this.cookieName(url) + '='
    const value = request.headers.get('cookie')?.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)
    if (!value || !tokenPattern.test(value)) return undefined
    const hash = await digest(value)
    return this.db.first<SessionRow>('SELECT id, user, expires FROM sessions WHERE cookie=? AND expires>?', hash, Date.now())
  }

  private returnUrl(flow: Challenge, code: string) {
    const url = new URL(this.app)
    url.hash = `/anmeldung/weiter?${new URLSearchParams({ state: flow.state, code })}`
    return url.href
  }

  private redirect(flow: Challenge, code: string, cookie?: string) {
    const headers = new Headers({ Location: this.returnUrl(flow, code), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    if (cookie) headers.set('Set-Cookie', cookie)
    return new Response(null, { status: 303, headers })
  }

  private async issueExchange(session: SessionRow, flow: Challenge) {
    const code = randomToken()
    const hash = await digest(code)
    this.db.run('INSERT INTO exchanges VALUES (?, ?, ?, ?)', hash, session.id, flow.challenge, Date.now() + 10 * 60_000)
    return code
  }

  async exchange(code: unknown, verifier: unknown) {
    need(typeof code === 'string' && tokenPattern.test(code) && typeof verifier === 'string' && tokenPattern.test(verifier), 'Ungültiger Anmeldecode.')
    const access = randomToken()
    const [hash, challenge, accessHash] = await Promise.all([digest(code), digest(verifier), digest(access)])
    return this.db.atomic(() => {
      const now = Date.now()
      const row = this.db.first<SessionRow>(
        `SELECT s.id, s.user, s.expires FROM exchanges e JOIN sessions s ON s.id=e.session
         WHERE e.hash=? AND e.challenge=? AND e.expires>? AND s.expires>?`, hash, challenge, now, now,
      )
      need(row, 'Die Anmeldung ist abgelaufen. Öffne sie erneut.', 401)
      this.db.run('DELETE FROM exchanges WHERE hash=?', hash)
      const expires = Math.min(row.expires, now + accessMs)
      this.db.run('INSERT INTO access VALUES (?, ?, ?)', accessHash, row.id, expires)
      return { access, expires }
    })
  }

  async actor(request: Request) {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
    need(token, 'Melde dich an, um online zu spielen.', 401)
    const hash = await digest(token)
    const now = Date.now()
    const actor = this.db.first<Actor>(
      `SELECT u.id, u.name, s.id AS session, s.expires FROM access a JOIN sessions s ON s.id=a.session
       JOIN users u ON u.id=s.user WHERE a.hash=? AND a.expires>? AND s.expires>?`, hash, now, now,
    )
    need(actor, 'Deine Sitzung ist abgelaufen.', 401)
    return actor
  }

  async renew(actor: Actor) {
    const token = randomToken()
    const hash = await digest(token)
    const now = Date.now()
    const active = this.db.first<SessionRow>('SELECT id, user, expires FROM sessions WHERE id=? AND expires>?', actor.session, now)
    need(active, 'Deine Sitzung ist abgelaufen.', 401)
    const expires = Math.min(active.expires, now + accessMs)
    this.db.run('INSERT INTO access VALUES (?, ?, ?)', hash, active.id, expires)
    return { access: token, expires }
  }

  logout(user: string, session: string) {
    this.db.run('DELETE FROM sessions WHERE id=?', session)
    this.disconnect(user, session)
  }

  async deleteAccount(actor: Actor, password: unknown, before: () => void) {
    need(typeof password === 'string' && password.length >= 12 && password.length <= 128, 'Bestätige dein Passwort.')
    need(this.db.allow(`delete:${actor.id}`, 5, 300_000), 'Zu viele Versuche.', 429)
    const user = this.db.first<UserRow>('SELECT id, name, password FROM users WHERE id=?', actor.id)
    need(user && await this.verifyPassword(password, user.password), 'Das Passwort stimmt nicht.', 403)
    this.db.atomic(() => {
      need(this.db.first('SELECT u.id FROM users u JOIN sessions s ON s.user=u.id WHERE s.id=? AND u.password=?', actor.session, user.password),
        'Deine Sitzung ist abgelaufen.', 401)
      before()
      this.db.run('DELETE FROM users WHERE id=?', actor.id)
    })
    this.disconnect(actor.id)
  }
}
