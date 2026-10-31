import { describe, it, expect } from 'vitest'
import {
  twoYearAveragePPG, buildTwoYearRanks, cautionAge, ageCaution, isVeteranRow, AGE_CAUTION,
} from './twoYearBaseline'

const season = (gp, fp) => ({ gamesPlayed: gp, fantasyPoints: fp })
const vet = (id, confidence = 'high') => ({ player_id: id, dynastyScore: { score: 50, confidence, components: {} } })

describe('twoYearAveragePPG', () => {
  const cs = {
    2022: { old: season(16, 320) },
    2023: { a: season(16, 160), b: season(16, 160), c: season(7, 140), z: season(0, 0) },
    2024: { a: season(10, 200), c: season(16, 160), old: season(16, 320) },
  }
  it('means the PPG of both qualifying seasons', () => {
    expect(twoYearAveragePPG(cs, 'a')).toBeCloseTo((10 + 20) / 2)
  })
  it('uses only dataSeason when dataSeason-1 is missing', () => {
    expect(twoYearAveragePPG(cs, 'old')).toBeCloseTo(20)
  })
  it('uses only dataSeason-1 when dataSeason is missing', () => {
    expect(twoYearAveragePPG(cs, 'b')).toBeCloseTo(10)
  })
  it('a 7-game season does not qualify', () => {
    expect(twoYearAveragePPG(cs, 'c')).toBeCloseTo(10)
  })
  it('returns null when neither qualifies, and never divides by 0 games', () => {
    expect(twoYearAveragePPG(cs, 'z')).toBeNull()
    expect(twoYearAveragePPG(cs, 'nobody')).toBeNull()
    expect(twoYearAveragePPG(null, 'a')).toBeNull()
  })
  it('ignores seasons older than dataSeason-1', () => {
    const only = { 2021: { x: season(16, 320) }, 2024: {} }
    expect(twoYearAveragePPG(only, 'x')).toBeNull()
  })
})

describe('isVeteranRow', () => {
  it('requires a veteran confidence and components', () => {
    expect(isVeteranRow(vet('a', 'low'))).toBe(true)
    expect(isVeteranRow(vet('a', 'prospect'))).toBe(false)
    expect(isVeteranRow(vet('a', 'none'))).toBe(false)
    expect(isVeteranRow({ dynastyScore: { confidence: 'high', components: null } })).toBe(false)
  })
})

describe('buildTwoYearRanks', () => {
  const cs = { 2024: {
    w1: season(10, 100), w2: season(10, 200), w3: season(10, 200), w4: season(10, 50),
    r1: season(10, 90), pr: season(10, 400), nb: season(4, 400),
  } }
  const pm = {
    w1: { position: 'WR' }, w2: { position: 'WR' }, w3: { position: 'WR' }, w4: { position: 'WR' },
    r1: { position: 'RB' }, pr: { position: 'WR' }, nb: { position: 'WR' },
  }
  const rows = [vet('w1'), vet('w2'), vet('w3'), vet('w4'), vet('r1'), vet('pr', 'prospect'), vet('nb'), vet('nm', 'none')]
  const m = buildTwoYearRanks(rows, cs, pm)
  it('excludes prospects, none-confidence and veterans with a null B2', () => {
    expect(m.has('pr')).toBe(false)
    expect(m.has('nb')).toBe(false)
    expect(m.has('nm')).toBe(false)
  })
  it('ranks per position with ties sharing a rank and the right poolSize', () => {
    expect(m.get('w2').rank).toBe(1)
    expect(m.get('w3').rank).toBe(1)
    expect(m.get('w1').rank).toBe(3)
    expect(m.get('w4').rank).toBe(4)
    expect(m.get('w1').poolSize).toBe(4)
    expect(m.get('r1')).toEqual({ rank: 1, poolSize: 1, ppg: 9 })
  })
})

describe('cautionAge', () => {
  const cs = { 2024: {} } // reference date 2025-06-01
  it('counts whole years on June 1 of dataSeason+1', () => {
    expect(cautionAge({ birth_date: '1994-06-01' }, cs)).toEqual({ age: 31, source: 'birthdate' })
    expect(cautionAge({ birth_date: '1994-06-02' }, cs)).toEqual({ age: 30, source: 'birthdate' })
    expect(cautionAge({ birth_date: '1994-05-31' }, cs)).toEqual({ age: 31, source: 'birthdate' })
  })
  it('falls back to Sleeper age, then null', () => {
    expect(cautionAge({ age: 29 }, cs)).toEqual({ age: 29, source: 'sleeper' })
    expect(cautionAge({ birth_date: 'garbage', age: 29 }, cs)).toEqual({ age: 29, source: 'sleeper' })
    expect(cautionAge({}, cs)).toBeNull()
    expect(cautionAge(undefined, cs)).toBeNull()
  })
})

describe('ageCaution', () => {
  const cs = { 2024: {} }
  const at = age => ({ age })
  it('flags 31+ over and 24- under, nothing between', () => {
    expect(ageCaution(vet('a'), at(31), cs)).toBe('over')
    expect(ageCaution(vet('a'), at(30), cs)).toBeNull()
    expect(ageCaution(vet('a'), at(25), cs)).toBeNull()
    expect(ageCaution(vet('a'), at(24), cs)).toBe('under')
  })
  it('never flags a non-veteran', () => {
    expect(ageCaution(vet('a', 'prospect'), at(35), cs)).toBeNull()
  })
  it('exposes the thresholds', () => {
    expect(AGE_CAUTION.over.minAge).toBe(31)
    expect(AGE_CAUTION.under.maxAge).toBe(24)
  })
})
