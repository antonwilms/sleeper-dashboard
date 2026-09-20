// Portfolio Slice D — each team's primary passer for one season. Selection only: this module
// computes no EPA. Pair the returned playerId with computeSeasonEfficiency's `epaPerAtt`
// (seasonEfficiency.js), which already aggregates Σ passingEpa ÷ Σ attempts over REG games behind
// MIN_PASS_ATTEMPTS — recomputing it here would fork the ratio and drop that floor.
// View-only; pure over gamelogs (takes no playerMap).

/**
 * Each team's primary passer for one season: the player with the most REG pass attempts.
 * Keys are gamelogs' current-franchise domain (CR-16).
 * @param {{players: object, complete?: boolean}|null} gameLogs  loadNflGameLogs(year) result
 * @returns {{[team:string]: {playerId: string, attempts: number}}}
 */
export function buildTeamPrimaryPassers(gameLogs) {
  if (!gameLogs?.complete) return {}

  // team → playerId → REG attempts. A mid-season team change accrues to each team separately,
  // since the bucket key is the game row's own `team`.
  const byTeam = {}
  for (const [playerId, p] of Object.entries(gameLogs.players ?? {})) {
    for (const g of p.games ?? []) {
      if (g.seasonType !== 'REG' || !g.team) continue
      if (!Number.isFinite(g.attempts) || g.attempts <= 0) continue
      const bucket = (byTeam[g.team] ??= {})
      bucket[playerId] = (bucket[playerId] ?? 0) + g.attempts
    }
  }

  const out = {}
  for (const [team, bucket] of Object.entries(byTeam)) {
    let best = null
    for (const [playerId, attempts] of Object.entries(bucket)) {
      // Most attempts wins; an exact tie goes to the lower playerId so the result is deterministic.
      if (best == null || attempts > best.attempts || (attempts === best.attempts && playerId < best.playerId)) {
        best = { playerId, attempts }
      }
    }
    if (best) out[team] = best
  }
  return out
}
