# Architecture

The application uses a small number of components deliberately:

1. An ingestion command calls the official data.gov.sg APIs with bounded retry and backoff.
2. The ingestion layer normalises timestamps and regional fields, validates every row, and writes observations plus an audit record to SQLite.
3. Flask exposes latest, history, export, summary, and model endpoints. When a live refresh fails it serves the last known valid observation with explicit stale metadata.
4. React renders the dashboard and never receives the data.gov.sg API key.
5. A multi-stage production container compiles the React application and serves it beside the Flask API through Gunicorn.

The database stores both the provider's reading timestamp and update timestamp. This allows the UI to distinguish a genuinely old reading from a recently refreshed record.

The next production improvements are a separate scheduled worker, structured logs, and external freshness alerting. A queue, cache, or microservice split is not justified until traffic or ingestion volume requires one.
