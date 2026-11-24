import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '../../../vendor/xeri/game/engine.js'
import { CardFace, PileUnderlay } from './Card'

export type Flight = {
  card: Card
  origin: DOMRect
  landing: DOMRect
  capture: DOMRect | undefined
  previousPile: Card[]
}

export function CardFlight({ flight, onComplete }: { flight: Flight; onComplete: (flight: Flight) => void }) {
  const layer = useRef<HTMLDivElement>(null)
  const flyingCard = useRef<HTMLDivElement>(null)
  const { landing, origin, capture, previousPile } = flight

  useLayoutEffect(() => {
    const element = flyingCard.current
    const pile = layer.current
    if (!element || !pile || document.hidden || typeof element.animate !== 'function') {
      onComplete(flight)
      return
    }

    const animations: Animation[] = []
    let active = true
    function settle() {
      if (active) onComplete(flight)
    }

    let slide: Animation
    try {
      slide = element.animate([
        { transform: `translate(${origin.left - landing.left}px, ${origin.top - landing.top}px) scale(${origin.width / landing.width}, ${origin.height / landing.height})` },
        { transform: 'none' },
      ], { duration: 245, easing: 'cubic-bezier(.22,.66,.24,1)', fill: 'both' })
    } catch {
      settle()
      return
    }
    animations.push(slide)

    void slide.finished.then(() => {
      if (!capture || !active) return
      const x = capture.left + capture.width / 2 - landing.left - landing.width / 2
      const y = capture.top + capture.height / 2 - landing.top - landing.height / 2
      const sweep = pile.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(.4)`, opacity: 0 },
      ], { duration: 165, easing: 'ease-in', fill: 'both' })
      animations.push(sweep)
      return sweep.finished
    }).then(settle, settle)

    window.addEventListener('resize', settle)
    window.addEventListener('scroll', settle, { passive: true })
    document.addEventListener('visibilitychange', settle)
    return () => {
      active = false
      for (const animation of animations) animation.cancel()
      window.removeEventListener('resize', settle)
      window.removeEventListener('scroll', settle)
      document.removeEventListener('visibilitychange', settle)
    }
  }, [capture, flight, landing, onComplete, origin])

  const previousTop = previousPile.at(-1)
  return createPortal(
    <div
      className="flight-layer"
      ref={layer}
      aria-hidden="true"
      style={{ left: landing.left, top: landing.top, width: landing.width, height: landing.height }}
    >
      {capture && previousTop && (
        <>
          <PileUnderlay count={previousPile.length - 1} />
          <CardFace card={previousTop} />
        </>
      )}
      <div className="flying-card" ref={flyingCard}><CardFace card={flight.card} /></div>
    </div>,
    document.body,
  )
}
