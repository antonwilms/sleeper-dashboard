import { describe, it, expect } from 'vitest'
import { INJURY_ABBR, injuryShort, OUT_STATUSES as A } from './injuryStatus'
import { OUT_STATUSES as B } from './weeklyOwnProjection'

describe('injuryStatus', () => {
  it('INJURY_ABBR is exactly Portfolio.jsx\'s pre-move mapping (HEAD e841748)', () => {
    expect(INJURY_ABBR).toEqual({ Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' })
  })
  it('unknown statuses upper-case; null/empty → null', () => {
    expect(injuryShort('COV')).toBe('COV')
    expect(injuryShort('Questionable')).toBe('Q')
    expect(injuryShort(null)).toBeNull()
    expect(injuryShort('')).toBeNull()
  })
})

describe('OUT_STATUSES (T23)', () => {
  it('is one definition, re-exported by weeklyOwnProjection (identity, not equality)', () => {
    expect(A).toBe(B)
    expect(A).toEqual(['Out', 'IR', 'PUP', 'Sus', 'DNR'])
  })
})
