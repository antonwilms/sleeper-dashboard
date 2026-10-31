import { describe, it, expect } from 'vitest'
import { availableWindows, defaultWindow, buildWindowStats, WINDOW_TOTAL_KEYS } from './marketWindowStats'
import { passerRating } from './efficiencyMetrics'
import { usableLiveSeason } from './inSeasonEvidence'
import { computeHistoricalTeamTotals } from './teamContext'

const freeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(freeze)
  }
  return o
}
const row = (stats, o = {}) => ({ gamesPlayed: 10, team: 'KC', scoringBasis: 'league', fantasyPoints: 100, stats, ...o })
const live = (season, players, complete = true) => ({ season, complete, players })
const win = (seasons, kind = 'career') => ({ id: kind, kind, seasons, label: kind })

function run({ window, careerStats = {}, currentSeasonTotals = null, playerMap }) {
  freeze(careerStats); freeze(currentSeasonTotals); freeze(playerMap)
  const before = JSON.stringify(careerStats)
  const map = buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap })
  expect(JSON.stringify(careerStats)).toBe(before)
  expect(Object.keys(careerStats)).not.toContain('2026')
  return map
}

describe('availableWindows / defaultWindow', () => {
  const careerStats = { 2023: {}, 2024: {}, 2025: {} }
  it('live presence follows usableLiveSeason', () => {
    const ids = cst => availableWindows({ careerStats, currentSeasonTotals: cst, liveUsable: usableLiveSeason(cst, 2025) }).map(w => w.id)
    expect(ids(live(2026, {}))[0]).toBe('live')
    expect(ids(live(2026, {}, false))).not.toContain('live')
    expect(ids(live(2025, {}))).not.toContain('live')
  })
  it('window seasons and order', () => {
    const w = availableWindows({ careerStats, currentSeasonTotals: live(2026, {}), liveUsable: true })
    expect(w.map(x => x.id)).toEqual(['live', '2025', '2024', '2023', 'last3', 'career'])
    expect(w.find(x => x.id === 'last3').seasons).toEqual([2026, 2025, 2024])
    expect(w.find(x => x.id === 'career').seasons).toEqual([2026, 2025, 2024, 2023])
    const n = availableWindows({ careerStats, currentSeasonTotals: null, liveUsable: false })
    expect(n.map(x => x.id)).toEqual(['2025', '2024', '2023', 'last3', 'career'])
    expect(n.find(x => x.id === 'last3').seasons).toEqual([2025, 2024, 2023])
    expect(defaultWindow(w).id).toBe('live')
    expect(defaultWindow(n).id).toBe('2025')
    expect(defaultWindow([])).toBeNull()
    expect(availableWindows({ careerStats: {}, currentSeasonTotals: null, liveUsable: false })).toEqual([])
  })
})

describe('buildWindowStats', () => {
  const pm = { qb: { position: 'QB' }, rb: { position: 'RB' }, wr: { position: 'WR' } }

  it('recomputes rates from summed components, ignoring stored rates', () => {
    const careerStats = {
      2024: { qb: row({ pass_cmp: 10, pass_att: 20, pass_yd: 100, pass_td: 1, pass_int: 1, rush_att: 2, rush_yd: 2, cmp_pct: 999, pass_rtg: 999, rush_ypa: 999 }) },
      2025: { qb: row({ pass_cmp: 90, pass_att: 100, pass_yd: 900, pass_td: 9, pass_int: 2, rush_att: 8, rush_yd: 98, cmp_pct: 999, pass_rtg: 999, rush_ypa: 999 }) },
    }
    const ws = run({ window: win([2025, 2024]), careerStats, playerMap: pm }).get('qb')
    expect(ws.rates.cmpPct).toBeCloseTo(100 / 120)
    expect(ws.rates.ypc).toBeCloseTo(100 / 10)
    expect(ws.rates.passerRating).toBeCloseTo(passerRating({ pass_att: 120, pass_cmp: 100, pass_yd: 1000, pass_td: 10, pass_int: 3 }))
  })

  it('live rows come from currentSeasonTotals; a season window excludes them', () => {
    const careerStats = { 2025: { wr: row({ rec_tgt: 10 }) } }
    const cst = live(2026, { wr: row({ rec_tgt: 7 }, { gamesPlayed: 3 }) })
    const l = run({ window: win([2026], 'live'), careerStats, currentSeasonTotals: cst, playerMap: pm }).get('wr')
    expect(l.totals.rec_tgt).toBe(7)
    expect(l.gp).toBe(3)
    const s = run({ window: win([2025], 'season'), careerStats, currentSeasonTotals: cst, playerMap: pm }).get('wr')
    expect(s.totals.rec_tgt).toBe(10)
  })

  it('share denominators are per (season, team) across a team change', () => {
    const t = (n, team) => row({ rec_tgt: n }, { team })
    const careerStats = {
      2024: { wr: t(50, 'KC'), x1: t(450, 'KC'), x2: t(300, 'BUF') },
      2025: { wr: t(100, 'BUF'), x3: t(300, 'BUF'), x4: t(600, 'KC') },
    }
    const map = { ...pm, x1: { position: 'WR' }, x2: { position: 'WR' }, x3: { position: 'WR' }, x4: { position: 'WR' } }
    const ws = run({ window: win([2025, 2024]), careerStats, playerMap: map }).get('wr')
    expect(ws.usage.tgtShare).toBeCloseTo(150 / 900)
    expect(ws.team).toBe('BUF')
  })

  it('live-season share uses live-season teammates only', () => {
    const careerStats = { 2025: { x: row({ rec_tgt: 500 }) } }
    const cst = live(2026, { wr: row({ rec_tgt: 10 }), y: row({ rec_tgt: 30 }) })
    const map = { ...pm, x: { position: 'WR' }, y: { position: 'WR' } }
    const ws = run({ window: win([2026], 'live'), careerStats, currentSeasonTotals: cst, playerMap: map }).get('wr')
    expect(ws.usage.tgtShare).toBeCloseTo(10 / 40)
  })

  it('TEAM_* and DEF rows get no entry and no denominator share', () => {
    const careerStats = { 2025: { wr: row({ rec_tgt: 10 }), TEAM_KC: row({ rec_tgt: 900 }), KC: row({ def_sack: 3 }) } }
    const map = { ...pm, KC: { position: 'DEF' } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: map })
    expect([...m.keys()]).toEqual(['wr'])
    expect(m.get('wr').usage.tgtShare).toBe(1)
  })

  it('excludes K/FB, gp 0 rows, unknown pids; seasons lists only gp>=1 seasons', () => {
    const careerStats = {
      2024: { wr: row({ rec_tgt: 5 }, { gamesPlayed: 5 }), k: row({}), fb: row({}), ghost: row({}) },
      2025: { wr: row({ rec_tgt: 0 }, { gamesPlayed: 0 }), zero: row({}, { gamesPlayed: 0 }) },
    }
    const map = { ...pm, k: { position: 'K' }, fb: { position: 'FB' }, zero: { position: 'RB' } }
    const m = run({ window: win([2025, 2024], 'last3'), careerStats, playerMap: map })
    expect([...m.keys()]).toEqual(['wr'])
    expect(m.get('wr').seasons).toEqual([2024])
    expect(m.get('wr').gp).toBe(5)
  })

  it('tracked-key rule: untracked seasons contribute nothing', () => {
    const careerStats = {
      2019: { wr: row({ rec_tgt: 10, tm_off_snp: 1000 }) },
      2020: { wr: row({ rec_tgt: 10, off_snp: 500, tm_off_snp: 1000 }), o: row({ rec_tgt: 1, off_snp: 100, tm_off_snp: 1000 }) },
    }
    const map = { ...pm, o: { position: 'WR' } }
    const c = run({ window: win([2020, 2019]), careerStats, playerMap: map }).get('wr')
    expect(c.usage.snapPct).toBeCloseTo(0.5)
    expect(c.usage.snapSeasons).toBe(1)
    expect(c.totals.off_snp).toBe(500)
    const only = run({ window: win([2019], 'season'), careerStats, playerMap: map }).get('wr')
    expect(only.usage.snapPct).toBeNull()
    expect(only.totals.off_snp).toBeNull()
    // a tracked key absent on a row counts 0
    const o = run({ window: win([2020], 'season'), careerStats: { 2020: { wr: row({ rec_tgt: 4 }), o: row({ off_snp: 9, tm_off_snp: 10 }) } }, playerMap: map })
    expect(o.get('wr').totals.off_snp).toBe(0)
  })

  it('leagueScored', () => {
    const a = run({ window: win([2025], 'season'), careerStats: { 2025: { wr: row({}) } }, playerMap: pm }).get('wr')
    expect(a.leagueScored).toBe(true)
    const b = run({ window: win([2025, 2024]), careerStats: { 2025: { wr: row({}) }, 2024: { wr: row({}, { scoringBasis: undefined }) } }, playerMap: pm }).get('wr')
    expect(b.leagueScored).toBe(false)
  })

  it('oppPerG by position, games-weighted', () => {
    const careerStats = { 2025: { qb: row({ pass_att: 300, rush_att: 40, rec_tgt: 99 }, { gamesPlayed: 10 }), wr: row({ pass_att: 99, rush_att: 5, rec_tgt: 95 }, { gamesPlayed: 10 }) } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: pm })
    expect(m.get('qb').usage.oppPerG).toBeCloseTo(34)
    expect(m.get('wr').usage.oppPerG).toBeCloseTo(10)
    const w = run({
      window: win([2025, 2024]),
      careerStats: { 2024: { wr: row({ rush_att: 0, rec_tgt: 20 }, { gamesPlayed: 2, fantasyPoints: 40 }) }, 2025: { wr: row({ rush_att: 0, rec_tgt: 160 }, { gamesPlayed: 16, fantasyPoints: 160 }) } },
      playerMap: pm,
    }).get('wr')
    expect(w.fpPerG).toBeCloseTo(200 / 18)
    expect(w.usage.oppPerG).toBeCloseTo(180 / 18)
  })

  it('rate alignment: btklRate uses only tracked seasons, ypc uses both', () => {
    const careerStats = {
      2014: { rb: row({ rush_att: 100, rush_yd: 400 }, { gamesPlayed: 10 }) },
      2015: { rb: row({ rush_att: 200, rush_yd: 1000, rush_btkl: 20 }, { gamesPlayed: 16 }), o: row({ rush_att: 1, rush_btkl: 0 }) },
    }
    const map = { ...pm, o: { position: 'RB' } }
    const rb = run({ window: win([2015, 2014]), careerStats, playerMap: map }).get('rb')
    expect(rb.rates.btklRate).toBeCloseTo(0.1)
    expect(rb.basisGp.btklRate).toBe(16)
    expect(rb.rates.ypc).toBeCloseTo(1400 / 300)
    expect(rb.basisGp.ypc).toBe(rb.gp)
  })

  it('RZ share uses the keep-retired builder; tgtShare does not', () => {
    const careerStats = { 2025: { wr: row({ rec_tgt: 10, rec_rz_tgt: 10 }), ret: row({ rec_tgt: 90, rec_rz_tgt: 10 }) } }
    freeze(careerStats)
    const ws = run({ window: win([2025], 'season'), careerStats, playerMap: pm }).get('wr')
    expect(ws.usage.rzTgtShare).toBeCloseTo(10 / 20)
    expect(ws.usage.tgtShare).toBe(1)
    const rz = computeHistoricalTeamTotals(careerStats, pm)
    expect(ws.usage.rzTgtShare).toBeCloseTo(10 / rz[2025].KC.recRz)
  })

  it('tolerates nulls', () => {
    expect(buildWindowStats({ window: win([2025]), careerStats: { 2025: { wr: row({}) } }, playerMap: null }).size).toBe(0)
    expect(buildWindowStats({ window: win([2025]), careerStats: null, currentSeasonTotals: null, playerMap: pm }).size).toBe(0)
    const m = buildWindowStats({ window: win([2026], 'live'), careerStats: {}, currentSeasonTotals: { complete: true, season: 2026 }, playerMap: pm })
    expect(m.size).toBe(0)
  })

  it('WINDOW_TOTAL_KEYS has 25 keys', () => {
    expect(WINDOW_TOTAL_KEYS).toHaveLength(25)
  })
})
