import { describe, it, expect } from 'vitest'
import { buildAdvanced, GAMELOG_ADV_KEYS } from './marketAdvanced'

const mk = (pid, position = 'WR') => ({ pid, position, gp: 17, totals: {}, rates: {}, usage: {}, basisGp: {} })
const M = list => new Map(list.map(w => [w.pid, w]))
const SEASON_WIN = { id: '2024', kind: 'season', seasons: [2024], label: '2024' }
const LIVE_WIN = { id: 'live', kind: 'live', seasons: [2025], label: '2025 so far' }
const eff = { w1: { epaPerAtt: 0.1, cpoe: 2, rushEpaTotal: 3, rushEpaPerAtt: 0.05, epaPerTgt: 0.2 } }
const advStats = { complete: true, year: 2024, byId: { w1: { racr: 1.15, components: { targets: 30 } } } }
const advStatsLive = {
  complete: true, year: 2025,
  byId: {
    w1: { racr: 2.45, components: { targets: 30, weeks: 5 } },
    w2: { racr: 3.0, components: { targets: 24, weeks: 5 } },
    w3: { racr: 3.0, components: { targets: 30, weeks: 0 } },
  },
}
const base = { dataSeason: 2024, seasonEfficiency: eff, advStats, advStatsLive: null, liveSeason: 2025, liveWindowSeason: null }
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o) } return o }

describe('buildAdvanced', () => {
  it('1. dataSeason window: attaches adv from seasonEfficiency and floored RACR; covered/covered', () => {
    const ws = M([mk('w1'), mk('w2')])
    const { stats, coverage } = buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN })
    expect(coverage).toMatchObject({ gamelogs: 'covered', racr: 'covered' })
    expect(stats.get('w1').adv).toEqual({ epaPerAtt: 0.1, cpoe: 2, rushEpaTotal: 3, rushEpaPerAtt: 0.05, epaPerTgt: 0.2, racr: 1.15 })
    expect(Object.keys(stats.get('w2').adv).sort()).toEqual([...GAMELOG_ADV_KEYS, 'racr'].sort())
    expect(Object.values(stats.get('w2').adv).every(v => v === null)).toBe(true)
  })

  it('2. last3, career and a non-dataSeason season return the input Map untouched; both outside', () => {
    const ws = M([mk('w1')])
    for (const window of [
      { id: 'last3', kind: 'last3', seasons: [2022, 2023, 2024] },
      { id: 'career', kind: 'career', seasons: [2020, 2021, 2022, 2023, 2024] },
      { id: '2023', kind: 'season', seasons: [2023] },
    ]) {
      const { stats, coverage } = buildAdvanced({ ...base, windowStats: ws, window })
      expect(stats, window.id).toBe(ws)
      expect(stats.get('w1').adv).toBeUndefined()
      expect(coverage).toMatchObject({ gamelogs: 'outside', racr: 'outside' })
    }
  })

  it('3. live window: RACR from the live row only; EPA null even with seasonEfficiency; floors apply', () => {
    const ws = M([mk('w1'), mk('w2'), mk('w3')])
    const { stats, coverage } = buildAdvanced({ ...base, windowStats: ws, window: LIVE_WIN, advStatsLive, liveWindowSeason: 2025 })
    expect(coverage).toMatchObject({ gamelogs: 'outside', racr: 'covered', racrLiveAvailable: true })
    expect(stats.get('w1').adv.racr).toBe(2.45)
    for (const k of GAMELOG_ADV_KEYS) expect(stats.get('w1').adv[k], k).toBeNull()
    expect(stats.get('w2').adv.racr).toBeNull()   // 24 targets < floor
    expect(stats.get('w3').adv.racr).toBeNull()   // weeks: 0
  })

  it('4. live window whose season differs from liveSeason is unloaded, with no adv', () => {
    const ws = M([mk('w1')])
    const { stats, coverage } = buildAdvanced({
      ...base, windowStats: ws, window: { ...LIVE_WIN, seasons: [2026] }, advStatsLive, liveWindowSeason: 2026,
    })
    expect(coverage.racr).toBe('unloaded')
    expect(stats).toBe(ws)
  })

  it('5. missing seasonEfficiency → gamelogs unloaded; wrong-year advStats → racr unloaded', () => {
    const ws = M([mk('w1')])
    const a = buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN, seasonEfficiency: null })
    expect(a.coverage.gamelogs).toBe('unloaded')
    expect(a.stats.get('w1').adv.epaPerTgt).toBeNull()
    expect(a.stats.get('w1').adv.racr).toBe(1.15)
    const b = buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN, advStats: { ...advStats, year: 2023 } })
    expect(b.coverage.racr).toBe('unloaded')
    expect(b.stats.get('w1').adv.racr).toBeNull()
    expect(b.stats.get('w1').adv.epaPerTgt).toBe(0.2)
    const c = buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN, advStats: { ...advStats, complete: false } })
    expect(c.coverage.racr).toBe('unloaded')
  })

  it('6. frozen inputs are never mutated; output ws are new objects', () => {
    const ws = M([mk('w1')])
    const inputWs = ws.get('w1')
    deepFreeze(inputWs)
    deepFreeze(eff)
    deepFreeze(advStats)
    deepFreeze(advStatsLive)
    const { stats } = buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN, advStatsLive, liveWindowSeason: 2025 })
    expect(inputWs.adv).toBeUndefined()
    expect(stats.get('w1')).not.toBe(inputWs)
    expect(stats).not.toBe(ws)
  })

  it('7. racrLiveAvailable only when the live load is usable and the live window is offered', () => {
    const ws = M([mk('w1')])
    const call = o => buildAdvanced({ ...base, windowStats: ws, window: SEASON_WIN, advStatsLive, liveWindowSeason: 2025, ...o }).coverage.racrLiveAvailable
    expect(call({})).toBe(true)
    expect(call({ liveWindowSeason: null })).toBe(false)
    expect(call({ advStatsLive: null })).toBe(false)
    expect(call({ liveWindowSeason: 2026 })).toBe(false)
  })

  it('8. windowStats null → stats null, coverage still returned', () => {
    const r = buildAdvanced({ ...base, windowStats: null, window: SEASON_WIN })
    expect(r.stats).toBeNull()
    expect(r.coverage.gamelogs).toBe('covered')
  })
})
