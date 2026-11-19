import { describe, it, expect } from 'vitest'
import { lensHidden } from './lens'

describe('lensHidden', () => {
  it("T6 lens 'all' shows every group; a different lens hides; a null group is fixed", () => {
    expect(lensHidden('usage', 'all')).toBe('')
    expect(lensHidden('usage', 'matchup')).toBe('hidden')
    expect(lensHidden(null, 'x')).toBe('')
    expect(lensHidden('usage', 'usage')).toBe('')
  })
})
