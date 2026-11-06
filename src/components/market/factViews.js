// View-only, pure, no React. Column descriptors and helpers for Market's fact views (Overview /
// Stats / Usage / Efficiency) and the Model view (row-level columns, no window), rendered by FactTable.
// Imports only marketMetrics; never feeds projection/scoring.
// Window stats arrive as props — only Market builds them.
import { METRIC_BY_ID, PER_GAME_TWIN } from '../../utils/marketMetrics'

export const FACT_VIEWS = ['overview', 'stats', 'usage', 'efficiency']
export const FACT_DEFAULT_SORT = {
  overview: { column: 'fp', direction: 'desc' },
  stats:    { column: 'fp', direction: 'desc' },
  usage:    { column: 'looksPerG', direction: 'desc' },
  efficiency: { column: 'fpPerG', direction: 'desc' },
  model:    { column: 'dynastyScore', direction: 'desc' },
}
// Efficiency's default is per pill: the ALL pill shows per-game production, each position its lead rate.
const EFFICIENCY_DEFAULT_SORT = {
  QB: { column: 'passerRating', direction: 'desc' },
  RB: { column: 'ypc', direction: 'desc' },
  WR: { column: 'ypt', direction: 'desc' },
  TE: { column: 'ypt', direction: 'desc' },
  ALL: FACT_DEFAULT_SORT.efficiency,
}
export function factDefaultSort(view, pos) {
  if (view === 'efficiency') return EFFICIENCY_DEFAULT_SORT[pos] ?? EFFICIENCY_DEFAULT_SORT.ALL
  return FACT_DEFAULT_SORT[view]
}
export const STATS_MODES = ['totals', 'perGame']
export const CAREER_MIN_GAMES = 32

// A column is either a metric column { id, metricId, defaultSortDir } (label and format come from the
// metric) or a value column { id, label, value(row, ws, ext), format(v), defaultSortDir, align?,
// muted?, cell?, tdClass?, tooltip?, rosLabel?, rosTooltip?, hideForWindowKinds? }. `cell` names a renderer
// FactTable receives as a prop (falling back to `format`); `tdClass` is that cell's <td> class; `rosLabel`/
// `rosTooltip` replace `label`/`tooltip` when factColumns is called with `ros: true`. A column id is the sort key and is stable across the
// stats-mode toggle (a metric column's id is the TOTAL metric id).
const G = { id: 'gp', label: 'G', value: (row, ws) => ws?.gp ?? null, format: v => String(v), defaultSortDir: 'desc' }
const GS = { id: 'gs', label: 'GS', value: (row, ws) => ws?.gs ?? null, format: v => String(v), defaultSortDir: 'desc' }
const PREV_RANK = {
  id: 'prevFpPerGRank', label: 'Prev rk', value: (row, ws, ext) => ext?.prevRank?.rank ?? null,
  format: v => `#${v}`, defaultSortDir: 'asc', hideForWindowKinds: ['last3', 'career'],
}
const OWNER = {
  id: 'ownerTeamName', label: 'Owner', value: row => row.ownerTeamName ?? null, format: v => v,
  defaultSortDir: 'asc', align: 'left', cell: 'owner',
}
const KTC = {
  id: 'ktcValue', label: 'KTC', value: row => row.ktcValue ?? null, format: v => String(Math.round(v)),
  defaultSortDir: 'desc', muted: true,
}
const DYN = {
  id: 'dynastyScore', label: 'Dynasty', value: row => row.dynastyScore?.score ?? null,
  format: v => String(Math.round(v)), defaultSortDir: 'desc', muted: true,
}
const m = id => ({ id, metricId: id, defaultSortDir: 'desc' })

// Prev rk vs the pop-up's ceiling/floor line — deliberate divergence. Prev rk is rankWindow's FP/G rank for
// the prior season, which drops players below half that season's max games; the pop-up's ceiling/floor use
// seasonRanks.js's buildSeasonPositionRanks (no games floor). The same player-season can therefore
// show different position ranks on the two surfaces. Kept on purpose; do not unify here.
const OVERVIEW_SKILL = [G, m('fp'), m('fpPerG'), PREV_RANK, m('snapPct'), OWNER, KTC, DYN]

// Model view (market-model-view.md §2): row-level columns, the same on every position pill. The `_trend`,
// `_post`, `_is`, `_signals` row fields are built by Market; these descriptors only read them.
const TREND_TOOLTIP = 'KeepTradeCut value trend over the captured snapshot window — capture-only, view-only; never moves the projection.'
const MODEL_COLUMNS = [
  { id: 'dynastyScore', label: 'Dynasty score', value: row => row.dynastyScore?.score ?? null,
    format: v => String(Math.round(v)), defaultSortDir: 'desc', align: 'left', cell: 'dynasty', tdClass: 'px-3 py-3 w-[230px]' },
  { id: 'divergencePct', label: 'Vs market', value: row => row.divergencePct ?? null,
    format: v => `${Math.round(v)}%`, defaultSortDir: 'desc', align: 'left', cell: 'vsMarket' },
  { id: 'ktcValue', label: 'KTC', value: row => row.ktcValue ?? null, format: v => v.toLocaleString(),
    defaultSortDir: 'desc', tooltip: 'KeepTradeCut dynasty value — crowd-sourced from dynasty managers. Scale 0–10000.' },
  { id: 'ktcTrend', label: 'KTC trend', value: row => row._trend?.delta ?? null, format: v => String(v),
    defaultSortDir: 'desc', align: 'left', cell: 'ktcTrend', tooltip: TREND_TOOLTIP },
  { id: 'projectedPPG', label: 'Next', rosLabel: 'ROS', value: row => row.projectedPPG ?? null, format: v => v.toFixed(1),
    defaultSortDir: 'desc',
    rosTooltip: "Rest-of-season rate: the preseason projection updated with this season's games." },
  { id: 'rosDelta', label: 'Δ preseason', value: row => (row._post ? row._post.ros.value - row._post.ros.prior : null),
    format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, defaultSortDir: 'asc', cell: 'rosDelta',
    tooltip: 'Rest-of-season estimate minus the preseason prior. Hover a value for both.' },
  { id: 'oppShift', label: 'Opp shift', value: row => row._is?.oppShiftSort ?? null,
    format: v => `${Math.round(v * 100)}%`, defaultSortDir: 'desc', cell: 'oppShift',
    tooltip: "Carries + targets per game (QB: pass attempts + carries): this season's evidence-weighted rate versus the baseline, as a percentage of it. Volume settles about twice as fast as points, so this moves first when a role changes. This is the in-season model's opportunity definition — not the fact views' Looks/G, which adds pass attempts and targets for every position." },
  { id: 'signals', label: 'Signals', value: row => (row._signals?.length > 0 ? row._signals.length : null),
    format: v => String(v), defaultSortDir: 'desc', align: 'left', cell: 'signals' },
  OWNER,
]

const STATS_REC_COLS = ['tgt', 'rec', 'catchPct', 'dropRate', 'recYd', 'ypr', 'aDOT', 'recTd', 'rushYd', 'firstDowns', 'fp'].map(m)
const USAGE_REC_COLS = [G, GS, ...['snapPct', 'looksPerG', 'tgtPerG', 'tgtShare', 'aySh', 'rzTgtShare', 'fpShare', 'tdShare', 'scrimYdShare'].map(m)]
const EFFICIENCY_REC = [G, ...['catchPct', 'ypr', 'ypt', 'aDOT', 'dropRate', 'epaPerTgt', 'racr'].map(m)]

export const FACT_VIEW_COLUMNS = {
  overview: {
    QB: [G, m('fp'), m('fpPerG'), PREV_RANK, OWNER, KTC, DYN],
    RB: OVERVIEW_SKILL,
    WR: OVERVIEW_SKILL,
    TE: OVERVIEW_SKILL,
    ALL: OVERVIEW_SKILL,
  },
  stats: {
    QB: ['passYd', 'passTd', 'cmpPct', 'sacks', 'sackRate', 'rushAtt', 'rushYd', 'rushTd', 'fp'].map(m),
    RB: ['rushAtt', 'rushYd', 'ypc', 'rushTd', 'ybcPerAtt', 'yacoPerAtt', 'btkl', 'tgt', 'rec', 'recYd', 'ypt',
      'recTd', 'scrimYd', 'firstDowns', 'fp'].map(m),
    WR: STATS_REC_COLS,
    TE: STATS_REC_COLS,
    ALL: ['fp', 'passYd', 'rushYd', 'recYd', 'totalTd'].map(m),
  },
  usage: {
    QB: [G, GS, ...['looksPerG', 'passAttPerG', 'passCmpPerG', 'carryShare', 'rzRushShare', 'fpShare', 'tdShare'].map(m)],
    RB: [G, GS, ...['snapPct', 'looksPerG', 'carryShare', 'tgtShare', 'rzRushShare', 'rzTgtShare', 'fpShare', 'tdShare', 'scrimYdShare'].map(m)],
    WR: USAGE_REC_COLS,
    TE: USAGE_REC_COLS,
    ALL: [G, GS, ...['snapPct', 'looksPerG', 'fpShare'].map(m)],
  },
  efficiency: {
    QB: [G, ...['cmpPct', 'ypa', 'passTdRate', 'intRate', 'sackRate', 'passerRating', 'passAdot', 'ypc', 'epaPerAtt', 'cpoe', 'rushEpaTotal'].map(m)],
    RB: [G, ...['ypc', 'yacoPerAtt', 'btklRate', 'catchPct', 'ypr', 'dropRate', 'rushEpaPerAtt'].map(m)],
    WR: EFFICIENCY_REC,
    TE: EFFICIENCY_REC,
    // No rate is meaningful across QB and skill players, so ALL shows per-game production every position has.
    ALL: [G, ...['fpPerG', 'looksPerG', 'scrimYdPerG'].map(m)],
  },
  model: { ALL: MODEL_COLUMNS },
}

export function factColumns(view, pos, { windowKind = null, statsMode = 'totals', ros = false } = {}) {
  const byPos = FACT_VIEW_COLUMNS[view]
  if (!byPos) return []
  const cols = byPos[pos] ?? byPos.ALL
  return cols
    .filter(c => !(c.hideForWindowKinds ?? []).includes(windowKind))
    .map(c => {
      if (c.metricId) {
        const id = view === 'stats' && statsMode === 'perGame' ? (PER_GAME_TWIN[c.metricId] ?? c.metricId) : c.metricId
        const metric = METRIC_BY_ID[id]
        return { ...c, metric, label: metric.label, tooltip: metric.tooltip, align: 'right' }
      }
      return {
        align: 'right', ...c,
        label: ros && c.rosLabel ? c.rosLabel : c.label,
        tooltip: ros && c.rosTooltip ? c.rosTooltip : c.tooltip,
      }
    })
}

export function factSortableKeys(view, pos, opts) {
  return new Set(['full_name', ...factColumns(view, pos, opts).map(c => c.id)])
}

// The single value used for both display and sort.
export function factCellValue(col, row, ws, ext) {
  if (col.metric) {
    if (!ws || !col.metric.positions.includes(ws.position)) return null
    const v = col.metric.value(ws)
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const v = col.value(row, ws, ext)
  return v === undefined ? null : v
}

// The median shown beside a per-game cell: the metric's own median when the column resolves to a perGame
// metric and its average is finite; null otherwise. Display only — never a sort, rank or filter value.
export function factCellMedian(col, ws, medians) {
  if (!col.metric || col.metric.kind !== 'perGame' || !ws) return null
  if (factCellValue(col, null, ws) == null) return null
  const v = medians?.[col.metric.id]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// True when some (player, column) pair would render a median — the caption clause's gate.
// `columns` is factColumns' output; `stats` a Map pid → window stats; `medians` a Map pid → weeklyMedians result.
export function medianShown(columns, stats, medians) {
  if (!stats || !medians) return false
  for (const [pid, ws] of stats) {
    const med = medians.get(pid)
    if (med && columns.some(c => factCellMedian(c, ws, med) != null)) return true
  }
  return false
}

export function factCellRank(col, ws, ranks) {
  if (!col.metric || !ws) return null
  if (factCellValue(col, null, ws) == null) return null
  return ranks?.[ws.pid]?.[col.metric.id] ?? null
}

export function prevWindowFor(window, windows) {
  if (!window) return null
  if (window.kind === 'live') return windows.find(w => w.kind === 'season') ?? null
  if (window.kind === 'season') {
    return windows.find(w => w.kind === 'season' && w.id === String(window.seasons[0] - 1)) ?? null
  }
  return null
}

export function rankOptionsFor(window) {
  return window?.kind === 'career' ? { minGames: CAREER_MIN_GAMES } : undefined
}

export function snapCoverageIncomplete(windowStats) {
  if (!windowStats) return false
  for (const ws of windowStats.values()) {
    if (ws.usage.snapSeasons < ws.seasons.length) return true
  }
  return false
}

// Caption tail for Efficiency's advanced columns: which apply to this window and which read — and why.
// Returns '' or a string starting ' · '. `coverage` is marketAdvanced.buildAdvanced's.
export function advancedCaption(pos, coverage, dataSeason) {
  if (!coverage) return ''
  const cols = (FACT_VIEW_COLUMNS.efficiency[pos] ?? FACT_VIEW_COLUMNS.efficiency.ALL)
    .filter(c => c.metricId && METRIC_BY_ID[c.metricId].adv)
  if (cols.length === 0) return ''
  const label = c => METRIC_BY_ID[c.metricId].label
  const groups = [
    { cols: cols.filter(c => c.metricId !== 'racr'), state: coverage.gamelogs, racr: false },
    { cols: cols.filter(c => c.metricId === 'racr'), state: coverage.racr, racr: true },
  ].filter(g => g.cols.length > 0)
  const labelsOf = g => g.cols.map(label).join(', ')
  const parts = []
  const covered = cols.filter(c => groups.find(g => g.cols.includes(c)).state === 'covered')
  if (covered.length > 0) parts.push(`${covered.map(label).join(', ')}: this window`)
  const seasonKnown = Number.isFinite(dataSeason)
  for (const g of groups) {
    if (g.state === 'outside') {
      if (!seasonKnown) parts.push(`${labelsOf(g)}: not available`)
      else if (g.racr) parts.push(`${labelsOf(g)}: ${dataSeason} season${coverage.racrLiveAvailable ? ' and live window' : ''} only`)
      else parts.push(`${labelsOf(g)}: ${dataSeason} season only`)
    } else if (g.state === 'unloaded') {
      parts.push(`${labelsOf(g)}: not loaded`)
    }
  }
  return parts.length === 0 ? '' : ` · ${parts.join(' · ')}`
}
