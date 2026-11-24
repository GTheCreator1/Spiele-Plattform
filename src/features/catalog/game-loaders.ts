import type { GameId } from './games'

export const loadGameDetail = () => import('./GameDetail')
export const loadXeriTable = () => import('../../games/xeri/XeriTable')

export function preloadGame(id: GameId) {
  void loadGameDetail().catch(() => undefined)
  if (id === 'xeri') preloadXeriTable()
}

export function preloadXeriTable() {
  void loadXeriTable().catch(() => undefined)
}
