// Pins src/utils/twoYearBaseline.js to the CR-33 fixture table shared with the data repo's
// test/dynasty-definitions.test.mjs (originals: data lib/dynastyBacktest.mjs `twoYearAveragePPG`, `cohortAge`, `ageBand`).
// Change a row only together with that file and the index entry.
import { describe, it, expect } from 'vitest'
import { twoYearAveragePPG, cautionAge, ageCaution, AGE_CAUTION } from '../utils/twoYearBaseline'

const g = (gp, fp) => ({ gamesPlayed: gp, fantasyPoints: fp })
// S = 2024; seasons 2022–2024; undefined = no row that season.
const B2_CASES = [
  { id: 'both', y2022: undefined, y2023: g(16, 160), y2024: g(16, 192), B2: 11 },
  { id: 'eight-in-prior', y2022: undefined, y2023: g(8, 96), y2024: g(16, 160), B2: 11 },
  { id: 'seven-in-prior', y2022: undefined, y2023: g(7, 140), y2024: g(16, 160), B2: 10 },
  { id: 'seven-in-current', y2022: undefined, y2023: g(16, 160), y2024: g(7, 140), B2: 10 },
  { id: 'prior-missing', y2022: undefined, y2023: undefined, y2024: g(16, 192), B2: 12 },
  { id: 'current-missing', y2022: undefined, y2023: g(16, 192), y2024: undefined, B2: 12 },
  { id: 'neither', y2022: undefined, y2023: g(7, 70), y2024: g(7, 70), B2: null },
  { id: 'older-ignored', y2022: g(16, 320), y2023: g(16, 160), y2024: g(16, 160), B2: 10 },
  { id: 'nonfinite-prior', y2022: undefined, y2023: g(16, null), y2024: g(16, 160), B2: 10 },
]
const AGE_CASES = [
  { birthdate: '2001-06-01', age: 24, caution: 'low' },
  { birthdate: '2000-06-02', age: 24, caution: 'low' },
  { birthdate: '2000-06-01', age: 25, caution: 'none' },
  { birthdate: '2000-05-31', age: 25, caution: 'none' },
  { birthdate: '1994-06-02', age: 30, caution: 'none' },
  { birthdate: '1994-06-01', age: 31, caution: 'high' },
]

// One careerStats for all cases (each case id is a player id); the 2024 key always exists,
// so deriveDataSeason = 2024.
const careerStats = { 2022: {}, 2023: {}, 2024: { __anchor__: g(0, 0) } }
for (const c of B2_CASES) {
  for (const [y, v] of [[2022, c.y2022], [2023, c.y2023], [2024, c.y2024]]) if (v) careerStats[y][c.id] = v
}
const vet = { dynastyScore: { confidence: 'moderate', components: {} } }

describe('CR-33 app copy of the data definitions', () => {
  it('twoYearAveragePPG equals the shared B2 column', () => {
    for (const c of B2_CASES) {
      const got = twoYearAveragePPG(careerStats, c.id)
      if (c.B2 == null) expect(got, c.id).toBe(null)
      else expect(got, c.id).toBeCloseTo(c.B2, 10)
    }
  })
  it('cautionAge from a birthdate equals the shared age column', () => {
    for (const c of AGE_CASES) {
      expect(cautionAge({ birth_date: c.birthdate }, careerStats), c.birthdate).toEqual({ age: c.age, source: 'birthdate' })
    }
  })
  it('ageCaution maps the shared caution column and pins the band edges', () => {
    const want = { low: 'under', high: 'over', none: null }
    for (const c of AGE_CASES) {
      expect(ageCaution(vet, { birth_date: c.birthdate }, careerStats), c.birthdate).toBe(want[c.caution])
    }
    expect(AGE_CAUTION.under.maxAge).toBe(24)
    expect(AGE_CAUTION.over.minAge).toBe(31)
  })
})
