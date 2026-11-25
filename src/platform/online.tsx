import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { OnlineAction } from '../../shared/online'
import type { PeerSession, RoomStatus, StartRoom } from './peer-client'

type OnlineContextValue = {
  room: RoomStatus | null
  opening: boolean
  start: (input: StartRoom) => Promise<void>
  act: (action: OnlineAction) => Promise<void>
  leave: () => void
  reconnect: () => void
}

const Context = createContext<OnlineContextValue | null>(null)

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<RoomStatus | null>(null)
  const [opening, setOpening] = useState(false)
  const current = useRef<PeerSession | null>(null)
  const operation = useRef(0)

  useEffect(() => () => {
    operation.current++
    current.current?.close(false)
    current.current = null
  }, [])

  const start = useCallback(async (input: StartRoom) => {
    const id = ++operation.current
    setOpening(true)
    current.current?.close()
    current.current = null
    setRoom(null)
    try {
      if (!globalThis.crypto?.subtle || !globalThis.RTCPeerConnection) {
        throw new Error('Online-Spiele benötigen WebRTC und eine sichere Webseitenadresse.')
      }
      const { PeerSession } = await import('./peer-client')
      if (id !== operation.current) return
      current.current = new PeerSession(input, (status) => {
        if (id === operation.current) setRoom(status)
      })
    } finally {
      if (id === operation.current) setOpening(false)
    }
  }, [])

  function leave() {
    operation.current++
    current.current?.close()
    current.current = null
    setRoom(null)
    setOpening(false)
  }

  async function act(action: OnlineAction) {
    if (!current.current) throw new Error('Öffne zuerst einen Spielraum.')
    await current.current.act(action)
  }

  return <Context.Provider value={{ room, opening, start, act, leave, reconnect: () => current.current?.reconnect() }}>{children}</Context.Provider>
}

export function useOnline() {
  const value = useContext(Context)
  if (!value) throw new Error('Der Multiplayer-Bereich wurde nicht geladen.')
  return value
}
