import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('keeps production styles compatible with the same-origin content security policy', () => {
  assert.doesNotMatch(styles, /@import\s+url\(['"]?https?:\/\//i)
  assert.doesNotMatch(styles, /url\(['"]?https?:\/\//i)
})
