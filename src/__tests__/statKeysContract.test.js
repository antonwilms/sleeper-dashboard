/**
 * src/__tests__/statKeysContract.test.js
 *
 * Stat-key contract for the season-totals fixture.
 *
 * Verifies that every stat key referenced by projection code
 * (TD_STAT_KEYS from projectionSignals.js, efficiency stat keys from
 * efficiencyMetrics.js) is present in at least one player's `stats` object
 * in the captured fixture with a non-null finite numeric value.
 *
 * This catches the `pass_int`-style miss: a key that projection code reads
 * but that never appears in real data (or appears with null/undefined values),
 * silently producing wrong results. Test failure is the forcing function.
 *
 * NOTE: `def_td` and `def_st_td` are intentionally excluded. These are
 * team-DST aggregate stats and are NOT tracked at the individual player level
 * in Sleeper season-totals responses. The projection code's `statVal != null`
 * guard silently skips them on individual players — that is correct behaviour.
 *
 * Fixture: src/__fixtures__/season-totals-2025.json
 * Shape: flat { [player_id]: { stats: {...}, gamesPlayed, ... } }
 * No envelope wrapper — read the object directly.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

// ─── Fixture loading ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, '../__fixtures__/season-totals-2025.json')

let fixture = null
let fixtureLoadError = null

try {
  fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
} catch (err) {
  fixtureLoadError = err.message
}

// ─── Contract key sets ────────────────────────────────────────────────────────

// TD_STAT_KEYS from projectionSignals.js (isTdReliant / tdDependency computation).
// def_td and def_st_td excluded — team-DST only, absent from individual player rows.
const TD_KEYS = [
  'rush_td', 'rec_td', 'pass_td',
  'rush_2pt', 'rec_2pt', 'pass_2pt',
  'st_td', 'fum_rec_td',
]

// Efficiency stat keys from efficiencyMetrics.js (used to build efficiency index
// and intRate/compRate/catchRate/yardsPerAtt/yardsPerCarry/yardsPerTarget).
// pass_int is explicitly included — its absence was the original C1 bug.
const EFFICIENCY_KEYS = [
  'pass_att', 'pass_yd', 'pass_td', 'pass_int',
  'rush_att', 'rush_yd', 'rush_td',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td',
]

// Union of all contract keys (deduplicated — rec_td and rush_td appear in both).
const ALL_CONTRACT_KEYS = [...new Set([...TD_KEYS, ...EFFICIENCY_KEYS])]

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the set of contract keys that have at least one player in the
 * fixture whose stats[key] is a non-null finite number.
 */
function coveredKeys(fixtureObj) {
  const covered = new Set()
  for (const player of Object.values(fixtureObj)) {
    const stats = player?.stats
    if (!stats) continue
    for (const key of ALL_CONTRACT_KEYS) {
      if (covered.has(key)) continue
      const v = stats[key]
      if (v != null && Number.isFinite(v)) covered.add(key)
    }
    // Early exit once all keys are found
    if (covered.size === ALL_CONTRACT_KEYS.length) break
  }
  return covered
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('season-totals-2025 fixture — stat-key contract', () => {
  it('fixture file loads and is non-empty', () => {
    if (fixtureLoadError) {
      // Skip with a clear warning rather than a cryptic module error.
      console.warn(`[statKeysContract] fixture not found — skipping: ${fixtureLoadError}`)
    }
    expect(fixtureLoadError, `Fixture load error: ${fixtureLoadError}`).toBeNull()
    expect(typeof fixture).toBe('object')
    expect(fixture).not.toBeNull()
    expect(Object.keys(fixture).length).toBeGreaterThan(0)
  })

  it('fixture has expected player count (≥ 2000 players)', () => {
    if (!fixture) return
    expect(Object.keys(fixture).length).toBeGreaterThanOrEqual(2000)
  })

  it('fixture player entries have a stats object', () => {
    if (!fixture) return
    const sample = Object.values(fixture).slice(0, 10)
    for (const player of sample) {
      expect(player).toHaveProperty('stats')
      expect(typeof player.stats).toBe('object')
    }
  })

  it('every contract key is present with a finite value in at least one player', () => {
    if (!fixture) return

    const covered = coveredKeys(fixture)
    const missing = ALL_CONTRACT_KEYS.filter(k => !covered.has(k))

    if (missing.length > 0) {
      throw new Error(
        `Stat-key contract violation — the following keys are absent from every player's stats in the fixture:\n` +
        `  Missing: ${missing.join(', ')}\n\n` +
        `If a key was intentionally removed from projection code, remove it from ALL_CONTRACT_KEYS here.\n` +
        `If a key exists in projection code but not in the fixture, the fixture needs updating or the key is wrong.`
      )
    }

    expect(covered.size).toBe(ALL_CONTRACT_KEYS.length)
  })

  it('TD stat keys are all covered', () => {
    if (!fixture) return
    const covered = coveredKeys(fixture)
    const missing = TD_KEYS.filter(k => !covered.has(k))
    expect(missing, `Missing TD keys: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('efficiency stat keys are all covered (including pass_int)', () => {
    if (!fixture) return
    const covered = coveredKeys(fixture)
    const missing = EFFICIENCY_KEYS.filter(k => !covered.has(k))
    expect(missing, `Missing efficiency keys: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('def_td and def_st_td are correctly absent (team-DST stats, not per-player)', () => {
    if (!fixture) return
    // This test documents and asserts the INTENTIONAL exclusion.
    // If these keys ever start appearing in individual player rows (Sleeper API change),
    // this test will fail — prompting a review of whether to add them to the contract.
    let defTdFound = false
    let defStTdFound = false
    for (const player of Object.values(fixture)) {
      const stats = player?.stats
      if (!stats) continue
      if (stats.def_td != null && Number.isFinite(stats.def_td)) defTdFound = true
      if (stats.def_st_td != null && Number.isFinite(stats.def_st_td)) defStTdFound = true
      if (defTdFound && defStTdFound) break
    }
    // Both should be absent from individual player rows.
    // If this assertion fails, Sleeper has started including them — update the contract.
    expect(defTdFound).toBe(false)
    expect(defStTdFound).toBe(false)
  })

  it('pass_int is specifically covered (regression: C1 miss)', () => {
    if (!fixture) return
    // pass_int was the original bug: code read stats.pass_int but fixture lacked
    // any player with a finite pass_int value. This test pins that regression.
    let found = false
    for (const player of Object.values(fixture)) {
      const v = player?.stats?.pass_int
      if (v != null && Number.isFinite(v)) { found = true; break }
    }
    expect(found).toBe(true)
  })
})
