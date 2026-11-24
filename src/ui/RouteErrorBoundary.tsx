import { Component } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <section className="page-heading" role="alert">
        <h1>Ansicht konnte nicht geladen werden</h1>
        <p>Prüfe deine Verbindung und lade diese Ansicht erneut.</p>
        <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Ansicht neu laden</button>
        <Link className="text-link" to="/">Zur Übersicht</Link>
      </section>
    )
  }
}
