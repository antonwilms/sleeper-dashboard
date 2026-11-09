import { describe, it, expect } from 'vitest'
import { INJURY_ABBR, injuryShort } from './injuryStatus'

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
