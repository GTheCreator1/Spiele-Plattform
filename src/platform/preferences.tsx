import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type Preferences = { motion: boolean; sound: boolean }
type PreferencesContextValue = Preferences & {
  setPreference: (key: keyof Preferences, enabled: boolean) => void
}

const key = 'stichrunde:preferences'
const defaults: Preferences = { motion: true, sound: true }
const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function readPreferences(): Preferences {
  try {
    const values: Partial<Preferences> | null = JSON.parse(localStorage.getItem(key) ?? 'null')
    return {
      motion: typeof values?.motion === 'boolean' ? values.motion : defaults.motion,
      sound: typeof values?.sound === 'boolean' ? values.sound : defaults.sound,
    }
  } catch {
    return defaults
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences)

  function setPreference(name: keyof Preferences, enabled: boolean) {
    const next = { ...preferences, [name]: enabled }
    setPreferences(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The setting still applies for the current visit.
    }
  }

  return (
    <PreferencesContext.Provider value={{ ...preferences, setPreference }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const preferences = useContext(PreferencesContext)
  if (!preferences) throw new Error('Die Einstellungen sind nicht verfügbar.')
  return preferences
}
