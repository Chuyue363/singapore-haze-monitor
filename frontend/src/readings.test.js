import assert from 'node:assert/strict'
import test from 'node:test'

import { readingsRevision, withHourlyMovingAverage } from './readings.js'

const north = {
  region: 'north',
  reading_timestamp: '2026-10-01T03:00:00+08:00',
  updated_timestamp: '2026-10-01T03:05:00+08:00',
  psi_24h: 70,
  pm25_1h: 28,
  pm25_24h: 24,
  quality_status: 'valid',
}
const south = { ...north, region: 'south', pm25_1h: 30 }

test('reading revisions do not depend on API row order', () => {
  assert.equal(readingsRevision([north, south]), readingsRevision([south, north]))
})

test('reading revisions change when an observation is corrected', () => {
  assert.notEqual(
    readingsRevision([north, south]),
    readingsRevision([north, { ...south, pm25_1h: 31 }]),
  )
})

test('moving average requires three consecutive hourly values', () => {
  const rows = [0, 1, 2, 4, 5, 6].map((hour, index) => ({
    reading_timestamp: `2026-10-01T${String(hour).padStart(2, '0')}:00:00+08:00`,
    pm25_1h: 20 + index * 10,
  }))

  const result = withHourlyMovingAverage(rows)

  assert.deepEqual(result.map(row => row.pm25_ma3), [null, null, 30, null, null, 60])
})

test('moving average preserves gaps caused by missing measurements', () => {
  const rows = [20, 30, null, 50, 60, 70].map((value, hour) => ({
    reading_timestamp: `2026-10-01T${String(hour).padStart(2, '0')}:00:00+08:00`,
    pm25_1h: value,
  }))

  const result = withHourlyMovingAverage(rows)

  assert.deepEqual(result.map(row => row.pm25_ma3), [null, null, null, null, null, 60])
})
