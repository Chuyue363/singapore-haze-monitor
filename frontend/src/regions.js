/** @typedef {'north' | 'south' | 'east' | 'west' | 'central'} Region */

/** @type {ReadonlyArray<Readonly<{ town: string, region: Region }>>} */
export const REGION_TOWNS = Object.freeze([
  { town: 'Admiralty', region: 'north' },
  { town: 'Ang Mo Kio', region: 'central' },
  { town: 'Bedok', region: 'east' },
  { town: 'Bishan', region: 'central' },
  { town: 'Bukit Batok', region: 'west' },
  { town: 'Bukit Merah', region: 'south' },
  { town: 'Bukit Panjang', region: 'west' },
  { town: 'Bukit Timah', region: 'south' },
  { town: 'Choa Chu Kang', region: 'west' },
  { town: 'City', region: 'south' },
  { town: 'Clementi', region: 'west' },
  { town: 'East Coast', region: 'east' },
  { town: 'Hillview', region: 'west' },
  { town: 'Holland', region: 'south' },
  { town: 'Hougang', region: 'east' },
  { town: 'Jurong East', region: 'west' },
  { town: 'Jurong Industrial Estate', region: 'west' },
  { town: 'Jurong Island', region: 'west' },
  { town: 'Jurong West', region: 'west' },
  { town: 'Kallang', region: 'east' },
  { town: 'Katong', region: 'east' },
  { town: 'Kranji', region: 'north' },
  { town: 'Lim Chu Kang', region: 'west' },
  { town: 'Loyang', region: 'east' },
  { town: 'Macpherson', region: 'east' },
  { town: 'MacRitchie', region: 'central' },
  { town: 'Marina South', region: 'south' },
  { town: 'Marymount', region: 'central' },
  { town: 'Newton', region: 'south' },
  { town: 'Orchard', region: 'south' },
  { town: 'Pasir Panjang', region: 'south' },
  { town: 'Pasir Ris', region: 'east' },
  { town: 'Pulau Tekong', region: 'east' },
  { town: 'Pulau Ubin', region: 'east' },
  { town: 'Punggol', region: 'north' },
  { town: 'Queenstown', region: 'south' },
  { town: 'Seletar', region: 'north' },
  { town: 'Sembawang', region: 'north' },
  { town: 'Sengkang', region: 'north' },
  { town: 'Sentosa', region: 'south' },
  { town: 'Serangoon', region: 'east' },
  { town: 'Serangoon Gardens', region: 'central' },
  { town: 'Simei', region: 'east' },
  { town: 'Sin Ming', region: 'central' },
  { town: 'Tampines', region: 'east' },
  { town: 'Telok Blangah', region: 'south' },
  { town: 'Thomson', region: 'central' },
  { town: 'Toa Payoh', region: 'central' },
  { town: 'Tuas', region: 'west' },
  { town: 'West Coast', region: 'west' },
  { town: 'Woodlands', region: 'north' },
  { town: 'Yio Chu Kang', region: 'north' },
  { town: 'Yishun', region: 'north' },
])

/**
 * Resolve an NEA reporting region from an exact town selection.
 *
 * @param {string} town
 * @returns {Region | null}
 */
export function regionForTown(town) {
  return REGION_TOWNS.find(item => item.town === town)?.region ?? null
}
