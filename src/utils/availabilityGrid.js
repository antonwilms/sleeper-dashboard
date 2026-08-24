// dp-v2 Slice 4b — Availability & role's games-played grid. Pure; no React.
//
// Four codes, not three (task file §4.1): 'P' played / 'D' did not play / 'B' bye / 'X' no game
// recorded. The live API-only path (sleeperStats.js, VITE_DATA_STORE_URL unset) always writes
// 'B'. The SERVED (data-store) season-totals only started emitting 'B' with D-1 (2026-08-24,
// forward-only) — a completed historical season still carries 'X' at every bye and never gets
// rewritten (data repo Invariant 1), so 'X' at a bye remains common and legitimate; only a
// current/future season's single-team rows get 'B' written at ingest. Never reconstructed from
// the schedule here in the app: season-grain team is a single dominant team per season (CR-02),
// so a traded player would get phantom byes for his old team's weeks — that risk is exactly why
// D-1 lives in the data repo's per-week aggregation instead, where the real per-week team is
// still known.

export const STATUS_LABEL = {
  P: 'Played',
  D: 'Did not play',
  B: 'Bye',
  X: 'No game recorded',
}

/**
 * @param {object} careerStats  { [season]: { [pid]: { weeklyStatus: string[18] } } }
 * @param {string} playerId
 * @param {number[]} seasons  the shared season axis, oldest→newest
 * @returns {{ rows: Array<{season:number, weeks:string[18]}>, hasBye: boolean }}
 */
export function buildAvailabilityGrid(careerStats, playerId, seasons) {
  const rows = (seasons ?? []).map(season => {
    const ws = careerStats?.[season]?.[playerId]?.weeklyStatus
    const weeks = Array.from({ length: 18 }, (_, i) => {
      const code = ws?.[i]
      return (code === 'P' || code === 'D' || code === 'B') ? code : 'X'
    })
    return { season, weeks }
  })
  const hasBye = rows.some(r => r.weeks.includes('B'))
  return { rows, hasBye }
}
