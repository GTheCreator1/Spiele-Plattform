import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, ChevronRight, Gamepad2, House, MessageSquare, Spade, UserRound, UsersRound, WifiOff, X } from 'lucide-react'
import { findGame } from '../features/catalog/games'
import { useNetworkConnection } from '../platform/connection'
import { usePreferences } from '../platform/preferences'
import { useOnline } from '../platform/online'
import { InvitationList } from '../features/community/InvitationList'
import '../styles/shell.css'

const navigation = [
  { to: '/', label: 'Übersicht', mobile: 'Start', icon: House },
  { to: '/spiele', label: 'Spiele', mobile: 'Spiele', icon: Gamepad2 },
  { to: '/freunde', label: 'Freunde', mobile: 'Freunde', icon: UsersRound },
  { to: '/nachrichten', label: 'Nachrichten', mobile: 'Nachrichten', icon: MessageSquare },
  { to: '/profil', label: 'Profil', mobile: 'Profil', icon: UserRound },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const view = navigation.find(({ to }) => to === '/' ? pathname === to : pathname.startsWith(to))
  const game = findGame(pathname.split('/')[2])
  const { motion } = usePreferences()
  const connected = useNetworkConnection()
  const online = useOnline()
  const user = online.snapshot?.user
  const count = online.snapshot?.invitations.length ?? 0
  const main = useRef<HTMLElement>(null)
  const invitations = useRef<HTMLDialogElement>(null)
  const previousPath = useRef(pathname)

  useEffect(() => {
    document.title = `${game?.name ?? view?.label ?? 'Stichrunde'} · Stichrunde`
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    window.scrollTo({ top: 0, behavior: 'instant' })
    main.current?.focus({ preventScroll: true })
  }, [game, pathname, view])

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
        <div className="sidebar-footer">
          <div className="local-status">
            <span className="local-status-icon"><Gamepad2 size={17} aria-hidden="true" /></span>
            <div><strong>{online.live ? 'Online' : 'Lokaler Modus'}</strong><small>{online.configured ? 'Xeri lokal spielbar' : 'Online in Entwicklung'}</small></div>
          </div>
          <Link className="sidebar-user" to="/profil" title="Profil und Einstellungen">
            <span className="avatar"><UserRound size={17} aria-hidden="true" /></span>
            <span><strong>{user?.name ?? 'Gast'}</strong><small>{user ? 'Profil' : 'Dieses Gerät'}</small></span>
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-path">
              <Link className="mobile-brand" to="/" aria-label="Stichrunde – Übersicht">
                <span className="brand-mark"><Spade size={18} fill="currentColor" aria-hidden="true" /></span>
                <span>Stichrunde</span>
              </Link>
              <span className="desktop-path">{view?.label ?? 'Stichrunde'}</span>
              {game && <><ChevronRight size={14} aria-hidden="true" /><span>{game.name}</span></>}
            </div>
            <button className="topbar-invitations" type="button" aria-haspopup="dialog" onClick={() => invitations.current?.showModal()}>
              <Bell size={17} aria-hidden="true" /><span>Einladungen</span>{count > 0 && <span className="invitation-count">{count}</span>}
            </button>
          </div>
        </header>
        {!connected && (
          <p className="connection-banner" role="status">
            <WifiOff size={17} aria-hidden="true" /> Offline. Bereits gespeicherte Inhalte bleiben verfügbar.
          </p>
        )}
        {connected && user && !online.live && <p className="connection-banner" role="status">Live-Verbindung wird wiederhergestellt …</p>}
        {user && online.snapshot?.lobby && pathname !== '/lobby' && (
          <Link className="lobby-return" to="/lobby">Zur aktiven Lobby</Link>
        )}
        <main ref={main} id="hauptinhalt" tabIndex={-1} className="main-content">
          {children}
        </main>
      </div>
      <nav className="mobile-navigation" aria-label="Hauptnavigation">
        {navigation.map(({ to, label, mobile, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="mobile-nav-link" aria-label={label}>
            <Icon size={21} aria-hidden="true" /><span>{mobile}</span>
          </NavLink>
        ))}
      </nav>
      <dialog ref={invitations} className="invitation-dialog" aria-labelledby="invitation-heading" onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}>
        <div className="invitation-dialog-content">
          <div className="dialog-heading">
            <h2 id="invitation-heading">Einladungen</h2>
            <form method="dialog"><button className="icon-button" aria-label="Einladungen schließen"><X size={20} /></button></form>
          </div>
          {online.configured ? <InvitationList onAccept={() => invitations.current?.close()} /> : (
            <div className="dialog-empty">
              <span className="feature-icon"><Bell size={23} aria-hidden="true" /></span>
              <h3>In Entwicklung</h3>
              <p>Hier erscheinen später Einladungen zu privaten Partien.</p>
            </div>
          )}
        </div>
      </dialog>
    </div>
  )
}
