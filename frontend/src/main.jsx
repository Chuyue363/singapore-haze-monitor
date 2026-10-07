import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { requestJSON } from './api.js'
import { pmBand, pmGuidance, psiBand, psiGuidance } from './guidance.js'
import { readingsRevision, withHourlyMovingAverage } from './readings.js'
import { REGION_TOWNS, regionForTown } from './regions.js'
import './styles.css'

const HistoryChart = lazy(() => import('./Charts.jsx').then(module => ({ default: module.HistoryChart })))
const ForecastChart = lazy(() => import('./Charts.jsx').then(module => ({ default: module.ForecastChart })))

const REGIONS = ['north', 'south', 'east', 'west', 'central']
const HEALTH_PROFILES = [
  { id: 'healthy', label: 'Healthy adult' },
  { id: 'sensitive', label: 'Elderly / pregnant / child' },
  { id: 'chronic', label: 'Heart / lung condition' },
]

function localTime(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit',
    day: options.day ? 'numeric' : undefined, month: options.day ? 'short' : undefined,
  }).format(new Date(value))
}

function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString('en-SG') : '—'
}

function formatSkill(value) {
  if (typeof value !== 'number') return '—'
  return `${value > 0 ? '+' : ''}${value}%`
}

function Skeleton({ className = '' }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />
}

function ChartLoading() {
  return <div className="chart-loading" role="status" aria-label="Loading chart"><Skeleton/><Skeleton/><Skeleton/></div>
}

function ValidationPeriods({ analysis }) {
  const periods = analysis?.validation_periods || []
  if (analysis?.status !== 'ready' || periods.length === 0) return null

  return <article className="panel period-panel">
    <div className="period-heading">
      <div><p className="eyebrow">CHRONOLOGICAL STABILITY</p><h3>{analysis.periods_beating_naive}/{periods.length} periods beat persistence</h3></div>
      <p>Consecutive slices of the held-out walk-forward sample</p>
    </div>
    <div className="period-grid">
      {periods.map((period, index) => <div className="period-card" key={period.start}>
        <span>Period {index + 1} · {period.samples} points</span>
        <strong className={period.beats_naive ? 'positive-skill' : 'negative-skill'}>{formatSkill(period.skill_percent)}</strong>
        <small>{localTime(period.start, { day: true })} – {localTime(period.end, { day: true })}</small>
        <p>Model MAE {period.model_mae} · persistence {period.naive_mae}</p>
      </div>)}
    </div>
    <p className="period-note">Periods test consistency through time; they are not independent haze episodes. Positive skill means the model made smaller errors than simply repeating the previous reading.</p>
  </article>
}

function RegionCard({ region, reading, selected, onSelect }) {
  const status = psiBand(reading?.psi_24h)
  const label = `${region} region: 24-hour PSI ${reading?.psi_24h ?? 'unavailable'}, ${status.label}; 1-hour PM2.5 ${reading?.pm25_1h ?? 'unavailable'} micrograms per cubic metre`
  return (
    <button type="button" className={`region-card ${status.tone} ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={label}>
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
  return <section className="region-grid" aria-label="Loading regional air-quality readings">{REGIONS.map(region => (
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
  const [analysis, setAnalysis] = useState({ status: 'loading' })
  const [meta, setMeta] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [selected, setSelected] = useState('central')
  const [selectedTown, setSelectedTown] = useState('')
  const [healthProfile, setHealthProfile] = useState('healthy')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const latestControllerRef = useRef(null)
  const readingsRevisionRef = useRef('')

  const loadLatest = useCallback(async (force = false) => {
    if (latestControllerRef.current) {
      if (!force) return
      latestControllerRef.current.abort()
    }
    const controller = new AbortController()
    latestControllerRef.current = controller
    if (force) setRefreshing(true)
    try {
      const payload = await requestJSON(
        `/api/readings/latest${force ? '?refresh=true' : ''}`,
        { timeoutMs: force ? 30000 : 15000, signal: controller.signal },
      )
      const revision = readingsRevision(payload.data)
      if (revision !== readingsRevisionRef.current) {
        readingsRevisionRef.current = revision
        setReadings(payload.data)
      }
      setMeta(payload.meta)
      setError('')
      requestJSON('/api/summary')
        .then(summaryPayload => setPipeline(summaryPayload.data))
        .catch(() => setPipeline(null))
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Live readings are temporarily unavailable. Please try again shortly.')
      }
    } finally {
      if (latestControllerRef.current === controller) {
        latestControllerRef.current = null
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadLatest()
    return () => {
      const controller = latestControllerRef.current
      latestControllerRef.current = null
      controller?.abort()
    }
  }, [loadLatest])
  useEffect(() => {
    const intervalId = setInterval(() => loadLatest(), 5 * 60 * 1000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadLatest()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadLatest])
  useEffect(() => {
    if (loading) return undefined
    const controller = new AbortController()
    let active = true
    setHistory([])
    setHistoryLoading(true)
    setHistoryError('')
    setAnalysis({ status: 'loading' })

    requestJSON(
      `/api/readings/history?region=${selected}&limit=168`,
      { signal: controller.signal },
    ).then(historyPayload => {
      if (active) setHistory(historyPayload.data)
    }).catch(requestError => {
      if (active && requestError.name !== 'AbortError') {
        setHistoryError('Historical readings are temporarily unavailable.')
      }
    }).finally(() => {
      if (active) setHistoryLoading(false)
    })

    requestJSON(
      `/api/analysis/regression?region=${selected}&horizon=3`,
      { signal: controller.signal },
    ).then(analysisPayload => {
      if (active) setAnalysis(analysisPayload.analysis)
    }).catch(requestError => {
      if (active && requestError.name !== 'AbortError') {
        setAnalysis({
          status: 'unavailable',
          message: 'Model analysis is temporarily unavailable. Live official readings are unaffected.',
        })
      }
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [selected, readings, loading])

  const byRegion = useMemo(() => Object.fromEntries(readings.map(row => [row.region, row])), [readings])
  const selectedReading = byRegion[selected]
  const selectedStatus = psiBand(selectedReading?.psi_24h)
  const chartData = useMemo(() => withHourlyMovingAverage(history).map(row => ({
    ...row,
    label: localTime(row.reading_timestamp, { day: true }),
  })), [history])
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
      <a className="skip-link" href="#regional-overview">Skip to regional readings</a>
      <nav className="nav-shell">
        <a className="brand" href="#top"><span className="brand-mark">SG</span><span>ClearSky</span></a>
        <div className="nav-actions">
          <span className={`source-pill ${meta?.stale ? 'stale' : ''}`} aria-live="polite"><span />{meta?.stale ? 'Stored data' : 'Official data live'}</span>
          <button type="button" className="refresh-button" onClick={() => loadLatest(true)} disabled={refreshing} aria-label={refreshing ? 'Refreshing official readings' : 'Refresh official readings'}>
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
        <aside className={`hero-status ${selectedStatus.tone}`} aria-live="polite">
          <span className="metric-kicker">Highest current PM2.5</span>
          {loading ? <Skeleton className="number"/> : <><strong>{highest?.pm25_1h ?? '—'}</strong><small>µg/m³ · {highest?.region ?? 'No region'}</small></>}
          <p>{highest ? pmBand(highest.pm25_1h) : 'Waiting for official readings'}</p>
        </aside>
      </header>

      {error && <div className="error-banner" role="alert"><strong>Connection issue</strong><span>{error}</span><button type="button" onClick={() => loadLatest(true)}>Try again</button></div>}

      <section className="section-heading" id="regional-overview">
        <div><p className="eyebrow">RIGHT NOW</p><h2 id="regional-heading">Regional overview</h2></div>
        <p>{meta?.data_age_minutes != null ? `Oldest regional reading: ${Math.round(meta.data_age_minutes)} min` : 'Retrieving latest observations'}</p>
      </section>
      <LocationHelper town={selectedTown} selectedRegion={selected} onSelect={selectTown}/>
      {loading ? <LoadingCards/> : <section className="region-grid" aria-labelledby="regional-heading">
        {REGIONS.map(region => <RegionCard key={region} region={region} reading={byRegion[region]} selected={selected === region} onSelect={() => selectRegion(region)} />)}
      </section>}

      <section className="analysis-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div><p className="eyebrow">7-DAY SIGNAL</p><h2>{selected} PM2.5 trend</h2></div>
            <div className="chart-actions">
              <a className="export-link" href={`/api/readings/export.csv?region=${selected}&limit=1000`}>Export CSV ↓</a>
              <div className="region-tabs" role="group" aria-label="Select air quality region">{REGIONS.map(region => <button type="button" aria-pressed={selected === region} className={selected === region ? 'active' : ''} onClick={() => selectRegion(region)} key={region}>{region}</button>)}</div>
            </div>
          </div>
          <div className="chart-wrap" role="region" aria-busy={historyLoading} aria-label={`Seven-day PM2.5 history for ${selected} Singapore`}>
            {historyLoading ? <ChartLoading/> : historyError ? <div className="empty-chart"><span>History unavailable</span><p>{historyError}</p></div> : chartData.length > 1 ? <Suspense fallback={<ChartLoading/>}><HistoryChart data={chartData}/></Suspense> : <div className="empty-chart"><span>Collecting history</span><p>Run the backfill command to populate a seven-day trend and unlock regression analysis.</p></div>}
          </div>
        </article>

        <aside className={`panel decision-panel ${selectedStatus.tone}`}>
          <p className="eyebrow">24-HOUR EXPOSURE CONTEXT</p><h2>{selectedStatus.label}</h2>
          <div className="profile-tabs" role="group" aria-label="Choose health profile">{HEALTH_PROFILES.map(profile => <button type="button" aria-pressed={healthProfile === profile.id} key={profile.id} className={healthProfile === profile.id ? 'active' : ''} onClick={() => setHealthProfile(profile.id)}>{profile.label}</button>)}</div>
          <p className="decision-copy">{psiGuidance(selectedReading?.psi_24h, healthProfile)}</p>
          <dl><div><dt>24-hour PSI</dt><dd>{selectedReading?.psi_24h ?? '—'}</dd></div><div><dt>1-hour PM2.5</dt><dd>{selectedReading?.pm25_1h ?? '—'} <small>µg/m³</small></dd></div><div><dt>Region</dt><dd className="capitalize">{selected}</dd></div></dl>
          <p className="immediate-note" aria-live="polite"><strong>{pmBand(selectedReading?.pm25_1h)} now.</strong> {pmGuidance(selectedReading?.pm25_1h, healthProfile)}</p>
          <a href="https://www.haze.gov.sg/" target="_blank" rel="noreferrer">Check official advisory ↗</a>
        </aside>
      </section>

      <section className="model-section">
        <div className="section-heading"><div><p className="eyebrow">MODEL TRANSPARENCY</p><h2>Experimental three-hour outlook</h2></div><p>Autoregressive OLS · walk-forward evaluated</p></div>
        <div className="model-grid">
          <article className="panel forecast-panel">
            {analysis?.status === 'loading' ? <div className="forecast-chart" aria-busy="true"><ChartLoading/></div> : analysis?.status === 'ready' ? <>
              <div className="forecast-chart"><Suspense fallback={<ChartLoading/>}><ForecastChart data={analysis.forecast}/></Suspense></div>
              <div className="forecast-values">{analysis.forecast.map(item => <div key={item.timestamp}><span>{localTime(item.timestamp)}</span><strong>{item.pm25_1h}</strong><small>{item.lower}–{item.upper} µg/m³</small></div>)}</div>
            </> : <div className="model-empty"><span className="model-icon">∿</span><h3>{analysis?.status === 'unavailable' ? 'Analysis unavailable' : 'Building the evidence base'}</h3><p>{analysis?.message || 'Analysis becomes available after enough validated hourly readings have been stored.'}</p>{analysis?.status === 'insufficient_data' && <small>{analysis.available} / {analysis.required} observations available</small>}</div>}
          </article>
          <article className="panel metrics-panel">
            <p className="eyebrow">VALIDATION</p>
            <h3>{analysis?.status === 'ready' ? (analysis.beats_naive ? 'Model beats persistence' : 'Baseline remains stronger') : analysis?.status === 'loading' ? 'Refreshing validation' : analysis?.status === 'unavailable' ? 'Validation unavailable' : 'Pending sufficient data'}</h3>
            <div className="metric-list"><div><span>Walk-forward MAE</span><strong>{analysis?.validation_mae ?? '—'}</strong></div><div><span>Persistence MAE</span><strong>{analysis?.naive_mae ?? '—'}</strong></div><div><span>Skill vs persistence</span><strong>{formatSkill(analysis?.skill_percent)}</strong></div><div><span>In-sample R²</span><strong>{analysis?.r_squared ?? '—'}</strong></div><div><span>Validation points</span><strong>{analysis?.validation_samples ?? '—'}</strong></div><div><span>Observations</span><strong>{analysis?.observations ?? analysis?.available ?? '—'}</strong></div></div>
            <p className="fine-print">Positive skill means lower error than persistence; no percentage is shown when persistence is perfect. Each validation prediction uses only prior observations. Horizon ranges use walk-forward errors with a residual fallback. This experiment never replaces NEA guidance.</p>
          </article>
        </div>
        <ValidationPeriods analysis={analysis}/>
      </section>

      <section className="panel pipeline-panel" aria-label="Data pipeline audit">
        <div className="pipeline-copy">
          <p className="eyebrow">DATA PIPELINE AUDIT</p>
          <h2>Quality checks you can inspect</h2>
          <p>Every provider row passes schema, range, deduplication, and same-timestamp regional anomaly checks. Possible spikes remain visible and are marked for review.</p>
          <small>{pipeline?.first_timestamp ? `${localTime(pipeline.first_timestamp, { day: true })} to ${localTime(pipeline.latest_timestamp, { day: true })}` : 'Coverage builds as official observations are ingested.'}</small>
        </div>
        <div className="pipeline-metrics">
          <div><strong>{formatCount(pipeline?.rows)}</strong><span>validated regional rows</span></div>
          <div><strong>{formatCount(pipeline?.timestamps)}</strong><span>observation timestamps</span></div>
          <div><strong>{formatCount(pipeline?.review_rows)}</strong><span>retained review flags</span></div>
          <div><strong>{formatCount(pipeline?.last_ingestion?.inserted)}</strong><span>{pipeline?.last_ingestion ? `${pipeline.last_ingestion.status} · new rows last ingestion` : 'new rows last ingestion'}</span></div>
        </div>
      </section>

      <section className="trust-strip">
        <div><strong>Official source</strong><span>NEA via data.gov.sg</span></div><div><strong>Regional coverage</strong><span>{meta ? `${meta.regions_reporting}/5 regions · ${meta.data_age_minutes == null ? 'no observations' : `oldest ${Math.round(meta.data_age_minutes)} min`}` : 'Checking'}</span></div><div><strong>Quality policy</strong><span>Spikes are flagged, never silently removed</span></div><div><strong>Selected observation</strong><span>{localTime(selectedReading?.reading_timestamp, {day:true})}</span></div>
      </section>

      <footer><div className="brand"><span className="brand-mark">SG</span><span>ClearSky</span></div><p>Educational portfolio project. Always refer to NEA and MOH for official advisories.</p><a href="https://github.com/Chuyue363/singapore-haze-monitor" target="_blank" rel="noreferrer">View source ↗</a></footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
