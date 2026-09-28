# Singapore Haze Monitor

Singapore air-quality monitoring and forecasting platform built as a portfolio project.

The project ingests official PSI and PM2.5 readings from Singapore's data.gov.sg APIs, validates and stores observations, and exposes a small Flask API for a React dashboard. The initial version prioritises data quality, transparent timestamps, and a clear separation between official observations and future experimental forecasts.

## Repository layout

```text
backend/       Flask API, ingestion client, database layer, tests
frontend/      React/Vite dashboard
docs/          Architecture and methodology notes
```

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app
```

The API runs at `http://localhost:5000`.

To fetch the latest official readings into the local database:

```bash
python -m ingestion.run_once
```

SQLite is used by default for local development. The schema is intentionally designed for a later PostgreSQL adapter; the current first milestone keeps the local setup dependency-light.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` requests to the Flask backend.

## Data sources

- PSI: `https://api-open.data.gov.sg/v2/real-time/api/psi`
- 1-hour PM2.5: `https://api-open.data.gov.sg/v2/real-time/api/pm25`

The backend keeps source timestamps and marks the provider on every stored observation. API keys belong in the backend environment, never in the browser.

## Current status

- [x] Official PSI and PM2.5 client
- [x] Normalised observation schema
- [x] SQLite development database
- [x] Flask latest/history endpoints
- [x] React regional dashboard
- [ ] Scheduled production worker
- [ ] Weather and hotspot enrichment
- [ ] Walk-forward forecast evaluation
- [ ] Alerts and notification preferences

## Important caveat

This project is an educational portfolio project and is not a replacement for NEA or MOH guidance. The interface should link to official advisories and show the freshness of every reading.
