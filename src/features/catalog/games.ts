import ab6super6 from '../../assets/covers/ab6super6.webp'
import luegen from '../../assets/covers/luegen.webp'
import theslibbi from '../../assets/covers/theslibbi.webp'
import xeri from '../../assets/covers/xeri.webp'

export type GameId = 'xeri' | 'luegen' | 'theslibbi' | 'ab6super6'

export type Game = {
  id: GameId
  name: string
  category: string
  description: string
  cover: string
  available: boolean
  players: string
  notes: string[]
}

export const games: Game[] = [
  {
    id: 'xeri',
    name: 'Xeri (Ξερή)',
    category: 'Kartenklassiker',
    description: 'Gleiche Werte sammeln, den Tisch abräumen und eine Xeri landen.',
    cover: xeri,
    available: true,
    players: 'Solo oder online zu zweit und zu viert',
    notes: [
      'Vier Karten liegen zu Beginn offen auf dem Tisch. Du und dein Gegenüber bekommt je vier Handkarten und spielt abwechselnd eine davon aus.',
      'Ein gleicher Wert wie die oberste Tischkarte oder ein Bube räumt den gesamten Stapel ab. Auf einem leeren Tisch beginnt jede Karte einen neuen Stapel.',
      'Räumst du eine einzelne gleichwertige Karte ab, zählt das zehn Bonuspunkte. Bube auf einzelnem Buben zählt zwanzig. Jede gesammelte Karte ist einen Punkt wert.',
      'Nach jeder ausgespielten Hand wird nachgeteilt, solange Karten übrig sind. Restkarten auf dem Tisch gehen am Ende an die Seite mit dem letzten Stich.',
    ],
  },
  {
    id: 'luegen',
    name: 'Lügen',
    category: 'Bluffspiel',
    description: 'Ein Bluffspiel mit dem Buben als besonderer Lügenkarte.',
    cover: luegen,
    available: false,
    players: 'Spielerzahl offen',
    notes: [
      'Der Bube ist in eurer Variante die besondere Lügenkarte.',
      'Kartenausgabe, Bluff, Aufdecken und Endwertung werden mit eurer Runde festgelegt.',
    ],
  },
  {
    id: 'theslibbi',
    name: 'THESLIBBI',
    category: 'Kooperation',
    description: 'Triff dich mit deiner Runde in einer privaten Lobby.',
    cover: theslibbi,
    available: false,
    players: 'Private Lobby · 2–4 Personen',
    notes: [],
  },
  {
    id: 'ab6super6',
    name: 'ab6super6',
    category: 'Hausregeln',
    description: 'Verdeckte Karten merken, passend reinwerfen und bei höchstens sechs Punkten klopfen.',
    cover: ab6super6,
    available: true,
    players: '2–6 Spieler online',
    notes: [
      'Aus 55 Karten erhält jede Person vier verdeckte Startkarten. Die Zusatzkarten sind drei Joker, die jeweils null Punkte zählen.',
      'Passende Karten können aus der eigenen oder einer fremden Auslage eingeworfen werden. Der Kartenwert und die Auswahl bestimmen, wer Strafkarten bekommt.',
      'Wer zu Beginn des eigenen Zuges höchstens sechs Punkte hat, darf klopfen. Danach bekommt jede Person einschließlich des Klopfers einen weiteren regulären Zug.',
    ],
  },
]

export function findGame(id: string | undefined) {
  return games.find((game) => game.id === id)
}
