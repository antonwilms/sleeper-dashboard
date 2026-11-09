import { describe, it, expect } from 'vitest'
import {
  buildDepthChart, selectLatestOlineStates, buildOlSlots, buildOlIdIndex, resolveOlSleeperId,
} from './depthChart'

const P = (o) => ({ team: 'KC', position: 'DE', depth_chart_order: 1, full_name: 'X Y', ...o })

describe('buildDepthChart', () => {
  it('1: LDE starter is the lowest depth_chart_order, not insertion order', () => {
    const playersMap = {
      a: P({ full_name: 'Aaron Able', depth_chart_position: 'LDE', depth_chart_order: 2 }),
      b: P({ full_name: 'Zed Zulu', depth_chart_position: 'LDE', depth_chart_order: 1 }),
    }
    const { slots } = buildDepthChart({ playersMap, abbr: 'KC' })
    expect(slots.LDE.map(e => e.id)).toEqual(['b', 'a'])
  })
  it('2: generic DL code is kept in generic.DL and in no slot', () => {
    const playersMap = { a: P({ depth_chart_position: 'DL' }) }
    const c = buildDepthChart({ playersMap, abbr: 'KC' })
    expect(c.generic.DL.map(e => e.id)).toEqual(['a'])
    for (const list of Object.values(c.slots)) expect(list).toEqual([])
  })
  it('3: unknown code routes by position, else unplaced', () => {
    const playersMap = {
      a: P({ depth_chart_position: 'PR', position: 'CB' }),
      b: P({ depth_chart_position: 'XX', position: 'OT' }),
    }
    const c = buildDepthChart({ playersMap, abbr: 'KC' })
    expect(c.other.DB.map(e => e.id)).toEqual(['a'])
    expect(c.unplaced.map(e => e.id)).toEqual(['b'])
  })
  it('4: Sleeper OL excluded; LAR player placed only for abbr LA', () => {
    const playersMap = {
      ol: P({ depth_chart_position: 'OL' }),
      r: P({ team: 'LAR', depth_chart_position: 'QB', position: 'QB' }),
    }
    const kc = buildDepthChart({ playersMap, abbr: 'KC' })
    const all = [...Object.values(kc.slots).flat(), ...Object.values(kc.generic).flat(), ...Object.values(kc.other).flat(), ...kc.unplaced]
    expect(all).toEqual([])
    expect(buildDepthChart({ playersMap, abbr: 'LA' }).slots.QB.map(e => e.id)).toEqual(['r'])
    expect(buildDepthChart({ playersMap, abbr: 'LAR' }).slots.QB).toEqual([])
  })
})

describe('oline', () => {
  it('5: latest state is chosen by max dt, not by array position', () => {
    const st = (week, dt) => ({ week, date: dt.slice(0, 10), dt, ol: [] })
    const out = selectLatestOlineStates({
      KC: { states: [st('W40', '2026-10-17T07:00:00Z'), st('W45', '2026-11-07T07:00:00Z'), st('W42', '2026-10-24T07:00:00Z')] },
      NE: { states: [] },
    })
    expect(out.KC.date).toBe('2026-11-07')
    expect(out.NE).toBeUndefined()
    expect(selectLatestOlineStates(null)).toEqual({})
  })
  it('6: OL slots come from oline ranks, sorted by rank', () => {
    const state = { ol: [
      { slot: 'LT', rank: 2, name: 'Second Tackle' },
      { slot: 'LT', rank: 1, name: 'First Tackle' },
      { slot: 'ZZ', rank: 1, name: 'Odd Slot' },
    ] }
    const r = buildOlSlots(state, buildOlIdIndex({}), {})
    expect(r.slots.LT.map(e => e.name)).toEqual(['First Tackle', 'Second Tackle'])
    expect(r.other.map(e => e.name)).toEqual(['Odd Slot'])
    expect(buildOlSlots(null, buildOlIdIndex({}), {}).slots.LT).toEqual([])
  })
  it('7: OL id join guards', () => {
    const pm = {
      s1: { full_name: 'Joe Thuney', gsis_id: '00-1', espn_id: 11 },
      s2: { full_name: 'Esp Only', gsis_id: null, espn_id: 22 },
      s3: { full_name: 'Gee Three', gsis_id: '00-3', espn_id: 33 },
      s4: { full_name: 'Dupe One', gsis_id: '00-9', espn_id: null },
      s5: { full_name: 'Dupe Two', gsis_id: '00-9', espn_id: '' },
      s6: { full_name: 'Wrong Person', gsis_id: '00-6', espn_id: null },
      s7: { full_name: 'Exact Name', gsis_id: null, espn_id: null },
    }
    const idx = buildOlIdIndex(pm)
    // (a) gsis hit, surname agrees
    expect(resolveOlSleeperId({ name: 'Joseph Thuney', gsisId: '00-1', espnId: null }, idx, pm)).toBe('s1')
    // (b) espn-only hit
    expect(resolveOlSleeperId({ name: 'Esp Only', gsisId: null, espnId: '22' }, idx, pm)).toBe('s2')
    // (c) gsis and espn point to different sids
    expect(resolveOlSleeperId({ name: 'Gee Three', gsisId: '00-3', espnId: '11' }, idx, pm)).toBeNull()
    // (d) surname disagrees
    expect(resolveOlSleeperId({ name: 'Some Body', gsisId: '00-6', espnId: null }, idx, pm)).toBeNull()
    // (e) gsis held by two Sleeper players
    expect(resolveOlSleeperId({ name: 'Dupe One', gsisId: '00-9', espnId: null }, idx, pm)).toBeNull()
    // (f) no ids, exact name match → no name-only fallback
    expect(resolveOlSleeperId({ name: 'Exact Name', gsisId: null, espnId: null }, idx, pm)).toBeNull()
    // (g) null/empty hygiene
    for (const m of [idx.byGsis, idx.byEspn]) {
      for (const k of ['null', 'undefined', '']) expect(m.has(k)).toBe(false)
    }
    const pm2 = { a: { full_name: 'A One', espn_id: null }, b: { full_name: 'B Two', espn_id: null }, c: { full_name: 'C Three', espn_id: '' } }
    const idx2 = buildOlIdIndex(pm2)
    expect(idx2.byEspn.size).toBe(0)
    expect(resolveOlSleeperId({ name: 'A One', gsisId: undefined, espnId: null }, idx2, pm2)).toBeNull()
    // a SINGLE null-id record must not become a 'null' key either (duplicate-removal would mask 2+)
    const pm3 = { a: { full_name: 'A One', espn_id: null, gsis_id: undefined } }
    const idx3 = buildOlIdIndex(pm3)
    expect(idx3.byEspn.size).toBe(0)
    expect(idx3.byGsis.size).toBe(0)
    expect(resolveOlSleeperId({ name: 'A One', gsisId: undefined, espnId: null }, idx3, pm3)).toBeNull()
  })
})
