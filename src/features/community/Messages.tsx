import { Bell, MessageSquare } from 'lucide-react'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'
import { Link } from 'react-router-dom'
import { useOnline } from '../../platform/online'
import { InvitationList } from './InvitationList'

export default function Messages() {
  const online = useOnline()
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Nachrichten" />
      {online.configured ? <div className="community-columns">
        <section className="surface settings-panel"><h2>Spieleinladungen</h2><InvitationList /></section>
        <section className="surface settings-panel"><h2>Ingame-Chat</h2>
          {online.snapshot?.lobby ? <Link className="button button-secondary" to="/lobby">Zum Chat der aktiven Lobby</Link> : <p className="muted">Der Chat ist in einer privaten Lobby verfügbar.</p>}
        </section>
      </div> : <div className="community-columns">
        <CommunityEmpty icon={Bell} title="Spieleinladungen" description="Einladungen zu privaten Lobbys erscheinen hier, sobald gemeinsame Partien verfügbar sind." />
        <CommunityEmpty icon={MessageSquare} title="Ingame-Chat" description="Hier findest du später die Chats deiner Multiplayer-Partien." />
      </div>}
    </div>
  )
}
