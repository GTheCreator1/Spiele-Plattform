import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { capacities, onlineNames, validNickname } from '../../../shared/online'
import type { OnlineGame, RoomSettings } from '../../../shared/online'
import { useOnline } from '../../platform/online'
import { useCommand } from './useCommand'

export function RoomForm({ fixedGame }: { fixedGame?: OnlineGame }) {
  const { start, opening } = useOnline()
  const navigate = useNavigate()
  const command = useCommand()
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<RoomSettings>({ game: fixedGame ?? 'xeri', capacity: 2 })
  return (
    <form className="online-form mode-form" onSubmit={(event) => {
      event.preventDefault()
      command.run(async () => {
        const nickname = name.trim()
        if (!validNickname(nickname)) throw new Error('Gib einen gültigen Spitznamen mit höchstens 24 Zeichen ein.')
        await start({ kind: 'host', name: nickname, settings })
        void navigate('/lobby')
      })
    }}>
      <label>Spitzname<input type="text" required autoComplete="nickname" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <RoomFields fixedGame={fixedGame} settings={settings} onChange={setSettings} />
      {command.error && <p className="inline-error" role="alert">{command.error}</p>}
      <button className="button button-primary" disabled={opening || command.pending}>Privaten Raum erstellen</button>
    </form>
  )
}

export function RoomFields({ fixedGame, settings, onChange }: {
  fixedGame?: OnlineGame
  settings: RoomSettings
  onChange: (settings: RoomSettings) => void
}) {
  const { game, capacity } = settings
  return (
    <>
      {!fixedGame && <label>Spiel<select value={game} onChange={(event) => onChange({ game: event.target.value as OnlineGame, capacity: 2 })}>
        {Object.entries(onlineNames).map(([id, title]) => <option value={id} key={id}>{id === 'theslibbi' ? `${title} (nur Lobby)` : title}</option>)}
      </select></label>}
      <label>Spielerplätze<select value={capacity} onChange={(event) => onChange({ game, capacity: Number(event.target.value) })}>
        {capacities[game].map((size) => <option value={size} key={size}>{game === 'xeri' ? (size === 2 ? '1 gegen 1' : '2 gegen 2') : `${size} Spieler`}</option>)}
      </select></label>
    </>
  )
}
