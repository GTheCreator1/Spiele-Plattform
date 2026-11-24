import type { CambioAction, Target } from '../src/games/ab6super6/engine'
import { HttpError, need } from './http'

function record(value: unknown) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'Ungültige Spielaktion.')
  return value as Record<string, unknown>
}

function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function target(value: unknown): Target {
  const { seat, slot } = record(value)
  need(natural(seat) && natural(slot), 'Ungültiger Kartenplatz.')
  return { seat, slot }
}

export function parseCambio(value: unknown): CambioAction {
  const { type, slot, window, target: selection, seat, targets, swap } = record(value)
  switch (type) {
    case 'peek-start':
    case 'ready':
    case 'draw':
    case 'knock':
    case 'effect-skip':
      return { type }
    case 'discard':
      need(slot === undefined || natural(slot), 'Ungültiger Kartenplatz.')
      return { type, slot }
    case 'throw':
      need(natural(window), 'Ungültiges Reaktionsfenster.')
      return { type, window, target: target(selection) }
    case 'effect-select':
      need(seat === undefined || natural(seat), 'Ungültiger Sitzplatz.')
      need(targets === undefined || (Array.isArray(targets) && targets.length <= 2), 'Ungültige Kartenauswahl.')
      return { type, seat, targets: targets?.map(target) }
    case 'effect-finish':
      need(swap === undefined || typeof swap === 'boolean', 'Ungültige Tauschauswahl.')
      return { type, swap }
    default:
      throw new HttpError(400, 'Unbekannte Kartenaktion.')
  }
}
