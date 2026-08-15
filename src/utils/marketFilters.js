// Pure Market filter predicates + state helpers (1b Slice vi). Harvested from PlayersTab.jsx's
// displayRows memo (:1883-1944), including its sentinel gating (a range filter runs only when it
// differs from its default, so a null-valued row survives an untouched slider and is excluded the
// moment it moves). /players keeps its own inline copy of these predicates until slice viii
// deletes the file (master-plan §6a) — this duplication has a definite end date, not a sixth
// convergence debt. DYNASTY_GROUP_MAP and NFL_TEAMS are DATA, not logic, so they are imported
// (not copied) from PlayersTab.jsx — the same "export a frozen file's data, don't fork it"
// precedent Slice iii set for NflStatsTab/OutlookTab's column descriptor maps.
//
// No React, no styling — pure and testable without mounting anything.

import { DYNASTY_GROUP_MAP, NFL_TEAMS } from '../components/PlayersTab'

export { DYNASTY_GROUP_MAP, NFL_TEAMS }

// Upper bound for the Projection group's "Min projected games" slider — an 18-game regular
// season ceiling, matching seasonProjections' projectedGames domain.
export const MAX_PROJECTED_GAMES = 17

// The eleven filter dimensions and their "off" values. For the three range filters these
// defaults ARE the sentinel — applyMarketFilters only runs that predicate when the current value
// differs from the pair below, so the FilterPanel's slider bounds must be exactly these numbers
// (see FilterPanel.jsx) or the "off" state becomes unreachable by dragging.
export const DEFAULT_MARKET_FILTERS = {
  startersOnly:      false,
  rookiesOnly:        false,
  ageRange:           [18, 45],
  expRange:           [0, 20],
  availability:       'all',    // 'all' | 'myRoster' | 'available' | 'nflFreeAgent'
  nflTeams:           [],
  fantasyTeams:       [],
  dynastyGroups:      [],
  marketSignal:       'all',    // 'all' | 'undervalued' | 'overvalued'
  ktcRange:           [0, 10000],
  minProjectedGames:  0,
}

const AVAILABILITY_VALUES = new Set(['all', 'myRoster', 'available', 'nflFreeAgent'])
const MARKET_SIGNAL_VALUES = new Set(['all', 'undervalued', 'overvalued'])

function isValidRange(v, lo, hi) {
  return Array.isArray(v) && v.length === 2
    && typeof v[0] === 'number' && Number.isFinite(v[0])
    && typeof v[1] === 'number' && Number.isFinite(v[1])
    && v[0] <= v[1] && v[0] >= lo && v[1] <= hi
}

/**
 * Applies all eleven filter dimensions to `rows`, in the same order as PlayersTab's displayRows
 * memo (Player → Availability → Team → Dynasty → Projection). Each range filter is sentinel-gated
 * — it only runs when the value differs from DEFAULT_MARKET_FILTERS, so a null-valued row (no
 * age / no years_exp / no ktcValue) survives at rest and is dropped only once that slider moves.
 * @param {object[]} rows
 * @param {object} filters
 * @param {{playerMap?: object, myTeamName?: string, seasonProjections?: object}} ctx
 */
export function applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections } = {}) {
  let out = rows
  const f = filters
  const d = DEFAULT_MARKET_FILTERS

  // PLAYER
  if (f.startersOnly) out = out.filter(r => playerMap?.[r.player_id]?.depth_chart_order === 1)
  if (f.rookiesOnly)  out = out.filter(r => r.years_exp === 0)
  if (f.ageRange[0] !== d.ageRange[0] || f.ageRange[1] !== d.ageRange[1]) {
    out = out.filter(r => r.age != null && r.age >= f.ageRange[0] && r.age <= f.ageRange[1])
  }
  if (f.expRange[0] !== d.expRange[0] || f.expRange[1] !== d.expRange[1]) {
    out = out.filter(r => r.years_exp != null && r.years_exp >= f.expRange[0] && r.years_exp <= f.expRange[1])
  }

  // AVAILABILITY
  if (f.availability === 'myRoster') {
    out = out.filter(r => r.ownerTeamName != null && r.ownerTeamName === myTeamName)
  } else if (f.availability === 'available') {
    out = out.filter(r => r.ownerTeamName == null && r.nfl_team && r.nfl_team !== 'FA')
  } else if (f.availability === 'nflFreeAgent') {
    out = out.filter(r => !r.nfl_team || r.nfl_team === 'FA')
  }

  // TEAM
  if (f.nflTeams.length > 0)     out = out.filter(r => f.nflTeams.includes(r.nfl_team))
  if (f.fantasyTeams.length > 0) out = out.filter(r => r.ownerTeamName && f.fantasyTeams.includes(r.ownerTeamName))

  // DYNASTY
  if (f.dynastyGroups.length > 0) {
    const allowedLabels = new Set(f.dynastyGroups.flatMap(g => DYNASTY_GROUP_MAP[g] ?? []))
    out = out.filter(r => allowedLabels.has(r.dynastyScore?.label))
  }
  if (f.marketSignal === 'undervalued') out = out.filter(r => r.divergenceSignal === 'undervalued')
  if (f.marketSignal === 'overvalued')  out = out.filter(r => r.divergenceSignal === 'overvalued')
  if (f.ktcRange[0] !== d.ktcRange[0] || f.ktcRange[1] !== d.ktcRange[1]) {
    out = out.filter(r => r.ktcValue != null && r.ktcValue >= f.ktcRange[0] && r.ktcValue <= f.ktcRange[1])
  }

  // PROJECTION — default 0 means "off"; must not filter at rest, including rows with no
  // projection at all (seasonProjections?.[id] === undefined).
  if (f.minProjectedGames > 0) {
    out = out.filter(r => (seasonProjections?.[r.player_id]?.projectedGames ?? null) >= f.minProjectedGames)
  }

  return out
}

/** Counts the non-default dimensions in `filters` — feeds the filter bar's pills + "N active". */
export function activeFilterCount(f) {
  const d = DEFAULT_MARKET_FILTERS
  let n = 0
  if (f.startersOnly) n++
  if (f.rookiesOnly) n++
  if (f.ageRange[0] !== d.ageRange[0] || f.ageRange[1] !== d.ageRange[1]) n++
  if (f.expRange[0] !== d.expRange[0] || f.expRange[1] !== d.expRange[1]) n++
  if (f.availability !== 'all') n++
  if (f.nflTeams.length > 0) n++
  if (f.fantasyTeams.length > 0) n++
  if (f.dynastyGroups.length > 0) n++
  if (f.marketSignal !== 'all') n++
  if (f.ktcRange[0] !== d.ktcRange[0] || f.ktcRange[1] !== d.ktcRange[1]) n++
  if (f.minProjectedGames > 0) n++
  return n
}

/**
 * Validates a raw (e.g. localStorage-restored) filters payload per-key, by type/length/enum —
 * NOT by key presence. A stale shape like `ageRange: ["18","45"]` or a 1-element array passes a
 * presence check and, because the sentinels above are strict numeric `!==` comparisons, would
 * read as active and silently empty the table. Each key is validated independently and falls
 * back to its own default, so one corrupt key doesn't discard the rest of a valid payload.
 */
export function normalizeFilters(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const d = DEFAULT_MARKET_FILTERS
  return {
    startersOnly: typeof r.startersOnly === 'boolean' ? r.startersOnly : d.startersOnly,
    rookiesOnly:  typeof r.rookiesOnly  === 'boolean' ? r.rookiesOnly  : d.rookiesOnly,
    ageRange: isValidRange(r.ageRange, d.ageRange[0], d.ageRange[1]) ? r.ageRange : d.ageRange,
    expRange: isValidRange(r.expRange, d.expRange[0], d.expRange[1]) ? r.expRange : d.expRange,
    availability: AVAILABILITY_VALUES.has(r.availability) ? r.availability : d.availability,
    nflTeams: Array.isArray(r.nflTeams)
      ? r.nflTeams.filter(t => typeof t === 'string' && NFL_TEAMS.includes(t))
      : d.nflTeams,
    fantasyTeams: Array.isArray(r.fantasyTeams)
      ? r.fantasyTeams.filter(t => typeof t === 'string')
      : d.fantasyTeams,
    dynastyGroups: Array.isArray(r.dynastyGroups)
      ? r.dynastyGroups.filter(g => typeof g === 'string' && DYNASTY_GROUP_MAP[g])
      : d.dynastyGroups,
    marketSignal: MARKET_SIGNAL_VALUES.has(r.marketSignal) ? r.marketSignal : d.marketSignal,
    ktcRange: isValidRange(r.ktcRange, d.ktcRange[0], d.ktcRange[1]) ? r.ktcRange : d.ktcRange,
    minProjectedGames: (typeof r.minProjectedGames === 'number' && Number.isFinite(r.minProjectedGames)
      && r.minProjectedGames >= 0 && r.minProjectedGames <= MAX_PROJECTED_GAMES)
      ? r.minProjectedGames
      : d.minProjectedGames,
  }
}
