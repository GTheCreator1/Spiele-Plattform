import { Bell, MessageSquare } from 'lucide-react'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'

export default function Messages() {
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Nachrichten" />
      <div className="community-columns">
        <CommunityEmpty icon={Bell} title="Spieleinladungen" description="Einladungen zu privaten Lobbys erscheinen hier, sobald gemeinsame Partien verfügbar sind." />
        <CommunityEmpty icon={MessageSquare} title="Ingame-Chat" description="Hier findest du später die Chats deiner Multiplayer-Partien." />
      </div>
    </div>
  )
}
