import { describe, it, expect } from 'vitest'
import { computeDynastySignalBadges } from './dynastySignalBadges.js'

describe('computeDynastySignalBadges', () => {
  it('returns [] when signals is null', () => {
    expect(computeDynastySignalBadges(null)).toEqual([])
  })

  it('returns [] when no flags fire', () => {
    const signals = {
      isBreakout: false, isBounceBack: false, momentumLabel: 'stable',
      isTdReliant: false, injurySeasonCount: 0, ageCurveFactor: null,
    }
    expect(computeDynastySignalBadges(signals)).toEqual([])
  })

  it('isBreakout fires the breakout badge with positive tone', () => {
    const badges = computeDynastySignalBadges({ isBreakout: true })
    expect(badges).toEqual([{
      key: 'breakout',
      label: '⚡ Breakout',
      body: 'Performing 30%+ above age-curve expectation — outperforming peers at this age',
      tone: 'positive',
    }])
  })

  it('isBounceBack fires the bounce-back badge with positive tone', () => {
    const badges = computeDynastySignalBadges({ isBounceBack: true })
    expect(badges).toEqual([{
      key: 'bounceback',
      label: '↩ Bounce-back',
      body: 'Strong return after injury-shortened season',
      tone: 'positive',
    }])
  })

  it('momentumLabel accelerating fires the accelerating badge with positive tone', () => {
    const badges = computeDynastySignalBadges({ momentumLabel: 'accelerating' })
    expect(badges).toEqual([{
      key: 'accel',
      label: '↑↑ Accelerating',
      body: 'Production significantly higher in last 2 seasons vs prior 2',
      tone: 'positive',
    }])
  })

  it('momentumLabel decelerating fires the decelerating badge with caution tone', () => {
    const badges = computeDynastySignalBadges({ momentumLabel: 'decelerating' })
    expect(badges).toEqual([{
      key: 'decel',
      label: '↓↓ Decelerating',
      body: 'Production significantly lower in last 2 seasons vs prior 2',
      tone: 'caution',
    }])
  })

  it('isTdReliant fires the TD-reliant badge with rounded percentage and caution tone', () => {
    const badges = computeDynastySignalBadges({ isTdReliant: true, tdDependency: 0.324 })
    expect(badges).toEqual([{
      key: 'td',
      label: '⚠ TD-reliant',
      body: '32% of points from touchdowns — production may be volatile if red zone usage changes',
      tone: 'caution',
    }])
  })

  it('isTdReliant with missing tdDependency defaults the percentage to 0%', () => {
    const badges = computeDynastySignalBadges({ isTdReliant: true })
    expect(badges[0].body).toContain('0% of points from touchdowns')
  })

  it('injurySeasonCount >= 2 fires the injury-risk badge with caution tone', () => {
    const badges = computeDynastySignalBadges({ injurySeasonCount: 3 })
    expect(badges).toEqual([{
      key: 'injury',
      label: '⚠ Injury risk',
      body: '3 seasons with fewer than 10 games played — durability concern',
      tone: 'caution',
    }])
  })

  it('injurySeasonCount === 1 does not fire the injury-risk badge', () => {
    expect(computeDynastySignalBadges({ injurySeasonCount: 1 })).toEqual([])
  })

  it('ageCurveFactor >= 1 fires the age-curve badge phrased "above", neutral tone', () => {
    const badges = computeDynastySignalBadges({ ageCurveFactor: 1.12 }, { position: 'WR', age: 24 })
    expect(badges).toEqual([{
      key: 'agecurve',
      label: 'Age curve ×1.12',
      body: 'Performing above expected level for a WR aged 24',
      tone: 'neutral',
    }])
  })

  it('ageCurveFactor < 1 fires the age-curve badge phrased "below"', () => {
    const badges = computeDynastySignalBadges({ ageCurveFactor: 0.85 }, { position: 'RB', age: 29 })
    expect(badges[0].body).toBe('Performing below expected level for a RB aged 29')
  })

  it('ageCurveFactor badge falls back to "?" for missing position/age', () => {
    const badges = computeDynastySignalBadges({ ageCurveFactor: 1.0 })
    expect(badges[0].body).toBe('Performing above expected level for a ? aged ?')
  })

  it('multiple flags produce badges in a fixed order', () => {
    const signals = {
      isBreakout: true,
      isBounceBack: true,
      momentumLabel: 'accelerating',
      isTdReliant: true,
      tdDependency: 0.5,
      injurySeasonCount: 2,
      ageCurveFactor: 1.2,
    }
    const badges = computeDynastySignalBadges(signals, { position: 'RB', age: 25 })
    expect(badges.map(b => b.key)).toEqual(['breakout', 'bounceback', 'accel', 'td', 'injury', 'agecurve'])
  })
})
