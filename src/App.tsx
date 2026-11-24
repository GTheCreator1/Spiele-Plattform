import { Suspense, lazy } from 'react'
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { Overview, GameCatalog } from './features/catalog/Catalog'
import { loadGameDetail, loadXeriTable } from './features/catalog/game-loaders'
import { PreferencesProvider } from './platform/preferences'
import { OnlineProvider } from './platform/online'
import { AppShell } from './ui/AppShell'
import { RouteErrorBoundary } from './ui/RouteErrorBoundary'

const GameDetail = lazy(loadGameDetail)
const XeriTable = lazy(loadXeriTable)
const Friends = lazy(() => import('./features/community/Friends'))
const Messages = lazy(() => import('./features/community/Messages'))
const Profile = lazy(() => import('./features/community/Profile'))
const Lobby = lazy(() => import('./features/community/Lobby'))

export function App() {
  return (
    <PreferencesProvider>
      <HashRouter>
        <OnlineProvider><PlatformRoutes /></OnlineProvider>
      </HashRouter>
    </PreferencesProvider>
  )
}

function PlatformRoutes() {
  const { pathname } = useLocation()
  return (
    <AppShell>
      <RouteErrorBoundary key={pathname}>
        <Suspense fallback={<p className="route-loading" role="status">Ansicht wird geladen …</p>}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/spiele" element={<GameCatalog />} />
            <Route path="/spiele/:gameId" element={<GameDetail />} />
            <Route path="/spiele/xeri/tisch" element={<XeriTable />} />
            <Route path="/freunde" element={<Friends />} />
            <Route path="/nachrichten" element={<Messages />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/anmeldung/weiter" element={<p role="status">Anmeldung wird geprüft …</p>} />
            <Route path="*" element={<MissingPage />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </AppShell>
  )
}

function MissingPage() {
  return (
    <section className="page-heading">
      <h1>Ansicht nicht gefunden</h1>
      <Link className="button button-primary" to="/">Zur Übersicht</Link>
    </section>
  )
}
