// Computed-stats verification harness — read-only. See .claude/tasks/computed-stats-verification.md.
//   node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data \
//     --out ../sleeper-dashboard-data/verification [--date YYYY-MM-DD] [--only v1,v2,v3] [--no-fetch]
// Never imported by src/. Writes only <data>/verification/ and node_modules/.cache/verify-computed-stats/.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readDataJson, newestDated, assertOutPath, cachedFetchJson, gitInfo } from './lib/io.mjs'
import { compareWeeklyPoints, attributeKeys, bucketDiffs, rateBy, countClasses } from './lib/v1FantasyPoints.mjs'
import { runV2, median, SKILL } from './lib/v2GradeInputs.mjs'
import { runV3 } from './lib/v3Joins.mjs'
import { renderReport, classifyDefects, validateAnnotations } from './lib/report.mjs'
import { refTeam } from './lib/nflverseRebuild.mjs'
import { rescoreSeasonTotals } from '../../src/api/sleeperStats.js'
import { isValidSeasonTotals } from '../../src/api/dataStore.js'
import { normalizeCollegeStats } from '../../src/api/cfbd.js'
import { getPointsBreakdown, calculateFantasyPoints, seasonEmitsFirstDownBonus } from '../../src/utils/fantasyPoints.js'

const API = 'https://api.sleeper.app/v1'
const STATS = 'https://api.sleeper.com/stats/nfl'
const V2_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025]

function parseArgs(argv) {
  const get = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
  const only = get('--only')
  return {
    data: get('--data'), out: get('--out'), date: get('--date') ?? new Date().toISOString().slice(0, 10),
    only: only ? new Set(only.split(',').map(s => s.trim().toLowerCase())) : new Set(['v1', 'v2', 'v3']),
    noFetch: argv.includes('--no-fetch'), annotations: get('--annotations'),
  }
}

const quietly = fn => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = l; console.warn = w } }

// ── V1 ───────────────────────────────────────────────────────────────────────
async function runV1({ dataDir, fetchJ, snapshot, served, playersMap, manifest }) {
  const league2026 = (await fetchJ(`${API}/league/${snapshot.leagueId}`)).data
  const prevId = league2026.previous_league_id
  const league2025 = (await fetchJ(`${API}/league/${prevId}`)).data
  const state = (await fetchJ(`${API}/state/nfl`)).data
  const settings = { 2025: league2025.scoring_settings, 2026: league2026.scoring_settings }
  const settingsDiff = []
  for (const k of new Set([...Object.keys(settings[2026]), ...Object.keys(snapshot.scoringSettings)])) {
    if ((settings[2026][k] ?? null) !== (snapshot.scoringSettings[k] ?? null)) settingsDiff.push({ key: k, snapshot: snapshot.scoringSettings[k] ?? null, league: settings[2026][k] ?? null })
  }
  const lastScored2025 = league2025.settings?.last_scored_leg ?? 17
  const schedule = readDataJson(dataDir, 'nflverse/schedule/2026.json')
  const manifestLm = manifest.files?.['nfl/season-totals/2026.json']?.lastModified ?? null

  const weeks = { 2025: Array.from({ length: lastScored2025 }, (_, i) => i + 1), 2026: [] }
  const excluded = []
  // capture completeness baseline
  const perWeekCount = (rows, w) => Object.values(rows).filter(r => r?.weeklyStats && Object.prototype.hasOwnProperty.call(r.weeklyStats, String(w))).length
  const baseline2025 = median(Array.from({ length: 18 }, (_, i) => perWeekCount(served[2025], i + 1)).filter(n => n > 0))
  const counts2026 = {}
  const live2026Season = state.season === '2026' && state.season_type === 'regular'
  const maxWeek = live2026Season ? state.week - 1 : 0
  for (let w = 1; w <= Math.max(maxWeek, 0) + 1 && w <= 18; w++) {
    counts2026[w] = perWeekCount(served[2026], w)
    const base = { season: 2026, week: w, rows: counts2026[w], manifestLastModified: manifestLm, scheduleGeneratedAt: schedule.generatedAt }
    if (w > maxWeek) { if (live2026Season) excluded.push({ ...base, gate: '1 (w ≥ state.week)', detail: `state.week = ${state.week}` }); continue }
    const prior = w === 1 ? baseline2025 : median(Array.from({ length: w - 1 }, (_, i) => counts2026[i + 1]))
    if (!(counts2026[w] >= 0.8 * prior)) { excluded.push({ ...base, gate: '2 (capture completeness)', detail: `${counts2026[w]} rows vs baseline ${prior}` }); continue }
    const games = schedule.games.filter(g => g.week === w && g.gameType === 'REG')
    if (!games.length || games.some(g => g.homeScore == null || g.awayScore == null)) { excluded.push({ ...base, gate: '3 (week finished)', detail: `${games.filter(g => g.homeScore == null || g.awayScore == null).length} of ${games.length} games unscored` }); continue }
    const scheduled = new Set(games.flatMap(g => [g.homeTeam, g.awayTeam]).map(t => refTeam(t, 2026)))
    const captured = new Set(Object.entries(served[2026]).filter(([id, r]) => id.startsWith('TEAM_') && r.weeklyStatus?.[w - 1] === 'P').map(([, r]) => refTeam(r.team, 2026)))
    const missing = [...scheduled].filter(t => !captured.has(t))
    if (missing.length) { excluded.push({ ...base, gate: '4 (per-team coverage)', detail: `missing: ${missing.join(' ')}` }); continue }
    weeks[2026].push(w)
  }

  const rescored = {
    2025: quietly(() => rescoreSeasonTotals(served[2025], settings[2025], playersMap)),
    2026: quietly(() => rescoreSeasonTotals(served[2026], settings[2026], playersMap)),
  }
  const rows = []
  const duplicates = [], customPoints = []
  for (const season of [2025, 2026]) {
    const leagueId = season === 2025 ? prevId : snapshot.leagueId
    for (const week of weeks[season]) {
      const matchups = (await fetchJ(`${API}/league/${leagueId}/matchups/${week}`)).data
      const pts = new Map()
      for (const m of matchups) {
        if (m.custom_points != null) customPoints.push({ season, week, rosterId: m.roster_id, value: m.custom_points })
        for (const [pid, v] of Object.entries(m.players_points ?? {})) {
          if (pts.has(pid) && pts.get(pid) !== v) duplicates.push({ season, week, pid })
          else if (!pts.has(pid)) pts.set(pid, v)
        }
      }
      for (const [pid, sleeperPts] of pts) {
        const appRow = rescored[season][pid]
        const cmp = compareWeeklyPoints({ sleeperPts, appRow, week })
        rows.push({ season, week, pid, position: playersMap[pid]?.position ?? (/^\d+$/.test(pid) ? 'unknown' : 'DEF'), name: playersMap[pid]?.full_name ?? pid,
          sleeperPts, appPts: cmp.appPts, method: cmp.method, delta: cmp.delta, class: cmp.class })
      }
    }
  }

  // key attribution (diff + app-missing-nonzero)
  const liveCache = {}
  const getLive = async (season, week) => {
    const k = `${season}/${week}`
    if (!liveCache[k]) {
      const list = (await fetchJ(`${STATS}/${season}/${week}?season_type=regular`)).data
      const map = {}
      if (Array.isArray(list)) for (const e of list) if (e.player_id && e.stats) map[e.player_id] = e.stats
      liveCache[k] = map
    }
    return liveCache[k]
  }
  for (const r of rows) {
    if (r.class !== 'diff' && r.class !== 'app-missing-nonzero') continue
    const live = (await getLive(r.season, r.week))[r.pid] ?? null
    const sw = served_(served, r)
    const a = attributeKeys({ served: sw, live, settings: settings[r.season], sleeperPts: r.sleeperPts, appPts: r.appPts, method: r.method })
    r.cause = a.cause; r.staleKeys = a.staleKeys; r.residual = a.residual; r.liveMissing = a.liveMissing; r.liveScore = a.liveScore
    r._served = sw; r._live = live
  }

  const diffs = rows.filter(r => r.class === 'diff')
  const causes = {}
  for (const r of diffs) causes[r.cause] = (causes[r.cause] ?? 0) + 1
  const missingBreakdown = []
  const mm = {}
  for (const r of rows) {
    if (r.class === 'app-missing-nonzero') mm[`${r.class}|${r.cause}`] = (mm[`${r.class}|${r.cause}`] ?? 0) + 1
    if (r.class === 'app-no-row') mm[`${r.class}|${r.sleeperPts === 0 ? 'sleeper-zero' : 'sleeper-nonzero'}`] = (mm[`${r.class}|${r.sleeperPts === 0 ? 'sleeper-zero' : 'sleeper-nonzero'}`] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(mm)) { const [c, cause] = k.split('|'); missingBreakdown.push({ class: c, cause, rows: n }) }

  const brk = (stats, s) => getPointsBreakdown(stats ?? {}, s).contributions.slice(0, 3).map(c => `${c.key} ${c.pts}`).join(', ')
  const top25 = [...diffs].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 25).map(r => ({
    ...r, topKeys: `served: ${brk(r._served, settings[r.season])} → live: ${brk(r._live, settings[r.season])}`,
  }))
  const agg = {}
  for (const r of diffs) {
    for (const k of r.staleKeys) { const a = agg[k.key] ?? (agg[k.key] = { key: k.key, sumAbs: 0, rows: 0 }); a.sumAbs += Math.abs(k.pts); a.rows++ }
    if (Math.abs(r.residual) > 0.01) { const a = agg['(residual: non-dot-product scoring)'] ?? (agg['(residual: non-dot-product scoring)'] = { key: '(residual: non-dot-product scoring)', sumAbs: 0, rows: 0 }); a.sumAbs += Math.abs(r.residual); a.rows++ }
  }
  const keyAgg = Object.values(agg).sort((a, b) => b.sumAbs - a.sumAbs)

  // G8 as-run gap
  const asRunRows = quietly(() => rescoreSeasonTotals(served[2025], settings[2026], playersMap))
  const shifts = []
  for (const r of rows) {
    if (r.season !== 2025 || r.appPts == null) continue
    const wp = asRunRows[r.pid]?.weeklyPoints
    const v = wp == null ? null : (Array.isArray(wp) ? wp[r.week - 1] : wp[r.week])
    if (v != null) shifts.push(Math.abs(v - r.appPts))
  }
  const diffKeys = [...new Set([...Object.keys(settings[2025]), ...Object.keys(settings[2026])])].filter(k => (settings[2025][k] ?? null) !== (settings[2026][k] ?? null))
  const asRun = { n: shifts.length, mean: shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : null, max: shifts.length ? Math.max(...shifts) : null, keys: diffKeys }

  for (const r of rows) { delete r._served; delete r._live }
  return {
    leagues: [{ season: 2025, leagueId: prevId, lastScoredLeg: lastScored2025 }, { season: 2026, leagueId: snapshot.leagueId, lastScoredLeg: league2026.settings?.last_scored_leg ?? null }],
    includedWeeks: weeks, excluded, settingsDiff, rows, counts: countClasses(rows),
    rateOverall: rateBy(rows, () => 'all').all ?? { match: 0, diff: 0, rate: null },
    rateBySeason: rateBy(rows, r => r.season), rateByPosition: rateBy(rows, r => r.position), rateByMethod: rateBy(rows, r => r.method ?? 'none'),
    buckets: bucketDiffs(diffs.map(r => r.delta)), causes, missingBreakdown, top25, keyAgg, asRun, customPoints, duplicates,
    playersState: { week: state.week, season: state.season },
  }
}

// served weeklyStats[w] for a V1 row (rescoring keeps weeklyStats by reference)
function served_(served, r) { return served[r.season][r.pid]?.weeklyStats?.[r.week] ?? {} }

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.data || !args.out) throw new Error('usage: --data <data repo> --out <data repo>/verification [--date] [--only] [--no-fetch]')
  const dataDir = path.resolve(args.data)
  const outDir = assertOutPath(args.out, dataDir)
  const cacheDir = path.resolve('node_modules/.cache/verify-computed-stats', args.date)
  const fetches = []
  const fetchJ = url => cachedFetchJson(url, cacheDir, { noFetch: args.noFetch, fetches, delayMs: 40 })

  const manifest = readDataJson(dataDir, 'manifest.json')
  const snapFile = newestDated(dataDir, 'snapshots', /^(\d{4}-\d{2}-\d{2})\.json$/)
  const snapshot = readDataJson(dataDir, `snapshots/${snapFile}`)
  const pm = await fetchJ(`${API}/players/nfl`)
  const playersMap = pm.data

  const served = {}
  const inputs = [{ path: `snapshots/${snapFile}` }]
  for (let y = 2020; y <= 2026; y++) {
    const rel = `nfl/season-totals/${y}.json`
    served[y] = readDataJson(dataDir, rel)
    if (!isValidSeasonTotals(served[y])) throw new Error(`${rel} fails isValidSeasonTotals`)
    inputs.push({ path: rel, lastModified: manifest.files?.[rel]?.lastModified ?? null })
  }
  const git = gitInfo(dataDir, ['snapshots', 'ktc', 'nfl/season-totals', 'nflverse', 'college', 'manifest.json'])   // inclusion pathspec: the run's inputs
  const appGit = gitInfo(process.cwd(), ['scripts/verify', 'vitest.config.js'])
  const results = { ran: { v1: args.only.has('v1'), v2: args.only.has('v2'), v3: args.only.has('v3') }, seasons: V2_SEASONS, gaps: {}, defects: [], unclassified: [] }
  const commandStr = `node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- ${process.argv.slice(2).join(' ')}`.trim()
  results.header = { date: args.date, appSha: appGit.head + (appGit.clean ? '' : ' (dirty tree)'), dataSha: git.head, dataClean: git.clean, snapshotFile: `snapshots/${snapFile} (capturedAt ${snapshot.capturedAt})`,
    playersMapFetchedAt: pm.fetchedAt, command: commandStr }

  if (results.ran.v1) results.v1 = await runV1({ dataDir, fetchJ, snapshot, served, playersMap, manifest })

  const career = {}
  if (results.ran.v2) {
    const load = (fam, y) => readDataJson(dataDir, `nflverse/${fam}/${y}.json`)
    const ctx = { seasons: V2_SEASONS, careerStats: career, playersMap, gamelogs: {}, teamcontext: {}, snaps: {}, rosterweekly: {} }
    for (const y of V2_SEASONS) {
      career[y] = quietly(() => rescoreSeasonTotals(served[y], snapshot.scoringSettings, playersMap))
      ctx.gamelogs[y] = load('gamelogs', y); ctx.teamcontext[y] = load('teamcontext', y)
      ctx.snaps[y] = load('snaps', y); ctx.rosterweekly[y] = load('rosterweekly', y)
      for (const fam of ['gamelogs', 'teamcontext', 'snaps', 'rosterweekly', 'advstats']) {
        const rel = `nflverse/${fam}/${y}.json`
        inputs.push({ path: rel, lastModified: manifest.files?.[rel]?.lastModified ?? null })
      }
    }
    results.v2 = quietly(() => runV2(ctx))
  }

  let ktcFile = null
  if (results.ran.v3) {
    ktcFile = newestDated(dataDir, 'ktc', /^snapshot-(\d{4}-\d{2}-\d{2})\.json$/)
    const ktcRowsAll = readDataJson(dataDir, `ktc/${ktcFile}`)
    const picksByYear = readDataJson(dataDir, 'nflverse/draft/draft_picks.json').picksByYear
    const crosswalk = readDataJson(dataDir, 'nflverse/playerids.json')
    const rawCollege = { receiving: {}, rushing: {}, passing: {} }
    for (const cat of Object.keys(rawCollege)) {
      for (let y = 2017; y <= 2025; y++) rawCollege[cat][y] = normalizeCollegeStats(readDataJson(dataDir, `college/${cat}/${y}.json`)) ?? {}
    }
    inputs.push({ path: `ktc/${ktcFile}` }, { path: 'nflverse/draft/draft_picks.json' }, { path: 'nflverse/playerids.json' })
    results.header.ktcFile = `ktc/${ktcFile}`
    results.v3 = runV3({ ktcRowsAll, playersMap, picksByYear, rawCollege, crosswalk, currentYear: Number(args.date.slice(0, 4)) })
  }

  results.gaps = measureGaps(results, { served, career, playersMap })
  const proposals = classifyDefects(results)
  results.proposedDefects = proposals
  if (args.annotations) {
    const raw = fs.readFileSync(args.annotations, 'utf8')
    const ann = validateAnnotations(JSON.parse(raw))
    results.defects = ann.defects ?? []
    results.unclassified = ann.unclassified ?? []
    results.notes = ann.notes ?? {}
    results.annotations = { path: args.annotations, sha256: crypto.createHash('sha256').update(raw).digest('hex'), content: ann }
  }

  fs.mkdirSync(outDir, { recursive: true })
  const base = path.join(outDir, `${args.date}-computed-stats-verification`)
  fs.writeFileSync(`${base}.md`, renderReport(results))
  fs.writeFileSync(`${base}.json`, JSON.stringify(sidecar(results, inputs, fetches, git, appGit, args), null, 2))
  console.log(`wrote ${base}.md and .json`)
  console.log(JSON.stringify({ proposedDefects: proposals.map(p => ({ id: p.id, count: p.count ?? p.summary?.out })) }))
}

function sidecar(results, inputs, fetches, git, appGit, args) {
  const MAX = 5 * 1024 * 1024
  const v1Rows = results.v1?.rows ?? null
  const build = (rows) => ({
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    inputs: { files: inputs, dataRepo: { head: git.head, clean: git.clean }, appHarness: { head: appGit.head, clean: appGit.clean }, runDate: args.date },
    fetches,
    annotations: results.annotations ?? null,
    v1: results.v1 ? { summary: { counts: results.v1.counts, rateOverall: results.v1.rateOverall, includedWeeks: results.v1.includedWeeks, excluded: results.v1.excluded, causes: results.v1.causes, asRun: results.v1.asRun, truncated: rows !== v1Rows ? 'match rows dropped (sidecar > 5 MB)' : null }, rows } : null,
    v2: results.v2 ? { summary: results.v2.summary, series: results.v2.series, outOfTolerance: results.v2.outOfTolerance, traded: results.v2.traded, findings: results.v2.findings, info: results.v2.info } : null,
    v3: results.v3 ? { flagged: { ktc: results.v3.ktc, draft: results.v3.draft, college: results.v3.college }, counts: results.v3.counts, sizes: results.v3.sizes, draftInfo: results.v3.draftInfo, rushingOnlyRbs: results.v3.rushingOnlyRbs } : null,
  })
  let out = build(v1Rows)
  if (JSON.stringify(out).length > MAX && v1Rows) out = build(v1Rows.filter(r => r.class !== 'match'))
  return out
}

// ── gap measurements ─────────────────────────────────────────────────────────
function measureGaps(results, { served, career, playersMap }) {
  const g = {}
  const { v1, v2 } = results
  if (v2) {
    const i = v2.info
    g.G1 = `Reception-share vs true target-share gap over ${i.g1.n} WR/TE player-seasons (every V2.8 WR/TE row, both shares on the same current-team reference): mean |gap| ${i.g1.meanAbsGap?.toFixed(4)}, p95 ${i.g1.p95AbsGap?.toFixed(4)}, max ${i.g1.maxAbsGap?.toFixed(4)}; ${i.g1.over0_01} rows > 0.01, ${i.g1.over0_05} rows > 0.05.`
    const g2 = i.g2 ?? []
    const abs = g2.map(x => Math.abs(x.delta)).sort((a, b) => a - b)
    g.G2 = `${g2.length} share rows (V2.7, and V2.8-g2effect: current-team reference minus season-team reference) where the app's attributed current team differs from the player's nflverse season team; mean |error| ${abs.length ? (abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(4) : '—'}, max ${abs.length ? abs[abs.length - 1].toFixed(4) : '—'}; ${abs.filter(x => x > 0.05).length} rows > 0.05.`
    const bySeason = {}
    for (const t of v2.traded) bySeason[t.season] = (bySeason[t.season] ?? new Set()).add(t.pid)
    g.G3 = `Traded (>1 REG team) player-seasons with a share row: ${Object.entries(bySeason).map(([s, set]) => `${s}: ${set.size}`).join(', ')}; absent from the V2.4/V2.6 tolerance rates (ex-traded on both sides), listed in the traded table; the denominator effect on teammates is the V2.6-g3effect series.`
    const g4 = []
    for (const s of results.seasons) {
      let absent = 0, rushAbsent = 0, gp0 = 0, rushGp0 = 0
      for (const [pid, r] of Object.entries(career[s])) {
        if (pid.startsWith('TEAM_')) continue
        if ((r.gamesPlayed ?? 0) < 1) { gp0++; rushGp0 += r.stats?.rush_att ?? 0; continue }
        if (!playersMap[pid]) { absent++; rushAbsent += r.stats?.rush_att ?? 0 }
      }
      g4.push(`${s}: ${absent} gp≥1 rows absent from playersMap hold ${rushAbsent} rush_att (dropped in current-team mode); ${gp0} gp<1 rows hold ${rushGp0} rush_att`)
    }
    g.G4 = g4.join('; ')
    g.G5 = `Gamelogs \`unmapped\` per season: ${results.seasons.map(s => `${s}: ${i.unmapped[s]}`).join(', ')}.`
    const g6 = Object.values(v2.series).filter(s => ['V2.1', 'V2.2', 'V2.3'].includes(s.check) && s.dist).map(s => `${s.metric}: out ${Object.values(s.bySeason).reduce((a, b) => a + b.out, 0)}/${Object.values(s.bySeason).reduce((a, b) => a + b.compared, 0)}, signed Δ neg/zero/pos ${s.dist.neg}/${s.dist.zero}/${s.dist.pos}`)
    g.G6 = g6.join('; ')
    g.G7 = `V2.10 verdict ${v2.summary['V2.10']?.verdict ?? 'n/a'}; plausibility violations ${v2.summary['V2.10']?.metrics?.plausibility?.out ?? 0} of ${v2.summary['V2.10']?.metrics?.plausibility?.compared ?? 0} player-seasons; rush-side team ratio outside [0.85, 1.15]: ${v2.summary['V2.10']?.metrics?.teamRushRz?.out ?? 0} of ${v2.summary['V2.10']?.metrics?.teamRushRz?.compared ?? 0} team-seasons.`
    const g10 = []
    for (const s of results.seasons) {
      if (seasonEmitsFirstDownBonus(served[s])) continue
      let n = 0
      for (const [pid, r] of Object.entries(served[s])) if (SKILL.has(playersMap[pid]?.position) && ((r.stats?.pass_fd ?? 0) + (r.stats?.rec_fd ?? 0) + (r.stats?.rush_fd ?? 0)) > 0) n++
      g10.push(`${s}: derived-first-down path applies to ${n} skill rows`)
    }
    g.G10 = g10.length ? g10.join('; ') + '. Current-position use is measured only where Sleeper emitted no `bonus_fd_*` key.' : 'Every V2 season emits `bonus_fd_*`; the derived path is not exercised.'
  }
  if (v1) {
    const a = v1.asRun
    g.G8 = a ? `2025 league vs 2026 league settings differ in: ${a.keys.join(', ') || 'none'}. Scoring 2025 with 2026 settings shifts ${a.n} player-weeks by mean ${a.mean?.toFixed(4)}, max ${a.max?.toFixed(2)} points.` : ''
    const stale = v1.rows.filter(r => r.cause === 'stale-capture')
    g.G9 = `${stale.length} diff rows classified \`stale-capture\` (Σ|Δ| ${stale.reduce((s, r) => s + Math.abs(r.delta), 0).toFixed(2)} points).`
  }
  return g
}

main().catch(err => { console.error(err); process.exit(1) })
