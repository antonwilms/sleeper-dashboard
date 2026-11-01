// View-only, pure, no React. Column descriptors and helpers for Market's fact views (Overview /
// Stats / Usage), rendered by FactTable. Imports only marketMetrics; never feeds projection/scoring.
// Window stats arrive as props — only Market builds them.
import { METRIC_BY_ID, PER_GAME_TWIN } from '../../utils/marketMetrics'

export const FACT_VIEWS = ['overview', 'stats', 'usage']
export const FACT_DEFAULT_SORT = {
  overview: { column: 'fp', direction: 'desc' },
  stats:    { column: 'fp', direction: 'desc' },
  usage:    { column: 'oppPerG', direction: 'desc' },
}
export const STATS_MODES = ['totals', 'perGame']
export const CAREER_MIN_GAMES = 32

// A column is either a metric column { id, metricId, defaultSortDir } (label and format come from the
// metric) or a value column { id, label, value(row, ws, ext), format(v), defaultSortDir, align?,
// muted?, cell?, hideForWindowKinds? }. A column id is the sort key and is stable across the
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

// Prev rk vs Value's Ceiling/Floor — deliberate divergence. Prev rk is rankWindow's FP/G rank for the
// prior season, which drops players below half that season's max games; Value's Ceiling/Floor use
// seasonRanks.js's buildSeasonPositionRanks (no games floor). The same player-season can therefore
// show different position ranks on the two views. Kept on purpose; do not unify here.
const OVERVIEW_SKILL = [G, m('fp'), m('fpPerG'), PREV_RANK, m('snapPct'), OWNER, KTC, DYN]

export const FACT_VIEW_COLUMNS = {
  overview: {
    QB: [G, m('fp'), m('fpPerG'), PREV_RANK, OWNER, KTC, DYN],
    RB: OVERVIEW_SKILL,
    WR: OVERVIEW_SKILL,
    TE: OVERVIEW_SKILL,
    ALL: OVERVIEW_SKILL,
  },
  stats: {
    QB: ['passYd', 'passTd', 'rushAtt', 'rushYd', 'rushTd', 'fp'].map(m),
    RB: ['rushAtt', 'rushYd', 'rushTd', 'tgt', 'rec', 'recYd', 'recTd', 'scrimYd', 'firstDowns', 'fp'].map(m),
    WR: ['tgt', 'rec', 'recYd', 'recTd', 'rushYd', 'firstDowns', 'fp'].map(m),
    TE: ['tgt', 'rec', 'recYd', 'recTd', 'firstDowns', 'fp'].map(m),
    ALL: ['fp', 'passYd', 'rushYd', 'recYd', 'totalTd'].map(m),
  },
  usage: {
    QB: [G, GS, m('carryShare'), m('rzRushShare'), m('oppPerG')],
    RB: [G, GS, m('snapPct'), m('carryShare'), m('tgtShare'), m('rzRushShare'), m('rzTgtShare'), m('oppPerG')],
    WR: [G, GS, m('snapPct'), m('tgtShare'), m('aySh'), m('rzTgtShare'), m('tgtPerG'), m('oppPerG')],
    TE: [G, GS, m('snapPct'), m('tgtShare'), m('aySh'), m('rzTgtShare'), m('tgtPerG'), m('oppPerG')],
    ALL: [G, GS, m('snapPct'), m('oppPerG')],
  },
}

export function factColumns(view, pos, { windowKind = null, statsMode = 'totals' } = {}) {
  const byPos = FACT_VIEW_COLUMNS[view]
  if (!byPos) return []
  const cols = byPos[pos] ?? byPos.ALL
  return cols
    .filter(c => !(c.hideForWindowKinds ?? []).includes(windowKind))
    .map(c => {
      if (c.metricId) {
        const id = view === 'stats' && statsMode === 'perGame' ? (PER_GAME_TWIN[c.metricId] ?? c.metricId) : c.metricId
        const metric = METRIC_BY_ID[id]
        return { ...c, metric, label: metric.label, align: 'right' }
      }
      return { align: 'right', ...c }
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
