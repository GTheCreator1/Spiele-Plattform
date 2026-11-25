import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, Gamepad2, House, Settings, Spade, UsersRound, WifiOff } from 'lucide-react'
import { findGame } from '../features/catalog/games'
import { useNetworkConnection } from '../platform/connection'
import { usePreferences } from '../platform/preferences'
import { useOnline } from '../platform/online'
import '../styles/shell.css'

const navigation = [
  { to: '/', label: 'Übersicht', icon: House },
  { to: '/spiele', label: 'Spiele', icon: Gamepad2 },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const view = navigation.find(({ to }) => to === '/' ? pathname === to : pathname.startsWith(to))
  const game = findGame(pathname.split('/')[2])
  const { motion } = usePreferences()
  const connected = useNetworkConnection()
  const { room } = useOnline()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const title = game?.name ?? view?.label ?? (pathname.startsWith('/lobby') ? 'Spielraum' : 'Spiele-Plattform')

  useEffect(() => {
    document.title = `${title} · Stichrunde`
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    window.scrollTo({ top: 0, behavior: 'instant' })
    main.current?.focus({ preventScroll: true })
  }, [pathname, title])

  return (
    <div className="app-shell" data-motion={motion ? 'on' : 'off'}>
      <a className="skip-link" href="#hauptinhalt" onClick={(event) => {
        event.preventDefault()
        main.current?.focus()
      }}>Zum Inhalt</a>
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="Stichrunde – Übersicht">
          <span className="brand-mark"><Spade aria-hidden="true" fill="currentColor" size={23} /></span>
          <span className="brand-name">Stichrunde</span>
        </Link>
        <nav className="navigation" aria-label="Hauptnavigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-link" title={label} aria-label={label}>
              <Icon size={19} aria-hidden="true" /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-path">
              <Link className="mobile-brand" to="/" aria-label="Stichrunde – Übersicht">
                <span className="brand-mark"><Spade size={18} fill="currentColor" aria-hidden="true" /></span><span>Stichrunde</span>
              </Link>
              <span className="desktop-path">{view?.label ?? title}</span>
              {game && <><ChevronRight size={14} aria-hidden="true" /><span>{game.name}</span></>}
            </div>
            <Link className="topbar-room" to="/lobby">
              <UsersRound size={17} aria-hidden="true" /><span>{room ? 'Mein Spielraum' : 'Spielraum'}</span>
            </Link>
          </div>
        </header>
        {!connected && (
          <p className="connection-banner" role="status"><WifiOff size={17} aria-hidden="true" /> Offline. Bereits gespeicherte Inhalte bleiben verfügbar.</p>
        )}
        <main ref={main} id="hauptinhalt" tabIndex={-1} className="main-content">{children}</main>
      </div>
      <nav className="mobile-navigation" aria-label="Hauptnavigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="mobile-nav-link" aria-label={label}>
            <Icon size={21} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
