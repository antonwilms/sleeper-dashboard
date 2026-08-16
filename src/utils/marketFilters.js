// Pure Market filter predicates + state helpers (1b Slice vi). Predicates were originally harvested
// from PlayersTab.jsx's displayRows memo; that file was deleted in 1b Slice viii (the `/players`
// retirement), so this is now the single source. DYNASTY_GROUP_MAP and NFL_TEAMS were data owned by
// PlayersTab.jsx and imported (not copied) from there until Slice viii — they now live here
// natively, closing the utils/→component dependency inversion that import direction created.
//
// No React, no styling — pure and testable without mounting anything.

export const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN',
  'DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA',
  'MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB',
  'TEN','WAS',
]

export const DYNASTY_GROUP_MAP = {
  Prospects:   ['Elite Prospect', 'High Prospect', 'Prospect', 'Late Prospect', 'Unranked Prospect'],
  Rising:      ['Breakout', 'Ascending Star', 'Developing', 'Rising', 'Bounce-back'],
  Established: ['Elite', 'Peak Window', 'Solid Floor', 'Plateau', 'Veteran Producer'],
  Declining:   ['Managed Decline', 'Sell Now', 'Fading', 'Limited Data'],
}

// Upper bound for the Projection group's "Min projected games" slider — an 18-game regular
// season ceiling, matching seasonProjections' projectedGames domain.
export const MAX_PROJECTED_GAMES = 17

// The twelve filter dimensions and their "off" values. For the three range filters these
// defaults ARE the sentinel — applyMarketFilters only runs that predicate when the current value
// differs from the pair below, so the FilterPanel's slider bounds must be exactly these numbers
// (see FilterPanel.jsx) or the "off" state becomes unreachable by dragging. `search` (1b Slice
// vii) is the odd one out — its default is also the ONLY value normalizeFilters ever restores it
// to (see below); it is never persisted non-empty, by design.
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
  search:             '',
}

const AVAILABILITY_VALUES = new Set(['all', 'myRoster', 'available', 'nflFreeAgent'])
const MARKET_SIGNAL_VALUES = new Set(['all', 'undervalued', 'overvalued'])

function isValidRange(v, lo, hi) {
  return Array.isArray(v) && v.length === 2
    && typeof v[0] === 'number' && Number.isFinite(v[0])
    && typeof v[1] === 'number' && Number.isFinite(v[1])
    && v[0] <= v[1] && v[0] >= lo && v[1] <= hi
}

// Per-element validators shared between normalizeFilters (salvage: filter out bad elements) and
// isRestorableFilters (strict: every element must already pass) — the one piece of duplicated
// logic these two policies could otherwise fork.
const isValidNflTeam = t => typeof t === 'string' && NFL_TEAMS.includes(t)
const isValidFantasyTeam = t => typeof t === 'string'
const isValidDynastyGroup = g => typeof g === 'string' && !!DYNASTY_GROUP_MAP[g]
const isValidMinProjectedGames = v =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_PROJECTED_GAMES

/**
 * Applies all twelve filter dimensions to `rows`, in the same order as PlayersTab's displayRows
 * memo (Player → Availability → Team → Dynasty → Projection → Search). Each range filter is sentinel-gated
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

  // SEARCH (1b Slice vii) — free-text match on full_name only. Null-guarded: unlike the
  // Explorer's predicate (PlayersTab.jsx:1929), this runs inside a pure util unit-tested with
  // hand-built fixtures, where a row missing full_name is a normal case, not an anomaly the
  // Explorer's own row-controlled context happens to rule out. Empty/whitespace filters nothing.
  const q = f.search.trim().toLowerCase()
  if (q) out = out.filter(r => (r.full_name ?? '').toLowerCase().includes(q))

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
  if (f.search && f.search.trim() !== '') n++
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
    nflTeams: Array.isArray(r.nflTeams) ? r.nflTeams.filter(isValidNflTeam) : d.nflTeams,
    fantasyTeams: Array.isArray(r.fantasyTeams) ? r.fantasyTeams.filter(isValidFantasyTeam) : d.fantasyTeams,
    dynastyGroups: Array.isArray(r.dynastyGroups) ? r.dynastyGroups.filter(isValidDynastyGroup) : d.dynastyGroups,
    marketSignal: MARKET_SIGNAL_VALUES.has(r.marketSignal) ? r.marketSignal : d.marketSignal,
    ktcRange: isValidRange(r.ktcRange, d.ktcRange[0], d.ktcRange[1]) ? r.ktcRange : d.ktcRange,
    minProjectedGames: isValidMinProjectedGames(r.minProjectedGames) ? r.minProjectedGames : d.minProjectedGames,
    // search is NEVER restored — forced to '' regardless of what the payload holds. Returning to
    // a table silently narrowed by a forgotten query is a bad surprise (the same reason the
    // Explorer keeps its search out of its persisted filterState); Market.jsx's setFilters
    // additionally blanks search before writing to localStorage, so in practice this branch
    // exists to protect against any payload written before that discipline existed, or restored
    // from a source Market.jsx didn't write itself.
    search: d.search,
  }
}

/**
 * Strict companion to normalizeFilters, for a NAMED preset rather than the live `market-filters`
 * payload (§3.1). normalizeFilters never fails — it salvages per-key and always returns a full
 * valid object, which is right for the live payload (losing every filter because one key drifted
 * is worse than quietly repairing that key) but wrong for a preset the user named: a preset that
 * silently normalizes a corrupt `ageRange` to "no age filter" means something other than what was
 * saved, and there is no way for the user to notice. Presets failing this check are dropped
 * instead of applied. Shares the same per-key validators as normalizeFilters (isValidRange, the
 * enum Sets, the per-element array validators) rather than forking a second copy of the logic.
 * Does not check `search` — normalizeFilters never restores it regardless of payload, so its
 * validity has no bearing on whether the rest of a preset is restorable.
 */
export function isRestorableFilters(raw) {
  if (!raw || typeof raw !== 'object') return false
  const d = DEFAULT_MARKET_FILTERS
  return (
    typeof raw.startersOnly === 'boolean' &&
    typeof raw.rookiesOnly === 'boolean' &&
    isValidRange(raw.ageRange, d.ageRange[0], d.ageRange[1]) &&
    isValidRange(raw.expRange, d.expRange[0], d.expRange[1]) &&
    AVAILABILITY_VALUES.has(raw.availability) &&
    Array.isArray(raw.nflTeams) && raw.nflTeams.every(isValidNflTeam) &&
    Array.isArray(raw.fantasyTeams) && raw.fantasyTeams.every(isValidFantasyTeam) &&
    Array.isArray(raw.dynastyGroups) && raw.dynastyGroups.every(isValidDynastyGroup) &&
    MARKET_SIGNAL_VALUES.has(raw.marketSignal) &&
    isValidRange(raw.ktcRange, d.ktcRange[0], d.ktcRange[1]) &&
    isValidMinProjectedGames(raw.minProjectedGames)
  )
}
