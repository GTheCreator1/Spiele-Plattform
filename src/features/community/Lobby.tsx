import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lobby as LobbyState, OnlineAction } from '../../../shared/online'
import { onlineNames } from '../../../shared/online'
import { CambioTable } from '../../games/ab6super6/CambioTable'
import { OnlineXeri } from '../../games/xeri/OnlineXeri'
import { useOnline } from '../../platform/online'
import { useCommand } from './useCommand'
import '../../styles/community.css'

export default function Lobby() {
  const online = useOnline()
  const command = useCommand()
  const data = online.snapshot
  const lobby = data?.lobby
  if (!lobby) return (
    <section className="page-heading">
      <h1>Private Lobby</h1>
      <p>{online.loading ? 'Sitzung wird geprüft …' : 'Wähle ein Spiel oder nimm eine Einladung an.'}</p>
      <Link className="button button-primary" to="/spiele">Zur Spielebibliothek</Link>
    </section>
  )
  const host = lobby.host === data.user.id
  const self = lobby.seats.find((seat) => seat.player?.id === data.user.id)
  const canStart = lobby.seats.every((seat) => seat.ready && seat.online)
  const occupied = lobby.seats.filter((seat) => seat.bot || seat.player).length
  const busy = command.pending || !online.live
  function submit(action: OnlineAction) { command.run(() => online.act(action)) }
  return (
    <div className="page-view lobby-page">
      <header className="lobby-heading">
        <div><h1>{onlineNames[lobby.game]}</h1><p>Private Lobby · {occupied}/{lobby.capacity} Plätze</p></div>
        <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-leave' })}>Lobby verlassen</button>
      </header>
      {command.error && <p className="inline-error" role="alert">{command.error}</p>}
      <div className="lobby-layout">
        <div className="lobby-main">
          {lobby.phase === 'open' ? (
            <section className="surface settings-panel">
              <h2>Spielplätze</h2>
              {lobby.seats.map((seat) => (
                <div className="member-row" key={seat.seat}>
                  <div>
                    <strong>{seat.player?.name ?? (seat.bot ? `Bot ${seat.seat + 1}` : 'Freier Platz')}</strong>
                    <p>{lobby.game === 'xeri' && lobby.capacity === 4 ? `Team ${seat.seat % 2 === 0 ? 'A' : 'B'} · ` : ''}
                      {seat.player && !seat.online ? 'Offline' : seat.ready ? 'Bereit' : seat.player ? 'Wartet' : 'Offen'}</p>
                  </div>
                  {host && lobby.game === 'xeri' && lobby.capacity === 4 && !seat.player && (
                    <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-bot', seat: seat.seat, enabled: !seat.bot })}>{seat.bot ? 'Bot entfernen' : 'Bot hinzufügen'}</button>
                  )}
                </div>
              ))}
              <div className="online-actions">
                {self && <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-ready', ready: !self.ready })}>{self.ready ? 'Warten' : 'Bereit'}</button>}
                {host && <button className="button button-primary" disabled={busy || !canStart} onClick={() => submit({ type: 'lobby-start' })}>Partie starten</button>}
              </div>
            </section>
          ) : (
            <>
              {lobby.xeri && <OnlineXeri key={lobby.match} lobby={lobby} submit={submit} busy={busy} />}
              {lobby.cambio && <CambioTable key={lobby.match} lobby={lobby} submit={submit} busy={busy} />}
              {host && lobby.phase === 'finished' && (
                <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-rematch' })}>Zurück zur Lobby</button>
              )}
            </>
          )}
        </div>
        <aside className="lobby-side">
          {lobby.phase === 'open' && occupied < lobby.capacity && (
            <section className="surface settings-panel">
              <h2>Freunde einladen</h2>
              {data.friends.filter((friend) => !lobby.seats.some((seat) => seat.player?.id === friend.id)).map((friend) => (
                <div className="member-row" key={friend.id}>
                  <span><strong>{friend.name}</strong><p>{friend.online ? 'Online' : 'Offline'}</p></span>
                  <button className="button button-secondary" disabled={busy} onClick={() => submit({ type: 'lobby-invite', player: friend.id })}>Einladen</button>
                </div>
              ))}
              {data.friends.length === 0 && <Link className="text-link" to="/freunde">Freunde hinzufügen</Link>}
            </section>
          )}
          <LobbyChat key={lobby.id} lobby={lobby} live={online.live} />
        </aside>
      </div>
    </div>
  )
}

function LobbyChat({ lobby, live }: { lobby: LobbyState; live: boolean }) {
  const online = useOnline()
  const command = useCommand()
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(lobby.chat.at(-1)?.id ?? 0)
  const list = useRef<HTMLUListElement>(null)
  const pending = useRef<{ id: string; message: string } | null>(null)
  const unread = lobby.chat.filter((item) => item.id > seen).length
  const lastId = lobby.chat.at(-1)?.id ?? 0

  useEffect(() => {
    if (!open) return
    setSeen(lastId)
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [lastId, open])

  return (
    <section className="surface settings-panel lobby-chat">
      <div className="dialog-heading">
        <h2>Ingame-Chat</h2>
        <button className="button button-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Minimieren' : unread ? `Öffnen (${unread})` : 'Öffnen'}
        </button>
      </div>
      {open && (
        <>
          <ul aria-label="Chatnachrichten" ref={list}>
            {lobby.chat.map(({ id, from, text, sentAt }) => (
              <li key={id}><small><strong>{from?.name ?? 'Gelöschtes Konto'}</strong> · {new Date(sentAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</small><p>{text}</p></li>
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
              await online.act({ type: 'chat', id, text })
              pending.current = null
              setMessage((draft) => draft.trim() === text ? '' : draft)
            })
          }}>
            <label>Nachricht<input minLength={1} maxLength={500} required value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            <button className="button button-primary" disabled={!live || command.pending}>Senden</button>
          </form>
        </>
      )}
    </section>
  )
}
