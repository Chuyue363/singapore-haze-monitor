import assert from 'node:assert/strict'
import test from 'node:test'

import { readingsRevision } from './readings.js'

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
