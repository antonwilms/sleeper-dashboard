import { describe, it, expect } from 'vitest'
import { findInjuryForWeek, getCoaching, getScheme, getNotes } from './enrichmentLookup'

// ---------------------------------------------------------------------------
// findInjuryForWeek
// ---------------------------------------------------------------------------

describe('findInjuryForWeek', () => {
  const ENTRIES = [
    { playerId: 'P1', year: 2024, segmentStartWeek: 3,  segmentEndWeek: 8,   status: 'IR' },
    { playerId: 'P2', year: 2024, segmentStartWeek: 10, segmentEndWeek: null, status: 'Q'  }, // null → defaults to 18
    { playerId: 'P1', year: 2023, segmentStartWeek: 1,  segmentEndWeek: 18,  status: 'IR' }, // different year
  ]
  const payload = { entries: ENTRIES }

  // ── Null-safe guard ──────────────────────────────────────────────────────

  it('returns null for null payload', () => {
    expect(findInjuryForWeek(null, 'P1', 2024, 5)).toBeNull()
  })

  it('returns null for undefined payload', () => {
    expect(findInjuryForWeek(undefined, 'P1', 2024, 5)).toBeNull()
  })

  it('returns null when entries is not an array', () => {
    expect(findInjuryForWeek({ entries: 'not-an-array' }, 'P1', 2024, 5)).toBeNull()
    expect(findInjuryForWeek({ entries: null }, 'P1', 2024, 5)).toBeNull()
    expect(findInjuryForWeek({}, 'P1', 2024, 5)).toBeNull()
  })

  // ── Happy-path hit ───────────────────────────────────────────────────────

  it('returns the entry when week is inside the segment range', () => {
    expect(findInjuryForWeek(payload, 'P1', 2024, 5)).toBe(ENTRIES[0])
  })

  it('returns entry at the segmentStartWeek boundary (inclusive)', () => {
    expect(findInjuryForWeek(payload, 'P1', 2024, 3)).toBe(ENTRIES[0])
  })

  it('returns entry at the segmentEndWeek boundary (inclusive)', () => {
    expect(findInjuryForWeek(payload, 'P1', 2024, 8)).toBe(ENTRIES[0])
  })

  it('segmentEndWeek null → defaults to week 18 (inclusive)', () => {
    expect(findInjuryForWeek(payload, 'P2', 2024, 18)).toBe(ENTRIES[1])
    expect(findInjuryForWeek(payload, 'P2', 2024, 10)).toBe(ENTRIES[1])
  })

  // ── Miss cases ───────────────────────────────────────────────────────────

  it('returns null for week before segmentStartWeek', () => {
    expect(findInjuryForWeek(payload, 'P1', 2024, 2)).toBeNull()
  })

  it('returns null for week after segmentEndWeek', () => {
    expect(findInjuryForWeek(payload, 'P1', 2024, 9)).toBeNull()
  })

  it('returns null for wrong year', () => {
    expect(findInjuryForWeek(payload, 'P1', 2022, 5)).toBeNull()
  })

  it('returns null for wrong playerId', () => {
    expect(findInjuryForWeek(payload, 'GHOST', 2024, 5)).toBeNull()
  })

  // ── playerId coercion — entry.playerId is always compared to String(playerId) ──

  it('numeric playerId is coerced to string for comparison', () => {
    const numPayload = { entries: [
      { playerId: '42', year: 2024, segmentStartWeek: 1, segmentEndWeek: 10, status: 'IR' },
    ]}
    expect(findInjuryForWeek(numPayload, 42, 2024, 5)).toBe(numPayload.entries[0])
    expect(findInjuryForWeek(numPayload, '42', 2024, 5)).toBe(numPayload.entries[0])
  })
})

// ---------------------------------------------------------------------------
// getCoaching
// ---------------------------------------------------------------------------

describe('getCoaching', () => {
  const HC_ENTRY = { team: 'KC', year: 2024, role: 'HC', name: 'Andy Reid' }
  const OC_ENTRY = { team: 'KC', year: 2024, role: 'OC', name: 'Matt Nagy' }
  const DC_ENTRY = { team: 'KC', year: 2024, role: 'DC', name: 'Steve Spagnuolo' }
  const WRONG_ROLE = { team: 'KC', year: 2024, role: 'ST', name: 'Dave Toub' } // unknown role
  const OTHER_TEAM = { team: 'SF', year: 2024, role: 'HC', name: 'Kyle Shanahan' }
  const PREV_YEAR  = { team: 'KC', year: 2023, role: 'HC', name: 'Andy Reid' }

  const payload = { entries: [HC_ENTRY, OC_ENTRY, DC_ENTRY, WRONG_ROLE, OTHER_TEAM, PREV_YEAR] }

  // ── Null-safe guard ──────────────────────────────────────────────────────

  it('returns {HC:null, OC:null, DC:null} for null payload', () => {
    expect(getCoaching(null, 'KC', 2024)).toEqual({ HC: null, OC: null, DC: null })
  })

  it('returns {HC:null, OC:null, DC:null} for undefined payload', () => {
    expect(getCoaching(undefined, 'KC', 2024)).toEqual({ HC: null, OC: null, DC: null })
  })

  it('returns {HC:null, OC:null, DC:null} when entries is not an array', () => {
    expect(getCoaching({ entries: null }, 'KC', 2024)).toEqual({ HC: null, OC: null, DC: null })
  })

  // ── Happy-path hits ──────────────────────────────────────────────────────

  it('populates HC, OC, DC for matching team + year', () => {
    const result = getCoaching(payload, 'KC', 2024)
    expect(result.HC).toBe(HC_ENTRY)
    expect(result.OC).toBe(OC_ENTRY)
    expect(result.DC).toBe(DC_ENTRY)
  })

  it('unknown roles (e.g. ST) are ignored — not added to result', () => {
    const result = getCoaching(payload, 'KC', 2024)
    expect(result).not.toHaveProperty('ST')
    expect(Object.keys(result)).toEqual(['HC', 'OC', 'DC'])
  })

  // ── Miss / partial cases ─────────────────────────────────────────────────

  it('returns HC:null, OC:null, DC:null for wrong team', () => {
    const result = getCoaching(payload, 'NE', 2024)
    expect(result).toEqual({ HC: null, OC: null, DC: null })
  })

  it('returns HC:null, OC:null, DC:null for wrong year', () => {
    const result = getCoaching(payload, 'KC', 2022)
    expect(result).toEqual({ HC: null, OC: null, DC: null })
  })

  it('different team returns only that team\'s HC', () => {
    const result = getCoaching(payload, 'SF', 2024)
    expect(result.HC).toBe(OTHER_TEAM)
    expect(result.OC).toBeNull()
    expect(result.DC).toBeNull()
  })

  it('prev year entry is not returned for current year query', () => {
    // KC 2023 HC exists but KC 2024 query should not include 2023 entry
    const result = getCoaching({ entries: [PREV_YEAR] }, 'KC', 2024)
    expect(result.HC).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getScheme
// ---------------------------------------------------------------------------

describe('getScheme', () => {
  const KC_2024 = { team: 'KC', year: 2024, offenseScheme: 'West Coast', defenseScheme: '4-3' }
  const SF_2024 = { team: 'SF', year: 2024, offenseScheme: 'Shanahan Outside Zone', defenseScheme: '4-3' }
  const KC_2023 = { team: 'KC', year: 2023, offenseScheme: 'West Coast', defenseScheme: '4-3' }

  const payload = { entries: [KC_2024, SF_2024, KC_2023] }

  // ── Null-safe guard ──────────────────────────────────────────────────────

  it('returns null for null payload', () => {
    expect(getScheme(null, 'KC', 2024)).toBeNull()
  })

  it('returns null for undefined payload', () => {
    expect(getScheme(undefined, 'KC', 2024)).toBeNull()
  })

  it('returns null when entries is not an array', () => {
    expect(getScheme({ entries: null }, 'KC', 2024)).toBeNull()
  })

  // ── Happy-path hits ──────────────────────────────────────────────────────

  it('returns the matching entry for (team, year)', () => {
    expect(getScheme(payload, 'KC', 2024)).toBe(KC_2024)
    expect(getScheme(payload, 'SF', 2024)).toBe(SF_2024)
    expect(getScheme(payload, 'KC', 2023)).toBe(KC_2023)
  })

  // ── Miss cases ───────────────────────────────────────────────────────────

  it('returns null for unknown team', () => {
    expect(getScheme(payload, 'NE', 2024)).toBeNull()
  })

  it('returns null for unknown year', () => {
    expect(getScheme(payload, 'KC', 2022)).toBeNull()
  })

  it('returns null for empty entries', () => {
    expect(getScheme({ entries: [] }, 'KC', 2024)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getNotes
// ---------------------------------------------------------------------------

describe('getNotes', () => {
  const N1 = { playerId: 'P1', team: 'KC', year: 2024, text: 'Note A' }
  const N2 = { playerId: 'P1', team: 'KC', year: 2023, text: 'Note B' }
  const N3 = { playerId: 'P2', team: 'SF', year: 2024, text: 'Note C' }

  const payload = { entries: [N1, N2, N3] }

  // ── Null-safe guard ──────────────────────────────────────────────────────

  it('returns [] for null payload', () => {
    expect(getNotes(null, { playerId: 'P1' })).toEqual([])
  })

  it('returns [] for undefined payload', () => {
    expect(getNotes(undefined, { playerId: 'P1' })).toEqual([])
  })

  it('returns [] when entries is not an array', () => {
    expect(getNotes({ entries: null }, { playerId: 'P1' })).toEqual([])
  })

  // ── Filter by playerId ───────────────────────────────────────────────────

  it('filter by playerId — returns all entries for that player', () => {
    expect(getNotes(payload, { playerId: 'P1' })).toEqual([N1, N2])
  })

  it('filter by playerId + year — returns only the matching entry', () => {
    expect(getNotes(payload, { playerId: 'P1', year: 2024 })).toEqual([N1])
  })

  // ── Filter by team ───────────────────────────────────────────────────────

  it('filter by team — returns all entries for that team', () => {
    expect(getNotes(payload, { team: 'KC' })).toEqual([N1, N2])
  })

  it('filter by team + year', () => {
    expect(getNotes(payload, { team: 'KC', year: 2023 })).toEqual([N2])
  })

  // ── No filter ────────────────────────────────────────────────────────────

  it('empty opts object returns all entries', () => {
    expect(getNotes(payload, {})).toEqual([N1, N2, N3])
  })

  it('no opts argument returns all entries', () => {
    expect(getNotes(payload)).toEqual([N1, N2, N3])
  })

  // ── Miss cases ───────────────────────────────────────────────────────────

  it('returns [] when playerId matches no entry', () => {
    expect(getNotes(payload, { playerId: 'GHOST' })).toEqual([])
  })

  it('returns [] when team matches no entry', () => {
    expect(getNotes(payload, { team: 'NE' })).toEqual([])
  })

  it('returns [] for empty entries', () => {
    expect(getNotes({ entries: [] }, { playerId: 'P1' })).toEqual([])
  })

  // ── playerId coercion — e.playerId is compared to String(playerId) ────────

  it('numeric playerId is coerced to string for comparison', () => {
    const numPayload = { entries: [
      { playerId: '99', team: 'LAR', year: 2024, text: 'numeric test' },
    ]}
    expect(getNotes(numPayload, { playerId: 99 })).toHaveLength(1)
    expect(getNotes(numPayload, { playerId: '99' })).toHaveLength(1)
  })
})
