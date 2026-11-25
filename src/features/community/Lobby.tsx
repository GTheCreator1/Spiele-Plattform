import { Copy, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AuditStatus, Message, OnlineAction } from '../../../shared/online'
import { invitePattern, onlineNames, validNickname } from '../../../shared/online'
import { CambioTable } from '../../games/ab6super6/CambioTable'
import { OnlineXeri } from '../../games/xeri/OnlineXeri'
import type { RoomStatus } from '../../platform/peer-client'
import { storedGuest } from '../../platform/peer-storage'
import { useOnline } from '../../platform/online'
import { RoomFields, RoomForm } from './RoomForm'
import { useCommand } from './useCommand'
import '../../styles/community.css'
import '../../games/theslibbi/theslibbi-lobby.css'

const checks: Record<Exclude<AuditStatus, 'idle'>, string> = {
  checking: 'Die Endwertung wird nachgerechnet …',
  verified: 'Kartenmischung und Spielverlauf nachgerechnet.',
  single: 'Spielverlauf nachgerechnet. Ein Mensch hat zum Zufall beigetragen.',
  failed: 'Die Nachprüfung hat eine Abweichung festgestellt.',
  unavailable: 'Die Nachprüfung war für diese Partie nicht verfügbar.',
}

export default function Lobby() {
  const { invite } = useParams()
  const { room, opening } = useOnline()
  if (invite && !invitePattern.test(invite)) return (
    <section className="page-heading">
      <h1>Einladungslink ungültig</h1>
      <p>Bitte lass dir den vollständigen Link zum Spielraum senden.</p>
      <Link className="button button-primary" to="/">Zurück zum Hauptmenü</Link>
    </section>
  )
  if (room && (!invite || room.invite === invite)) return <ActiveLobby room={room} />
  if (invite) return <JoinRoom key={invite} invite={invite} />
  return (
    <div className="page-view lobby-page">
      <header className="page-heading"><h1>Privater Spielraum</h1><p>Wähle ein Spiel und teile den Einladungslink mit deiner Runde.</p></header>
      {opening ? <p role="status">Spielraum wird vorbereitet …</p> : <section className="surface settings-panel"><RoomForm /></section>}
      <Link className="text-link" to="/">Zurück zum Hauptmenü</Link>
    </div>
  )
}

function JoinRoom({ invite }: { invite: string }) {
  const { start, room, opening } = useOnline()
  const command = useCommand()
  const [name, setName] = useState(() => storedGuest(invite)?.name ?? '')
  const tried = useRef(false)
  const [autoError, setAutoError] = useState('')
  useEffect(() => {
    const saved = storedGuest(invite)
    if (room || tried.current || !saved || !validNickname(saved.name)) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      tried.current = true
      void start({ kind: 'guest', name: saved.name, invite }).catch((error: unknown) => {
        if (active) setAutoError(error instanceof Error ? error.message : 'Wiederverbindung fehlgeschlagen.')
      })
    })
    return () => { active = false }
  }, [invite, room, start])
  return (
    <div className="page-view lobby-page">
      <header className="page-heading"><h1>Einladung zum Spielraum</h1><p>Gib den Namen ein, den deine Mitspieler sehen sollen.</p></header>
      <form className="surface settings-panel online-form" onSubmit={(event) => {
        event.preventDefault()
        command.run(() => start({ kind: 'guest', name: name.trim(), invite }))
      }}>
        <label>Spitzname<input required maxLength={24} autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} /></label>
        {(command.error || autoError) && <p role="alert" className="inline-error">{command.error || autoError}</p>}
        <button className="button button-primary" disabled={opening || command.pending}>Raum beitreten</button>
      </form>
      <p className="muted">Bei laufenden Partien verwaltet der Host-Browser auch die verdeckten Karten.</p>
      <Link className="text-link" to="/">Zurück zum Hauptmenü</Link>
    </div>
  )
}

function ActiveLobby({ room }: { room: RoomStatus }) {
  const { act, leave, reconnect } = useOnline()
  const command = useCommand()
  const navigate = useNavigate()
  const lobby = room.lobby
  const leaveRoom = () => { leave(); void navigate('/') }
  const lobbyLinks = (
    <div className="online-actions">
      <Link className="text-link" to="/">Zurück zum Hauptmenü</Link>
      <button className="button button-secondary" onClick={leaveRoom}>Raum verlassen</button>
    </div>
  )
  if (!lobby) return (
    <section className="page-heading">
      <h1>Privater Spielraum</h1>
      <p role="status">{room.status}</p>
      {room.retry && <button className="button button-primary" onClick={reconnect}>Erneut verbinden</button>}
      {lobbyLinks}
    </section>
  )
  const self = lobby.seats[lobby.self]
  const allPresent = lobby.seats.every((seat) => seat.online)
  const allReady = allPresent && lobby.seats.every((seat) => seat.ready)
  const theslibbi = lobby.game === 'theslibbi'
  const occupied = lobby.seats.filter((seat) => seat.bot || seat.player).length
  const busy = command.pending || !room.connected
  const turnBlocked = busy || !allPresent
  const canChange = room.host && occupied === 1 && lobby.phase === 'open'
  const submit = (action: OnlineAction) => command.run(() => act(action))
  return (
    <div className="page-view lobby-page">
      <header className="lobby-heading">
        <div><h1>{onlineNames[lobby.game]}</h1><p>Privater Raum · {occupied}/{lobby.capacity} Plätze</p></div>
        {lobbyLinks}
      </header>
      <div className="online-actions">
        <p className={room.connected && !room.retry ? 'room-connection-on' : 'muted'} role="status">{room.status}</p>
        {room.retry && <button className="button button-secondary" onClick={reconnect}>Erneut verbinden</button>}
      </div>
      {lobby.notice && <p className="muted">{lobby.notice}</p>}
      {lobby.phase === 'playing' && !allPresent && <p className="inline-error">Die Partie wartet auf alle Mitspieler.</p>}
      {command.error && <p className="inline-error" role="alert">{command.error}</p>}
      <div className="lobby-layout">
        <div className="lobby-main">
          {(lobby.phase === 'open' || lobby.phase === 'seeding') ? (
            <section className={theslibbi ? 'surface settings-panel theslibbi-lobby-table' : 'surface settings-panel'}>
              {theslibbi ? (
                <header className="theslibbi-table-intro">
                  <h2>Spielplätze</h2>
                  <p>Die Partie ist noch in Entwicklung.</p>
                </header>
              ) : <h2>Spielplätze</h2>}
              {lobby.seats.map((seat) => (
                <div className="member-row" key={seat.seat}>
                  <div>
                    <strong>{seat.player?.name ?? (seat.bot ? `Bot ${seat.seat + 1}` : 'Freier Platz')}</strong>
                    <p>{lobby.game === 'xeri' && lobby.capacity === 4 ? `Team ${seat.seat % 2 === 0 ? 'A' : 'B'} · ` : ''}
                      {seat.player && !seat.online ? 'Getrennt' : seat.ready ? 'Bereit' : seat.player ? 'Wartet' : 'Offen'}</p>
                  </div>
                  {room.host && lobby.phase === 'open' && seat.seat !== 0 && lobby.game === 'xeri' && lobby.capacity === 4 && !seat.player && (
                    <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-bot', seat: seat.seat, enabled: !seat.bot })}>{seat.bot ? 'Bot entfernen' : 'Bot hinzufügen'}</button>
                  )}
                  {room.host && lobby.phase === 'open' && seat.player && !seat.online && (
                    <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-release', seat: seat.seat })}>Platz freigeben</button>
                  )}
                </div>
              ))}
              {lobby.phase === 'seeding' ? (
                <div className="online-actions">
                  <p>Der gemeinsame Zufall wird vorbereitet …</p>
                  {room.host && <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-cancel' })}>Vorbereitung abbrechen</button>}
                </div>
              ) : (
                <div className="online-actions">
                  {self && <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-ready', ready: !self.ready })}>{self.ready ? 'Warten' : 'Bereit'}</button>}
                  {room.host && !theslibbi && <button className="button button-primary" disabled={busy || !allReady} onClick={() => submit({ type: 'lobby-start' })}>Partie starten</button>}
                  {theslibbi && allReady && room.connected && <p className="theslibbi-table-ready">Alle Plätze sind verbunden und bereit.</p>}
                </div>
              )}
            </section>
          ) : (
            <>
              {lobby.xeri && <OnlineXeri key={lobby.match} lobby={lobby} submit={submit} busy={turnBlocked} />}
              {lobby.cambio && <CambioTable key={lobby.match} lobby={lobby} submit={submit} busy={turnBlocked} />}
              {lobby.phase === 'finished' && room.audit !== 'idle' && <p className={room.audit === 'failed' ? 'inline-error' : 'muted'}>{checks[room.audit]}</p>}
              {room.host && lobby.phase === 'finished' && (
                <button className="button button-secondary" disabled={busy || room.audit === 'checking'} onClick={() => submit({ type: 'lobby-rematch' })}>Zurück zur Lobby</button>
              )}
            </>
          )}
        </div>
        <aside className="lobby-side">
          {room.host && (lobby.phase === 'open' || lobby.phase === 'seeding') && <Invitation invite={room.invite} />}
          {canChange && (
            <section className="surface settings-panel">
              <h2>Spiel wechseln</h2>
              <fieldset className="online-form room-fields" disabled={busy}>
                <RoomFields settings={lobby} onChange={(settings) => submit({ type: 'lobby-settings', settings })} />
              </fieldset>
            </section>
          )}
          <LobbyChat key={lobby.id} messages={room.messages} live={room.connected} title={theslibbi ? 'Lobbychat' : undefined} />
        </aside>
      </div>
    </div>
  )
}

function Invitation({ invite }: { invite: string }) {
  const address = new URL(import.meta.env.BASE_URL, window.location.origin)
  address.hash = `/lobby/${invite}`
  const url = address.href
  const input = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState('')
  return (
    <section className="surface settings-panel">
      <h2>Runde einladen</h2>
      <p className="muted">Teile den Link privat, zum Beispiel über WhatsApp. Lass diesen Tab beim Spielen geöffnet.</p>
      <div className="online-form">
        <label>Einladungslink<input ref={input} value={url} readOnly /></label>
        <div className="online-actions">
          <button className="button button-primary" type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setHint('Link kopiert.')
            } catch {
              input.current?.select()
              setHint('Der Link ist markiert. Kopiere ihn über das Menü deines Geräts.')
            }
          }}><Copy size={17} aria-hidden="true" /> Link kopieren</button>
          {typeof navigator.share === 'function' && <button className="button button-secondary" type="button" onClick={async () => {
            try { await navigator.share({ title: 'Einladung zu Stichrunde', url }) }
            catch (error) {
              if (!(error instanceof Error && error.name === 'AbortError')) setHint('Kopiere den Link und teile ihn in deinem Messenger.')
            }
          }}><Share2 size={17} aria-hidden="true" /> Teilen</button>}
        </div>
        {hint && <p className="muted" role="status">{hint}</p>}
      </div>
    </section>
  )
}

function LobbyChat({ messages, live, title = 'Ingame-Chat' }: { messages: Message[]; live: boolean; title?: string }) {
  const { act } = useOnline()
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(messages.at(-1)?.id ?? 0)
  const list = useRef<HTMLUListElement>(null)
  const pending = useRef<{ id: string; message: string } | null>(null)
  const unread = messages.filter((item) => item.id > seen).length
  const lastId = messages.at(-1)?.id ?? 0
  useEffect(() => {
    if (!open) return
    setSeen(lastId)
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [lastId, open])
  return (
    <section className="surface settings-panel lobby-chat">
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="button button-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Minimieren' : unread ? `Öffnen (${unread})` : 'Öffnen'}</button>
      </div>
      {open && <>
        <ul aria-label="Chatnachrichten" ref={list}>
          {messages.map(({ id, from, text, sentAt }) => (
            <li key={id}><small><strong>{from.name}</strong> · {new Date(sentAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</small><p>{text}</p></li>
          ))}
        </ul>
        {command.error && <p className="inline-error" role="alert">{command.error}</p>}
        {!live && <p className="muted">Verbindung unterbrochen.</p>}
        <form className="online-form" onSubmit={(event) => {
          event.preventDefault()
          const text = message.trim()
          if (!text) return
          if (pending.current?.message !== text) pending.current = { id: crypto.randomUUID(), message: text }
          const id = pending.current.id
          command.run(async () => {
            await act({ type: 'chat', id, text })
            pending.current = null
            setMessage((draft) => draft.trim() === text ? '' : draft)
          })
        }}>
          <label>Nachricht<input maxLength={500} required value={message} onChange={(event) => setMessage(event.target.value)} /></label>
          <button className="button button-primary" disabled={!live || command.pending}>Senden</button>
        </form>
      </>}
    </section>
  )
}
