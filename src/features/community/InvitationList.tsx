import { useNavigate } from 'react-router-dom'
import { onlineNames } from '../../../shared/online'
import { useOnline } from '../../platform/online'
import { useCommand } from './useCommand'

export function InvitationList({ onAccept }: { onAccept?: () => void }) {
  const online = useOnline()
  const command = useCommand()
  const invitations = online.snapshot?.invitations ?? []
  const navigate = useNavigate()
  if (!online.snapshot) return <p className="muted">{online.configured ? 'Melde dich an, um Einladungen zu empfangen.' : 'Einladungen sind in Entwicklung.'}</p>
  if (!invitations.length) return <p className="muted">Du hast keine offenen Einladungen.</p>

  return (
    <div className="social-list">
      {command.error && <p className="inline-error" role="alert">{command.error}</p>}
      {invitations.map((invite) => (
        <div className="member-row" key={invite.id}>
          <div><strong>{onlineNames[invite.game]}</strong><p>{invite.from.name} · {invite.players}/{invite.capacity} Spieler</p></div>
          <div className="online-actions">
            <button className="button button-primary" disabled={command.pending} onClick={() => command.run(async () => {
              await online.act({ type: 'invite-accept', invitation: invite.id })
              onAccept?.()
              void navigate('/lobby')
            })}>Annehmen</button>
            <button className="button button-secondary" disabled={command.pending} onClick={() => command.run(() => online.act({ type: 'invite-decline', invitation: invite.id }))}>Ablehnen</button>
          </div>
        </div>
      ))}
    </div>
  )
}
