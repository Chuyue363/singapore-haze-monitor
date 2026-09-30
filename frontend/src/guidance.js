/** @typedef {'healthy' | 'sensitive' | 'chronic'} HealthProfile */

/**
 * @param {number | null | undefined} value
 * @returns {{ label: string, tone: string, guidance: string }}
 */
export function psiBand(value) {
  if (value == null) return { label: 'Awaiting data', tone: 'unknown', guidance: 'No current reading is available.' }
  if (value <= 50) return { label: 'Good', tone: 'good', guidance: 'Normal activities can continue.' }
  if (value <= 100) return { label: 'Moderate', tone: 'moderate', guidance: 'Normal activities can generally continue.' }
  if (value <= 200) return { label: 'Unhealthy', tone: 'unhealthy', guidance: 'Reduce prolonged or strenuous outdoor activity.' }
  if (value <= 300) return { label: 'Very unhealthy', tone: 'very-unhealthy', guidance: 'Avoid prolonged or strenuous outdoor activity.' }
  return { label: 'Hazardous', tone: 'hazardous', guidance: 'Minimise outdoor activity and follow official guidance.' }
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function pmBand(value) {
  if (value == null) return 'No reading'
  if (value <= 55) return 'Normal'
  if (value <= 150) return 'Elevated'
  if (value <= 250) return 'High'
  return 'Very high'
}

/**
 * @param {number | null | undefined} value
 * @param {HealthProfile} profile
 * @returns {string}
 */
export function psiGuidance(value, profile) {
  if (value == null) return 'No current PSI reading is available.'
  if (value <= 100) return 'Normal activities can continue.'
  if (profile === 'chronic') {
    return value <= 200
      ? 'Avoid prolonged or strenuous outdoor physical exertion.'
      : 'Avoid outdoor activity.'
  }
  if (profile === 'sensitive') {
    if (value <= 200) return 'Minimise prolonged or strenuous outdoor physical exertion.'
    return value <= 300 ? 'Minimise outdoor activity.' : 'Avoid outdoor activity.'
  }
  if (value <= 200) return 'Reduce prolonged or strenuous outdoor physical exertion.'
  return value <= 300 ? 'Avoid prolonged or strenuous outdoor physical exertion.' : 'Minimise outdoor activity.'
}

/**
 * @param {number | null | undefined} value
 * @param {HealthProfile} profile
 * @returns {string}
 */
export function pmGuidance(value, profile) {
  if (value == null) return 'No current 1-hour PM2.5 reading is available.'
  if (value <= 55) return 'Continue with normal activities.'

  const vulnerable = profile !== 'healthy'
  if (value <= 150) {
    return vulnerable
      ? 'Avoid strenuous outdoor activity for the next hour.'
      : 'Reduce strenuous outdoor activity for the next hour.'
  }
  if (value <= 250) {
    return vulnerable
      ? 'Avoid all outdoor activity for the next hour.'
      : 'Avoid strenuous outdoor activity for the next hour.'
  }
  return vulnerable
    ? 'Avoid all outdoor activity for the next hour.'
    : 'Minimise all outdoor activity for the next hour.'
}
