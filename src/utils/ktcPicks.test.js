import { describe, it, expect } from 'vitest'
import { parseKtcPickRows, pickPrice } from './ktcPicks'

const SEASONS = [2026, 2027, 2028]
const TIERS = ['Early', 'Mid', 'Late']
const ROUNDS = ['1st', '2nd', '3rd', '4th']

function buildFullPickSet() {
  const rows = []
  let value = 9000
  for (const season of SEASONS) {
    for (const tier of TIERS) {
      for (const round of ROUNDS) {
        rows.push({ name: `${season} ${tier} ${round}`, position: null, team: 'FA', value: value-- })
      }
    }
  }
  return rows
}

describe('parseKtcPickRows', () => {
  it('the real 36-row shape (3 years × 3 tiers × 4 rounds) parses to 36 entries', () => {
    const rows = buildFullPickSet()
    expect(rows).toHaveLength(36)
    const table = parseKtcPickRows(rows)
    let count = 0
    for (const bySeasons of Object.values(table)) {
      for (const byRound of Object.values(bySeasons)) {
        count += Object.keys(byRound).length
      }
    }
    expect(count).toBe(36)
  })

  it('a player row (real position, real team) is ignored, not guessed at', () => {
    const rows = [
      { name: 'Ja\'Marr Chase', position: 'WR', team: 'CIN', value: 9999 },
      { name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 },
    ]
    const table = parseKtcPickRows(rows)
    expect(Object.keys(table)).toEqual(['2027'])
    expect(pickPrice(table, 2027, 1, 'Mid')).toBe(3690)
  })

  it('a malformed pick-shaped name (wrong tier word, missing round, extra text) is ignored', () => {
    const rows = [
      { name: '2027 Medium 1st', value: 100 },      // not Early|Mid|Late
      { name: '2027 Mid 5th', value: 100 },          // not 1st-4th
      { name: '2027 Mid 1st (est.)', value: 100 },   // trailing text — not an exact match
      { name: 'Mid 1st', value: 100 },               // no season
    ]
    const table = parseKtcPickRows(rows)
    expect(table).toEqual({})
  })

  it('a row with a matching name but a non-finite value is ignored', () => {
    const rows = [{ name: '2027 Mid 1st', value: 'N/A' }]
    expect(parseKtcPickRows(rows)).toEqual({})
  })

  it('null/undefined input returns an empty table, not a throw', () => {
    expect(parseKtcPickRows(null)).toEqual({})
    expect(parseKtcPickRows(undefined)).toEqual({})
    expect(parseKtcPickRows([])).toEqual({})
  })

  it('ignores team/position entirely — a pick row with real-looking team/position still parses', () => {
    const rows = [{ name: '2027 Mid 1st', position: 'WR', team: 'CIN', value: 3690 }]
    const table = parseKtcPickRows(rows)
    expect(pickPrice(table, 2027, 1, 'Mid')).toBe(3690)
  })
})

describe('pickPrice', () => {
  const table = parseKtcPickRows(buildFullPickSet())

  it('returns the exact tier value for a priced round', () => {
    const early = pickPrice(table, 2027, 1, 'Early')
    const mid = pickPrice(table, 2027, 1, 'Mid')
    const late = pickPrice(table, 2027, 1, 'Late')
    expect(early).not.toBeNull()
    expect(mid).not.toBeNull()
    expect(late).not.toBeNull()
    expect(early).not.toBe(mid)
  })

  it('defaults to Mid when no tier is given', () => {
    expect(pickPrice(table, 2027, 1)).toBe(pickPrice(table, 2027, 1, 'Mid'))
  })

  it('round 5 is null — never a number, never a fallback to round 4', () => {
    expect(pickPrice(table, 2027, 5)).toBeNull()
    expect(pickPrice(table, 2027, 5, 'Early')).toBeNull()
  })

  it('a season KTC does not price is null for every round', () => {
    expect(pickPrice(table, 2099, 1)).toBeNull()
  })

  it('a null/empty table is null, not a throw', () => {
    expect(pickPrice(null, 2027, 1)).toBeNull()
    expect(pickPrice({}, 2027, 1)).toBeNull()
  })
})
