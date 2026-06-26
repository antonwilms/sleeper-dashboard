// Sleeper → nflverse schedule team domain. Only LAR differs in the current domain.
export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }

export function normalizeTeamForSchedule(team) {
  if (!team) return null
  return SCHEDULE_TEAM_ALIAS[team] ?? team
}

// Season-average line from careerStats[season][playerId] (or undefined).
// Reads COUNTING stats only — never the pre-summed rate keys (cmp_pct, pass_ypa, etc.).
// games===0 / no data → games:0 and every stat field null. Never returns NaN.
export function computeSeasonAverages(seasonData) {
  const empty = {
    games: 0,
    fpPerG: null, compPct: null, passYdPerG: null, passTd: null, passInt: null,
    rushAtt: null, rushYdPerG: null, rushTd: null,
    tgt: null, rec: null, recYdPerG: null, recTd: null, ypr: null, catchPct: null,
    totalYdPerG: null, totalTd: null,
  }
  if (!seasonData) return empty
  const games = seasonData.gamesPlayed ?? 0
  if (games === 0) return { ...empty }
  const s = seasonData.stats ?? {}
  const fp = seasonData.fantasyPoints ?? 0
  return {
    games,
    fpPerG: fp / games,
    compPct: s.pass_att > 0 ? 100 * (s.pass_cmp ?? 0) / s.pass_att : null,
    passYdPerG: s.pass_yd != null ? s.pass_yd / games : null,
    passTd: s.pass_td ?? null,
    passInt: s.pass_int ?? null,
    rushAtt: s.rush_att ?? null,
    rushYdPerG: s.rush_yd != null ? s.rush_yd / games : null,
    rushTd: s.rush_td ?? null,
    tgt: s.rec_tgt ?? null,
    rec: s.rec ?? null,
    recYdPerG: s.rec_yd != null ? s.rec_yd / games : null,
    recTd: s.rec_td ?? null,
    ypr: s.rec > 0 && s.rec_yd != null ? s.rec_yd / s.rec : null,
    catchPct: s.rec_tgt > 0 ? 100 * (s.rec ?? 0) / s.rec_tgt : null,
    // ALL-pill composites: treat missing stat keys as 0; null only when games===0
    totalYdPerG: ((s.pass_yd || 0) + (s.rush_yd || 0) + (s.rec_yd || 0)) / games,
    totalTd: (s.pass_td || 0) + (s.rush_td || 0) + (s.rec_td || 0),
  }
}

// Game log for one player-season.
// playerTeam = the team to join THIS season's games against — the caller passes the
//   per-season team (careerStats[season][id].team, schema v3+), NOT the player's current
//   team; null when the season has no resolved team → matchups degrade to `—`.
// weeklyPoints / weeklyStatus from careerStats[season][id].
// scheduleGames = loadNflSchedule(season).games (raw 15-field rows) or [].
export function buildGameLog({ playerTeam, weeklyPoints, weeklyStatus, scheduleGames }) {
  const normTeam = normalizeTeamForSchedule(playerTeam)
  const games = scheduleGames ?? []

  // Index REG games by week for this team
  const weekMap = new Map()
  for (const g of games) {
    if (g.gameType === 'REG' && (g.homeTeam === normTeam || g.awayTeam === normTeam)) {
      weekMap.set(g.week, g)
    }
  }

  const scheduleLoaded = games.length > 0

  // Join-sanity guard: any played week with no game for the joined (per-season) team →
  // the team is unresolved/anomalous (or a played week on its bye) → suppress matchups.
  let teamConsistent = true
  if (scheduleLoaded) {
    for (let w = 1; w <= 18; w++) {
      if ((weeklyStatus?.[w - 1] ?? 'X') === 'P' && !weekMap.has(w)) {
        teamConsistent = false
        break
      }
    }
  }

  const matchupTrusted = scheduleLoaded && teamConsistent

  const rows = []
  for (let w = 1; w <= 18; w++) {
    const status = weeklyStatus?.[w - 1] ?? 'X'
    if (status === 'X') continue

    if (status === 'B') {
      rows.push({ week: w, status: 'B', fantasyPoints: null, opponent: 'BYE', homeAway: null, result: null, score: null, spread: null, total: null })
      continue
    }

    // 'P' or 'D'
    const fantasyPoints = status === 'P' ? (weeklyPoints?.[w] ?? null) : null

    if (matchupTrusted && weekMap.has(w)) {
      const g = weekMap.get(w)
      const isHome = g.homeTeam === normTeam
      const opponent = isHome ? g.awayTeam : g.homeTeam
      const homeAway = isHome ? 'home' : 'away'

      let score = null, result = null
      if (g.homeScore != null && g.awayScore != null) {
        const my = isHome ? g.homeScore : g.awayScore
        const opp = isHome ? g.awayScore : g.homeScore
        score = `${my}-${opp}`
        const margin = g.result == null ? null : (isHome ? g.result : -g.result)
        result = margin == null ? null : margin > 0 ? 'W' : margin < 0 ? 'L' : 'T'
      }

      // spreadLine is home-perspective positive = home favored; display as favorite-negative
      const spread = g.spreadLine == null ? null : (isHome ? -g.spreadLine : g.spreadLine)
      const total = g.totalLine ?? null

      rows.push({ week: w, status, fantasyPoints, opponent, homeAway, result, score, spread, total })
    } else {
      rows.push({ week: w, status, fantasyPoints, opponent: null, homeAway: null, result: null, score: null, spread: null, total: null })
    }
  }

  return { scheduleLoaded, teamConsistent, rows }
}

// Best/worst fantasy game over PLAYED weeks.
// rows = buildGameLog(...).rows
export function computeHighLow(rows) {
  const played = rows.filter(r => r.status === 'P' && r.fantasyPoints != null)
  if (!played.length) return null
  let high = played[0], low = played[0]
  for (const r of played) {
    if (r.fantasyPoints > high.fantasyPoints) high = r
    if (r.fantasyPoints < low.fantasyPoints) low = r
  }
  return {
    high: { week: high.week, opponent: high.opponent, fantasyPoints: high.fantasyPoints },
    low:  { week: low.week,  opponent: low.opponent,  fantasyPoints: low.fantasyPoints  },
  }
}
