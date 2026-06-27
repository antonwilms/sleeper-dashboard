import { describe, it, expect } from 'vitest'
import { collegeFetchYears } from './cfbd'

describe('collegeFetchYears', () => {
  it('anchor at 2025 returns 2017–2025 (length 9, last 2025)', () => {
    const years = collegeFetchYears(2025)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('anchor at 2026 returns 2017–2026 (length 10, last 2026)', () => {
    const years = collegeFetchYears(2026)
    expect(years.length).toBe(10)
    expect(years[years.length - 1]).toBe(2026)
  })

  it('anchor at 2024 is floored to 2025 (length 9, last 2025)', () => {
    const years = collegeFetchYears(2024)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('undefined anchor falls back to the 2025 floor', () => {
    const years = collegeFetchYears(undefined)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('NaN anchor falls back to the 2025 floor', () => {
    const years = collegeFetchYears(NaN)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('string anchor falls back to the 2025 floor (Number.isFinite guard)', () => {
    const years = collegeFetchYears('2025')
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('array is contiguous, strictly increasing, starts at 2017, with no duplicates', () => {
    const years = collegeFetchYears(2025)
    expect(years[0]).toBe(2017)
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1] + 1)
    }
  })
})
