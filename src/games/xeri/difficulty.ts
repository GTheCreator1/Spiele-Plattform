export const difficulties = {
  easy: 'Leicht',
  normal: 'Normal',
  hard: 'Schwer',
}

export type Difficulty = keyof typeof difficulties

export function parseDifficulty(value: string | null): Difficulty {
  return value === 'easy' || value === 'hard' ? value : 'normal'
}
