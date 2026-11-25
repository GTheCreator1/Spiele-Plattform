import './mindsync-card.css'

export function MindSyncCard({ value }: { value: number | null }) {
  const concealed = value === null
  return (
    <span className={concealed ? 'mindsync-card mindsync-card-back' : 'mindsync-card'} role="img"
      aria-label={concealed ? 'Verdeckte Karte' : `Zahlenkarte ${value}`}>
      <span className="mindsync-card-mark" aria-hidden="true" />
      {!concealed && <>
        <span className="mindsync-card-index" aria-hidden="true">{value}</span>
        <strong className="mindsync-card-value" aria-hidden="true">{value}</strong>
        <span className="mindsync-card-index mindsync-card-index-end" aria-hidden="true">{value}</span>
      </>}
    </span>
  )
}

export function MindSyncCardPreview() {
  return (
    <section className="surface detail-panel mindsync-preview" aria-labelledby="mindsync-card-heading">
      <h2 id="mindsync-card-heading">Kartenvorschau</h2>
      <div className="mindsync-preview-cards" role="group" aria-label="Beispielkarten">
        <MindSyncCard value={18} />
        <MindSyncCard value={null} />
        <MindSyncCard value={76} />
      </div>
    </section>
  )
}
