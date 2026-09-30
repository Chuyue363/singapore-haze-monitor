import assert from 'node:assert/strict'
import test from 'node:test'

import { requestJSON } from './api.js'

test('returns parsed JSON for a successful response', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal)
    return { ok: true, json: async () => ({ status: 'ok' }) }
  })

  assert.deepEqual(await requestJSON('/api/example'), { status: 'ok' })
})

test('reports non-successful HTTP responses', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }))

  await assert.rejects(requestJSON('/api/example'), /Request failed \(503\)/)
})

test('aborts a request after its deadline', async t => {
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  }))

  await assert.rejects(requestJSON('/api/slow', { timeoutMs: 5 }), /Request timed out/)
})

test('forwards caller cancellation without misreporting a timeout', async t => {
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  }))
  const controller = new AbortController()

  const pending = requestJSON('/api/cancelled', { signal: controller.signal })
  controller.abort()

  await assert.rejects(pending, error => error.name === 'AbortError')
})
