import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const regions = ['north', 'south', 'east', 'west', 'central']

function band(psi) {
  if (psi == null) return { label: 'No reading', className: 'unknown' }
  if (psi <= 50) return { label: 'Good', className: 'good' }
  if (psi <= 100) return { label: 'Moderate', className: 'moderate' }
  if (psi <= 200) return { label: 'Unhealthy', className: 'unhealthy' }
  if (psi <= 300) return { label: 'Very unhealthy', className: 'very-unhealthy' }
  return { label: 'Hazardous', className: 'hazardous' }
}

function App() {
  const [readings, setReadings] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/readings/latest')
      .then((response) => {
        if (!response.ok) throw new Error('Backend request failed')
        return response.json()
      })
      .then((payload) => setReadings(payload.data))
      .catch(() => setError('No stored readings yet. Run the ingestion job first.'))
  }, [])

  const byRegion = Object.fromEntries(readings.map((reading) => [reading.region, reading]))
  const latestTimestamp = readings[0]?.updated_timestamp

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">PORTFOLIO PROJECT · OFFICIAL NEA DATA</p>
        <h1>Singapore Haze Monitor</h1>
        <p className="subtitle">Air-quality readings with clear context, timestamps, and source transparency.</p>
      </header>

      {error && <div className="notice">{error}</div>}
      <section className="meta-row">
        <span>Regions: {readings.length || 0}/5</span>
        <span>{latestTimestamp ? `Updated ${new Date(latestTimestamp).toLocaleString()}` : 'Waiting for data'}</span>
      </section>

      <section className="region-grid" aria-label="Regional air quality">
        {regions.map((region) => {
          const reading = byRegion[region]
          const status = band(reading?.psi_24h)
          return (
            <article className={`region-card ${status.className}`} key={region}>
              <div className="card-heading"><h2>{region}</h2><span className="status-dot" /></div>
              <p className="metric-label">24-hour PSI</p>
              <p className="metric-value">{reading?.psi_24h ?? '—'}</p>
              <p className="status-label">{status.label}</p>
              <div className="secondary-metrics">
                <span>1-hour PM2.5 <strong>{reading?.pm25_1h ?? '—'}</strong> µg/m³</span>
                <span>24-hour PM2.5 <strong>{reading?.pm25_24h ?? '—'}</strong> µg/m³</span>
              </div>
            </article>
          )
        })}
      </section>

      <footer>
        <p>Data source: NEA via data.gov.sg. This project is for educational use; follow official NEA and MOH advisories.</p>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
