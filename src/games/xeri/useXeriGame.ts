import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { chooseCard } from '../../../vendor/xeri/game/ai.js'
import { GameAudio } from '../../../vendor/xeri/game/audio.js'
import { newGame, playCard, viewFor } from '../../../vendor/xeri/game/engine.js'
import type { Card } from '../../../vendor/xeri/game/engine.js'
import { usePreferences } from '../../platform/preferences'
import type { Flight } from './CardFlight'
import type { Difficulty } from './difficulty'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function subscribeToMotion(callback: () => void) {
  reducedMotion.addEventListener('change', callback)
  return () => reducedMotion.removeEventListener('change', callback)
}

type PlayGeometry = { source?: HTMLElement; table: HTMLElement | null; score: HTMLElement | null }

export function useXeriGame(difficulty: Difficulty, computerSource: () => PlayGeometry) {
  const { motion, sound } = usePreferences()
  const motionAllowed = useSyncExternalStore(subscribeToMotion, () => !reducedMotion.matches) && motion
  const [game, setGame] = useState(() => newGame(2))
  const current = useRef(game)
  const [flight, setFlight] = useState<Flight | null>(null)
  const audio = useRef<GameAudio | null>(null)

  useEffect(() => () => {
    const context = audio.current?.context
    audio.current = null
    if (context) void context.close().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (audio.current?.output) audio.current.output.gain.value = Number(sound)
  }, [sound])

  useEffect(() => {
    if (!motionAllowed) setFlight(null)
  }, [motionAllowed])

  const handleMove = useCallback((seat: number, card: Card, geometry: PlayGeometry) => {
    const before = current.current
    const after = playCard(before, seat, card)
    if (!after) return
    current.current = after

    const move = after.lastMove
    const animate = motionAllowed && !document.hidden
    const origin = animate ? geometry.source?.getBoundingClientRect() : undefined
    const landing = animate ? geometry.table?.getBoundingClientRect() : undefined
    const capture = animate && move.captures ? geometry.score?.getBoundingClientRect() : undefined
    setFlight(origin?.width && landing?.width
      ? { card, origin, landing, capture, previousPile: before.table }
      : null)
    setGame(after)

    if (sound) {
      audio.current ??= new GameAudio()
      audio.current.enabled = true
      audio.current.unlock()
      if (after.finished && viewFor(after, 0).winner === 0) audio.current.play('win')
      else audio.current.play(move.bonus === 20 ? 'double' : move.bonus ? 'xeri' : move.captures ? 'sweep' : 'play')
    }
  }, [motionAllowed, sound])

  useEffect(() => {
    if (game.turn !== 1 || game.finished) return
    const timer = window.setTimeout(() => {
      if (current.current !== game) return
      const card = chooseCard(viewFor(game, 1), difficulty)
      if (card) handleMove(1, card, computerSource())
    }, motionAllowed ? 560 : 170)
    return () => window.clearTimeout(timer)
  }, [computerSource, difficulty, game, handleMove, motionAllowed])

  const finishFlight = useCallback((finished: Flight) => {
    setFlight((active) => active === finished ? null : active)
  }, [])

  function restart() {
    const next = newGame(2)
    current.current = next
    setFlight(null)
    setGame(next)
  }

  return { view: viewFor(game, 0), flight: motionAllowed ? flight : null, finishFlight, handleMove, restart }
}
