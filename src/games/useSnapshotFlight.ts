import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { usePreferences } from '../platform/preferences'
import type { CambioCard } from './ab6super6/engine'
import type { Flight } from './xeri/CardFlight'

type Cue = { source: string; card: CambioCard; capture?: string }

export function useSnapshotFlight(board: RefObject<HTMLElement | null>, version: number, pile: CambioCard[], cue: Cue | null) {
  const { motion } = usePreferences()
  const previous = useRef<{ version: number; positions: Map<string, DOMRect>; pile: CambioCard[] } | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  useLayoutEffect(() => {
    const positions = new Map<string, DOMRect>()
    for (const element of board.current?.querySelectorAll<HTMLElement>('[data-flight]') ?? []) {
      positions.set(element.dataset.flight!, element.getBoundingClientRect())
    }
    const old = previous.current
    previous.current = { version, positions, pile }
    if (!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      setFlight(null)
      return
    }
    if (!old || old.version === version) return
    const origin = cue ? old.positions.get(cue.source) : undefined
    const landing = positions.get('pile')
    setFlight(cue && version === old.version + 1 && origin?.width && landing?.width
      ? { card: cue.card, origin, landing, previousPile: old.pile, capture: cue.capture ? positions.get(cue.capture) : undefined }
      : null)
  })
  const finishFlight = useCallback((done: Flight) => {
    setFlight((current) => current === done ? null : current)
  }, [])
  return { flight, finishFlight }
}
