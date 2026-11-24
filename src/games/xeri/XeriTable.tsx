import { useCallback, useRef } from 'react'
import { Bot, RotateCcw, Trophy, UserRound, Volume2, VolumeX } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { cardLabel } from '../../../vendor/xeri/game/engine.js'
import type { Score } from '../../../vendor/xeri/game/engine.js'
import { usePreferences } from '../../platform/preferences'
import { CardBack, CardFace, PileUnderlay } from './Card'
import { CardFlight } from './CardFlight'
import { difficulties, parseDifficulty } from './difficulty'
import type { Difficulty } from './difficulty'
import { useXeriGame } from './useXeriGame'
import './xeri.css'

export default function XeriTable() {
  const [params] = useSearchParams()
  const difficulty = parseDifficulty(params.get('stufe'))
  return <Table key={difficulty} difficulty={difficulty} />
}

function Table({ difficulty }: { difficulty: Difficulty }) {
  const tableSpot = useRef<HTMLDivElement>(null)
  const playerHand = useRef<HTMLDivElement>(null)
  const computerHand = useRef<HTMLDivElement>(null)
  const playerScore = useRef<HTMLDivElement>(null)
  const computerScore = useRef<HTMLDivElement>(null)
  const { sound, setPreference } = usePreferences()
  const computerSource = useCallback(() => ({
    source: computerHand.current?.lastElementChild as HTMLElement | undefined,
    table: tableSpot.current,
    score: computerScore.current,
  }), [])
  const { view, flight, finishFlight, handleMove, restart } = useXeriGame(difficulty, computerSource)
  const visiblePile = flight ? flight.previousPile : view.table
  const topCard = visiblePile.at(-1)
  const yourTurn = view.turn === 0
  const notice = view.finished ? 'Partie beendet' : yourTurn ? 'Du bist am Zug' : 'Computer ist am Zug'
  const move = view.lastMove
  const resultTitle = view.winner === null ? 'Unentschieden' : view.winner === 0 ? 'Du gewinnst!' : 'Computer gewinnt'

  return (
    <div className="page-view xeri-page">
      <header className="xeri-heading">
        <div><h1>Xeri (Ξερή)</h1><p>Gegen Computer · {difficulties[difficulty]}</p></div>
        <div className="xeri-heading-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Soundeffekte"
            aria-pressed={sound}
            onClick={() => setPreference('sound', !sound)}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <Link className="button button-secondary" to="/spiele/xeri">Spielmodus</Link>
        </div>
      </header>
      <div className="scoreboard" aria-label="Punktestand">
        <div ref={playerScore}><ScorePanel name="Du" score={view.scores[0]} player active={yourTurn} /></div>
        <div ref={computerScore}><ScorePanel name="Computer" score={view.scores[1]} active={view.turn === 1} /></div>
      </div>
      <section className="xeri-board" aria-label="Spieltisch">
        <div className="opponent">
          <p><Bot size={16} aria-hidden="true" /> Computer <span>· {view.handCounts[1]} Karten</span></p>
          <div className="opponent-hand" ref={computerHand} aria-hidden="true">
            {Array.from({ length: view.handCounts[1] ?? 0 }, (_, index) => (
              <span className="card-size mini-card" key={index}><CardBack /></span>
            ))}
          </div>
        </div>
        <div className="table-center">
          <div className="table-stack deck-stack">
            <div className="card-size table-slot">
              {view.deckCount > 0 ? <><PileUnderlay count={view.deckCount - 1} /><CardBack /></> : <span className="empty-slot">♣</span>}
            </div>
            <span>Deck · {view.deckCount}</span>
          </div>
          <div className="table-stack played-stack">
            <div className="card-size table-slot" ref={tableSpot} aria-label={view.table.length ? `Tischstapel, ${view.table.length} Karten` : 'Tischstapel leer'}>
              {flight?.capture
                ? <span className="empty-slot">♠</span>
                : topCard ? <><PileUnderlay count={visiblePile.length - 1} /><CardFace card={topCard} /></> : <span className="empty-slot">♠</span>}
              {view.table.at(-1) && <span className="visually-hidden">Oben liegt {cardLabel(view.table.at(-1)!)}</span>}
            </div>
            <span>Tisch · {view.table.length}</span>
          </div>
          {view.finished && !flight && (
            <div className="result-card">
              <Trophy size={23} aria-hidden="true" />
              <h2>{resultTitle}</h2>
              <p>{view.scores[0].total} zu {view.scores[1].total} Punkten</p>
              <button className="button button-primary" type="button" onClick={restart}>
                <RotateCcw size={16} aria-hidden="true" /> Revanche
              </button>
            </div>
          )}
        </div>
        <div className="player">
          <div className="turn-status" role="status">
            <span className={yourTurn ? 'turn-indicator your-turn' : 'turn-indicator'} />
            {notice}
            {move && move.bonus > 0 && <span className="xeri-callout">Xeri +{move.bonus}</span>}
          </div>
          <div className="player-hand" ref={playerHand} tabIndex={-1} aria-label="Deine Handkarten" role="group">
            {view.hand.map((card) => (
              <button
                className="card-size hand-card"
                key={card}
                type="button"
                aria-label={`${cardLabel(card)} ausspielen`}
                disabled={!yourTurn}
                onClick={(event) => {
                  if (document.activeElement === event.currentTarget) playerHand.current?.focus({ preventScroll: true })
                  handleMove(0, card, { source: event.currentTarget, table: tableSpot.current, score: playerScore.current })
                }}
              >
                <CardFace card={card} />
              </button>
            ))}
          </div>
        </div>
      </section>
      <p className="table-note">Austeilung {view.deal} von 6</p>
      {flight && <CardFlight key={view.version} flight={flight} onComplete={finishFlight} />}
    </div>
  )
}

function ScorePanel({ name, score, player, active }: { name: string; score: Score; player?: boolean; active: boolean }) {
  const Icon = player ? UserRound : Bot
  return (
    <div className={active ? 'score-panel score-active' : 'score-panel'} aria-label={`Punktestand ${name}`} role="group">
      <span className={player ? 'score-avatar score-avatar-player' : 'score-avatar'}><Icon size={19} aria-hidden="true" /></span>
      <span className="score-info">
        <strong>{name}</strong><small>{score.cards} Karten · {score.bonus} Bonus</small>
      </span>
      <strong className="score-total">{score.total}<span className="visually-hidden"> Punkte</span></strong>
    </div>
  )
}
