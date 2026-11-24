import { json } from './http'
import type { Env } from './group'
export { GameGroup } from './group'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const app = new URL(env.APP_URL)
    if (app.protocol === 'https:' && url.protocol !== 'https:') {
      url.protocol = 'https:'
      return Response.redirect(url.href, 308)
    }
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true })
    const api = url.pathname.startsWith('/api/')
    if (!api && url.pathname !== '/live' && !url.pathname.startsWith('/auth/')) return json({ error: 'Adresse nicht gefunden.' }, 404)

    const frontend = request.headers.get('Origin') === app.origin
    if (api && !frontend) return json({ error: 'Anfrage aus einer fremden Website abgelehnt.' }, 403)
    const cors = {
      'Access-Control-Allow-Origin': app.origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    }
    if (api && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const namespace = app.protocol === 'https:' ? env.GROUP.jurisdiction('eu') : env.GROUP
    try {
      const group = namespace.getByName('stichrunde')
      const response = await group.fetch(request)
      if (!api) return response
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(cors)) headers.set(name, value)
      return new Response(response.body, { status: response.status, headers })
    } catch {
      const response = json({ error: 'Der Spieldienst ist vorübergehend nicht erreichbar.' }, 503)
      if (api) response.headers.set('Access-Control-Allow-Origin', app.origin)
      return response
    }
  },
} satisfies ExportedHandler<Env>
