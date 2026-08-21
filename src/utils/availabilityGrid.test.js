import { describe, it, expect } from 'vitest'
import { buildAvailabilityGrid, STATUS_LABEL } from './availabilityGrid'

function ws18(overrides) {
  const arr = Array(18).fill('P')
  for (const [i, code] of Object.entries(overrides)) arr[Number(i)] = code
  return arr
}

describe('buildAvailabilityGrid', () => {
  it('reads all four codes verbatim: P / D / B / X', () => {
    const careerStats = {
      2025: { p1: { weeklyStatus: ws18({ 0: 'D', 1: 'B', 2: 'X' }) } },
    }
    const { rows } = buildAvailabilityGrid(careerStats, 'p1', [2025])
    expect(rows[0].weeks[0]).toBe('D')
    expect(rows[0].weeks[1]).toBe('B')
    expect(rows[0].weeks[2]).toBe('X')
    expect(rows[0].weeks[3]).toBe('P')
  })

  it('an unrecognised or missing code normalises to X ("no game recorded"), never crashes', () => {
    const careerStats = {
      2025: { p1: { weeklyStatus: ws18({ 0: undefined, 1: 'Q' }) } },
    }
    const { rows } = buildAvailabilityGrid(careerStats, 'p1', [2025])
    expect(rows[0].weeks[0]).toBe('X')
    expect(rows[0].weeks[1]).toBe('X')
  })

  it('a season with no weeklyStatus at all renders a full row of X, not a throw', () => {
    const careerStats = { 2025: { p1: {} } }
    const { rows } = buildAvailabilityGrid(careerStats, 'p1', [2025])
    expect(rows[0].weeks.every(c => c === 'X')).toBe(true)
  })

  it('a player entirely absent from a season renders X for that row', () => {
    const { rows } = buildAvailabilityGrid({}, 'p1', [2025])
    expect(rows[0].weeks.every(c => c === 'X')).toBe(true)
  })

  it('hasBye is true only when at least one B appears in the rendered window', () => {
    const withBye = buildAvailabilityGrid({ 2025: { p1: { weeklyStatus: ws18({ 5: 'B' }) } } }, 'p1', [2025])
    expect(withBye.hasBye).toBe(true)

    const withoutBye = buildAvailabilityGrid({ 2025: { p1: { weeklyStatus: ws18({ 5: 'X' }) } } }, 'p1', [2025])
    expect(withoutBye.hasBye).toBe(false)
  })

  it('X is labelled "no game recorded", distinct from "did not play"', () => {
    expect(STATUS_LABEL.X).toBe('No game recorded')
    expect(STATUS_LABEL.D).toBe('Did not play')
    expect(STATUS_LABEL.X).not.toBe(STATUS_LABEL.D)
  })

  it('empty season axis → empty rows, no bye', () => {
    const { rows, hasBye } = buildAvailabilityGrid({}, 'p1', [])
    expect(rows).toEqual([])
    expect(hasBye).toBe(false)
  })
})
