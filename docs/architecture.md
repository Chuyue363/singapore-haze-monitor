# Architecture

The first version uses a small number of components deliberately:

1. A scheduled ingestion job calls official data.gov.sg APIs.
2. The ingestion layer normalises timestamps and regional fields, then writes observations to SQLite in the first local milestone. The schema is designed for a later PostgreSQL adapter.
3. Flask exposes read-only endpoints for latest readings and historical observations.
4. React renders the dashboard and never receives the data.gov.sg API key.

The database stores both the provider's reading timestamp and update timestamp. This allows the UI to distinguish a genuinely old reading from a recently refreshed record.

The next production improvements are a separate worker process, retries with exponential backoff, structured logs, and a freshness monitor. A queue, cache, or microservice split is not justified until traffic or ingestion volume requires one.
