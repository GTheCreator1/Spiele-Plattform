import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { heartbeatMs, liveProtocol } from '../../shared/online'
import type { OnlineAction, Player, Snapshot } from '../../shared/online'
import { useNetworkConnection } from './connection'

const configuredUrl = import.meta.env.VITE_API_URL?.trim()
const apiOrigin = configuredUrl ? new URL(configuredUrl).origin : ''
const callbackPath = '/anmeldung/weiter'
const flowKey = 'stichrunde:login'
const sessionKey = 'stichrunde:has-session'
type Access = { access: string; expires: number }
type Flow = { state: string; verifier: string; returnTo: string }
type AuthMode = 'login' | 'register' | 'recover' | 'resume'

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

async function request<T>(path: string, access?: Access | null, body?: unknown): Promise<T> {
  const headers = new Headers()
  if (access) headers.set('Authorization', `Bearer ${access.access}`)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(new URL(path, apiOrigin), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  }).catch(() => { throw new ApiError(0, 'Der Spieldienst ist gerade nicht erreichbar.') })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data?.error ?? 'Der Spieldienst ist gerade nicht erreichbar.')
  return data as T
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function rememberSession(value: boolean) {
  try {
    if (value) localStorage.setItem(sessionKey, 'yes')
    else localStorage.removeItem(sessionKey)
  } catch { /* Browser storage can be disabled. */ }
}

type OnlineContextValue = {
  configured: boolean
  live: boolean
  loading: boolean
  error: string
  snapshot: Snapshot | null
  begin: (mode: Exclude<AuthMode, 'resume'>) => void
  act: (action: OnlineAction) => Promise<Snapshot>
  search: (query: string) => Promise<Player[]>
  signOut: (password?: string) => Promise<void>
}

const OnlineContext = createContext<OnlineContextValue | null>(null)

export function OnlineProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const connected = useNetworkConnection()
  const [access, setAccess] = useState<Access | null>(null)
  const current = useRef<Access | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const checked = useRef(false)

  function install(token: Access | null) {
    current.current = token
    setAccess(token)
    rememberSession(Boolean(token))
    if (!token) setSnapshot(null)
  }

  async function startAuth(mode: AuthMode, returnTo: string) {
    setError('')
    setLoading(true)
    try {
      const state = hex(crypto.getRandomValues(new Uint8Array(16)))
      const verifier = hex(crypto.getRandomValues(new Uint8Array(32)))
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
      sessionStorage.setItem(flowKey, JSON.stringify({ state, verifier, returnTo } satisfies Flow))
      const url = new URL(`/auth/${mode}`, apiOrigin)
      url.search = new URLSearchParams({ state, challenge: hex(new Uint8Array(digest)) }).toString()
      window.location.assign(url)
    } catch {
      setError('Die Anmeldung braucht einen sicheren Browser mit aktiviertem Sitzungsspeicher.')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!apiOrigin || !connected || checked.current) return
    checked.current = true
    if (location.pathname === callbackPath) {
      setLoading(true)
      void (async () => {
        let returnTo = '/profil'
        try {
          const flow: Flow | null = JSON.parse(sessionStorage.getItem(flowKey) ?? 'null')
          sessionStorage.removeItem(flowKey)
          const params = new URLSearchParams(location.search)
          if (!flow || flow.state !== params.get('state')) throw new Error('Öffne die Anmeldung erneut.')
          if (flow.returnTo.startsWith('/') && !flow.returnTo.startsWith('//') && flow.returnTo !== callbackPath) returnTo = flow.returnTo
          if (params.get('code') === 'expired') install(null)
          else install(await request<Access>('/api/auth/exchange', null, { code: params.get('code'), verifier: flow.verifier }))
        } catch (failure) {
          install(null)
          setError(failure instanceof Error ? failure.message : 'Die Anmeldung ist fehlgeschlagen.')
        } finally {
          setLoading(false)
          void navigate(returnTo, { replace: true })
        }
      })()
    } else {
      try {
        if (connected && localStorage.getItem(sessionKey) === 'yes') void startAuth('resume', location.pathname + location.search)
      } catch { /* Guest play stays available. */ }
    }
  }, [connected, location, navigate])

  useEffect(() => {
    setLive(false)
    if (!access || !connected) return
    let disposed = false
    let socket: WebSocket | undefined
    let retry: number | undefined
    let attempt = 0
    let busy = false
    let refreshAgain = false

    async function sync() {
      if (disposed) return
      if (busy) {
        refreshAgain = true
        return
      }
      busy = true
      try {
        const data = await request<Snapshot>('/api/state', access)
        if (!disposed && current.current === access) {
          setSnapshot((previous) => !previous || data.revision >= previous.revision ? data : previous)
          setError('')
        }
      } catch (failure) {
        if (!disposed && current.current === access) {
          if (failure instanceof ApiError && failure.status === 401) install(null)
          else setError(failure instanceof Error ? failure.message : 'Die Verbindung ist unterbrochen.')
        }
      } finally {
        busy = false
        if (refreshAgain) {
          refreshAgain = false
          void sync()
        }
      }
    }

    function reconnect() {
      if (disposed || retry !== undefined) return
      setLive(false)
      retry = window.setTimeout(() => {
        retry = undefined
        void open()
      }, Math.min(30_000, 700 * (2 ** attempt++)) + Math.random() * 300)
    }

    async function open() {
      try {
        const { ticket } = await request<{ ticket: string }>('/api/live-ticket', access, {})
        if (disposed) return
        const url = new URL('/live', apiOrigin)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        socket = new WebSocket(url, [liveProtocol, ticket])
        socket.onopen = () => {
          if (disposed) return
          attempt = 0
          setLive(true)
          socket?.send('ping')
          void sync()
        }
        socket.onmessage = (event) => { if (event.data === 'changed') void sync() }
        socket.onclose = reconnect
      } catch (failure) {
        if (!disposed && current.current === access && failure instanceof ApiError && failure.status === 401) install(null)
        else reconnect()
      }
    }

    function heartbeat() {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
      void sync()
    }

    void sync()
    void open()
    const interval = window.setInterval(heartbeat, heartbeatMs)
    const renew = window.setTimeout(() => {
      void request<Access>('/api/auth/renew', access, {}).then((token) => {
        if (!disposed && current.current === access && token.expires > access.expires) install(token)
      }).catch(() => void sync())
    }, Math.max(1000, access.expires - Date.now() - 60_000))
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.clearTimeout(retry)
      window.clearTimeout(renew)
      document.removeEventListener('visibilitychange', heartbeat)
      socket?.close()
    }
  }, [access, connected])

  async function act(action: OnlineAction) {
    const token = current.current
    const data = await request<Snapshot>('/api/action', token, action)
    if (token === current.current) {
      setSnapshot((previous) => !previous || data.revision >= previous.revision ? data : previous)
    }
    return data
  }

  async function signOut(password?: string) {
    const token = current.current
    await request(password === undefined ? '/api/auth/logout' : '/api/auth/delete', token, password === undefined ? {} : { password })
    install(null)
  }

  return (
    <OnlineContext.Provider value={{
      configured: Boolean(apiOrigin), live, loading, error, snapshot, act, signOut,
      begin: (mode) => void startAuth(mode, '/profil'),
      search: (query) => request<Player[]>(`/api/users?${new URLSearchParams({ q: query })}`, current.current),
    }}>
      {children}
    </OnlineContext.Provider>
  )
}

export function useOnline() {
  const context = useContext(OnlineContext)
  if (!context) throw new Error('Online-Dienst nicht initialisiert.')
  return context
}
