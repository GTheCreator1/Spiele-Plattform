import { Sparkles, Volume2 } from 'lucide-react'
import { usePreferences } from '../../platform/preferences'
import '../../styles/community.css'

export default function Settings() {
  const { motion, sound, setPreference } = usePreferences()
  return (
    <div className="page-view community-page">
      <header className="page-heading"><h1>Einstellungen</h1></header>
      <section className="surface settings-panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Auf diesem Gerät</h2>
        <label className="preference-row">
          <span className="feature-icon"><Sparkles size={18} aria-hidden="true" /></span>
          <span><strong>Animationen</strong><small>Berücksichtigt reduzierte Bewegung im System.</small></span>
          <input type="checkbox" role="switch" aria-label="Animationen" checked={motion} onChange={(event) => setPreference('motion', event.currentTarget.checked)} />
        </label>
        <label className="preference-row">
          <span className="feature-icon"><Volume2 size={18} aria-hidden="true" /></span>
          <span><strong>Soundeffekte</strong><small>Töne beim Ausspielen und Abräumen in Xeri solo.</small></span>
          <input type="checkbox" role="switch" aria-label="Soundeffekte" checked={sound} onChange={(event) => setPreference('sound', event.currentTarget.checked)} />
        </label>
      </section>
    </div>
  )
}
