import { describe, it, expect } from 'vitest'
import { describeGameScript, gameScriptFit } from './gameScript'

describe('describeGameScript — margin × PROE grid', () => {
  const margins = [[6, 'leads'], [0, 'even'], [-6, 'trails']]
  const proes = [[0.03, 'pass-heavy'], [0, 'balanced'], [-0.03, 'run-heavy']]
  for (const [m, mLabel] of margins) {
    for (const [p, pLabel] of proes) {
      it(`margin ${m}, proe ${p} → '${mLabel} · ${pLabel}'`, () => {
        const s = describeGameScript(m, p)
        expect(s).toEqual({ margin: mLabel, tempo: pLabel, label: `${mLabel} · ${pLabel}` })
      })
    }
  }
})

describe('describeGameScript — threshold boundaries are inclusive (>= / <=)', () => {
  it('exactly +4 leads, exactly −4 trails, just inside is even', () => {
    expect(describeGameScript(4, null).margin).toBe('leads')
    expect(describeGameScript(-4, null).margin).toBe('trails')
    expect(describeGameScript(3.99, null).margin).toBe('even')
    expect(describeGameScript(-3.99, null).margin).toBe('even')
  })
  it('exactly +0.015 is pass-heavy, exactly −0.015 is run-heavy, just inside is balanced', () => {
    expect(describeGameScript(null, 0.015).tempo).toBe('pass-heavy')
    expect(describeGameScript(null, -0.015).tempo).toBe('run-heavy')
    expect(describeGameScript(null, 0.0149).tempo).toBe('balanced')
    expect(describeGameScript(null, -0.0149).tempo).toBe('balanced')
  })
})

describe('describeGameScript — D4 unit regression', () => {
  it('PROE is a FRACTION: 0.028 (+2.8%) is pass-heavy', () => {
    // If someone "fixes" the threshold to the design's percentage literal (1.5), every real PROE
    // (0.0072-scale) classifies as 'balanced' with no error — this is the test that fails then.
    expect(describeGameScript(0, 0.028).tempo).toBe('pass-heavy')
  })
})

describe('describeGameScript — null handling', () => {
  it('both null → all null', () => {
    expect(describeGameScript(null, null)).toEqual({ margin: null, tempo: null, label: null })
    expect(describeGameScript(undefined, NaN)).toEqual({ margin: null, tempo: null, label: null })
  })
  it('margin-only and PROE-only labels are that half alone, never containing —', () => {
    const a = describeGameScript(-6, null)
    expect(a.label).toBe('trails')
    expect(a.tempo).toBeNull()
    const b = describeGameScript(null, 0.03)
    expect(b.label).toBe('pass-heavy')
    expect(b.margin).toBeNull()
    expect(a.label).not.toContain('—')
    expect(b.label).not.toContain('—')
  })
})

describe('gameScriptFit', () => {
  const trailsPass = describeGameScript(-6, 0.03)
  const leadsRun = describeGameScript(6, -0.03)
  const evenBal = describeGameScript(0, 0)
  const leadsPass = describeGameScript(6, 0.03)

  it("'trails · pass-heavy' is good for QB/WR/TE and bad for RB", () => {
    for (const pos of ['QB', 'WR', 'TE']) expect(gameScriptFit(trailsPass, pos)).toBe('good')
    expect(gameScriptFit(trailsPass, 'RB')).toBe('bad')
  })
  it("'leads · run-heavy' is the mirror", () => {
    for (const pos of ['QB', 'WR', 'TE']) expect(gameScriptFit(leadsRun, pos)).toBe('bad')
    expect(gameScriptFit(leadsRun, 'RB')).toBe('good')
  })
  it("'even · balanced' is neutral for both", () => {
    expect(gameScriptFit(evenBal, 'RB')).toBe('neutral')
    expect(gameScriptFit(evenBal, 'WR')).toBe('neutral')
  })
  it("'leads · pass-heavy' is neutral for both — a split script is not evidence either way", () => {
    expect(gameScriptFit(leadsPass, 'RB')).toBe('neutral')
    expect(gameScriptFit(leadsPass, 'WR')).toBe('neutral')
  })
  it('a null script and a null/unknown position are each neutral (unknown is never treated as a WR)', () => {
    expect(gameScriptFit(null, 'WR')).toBe('neutral')
    expect(gameScriptFit(trailsPass, null)).toBe('neutral')
    expect(gameScriptFit(trailsPass, 'K')).toBe('neutral')
  })
})
