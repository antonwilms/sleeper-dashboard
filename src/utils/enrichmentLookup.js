/**
 * src/utils/enrichmentLookup.js — Pure helpers for enrichment overlay lookups.
 *
 * All functions are null-safe: passing a null/undefined payload returns null
 * (or an empty array for getNotes). Consumers treat null as "no enrichment
 * available" and render baseline behaviour.
 *
 * Performance note:
 *   findInjuryForWeek performs a linear scan. This is fine at current scale
 *   (<500 entries). If entry count grows significantly, replace with a Map
 *   keyed by `${playerId}-${year}` built once at load time.
 */

/**
 * Finds the injury enrichment entry that covers a specific week for a player/year.
 *
 * Match rule:
 *   entry.playerId === playerId &&
 *   entry.year === year &&
 *   entry.segmentStartWeek <= week &&
 *   week <= (entry.segmentEndWeek ?? 18)
 *
 * @param {{ entries: object[] } | null | undefined} injuriesPayload
 * @param {string} playerId   Sleeper player_id
 * @param {number} year       Season year
 * @param {number} week       Week number (1-based)
 * @returns {object | null}   Matching InjuryEntry or null
 */
export function findInjuryForWeek(injuriesPayload, playerId, year, week) {
  if (!injuriesPayload || !Array.isArray(injuriesPayload.entries)) return null

  for (const entry of injuriesPayload.entries) {
    if (
      entry.playerId === String(playerId) &&
      entry.year === year &&
      entry.segmentStartWeek <= week &&
      week <= (entry.segmentEndWeek ?? 18)
    ) {
      return entry
    }
  }

  return null
}

/**
 * Returns coaching staff entries for a (team, year) pair.
 * Returns an object with HC, OC, DC keys, each being the matching entry or null.
 *
 * @param {{ entries: object[] } | null | undefined} coachingPayload
 * @param {string} team   NFL team abbreviation
 * @param {number} year   Season year
 * @returns {{ HC: object|null, OC: object|null, DC: object|null }}
 */
export function getCoaching(coachingPayload, team, year) {
  const result = { HC: null, OC: null, DC: null }
  if (!coachingPayload || !Array.isArray(coachingPayload.entries)) return result

  for (const entry of coachingPayload.entries) {
    if (entry.team === team && entry.year === year && entry.role in result) {
      result[entry.role] = entry
    }
  }

  return result
}

/**
 * Returns the scheme entry for a (team, year) pair, or null if not found.
 *
 * @param {{ entries: object[] } | null | undefined} schemePayload
 * @param {string} team   NFL team abbreviation
 * @param {number} year   Season year
 * @returns {object | null}
 */
export function getScheme(schemePayload, team, year) {
  if (!schemePayload || !Array.isArray(schemePayload.entries)) return null

  return schemePayload.entries.find(
    e => e.team === team && e.year === year
  ) ?? null
}

/**
 * Returns all note entries matching the given filter.
 * Exactly one of playerId/team must be set in opts; year is optional.
 *
 * @param {{ entries: object[] } | null | undefined} notesPayload
 * @param {{ playerId?: string, team?: string, year?: number }} opts
 * @returns {object[]}
 */
export function getNotes(notesPayload, { playerId, team, year } = {}) {
  if (!notesPayload || !Array.isArray(notesPayload.entries)) return []

  return notesPayload.entries.filter(e => {
    if (playerId != null && e.playerId !== String(playerId)) return false
    if (team != null && e.team !== team) return false
    if (year != null && e.year !== year) return false
    return true
  })
}
