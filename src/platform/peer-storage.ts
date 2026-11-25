import { invitePattern } from '../../shared/online'
import { randomHex } from '../../shared/random'

const key = 'stichrunde:room'
type StoredRoom = { invite: string; token: string; name: string }

function read<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null }
  catch { return null }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch { /* The current connection still works with the values held in memory. */ }
}

export function storedGuest(invite: string) {
  const room = read<StoredRoom>(key)
  return room?.invite === invite && invitePattern.test(room.token) && typeof room.name === 'string' ? room : null
}

export function guestToken(invite: string, name: string) {
  const token = storedGuest(invite)?.token ?? randomHex(24)
  store(key, { invite, token, name })
  return token
}

export const readRound = <T,>(invite: string) => read<T>(`${key}:fair:${invite}`)
export const storeRound = (invite: string, value: unknown) => store(`${key}:fair:${invite}`, value)

export function forgetGuest(invite: string) {
  if (storedGuest(invite)) store(key, null)
  storeRound(invite, null)
}
