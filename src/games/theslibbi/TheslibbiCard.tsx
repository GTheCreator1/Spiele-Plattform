import './theslibbi-card.css'

export function TheslibbiCard({ value }: { value: number | null }) {
  const concealed = value === null
  return (
    <span className={concealed ? 'theslibbi-card theslibbi-card-back' : 'theslibbi-card'} role="img"
      aria-label={concealed ? 'Verdeckte Karte' : `Zahlenkarte ${value}`}>
      <span className="theslibbi-card-mark" aria-hidden="true" />
      {!concealed && <>
        <span className="theslibbi-card-index" aria-hidden="true">{value}</span>
        <strong className="theslibbi-card-value" aria-hidden="true">{value}</strong>
        <span className="theslibbi-card-index theslibbi-card-index-end" aria-hidden="true">{value}</span>
      </>}
    </span>
  )
}
