import { describe, it, expect } from 'vitest'
import { availableWindows, defaultWindow, buildWindowStats, WINDOW_TOTAL_KEYS } from './marketWindowStats'
import { passerRating } from './efficiencyMetrics'
import { usableLiveSeason, opportunitiesPerGame } from './inSeasonEvidence'
import { computeHistoricalTeamTotals } from './teamContext'

const freeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(freeze)
  }
  return o
}
// Weekly fields sit BEFORE the spread so `o` can override them. 'P' weeks 1..gp, 'X' to 18; the whole season's
// stat line and points land in week 1, so a games-played share equals the old season share unless a test says so.
const row = (stats, o = {}) => {
  const gp = o.gamesPlayed ?? 10
  const fantasyPoints = o.fantasyPoints ?? 100
  return {
    gamesPlayed: 10, team: 'KC', scoringBasis: 'league', fantasyPoints, stats,
    weeklyStatus: Array.from({ length: 18 }, (_, i) => (i < gp ? 'P' : 'X')),
    weeklyStats: gp >= 1 ? { 1: stats } : {},
    weeklyPoints: Object.fromEntries(Array.from({ length: gp }, (_, i) => [i + 1, i === 0 ? fantasyPoints : 0])),
    ...o,
  }
}
const logs = (players, complete = true) => ({ complete, players })
const g = (week, team, seasonType = 'REG') => ({ week, team, seasonType })
const live = (season, players, complete = true) => ({ season, complete, players })
const win = (seasons, kind = 'career') => ({ id: kind, kind, seasons, label: kind })

function run({ window, careerStats = {}, currentSeasonTotals = null, playerMap, gameLogsByYear }) {
  freeze(careerStats); freeze(currentSeasonTotals); freeze(playerMap); freeze(gameLogsByYear)
  const before = JSON.stringify(careerStats)
  const map = buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap, gameLogsByYear })
  if (careerStats && typeof careerStats === 'object') {
    expect(JSON.stringify(careerStats)).toBe(before)
    expect(Object.keys(careerStats)).not.toContain('2026')
  }
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
    const ws = run({ window: win([2026, 2025]), careerStats, currentSeasonTotals: cst, playerMap: map }).get('wr')
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
      careerStats: { 2024: { wr: row({ rush_att: 0, rec_tgt: 40 }, { gamesPlayed: 2, fantasyPoints: 40 }) }, 2025: { wr: row({ rush_att: 0, rec_tgt: 160 }, { gamesPlayed: 16, fantasyPoints: 160 }) } },
      playerMap: pm,
    }).get('wr')
    expect(w.fpPerG).toBeCloseTo(200 / 18)
    expect(w.usage.oppPerG).toBeCloseTo(200 / 18)
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

  it('every share keeps retired players', () => {
    const careerStats = { 2025: { wr: row({ rec_tgt: 10, rec_rz_tgt: 10 }), ret: row({ rec_tgt: 90, rec_rz_tgt: 10 }) } }
    freeze(careerStats)
    const ws = run({ window: win([2025], 'season'), careerStats, playerMap: pm }).get('wr')
    expect(ws.usage.rzTgtShare).toBeCloseTo(10 / 20)
    expect(ws.usage.tgtShare).toBeCloseTo(10 / 100)
    const rz = computeHistoricalTeamTotals(careerStats, pm)
    expect(ws.usage.rzTgtShare).toBeCloseTo(10 / rz[2025].KC.recRz)
  })

  it('tolerates nulls', () => {
    expect(run({ window: win([2025]), careerStats: { 2025: { wr: row({}) } }, playerMap: null }).size).toBe(0)
    expect(run({ window: win([2025]), careerStats: null, currentSeasonTotals: null, playerMap: pm }).size).toBe(0)
    const m = run({ window: win([2026], 'live'), careerStats: {}, currentSeasonTotals: { complete: true, season: 2026 }, playerMap: pm })
    expect(m.size).toBe(0)
  })

  it('sackRate denominator is attempts plus sacks', () => {
    const qb = run({ window: win([2025], 'season'), careerStats: { 2025: { qb: row({ pass_att: 90, pass_sack: 10 }) } }, playerMap: pm }).get('qb')
    expect(qb.rates.sackRate).toBeCloseTo(0.1)
    expect(qb.rates.sackRate).not.toBeCloseTo(10 / 90)
  })

  it('carryShare, rzRushShare, aySh map to distinct team totals; basisGp for shares counts only added seasons', () => {
    const map = { ...pm, t: { position: 'WR' } }
    const careerStats = {
      2025: {
        rb: row({ rush_att: 50, rush_rz_att: 5, rec_air_yd: 30 }),
        t: row({ rush_att: 150, rush_rz_att: 15, rec_air_yd: 270 }),
      },
    }
    const ws = run({ window: win([2025], 'season'), careerStats, playerMap: map }).get('rb')
    expect(ws.usage.carryShare).toBeCloseTo(50 / 200)
    expect(ws.usage.rzRushShare).toBeCloseTo(5 / 20)
    expect(ws.usage.aySh).toBeCloseTo(30 / 300)

    const two = {
      2024: { wr: row({ rec_tgt: 99 }, { team: null, gamesPlayed: 6 }) },
      2025: { wr: row({ rec_tgt: 10 }, { gamesPlayed: 10 }), t: row({ rec_tgt: 30 }) },
    }
    const w = run({ window: win([2025, 2024]), careerStats: two, playerMap: map }).get('wr')
    expect(w.basisGp.tgtShare).toBe(10)
    expect(w.usage.tgtShare).toBeCloseTo(10 / 40)
  })

  it('T9: existing shares and their basisGp are pinned (team change, one untracked RZ season)', () => {
    // 2024: wr (KC, 6 g) and x (KC) — no rec_rz_tgt / rush_rz_att keys on any pool row, so RZ is untracked.
    // 2025: wr (BUF, 10 g) and y (BUF).
    // tgtShare   = (20 + 30) / (100 + 100) = 0.25            basis 6 + 10 = 16
    // carryShare = (5 + 12) / (20 + 42)     = 17/62           basis 16   (2024 team 5+15, 2025 team 12+30)
    // aySh       = (100 + 200) / (400 + 600) = 0.3            basis 16
    // rzTgtShare = 3 / 10 (2025 only; 2024 untracked)         basis 10
    // rzRushShare= 1 / 4  (2025 only)                         basis 10
    const map = { ...pm, x: { position: 'WR' }, y: { position: 'WR' } }
    const careerStats = {
      2024: {
        wr: row({ rec_tgt: 20, rush_att: 5, rec_air_yd: 100 }, { gamesPlayed: 6 }),
        x: row({ rec_tgt: 80, rush_att: 15, rec_air_yd: 300 }),
      },
      2025: {
        wr: row({ rec_tgt: 30, rush_att: 12, rec_air_yd: 200, rec_rz_tgt: 3, rush_rz_att: 1 }, { team: 'BUF' }),
        y: row({ rec_tgt: 70, rush_att: 30, rec_air_yd: 400, rec_rz_tgt: 7, rush_rz_att: 3 }, { team: 'BUF' }),
      },
    }
    const ws = run({ window: win([2025, 2024]), careerStats, playerMap: map }).get('wr')
    expect(ws.usage.tgtShare).toBeCloseTo(0.25)
    expect(ws.usage.carryShare).toBeCloseTo(17 / 62)
    expect(ws.usage.aySh).toBeCloseTo(0.3)
    expect(ws.usage.rzTgtShare).toBeCloseTo(0.3)
    expect(ws.usage.rzRushShare).toBeCloseTo(0.25)
    expect(ws.basisGp.tgtShare).toBe(16)
    expect(ws.basisGp.carryShare).toBe(16)
    expect(ws.basisGp.aySh).toBe(16)
    expect(ws.basisGp.rzTgtShare).toBe(10)
    expect(ws.basisGp.rzRushShare).toBe(10)
  })

  it('T1: looksPerG is pass attempts + carries + targets for every position', () => {
    const careerStats = { 2025: {
      rb: row({ pass_att: 2, rush_att: 100, rec_tgt: 30 }),
      qb: row({ pass_att: 300, rush_att: 40, rec_tgt: 1 }),
    } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: pm })
    expect(m.get('rb').usage.looksPerG).toBeCloseTo(13.2)
    expect(m.get('qb').usage.looksPerG).toBeCloseTo(34.1)
  })

  it('T2: usage.oppPerG still equals CR-25 opportunitiesPerGame and differs from looksPerG', () => {
    const stats = { pass_att: 7, rush_att: 40, rec_tgt: 20 }
    const map = { ...pm, te: { position: 'TE' } }
    const careerStats = { 2025: { qb: row(stats), rb: row(stats), wr: row(stats), te: row(stats) } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: map })
    for (const [pid, pos] of [['qb', 'QB'], ['rb', 'RB'], ['wr', 'WR'], ['te', 'TE']]) {
      const r = careerStats[2025][pid]
      const exp = opportunitiesPerGame({ ...r, stats: r.stats }, pos)
      expect(m.get(pid).usage.oppPerG, pid).toBeCloseTo(exp)
      expect(m.get(pid).usage.oppPerG).not.toBeCloseTo(m.get(pid).usage.looksPerG)
    }
  })

  it('T3: fpShare uses the offence denominator — K/DEF/fake-FG rows stay out', () => {
    const map = { ...pm, a: { position: 'WR' }, b: { position: 'WR' }, k: { position: 'K' }, d: { position: 'DEF' } }
    const base = { 2025: {
      a: row({ rec_tgt: 10 }, { fantasyPoints: 60 }),
      b: row({ rec_tgt: 10 }, { fantasyPoints: 140 }),
    } }
    const get = cs => run({ window: win([2025], 'season'), careerStats: cs, playerMap: map })
    let m = get(base)
    expect(m.get('a').usage.fpShare).toBeCloseTo(0.3)
    expect(m.get('b').usage.fpShare).toBeCloseTo(0.7)
    m = get({ 2025: { ...base[2025], k: row({}, { fantasyPoints: 100 }), d: row({}, { fantasyPoints: 100 }) } })
    expect(m.get('a').usage.fpShare).toBeCloseTo(0.3)
    expect(m.get('b').usage.fpShare).toBeCloseTo(0.7)
    m = get({ 2025: { ...base[2025], k: row({ rush_att: 1 }, { fantasyPoints: 150 }) } })
    expect(m.get('a').usage.fpShare).toBeCloseTo(0.3)
    expect(m.get('b').usage.fpShare).toBeCloseTo(0.7)
  })

  it('T4: tdShare — QB counts pass + rush TDs, others rush + rec only', () => {
    const map = { ...pm, w: { position: 'WR' } }
    const careerStats = { 2025: {
      qb: row({ pass_att: 500, pass_td: 30, rush_att: 40, rush_td: 5 }),
      w: row({ rec_tgt: 120, rec_td: 30, pass_td: 1 }),
      rb: row({ rush_att: 200, rush_td: 5 }),
    } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: map })
    expect(m.get('qb').usage.tdShare).toBeCloseTo(35 / 40)
    expect(m.get('w').usage.tdShare).toBeCloseTo(30 / 40)
    expect(m.get('rb').usage.tdShare).toBeCloseTo(5 / 40)
  })

  it('T5: scrimYdShare uses both yard keys in numerator and denominator', () => {
    const careerStats = { 2025: {
      rb: row({ rush_att: 150, rush_yd: 600, rec_tgt: 30, rec_yd: 200 }),
      wr: row({ rec_tgt: 120, rec_yd: 1200, rush_yd: 0 }),
    } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: pm })
    expect(m.get('rb').usage.scrimYdShare).toBeCloseTo(0.4)
    expect(m.get('wr').usage.scrimYdShare).toBeCloseTo(0.6)
  })

  it('T6: ybcPerAtt skips seasons where rush_yac is untracked', () => {
    const careerStats = {
      2014: { rb: row({ rush_att: 100, rush_yd: 400 }, { gamesPlayed: 10 }) },
      2015: { rb: row({ rush_att: 200, rush_yd: 1000, rush_yac: 600 }, { gamesPlayed: 16 }) },
    }
    const both = run({ window: win([2015, 2014]), careerStats, playerMap: pm }).get('rb')
    expect(both.rates.ybcPerAtt).toBeCloseTo(2.0)
    expect(both.basisGp.ybcPerAtt).toBe(16)
    const only = run({ window: win([2014], 'season'), careerStats, playerMap: pm }).get('rb')
    expect(only.rates.ybcPerAtt).toBeNull()
  })

  it('T12: share denominators keep retired players and drop zero-volume rows', () => {
    const map = { ...pm, w: { position: 'WR' } }
    const careerStats = { 2018: {
      w: row({ rec_tgt: 100, rec_td: 6, rec_yd: 800, rush_td: 0, rush_yd: 0 }, { fantasyPoints: 150 }),
      ret: row({ rec_tgt: 50, rec_td: 4, rec_yd: 400 }, { fantasyPoints: 50 }),
    } }
    const withNoise = { 2018: { ...careerStats[2018], idp: row({ idp_tkl: 90 }, { fantasyPoints: 100 }) } }
    for (const cs of [careerStats, withNoise]) {
      const m = run({ window: win([2018], 'season'), careerStats: cs, playerMap: map })
      const w = m.get('w')
      expect(w.usage.fpShare).toBeCloseTo(0.75)
      expect(w.usage.tdShare).toBeCloseTo(0.6)
      expect(w.usage.scrimYdShare).toBeCloseTo(800 / 1200)
      expect(m.has('ret')).toBe(false)
    }
  })

  // ── D2b: games-played shares ──────────────────────────────────────────────────────────────────────────
  // A row whose weeks are given explicitly: `weeks` = { [week]: stats-line }, 'P' for every listed week; the
  // season stats are the Σ of the weeks so the CR-34 per-season guard passes.
  const wrow = (weeks, o = {}) => {
    const stats = {}
    for (const w of Object.values(weeks)) for (const [k, v] of Object.entries(w)) stats[k] = (stats[k] ?? 0) + v
    const nums = Object.keys(weeks).map(Number)
    return row(stats, {
      gamesPlayed: nums.length,
      weeklyStatus: Array.from({ length: 18 }, (_, i) => (nums.includes(i + 1) ? 'P' : 'X')),
      weeklyStats: weeks,
      ...o,
    })
  }
  const tgtWeeks = (from, to, n) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { rec_tgt: n }]))
  const wpm = { wr: { position: 'WR' }, x: { position: 'WR' }, p: { position: 'WR' }, lv1: { position: 'WR' }, nyj1: { position: 'WR' }, t: { position: 'WR' }, y: { position: 'WR' } }

  it('G1: a share is Σ player ÷ Σ team over the weeks he played, not the team season', () => {
    const careerStats = { 2025: {
      wr: wrow(tgtWeeks(1, 8, 10)),
      x: wrow({ ...tgtWeeks(1, 8, 5), ...tgtWeeks(9, 16, 15) }),
    } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: wpm })
    expect(m.get('wr').usage.tgtShare).toBeCloseTo(2 / 3)
    expect(m.get('wr').basisGp.tgtShare).toBe(8)
    expect(m.get('x').usage.tgtShare).toBeCloseTo(2 / 3)
  })

  const g2 = () => ({ 2024: {
    p: wrow(tgtWeeks(1, 6, 10), { team: 'NYJ' }),
    lv1: wrow(tgtWeeks(1, 6, 10), { team: 'LV' }),
    nyj1: wrow(tgtWeeks(1, 6, 20), { team: 'NYJ' }),
  } })
  const range = (a, b, team, type = 'REG') => Array.from({ length: b - a + 1 }, (_, i) => g(a + i, team, type))
  const g2logs = (complete = true, pType = 'REG') => logs({
    p: { games: [...range(1, 2, 'LV', pType), ...range(3, 6, 'NYJ')] },
    lv1: { games: range(1, 6, 'LV') },
    nyj1: { games: range(1, 6, 'NYJ') },
  }, complete)

  it('G2: each week is credited to the team in the gamelogs; no or incomplete logs → season team', () => {
    const w = win([2024], 'season')
    let m = run({ window: w, careerStats: g2(), playerMap: wpm, gameLogsByYear: { 2024: g2logs() } })
    expect(m.get('p').usage.tgtShare).toBeCloseTo(60 / 160)
    expect(m.get('nyj1').usage.tgtShare).toBeCloseTo(120 / 160)
    expect(m.get('lv1').usage.tgtShare).toBeCloseTo(60 / 80)
    for (const gl of [undefined, { 2024: g2logs(false) }]) {
      m = run({ window: w, careerStats: g2(), playerMap: wpm, gameLogsByYear: gl })
      expect(m.get('p').usage.tgtShare).toBeCloseTo(1 / 3)
      expect(m.get('nyj1').usage.tgtShare).toBeCloseTo(2 / 3)
      expect(m.get('lv1').usage.tgtShare).toBeCloseTo(1)
    }
  })

  it('G3: POST games are never read as REG weeks', () => {
    const m = run({ window: win([2024], 'season'), careerStats: g2(), playerMap: wpm, gameLogsByYear: { 2024: g2logs(true, 'POST') } })
    expect(m.get('p').usage.tgtShare).toBeCloseTo(1 / 3)
  })

  it('G4: the gamelog team goes through the CR-16 era hop (LA → STL in 2015)', () => {
    const careerStats = { 2015: {
      p: wrow(tgtWeeks(1, 3, 10), { team: 'STL' }),
      t: wrow(tgtWeeks(1, 3, 30), { team: 'STL' }),
    } }
    const m = run({
      window: win([2015], 'season'), careerStats, playerMap: wpm,
      gameLogsByYear: { 2015: logs({ p: { games: range(1, 3, 'LA') } }) },
    })
    expect(m.get('p').usage.tgtShare).toBeCloseTo(0.25)
  })

  it('G5: a season with an uncovered offence row contributes no weeks to any share', () => {
    const careerStats = {
      2025: { wr: wrow({ 1: { rec_tgt: 10 } }), x: wrow({ 1: { rec_tgt: 30 } }) },
      2024: { wr: wrow({ 1: { rec_tgt: 50 } }), y: wrow({ 1: { rec_tgt: 50 } }, { weeklyStats: undefined }) },
    }
    const m = run({ window: win([2025, 2024]), careerStats, playerMap: wpm })
    expect(m.get('wr').usage.tgtShare).toBeCloseTo(0.25)
    expect(m.get('wr').basisGp.tgtShare).toBe(1)
    const only = run({ window: win([2024], 'season'), careerStats, playerMap: wpm })
    expect(only.get('wr').usage.tgtShare).toBeNull()
    expect(only.get('wr').basisGp.tgtShare).toBe(0)
  })

  it('G6: fpShare uses the league-basis weekly points, not sourceWeeklyPoints', () => {
    const careerStats = { 2025: {
      wr: wrow({ 1: { rec_tgt: 10 } }, { weeklyPoints: { 1: 30 }, sourceWeeklyPoints: { 1: 3 } }),
      x: wrow({ 1: { rec_tgt: 10 } }, { weeklyPoints: { 1: 70 }, sourceWeeklyPoints: { 1: 50 } }),
    } }
    const m = run({ window: win([2025], 'season'), careerStats, playerMap: wpm })
    expect(m.get('wr').usage.fpShare).toBeCloseTo(0.3)
  })

  it('G11: a weekly key whose weeks do not sum to the season value is skipped, not summed', () => {
    const base = {
      wr: wrow({ 1: { rec_tgt: 10, rec_air_yd: 100 } }),
      x: wrow({ 1: { rec_tgt: 30, rec_air_yd: 100 } }, { stats: { rec_tgt: 30, rec_air_yd: 300 } }),
    }
    let m = run({ window: win([2025], 'season'), careerStats: { 2025: base }, playerMap: wpm })
    expect(m.get('wr').usage.aySh).toBeNull()
    expect(m.get('wr').basisGp.aySh).toBe(0)
    expect(m.get('wr').usage.tgtShare).toBeCloseTo(10 / 40)
    const good = {
      wr: wrow({ 1: { rec_tgt: 10, rec_air_yd: 100 } }),
      x: wrow({ 1: { rec_tgt: 30, rec_air_yd: 100 } }),
    }
    m = run({ window: win([2025, 2024]), careerStats: { 2025: base, 2024: good }, playerMap: wpm })
    expect(m.get('wr').usage.aySh).toBeCloseTo(100 / 200)
    expect(m.get('wr').basisGp.aySh).toBe(1)
  })

  it('WINDOW_TOTAL_KEYS has 25 keys', () => {
    expect(WINDOW_TOTAL_KEYS).toHaveLength(25)
  })
})
