import { Sparkles, UserRound, Volume2 } from 'lucide-react'
import { usePreferences } from '../../platform/preferences'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'
import type { LucideIcon } from 'lucide-react'

export default function Profile() {
  const { motion, sound, setPreference } = usePreferences()
  return (
    <div className="page-view community-page">
      <CommunityHeading title="Profil und Einstellungen" />
      <div className="community-columns">
        <section className="surface settings-panel" aria-labelledby="settings-heading">
          <h2 id="settings-heading">Auf diesem Gerät</h2>
          <PreferenceSwitch icon={Sparkles} label="Animationen" description="Berücksichtigt reduzierte Bewegung im System." enabled={motion} onChange={(enabled) => setPreference('motion', enabled)} />
          <PreferenceSwitch icon={Volume2} label="Soundeffekte" description="Töne beim Ausspielen und Abräumen." enabled={sound} onChange={(enabled) => setPreference('sound', enabled)} />
        </section>
        <CommunityEmpty icon={UserRound} title="Benutzerkonto" description="Du spielst als Gast. Konten mit Benutzername und Passwort sind in Entwicklung." />
      </div>
    </div>
  )
}

function PreferenceSwitch({ icon: Icon, label, description, enabled, onChange }: {
  icon: LucideIcon
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <label className="preference-row">
      <span className="feature-icon"><Icon size={18} aria-hidden="true" /></span>
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" role="switch" aria-label={label} checked={enabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  )
}
