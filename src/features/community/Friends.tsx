import { UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'

const sections = [
  { label: 'Freundesliste', icon: UsersRound, title: 'Deine Freundesliste', description: 'Nach Freischaltung der Konten kannst du Freunde suchen, ihren Online-Status sehen und sie zu einer Partie einladen.' },
  { label: 'Anfragen', icon: UserPlus, title: 'Freundschaftsanfragen', description: 'Hier kannst du später Freundschaftsanfragen annehmen oder ablehnen.' },
] as const

export default function Friends() {
  const [section, selectSection] = useState(0)
  const content = sections[section] ?? sections[0]
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Freunde" />
      <div className="segmented community-filters" role="group" aria-label="Freunde anzeigen">
        {sections.map(({ label }, index) => (
          <button key={label} type="button" aria-pressed={section === index} onClick={() => selectSection(index)}>{label}</button>
        ))}
      </div>
      <CommunityEmpty {...content} />
    </div>
  )
}
