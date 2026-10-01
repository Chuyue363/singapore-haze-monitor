# Architecture

The application uses a small number of components deliberately:

1. An ingestion command calls the official data.gov.sg APIs with bounded retry and backoff.
2. The ingestion layer normalises timestamps and regional fields, validates every row, compares possible regional outliers only with the same observation timestamp, and writes observations plus an audit record to SQLite.
3. Flask exposes latest, history, export, summary, and model endpoints. When a live refresh fails it serves the last known valid observation with explicit stale metadata.
4. React renders the dashboard and never receives the data.gov.sg API key.
5. A multi-stage production container compiles the React application and serves it beside the Flask API through Gunicorn.

The database stores both the provider's reading timestamp and update timestamp. The latest query ranks observations independently within each region so a slightly delayed region is not dropped. Overall freshness uses the oldest of those five regional readings and reports missing regions explicitly.

Cache policy follows response semantics: forced refreshes, health checks, and errors are never stored; ordinary read-only API responses use a short stale-if-error window; and fingerprinted frontend assets can be cached immutably.

Operations distinguish liveness from readiness. The container liveness probe confirms that Flask can respond without depending on external data, while readiness returns a failure status until all five regions are present and the oldest regional reading is within the allowed freshness window.

Refresh outcomes emit structured, non-sensitive operational events and are persisted in the ingestion audit. The next production improvements are a separate scheduled worker, centralised log shipping, and external freshness alerting. A queue, cache, or microservice split is not justified until traffic or ingestion volume requires one.
