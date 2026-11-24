import { rankOf, SUITS } from '../../../vendor/xeri/game/engine.js'
import type { Card } from '../../../vendor/xeri/game/engine.js'

export function CardFace({ card }: { card: Card }) {
  const suit = SUITS.find(({ id }) => id === card.at(-1))!
  const rank = rankOf(card)
  return (
    <span className={suit.red ? 'card-face card-red' : 'card-face'} aria-hidden="true">
      <span className="card-corner">{rank}<small>{suit.symbol}</small></span>
      <span className="card-pip">{suit.symbol}</span>
      <span className="card-corner card-corner-bottom">{rank}<small>{suit.symbol}</small></span>
    </span>
  )
}

export function CardBack() {
  return <span className="card-back" aria-hidden="true"><span>♠</span></span>
}

export function PileUnderlay({ count }: { count: number }) {
  return (
    <span className="pile-underlay" aria-hidden="true">
      {Array.from({ length: Math.min(2, count) }, (_, index) => <i key={index} />)}
    </span>
  )
}
