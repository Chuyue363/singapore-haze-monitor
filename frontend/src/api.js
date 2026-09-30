/**
 * @typedef {RequestInit & { timeoutMs?: number }} JSONRequestOptions
 */

/**
 * Fetch JSON with a bounded wait and optional caller cancellation.
 *
 * @param {string} url
 * @param {JSONRequestOptions} [options]
 * @returns {Promise<unknown>}
 */
export async function requestJSON(url, options = {}) {
  const { timeoutMs = 15000, signal: parentSignal, ...fetchOptions } = options
  const controller = new AbortController()
  const deadlineMs = Math.max(1, timeoutMs)
  let timedOut = false

  const forwardAbort = () => controller.abort()
  if (parentSignal?.aborted) {
    forwardAbort()
  } else {
    parentSignal?.addEventListener('abort', forwardAbort, { once: true })
  }

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, deadlineMs)

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal })
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    return await response.json()
  } catch (error) {
    if (timedOut) throw new Error(`Request timed out after ${deadlineMs} ms`, { cause: error })
    throw error
  } finally {
    clearTimeout(timeoutId)
    parentSignal?.removeEventListener('abort', forwardAbort)
  }
}
