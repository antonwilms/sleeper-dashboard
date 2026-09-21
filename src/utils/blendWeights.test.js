import { describe, it, expect } from 'vitest'
import { SIGNAL_FAMILIES, blendWeight, buildWeightPanel } from './blendWeights'
import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

describe('blendWeight', () => {
  it('n/(n+k) at n=0/1/8/17, k=3', () => {
    expect(blendWeight(0, 3)).toBe(0)
    expect(blendWeight(1, 3)).toBeCloseTo(0.25)
    expect(blendWeight(8, 3)).toBeCloseTo(8 / 11)
    expect(blendWeight(17, 3)).toBeCloseTo(17 / 20)
  })

  it('null for n == null', () => {
    expect(blendWeight(null, 3)).toBeNull()
    expect(blendWeight(undefined, 3)).toBeNull()
  })

  it('null for k <= 0', () => {
    expect(blendWeight(5, 0)).toBeNull()
    expect(blendWeight(5, -1)).toBeNull()
  })
})

describe('SIGNAL_FAMILIES — fpa is the only enforced row and must not be hand-written', () => {
  const fpa = SIGNAL_FAMILIES.find(f => f.key === 'fpa')
  const others = SIGNAL_FAMILIES.filter(f => f.key !== 'fpa')

  it('fpa.k === PRIOR_WEIGHT_GAMES (imported, not a literal)', () => {
    expect(fpa.k).toBe(PRIOR_WEIGHT_GAMES)
  })

  it('fpa.dropGames === FPA_PRIOR_DROP_GAMES (imported, not a literal)', () => {
    expect(fpa.dropGames).toBe(FPA_PRIOR_DROP_GAMES)
  })

  it('fpa carries no dropWeek', () => {
    expect(fpa.dropWeek).toBeNull()
  })

  it('the other three families carry no dropGames', () => {
    for (const f of others) {
      expect(f.dropGames).toBeNull()
      expect(f.dropWeek).not.toBeNull()
    }
  })
})

describe('buildWeightPanel', () => {
  it('n=0 (artboard 9c) makes every pct 0, not null — data flowing through the formula', () => {
    const panel = buildWeightPanel(0)
    expect(panel).toHaveLength(4)
    for (const row of panel) {
      expect(row.weight).toBe(0)
      expect(row.pct).toBe(0)
    }
  })

  it('n=1 (week 2, one game played) gives the fpa row 25%', () => {
    const panel = buildWeightPanel(1)
    const fpaRow = panel.find(r => r.key === 'fpa')
    expect(fpaRow.pct).toBe(25)
  })

  it('n=null propagates to every row', () => {
    const panel = buildWeightPanel(null)
    for (const row of panel) {
      expect(row.weight).toBeNull()
      expect(row.pct).toBeNull()
    }
  })

  it('every row carries its own label/k alongside the computed weight/pct', () => {
    const panel = buildWeightPanel(5)
    for (const row of panel) {
      const spec = SIGNAL_FAMILIES.find(f => f.key === row.key)
      expect(row.label).toBe(spec.label)
      expect(row.k).toBe(spec.k)
      expect(row.dropGames).toBe(spec.dropGames)
      expect(row.dropWeek).toBe(spec.dropWeek)
    }
  })
})
