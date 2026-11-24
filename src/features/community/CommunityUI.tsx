import type { LucideIcon } from 'lucide-react'
import '../../styles/community.css'

export function CommunityHeading({ title }: { title: string }) {
  return <header className="page-heading"><h1>{title}</h1></header>
}

export function CommunityEmpty({ icon: Icon, title, description }: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <section className="surface community-empty">
      <span className="feature-icon feature-icon-violet"><Icon size={23} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <small>In Entwicklung</small>
    </section>
  )
}
