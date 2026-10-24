import { describe, it, expect } from 'vitest'
import { pickDynastyLabel } from './dynastyLabel.js'

const base = { isLateCareer: false, isBreakout: false, isBounceBack: false, slope: 0, age: 28, depthOrder: 1 }
const pick = (o) => pickDynastyLabel({ ...base, ...o })

describe('pickDynastyLabel', () => {
  it.each([
    [{ score: 85, isLateCareer: true, isBreakout: true }, 'Veteran Producer'],
    [{ score: 45, isLateCareer: true }, 'Managed Decline'],
    [{ score: 25, isLateCareer: true }, 'Sell Now'],
    [{ score: 10, isLateCareer: true }, 'Fading'],
    [{ score: 90, isBreakout: true }, 'Breakout'],
    [{ score: 90, isBounceBack: true }, 'Bounce-back'],
    [{ score: 80 }, 'Elite'],
    [{ score: 79, slope: 0.1 }, 'Ascending Star'],
    [{ score: 70, slope: 0 }, 'Peak Window'],
    [{ score: 70, slope: NaN }, 'Peak Window'],
    [{ score: 55, age: 25 }, 'Developing'],
    [{ score: 55, age: 26, slope: 0.1 }, 'Rising'],
    [{ score: 55, age: null, slope: -0.1 }, 'Solid Floor'],
    [{ score: 40, slope: 0 }, 'Plateau'],
    [{ score: 40, slope: -0.1 }, 'Managed Decline'],
    [{ score: 40, slope: NaN }, 'Managed Decline'],
    [{ score: 20 }, 'Sell Now'],
    [{ score: 19 }, 'Fading'],
    [{ score: 85, depthOrder: 3 }, 'Solid Floor'],
    [{ score: 90, isBreakout: true, depthOrder: 4 }, 'Solid Floor'],
    [{ score: 45, slope: 0, depthOrder: 3 }, 'Plateau'],
    [{ score: 60, isLateCareer: true, depthOrder: 3 }, 'Veteran Producer'],
  ])('%j -> %s', (input, expected) => {
    expect(pick(input)).toBe(expected)
  })
})
