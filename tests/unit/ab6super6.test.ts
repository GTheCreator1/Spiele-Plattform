import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceCambioClock, cambioDeck, cambioPoints, newCambio, playCambio, scoreCambio, viewCambio,
} from '../../src/games/ab6super6/engine.ts'
import type { CambioAction, CambioCard, CambioState } from '../../src/games/ab6super6/engine.ts'

const rng = () => 0.45
const use = (state: CambioState, seat: number, action: CambioAction, now = 0) => playCambio(state, seat, action, now, rng)

function arranged(cards: CambioCard[][], draw: CambioCard[] = [], discard: CambioCard[] = []) {
  const state = newCambio(cards.length, rng)
  state.phase = 'playing'
  state.players = cards.map((hand) => ({ cards: hand.map((card, slot) => ({ card, slot })), nextSlot: hand.length, ready: true, peeked: true }))
  const used = new Set([...cards.flat(), ...draw, ...discard])
  assert.equal(used.size, cards.flat().length + draw.length + discard.length)
  state.deck = [...cambioDeck.filter((card) => !used.has(card)), ...draw.toReversed()]
  state.discard = [...discard]
  if (discard.length) state.reaction = { id: 1, until: null }
  return state
}

function intact(state: CambioState) {
  const cards = [...state.deck, ...state.discard, ...state.players.flatMap(({ cards }) => cards.map(({ card }) => card))]
  if (state.drawn) cards.push(state.drawn.card)
  assert.equal(cards.length, 55)
  assert.deepEqual(new Set(cards), new Set(cambioDeck))
}

test('55 eindeutige Karten, zwei bis sechs Spieler und vier verdeckte Startkarten', () => {
  for (let size = 2; size <= 6; size++) {
    const state = newCambio(size, rng)
    assert.equal(state.deck.length, 55 - 4 * size)
    assert.ok(state.players.every(({ cards }) => cards.length === 4))
    assert.ok(viewCambio(state, 0).players.every(({ cards }) => cards.every(({ card }) => card === null)))
    intact(state)
  }
  assert.throws(() => newCambio(1), /zwei bis sechs/)
  assert.throws(() => newCambio(7), /zwei bis sechs/)
  assert.deepEqual(['AS', '7D', '10C', 'JS', 'QH', 'KS', 'KC', 'KH', 'KD', 'joker-1', 'joker-2', 'joker-3'].map((card) => cambioPoints(card as CambioCard)),
    [1, 7, 10, 10, 10, 10, 10, -1, -1, 0, 0, 0])
})

test('nur die beiden unteren eigenen Karten sind einmalig sichtbar', () => {
  let state = use(newCambio(2, rng), 0, { type: 'peek-start' })
  assert.deepEqual(viewCambio(state, 0).players[0]!.cards.map(({ card }) => Boolean(card)), [false, false, true, true])
  assert.ok(viewCambio(state, 1).players[0]!.cards.every(({ card }) => card === null))
  assert.throws(() => use(state, 0, { type: 'peek-start' }), /bereits/)
  state = use(state, 0, { type: 'ready' })
  assert.ok(viewCambio(state, 0).players[0]!.cards.every(({ card }) => card === null))
  state = use(state, 1, { type: 'ready' })
  assert.equal(state.phase, 'playing')
})

test('verdecktes Ziehen und erlaubter Tausch in stabilen Auslageplatz', () => {
  let state = arranged([['AD', '3D'], ['2C']], ['4H'])
  assert.throws(() => use(state, 1, { type: 'draw' }), /nicht am Zug/)
  state = use(state, 0, { type: 'draw' })
  assert.equal(viewCambio(state, 0).drawn, '4H')
  assert.equal(viewCambio(state, 1).drawn, null)
  assert.throws(() => use(state, 0, { type: 'knock' }), /Beginn/)
  state = use(state, 0, { type: 'discard', slot: 1 })
  assert.equal(state.players[0]!.cards[1]!.card, '4H')
  assert.equal(state.discard.at(-1), '3D')
  assert.equal(state.turn, 1)
  intact(state)
})

test('eine 6 gibt auch einer Person ohne Karten eine verdeckte Karte', () => {
  let state = arranged([['AD'], []], ['6H', '2S'])
  state = use(use(state, 0, { type: 'draw' }), 0, { type: 'discard' })
  state = use(state, 0, { type: 'effect-select', seat: 1 })
  assert.equal(state.players[1]!.cards[0]!.card, '2S')
  assert.equal(viewCambio(state, 1).players[1]!.cards[0]!.card, null)
  intact(state)
})

test('7 und 8 zeigen eigene Karten, 9 und 10 zeigen fremde Karten', () => {
  for (const card of ['7H', '8H', '9H', '10H'] as const) {
    let state = arranged([['AD'], ['2S']], [card])
    state = use(use(state, 0, { type: 'draw' }), 0, { type: 'discard' })
    const seat = card === '7H' || card === '8H' ? 0 : 1
    assert.throws(() => use(state, 0, { type: 'effect-select', targets: [{ seat: 1 - seat, slot: 0 }] }), /Wähle/)
    state = use(state, 0, { type: 'effect-select', targets: [{ seat, slot: 0 }] })
    assert.equal(viewCambio(state, 0).players[seat]!.cards[0]!.card, seat === 0 ? 'AD' : '2S')
    assert.equal(viewCambio(state, 1).players[seat]!.cards[0]!.card, null)
    state = use(state, 0, { type: 'effect-finish' })
    assert.equal(viewCambio(state, 0).players[seat]!.cards[0]!.card, null)
  }
})

test('Bube und Dame tauschen blind, schwarze Könige privat und optional', () => {
  for (const card of ['JH', 'QH', 'KS', 'KC'] as const) {
    let state = arranged([['AD'], ['2S'], ['3H']], [card])
    state = use(use(state, 0, { type: 'draw' }), 0, { type: 'discard' })
    state = use(state, 0, { type: 'effect-select', targets: [{ seat: 1, slot: 0 }, { seat: 2, slot: 0 }] })
    if (card.startsWith('K')) {
      assert.equal(viewCambio(state, 0).players[1]!.cards[0]!.card, '2S')
      assert.equal(viewCambio(state, 1).players[1]!.cards[0]!.card, null)
      assert.throws(() => use(state, 2, { type: 'throw', window: state.reaction!.id, target: { seat: 1, slot: 0 } }), /Spezialaktion/)
      const kept = use(state, 0, { type: 'effect-finish', swap: false })
      assert.equal(kept.players[1]!.cards[0]!.card, '2S')
      state = use(state, 0, { type: 'effect-finish', swap: true })
    }
    assert.equal(state.players[1]!.cards[0]!.card, '3H')
    assert.equal(state.players[2]!.cards[0]!.card, '2S')
    intact(state)
  }
})

test('richtige Reinwürfe lösen Effekte chronologisch aus und verlängern die Frist nicht', () => {
  let state = arranged([['8C'], ['8D'], ['8S']], ['8H', 'AH', '2S', '4S'])
  state = use(use(state, 0, { type: 'draw' }), 0, { type: 'discard' })
  const window = state.reaction!.id
  state = use(state, 1, { type: 'draw' }, 400)
  state = use(state, 0, { type: 'throw', window, target: { seat: 0, slot: 0 } }, 401)
  state = use(state, 2, { type: 'throw', window, target: { seat: 1, slot: 0 } }, 402)
  assert.deepEqual(state.effects.map(({ seat }) => seat), [0, 0, 2])
  assert.equal(state.players[1]!.cards.length, 2)
  assert.equal(state.players[0]!.cards.length, 0)
  assert.equal(state.reaction!.until, 2400)
  assert.throws(() => use(state, 2, { type: 'effect-skip' }, 403), /Reihe/)
  assert.throws(() => use(state, 2, { type: 'throw', window, target: { seat: 0, slot: 0 } }, 404), /nicht mehr/)
  assert.throws(() => use(state, 2, { type: 'throw', window, target: { seat: 2, slot: 0 } }, 2400), /geschlossen/)
  state = use(use(use(state, 0, { type: 'effect-skip' }, 450), 0, { type: 'effect-skip' }, 460), 2, { type: 'effect-skip' }, 470)
  assert.equal(state.effects.length, 0)
  intact(state)
})

test('eine falsche Spezialkarte bestimmt den nächsten Vergleich und löst keinen Effekt aus', () => {
  let state = arranged([['6C'], ['6D']], ['4C', '5D'], ['3H'])
  state = use(state, 1, { type: 'throw', window: 1, target: { seat: 0, slot: 0 } })
  assert.equal(state.discard.at(-1), '6C')
  assert.equal(state.effects.length, 0)
  assert.equal(state.players[0]!.cards.length, 0)
  assert.equal(state.players[1]!.cards.length, 3)
  state = use(state, 1, { type: 'throw', window: 1, target: { seat: 1, slot: 0 } })
  assert.equal(state.effects[0]!.kind, 'add')
  intact(state)
})

test('Joker passen zusammen und rote Könige haben keinen eigenen Effekt', () => {
  let state = arranged([['joker-1', 'KH'], ['joker-2']], ['KD'], ['joker-3'])
  state = use(state, 0, { type: 'throw', window: 1, target: { seat: 0, slot: 0 } })
  assert.equal(state.lastThrow?.correct, true)
  assert.equal(state.effects.length, 0)
  state = use(state, 0, { type: 'draw' }, 100)
  state = use(state, 0, { type: 'discard' }, 2100)
  assert.equal(state.discard.at(-1), 'KD')
  assert.equal(state.effects.length, 0)
  intact(state)
})

test('Klopfen prüft keine Punkte vorab und alle sechs Spieler erhalten genau einen letzten Zug', () => {
  let state = arranged([['10D'], [], ['2S'], ['3C'], ['4S'], ['5D']], ['AS', '2H', '3H', '4H', '5H', 'AD'])
  state = use(state, 0, { type: 'knock' })
  assert.deepEqual(state.final, { knocker: 0, remaining: 6 })
  for (const [step, seat] of [1, 2, 3, 4, 5, 0].entries()) {
    assert.equal(state.turn, seat)
    state = use(state, seat, { type: 'draw' }, step * 3000)
    state = use(state, seat, { type: 'discard' }, step * 3000 + 2000)
    assert.equal(state.final?.remaining, 5 - step)
    assert.equal(viewCambio(state, seat).result, null)
  }
  assert.equal(state.reaction?.until, 19000)
  assert.equal(advanceCambioClock(state, 18999), state)
  state = advanceCambioClock(state, 19000)
  assert.equal(state.phase, 'finished')
  assert.equal(state.result?.[0]?.outcome, 'loss')
  assert.equal(state.result?.[0]?.invalidKnock, true)
  assert.equal(state.result?.[1]?.outcome, 'win')
  intact(state)
})

test('letzter Reinwurf und Effekt müssen vor der Wertung verarbeitet werden', () => {
  let state = arranged([['8C', 'AD'], ['2C']], ['8H'])
  state.final = { knocker: 0, remaining: 1 }
  state = use(use(state, 0, { type: 'draw' }, 50), 0, { type: 'discard' }, 100)
  state = use(state, 0, { type: 'throw', window: state.reaction!.id, target: { seat: 0, slot: 0 } }, 2099)
  assert.equal(state.reaction?.until, 2100)
  state = advanceCambioClock(state, 2100)
  assert.equal(state.phase, 'playing')
  assert.equal(state.reaction, null)
  state = use(use(state, 0, { type: 'effect-skip' }, 2110), 0, { type: 'effect-skip' }, 2120)
  assert.equal(state.phase, 'finished')
  intact(state)
})

test('Gleichstände, rote Könige und ungültige Klopfer in der Wertung', () => {
  const score = (hands: CambioCard[][]) => scoreCambio(arranged(hands).players, 0)
  assert.deepEqual(score([['AS'], ['AH'], ['2H']]).map(({ outcome }) => outcome), ['loss', 'win', 'loss'])
  assert.deepEqual(score([['AS'], ['AH'], ['AD']]).map(({ outcome }) => outcome), ['loss', 'tie', 'tie'])
  assert.deepEqual(score([['KH'], ['joker-1'], ['AC']]).map(({ outcome }) => outcome), ['win', 'loss', 'loss'])
  assert.deepEqual(score([['7H'], ['8H'], ['9H']]).map(({ outcome }) => outcome), ['loss', 'win', 'loss'])
})

test('nur verfügbare Strafkarten ausgeben und fehlende Karten nachreichen', () => {
  const keep = ['2H', '4H', '5H'] as const
  let state = arranged([['3H'], cambioDeck.filter((card) => card !== '3H' && !keep.some((value) => value === card))], ['5H'], ['2H', '4H'])
  state = use(state, 0, { type: 'draw' })
  state = use(state, 0, { type: 'throw', window: 1, target: { seat: 0, slot: 0 } }, 1)
  assert.equal(state.discard.at(-1), '3H')
  assert.equal(state.debts.length, 0)
  assert.equal(state.players[0]!.cards.length, 2)
  intact(state)

  state = arranged([['3H'], cambioDeck.filter((card) => card !== '3H' && card !== '4H' && card !== '5H')], ['5H'], ['4H'])
  state = use(state, 0, { type: 'draw' })
  state = use(state, 0, { type: 'throw', window: 1, target: { seat: 0, slot: 0 } }, 2)
  assert.deepEqual(state.debts, [{ seat: 0, count: 1 }])
  state = use(state, 0, { type: 'discard' }, 2000)
  assert.equal(state.discard.at(-1), '5H')
  assert.equal(state.debts.length, 0)
  assert.equal(state.players[0]!.cards.length, 2)
  intact(state)
})

test('letzte Strafkarte fehlt und Endwertung zählt ausschließlich ausgeteilte Karten', () => {
  let state = arranged([['AD', '2H'], cambioDeck.filter((card) => !['AD', '2H', '3H', '4H'].includes(card))], [], ['3H', '4H'])
  state.final = { knocker: 0, remaining: 0 }
  state.reaction = { id: 1, until: 2000 }
  // The previous two cards can pay both penalties. Remove one available card first
  // by moving it to the opponent's rack, leaving one physical penalty card.
  state.players[1]!.cards.push({ slot: state.players[1]!.nextSlot++, card: state.discard.shift()! })
  state = use(state, 0, { type: 'throw', window: 1, target: { seat: 0, slot: 1 } }, 1_999)
  assert.deepEqual(state.debts, [{ seat: 0, count: 1 }])
  assert.equal(state.players[0]!.cards.length, 2)
  assert.equal(viewCambio(state, 0).result, null)
  state = advanceCambioClock(state, 2_000)
  assert.equal(state.phase, 'finished')
  assert.deepEqual(state.result?.[0], { seat: 0, total: 5, invalidKnock: false, outcome: 'win' })
  assert.equal(viewCambio(state, 0).unpaidPenalties, 1)
  assert.equal(state.deck.length, 0)
  intact(state)
})
