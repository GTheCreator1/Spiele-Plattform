import { chooseCard } from '../vendor/xeri/game/ai.js'
import { DECK, newGame, playCard, viewFor } from '../vendor/xeri/game/engine.js'
import type { GameState } from '../vendor/xeri/game/engine.js'
import { advanceCambioClock, newCambio, playCambio, viewCambio } from '../src/games/ab6super6/engine.ts'
import type { CambioState } from '../src/games/ab6super6/engine.ts'
import type { Commitment, Contribution, Lobby, MatchEvent, ProofStart, Round } from './online.ts'
import { digest, roundRandom, shuffleCards } from './random.ts'

type State = { type: 'xeri'; data: GameState } | { type: 'ab6super6'; data: CambioState }
export const maxAuditEvents = 4096

function requireMove(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function commitSecret(room: string, round: Round, seat: number, secret: string) {
  return digest(['stichrunde-commit-v1', room, round, seat, secret])
}

export function seedFor(room: string, round: Round, commits: Commitment[], contributions: Contribution[]) {
  requireMove(round.humans.length === commits.length && commits.length === contributions.length,
    'Die Zufallsbeiträge fehlen.')
  for (const [index, seat] of round.humans.entries()) {
    const value = contributions[index]
    requireMove(value?.seat === seat && commits[index]?.seat === seat && commits[index]?.hash === commitSecret(room, round, seat, value.secret),
      'Der Zufallsbeitrag stimmt nicht mit der Zusage überein.')
  }
  return digest(['stichrunde-round-v1', room, round, contributions])
}

function botTurns(game: GameState, round: Round, seed: string) {
  let state = game
  while (state.turn !== null && !round.humans.includes(state.turn)) {
    const { fraction } = roundRandom(seed, 'xeri-bot', state.version)
    const card = chooseCard(viewFor(state, state.turn), 'normal', fraction)
    const next = card && playCard(state, state.turn, card)
    requireMove(next, 'Der Bot konnte nicht spielen.')
    state = next
  }
  return state
}

export function newMatch(round: Round, seed: string): State {
  const { index } = roundRandom(seed, 'deal', 0)
  if (round.game === 'ab6super6') return { type: 'ab6super6', data: newCambio(round.capacity, index) }
  const seats = round.capacity === 4 ? 4 : 2
  return { type: 'xeri', data: botTurns(newGame(seats, shuffleCards(DECK, index)), round, seed) }
}

export function matchFinished(state: State) {
  return state.type === 'xeri' ? state.data.finished : state.data.phase === 'finished'
}

export function applyMatchEvent(state: State, round: Round, seed: string, event: MatchEvent): State {
  if ('tick' in event) {
    requireMove(state.type === 'ab6super6', 'Für diese Partie gibt es keine Frist.')
    const next = advanceCambioClock(state.data, event.at)
    return next === state.data ? state : { type: 'ab6super6', data: next }
  }
  const { move, seat, at } = event
  requireMove(round.humans.includes(seat) && move.match === round.id && !matchFinished(state), 'Dieser Spielzug gehört zu keiner laufenden Partie.')
  requireMove(move.version <= state.data.version, 'Dieser Spielstand existiert noch nicht.')
  if (state.type === 'xeri') {
    requireMove(move.type === 'xeri-play', 'Diese Aktion gehört zu einem anderen Spiel.')
    requireMove(move.version === state.data.version, 'Der Spielstand hat sich geändert.')
    const next = playCard(state.data, seat, move.card)
    requireMove(next, 'Diese Karte kannst du gerade nicht ausspielen.')
    return { type: 'xeri', data: botTurns(next, round, seed) }
  }
  requireMove(move.type === 'cambio-play', 'Diese Aktion gehört zu einem anderen Spiel.')
  const action = move.action
  requireMove(move.version === state.data.version || action.type === 'throw' || action.type === 'ready' ||
    action.type === 'peek-start', 'Der Spielstand hat sich geändert.')
  const { index } = roundRandom(seed, 'cambio-move', state.data.version)
  return { type: 'ab6super6', data: playCambio(state.data, seat, action, at, index) }
}

export function privateViews(state: State | null, seat: number, now: number) {
  return {
    xeri: state?.type === 'xeri' ? viewFor(state.data, seat) : null,
    cambio: state?.type === 'ab6super6' ? viewCambio(state.data, seat, now) : null,
  }
}

export function viewDigest(lobby: Pick<Lobby, 'xeri' | 'cambio'>) {
  const { cambio, xeri } = lobby
  return digest(xeri ?? (cambio ? { ...cambio, now: 0 } : null))
}

export function auditMatch(room: string, proof: ProofStart, events: MatchEvent[], seat: number,
  observations: ReadonlyMap<number, string>, receipts: ReadonlyMap<string, string>, final: Lobby) {
  const { round, commitments, contributions } = proof
  requireMove(final.match === round.id && final.phase === 'finished' && round.humans.includes(seat) &&
    proof.events === events.length && events.length <= maxAuditEvents, 'Das Prüfprotokoll ist unvollständig.')
  const seed = seedFor(room, round, commitments, contributions)
  let state = newMatch(round, seed)
  const pending = new Map(observations)
  const moves = new Set<string>()
  const mine = new Map(receipts)
  let last = 0
  function verifyObservation() {
    const observed = pending.get(state.data.version)
    requireMove(!observed || observed === viewDigest(privateViews(state, seat, 0)), 'Abweichender Karten- oder Spielstand.')
    pending.delete(state.data.version)
  }
  verifyObservation()
  for (const event of events) {
    requireMove(event.at >= last, 'Die Reihenfolge der Spielaktionen ist ungültig.')
    last = event.at
    if ('move' in event) {
      const id = `${event.seat}/${event.move.id}`
      requireMove(!moves.has(id), 'Ein Spielzug wurde wiederholt.')
      moves.add(id)
      if (event.seat === seat && mine.has(event.move.id)) {
        requireMove(mine.get(event.move.id) === digest(event.move), 'Ein bestätigter Zug wurde verändert.')
        mine.delete(event.move.id)
      }
    }
    const previous = state
    state = applyMatchEvent(state, round, seed, event)
    requireMove(state !== previous, 'Ein Protokolleintrag hat keinen gültigen Zustandsübergang.')
    verifyObservation()
  }
  requireMove(!mine.size && !pending.size && matchFinished(state) && viewDigest(final) === viewDigest(privateViews(state, seat, 0)),
    'Das Prüfergebnis stimmt nicht mit der Endwertung überein.')
}
