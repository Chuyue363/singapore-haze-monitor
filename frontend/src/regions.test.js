import test from 'node:test'
import assert from 'node:assert/strict'

import { REGION_TOWNS, regionForTown } from './regions.js'

test('maps representative towns to their NEA reporting regions', () => {
  assert.equal(regionForTown('Woodlands'), 'north')
  assert.equal(regionForTown('Orchard'), 'south')
  assert.equal(regionForTown('Tampines'), 'east')
  assert.equal(regionForTown('Clementi'), 'west')
  assert.equal(regionForTown('Bishan'), 'central')
})

test('returns null for an unlisted or blank location', () => {
  assert.equal(regionForTown(''), null)
  assert.equal(regionForTown('Not a listed town'), null)
})

test('keeps town names unique for an unambiguous selector', () => {
  const towns = REGION_TOWNS.map(item => item.town)
  assert.equal(new Set(towns).size, towns.length)
})
