import { describe, it, expect } from 'vitest'
import { usableLiveAdvStats, liveRacrCell } from './liveAdvStats'
import { MIN_TARGETS } from './seasonEfficiency'

describe('usableLiveAdvStats', () => {
  const byId = { wr1: { racr: 2.45, components: { targets: 30, weeks: 3 } } }

  it('returns null when complete is false', () => {
    expect(usableLiveAdvStats({ complete: false, year: 2026, byId }, 2026, 2025)).toBeNull()
  })

  it('returns null when year !== liveSeason (the fallback case)', () => {
    // loadAdvStats' fallback returned last season's data under the requested year's label —
    // this must not be treated as usable for the live season.
    expect(usableLiveAdvStats({ complete: true, year: 2025, byId }, 2026, 2025)).toBeNull()
  })

  it('returns null when liveSeason is null', () => {
    expect(usableLiveAdvStats({ complete: true, year: 2026, byId }, null, 2025)).toBeNull()
  })

  it('returns null when liveSeason is NaN', () => {
    expect(usableLiveAdvStats({ complete: true, year: 2026, byId }, NaN, 2025)).toBeNull()
  })

  it('returns null when liveSeason <= dataSeason', () => {
    expect(usableLiveAdvStats({ complete: true, year: 2025, byId }, 2025, 2025)).toBeNull()
  })

  it('returns byId when every condition holds', () => {
    expect(usableLiveAdvStats({ complete: true, year: 2026, byId }, 2026, 2025)).toBe(byId)
  })
})

describe('liveRacrCell', () => {
  const base = { racr: 2.45, components: { targets: MIN_TARGETS, weeks: 3 } }

  it('returns a cell at exactly MIN_TARGETS (the boundary)', () => {
    expect(liveRacrCell(base)).toEqual({ racr: 2.45, weeks: 3, targets: MIN_TARGETS })
  })

  it('returns null at MIN_TARGETS - 1', () => {
    const row = { ...base, components: { ...base.components, targets: MIN_TARGETS - 1 } }
    expect(liveRacrCell(row)).toBeNull()
  })

  it('returns null for racr: null', () => {
    expect(liveRacrCell({ ...base, racr: null })).toBeNull()
  })

  it('returns null when weeks is missing', () => {
    const row = { racr: 2.45, components: { targets: MIN_TARGETS } }
    expect(liveRacrCell(row)).toBeNull()
  })

  it('returns null when weeks is 0', () => {
    const row = { ...base, components: { ...base.components, weeks: 0 } }
    expect(liveRacrCell(row)).toBeNull()
  })

  it('returns null for an undefined row', () => {
    expect(liveRacrCell(undefined)).toBeNull()
  })
})
