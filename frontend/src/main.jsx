import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { REGION_TOWNS, regionForTown } from './regions.js'
import './styles.css'

const HistoryChart = lazy(() => import('./Charts.jsx').then(module => ({ default: module.HistoryChart })))
const ForecastChart = lazy(() => import('./Charts.jsx').then(module => ({ default: module.ForecastChart })))

const REGIONS = ['north', 'south', 'east', 'west', 'central']
const HEALTH_PROFILES = [
  { id: 'healthy', label: 'Healthy adult' },
  { id: 'sensitive', label: 'Sensitive group' },
  { id: 'chronic', label: 'Heart / lung condition' },
]

function psiBand(value) {
  if (value == null) return { label: 'Awaiting data', tone: 'unknown', guidance: 'No current reading is available.' }
  if (value <= 50) return { label: 'Good', tone: 'good', guidance: 'Normal activities can continue.' }
  if (value <= 100) return { label: 'Moderate', tone: 'moderate', guidance: 'Normal activities can generally continue.' }
  if (value <= 200) return { label: 'Unhealthy', tone: 'unhealthy', guidance: 'Reduce prolonged or strenuous outdoor activity.' }
  if (value <= 300) return { label: 'Very unhealthy', tone: 'very-unhealthy', guidance: 'Avoid prolonged or strenuous outdoor activity.' }
  return { label: 'Hazardous', tone: 'hazardous', guidance: 'Minimise outdoor activity and follow official guidance.' }
}

function pmBand(value) {
  if (value == null) return 'No reading'
  if (value <= 55) return 'Normal'
  if (value <= 150) return 'Elevated'
  if (value <= 250) return 'High'
  return 'Very high'
}

function psiGuidance(value, profile) {
  if (value == null) return 'No current PSI reading is available.'
  if (value <= 100) return 'Normal activities can continue.'
  if (profile === 'chronic') {
    return value <= 200
      ? 'Avoid prolonged or strenuous outdoor physical exertion.'
      : 'Avoid outdoor activity.'
  }
  if (profile === 'sensitive') {
    if (value <= 200) return 'Minimise prolonged or strenuous outdoor physical exertion.'
    return value <= 300 ? 'Minimise outdoor activity.' : 'Avoid outdoor activity.'
  }
  if (value <= 200) return 'Reduce prolonged or strenuous outdoor physical exertion.'
  return value <= 300 ? 'Avoid prolonged or strenuous outdoor physical exertion.' : 'Minimise outdoor activity.'
}

function localTime(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit',
    day: options.day ? 'numeric' : undefined, month: options.day ? 'short' : undefined,
  }).format(new Date(value))
}

async function requestJSON(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json()
}

function Skeleton({ className = '' }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />
}

function ChartLoading() {
  return <div className="chart-loading" aria-label="Loading chart"><Skeleton/><Skeleton/><Skeleton/></div>
}

function RegionCard({ region, reading, selected, onSelect }) {
  const status = psiBand(reading?.psi_24h)
  return (
    <button className={`region-card ${status.tone} ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <span className="card-top"><span className="region-name">{region}</span><span className="live-dot" /></span>
      <span className="metric-kicker">24-hour PSI</span>
      <span className="psi-number">{reading?.psi_24h ?? '—'}</span>
      <span className="band-label">{status.label}</span>
      <span className="card-divider" />
      <span className="micro-row"><span>1-hour PM2.5</span><strong>{reading?.pm25_1h ?? '—'} <small>µg/m³</small></strong></span>
      <span className="micro-row"><span>Current band</span><strong>{pmBand(reading?.pm25_1h)}</strong></span>
    </button>
  )
}

function LoadingCards() {
  return <section className="region-grid">{REGIONS.map(region => (
    <article className="region-card loading" key={region}>
      <Skeleton className="short"/><Skeleton className="number"/><Skeleton/><Skeleton/>
    </article>
  ))}</section>
}

/**
 * @param {{ town: string, selectedRegion: string, onSelect: (town: string) => void }} props
 */
function LocationHelper({ town, selectedRegion, onSelect }) {
  return <div className="location-helper">
    <div>
      <label htmlFor="town-region">Find your reporting region</label>
      <span>No GPS or location data is collected.</span>
    </div>
    <select id="town-region" value={town} onChange={event => onSelect(event.target.value)}>
      <option value="">Choose your nearest town</option>
      {REGION_TOWNS.map(item => <option key={item.town} value={item.town}>{item.town} — {item.region}</option>)}
    </select>
    <p aria-live="polite">{town ? `${town} uses the ${selectedRegion} reading.` : 'Select a town to focus the relevant NEA region.'}</p>
  </div>
}

function App() {
  const [readings, setReadings] = useState([])
  const [history, setHistory] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [meta, setMeta] = useState(null)
  const [selected, setSelected] = useState('central')
  const [selectedTown, setSelectedTown] = useState('')
  const [healthProfile, setHealthProfile] = useState('healthy')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadLatest = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const payload = await requestJSON(`/api/readings/latest${force ? '?refresh=true' : ''}`)
      setReadings(payload.data)
      setMeta(payload.meta)
      setError('')
    } catch (err) {
      setError('Live readings are temporarily unavailable. Please try again shortly.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadLatest() }, [loadLatest])
  useEffect(() => {
    let active = true
    Promise.all([
      requestJSON(`/api/readings/history?region=${selected}&limit=168`),
      requestJSON(`/api/analysis/regression?region=${selected}&horizon=3`),
    ]).then(([historyPayload, analysisPayload]) => {
      if (active) {
        setHistory(historyPayload.data)
        setAnalysis(analysisPayload.analysis)
      }
    }).catch(() => active && setAnalysis({ status: 'unavailable' }))
    return () => { active = false }
  }, [selected, readings])

  const byRegion = useMemo(() => Object.fromEntries(readings.map(row => [row.region, row])), [readings])
  const selectedReading = byRegion[selected]
  const selectedStatus = psiBand(selectedReading?.psi_24h)
  const chartData = useMemo(() => history.map((row, index, allRows) => {
    const window = allRows.slice(Math.max(0, index - 2), index + 1)
      .map(item => item.pm25_1h).filter(value => value != null)
    return {
      ...row,
      label: localTime(row.reading_timestamp, { day: true }),
      pm25_ma3: window.length ? Math.round(window.reduce((sum, value) => sum + value, 0) / window.length * 10) / 10 : null,
    }
  }), [history])
  const highest = useMemo(() => readings.reduce((best, row) =>
    (row.pm25_1h ?? -1) > (best?.pm25_1h ?? -1) ? row : best, null), [readings])

  const selectRegion = useCallback((region) => {
    setSelected(region)
    setSelectedTown('')
  }, [])

  const selectTown = useCallback((town) => {
    setSelectedTown(town)
    const region = regionForTown(town)
    if (region) setSelected(region)
  }, [])

  return (
    <main>
      <nav className="nav-shell">
        <a className="brand" href="#top"><span className="brand-mark">SG</span><span>ClearSky</span></a>
        <div className="nav-actions">
          <span className={`source-pill ${meta?.stale ? 'stale' : ''}`}><span />{meta?.stale ? 'Stored data' : 'Official data live'}</span>
          <button className="refresh-button" onClick={() => loadLatest(true)} disabled={refreshing}>
            <span className={refreshing ? 'spin' : ''}>↻</span>{refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </nav>

      <header className="hero" id="top">
        <div>
          <p className="eyebrow">SINGAPORE AIR QUALITY · NEA DATA</p>
          <h1>Know the air<br/>before you step out.</h1>
          <p className="hero-copy">Current regional readings, transparent data quality, and experimental short-term analysis—without hiding uncertainty.</p>
        </div>
        <aside className={`hero-status ${selectedStatus.tone}`}>
          <span className="metric-kicker">Highest current PM2.5</span>
          {loading ? <Skeleton className="number"/> : <><strong>{highest?.pm25_1h ?? '—'}</strong><small>µg/m³ · {highest?.region ?? 'No region'}</small></>}
          <p>{highest ? pmBand(highest.pm25_1h) : 'Waiting for official readings'}</p>
        </aside>
      </header>

      {error && <div className="error-banner" role="alert"><strong>Connection issue</strong><span>{error}</span><button onClick={() => loadLatest(true)}>Try again</button></div>}

      <section className="section-heading">
        <div><p className="eyebrow">RIGHT NOW</p><h2>Regional overview</h2></div>
        <p>{meta?.data_age_minutes != null ? `Observed ${Math.round(meta.data_age_minutes)} min ago` : 'Retrieving latest observation'}</p>
      </section>
      <LocationHelper town={selectedTown} selectedRegion={selected} onSelect={selectTown}/>
      {loading ? <LoadingCards/> : <section className="region-grid">
        {REGIONS.map(region => <RegionCard key={region} region={region} reading={byRegion[region]} selected={selected === region} onSelect={() => selectRegion(region)} />)}
      </section>}

      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div><p className="eyebrow">7-DAY SIGNAL</p><h2>{selected} PM2.5 trend</h2></div>
            <div className="chart-actions">
              <a className="export-link" href={`/api/readings/export.csv?region=${selected}&limit=1000`}>Export CSV ↓</a>
              <div className="region-tabs" role="tablist" aria-label="Select air quality region">{REGIONS.map(region => <button className={selected === region ? 'active' : ''} onClick={() => selectRegion(region)} key={region}>{region}</button>)}</div>
            </div>
          </div>
          <div className="chart-wrap">
            {chartData.length > 1 ? <Suspense fallback={<ChartLoading/>}><HistoryChart data={chartData}/></Suspense> : <div className="empty-chart"><span>Collecting history</span><p>Run the backfill command to populate a seven-day trend and unlock regression analysis.</p></div>}
          </div>
        </article>

        <aside className={`panel decision-panel ${selectedStatus.tone}`}>
          <p className="eyebrow">24-HOUR EXPOSURE CONTEXT</p><h2>{selectedStatus.label}</h2>
          <div className="profile-tabs" aria-label="Choose health profile">{HEALTH_PROFILES.map(profile => <button key={profile.id} className={healthProfile === profile.id ? 'active' : ''} onClick={() => setHealthProfile(profile.id)}>{profile.label}</button>)}</div>
          <p className="decision-copy">{psiGuidance(selectedReading?.psi_24h, healthProfile)}</p>
          <dl><div><dt>24-hour PSI</dt><dd>{selectedReading?.psi_24h ?? '—'}</dd></div><div><dt>1-hour PM2.5</dt><dd>{selectedReading?.pm25_1h ?? '—'} <small>µg/m³</small></dd></div><div><dt>Region</dt><dd className="capitalize">{selected}</dd></div></dl>
          <p className="immediate-note"><strong>{pmBand(selectedReading?.pm25_1h)} now.</strong> Use 1-hour PM2.5 for immediate decisions and 24-hour PSI for prolonged exposure.</p>
          <a href="https://www.haze.gov.sg/" target="_blank" rel="noreferrer">Check official advisory ↗</a>
        </aside>
      </section>

      <section className="model-section">
        <div className="section-heading"><div><p className="eyebrow">MODEL TRANSPARENCY</p><h2>Experimental three-hour outlook</h2></div><p>Autoregressive OLS · evaluated out of sample</p></div>
        <div className="model-grid">
          <article className="panel forecast-panel">
            {analysis?.status === 'ready' ? <>
              <div className="forecast-chart"><Suspense fallback={<ChartLoading/>}><ForecastChart data={analysis.forecast}/></Suspense></div>
              <div className="forecast-values">{analysis.forecast.map(item => <div key={item.timestamp}><span>{localTime(item.timestamp)}</span><strong>{item.pm25_1h}</strong><small>{item.lower}–{item.upper} µg/m³</small></div>)}</div>
            </> : <div className="model-empty"><span className="model-icon">∿</span><h3>Building the evidence base</h3><p>{analysis?.message || 'Analysis becomes available after enough validated hourly readings have been stored.'}</p><small>{analysis?.available ?? 0} / {analysis?.required ?? 20} observations available</small></div>}
          </article>
          <article className="panel metrics-panel">
            <p className="eyebrow">VALIDATION</p>
            <h3>{analysis?.status === 'ready' ? (analysis.beats_naive ? 'Model beats persistence' : 'Baseline remains stronger') : 'Pending sufficient data'}</h3>
            <div className="metric-list"><div><span>Validation MAE</span><strong>{analysis?.validation_mae ?? '—'}</strong></div><div><span>Naïve MAE</span><strong>{analysis?.naive_mae ?? '—'}</strong></div><div><span>R²</span><strong>{analysis?.r_squared ?? '—'}</strong></div><div><span>Observations</span><strong>{analysis?.observations ?? analysis?.available ?? 0}</strong></div></div>
            <p className="fine-print">The forecast is experimental and never replaces NEA forecasts or health guidance. Only the latest uninterrupted hourly sequence is modelled. Confidence ranges reflect historical residual variation, not all sources of uncertainty.</p>
          </article>
        </div>
      </section>

      <section className="trust-strip">
        <div><strong>Official source</strong><span>NEA via data.gov.sg</span></div><div><strong>Visible freshness</strong><span>{meta?.data_age_minutes != null ? `${Math.round(meta.data_age_minutes)} minutes old` : 'Checking'}</span></div><div><strong>Quality policy</strong><span>Spikes are flagged, never silently removed</span></div><div><strong>Last observation</strong><span>{localTime(readings[0]?.reading_timestamp, {day:true})}</span></div>
      </section>

      <footer><div className="brand"><span className="brand-mark">SG</span><span>ClearSky</span></div><p>Educational portfolio project. Always refer to NEA and MOH for official advisories.</p><a href="https://github.com/Chuyue363/singapore-haze-monitor" target="_blank" rel="noreferrer">View source ↗</a></footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
