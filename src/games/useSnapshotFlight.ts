import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { usePreferences } from '../platform/preferences'
import type { CambioCard } from './ab6super6/engine'
import type { Flight } from './xeri/CardFlight'

type Cue = { source: string; card: CambioCard; capture?: string }

function positionsIn(board: HTMLElement | null) {
  const positions = new Map<string, DOMRect>()
  for (const element of board?.querySelectorAll<HTMLElement>('[data-flight]') ?? []) {
    positions.set(element.dataset.flight!, element.getBoundingClientRect())
  }
  return positions
}

export function useSnapshotFlight(board: RefObject<HTMLElement | null>, version: number, pile: CambioCard[], cue: Cue | null) {
  const { motion } = usePreferences()
  const previous = useRef<{ version: number; positions: Map<string, DOMRect>; pile: CambioCard[] } | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  useEffect(() => {
    if (!motion) return
    function reposition() {
      if (previous.current) previous.current.positions = positionsIn(board.current)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, { passive: true })
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition)
    }
  }, [board, motion])

  useLayoutEffect(() => {
    if (!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      previous.current = null
      setFlight(null)
      return
    }
    const old = previous.current
    if (old?.version === version) return
    const positions = positionsIn(board.current)
    previous.current = { version, positions, pile }
    if (!old || (!cue && old.pile.at(-1) === pile.at(-1))) return
    const origin = cue ? old.positions.get(cue.source) : undefined
    const landing = positions.get('pile')
    setFlight(cue && version > old.version && origin?.width && landing?.width
      ? { card: cue.card, origin, landing, previousPile: old.pile, capture: cue.capture ? positions.get(cue.capture) : undefined }
      : null)
  })
  const finishFlight = useCallback((done: Flight) => {
    setFlight((current) => current === done ? null : current)
  }, [])
  return { flight, finishFlight }
}
