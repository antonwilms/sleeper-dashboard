// Pure report rendering + defect classification for the computed-stats verification.

const pct = (r, d = 2) => (r == null ? '—' : `${(r * 100).toFixed(d)}%`)
const num = (v, d = 3) => (v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v))
const esc = s => String(s ?? '').replace(/\|/g, '\\|')

export function table(headers, rows) {
  if (!rows.length) return '_none_\n'
  const lines = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`]
  for (const r of rows) lines.push(`| ${r.map(c => esc(c)).join(' | ')} |`)
  return lines.join('\n') + '\n'
}

export const V2_LABELS = {
  'V2.1': 'Season counts (att, tgt, rec, cmp, int) vs gamelogs',
  'V2.2': 'Season yards vs gamelogs',
  'V2.3': 'Season TDs vs gamelogs',
  'V2.4': 'Team totals (per-season-team, ex-traded) vs rebuild',
  'V2.5': 'Team totals (current-team) vs rebuild — report only',
  'V2.6': 'Historical shares (per-season-team) vs rebuild',
  'V2.7': 'Historical shares (current-team, team-matched rows) — report only',
  'V2.8': 'computeTeamContext carry / reception share vs rebuild',
  'V2.9': 'Efficiency-metric inputs vs gamelogs ratios',
  'V2.10': 'Red-zone consistency and plausibility',
  'V2.11': 'gamesPlayed vs snaps games',
  'V2.12': 'dnpWeeks vs rosterweekly eligibility − snaps games',
}

const V3_GROUPS = [
  { id: 'V3 KTC', key: 'ktc', ignoreOnly: ['ktc-team-disagree'] },
  { id: 'V3 draft', key: 'draft', ignoreOnly: ['draft-out-of-window'] },
  { id: 'V3 college', key: 'college', ignoreOnly: [] },
]

// A flagged V3 row is a defect unless every one of its reasons is in the group's ignore list
// (plan §6: `draft-out-of-window` is expected; `ktc-team-disagree` alone is not a join defect).
function v3DefectRows(results, g) {
  const rows = results.v3?.[g.key] ?? []
  return rows.filter(r => !r.reasons.every(c => g.ignoreOnly.includes(c)))
}

export function v1Verdict(v1) {
  if (!v1) return 'not run'
  const rows = v1.rows ?? []
  const skill = new Set(['QB', 'RB', 'WR', 'TE'])
  const unexplained = rows.filter(r => r.class === 'diff' && r.cause === 'unexplained').length
  const missingNz = rows.filter(r => r.class === 'app-missing-nonzero').length
  const scoringModel = rows.filter(r => r.class === 'diff' && r.cause === 'scoring-model' && skill.has(r.position)).length
  if (unexplained + missingNz >= 5 || unexplained >= 5 || missingNz >= 5 || scoringModel > 0) return 'defect'
  return (v1.counts?.diff ?? 0) > 0 ? 'gap' : 'pass'
}

export function buildSummaryRows(results) {
  const rows = []
  const ran = results.ran ?? {}
  if (!ran.v1) rows.push(['V1', 'Fantasy points vs Sleeper matchups', 'not run'])
  else {
    const c = results.v1.counts
    const compared = c.match + c.diff
    rows.push(['V1', 'Fantasy points vs Sleeper matchups', compared, c.diff, pct(compared ? c.diff / compared : null), v1Verdict(results.v1)])
  }
  for (const id of Object.keys(V2_LABELS)) {
    const s = results.v2?.summary?.[id]
    if (!ran.v2) rows.push([id, V2_LABELS[id], 'not run'])
    else if (!s) rows.push([id, V2_LABELS[id], 0, 0, '—', 'not run'])
    else rows.push([id, V2_LABELS[id], s.compared, s.out, pct(s.rate), results.verdictOverrides?.[id] ?? s.verdict])
  }
  for (const g of V3_GROUPS) {
    if (!ran.v3) { rows.push([g.id, `${g.id} joins`, 'not run']); continue }
    const bad = v3DefectRows(results, g)
    const n = results.v3.top.length
    rows.push([g.id, `${g.id} joins (top ${n} KTC)`, n, bad.length, pct(n ? bad.length / n : null), bad.length ? 'defect' : 'pass'])
  }
  return rows.map(r => (r.length === 3 ? [r[0], r[1], '—', '—', '—', 'not run'] : r))
}

// Candidate defects, one per root cause, for the backlog. Session 2 proposes; Session 1 confirms.
export function classifyDefects(results) {
  const defects = []
  const ran = results.ran ?? {}
  if (ran.v1 && v1Verdict(results.v1) === 'defect') {
    const rows = results.v1.rows
    const by = {}
    for (const r of rows) {
      if (r.class === 'diff' && (r.cause === 'unexplained' || r.cause === 'scoring-model')) (by[r.cause] ??= []).push(r)
      if (r.class === 'app-missing-nonzero') (by['app-missing-nonzero'] ??= []).push(r)
    }
    for (const [cause, rs] of Object.entries(by)) {
      if (cause === 'scoring-model' && !rs.some(r => ['QB', 'RB', 'WR', 'TE'].includes(r.position))) continue
      if (cause !== 'scoring-model' && rs.length < 5) continue
      defects.push({ id: `v1-${cause}`, area: 'V1', cause, count: rs.length, rows: rs })
    }
  }
  if (ran.v2) {
    for (const [id, s] of Object.entries(results.v2.summary)) {
      if (s.verdict === 'defect') defects.push({ id: `v2-${id}`, area: 'V2', check: id, summary: s })
    }
  }
  if (ran.v3) {
    for (const g of V3_GROUPS) {
      const bad = v3DefectRows(results, g)
      if (!bad.length) continue
      const codes = {}
      for (const r of bad) for (const c of r.reasons) if (!g.ignoreOnly.includes(c)) codes[c] = (codes[c] ?? 0) + 1
      for (const [code, n] of Object.entries(codes)) defects.push({ id: `v3-${code}`, area: 'V3', code, count: n, rows: bad.filter(r => r.reasons.includes(code)) })
    }
  }
  return defects
}

const GAP_TITLES = {
  G1: 'computeTeamContext `targetShare` is reception share (receptions ÷ team receptions, teamContext.js:213)',
  G2: 'Current-team attribution (App.jsx:246, :295, :300) groups a season under the player’s present team',
  G3: 'One team per player-season for traded players',
  G4: 'App team totals count only rows with gamesPlayed ≥ 1; current-team mode drops players absent from playersMap',
  G5: 'Gamelogs drop unmapped players, so reference team totals run low',
  G6: 'Sleeper vs nflverse stat definitions (kneels, laterals, sack attribution)',
  G7: 'No independent per-player red-zone source is served; V2.10 is consistency-only',
  G8: 'History rescored under today’s league settings (V1 as-run gap)',
  G9: 'Stat corrections after the season-totals capture (V1 `stale-capture`)',
  G10: 'First-down derivation uses the current position (`rescoreSeasonTotals`); no effect for 2022+',
}

function renderV1(v1) {
  const out = ['## V1 — fantasy points vs Sleeper matchups\n']
  out.push(`Leagues: ${v1.leagues.map(l => `${l.season} → \`${l.leagueId}\` (last scored leg ${l.lastScoredLeg ?? '—'})`).join('; ')}\n`)
  out.push(`Included weeks: ${Object.entries(v1.includedWeeks).map(([s, w]) => `${s}: ${w.length ? `${w[0]}–${w[w.length - 1]} (${w.length})` : 'none'}`).join('; ')}\n`)
  out.push(`2026 live league \`scoring_settings\` vs snapshot \`scoringSettings\`: ${v1.settingsDiff.length ? `**differ** — ${v1.settingsDiff.map(d => `${d.key} snapshot ${d.snapshot} / league ${d.league}`).join('; ')}` : 'equal'}\n`)
  out.push('### Excluded weeks (never scored)\n')
  out.push(table(['season', 'week', 'gate', 'rows', 'season-totals lastModified', 'schedule generatedAt', 'detail'],
    v1.excluded.map(e => [e.season, e.week, e.gate, e.rows, e.manifestLastModified, e.scheduleGeneratedAt, e.detail ?? ''])))
  out.push('### Row classes\n')
  out.push(table(['class', 'rows'], Object.entries(v1.counts).map(([k, v]) => [k, v])))
  out.push(`Exact-match rate (match / (match + diff)): **${pct(v1.rateOverall.rate)}** (${v1.rateOverall.match} / ${v1.rateOverall.match + v1.rateOverall.diff}).\n`)
  for (const [label, g] of [['By season', v1.rateBySeason], ['By position', v1.rateByPosition], ['By method', v1.rateByMethod]]) {
    out.push(`### ${label}\n`)
    out.push(table(['key', 'match', 'diff', 'rate'], Object.entries(g).map(([k, x]) => [k, x.match, x.diff, pct(x.rate)])))
  }
  out.push('### |Δ| buckets (diff rows)\n')
  out.push(table(['bucket', 'rows'], Object.entries(v1.buckets).map(([k, v]) => [k, v])))
  out.push('### Diff causes\n')
  out.push(table(['cause', 'rows'], Object.entries(v1.causes).map(([k, v]) => [k, v])))
  out.push('### `app-missing-nonzero` / `app-no-row` by cause\n')
  out.push(table(['class', 'cause', 'rows'], v1.missingBreakdown.map(x => [x.class, x.cause, x.rows])))
  out.push(`### 25 largest |Δ| rows\n`)
  out.push(table(['season', 'wk', 'pid', 'name', 'pos', 'sleeper', 'app', 'Δ', 'cause', 'top keys (app→live)'],
    v1.top25.map(r => [r.season, r.week, r.pid, r.name ?? '', r.position, num(r.sleeperPts, 2), num(r.appPts, 2), num(r.delta, 2), r.cause, r.topKeys])))
  out.push('### Σ|Δ points| by stat key (diff rows)\n')
  out.push(table(['key', 'Σ|pts|', 'rows'], v1.keyAgg.slice(0, 40).map(k => [k.key, num(k.sumAbs, 2), k.rows])))
  out.push('### As-run gap (G8): 2025 scored with 2026 settings vs 2025 settings\n')
  out.push(v1.asRun ? `${v1.asRun.n} player-weeks; mean |shift| ${num(v1.asRun.mean, 3)}, max ${num(v1.asRun.max, 2)}. Settings keys that differ: ${v1.asRun.keys.join(', ') || 'none'}.\n` : '_not computed_\n')
  if (v1.customPoints.length) out.push(`Rosters with non-null \`custom_points\`: ${v1.customPoints.map(c => `${c.season} wk${c.week} roster ${c.rosterId} (${c.value})`).join('; ')}\n`)
  if (v1.duplicates.length) out.push(`\`sleeper-duplicate\` (same player, different points): ${v1.duplicates.length}\n`)
  return out.join('\n')
}

function renderV2(v2, seasons) {
  const out = ['## V2 — stats feeding the grades (2020–2025, regular season)\n']
  out.push('### Per metric × season (compared / out → rate)\n')
  const rows = []
  for (const sr of Object.values(v2.series)) {
    if (sr.metric === 'no-reference') continue
    rows.push([sr.check, sr.metric, ...seasons.map(s => { const b = sr.bySeason[s]; return b ? `${b.compared}/${b.out} (${pct(b.compared ? b.out / b.compared : null, 1)})` : '—' })])
  }
  out.push(table(['check', 'metric', ...seasons], rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))))
  out.push('### Signed Δ distributions (app − reference) — G6 stat-definition evidence\n')
  out.push(table(['check', 'metric', 'n', 'neg', 'zero', 'pos', 'min', 'median', 'max'],
    Object.values(v2.series).filter(s => s.dist).map(s => [s.check, s.metric, s.dist.n, s.dist.neg, s.dist.zero, s.dist.pos, s.dist.min, s.dist.median, s.dist.max])))
  out.push('### Population mismatches (player-seasons on one side only)\n')
  const pr = []
  for (const s of seasons) {
    const p = v2.info.population[s]
    pr.push([s, p.both, JSON.stringify(p.appOnly), JSON.stringify(p.refOnly), v2.info.unmapped[s]])
  }
  out.push(table(['season', 'both', 'app-only by pos', 'gamelog-only by pos', 'gamelogs `unmapped` (G5)'], pr))
  out.push('### V2.4 `doubling` team totals (ratio in [1.9, 2.1])\n')
  out.push(v2.info.doubling.length ? table(['season', 'team', 'metric', 'app', 'ref', 'ratio'], v2.info.doubling.map(d => [d.season, d.team, d.metric, d.app, d.ref, num(d.ratio)])) : 'None.\n')
  out.push('### `team-key-unmatched` findings\n')
  out.push(table(['season', 'team', 'side', 'app total', 'ref total'], v2.findings.map(f => [f.season, f.team, f.side, f.appTotal, f.refTotal])))
  out.push(`### V2.6 \`rec ÷ team rec\` fallback branch taken (expected 0)\n\n${JSON.stringify(v2.info.fallbackBranch)}\n`)
  out.push('### V2.10 red-zone: receiving ratio Σ`rec_rz_tgt` ÷ Σ`rzPassPlays` (ratio only)\n')
  out.push(table(['season', 'teams', 'min', 'median', 'max', 'teams > 1.0'], seasons.map(s => { const r = v2.info.rz[s]; return [s, r.n, num(r.min), num(r.median), num(r.max), (r.over1 ?? []).join(' ') || 'none'] })))
  out.push('### V2.12 signed distribution (app `dnpWeeks` − expected; negative = app undercounts misses)\n')
  const d = v2.info.dnpSignedDistribution
  out.push(table(['n', 'neg', 'zero', 'pos', 'min', 'median', 'max', 'hist'], [[d.n, d.neg, d.zero, d.pos, d.min, d.median, d.max, JSON.stringify(d.hist)]]))
  out.push(`### Traded players (G3) — ${v2.traded.length} player-season rows\n`)
  out.push(table(['check', 'season', 'pid', 'pos', 'app team', 'app share', 'ref per team (stat · share · % of team denom)'],
    v2.traded.slice(0, 60).map(t => [t.check, t.season, t.pid, t.position, t.appTeam, num(t.appShare), Object.entries(t.teams).map(([k, v]) => `${k}: ${v.stat} · ${num(v.refShare)} · ${pct(v.pctOfTeamDenom, 1)}`).join('; ')])))
  if (v2.traded.length > 60) out.push(`_${v2.traded.length - 60} more in the sidecar._\n`)
  out.push('### Largest out-of-tolerance rows (top 40 by |Δ|)\n')
  out.push(table(['check', 'metric', 'season', 'pid/team', 'pos', 'app', 'ref', 'Δ'],
    [...v2.outOfTolerance].filter(r => r.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 40)
      .map(r => [r.check, r.metric, r.season, r.pid ?? r.team, r.position ?? '', num(r.app), num(r.ref), num(r.delta)])))
  return out.join('\n')
}

function renderV3(v3) {
  const out = ['## V3 — joins, top KTC players\n']
  out.push(`Matcher outputs on full inputs: KTC ${v3.sizes.ktcMatched}/${v3.sizes.ktcRows} rows resolved; ${v3.sizes.drafts} draft matches; ${v3.sizes.collegePlayers} college-matched players. Top ${v3.top.length} inspected.\n`)
  out.push(table(['reason code', 'rows'], Object.entries(v3.counts).sort().map(([k, v]) => [k, v])))
  for (const code of Object.keys(v3.counts).sort()) {
    out.push(`### ${code} (${v3.counts[code]})\n`)
    const rows = [...v3.ktc, ...v3.draft, ...v3.college].filter(r => r.reasons.includes(code))
    out.push(table(['rank', 'name', 'pos', 'team', 'value', 'sid', 'evidence'], rows.map(r => [r.rank, r.name, r.position, r.team, r.value, r.sid ?? '—', '`' + JSON.stringify(r.evidence).slice(0, 300) + '`'])))
  }
  out.push(`### College rushing-only RBs (matcher Pass 1 is receiving-driven): ${v3.rushingOnlyRbs.length}\n`)
  out.push(`### Top rows without a crosswalk entry: ${v3.draftInfo.noCrosswalk.length}\n`)
  return out.join('\n')
}

export function renderReport(results) {
  const h = results.header ?? {}
  const ran = results.ran ?? {}
  const out = []
  out.push(`# Computed-stats verification — ${h.date ?? ''}\n`)
  out.push(table(['field', 'value'], [
    ['harness (app repo)', `\`${h.appSha ?? '?'}\` — local — unpushed at report time`],
    ['data repo HEAD', `\`${h.dataSha ?? '?'}\` (${h.dataClean ? 'clean' : 'dirty'})`],
    ['snapshot', h.snapshotFile ?? '—'],
    ['KTC file', h.ktcFile ?? '—'],
    ['playersMap fetched', h.playersMapFetchedAt ?? '—'],
    ['CR ids read', h.crIds ?? 'CR-01, CR-02, CR-06, CR-08, CR-09, CR-10, CR-17, CR-28'],
    ['command', '`' + (h.command ?? '') + '`'],
  ]))
  out.push('## Summary\n')
  out.push(table(['check', 'description', 'compared', 'out of tolerance', 'rate', 'verdict'], buildSummaryRows(results)))
  if (ran.v1) out.push(renderV1(results.v1))
  else out.push('## V1\n\n`not run`\n')
  if (ran.v2) out.push(renderV2(results.v2, results.seasons ?? [2020, 2021, 2022, 2023, 2024, 2025]))
  else out.push('## V2\n\n`not run`\n')
  if (ran.v3) out.push(renderV3(results.v3))
  else out.push('## V3\n\n`not run`\n')
  out.push('## Known definitional gaps\n')
  for (const g of Object.keys(GAP_TITLES)) {
    out.push(`### ${g}\n\n${GAP_TITLES[g]}\n\n${results.gaps?.[g] ?? '_not measured in this run_'}\n`)
  }
  out.push('## Confirmed defects\n')
  out.push(results.defects?.length
    ? table(['defect', 'blocking (proposed)', 'backlog file', 'entry title'], results.defects.map(d => [d.id, d.blocking, d.file, d.title]))
    : 'None.\n')
  out.push('## Unclassified\n')
  out.push((results.unclassified ?? []).length ? results.unclassified.map(u => `- ${u}`).join('\n') + '\n' : 'None.\n')
  out.push('## Not covered\n')
  out.push([
    '- Per-player red zone: needs play-by-play (G7).',
    '- Snap share: already validated (r = 0.9995 vs PFR, data-catalog.md snaps row).',
    '- The `inSeasonScoring.js` live path’s inputs (CR-21): it calls the same `calculateFantasyPoints`; V1 covers the function only.',
    '- Seasons before 2020.',
  ].join('\n') + '\n')
  return out.join('\n')
}
