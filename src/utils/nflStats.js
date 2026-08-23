// Sleeper → nflverse schedule team domain. Only LAR differs in the current domain.
export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }

export function normalizeTeamForSchedule(team) {
  if (!team) return null
  return SCHEDULE_TEAM_ALIAS[team] ?? team
}

// nflverse/schedule → Sleeper domain, the reverse hop (dp-v2 Slice 6b — CR-16 fires again here).
// Derived FROM SCHEDULE_TEAM_ALIAS, not a second hand-written literal, so the two constants
// cannot drift apart. `enrichment/coaching.json` keys the Sleeper domain (LAR) while the
// team-detail route param is era-accurate (LA); this is the mirror image of the join 6a's
// exposure column already had to make in the other direction.
const REVERSE_SCHEDULE_TEAM_ALIAS = Object.fromEntries(
  Object.entries(SCHEDULE_TEAM_ALIAS).map(([sleeper, schedule]) => [schedule, sleeper])
)

export function denormalizeTeamForSchedule(team) {
  if (!team) return null
  return REVERSE_SCHEDULE_TEAM_ALIAS[team] ?? team
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
