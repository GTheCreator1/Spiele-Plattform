export class GameAudio {
  enabled: boolean
  context?: AudioContext
  output?: GainNode
  unlock(): void
  play(effect: 'play' | 'sweep' | 'xeri' | 'double' | 'win'): void
}
