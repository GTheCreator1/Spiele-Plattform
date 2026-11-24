import { useEffect, useRef, useState } from 'react'
import type { Lobby, OnlineAction } from '../../../shared/online'
import { cardLabel, isCard } from '../../../vendor/xeri/game/engine.js'
import { useSnapshotFlight } from '../useSnapshotFlight'
import { CardBack, CardFace } from '../xeri/Card'
import { CardFlight } from '../xeri/CardFlight'
import type { CambioAction, CambioCard, EffectKind, Target } from './engine'
import '../xeri/xeri.css'
import '../online-games.css'

const actions: Record<EffectKind, string> = {
  add: 'Eine verdeckte Karte vergeben',
  own: 'Eine eigene Karte anschauen',
  other: 'Eine fremde Karte anschauen',
  'blind-swap': 'Zwei Karten blind tauschen',
  king: 'Zwei Karten anschauen',
}

function describe(card: CambioCard | null) {
  return card === null ? 'Verdeckt' : isCard(card) ? cardLabel(card) : 'Joker'
}

export function CambioTable({ lobby, submit, busy }: { lobby: Lobby; submit: (action: OnlineAction) => void; busy: boolean }) {
  const view = lobby.cambio!
  const board = useRef<HTMLElement>(null)
  const last = view.lastThrow
  const { flight, finishFlight } = useSnapshotFlight(board, view.version, view.top ? [view.top] : [], last ? {
    source: `slot-${last.target.seat}-${last.target.slot}`, card: last.card,
  } : null)
  const [mode, setMode] = useState<'throw' | 'effect' | 'swap'>('swap')
  const [pair, setPair] = useState<Target[]>([])
  const [clock, setClock] = useState(view.now)
  const receipt = useRef<{ key: string; id: string } | null>(null)
  const effect = view.effect?.seat === view.seat ? view.effect : null
  const ready = view.players[view.seat]?.ready
  const ownTurn = view.turn === view.seat
  const playing = view.phase === 'playing'
  const until = view.reaction?.until
  const open = playing && Boolean(view.reaction) && (until === null || (until !== undefined && clock < until))
  const canDiscard = playing && Boolean(view.drawn) && !open && !view.effect && view.final?.remaining !== 0
  const labels = lobby.seats.map((seat) => seat.player?.name ?? `Platz ${seat.seat + 1}`)
  const top = flight ? flight.previousPile.at(-1) : view.top
  const isThrowing = mode === 'throw' && open

  useEffect(() => {
    setClock(view.now)
    if (until === null || until === undefined || until <= view.now) return
    const received = Date.now()
    const timer = window.setInterval(() => {
      const time = view.now + Date.now() - received
      setClock(time)
      if (time >= until) window.clearInterval(timer)
    }, 75)
    return () => window.clearInterval(timer)
  }, [until, view.now])

  useEffect(() => {
    setPair([])
    setMode(effect ? 'effect' : 'swap')
  }, [effect?.id])

  function send(action: CambioAction) {
    const key = JSON.stringify({ action, version: view.version })
    if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() }
    submit({ type: 'cambio-play', id: receipt.current.id, match: lobby.match!, version: view.version, action })
  }

  function tap(target: Target) {
    if (isThrowing && view.reaction) {
      send({ type: 'throw', window: view.reaction.id, target })
    } else if (effect && !effect.chosen.length) {
      if (effect.kind === 'king' || effect.kind === 'blind-swap') {
        if (!pair.length) setPair([target])
        else {
          setPair([])
          send({ type: 'effect-select', targets: [pair[0]!, target] })
        }
      } else send({ type: 'effect-select', targets: [target] })
    } else if (canDiscard && target.seat === view.seat) {
      send({ type: 'discard', slot: target.slot })
    }
  }

  function selectable(seat: number, slot: number) {
    if (busy || !playing) return false
    if (isThrowing) return true
    if (effect && !effect.chosen.length && effect.kind !== 'add') {
      if (effect.kind === 'own') return seat === view.seat
      if (effect.kind === 'other') return seat !== view.seat
      return !pair.some((target) => target.seat === seat && target.slot === slot)
    }
    return canDiscard && seat === view.seat
  }

  return (
    <section className="cambio-board" ref={board} aria-label="ab6super6-Spieltisch">
      <div className="cambio-table-top">
        <div className="table-stack"><div className="table-slot card-size"><CardBack /></div><span>Deck · {view.deckCount}</span></div>
        <div className="table-stack">
          <div className="table-slot card-size" data-flight="pile" aria-label={`Ablage · ${describe(view.top)}`}>{top ? <CardFace card={top} /> : <span className="empty-slot">♠</span>}</div>
          <span>Ablage</span>
        </div>
        {view.drawn && <div className="table-stack"><div className="table-slot card-size" aria-label={`Gezogen: ${describe(view.drawn)}`}><CardFace card={view.drawn} /></div><span>Gezogen</span></div>}
      </div>
      <div className="cambio-status" role="status">
        {view.phase === 'setup' && (ready ? 'Andere Spieler decken ihre Startkarten wieder zu.' : 'Du darfst deine beiden unteren Karten einmal ansehen.')}
        {playing && (view.final?.remaining === 0 ? 'Letzte Ablage' : ownTurn ? 'Du bist am Zug' : `${labels[view.turn]} ist am Zug`)}
        {playing && view.final && <span> · Schlussrunde</span>}
        {open && <span> · {typeof until === 'number' ? `${((until - clock) / 1000).toFixed(1)} s zum Reinwerfen` : 'Reinwurf offen'}</span>}
        {last && <span> · {last.correct ? 'Passend eingeworfen' : 'Falsch eingeworfen'}</span>}
        {view.phase === 'finished' && <span>Endwertung</span>}
        {view.unpaidPenalties > 0 && <span> · ${view.unpaidPenalties} Strafkarten konnten nicht ausgeteilt werden.</span>}
      </div>
      <div className="online-actions cambio-actions">
        {view.phase === 'setup' && !ready && <>
          <button className="button button-secondary" disabled={busy || view.startViewed} onClick={() => send({ type: 'peek-start' })}>Untere Karten ansehen</button>
          <button className="button button-primary" disabled={busy} onClick={() => send({ type: 'ready' })}>Verdecken und bereit</button>
        </>}
        {playing && ownTurn && !view.hasDrawn && view.final?.remaining !== 0 && <>
          <button className="button button-primary" disabled={busy} onClick={() => send({ type: 'draw' })}>Karte ziehen</button>
          {!view.final && <button className="button button-secondary" disabled={busy} onClick={() => send({ type: 'knock' })}>Klopfen</button>}
        </>}
        {view.drawn && <button className="button button-primary" disabled={busy || !canDiscard} onClick={() => send({ type: 'discard' })}>Gezogene Karte ablegen</button>}
        {open && <button className="button button-secondary" aria-pressed={isThrowing} onClick={() => setMode(isThrowing ? 'swap' : 'throw')}>Reinwerfen</button>}
      </div>
      {effect && <div className="cambio-effect">
        <strong>{actions[effect.kind]}</strong>
        {(effect.kind === 'king' || effect.kind === 'blind-swap') && !effect.chosen.length && <p>{pair.length ? 'Wähle die zweite Karte.' : 'Wähle zwei verschiedene Karten.'}</p>}
        {effect.kind === 'add' && <div className="online-actions">{labels.map((name, seat) => seat === view.seat ? null :
          <button className="button button-secondary" key={seat} disabled={busy} onClick={() => send({ type: 'effect-select', seat })}>{name}</button>)}</div>}
        <div className="online-actions">
          {effect.kind === 'king' && effect.chosen.length > 0 && <button className="button button-primary" disabled={busy} onClick={() => send({ type: 'effect-finish', swap: true })}>Tauschen</button>}
          <button className="button button-quiet" disabled={busy} onClick={() => send(effect.chosen.length ? { type: 'effect-finish' } : { type: 'effect-skip' })}>{effect.chosen.length ? 'Verdecken' : 'Auslassen'}</button>
        </div>
      </div>}
      <div className="cambio-seats">
        {[view.seat, ...view.players.map((_, seat) => seat).filter((seat) => seat !== view.seat)].map((seat) => {
          const player = view.players[seat]!
          const points = view.result?.[seat]
          return (
            <section className="cambio-seat" aria-label={seat === view.seat ? 'Deine Auslage' : `Auslage von ${labels[seat]}`} key={seat}>
              <h3>{seat === view.seat ? 'Du' : labels[seat]}</h3>
              {points && <p>{points.total} Punkte · {points.outcome === 'win' ? 'Gewonnen' : points.outcome === 'tie' ? 'Gleichstand auf Platz 1' : 'Verloren'}{points.invalidKnock ? ' · über 6 nach Klopfen' : ''}</p>}
              <div className="cambio-cards">
                {player.cards.length === 0 && <span className="muted">Keine Karten</span>}
                {player.cards.map(({ slot, card }) => (
                  <button className="card-size hand-card" data-flight={`slot-${seat}-${slot}`} key={slot} disabled={!selectable(seat, slot)}
                    aria-label={`Platz ${slot + 1} von ${labels[seat]} · ${describe(card)}`}
                    onClick={() => tap({ seat, slot })}>{card ? <CardFace card={card} /> : <CardBack />}</button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      {flight && <CardFlight key={view.version} flight={flight} onComplete={finishFlight} />}
    </section>
  )
}
