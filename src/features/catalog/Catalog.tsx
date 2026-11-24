import { useState } from 'react'
import { Bell, Bot, Gamepad2, Play, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import hero from '../../assets/hero.webp'
import mobileHero from '../../assets/hero-mobile.webp'
import { preloadGame } from './game-loaders'
import { games } from './games'
import { useOnline } from '../../platform/online'
import type { Game } from './games'
import '../../styles/catalog.css'

const filters = [
  { label: 'Alle', value: 'all' },
  { label: 'Spielbar', value: 'ready' },
  { label: 'In Entwicklung', value: 'upcoming' },
] as const

export function Overview() {
  const { configured } = useOnline()
  return (
    <div className="page-view overview">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <picture>
          <source media="(max-width: 650px)" srcSet={mobileHero} />
          <img src={hero} alt="" width="1600" height="640" fetchPriority="high" />
        </picture>
        <div className="hero-copy">
          <h1 id="welcome-title">Willkommen<br />am <em>Spieltisch.</em></h1>
          <p>Vier Kartenspiele für eure Runde. Starte eine Partie Xeri gegen den Computer.</p>
          <div className="hero-actions">
            <Link
              className="button button-primary"
              to="/spiele/xeri"
              onPointerEnter={() => preloadGame('xeri')}
              onFocus={() => preloadGame('xeri')}
            >
              <Play size={16} fill="currentColor" aria-hidden="true" /> Xeri spielen
            </Link>
            <Link className="button button-quiet" to="/spiele">Alle Spiele</Link>
          </div>
        </div>
      </section>
      <GameGrid overview />
      <section className="community-shortcuts" aria-label="Freunde und Einladungen">
        <Link className="community-shortcut" to="/freunde">
          <span className="feature-icon feature-icon-violet"><UsersRound size={19} aria-hidden="true" /></span>
          <span><strong>Freunde</strong><small>Freundeslisten und Online-Status</small></span>
          {!configured && <span className="shortcut-status">In Entwicklung</span>}
        </Link>
        <Link className="community-shortcut" to="/nachrichten">
          <span className="feature-icon feature-icon-amber"><Bell size={19} aria-hidden="true" /></span>
          <span><strong>Einladungen</strong><small>Einladungen und Ingame-Chat</small></span>
          {!configured && <span className="shortcut-status">In Entwicklung</span>}
        </Link>
      </section>
    </div>
  )
}

export function GameCatalog() {
  return (
    <div className="page-view catalog-page">
      <GameGrid />
    </div>
  )
}

function GameGrid({ overview = false }: { overview?: boolean }) {
  const { configured } = useOnline()
  const [filter, setFilter] = useState<typeof filters[number]['value']>('all')
  const visibleGames = games.map((game) => ({
    ...game, available: game.available || (configured && game.id === 'ab6super6'),
  })).filter((game) => filter === 'all' || (filter === 'ready' ? game.available : !game.available))
  const Heading = overview ? 'h2' : 'h1'
  return (
    <section className="game-library" aria-labelledby="game-library-title">
      <div className="library-heading">
        <Heading id="game-library-title">Spielebibliothek</Heading>
        <div className="segmented" role="group" aria-label="Spiele filtern">
          {filters.map(({ label, value }) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="game-grid">
        {visibleGames.map((game) => <GameTile game={game} key={game.id} />)}
      </div>
    </section>
  )
}

export function Availability({ available }: { available: boolean }) {
  return (
    <span className={available ? 'availability availability-ready' : 'availability'}>
      {available && <span className="availability-dot" />}
      {available ? 'Spielbar' : 'In Entwicklung'}
    </span>
  )
}

function GameTile({ game }: { game: Game }) {
  const PlayersIcon = game.id === 'xeri' ? Bot : UsersRound
  return (
    <Link
      className="game-tile"
      to={`/spiele/${game.id}`}
      onPointerEnter={() => preloadGame(game.id)}
      onFocus={() => preloadGame(game.id)}
      aria-labelledby={`${game.id}-tile-title`}
      aria-describedby={`${game.id}-tile-status`}
    >
      <div className="tile-art">
        <img src={game.cover} alt="" width="672" height="378" decoding="async" />
        <div id={`${game.id}-tile-status`} className="tile-status"><Availability available={game.available} /></div>
      </div>
      <div className="tile-info">
        <span className="game-category">{game.category}</span>
        <h3 id={`${game.id}-tile-title`}>{game.name}</h3>
        <p>{game.description}</p>
        <div className="tile-footer">
          <span><PlayersIcon size={15} aria-hidden="true" />{game.players}</span>
          <span className="tile-icon">{game.available ? <Play size={15} aria-hidden="true" /> : <Gamepad2 size={16} aria-hidden="true" />}</span>
        </div>
      </div>
    </Link>
  )
}
