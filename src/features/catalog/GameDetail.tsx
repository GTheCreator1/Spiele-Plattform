import { useState } from 'react'
import { Bot, Info, LockKeyhole, Play, UsersRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { OnlineGame } from '../../../shared/online'
import { useOnline } from '../../platform/online'
import { useCommand } from '../community/useCommand'
import { difficulties } from '../../games/xeri/difficulty'
import type { Difficulty } from '../../games/xeri/difficulty'
import { Availability } from './Catalog'
import { preloadXeriTable } from './game-loaders'
import { findGame } from './games'

export default function GameDetail() {
  const { gameId } = useParams()
  const online = useOnline()
  const game = findGame(gameId)
  if (!game) {
    return (
      <section className="page-heading">
        <h1>Spiel nicht gefunden</h1>
        <Link className="button button-secondary" to="/spiele">Zur Spielebibliothek</Link>
      </section>
    )
  }
  if (game.id === 'luegen') {
    return (
      <section className="page-view detail-banner detail-banner-luegen upcoming-game" aria-label="Lügen">
        <img src={game.cover} width="672" height="378" alt="" />
        <div>
          <h1>Mach ich bald</h1>
          <Link className="button button-primary" to="/">Zurück zum Hauptmenü</Link>
        </div>
      </section>
    )
  }

  return (
    <div className="page-view game-detail">
      <section className={`detail-banner detail-banner-${game.id}`}>
        <img src={game.cover} width="672" height="378" alt="" />
        <div>
          <Availability available={game.available || (game.id === 'ab6super6' && online.configured)} />
          <h1>{game.name}</h1>
          <p>{game.description}</p>
        </div>
      </section>
      <div className="detail-columns">
        {game.id === 'xeri' ? <XeriModes /> : game.id === 'ab6super6' && online.configured ? (
          <section className="surface detail-panel"><h2>Private Lobby</h2><OnlineModes game="ab6super6" /></section>
        ) : (
          <section className="surface detail-panel">
            <h2>Spielstatus</h2>
            <div className="feature-line">
              <span className="feature-icon"><LockKeyhole size={19} aria-hidden="true" /></span>
              <div>
                <h3>{game.id === 'ab6super6' ? 'Online-Freischaltung ausstehend' : 'Vorgemerkt'}</h3>
                <p>{game.id === 'ab6super6' ? 'ab6super6 wird mit dem Spielserver verfügbar.' : 'Für MindSync gibt es derzeit keine spielbare Fassung.'}</p>
              </div>
            </div>
          </section>
        )}
        <section className="surface detail-panel" aria-labelledby="rule-heading">
          <div className="panel-heading"><Info size={20} aria-hidden="true" /><h2 id="rule-heading">{game.available ? 'Spielregeln' : 'Spielidee'}</h2></div>
          <ul className="rule-list">{game.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      </div>
      <Link className="text-link" to="/spiele">Zur Spielebibliothek</Link>
    </div>
  )
}

function XeriModes() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const online = useOnline()
  return (
    <section className="surface detail-panel" aria-labelledby="modes-heading">
      <h2 id="modes-heading">Spielmodus</h2>
      <div className="feature-line xeri-mode">
        <span className="feature-icon feature-icon-teal"><Bot size={21} aria-hidden="true" /></span>
        <div><h3>Gegen Computer</h3><p>Übe deine Taktik in einem Duell.</p></div>
      </div>
      <fieldset className="difficulty">
        <legend>Schwierigkeit</legend>
        <div className="difficulty-options">
          {(Object.entries(difficulties) as [Difficulty, string][]).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="difficulty"
                value={value}
                checked={difficulty === value}
                onChange={() => setDifficulty(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Link className="button button-primary" to={`/spiele/xeri/tisch?stufe=${difficulty}`} onPointerEnter={preloadXeriTable} onFocus={preloadXeriTable}>
        <Play size={16} fill="currentColor" aria-hidden="true" /> Partie starten
      </Link>
      <div className="feature-line future-mode">
        <span className="feature-icon"><UsersRound size={19} aria-hidden="true" /></span>
        <div><h3>Online 1 gegen 1 und 2 gegen 2</h3>{!online.configured && <p>In Entwicklung</p>}</div>
      </div>
      {online.configured && <OnlineModes game="xeri" />}
    </section>
  )
}

function OnlineModes({ game }: { game: OnlineGame }) {
  const online = useOnline()
  const command = useCommand()
  const navigate = useNavigate()
  const [capacity, setCapacity] = useState(2)
  if (!online.snapshot) return <Link className="text-link" to="/profil">Zum Online-Spielen anmelden</Link>
  if (online.snapshot.lobby) return <Link className="text-link" to="/lobby">Zur aktiven Lobby</Link>
  const options = game === 'xeri' ? [2, 4] : [2, 3, 4, 5, 6]
  return <form className="online-form mode-form" onSubmit={(event) => {
    event.preventDefault()
    command.run(async () => {
      await online.act({ type: 'lobby-create', game, capacity })
      void navigate('/lobby')
    })
  }}>
    <label>Spielerplätze<select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}>
      {options.map((size) => <option key={size} value={size}>{game === 'xeri' ? size === 2 ? '1 gegen 1' : '2 gegen 2' : `${size} Spieler`}</option>)}
    </select></label>
    {command.error && <p className="inline-error" role="alert">{command.error}</p>}
    <button className="button button-primary" disabled={command.pending || !online.live}>Private Lobby erstellen</button>
  </form>
}
