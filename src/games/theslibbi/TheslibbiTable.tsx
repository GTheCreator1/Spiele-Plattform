import { Heart } from 'lucide-react'
import { useRef } from 'react'
import type { OnlineAction, Seat } from '../../../shared/online'
import { theslibbiHandSize } from './engine'
import type { TheslibbiView } from './engine'
import { TheslibbiCard } from './TheslibbiCard'
import './theslibbi-table.css'

export function TheslibbiTable({ view, seats, match, submit, busy }: {
  view: TheslibbiView
  seats: Seat[]
  match: string
  submit: (action: OnlineAction) => void
  busy: boolean
}) {
  const receipt = useRef<{ version: number; id: string } | null>(null)
  const top = view.played.at(-1)
  const total = seats.length * theslibbiHandSize
  const actor = view.last && seats[view.last.seat]?.player?.name

  function play(card: number) {
    if (receipt.current?.version !== view.version) receipt.current = { version: view.version, id: crypto.randomUUID() }
    submit({ type: 'theslibbi-play', match, card, ...receipt.current })
  }

  return (
    <section className="surface theslibbi-table" aria-label="THESLIBBI-Spieltisch">
      <header className="theslibbi-round-header">
        <h2>Sortierrunde</h2>
        <div className="theslibbi-round-stats">
          <span><Heart size={18} aria-hidden="true" /> {view.lives} von {seats.length} Leben</span>
          <span>{view.played.length} von {total} abgelegt</span>
        </div>
      </header>
      <div className="theslibbi-felt">
        <ul className="theslibbi-other-hands" role="list" aria-label="Andere Hände">
          {seats.filter((seat) => seat.seat !== view.seat).map((seat) => {
            const count = view.handCounts[seat.seat] ?? 0
            return (
              <li key={seat.seat}>
                <strong>{seat.player?.name}</strong>
                {count > 0 && <span className="theslibbi-mini-back" aria-hidden="true"><TheslibbiCard value={null} /></span>}
                <span>{count} {count === 1 ? 'Karte' : 'Karten'}{!seat.online && ' · getrennt'}</span>
              </li>
            )
          })}
        </ul>
        <section className="theslibbi-pile" aria-labelledby="theslibbi-pile-heading">
          <h3 id="theslibbi-pile-heading">Gemeinsame Ablage</h3>
          {top === undefined ? <div className="theslibbi-empty-pile">Noch leer</div> : (
            <div className="theslibbi-pile-top" key={top}><TheslibbiCard value={top} /></div>
          )}
          {view.played.length > 1 && (
            <ol className="theslibbi-history" role="list" aria-label="Zuvor abgelegte Zahlen">
              {view.played.slice(0, -1).map((value) => <li key={value}>{value}</li>)}
            </ol>
          )}
        </section>
      </div>
      <div className="theslibbi-feedback" role="status">
        {view.outcome === 'win' ? (
          <><h3>Runde gewonnen</h3><p>Alle Karten wurden aufsteigend abgelegt.</p></>
        ) : view.outcome === 'loss' ? (
          <><h3>Runde verloren</h3><p>Alle Leben sind verbraucht. Ungespielte Karten bleiben privat.</p></>
        ) : view.last?.kind === 'mistake' ? (
          <p>Ein Leben verloren. Die Karte bleibt auf der Hand.</p>
        ) : (
          <p>{actor ? `${actor} hat ${top} abgelegt.` : 'Spielt die kleinste noch gehaltene Zahl.'}</p>
        )}
      </div>
      <section className="theslibbi-hand-area" aria-labelledby="theslibbi-hand-heading">
        <h3 id="theslibbi-hand-heading">Deine Handkarten</h3>
        {view.hand.length === 0 ? <p>Deine Hand ist leer.</p> : (
          <div className="theslibbi-hand">
            {view.hand.map((value, index) => (
              <div className="theslibbi-hand-slot" key={value}>
                {index === 0 && !view.outcome ? (
                  <button type="button" className="theslibbi-play-card" aria-label={`Karte ${value} ausspielen`}
                    disabled={busy} onClick={() => play(value)}>
                    <TheslibbiCard value={value} />
                  </button>
                ) : <TheslibbiCard value={value} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
