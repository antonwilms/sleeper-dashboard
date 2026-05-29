/**
 * src/api/enrichment.js — App-side loader for the enrichment overlay.
 *
 * Fetches all four enrichment files from the data store in parallel.
 * Returns { coaching, scheme, injuries, notes } where each value is the
 * parsed payload or null if the file is missing, unreachable, or fails the
 * shape check.
 *
 * Validation at read time is intentionally lenient: only the top-level
 * wrapper shape (schemaVersion integer, entries array) is checked.
 * Malformed individual entries are silently ignored by consumers.
 */

import { tryDataStore } from './dataStore';

/**
 * Validates the top-level shape of an enrichment payload.
 * Returns true iff the payload is a valid enrichment wrapper.
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
function isValidEnrichment(payload) {
  return (
    payload != null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    Number.isInteger(payload.schemaVersion) &&
    Array.isArray(payload.entries)
  );
}

/**
 * Loads all four enrichment files from the data store.
 * Runs all four fetches in parallel; each falls back to null on failure.
 *
 * @returns {Promise<{
 *   coaching: { schemaVersion: number, entries: object[] } | null,
 *   scheme:   { schemaVersion: number, entries: object[] } | null,
 *   injuries: { schemaVersion: number, entries: object[] } | null,
 *   notes:    { schemaVersion: number, entries: object[] } | null,
 * }>}
 */
export async function loadEnrichment() {
  const [coaching, scheme, injuries, notes] = await Promise.all([
    tryDataStore('enrichment/coaching.json', { validate: isValidEnrichment }),
    tryDataStore('enrichment/scheme.json',   { validate: isValidEnrichment }),
    tryDataStore('enrichment/injuries.json', { validate: isValidEnrichment }),
    tryDataStore('enrichment/notes.json',    { validate: isValidEnrichment }),
  ])

  return { coaching, scheme, injuries, notes }
}
