import type { Card, GameView } from './engine.js'

export function chooseCard(view: GameView, difficulty: 'easy' | 'normal' | 'hard', random?: () => number): Card | null
