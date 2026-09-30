/**
 * Build an order-independent signature for data changes that should refresh dependent views.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @returns {string}
 */
export function readingsRevision(rows) {
  return rows.map(row => [
    row.region,
    row.reading_timestamp,
    row.updated_timestamp,
    row.psi_24h,
    row.pm25_1h,
    row.pm25_24h,
    row.quality_status,
  ].join(':')).sort().join('|')
}
