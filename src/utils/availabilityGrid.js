// dp-v2 Slice 4b — Availability & role's games-played grid. Pure; no React.
//
// Four codes, not three (task file §4.1): 'P' played / 'D' did not play / 'B' bye / 'X' no game
// recorded. The SERVED (data-store) season-totals never emit 'B' — real byes land in 'X' there —
// but the live API-only path (sleeperStats.js, VITE_DATA_STORE_URL unset) does write 'B', so the
// grid must still have a real rule for it. Never reconstructed from the schedule: season-grain
// team is a single dominant team per season (CR-02), so a traded player would get phantom byes
// for his old team's weeks.

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
