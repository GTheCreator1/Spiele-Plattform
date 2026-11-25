import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'valibot'
import { cambioDeck } from '../../src/games/ab6super6/engine.ts'
import { newTheslibbi, playTheslibbi, theslibbiDeckSize, theslibbiSeats, viewTheslibbi } from '../../src/games/theslibbi/engine.ts'
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

test('THESLIBBI mischt die Startausteilung mit einer Karte pro Person ohne Duplikate', () => {
  for (const size of theslibbiSeats) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const { hands, level } = newTheslibbi(size)
      assert.equal(level, 1)
      assert.deepEqual(hands.map((hand) => hand.length), Array<number>(size).fill(1))
      const cards = hands.flat()
      assert.ok(cards.every((card) => card >= 1 && card <= 100))
      assert.equal(new Set(cards).size, size)
    }
  }
})

test('THESLIBBI mischt erst mit der letzten Karte und zieht danach aus einer neuen Deckreihenfolge', () => {
  const start = newTheslibbi(2, (limit) => limit - 1)
  assert.deepEqual(start.hands, [[1], [2]])
  let draws = 0
  const nextIndex = () => {
    draws++
    return 0
  }
  const halfway = playTheslibbi(start, 0, 1, nextIndex)
  assert.equal(halfway.level, 1)
  assert.equal(draws, 0)
  const next = playTheslibbi(halfway, 1, 2, nextIndex)
  assert.equal(next.level, 2)
  assert.equal(draws, theslibbiDeckSize - 1)
  assert.deepEqual(next.hands, [[2, 3], [4, 5]])
  assert.deepEqual(playTheslibbi(next, 0, 2, nextIndex).played, [2])
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

test('THESLIBBI legt niedrigere Karten mehrerer Sitze offen und spielt mit höheren Karten weiter', () => {
  const hands = [[20, 55, 90], [3, 8, 21], [6, 17, 80]]
  const state = {
    ...newTheslibbi(3), level: 3, version: 9, hands, last: { kind: 'level-up', seat: 1, card: 94 } as const,
  }
  const next = playTheslibbi(state, 0, 20)
  const skipped = [{ seat: 1, card: 3 }, { seat: 2, card: 6 }, { seat: 1, card: 8 }, { seat: 2, card: 17 }]
  assert.equal(next.lives, 2)
  assert.equal(next.version, 10)
  assert.deepEqual(next.hands, [[55, 90], [21], [80]])
  assert.deepEqual(state.hands, [[20, 55, 90], [3, 8, 21], [6, 17, 80]])
  assert.deepEqual(next.played, [3, 6, 8, 17, 20])
  assert.deepEqual(next.mistakes, [{ level: 3, seat: 0, card: 20, skipped }])
  for (const seat of [0, 1, 2]) {
    const view = viewTheslibbi(next, seat)
    assert.deepEqual(view.hand, next.hands[seat])
    assert.deepEqual(view.mistakes, next.mistakes)
  }
  const continued = playTheslibbi(next, 1, 21)
  assert.equal(continued.lives, 2)
  assert.equal(continued.version, 11)
  assert.deepEqual(continued.hands, [[55, 90], [], [80]])

  const repeated = playTheslibbi(continued, 2, 80)
  assert.equal(repeated.lives, 1)
  assert.deepEqual(repeated.hands, [[90], [], []])
  assert.deepEqual(repeated.played, [3, 6, 8, 17, 20, 21, 55, 80])
  assert.deepEqual(repeated.mistakes.at(-1), { level: 3, seat: 2, card: 80, skipped: [{ seat: 0, card: 55 }] })
  const { room } = lobby('theslibbi', 3)
  seed(room)
  const theslibbi = viewTheslibbi(repeated, 0)
  assert.equal(theslibbi.version, 12)
  assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: { ...room.snapshot(0), theslibbi } }))
})

test('THESLIBBI wertet eine leere letzte Hand mit Leben als Sieg und ohne Leben als Niederlage', () => {
  const end = {
    ...newTheslibbi(2), level: 12, hands: [[91], [90]], version: 154,
    played: Array.from({ length: 22 }, (_, index) => index + 1), last: { kind: 'played', seat: 1 } as const,
  }
  const won = playTheslibbi(end, 0, 91)
  assert.equal(won.outcome, 'win')
  assert.equal(won.lives, 1)
  assert.deepEqual(won.hands, [[], []])
  assert.equal(won.version, 155)
  const lastLife = {
    ...end, level: 2, played: [3, 17], lives: 1, version: 3,
    mistakes: [{ level: 1, seat: 0, card: 42, skipped: [{ seat: 1, card: 15 }] }],
  }
  const stopped = playTheslibbi(lastLife, 0, 91, () => {
    assert.fail('Nach Verlust des letzten Lebens darf keine neue Austeilung starten.')
  })
  assert.equal(stopped.outcome, 'loss')
  assert.equal(stopped.level, 2)
  assert.deepEqual(stopped.hands, [[], []])
  assert.deepEqual(stopped.played, [3, 17, 90, 91])
})

test('THESLIBBI spielt 12, 10 und 8 Level bis zum nachprüfbaren Sieg und übernimmt die Leben', () => {
  for (const [size, levelCount] of [[2, 12], [3, 10], [4, 8]] as const) {
    const { room } = lobby('theslibbi', size)
    seed(room)
    const seats = Array.from({ length: size }, (_, seat) => seat)
    const observations = seats.map(() => new Map<number, string>())
    const receipts = seats.map(() => new Map<string, string>())
    let version = 0
    let lives = size
    for (let level = 1; level <= levelCount; level++) {
      const dealt = numberDeal(room, size)
      assert.equal(new Set(dealt.map(({ card }) => card)).size, size * level)
      for (const seat of seats) assert.equal(dealt.filter((entry) => entry.seat === seat).length, level)
      const played: number[] = []
      if (level === 2) {
        const wrong = dealt.find(({ seat }) => seat !== dealt[0]!.seat)!
        const mistake = numberMove(room, wrong.seat, wrong.card)
        assert.equal(room.action(wrong.seat, mistake).changed, true)
        receipts[wrong.seat]!.set(mistake.id, digest(mistake))
        played.push(...dealt.filter(({ card }) => card <= wrong.card).map(({ card }) => card))
        version++
        lives--
      }
      for (const { seat, card } of dealt.slice(played.length)) {
        for (const observer of seats) {
          const snapshot = room.snapshot(observer)
          const view = snapshot.theslibbi!
          assert.equal(snapshot.phase, 'playing')
          assert.equal(view.level, level)
          assert.equal(view.levelCount, levelCount)
          assert.equal(view.version, version)
          assert.equal(view.lives, lives)
          assert.deepEqual(view.played, played)
          assert.deepEqual(view.hand, dealt.filter((entry) =>
            entry.seat === observer && !played.includes(entry.card)).map((entry) => entry.card))
          observations[observer]!.set(view.version, viewDigest(snapshot))
          assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: snapshot }))
        }
        assert.equal(room.proof(), null)
        const move = numberMove(room, seat, card)
        assert.equal(room.action(seat, move).changed, true)
        receipts[seat]!.set(move.id, digest(move))
        played.push(card)
        version++
      }
      const result = room.snapshot(0).theslibbi!
      assert.equal(result.version, version)
      if (level < levelCount) {
        assert.deepEqual(result.played, [])
        assert.deepEqual(result.last, { seat: dealt.at(-1)!.seat, kind: 'level-up', card: played.at(-1) })
      } else assert.deepEqual(result.played, played)
    }
    const { proof, events } = room.proof()!
    assert.ok(proof)
    for (const seat of seats) {
      const final = room.snapshot(seat)
      assert.equal(final.phase, 'finished')
      assert.equal(final.theslibbi!.outcome, 'win')
      assert.deepEqual(final.theslibbi!.hand, [])
      assert.equal(final.theslibbi!.level, levelCount)
      assert.equal(final.theslibbi!.version, version)
      assert.equal(final.theslibbi!.lives, lives)
      assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: final }))
      assert.doesNotThrow(() => auditMatch(room.id, proof, events, seat, observations[seat]!, receipts[seat]!, final))
    }
  }
})

test('THESLIBBI weist überholte Züge ab und überspringt bei Wiederholung oder Wiederverbindung kein Level', () => {
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

  const next = dealt[1]!
  assert.equal(room.action(next.seat, numberMove(room, next.seat, next.card)).changed, true)
  const closing = dealt[2]!
  const lastMove = numberMove(room, closing.seat, closing.card)
  assert.equal(room.action(closing.seat, lastMove).changed, true)
  const guest = room.snapshot(1)
  assert.equal(guest.theslibbi?.level, 2)
  assert.equal(guest.theslibbi?.version, 3)
  assert.equal(room.action(closing.seat, lastMove).changed, false)
  assert.throws(() => room.action(closing.seat, { ...lastMove, id: crypto.randomUUID() }), /Spielstand hat sich geändert/)
  assert.deepEqual(room.snapshot(1), guest)

  const firstNew = numberDeal(room, 3)[0]!
  const nextMove = numberMove(room, firstNew.seat, firstNew.card)
  room.disconnect(1)
  assert.throws(() => room.action(firstNew.seat, nextMove), /wartet auf|keinem verbundenen/)
  assert.equal(room.join(token(1), 'Gast 1'), 1)
  assert.equal(room.snapshot(1).match, guest.match)
  assert.deepEqual(room.snapshot(1).theslibbi, guest.theslibbi)
  assert.equal(room.action(firstNew.seat, nextMove).changed, true)
})

test('THESLIBBI verarbeitet konkurrierende niedrige und hohe Züge in der Reihenfolge des Hosts', () => {
  for (const highFirst of [false, true]) {
    const { room } = lobby('theslibbi', 2)
    seed(room)
    const [low, high] = numberDeal(room, 2)
    const first = highFirst ? high! : low!
    const stale = highFirst ? low! : high!
    const firstMove = numberMove(room, first.seat, first.card)
    const staleMove = numberMove(room, stale.seat, stale.card)
    assert.equal(firstMove.version, staleMove.version)
    assert.equal(room.action(first.seat, firstMove).changed, true)
    assert.throws(() => room.action(stale.seat, staleMove), /Spielstand hat sich geändert/)
    assert.equal(room.action(first.seat, firstMove).changed, false)
    for (const seat of [0, 1]) {
      const snapshot = room.snapshot(seat)
      const view = snapshot.theslibbi!
      assert.equal(view.lives, highFirst ? 1 : 2)
      assert.equal(view.level, highFirst ? 2 : 1)
      assert.deepEqual(view.played, highFirst ? [] : [first.card])
      assert.equal(view.version, 1)
      assert.deepEqual(view.mistakes, highFirst ? [{ level: 1, ...first, skipped: [stale] }] : [])
      assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: snapshot }))
    }
    if (!highFirst) {
      assert.equal(room.action(stale.seat, numberMove(room, stale.seat, stale.card)).changed, true)
      assert.equal(room.snapshot(0).theslibbi?.lives, 2)
      assert.equal(room.snapshot(0).theslibbi?.version, 2)
    }
  }
})

test('THESLIBBI legt auch beim letzten Leben übersprungene Karten offen und hält höhere Hände privat', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  const first = numberDeal(room, 2).at(-1)!
  const firstMistake = numberMove(room, first.seat, first.card)
  room.action(first.seat, firstMistake)
  assert.equal(room.snapshot(0).theslibbi?.lives, 1)
  assert.equal(room.action(first.seat, firstMistake).changed, false)
  const dealt = numberDeal(room, 2)
  const wrong = dealt.find(({ seat }) => seat !== dealt[0]!.seat)!
  const skipped = dealt.filter(({ card }) => card < wrong.card)
  const start = room.snapshot(wrong.seat)
  room.action(wrong.seat, numberMove(room, wrong.seat, wrong.card))
  assert.deepEqual(room.proof(), { match: start.match, proof: null, events: [] })
  for (const seat of [0, 1]) {
    const final = room.snapshot(seat)
    const view = final.theslibbi!
    assert.equal(final.phase, 'finished')
    assert.equal(view.outcome, 'loss')
    assert.equal(view.lives, 0)
    assert.equal(view.version, 2)
    assert.deepEqual(view.played, [...skipped.map(({ card }) => card), wrong.card])
    assert.equal(view.level, 2)
    assert.deepEqual(view.hand, dealt.filter((entry) => entry.seat === seat && entry.card > wrong.card).map(({ card }) => card))
    assert.deepEqual(view.mistakes.at(-1), { level: 2, ...wrong, skipped })
    assert.deepEqual(view.last, { seat: wrong.seat, kind: 'mistake' })
    assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: final }))
  }
  assert.throws(() => room.action(wrong.seat, numberMove(room, wrong.seat, wrong.card)), /Sortierrunde ist beendet/)
  assert.equal(room.action(wrong.seat, { type: 'chat', id: crypto.randomUUID(), text: 'Neue Runde?' }).message?.text, 'Neue Runde?')
  room.action(0, { type: 'lobby-rematch' })
  assert.equal(room.snapshot(0).theslibbi, undefined)
  assert.equal(room.snapshot(1).seats[1]!.ready, false)
})

test('THESLIBBI-Protokoll lehnt Übertragung fremder Hände und widersprüchliche Spielansichten ab', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  for (const { seat, card } of numberDeal(room, 2)) room.action(seat, numberMove(room, seat, card))
  const current = room.snapshot(0)
  const view = current.theslibbi!
  assert.equal(view.level, 2)
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, hands: [view.hand] } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, hand: [...view.hand].reverse() } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, lives: 1 } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, version: view.version + 1 } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, levelCount: 8 } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, theslibbi: { ...view, last: { seat: 1, kind: 'level-up' } } } }))
  assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...current, phase: 'finished' } }))
  assert.throws(() => parseAction(numberMove(room, 0, 101)))
})

test('THESLIBBI synchronisiert Levelfortschritt ohne Punktefeld', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  const first = numberDeal(room, 2)[0]!
  room.action(first.seat, numberMove(room, first.seat, first.card))
  for (const seat of [0, 1]) {
    const lobby = room.snapshot(seat)
    const view = lobby.theslibbi!
    assert.equal('score' in view, false)
    assert.equal(view.version, 1)
    assert.deepEqual(view.played, [first.card])
    assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby }))
    assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: { ...lobby, theslibbi: { ...view, score: 1 } } }))
  }
})

test('THESLIBBI-Protokoll weist widersprüchliche Offenlegungen nach einem Fehlwurf ab', () => {
  const { room } = lobby('theslibbi', 2)
  seed(room)
  const high = numberDeal(room, 2).at(-1)!
  room.action(high.seat, numberMove(room, high.seat, high.card))
  const current = room.snapshot(0)
  const view = current.theslibbi!
  const mistake = view.mistakes[0]!
  const skipped = mistake.skipped[0]!
  assert.doesNotThrow(() => parse(fromHost, { type: 'snapshot', lobby: current }))
  for (const falseMistake of [
    { ...mistake, skipped: [{ ...skipped, card: mistake.card }] },
    { ...mistake, skipped: [{ ...skipped, seat: mistake.seat }] },
    { ...mistake, skipped: [skipped, skipped] },
    { ...mistake, level: 2 },
  ]) {
    assert.throws(() => parse(fromHost, { type: 'snapshot', lobby: {
      ...current, theslibbi: { ...view, mistakes: [falseMistake] },
    } }))
  }
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
