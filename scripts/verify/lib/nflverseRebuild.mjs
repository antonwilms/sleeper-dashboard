// Independent reference built from nflverse gamelogs / teamcontext. Rates are never read from the
// stored fields (they are single-game values) — only the summed components below.
import { eraTeam } from '../../../src/utils/playerTeam.js'
import { normalizeTeamForSchedule } from '../../../src/utils/nflStats.js'

export const SUM_FIELDS = [
  'carries', 'rushingYards', 'rushingTds', 'targets', 'receptions', 'receivingYards', 'receivingTds',
  'attempts', 'completions', 'passingYards', 'passingTds', 'passingInterceptions',
]

export function refTeam(abbr, season) {
  if (!abbr) return null
  return eraTeam(normalizeTeamForSchedule(abbr), season)
}

const zero = () => Object.fromEntries(SUM_FIELDS.map(f => [f, 0]))

function addGame(acc, g) {
  for (const f of SUM_FIELDS) acc[f] += g[f] ?? 0
}

// → { [sleeperId]: { games, totals, byTeam: { [team]: { games, totals } }, teams: [team…] } }, REG games only.
export function rebuildPlayerSeasons(gamelogs, season) {
  const out = {}
  for (const [pid, p] of Object.entries(gamelogs?.players ?? {})) {
    const totals = zero()
    const byTeam = {}
    let games = 0
    for (const g of p.games ?? []) {
      if (g.seasonType !== 'REG') continue
      games++
      addGame(totals, g)
      const team = refTeam(g.team, season)
      const t = byTeam[team] ?? (byTeam[team] = { games: 0, totals: zero() })
      t.games++
      addGame(t.totals, g)
    }
    out[pid] = { games, totals, byTeam, teams: Object.keys(byTeam) }
  }
  return out
}

// → { [team]: SUM_FIELDS totals } over all players' REG games; `excludePids` (Set) drops players.
export function rebuildTeamTotals(gamelogs, season, { excludePids = null } = {}) {
  const out = {}
  for (const [pid, p] of Object.entries(gamelogs?.players ?? {})) {
    if (excludePids?.has(pid)) continue
    for (const g of p.games ?? []) {
      if (g.seasonType !== 'REG') continue
      const team = refTeam(g.team, season)
      addGame(out[team] ?? (out[team] = zero()), g)
    }
  }
  return out
}

// → { [team]: Set of REG weeks the team has a game in } (teamcontext keys are era-accurate already).
export function teamWeeksPlayed(teamcontext) {
  const out = {}
  for (const [team, t] of Object.entries(teamcontext?.teams ?? {})) {
    out[team] = new Set((t.games ?? []).filter(g => g.seasonType === 'REG').map(g => g.week))
  }
  return out
}

// → { [team]: { rzRushPlays, rzPassPlays } } summed over REG games.
export function teamRedZoneTotals(teamcontext) {
  const out = {}
  for (const [team, t] of Object.entries(teamcontext?.teams ?? {})) {
    const acc = { rzRushPlays: 0, rzPassPlays: 0 }
    for (const g of t.games ?? []) {
      if (g.seasonType !== 'REG') continue
      acc.rzRushPlays += g.off?.rzRushPlays ?? 0
      acc.rzPassPlays += g.off?.rzPassPlays ?? 0
    }
    out[team] = acc
  }
  return out
}
