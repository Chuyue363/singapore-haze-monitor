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

/**
 * Add a moving average only when the complete window contains valid, consecutive hourly readings.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} windowSize
 * @returns {Array<Record<string, unknown>>}
 */
export function withHourlyMovingAverage(rows, windowSize = 3) {
  return rows.map((row, index) => {
    const window = rows.slice(index - windowSize + 1, index + 1)
    const complete = window.length === windowSize
    const validValues = complete && window.every(item => typeof item.pm25_1h === 'number')
    const consecutive = complete && window.every((item, windowIndex) => {
      if (windowIndex === 0) return true
      const current = Date.parse(String(item.reading_timestamp))
      const previous = Date.parse(String(window[windowIndex - 1].reading_timestamp))
      return Number.isFinite(current) && Number.isFinite(previous) && current - previous === 3600000
    })
    const average = validValues && consecutive
      ? Math.round(window.reduce((sum, item) => sum + Number(item.pm25_1h), 0) / windowSize * 10) / 10
      : null
    return { ...row, pm25_ma3: average }
  })
}
