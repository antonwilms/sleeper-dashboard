// week-w-matchup-flags-visuals.md §1b — the matchup header's pure derivations for `/week`. The live
// week's league matchups are read for DISPLAY ONLY; a missing pair is stated, never filled. View-only:
// nothing here reaches projection, scoring or the dynasty score.
//
// `pairMatchup` and `weekScoresFromMatchups` share one rule: a `null` matchup_id never pairs.

import { projectedPoints } from './weeklyLineup'
import { isFilledSlotId } from './rosterSlots'

const isNum = v => typeof v === 'number' && Number.isFinite(v)

// rows: the Sleeper /league/{id}/matchups/{week} array. A `null` matchup_id never pairs with
// another `null`. Independent of array order.
export function pairMatchup(rows, myRosterId) {
  const list = Array.isArray(rows) ? rows : []
  const mine = list.find(r => r?.roster_id === myRosterId) ?? null
  if (mine == null || mine.matchup_id == null) return { mine, opponent: null, reason: 'no-matchup' }
  const others = list.filter(r => r?.matchup_id === mine.matchup_id && r.roster_id !== myRosterId)
  if (others.length === 1) return { mine, opponent: others[0], reason: null }
  return { mine, opponent: null, reason: 'unpaired' }
}

// Completed-week League schedule entries (App.jsx → leagueData.weeklyScores). rows: one week's
// Sleeper matchups array. -> { [roster_id]: { week, points, opponentRosterId, won } } for every
// roster in a matchup_id group of exactly two. A null/undefined matchup_id (playoff bye,
// eliminated, median-only row) never forms a group — same rule as pairMatchup (OI-1).
export function weekScoresFromMatchups(week, rows) {
  const groups = {}
  for (const m of Array.isArray(rows) ? rows : []) {
    if (m?.matchup_id == null) continue
    ;(groups[m.matchup_id] ??= []).push(m)
  }
  const out = {}
  for (const pair of Object.values(groups)) {
    if (pair.length !== 2) continue
    const [a, b] = pair
    const aWon = a.points > b.points
    out[a.roster_id] = { week, points: a.points, opponentRosterId: b.roster_id, won: aWon }
    out[b.roster_id] = { week, points: b.points, opponentRosterId: a.roster_id, won: !aWon }
  }
  return out
}

// The opponent's starters only (the matchup row's `starters`), never `players`.
export function sumStarterProjection(starterIds, projections, scoringSettings) {
  const ids = starterIds ?? []
  let total = 0
  let valued = 0
  for (const id of ids) {
    if (!isFilledSlotId(id)) continue
    const p = projectedPoints(projections?.[id]?.stats, scoringSettings)
    if (isNum(p)) { total += p; valued++ }
  }
  return { total: valued === 0 ? null : total, valued, slots: ids.length }
}

export function sumRows(rows, valueOf) {
  const list = rows ?? []
  let total = 0
  let valued = 0
  for (const r of list) {
    const v = valueOf(r)
    if (isNum(v)) { total += v; valued++ }
  }
  return { total: valued === 0 ? null : total, valued, slots: list.length }
}

function sideInfo({ rosterId, rosterTeams, standings, row, proj, ours }) {
  const st = (standings ?? []).find(s => s.rosterId === rosterId)
  return {
    rosterId,
    teamName: (rosterTeams ?? []).find(t => t.rosterId === rosterId)?.teamName ?? null,
    record: st ? { wins: st.wins, losses: st.losses, ties: st.ties } : null,
    proj,
    ours,
    points: isNum(row?.points) ? row.points : null,
  }
}

export function buildMatchupHeader({
  matchups, myRosterId, rosterTeams, standings, starters, ownByPlayer, projections, scoringSettings, week,
}) {
  const status = matchups?.status ?? 'idle'
  let pair = { mine: null, opponent: null, reason: null }
  let reason
  if (status === 'idle') reason = 'no-league'
  else if (status === 'failed') reason = 'fetch-failed'
  else if (status === 'loaded') { pair = pairMatchup(matchups.rows, myRosterId); reason = pair.reason }
  else reason = null // loading

  const myProj = sumRows(starters, r => r.points)
  // PROVISIONAL(heuristic): OURS starters' total · sums weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real
  const myOurs = sumRows(starters, r => ownByPlayer?.[r.player_id]?.value)
  const mine = sideInfo({ rosterId: myRosterId, rosterTeams, standings, row: pair.mine, proj: myProj, ours: myOurs })

  let opponent = null
  if (status === 'loaded' && reason === null && pair.opponent) {
    opponent = sideInfo({
      rosterId: pair.opponent.roster_id, rosterTeams, standings, row: pair.opponent,
      proj: sumStarterProjection(pair.opponent.starters, projections, scoringSettings), ours: null,
    })
  }

  const live = [mine.points, opponent?.points].some(p => isNum(p) && p !== 0)
  const complete = s => s.proj.total != null && s.proj.valued === s.proj.slots
  const projMargin = opponent && complete(mine) && complete(opponent) ? mine.proj.total - opponent.proj.total : null

  return { week, status: status === 'loading' ? 'loading' : 'ready', reason, mine, opponent, live, projMargin }
}
