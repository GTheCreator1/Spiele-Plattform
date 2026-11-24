import { useRef } from 'react'
import type { Lobby, OnlineAction, Seat } from '../../../shared/online'
import { cardLabel } from '../../../vendor/xeri/game/engine.js'
import type { Card } from '../../../vendor/xeri/game/engine.js'
import { useSnapshotFlight } from '../useSnapshotFlight'
import { CardBack, CardFace, PileUnderlay } from './Card'
import { CardFlight } from './CardFlight'
import './xeri.css'
import '../online-games.css'

export function OnlineXeri({ lobby, submit, busy }: { lobby: Lobby; submit: (action: OnlineAction) => void; busy: boolean }) {
  const view = lobby.xeri!
  const board = useRef<HTMLElement>(null)
  const player = lobby.seats[view.seat]!
  const move = view.lastMove
  const { flight, finishFlight } = useSnapshotFlight(board, view.version, view.table, move ? {
    source: move.seat === view.seat ? `card-${move.card}` : `seat-${move.seat}`,
    card: move.card,
    capture: move.captures ? `score-${move.seat % 2}` : undefined,
  } : null)
  const table = flight ? flight.previousPile : view.table
  const top = table.at(-1)
  const turn = view.turn === null ? null : lobby.seats[view.turn]
  const status = view.finished ? 'Partie beendet' : turn?.seat === view.seat ? 'Du bist am Zug' : `${seatName(turn)} ist am Zug`
  const result = view.winner === null ? 'Unentschieden' : view.winner === view.seat % 2 ? 'Gewonnen' : 'Verloren'
  const receipt = useRef<{ card: Card; version: number; id: string } | null>(null)

  function play(card: Card) {
    if (receipt.current?.card !== card || receipt.current.version !== view.version) {
      receipt.current = { card, version: view.version, id: crypto.randomUUID() }
    }
    submit({ type: 'xeri-play', card, id: receipt.current.id, match: lobby.match!, version: view.version })
  }

  const north = lobby.seats[(view.seat + (lobby.capacity === 4 ? 2 : 1)) % lobby.capacity]!
  const left = lobby.seats[(view.seat + 1) % lobby.capacity]!
  const right = lobby.seats[(view.seat + 3) % lobby.capacity]!
  return (
    <section className="xeri-page" ref={board} aria-label="Xeri-Spieltisch">
      <div className="scoreboard">
        {view.scores.map((score, team) => (
          <div className="score-panel" key={team} data-flight={`score-${team}`}>
            <span className="score-info"><strong>{team === view.seat % 2 ? (lobby.capacity === 2 ? 'Du' : 'Dein Team') : (lobby.capacity === 2 ? seatName(north) : 'Anderes Team')}</strong><small>{score.cards} Karten · {score.bonus} Bonus</small></span>
            <strong className="score-total">{score.total}</strong>
          </div>
        ))}
      </div>
      <div className="xeri-board online-xeri-board">
        <Opponent seat={north} count={view.handCounts[north.seat] ?? 0} position="north" />
        {lobby.capacity === 4 && <Opponent seat={left} count={view.handCounts[left.seat] ?? 0} position="west" />}
        <div className="table-center online-xeri-center">
          <div className="table-stack"><div className="table-slot card-size">{view.deckCount ? <CardBack /> : <span className="empty-slot">♣</span>}</div><span>Deck · {view.deckCount}</span></div>
          <div className="table-stack">
            <div className="table-slot card-size" data-flight="pile" aria-label={view.table.at(-1) ? `Oben liegt ${cardLabel(view.table.at(-1)!)}` : 'Tischstapel leer'}>
              {top && !flight?.capture ? <><PileUnderlay count={table.length - 1} /><CardFace card={top} /></> : <span className="empty-slot">♠</span>}
            </div><span>Tisch · {view.table.length}</span>
          </div>
          {view.finished && !flight && <div className="result-card"><h2>{result}</h2><p>{view.scores[view.seat % 2]?.total} Punkte</p></div>}
        </div>
        {lobby.capacity === 4 && <Opponent seat={right} count={view.handCounts[right.seat] ?? 0} position="east" />}
        <div className="player online-xeri-south">
          <div className="turn-status" role="status">{status}{move && move.bonus > 0 && <span className="xeri-callout">Xeri +{move.bonus}</span>}</div>
          <div className="player-hand" aria-label="Deine Handkarten" role="group">
            {view.hand.map((card) => (
              <button key={card} className="card-size hand-card" data-flight={`card-${card}`} disabled={busy || view.turn !== player.seat}
                aria-label={`${cardLabel(card)} ausspielen`} onClick={() => play(card)}><CardFace card={card} /></button>
            ))}
          </div>
        </div>
      </div>
      {flight && <CardFlight key={view.version} flight={flight} onComplete={finishFlight} />}
    </section>
  )
}

function seatName(seat: Seat | null | undefined) {
  return seat?.player?.name ?? (seat?.bot ? `Bot ${seat.seat + 1}` : 'Spieler')
}

function Opponent({ seat, count, position }: { seat: Seat; count: number; position: string }) {
  return (
    <div className={`opponent online-xeri-${position}`}>
      <p>{seatName(seat)} <span>· {count}</span></p>
      <div className="opponent-hand" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span className="card-size mini-card" data-flight={index === count - 1 ? `seat-${seat.seat}` : undefined} key={index}><CardBack /></span>
        ))}
      </div>
    </div>
  )
}
