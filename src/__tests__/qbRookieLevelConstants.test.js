import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { QB_ROOKIE_LEVEL_SOURCE, QB_ROOKIE_STARTER_PPG } from '../utils/seasonProjection'

// P12b — provenance oracle for the rookie QB starter level (CR-27). The fixture is a byte copy of the data
// repo's backtests/2026-10-04-qb-rookie-level-constants.json at the pinned commit; nothing below may be
// hand-edited — a re-fit writes a new dated file and the app re-pins by byte copy.
const fixture = JSON.parse(readFileSync(QB_ROOKIE_LEVEL_SOURCE.fixture, 'utf8'))

describe('rookie QB starter level — fixture provenance', () => {
  it('the fixture names the pinned source and generation time, on the half-PPR basis, with the fit\'s group order', () => {
    // the fixture's own `source` carries a literal `<date>` placeholder (data-side), so compare the stable parts
    const [dir, name] = QB_ROOKIE_LEVEL_SOURCE.file.split('/')
    expect(fixture.source.startsWith(dir + '/')).toBe(true)
    expect(fixture.source).toContain(name.replace('2026-10-04-', '<date>-'))
    expect(name).toMatch(/^2026-10-04-qb-rookie-level-constants\.json$/)
    expect(fixture.generatedAt).toBe(QB_ROOKIE_LEVEL_SOURCE.generatedAt)
    expect(fixture.basis).toBe('half_ppr')
    expect(fixture.definitions.pickConvention.startsWith('within-round')).toBe(true)
    expect(Object.keys(fixture.definitions.groups)).toEqual(Object.keys(QB_ROOKIE_STARTER_PPG))
    expect(Object.keys(QB_ROOKIE_STARTER_PPG)).toEqual(['top12', 'r1', 'day2', 'day3+'])
  })

  it('every pinned group value equals the fixture\'s starterPPG value', () => {
    for (const g of Object.keys(QB_ROOKIE_STARTER_PPG)) {
      expect(QB_ROOKIE_STARTER_PPG[g], g).toBe(fixture.starterPPG[g].value)
    }
  })

  it('every value re-derives from the fixture rows: round3(sumPts / games), with matching players and games', () => {
    const keys = fixture.fixture.keys
    const rows = fixture.fixture.rows
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      const r = Object.fromEntries(keys.map((k, i) => [k, row[i]]))
      expect(Math.round(r.sumPts / r.games * 1000) / 1000, r.group).toBe(QB_ROOKIE_STARTER_PPG[r.group])
      expect(r.players, r.group).toBe(fixture.starterPPG[r.group].players)
      expect(r.games, r.group).toBe(fixture.starterPPG[r.group].games)
    }
  })

  it('the data side recorded an exact re-derivation', () => {
    expect(fixture.verification.rederiveFromFixture).toBe('exact')
  })
})
