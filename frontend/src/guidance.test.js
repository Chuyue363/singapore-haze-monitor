import assert from 'node:assert/strict'
import test from 'node:test'

import { pmBand, pmGuidance, psiGuidance } from './guidance.js'

test('uses the official one-hour PM2.5 band boundaries', () => {
  assert.equal(pmBand(55), 'Normal')
  assert.equal(pmBand(56), 'Elevated')
  assert.equal(pmBand(150), 'Elevated')
  assert.equal(pmBand(151), 'High')
  assert.equal(pmBand(250), 'High')
  assert.equal(pmBand(251), 'Very high')
})

test('provides healthy-person guidance for every PM2.5 band', () => {
  assert.equal(pmGuidance(55, 'healthy'), 'Continue with normal activities.')
  assert.equal(pmGuidance(56, 'healthy'), 'Reduce strenuous outdoor activity for the next hour.')
  assert.equal(pmGuidance(151, 'healthy'), 'Avoid strenuous outdoor activity for the next hour.')
  assert.equal(pmGuidance(251, 'healthy'), 'Minimise all outdoor activity for the next hour.')
})

test('gives vulnerable profiles the stricter immediate guidance', () => {
  for (const profile of ['sensitive', 'chronic']) {
    assert.equal(pmGuidance(56, profile), 'Avoid strenuous outdoor activity for the next hour.')
    assert.equal(pmGuidance(151, profile), 'Avoid all outdoor activity for the next hour.')
    assert.equal(pmGuidance(251, profile), 'Avoid all outdoor activity for the next hour.')
  }
})

test('preserves profile-specific 24-hour PSI guidance', () => {
  assert.equal(psiGuidance(150, 'healthy'), 'Reduce prolonged or strenuous outdoor physical exertion.')
  assert.equal(psiGuidance(150, 'sensitive'), 'Minimise prolonged or strenuous outdoor physical exertion.')
  assert.equal(psiGuidance(150, 'chronic'), 'Avoid prolonged or strenuous outdoor physical exertion.')
})
