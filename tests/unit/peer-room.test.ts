import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'valibot'
import { cambioDeck } from '../../src/games/ab6super6/engine.ts'
import { newTheslibbi, theslibbiHandSize, theslibbiSeats } from '../../src/games/theslibbi/engine.ts'
import { DECK } from '../../vendor/xeri/game/engine.js'
import { auditMatch, commitSecret, viewDigest } from '../../shared/game-match.ts'
import type { GameMove, OnlineGame } from '../../shared/online.ts'
import { digest, roundRandom, shuffleCards, uniformIndex } from '../../shared/random.ts'
import { Room } from '../../shared/room.ts'
import { fromHost, parseAction } from '../../shared/wire.ts'

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

test('THESLIBBI lässt zwei bis vier Menschen in den Raum und behält den Sitz beim Wiedereinstieg', () => {
  for (const capacity of [2, 3, 4]) {
    const { room } = lobby('theslibbi', capacity)
    for (let seat = 0; seat < capacity; seat++) {
      const snapshot = room.snapshot(seat)
      assert.equal(snapshot.self, seat)
      assert.ok(snapshot.seats.every((member) => member.player && member.online && member.ready))
      assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: snapshot }))
    }
    assert.throws(() => room.join(token(capacity), 'Zusätzlicher Gast'), /voll/)
    const player = room.snapshot(1).seats[1]!.player
    room.disconnect(1)
    assert.equal(room.snapshot(0).seats[1]!.online, false)
    assert.equal(room.join(token(1), 'Gast 1'), 1)
    assert.deepEqual(room.snapshot(1).seats[1]!.player, player)
    assert.equal(room.snapshot(1).seats[1]!.ready, true)
  }
  for (const capacity of [1, 5, 6]) {
    const settings = { game: 'theslibbi' as const, capacity }
    assert.throws(() => new Room(roomId, settings, 'Host', () => 0), /Wähle ein Spiel/)
    assert.throws(() => parseAction({ type: 'lobby-settings', settings }))
  }
})

test('THESLIBBI beginnt erst nach Bereitschaft aller Menschen und bereitet die gemeinsame Mischung vor', () => {
  const room = new Room(roomId, { game: 'xeri', capacity: 2 }, 'Host', () => 0)
  const settings = { game: 'theslibbi' as const, capacity: 4 }
  room.action(0, parseAction({ type: 'lobby-settings', settings }))
  assert.throws(() => room.action(0, { type: 'lobby-bot', seat: 1, enabled: true }), /kein Bot/)
  assert.throws(() => room.action(0, { type: 'lobby-start' }), /verbunden und bereit/)
  for (let seat = 1; seat < settings.capacity; seat++) {
    room.join(token(seat), `Gast ${seat}`)
    room.action(seat, { type: 'lobby-ready', ready: true })
  }
  const before = room.snapshot(0)
  assert.throws(() => room.action(1, { type: 'lobby-start' }), /Nur wer/)
  assert.deepEqual(room.snapshot(0), before)
  room.action(0, { type: 'lobby-start' })
  const preparing = room.snapshot(1)
  assert.equal(preparing.phase, 'seeding')
  assert.equal(preparing.seeding?.round.game, 'theslibbi')
  assert.deepEqual(preparing.seeding?.round.humans, [0, 1, 2, 3])
  assert.equal(preparing.theslibbi, undefined)
  assert.equal(room.proof(), null)
})

test('Wire-Prüfung verwirft Bot-Sitze und fremde Partiephasen für THESLIBBI', () => {
  const room = new Room(roomId, { game: 'theslibbi', capacity: 2 }, 'Host', () => 0)
  const open = room.snapshot(0)
  const forgedSeats = open.seats.map((seat) => seat.player ? seat : { ...seat, bot: true, online: true, ready: true })
  const snapshot = (lobby: unknown) => parse(fromHost, { type: 'snapshot', lobby })
  assert.throws(() => snapshot({ ...open, seats: forgedSeats }))

  const xeri = lobby('xeri', 2).room
  xeri.action(0, { type: 'lobby-start' })
  const seeding = xeri.snapshot(0)
  assert.doesNotThrow(() => snapshot(seeding))
  assert.throws(() => snapshot({ ...seeding, game: 'theslibbi' }))
  assert.throws(() => snapshot({ ...seeding, seeding: {
    ...seeding.seeding, round: { ...seeding.seeding!.round, game: 'theslibbi' },
  } }))
})

test('THESLIBBI mischt unabhängige Austeilungen mit vier eindeutigen Karten pro Hand', () => {
  for (const size of theslibbiSeats) {
    const deals = new Set<string>()
    for (let attempt = 0; attempt < 80; attempt++) {
      const { hands } = newTheslibbi(size)
      assert.equal(hands.length, size)
      for (const hand of hands) {
        assert.equal(hand.length, theslibbiHandSize)
        assert.ok(hand.every((card, index) => card > (hand[index - 1] ?? 0) && card <= 100))
      }
      assert.equal(new Set(hands.flat()).size, size * theslibbiHandSize)
      deals.add(JSON.stringify(hands))
    }
    assert.equal(deals.size, 80)
  }
})

function numberMove(room: Room, seat: number, card: number) {
  const { match, theslibbi } = room.snapshot(seat)
  return { type: 'theslibbi-play', id: crypto.randomUUID(), match: match!, version: theslibbi!.version, card } as const
}

function numberDeal(room: Room, size: number) {
  return Array.from({ length: size }, (_, seat) =>
    room.snapshot(seat).theslibbi!.hand.map((card) => ({ seat, card })),
  ).flat().sort((first, second) => first.card - second.card)
}

test('THESLIBBI spielt mit zwei, drei und vier Personen aufsteigend bis zum nachprüfbaren Sieg', () => {
  for (const size of theslibbiSeats) {
    const { room } = lobby('theslibbi', size)
    seed(room)
    const seats = Array.from({ length: size }, (_, seat) => seat)
    const observations = seats.map(() => new Map<number, string>())
    const receipts = seats.map(() => new Map<string, string>())
    const dealt = numberDeal(room, size)
    const played: number[] = []
    for (const { seat, card } of dealt) {
      for (const observer of seats) {
        const snapshot = room.snapshot(observer)
        assert.deepEqual(snapshot.theslibbi!.played, played)
        assert.deepEqual(snapshot.theslibbi!.hand, dealt.filter((entry) =>
          entry.seat === observer && !played.includes(entry.card)).map((entry) => entry.card))
        observations[observer]!.set(snapshot.theslibbi!.version, viewDigest(snapshot))
        assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: snapshot }))
      }
      assert.equal(room.proof(), null)
      const move = numberMove(room, seat, card)
      assert.equal(room.action(seat, move).changed, true)
      receipts[seat]!.set(move.id, digest(move))
      played.push(card)
    }
    const { proof, events } = room.proof()!
    assert.ok(proof)
    for (const seat of seats) {
      const final = room.snapshot(seat)
      assert.equal(final.phase, 'finished')
      assert.equal(final.theslibbi!.outcome, 'win')
      assert.deepEqual(final.theslibbi!.hand, [])
      assert.deepEqual(final.theslibbi!.played, played)
      assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: final }))
      assert.doesNotThrow(() => auditMatch(room.id, proof, events, seat, observations[seat]!, receipts[seat]!, final))
    }
  }
})

test('THESLIBBI verarbeitet konkurrierende Züge einmal und hält die Hände bei Wiederverbindung', () => {
  const { room } = lobby('theslibbi', 3)
  seed(room)
  const dealt = numberDeal(room, 3)
  const first = dealt[0]!
  const other = dealt.find(({ seat }) => seat !== first.seat)!
  const move = numberMove(room, first.seat, first.card)
  const stale = numberMove(room, other.seat, other.card)
  const chat = { type: 'chat', id: crypto.randomUUID(), text: 'Test' } as const
  assert.throws(() => room.action(other.seat, chat), /Chat pausiert/)
  assert.deepEqual(room.chatHistory(), [])
  assert.throws(() => room.action(other.seat, numberMove(room, other.seat, first.card)), /deine kleinste/)
  assert.equal(room.snapshot(0).theslibbi?.lives, 3)
  assert.equal(room.action(first.seat, move).changed, true)
  assert.equal(room.action(first.seat, move).changed, false)
  assert.throws(() => room.action(first.seat, { ...move, card: other.card }), /Aktions-ID/)
  assert.throws(() => room.action(other.seat, stale), /Spielstand hat sich geändert/)
  assert.equal(room.snapshot(0).theslibbi?.lives, 3)
  assert.deepEqual(room.snapshot(0).theslibbi?.played, [first.card])

  const guest = room.snapshot(1)
  const next = dealt[1]!
  const nextMove = numberMove(room, next.seat, next.card)
  room.disconnect(1)
  assert.throws(() => room.action(next.seat, nextMove), /wartet auf|keinem verbundenen/)
  assert.equal(room.join(token(1), 'Gast 1'), 1)
  assert.equal(room.snapshot(1).match, guest.match)
  assert.deepEqual(room.snapshot(1).theslibbi, guest.theslibbi)
  assert.equal(room.action(next.seat, nextMove).changed, true)
})

test('THESLIBBI zählt Fehlversuche, lässt die Ablage unverändert und hält ungespielte Hände privat', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  const [smallest, ...rest] = numberDeal(room, 2)
  const wrong = rest.find(({ seat }) => seat !== smallest!.seat)!
  const start = room.snapshot(wrong.seat)
  const firstMistake = numberMove(room, wrong.seat, wrong.card)
  room.action(wrong.seat, firstMistake)
  assert.equal(room.snapshot(0).theslibbi?.lives, 1)
  assert.equal(room.action(wrong.seat, firstMistake).changed, false)
  room.action(wrong.seat, numberMove(room, wrong.seat, wrong.card))
  assert.deepEqual(room.proof(), { match: start.match, proof: null, events: [] })
  for (const seat of [0, 1]) {
    const final = room.snapshot(seat)
    const view = final.theslibbi!
    assert.equal(final.phase, 'finished')
    assert.equal(view.outcome, 'loss')
    assert.equal(view.lives, 0)
    assert.equal(view.version, 2)
    assert.deepEqual(view.played, [])
    assert.equal(view.hand.length, theslibbiHandSize)
    assert.ok(!view.hand.includes(seat === wrong.seat ? smallest!.card : wrong.card))
    assert.deepEqual(view.last, { seat: wrong.seat, kind: 'mistake' })
    assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: final }))
  }
  assert.deepEqual(room.snapshot(wrong.seat).theslibbi?.hand, start.theslibbi?.hand)
  assert.throws(() => room.action(wrong.seat, numberMove(room, wrong.seat, wrong.card)), /Sortierrunde ist beendet/)
  assert.equal(room.action(wrong.seat, { type: 'chat', id: crypto.randomUUID(), text: 'Neue Runde?' }).message?.text, 'Neue Runde?')
  room.action(0, { type: 'lobby-rematch' })
  assert.equal(room.snapshot(0).theslibbi, undefined)
  assert.equal(room.snapshot(1).seats[1]!.ready, false)
})

test('THESLIBBI-Protokoll lehnt Übertragung fremder Hände und widersprüchliche Spielansichten ab', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  const current = room.snapshot(0)
  const view = current.theslibbi!
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, hands: [view.hand] } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, hand: [...view.hand].reverse() } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, lives: 1 } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, phase: 'finished' } }))
  assert.throws(() => parseAction(numberMove(room, 0, 101)))
})

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

test('ein Wiedereinstieg während der Zufallsphase behält den Sitz und den festgelegten Beitrag', () => {
  const { room } = lobby('xeri', 2)
  room.action(0, { type: 'lobby-start' })
  const { round } = room.snapshot(1).seeding!
  const hash = commitSecret(roomId, round, 1, contribution(1))
  room.contribute(1, round.id, 'commit', hash)
  room.disconnect(1)
  assert.equal(room.snapshot(0).phase, 'seeding')
  assert.equal(room.join(token(1), 'Gast 1'), 1)
  assert.equal(room.snapshot(1).seeding?.commitments[1]?.hash, hash)
  assert.equal(room.contribute(1, round.id, 'commit', hash), false)
  room.contribute(1, round.id, 'reveal', contribution(1))
  assert.equal(room.snapshot(1).phase, 'playing')
})

test('Wire-Prüfung verwirft widersprüchliche Xeri-Karten und sichtbare fremde ab6super6-Startkarten', () => {
  const xeri = lobby('xeri', 2).room
  seed(xeri)
  const xeriView = xeri.snapshot(1)
  assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: xeriView }))
  xeriView.xeri!.hand[0] = xeriView.xeri!.table[0]!
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: xeriView }))

  const cambio = lobby('ab6super6', 2).room
  seed(cambio)
  const state = cambio.snapshot(1)
  assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: state }))
  state.cambio!.players[0]!.cards[2]!.card = '6S'
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: state }))
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
