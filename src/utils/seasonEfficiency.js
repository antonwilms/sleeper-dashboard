// dp-v2 Slice 5b — one-pass gamelogs season aggregator for Market's Efficiency column set.
// view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure, no React.
//
// Sum components, then divide — never average a per-game rate (CR-10's rule, applied here to the
// gamelogs family rather than teamcontext). CPOE is the trap: passingCpoe is a per-game RATE, so a
// plain mean over-weights a low-attempt game (one 3-attempt game at +40% must not read as elite).
// Weighted here as Σ(passingCpoe × attempts) ÷ Σattempts.
//
// REG only, matching 4a's game log and 4c's Environment precedent. A zero/absent denominator
// resolves to null (the call site renders "—", never "0").
//
// CARRY SH is the one cross-family join — Σ gamelogs.carries ÷ Σ teamcontext.off.rushPlays,
// matched on (team, week). teamcontext.off.rushPlays includes QB scrambles/sneaks, which the
// skill-cohort share denominator (buildPerSeasonTeamShares) excludes — deliberately a different,
// wider denominator than `rushShare` elsewhere in this app (advstats-grading-findings.md §4.8).
// The join crosses gamelogs' current-franchise domain and teamcontext's era-accurate domain;
// resolvePlayerTeam already remaps, so no second remap is added here. Its week-grain lookup
// (`games.find(g => g.week === week)`) is seasonType-BLIND, so the games passed to it here are
// pre-filtered to REG only — otherwise a POST row sharing a week number could win the find.

import { resolvePlayerTeam } from './playerTeam'

function sum(values) {
  let s = 0
  for (const v of values) if (Number.isFinite(v)) s += v
  return s
}

function ratio(num, den) {
  return (Number.isFinite(den) && den > 0) ? num / den : null
}

/**
 * @param {{players?: object, complete?: boolean}|null} gameLogsResult  loadNflGameLogs(year) result
 * @param {{teams?: object, complete?: boolean}|null} teamContextResult  loadTeamContext(year) result
 *   — only needed for CARRY SH; absent/incomplete just leaves carrySh null for everyone.
 * @param {number} season
 * @returns {{ [playerId]: {
 *   epaPerAtt: number|null, cpoe: number|null, rushEpaTotal: number|null,
 *   carrySh: number|null, rushEpaPerAtt: number|null, epaPerTgt: number|null,
 * } }}
 */
export function computeSeasonEfficiency(gameLogsResult, teamContextResult, season) {
  const result = {}
  if (!gameLogsResult?.complete) return result

  const teamContextComplete = !!teamContextResult?.complete

  for (const [playerId, p] of Object.entries(gameLogsResult.players ?? {})) {
    const regGames = (p.games ?? []).filter(g => g.seasonType === 'REG')
    if (regGames.length === 0) continue

    const attempts = sum(regGames.map(g => g.attempts))
    const passingEpaSum = sum(regGames.map(g => g.passingEpa))
    const cpoeWeightedSum = sum(
      regGames.map(g => (g.passingCpoe != null && Number.isFinite(g.attempts)) ? g.passingCpoe * g.attempts : 0)
    )
    const rushingEpaSum = sum(regGames.map(g => g.rushingEpa))
    const carries = sum(regGames.map(g => g.carries))
    const targets = sum(regGames.map(g => g.targets))
    const receivingEpaSum = sum(regGames.map(g => g.receivingEpa))

    // CARRY SH — REG-filtered input to resolvePlayerTeam so its seasonType-blind week lookup
    // cannot match a POST row for the same week number.
    let carryShNum = 0, carryShDen = 0
    if (teamContextComplete) {
      const regOnlyPlayer = { games: regGames }
      for (const g of regGames) {
        if (!Number.isFinite(g.carries) || g.carries <= 0) continue
        const team = resolvePlayerTeam({ gameLogPlayers: { [playerId]: regOnlyPlayer } }, playerId, season, g.week)
        if (!team) continue
        const teamWeek = (teamContextResult.teams?.[team]?.games ?? [])
          .find(tg => tg.week === g.week && tg.seasonType === 'REG')
        const rushPlays = teamWeek?.off?.rushPlays
        if (!Number.isFinite(rushPlays) || rushPlays <= 0) continue
        carryShNum += g.carries
        carryShDen += rushPlays
      }
    }

    result[playerId] = {
      epaPerAtt: ratio(passingEpaSum, attempts),
      cpoe: ratio(cpoeWeightedSum, attempts),
      rushEpaTotal: rushingEpaSum,
      carrySh: carryShDen > 0 ? carryShNum / carryShDen : null,
      rushEpaPerAtt: ratio(rushingEpaSum, carries),
      epaPerTgt: ratio(receivingEpaSum, targets),
    }
  }

  return result
}
