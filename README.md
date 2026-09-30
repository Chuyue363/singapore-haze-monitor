# Singapore Haze Monitor

A full-stack air-quality dashboard built around official Singapore readings, auditable data cleaning, and an explicitly experimental short-term PM2.5 model.

The product answers three different questions without conflating them:

- **What is the air like now?** Regional 1-hour PM2.5 readings and official NEA bands.
- **What has prolonged exposure been like?** Rolling 24-hour PSI and profile-specific official activity guidance.
- **What might happen over the next three hours?** A small autoregressive model, shown with validation error, a naïve baseline, and uncertainty ranges.

> This is an educational portfolio project, not an official forecast or medical service. Always use [haze.gov.sg](https://www.haze.gov.sg/) and MOH guidance for decisions.

## Highlights

- Live and historical PSI / PM2.5 ingestion from data.gov.sg
- Five-region dashboard with per-region latest readings, coverage checks, and conservative stale-data states
- Schema validation, deduplication, range checks, and timestamp-scoped cross-region review flags
- Retry and backoff for upstream rate limits; last-known-valid data remains available during outages
- Seven-day signal chart, 3-hour moving average, and auditable CSV export
- Visible pipeline audit with validated-row, observation, review-flag, and ingestion counts
- Privacy-preserving town selector mapped to NEA's five reporting regions
- Official health-profile actions that keep immediate 1-hour PM2.5 guidance separate from 24-hour PSI exposure guidance
- Gap-safe autoregressive OLS model with expanding-window walk-forward evaluation against persistence
- Responsive loading, error, empty, timeout, and insufficient-data states with obsolete request cancellation
- Isolated backend tests, reproducible frontend lockfile, CI, and production container

## Architecture

```text
data.gov.sg PSI + PM2.5 APIs
             │
             ▼
  retry → normalise → validate → deduplicate
             │
             ▼
     SQLite (local / single instance)
             │
             ▼
 Flask JSON + CSV API ── React dashboard
             │
             └── OLS analysis on latest contiguous hourly segment
```

The API key, if one is supplied, stays on the server. Source observation time, provider update time, ingestion time, quality status, and quality notes are stored separately.

## Run locally

Requirements: Python 3.12+ and Node.js 22+.

```bash
git clone https://github.com/Chuyue363/singapore-haze-monitor.git
cd singapore-haze-monitor

python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env

PYTHONPATH=backend python -m ingestion.backfill --days 7
python -m app
```

The backend starts on `http://localhost:5050`. In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to port 5050; override that with `VITE_API_PROXY` if needed.

## Test and build

```bash
backend/.venv/bin/python -m pytest -q backend/tests
npm --prefix frontend test
npm --prefix frontend run build
```

CI repeats both checks and builds the production container on every push and pull request.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service, oldest-region freshness, missing regions, database, and last-ingestion status |
| `GET /api/readings/latest` | Latest reading per region with coverage metadata; refreshes stale or incomplete data |
| `GET /api/readings/history?region=central&limit=168` | Chronological regional history |
| `GET /api/readings/export.csv?region=central` | Auditable regional CSV export |
| `GET /api/analysis/regression?region=central&horizon=3` | Model metrics and bounded forecast horizon |
| `GET /api/summary` | Compact dataset and current-reading summary |

## Model methodology

The current model predicts 1-hour PM2.5 using the previous hour, trailing 3-hour mean, and trailing 3-hour trend. It:

1. deduplicates observations by timestamp;
2. uses only the latest uninterrupted hourly segment;
3. reserves the newest 20% of samples for expanding-window walk-forward validation;
4. refits using only prior observations at every validation step and reports MAE beside a persistence baseline (the previous value); and
5. derives each horizon's range from the 90th percentile of its walk-forward absolute errors when at least five are available; and
6. refits on all eligible observations only after evaluation, for the displayed three-hour recursive estimate.

Sparse horizons fall back to an approximate residual-based range. Neither method captures weather, wind, fire, satellite, or policy information, and the result must not be interpreted as an NEA forecast. See [methodology notes](docs/methodology.md) for limitations and next experiments.

## Data sources and interpretation

- [data.gov.sg PSI API](https://api-open.data.gov.sg/v2/real-time/api/psi)
- [data.gov.sg PM2.5 API](https://api-open.data.gov.sg/v2/real-time/api/pm25)
- [NEA haze portal](https://www.haze.gov.sg/)
- [NEA 1-hour PM2.5 and 24-hour PSI activity guide](https://www.haze.gov.sg/docs/default-source/posters/haze-pm-psi-guide-a4-english.pdf)

Singapore's 24-hour PSI and 1-hour PM2.5 are different measures. The dashboard preserves their official names, units, bands, and intended time horizons instead of converting them into a foreign AQI.

## Production

Build a single container that serves the React bundle and Flask API:

```bash
docker build -t singapore-haze-monitor .
docker run --rm -p 8080:8080 -v haze-data:/data singapore-haze-monitor
```

A production deployment still needs persistent storage and a scheduled call to `python -m ingestion.run_once`. SQLite is appropriate for this single-instance portfolio deployment; use PostgreSQL before horizontally scaling writers.

## Roadmap

- Multi-period evaluation across distinct haze and non-haze episodes
- Weather, wind, rainfall, and regional hotspot features with source-aware timestamps
- Scheduled production ingestion and freshness alerting
- Optional text search and aliases for the location-to-region helper
- User-controlled alerts only after false-positive and notification design is validated
