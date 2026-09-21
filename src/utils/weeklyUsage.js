// weekly-decision-1-lineup.md §3 — the four usage shares, all derived from one Sleeper weekly
// payload (`getWeeklyStatRows`). Pure, no React, no I/O. This module is why the lineup panel has
// NO data-store dependency and cannot be blocked by an ingest job: every input is the live Sleeper
// stats endpoint, read via `sleeperStats.js`'s meta-preserving fetch, not the data repo.
//
// The null-vs-zero rule for SNAP (parent §1.1, and the single most important rule in this module):
//   off_snp present,  tm_off_snp present               -> the ratio
//   off_snp ABSENT,   tm_off_snp present, gp === 1      -> 0   (active, zero offensive snaps —
//                                                               special-teamers; 36 week-1 rows)
//   gp absent / no tm_off_snp                           -> null (no observation at all)
// Rendering the middle case as `—` says "we don't know" about a player we KNOW took no offensive
// snaps — the opposite reading for a start/sit call. `accumulateUsage` encodes this by only ever
// summing a week into the snap totals when `tm_off_snp` is present for that week (regardless of
// whether `off_snp` itself is present — an absent `off_snp` contributes a real 0), and only
// considering a week at all when `gp === 1`; `computeUsageShares` then returns `null` exactly when
// no week contributed to those tallies at all.

// One pass over one week's row map -> { [abbr]: { passAtt, rushAtt, offSnp } }, the 32 `TEAM_*`
// whole-team aggregate rows, keyed WITHOUT the `TEAM_` prefix, Sleeper domain. A team absent from
// the returned map did not play that week (bye) — W2 §5 reuses that same signal; this function
// does not itself render anything for it.
export function buildTeamAggregates(weekRows) {
  const result = {}
  if (!weekRows) return result
  for (const [key, row] of Object.entries(weekRows)) {
    if (!key.startsWith('TEAM_')) continue
    const abbr = key.slice(5)
    const stats = row?.stats ?? {}
    result[abbr] = {
      passAtt: stats.pass_att ?? null,
      rushAtt: stats.rush_att ?? null,
      offSnp: stats.off_snp ?? null,
    }
  }
  return result
}

// weeklyMaps: [{ week, rows, teamAggregates }] for PLAYED weeks only (1..currentWeek-1 — the
// caller, useWeeklyDecision.js, is responsible for excluding the in-progress current week). `rows`
// is a getWeeklyStatRows map, `teamAggregates` that same week's buildTeamAggregates output.
//
// Sums the player's carries/targets/receptions and the TEAM's attempts/snaps ACROSS the window,
// then divides once in computeUsageShares — never averages per-week shares, which is the same
// "never sum or average a stored rate" trap in its counting-component form (a 2-carry/40-att week
// and a 20-carry/20-att week average to 27.5%, not the true 22/60 = 36.7%).
//
// NO `team` PARAMETER. The player's team for week w is `rows[playerId].team` — that week's OWN
// row — which is why sleeperStats.js's getWeeklyStatRows exists at all (getWeeklyStats strips
// `team`). A mid-season trade then divides each week's carries by the team he actually played for
// that week; fixing one team across the window, or falling back to a static playerMap lookup,
// would silently divide a traded player's whole season by the wrong denominator.
export function accumulateUsage(weeklyMaps, playerId) {
  const totals = {
    played: false,
    rushAtt: 0, rec: 0, recTgt: 0,
    teamRushAtt: 0, teamPassAtt: 0,
    offSnp: 0, tmOffSnp: 0,
    snapObservations: 0,
  }

  for (const wk of weeklyMaps ?? []) {
    const row = wk?.rows?.[playerId]
    const stats = row?.stats
    if (!stats || stats.gp !== 1) continue // did not play this week — no observation to add

    totals.played = true
    const teamAgg = wk.teamAggregates?.[row.team]

    totals.rushAtt += stats.rush_att ?? 0
    totals.rec += stats.rec ?? 0
    totals.recTgt += stats.rec_tgt ?? 0
    totals.teamRushAtt += teamAgg?.rushAtt ?? 0
    totals.teamPassAtt += teamAgg?.passAtt ?? 0

    // The snap null-vs-zero rule lives here: a week only contributes to the snap tally when
    // tm_off_snp is present (a real observation, whether or not off_snp itself is present); an
    // absent off_snp beside a present tm_off_snp adds a real 0, not a skip.
    if (stats.tm_off_snp != null) {
      totals.offSnp += stats.off_snp ?? 0
      totals.tmOffSnp += stats.tm_off_snp
      totals.snapObservations += 1
    }
  }

  return totals
}

function ratio(num, denom, played) {
  if (!played || !(denom > 0)) return null
  return num / denom
}

// → { rush, target, touch, snap }, each a number in [0,1] or null.
//
// Definitions (Sleeper keys, verified present in the week-1 2026 payload):
//   rush   = player rush_att   / team rush_att
//   target = player rec_tgt    / team pass_att
//   touch  = (player rush_att + player rec) / (team rush_att + team pass_att)
//   snap   = accumulated off_snp / accumulated tm_off_snp (the per-player tm_off_snp denominator,
//            NOT the team aggregate row — verified identical across every player on a team)
//
// Position gating matches the design: `rush` is null for WR/TE, `target` is null for QB — a share
// the design deliberately leaves blank, not a zero-denominator accident.
//
// pass_att/rush_att are ATTEMPTS, not plays — they exclude sacks and include kneels. Target share
// over team pass attempts is the conventional definition anyway.
export function computeUsageShares(totals, position) {
  const played = !!totals?.played
  const rush = position === 'WR' || position === 'TE' ? null : ratio(totals?.rushAtt, totals?.teamRushAtt, played)
  const target = position === 'QB' ? null : ratio(totals?.recTgt, totals?.teamPassAtt, played)
  const touch = ratio((totals?.rushAtt ?? 0) + (totals?.rec ?? 0), (totals?.teamRushAtt ?? 0) + (totals?.teamPassAtt ?? 0), played)

  const snapObservations = totals?.snapObservations ?? 0
  const snap = snapObservations > 0
    ? (totals.tmOffSnp > 0 ? totals.offSnp / totals.tmOffSnp : 0)
    : null

  return { rush, target, touch, snap }
}
