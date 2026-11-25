import assert from 'node:assert/strict'
import test from 'node:test'
import { cambioDeck } from '../../src/games/ab6super6/engine.ts'
import { DECK } from '../../vendor/xeri/game/engine.js'
import { auditMatch, commitSecret, viewDigest } from '../../shared/game-match.ts'
import type { GameMove, OnlineGame } from '../../shared/online.ts'
import { digest, roundRandom, shuffleCards, uniformIndex } from '../../shared/random.ts'
import { Room } from '../../shared/room.ts'
import { parseAction } from '../../shared/wire.ts'

const roomId = 'a'.repeat(48)
const token = (seat: number) => seat.toString(16).padStart(48, '0')
const contribution = (seat: number) => seat.toString(16).padStart(64, '0')

function lobby(game: OnlineGame, capacity: number, size = capacity) {
  let time = 5_000
  const room = new Room(roomId, { game, capacity }, 'Host', () => time)
  for (let seat = 1; seat < size; seat++) {
    assert.equal(room.join(token(seat), `Gast ${seat}`), seat)
    room.action(seat, { type: 'lobby-ready', ready: true })
  }
  for (let seat = size; seat < capacity; seat++) room.action(0, { type: 'lobby-bot', seat, enabled: true })
  return { room, advance: (amount: number) => { time += amount; return room.tick() } }
}

function seed(room: Room) {
  room.action(0, { type: 'lobby-start' })
  const ceremony = room.snapshot(0).seeding
  if (!ceremony) return
  const { round } = ceremony
  for (const seat of round.humans.slice(1)) {
    room.contribute(seat, round.id, 'commit', commitSecret(roomId, round, seat, contribution(seat)))
  }
  for (const seat of round.humans.slice(1)) room.contribute(seat, round.id, 'reveal', contribution(seat))
}

test('Tausende sichere Fisher–Yates-Mischungen behalten alle 52 beziehungsweise 55 Karten', () => {
  for (const deck of [DECK, cambioDeck]) {
    const permutations = new Set<string>()
    for (let attempt = 0; attempt < 2000; attempt++) {
      const cards = shuffleCards(deck)
      assert.equal(cards.length, deck.length)
      assert.deepEqual(new Set(cards), new Set(deck))
      permutations.add(cards.join(','))
    }
    assert.equal(permutations.size, 2000)
  }
})

test('Indexauswahl verwirft den überschüssigen Bereich und deckt alle 55 Zielindizes ab', () => {
  const words = [0xffff_ffff, 0xffff_fffe, 2]
  assert.equal(uniformIndex(3, () => words.shift()!), 2)
  assert.equal(words.length, 1)
  assert.equal(uniformIndex(2 ** 32, () => 0xffff_ffff), 0xffff_ffff)
  assert.throws(() => uniformIndex(0), RangeError)
  const random = roundRandom('0'.repeat(64), 'index-test', 0)
  const counts = Array<number>(55).fill(0)
  for (let draw = 0; draw < 55_000; draw++) {
    const index = random.index(55)
    counts[index] = counts[index]! + 1
  }
  assert.ok(counts.every((count) => count > 850 && count < 1150), counts.join(', '))
})

test('Zufallszusagen werden vor dem Reveal fixiert und Geheimnisse bleiben während der Partie beim Host', () => {
  const { room } = lobby('ab6super6', 3)
  room.action(0, { type: 'lobby-start' })
  const { round, commitments } = room.snapshot(1).seeding!
  assert.equal(commitments.length, 1)
  assert.throws(() => room.contribute(1, round.id, 'reveal', contribution(1)), /Zufallsphase/)
  for (const seat of [1, 2]) room.contribute(seat, round.id, 'commit', commitSecret(roomId, round, seat, contribution(seat)))
  assert.equal(room.snapshot(2).seeding?.step, 'reveal')
  assert.equal(room.snapshot(2).seeding?.commitments[0]?.hash, commitments[0]?.hash)
  assert.throws(() => room.contribute(2, round.id, 'reveal', contribution(3)), /passt nicht/)
  for (const seat of [1, 2]) room.contribute(seat, round.id, 'reveal', contribution(seat))
  assert.equal(room.proof(), null)
  for (const seat of [0, 1, 2]) {
    const view = room.snapshot(seat)
    assert.equal(view.phase, 'playing')
    assert.ok(!JSON.stringify(view).includes(contribution(1)))
    assert.ok(view.cambio?.players.every(({ cards }) => cards.every(({ card }) => card === null)))
  }
  room.action(0, { type: 'cambio-play', id: crypto.randomUUID(), match: round.id, version: 0, action: { type: 'peek-start' } })
  assert.equal(room.snapshot(0).cambio?.players[0]?.cards[2]?.card !== null, true)
  assert.equal(room.snapshot(1).cambio?.players[0]?.cards[2]?.card, null)
})

test('verspätete Zufallsbeiträge und unbekannte Spieler ändern keine Partie', () => {
  const { room, advance } = lobby('xeri', 2)
  assert.throws(() => room.action(3, { type: 'lobby-start' }), /kein.*Mitspieler/)
  assert.throws(() => room.action(1, { type: 'lobby-start' }), /Nur wer/)
  room.action(0, { type: 'lobby-start' })
  const { id } = room.snapshot(1).seeding!.round
  assert.equal(advance(36_000), true)
  assert.equal(room.snapshot(1).phase, 'open')
  assert.equal(room.contribute(1, id, 'commit', contribution(1)), false)
})

test('Host und Gäste nutzen dieselbe Spielzugprüfung, getrennte Ansichten und Reconnect', () => {
  const { room } = lobby('xeri', 2)
  seed(room)
  const own = room.snapshot(0)
  const guest = room.snapshot(1)
  assert.equal(own.xeri?.hand.length, 4)
  assert.equal(guest.xeri?.hand.length, 4)
  assert.ok(!guest.xeri?.hand.some((card) => own.xeri?.hand.includes(card)))
  const move = (seat: number): GameMove => ({
    type: 'xeri-play', id: crypto.randomUUID(), match: own.match!, version: 0, card: room.snapshot(seat).xeri!.hand[0]!,
  })
  assert.throws(() => room.action(1, move(1)), /nicht ausspielen/)
  assert.throws(() => room.action(0, move(1)), /nicht ausspielen/)
  assert.throws(() => room.join(token(2), 'Unbekannt'), /läuft bereits/)
  room.disconnect(1)
  assert.throws(() => room.action(0, move(0)), /wartet/)
  assert.equal(room.join(token(1), 'Gast 1'), 1)
  assert.deepEqual(room.snapshot(1).xeri?.hand, guest.xeri?.hand)
  const valid = move(0)
  assert.equal(room.action(0, valid).changed, true)
  assert.equal(room.action(0, valid).changed, false)
  assert.equal(room.snapshot(1).xeri?.version, 1)
  assert.throws(() => room.action(0, { ...valid, version: 1 }), /bereits benutzt/)
})

test('Nachprüfung erkennt veränderte Beiträge, Ansichten, bestätigte Züge und Endwertungen', () => {
  const { room } = lobby('xeri', 4, 2)
  seed(room)
  const initial = room.snapshot(1)
  const observations = new Map([[initial.xeri!.version, viewDigest(initial)]])
  const receipts = new Map<string, string>()
  while (room.snapshot(0).phase === 'playing') {
    const player = room.snapshot(0).xeri!.turn!
    const data = room.snapshot(player)
    const move = {
      type: 'xeri-play', id: crypto.randomUUID(), match: data.match!, version: data.xeri!.version, card: data.xeri!.hand[0]!,
    } satisfies GameMove
    room.action(player, move)
    if (player === 1) receipts.set(move.id, digest(move))
    const next = room.snapshot(1)
    observations.set(next.xeri!.version, viewDigest(next))
  }
  const { proof, events } = room.proof()!
  const end = room.snapshot(1)
  assert.ok(proof)
  auditMatch(roomId, proof, events, 1, observations, receipts, end)
  const changed = structuredClone(proof)
  changed.contributions[0]!.secret = 'f'.repeat(64)
  assert.throws(() => auditMatch(roomId, changed, events, 1, observations, receipts, end), /Zusage/)
  const wrongView = new Map(observations).set(0, 'unterschiedlich')
  assert.throws(() => auditMatch(roomId, proof, events, 1, wrongView, receipts, end), /Abweichender/)
  const wrongMove = new Map(receipts).set(receipts.keys().next().value!, 'unterschiedlich')
  assert.throws(() => auditMatch(roomId, proof, events, 1, observations, wrongMove, end), /bestätigter Zug/)
  const wrongEnd = structuredClone(end)
  wrongEnd.xeri!.scores[0].total++
  assert.throws(() => auditMatch(roomId, proof, events, 1, observations, receipts, wrongEnd), /Endwertung/)
})

test('Chat bindet Absender an Sitz und begrenzt Wiederholungen, Länge und Frequenz', () => {
  const { room, advance } = lobby('xeri', 2)
  const action = { type: 'chat', id: crypto.randomUUID(), text: '<mark> & ♥' } as const
  const sent = room.action(1, action).message
  assert.equal(sent?.from.name, 'Gast 1')
  assert.equal(sent?.text, action.text)
  assert.equal(room.action(1, action).message, undefined)
  for (let message = 0; message < 5; message++) room.action(1, { ...action, id: crypto.randomUUID() })
  assert.throws(() => room.action(1, { ...action, id: crypto.randomUUID() }), /zu schnell/)
  advance(10_000)
  assert.throws(() => room.action(1, { ...action, text: 'x'.repeat(501) }), /500/)
  assert.ok(room.action(1, { ...action, id: crypto.randomUUID() }).message)
  assert.throws(() => parseAction({ ...action, from: 0 }))
  assert.throws(() => parseAction({ type: 'cambio-play', id: action.id, match: 'b'.repeat(32), version: 0,
    action: { type: 'throw', window: 1, target: { seat: 6, slot: -1 } } }))
})
