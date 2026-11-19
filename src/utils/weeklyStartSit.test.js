import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildStartSitFlags } from './weeklyStartSit'
import { SLOT_ELIGIBILITY } from './lineup'
import { OUT_STATUSES } from './weeklyOwnProjection'

const UNAV = [...OUT_STATUSES, 'Doubtful']
const r = (slot, id, position, points, extra = {}) => ({
  slot, player_id: id, name: id, position, points, bye: false, injuryStatus: null, ...extra,
})
const run = (starters, bench, ownByPlayer = {}) =>
  buildStartSitFlags({ starters, bench, ownByPlayer, unavailableStatuses: UNAV })

describe('buildStartSitFlags', () => {
  it('T5 eligibility gates the comparison', () => {
    const starters = [r('WR', 's1', 'WR', 8.7), r('FLEX', 's2', 'TE', 7.0)]
    const bench = [r('BN', 'q', 'QB', 20.0), r('BN', 'b', 'RB', 9.0)]
    expect(bench[0].points).toBeGreaterThan(starters[0].points)
    expect(SLOT_ELIGIBILITY.WR).not.toContain('QB')
    expect(SLOT_ELIGIBILITY.FLEX).not.toContain('QB')
    const { flags } = run(starters, bench)
    expect(flags.map(f => [f.slotIndex, f.kind, f.bench.id])).toEqual([[1, 'higher', 'b']])
  })

  it('T5b one-swap check', () => {
    expect(SLOT_ELIGIBILITY.WR).not.toContain('RB')
    expect(SLOT_ELIGIBILITY.FLEX).toContain('RB')
    expect(SLOT_ELIGIBILITY.WR).toContain('WR')
    const mk = (extraX = {}, bench) => run([r('WR', 'y', 'WR', 4.0), r('FLEX', 'x', 'WR', 12.0, extraX)], bench)
    const z = r('BN', 'z', 'RB', 8.0)
    expect(z.points).toBeLessThan(12.0)
    // (a)
    const a = mk({}, [z])
    expect(a.flags).toHaveLength(1)
    expect(a.flags[0]).toMatchObject({ slotIndex: 0, kind: 'higher' })
    expect(a.flags[0].bench.id).toBe('z')
    expect(a.flags[0].via).toMatchObject({ moveId: 'x', moveProj: 12.0, fromSlot: 'FLEX', fromSlotIndex: 1, toSlot: 'WR' })
    // (b)
    expect(mk({}, [r('BN', 'z', 'RB', 3.0)]).flags).toEqual([])
    // (c) direct wins
    const c = mk({}, [z, r('BN', 'w', 'WR', 9.0)])
    const wrFlag = c.flags.find(f => f.slotIndex === 0)
    expect(wrFlag.bench.id).toBe('w')
    expect(wrFlag.via).toBeNull()
    // (d) SUPER_FLEX
    const d = run([r('QB', 'q1', 'QB', 10.0), r('SUPER_FLEX', 'q2', 'QB', 25.0)], [r('BN', 'w', 'WR', 15.0)])
    expect(d.flags).toHaveLength(1)
    expect(d.flags[0].slotIndex).toBe(0)
    expect(d.flags[0].via.fromSlot).toBe('SUPER_FLEX')
    // (e) the moving starter is Out
    const e = mk({ injuryStatus: 'Out' }, [z])
    expect(e.flags.find(f => f.slotIndex === 0)).toBeUndefined()
    expect(e.flags.filter(f => f.via != null)).toEqual([])
    // (f) inputs untouched
    const starters = [r('WR', 'y', 'WR', 4.0), r('FLEX', 'x', 'WR', 12.0)]
    const bench = [z, r('BN', 'w', 'WR', 9.0)]
    const sc = structuredClone(starters)
    const bc = structuredClone(bench)
    run(starters, bench)
    expect(starters).toEqual(sc)
    expect(bench).toEqual(bc)
  })

  it('T6 BYE / Doubtful-or-worse / no-PROJ starters', () => {
    const bench = [r('BN', 'b', 'WR', 5.0)]
    const a = run([r('WR', 's', 'WR', null, { bye: true })], bench)
    expect(a.flags[0]).toMatchObject({ kind: 'unavailable', cause: 'bye' })
    const bOut = run([r('WR', 's', 'WR', 3.0, { injuryStatus: 'Out' })], [r('BN', 'b', 'WR', 2.0)])
    expect(2.0).toBeLessThan(3.0)
    expect(bOut.flags[0]).toMatchObject({ kind: 'unavailable', cause: 'status', status: 'Out' })
    expect(run([r('WR', 's', 'WR', 3.0, { injuryStatus: 'Doubtful' })], [r('BN', 'b', 'WR', 2.0)]).flags[0].cause).toBe('status')
    expect(run([r('WR', 's', 'WR', 3.0, { injuryStatus: 'Questionable' })], [r('BN', 'b', 'WR', 2.0)]).flags).toEqual([])
    expect(run([r('WR', 's', 'WR', null)], bench).flags[0].cause).toBe('no-proj')
    expect(run([r('WR', 's', 'WR', 3.0, { injuryStatus: 'Out' })], [r('BN', 'b', 'WR', 2.0, { injuryStatus: 'Out' })]).flags).toEqual([])
  })

  it('T7 summary fields', () => {
    const k = run([r('K', 'k1', 'K', 7.0)], [r('BN', 'k2', 'K', 9.0)])
    expect(k.flags).toEqual([])
    expect(k.uncheckedSlots).toEqual(['K'])
    expect(run([r('WR', 's', 'WR', null)], [r('BN', 'b', 'WR', null)]).basisAvailable).toBe(false)
    const ours = (b, s) => run([r('WR', 's', 'WR', 7.0)], [r('BN', 'b', 'WR', 8.0)], { b: { value: b }, s: { value: s } }).flags[0].ours
    expect(ours(9.6, 7.8)).toBe('agree')
    expect(ours(7.0, 7.8)).toBe('disagree')
    expect(ours(7.8, 7.8)).toBe('level')
  })

  it('T8 eligibility is imported, not copied', () => {
    const src = readFileSync('src/utils/weeklyStartSit.js', 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*\bSLOT_ELIGIBILITY\b[^}]*\}\s*from\s*['"]\.\/lineup['"]/)
    expect(src).not.toMatch(/\bFLEX\s*:/)
  })
})
