import { UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Player } from '../../../shared/online'
import { useOnline } from '../../platform/online'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'
import { useCommand } from './useCommand'

const sections = [
  { label: 'Freundesliste', icon: UsersRound, title: 'Deine Freundesliste', description: 'Nach Freischaltung der Konten kannst du Freunde suchen, ihren Online-Status sehen und sie zu einer Partie einladen.' },
  { label: 'Anfragen', icon: UserPlus, title: 'Freundschaftsanfragen', description: 'Hier kannst du später Freundschaftsanfragen annehmen oder ablehnen.' },
] as const

export default function Friends() {
  const online = useOnline()
  if (online.configured) return <OnlineFriends />
  return <PreviewFriends />
}

function PreviewFriends() {
  const [section, selectSection] = useState(0)
  const content = sections[section] ?? sections[0]
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Freunde" />
      <div className="segmented community-filters" role="group" aria-label="Freunde anzeigen">
        {sections.map(({ label }, index) => (
          <button key={label} type="button" aria-pressed={section === index} onClick={() => selectSection(index)}>{label}</button>
        ))}
      </div>
      <CommunityEmpty {...content} />
    </div>
  )
}

function OnlineFriends() {
  const online = useOnline()
  const command = useCommand()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Player[] | null>(null)
  const data = online.snapshot
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Freunde" />
      {command.error && <p className="inline-error" role="alert">{command.error}</p>}
      {data ? <div className="community-columns">
        <section className="surface settings-panel">
          <h2>Freundesliste</h2>
          {data.friends.length === 0 && <p className="muted">Suche nach einem Benutzernamen, um Freunde hinzuzufügen.</p>}
          {data.friends.map((friend) => (
            <div className="member-row" key={friend.id}>
              <div><strong>{friend.name}</strong><p className={friend.online ? 'presence-online' : ''}>{friend.online ? 'Online' : 'Offline'}</p></div>
              <div className="online-actions">
                {(!data.lobby || data.lobby.phase === 'open') && (
                  <button className="button button-secondary" disabled={command.pending} onClick={() => command.run(async () => {
                    if (!data.lobby) await online.act({ type: 'lobby-create', game: 'xeri', capacity: 2 })
                    await online.act({ type: 'lobby-invite', player: friend.id })
                    void navigate('/lobby')
                  })}>Einladen</button>
                )}
                <button className="button button-quiet" disabled={command.pending} onClick={() => command.run(() => online.act({ type: 'friend-remove', player: friend.id }))}>Entfernen</button>
              </div>
            </div>
          ))}
        </section>
        <section className="surface settings-panel">
          <h2>Freunde hinzufügen</h2>
          <form className="online-form" onSubmit={(event) => {
            event.preventDefault()
            command.run(async () => setResults(await online.search(query.trim())))
          }}>
            <label>Benutzername<input value={query} onChange={(event) => setQuery(event.target.value)} required minLength={3} maxLength={24} /></label>
            <button className="button button-primary" disabled={command.pending}>Suchen</button>
          </form>
          {results?.length === 0 && <p className="muted">Keine Treffer.</p>}
          {results?.map((player) => {
            const friend = data.friends.some(({ id }) => id === player.id)
            const pending = data.requests.some(({ id }) => id === player.id)
            return (
              <div className="member-row" key={player.id}>
                <strong>{player.name}</strong>
                {friend || pending ? <small>{friend ? 'Befreundet' : 'Anfrage offen'}</small> : <button className="button button-secondary" disabled={command.pending} onClick={() => command.run(() => online.act({ type: 'friend-request', player: player.id }))}>Anfragen</button>}
              </div>
            )
          })}
          <h3>Freundschaftsanfragen</h3>
          {data.requests.length === 0 && <p className="muted">Keine offenen Anfragen.</p>}
          {data.requests.map((player) => (
            <div className="member-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="online-actions">
                {player.incoming && <button className="button button-primary" disabled={command.pending} onClick={() => command.run(() => online.act({ type: 'friend-accept', player: player.id }))}>Annehmen</button>}
                <button className="button button-quiet" disabled={command.pending} onClick={() => command.run(() => online.act({ type: 'friend-decline', player: player.id }))}>{player.incoming ? 'Ablehnen' : 'Zurückziehen'}</button>
              </div>
            </div>
          ))}
        </section>
      </div> : <Link className="button button-primary" to="/profil">Zum Profil</Link>}
    </div>
  )
}
