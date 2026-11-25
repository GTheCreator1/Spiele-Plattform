import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const encoder = new TextEncoder()
const range = 2 ** 32
const entropy = new Uint32Array(1)

export type RandomIndex = (exclusiveLimit: number) => number

export function randomHex(bytes: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

function word() {
  return crypto.getRandomValues(entropy)[0]!
}

export function randomFraction() {
  return word() / range
}

export function uniformIndex(limit: number, nextWord = word): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > range) throw new RangeError('Ungültige Auswahlgröße.')
  const end = range - range % limit
  let value: number
  do { value = nextWord() } while (value >= end)
  return value % limit
}

export function shuffleCards<T>(cards: readonly T[], index: RandomIndex = uniformIndex): T[] {
  const shuffled = [...cards]
  for (let last = shuffled.length - 1; last > 0; last--) {
    const selected = index(last + 1)
    const card = shuffled[last]!
    shuffled[last] = shuffled[selected]!
    shuffled[selected] = card
  }
  return shuffled
}

export function digest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0))
    }
    return item
  })
  return bytesToHex(sha256(encoder.encode(canonical)))
}

export function keyedBytes(key: string, value: unknown): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hmac(sha256, hexToBytes(key), encoder.encode(JSON.stringify(value))))
}

export function mac(key: string, value: unknown): string {
  return bytesToHex(keyedBytes(key, value))
}

export function sameHex(first: string, second: string): boolean {
  let mismatch = first.length ^ second.length
  for (let i = 0; i < first.length; i++) mismatch |= first.charCodeAt(i) ^ (second.charCodeAt(i) || 0)
  return mismatch === 0
}

export function roundRandom(seed: string, purpose: string, version: number) {
  let counter = 0
  let block = new DataView(new ArrayBuffer(0))
  let offset = 0
  function nextWord() {
    if (offset === block.byteLength) {
      const bytes = keyedBytes(seed, ['stichrunde-deck-v1', purpose, version, counter++])
      block = new DataView(bytes.buffer)
      offset = 0
    }
    const result = block.getUint32(offset)
    offset += 4
    return result
  }
  return {
    index: (limit: number) => uniformIndex(limit, nextWord),
    fraction: () => nextWord() / range,
  }
}
