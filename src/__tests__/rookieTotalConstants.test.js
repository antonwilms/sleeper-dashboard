import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { ROOKIE_TOTAL_FACTOR } from '../utils/seasonProjection'

// rookie-total-wiring (D-13) — provenance oracle for the rookie total-points factor. The fixture is a byte copy of
// sleeper-dashboard-data backtests/2026-10-11-rookie-total-panel.json @ 52d1001; nothing below may be hand-edited —
// a re-fit writes a new dated file and the app re-pins by byte copy.
const FIXTURE = 'src/__fixtures__/rookie-total-panel-2026-10-11.json'
const bytes = readFileSync(FIXTURE)
const fixture = JSON.parse(bytes.toString('utf8'))

describe('rookie total-points factor — fixture provenance', () => {
  it('the fixture is the recorded byte copy (sha1, 15,617 bytes)', () => {
    expect(bytes.length).toBe(15617)
    expect(createHash('sha1').update(bytes).digest('hex')).toBe('dc78e3175e3a1e0201e95018e0d06b38a9e2fa14')
  })

  it('each pinned group factor equals the verdict decision-row full-sample multiplier', () => {
    expect(ROOKIE_TOTAL_FACTOR.day3).toBe(fixture.loso.decision.day3.fullSample)
    expect(ROOKIE_TOTAL_FACTOR.undrafted).toBe(fixture.loso.decision.undrafted.fullSample)
  })

  it('the verdict recommends the factor and both groups are judged correct', () => {
    expect(fixture.decision.verdict).toBe('recommend')
    expect(fixture.decision.perGroup).toEqual({ day3: 'correct', undrafted: 'correct' })
  })

  it('candidateMultipliers.byGroup agrees on both pinned groups', () => {
    expect(fixture.candidateMultipliers.byGroup.day3).toBe(ROOKIE_TOTAL_FACTOR.day3)
    expect(fixture.candidateMultipliers.byGroup.undrafted).toBe(ROOKIE_TOTAL_FACTOR.undrafted)
  })

  it('the pinned constant is frozen', () => {
    expect(Object.isFrozen(ROOKIE_TOTAL_FACTOR)).toBe(true)
  })
})
