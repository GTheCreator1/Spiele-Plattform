import { Sparkles, UserRound, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useOnline } from '../../platform/online'
import { usePreferences } from '../../platform/preferences'
import { CommunityEmpty, CommunityHeading } from './CommunityUI'
import type { LucideIcon } from 'lucide-react'
import { useCommand } from './useCommand'

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
        <Account />
      </div>
    </div>
  )
}

function Account() {
  const online = useOnline()
  const command = useCommand()
  const [deleting, setDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const user = online.snapshot?.user
  if (!online.configured) return <CommunityEmpty icon={UserRound} title="Benutzerkonto" description="Du spielst als Gast. Konten mit Benutzername und Passwort sind in Entwicklung." />
  return (
    <section className="surface settings-panel account-panel" aria-labelledby="account-title">
      <h2 id="account-title">{user?.name ?? 'Benutzerkonto'}</h2>
      {(command.error || online.error) && <p className="inline-error" role="alert">{command.error || online.error}</p>}
      {user ? (
        <>
          <div className="online-actions">
            <button type="button" className="button button-secondary" disabled={command.pending} onClick={() => command.run(() => online.signOut())}>Abmelden</button>
            <button type="button" className="button button-quiet" onClick={() => setDeleting(!deleting)}>Konto löschen</button>
          </div>
          {deleting && (
            <form className="online-form" onSubmit={(event) => {
              event.preventDefault()
              command.run(async () => { await online.signOut(password); setPassword(''); setDeleting(false) })
            }}>
              <label>Passwort bestätigen<input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} type="password" autoComplete="current-password" /></label>
              <button className="button button-primary" disabled={command.pending}>Konto endgültig löschen</button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="muted">Ein Benutzername und ein Passwort genügen.</p>
          <div className="online-actions">
            <button className="button button-primary" disabled={online.loading} onClick={() => online.begin('login')}>Anmelden</button>
            <button className="button button-secondary" disabled={online.loading} onClick={() => online.begin('register')}>Konto erstellen</button>
          </div>
          <button className="button button-quiet" disabled={online.loading} onClick={() => online.begin('recover')}>Passwort wiederherstellen</button>
        </>
      )}
    </section>
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
