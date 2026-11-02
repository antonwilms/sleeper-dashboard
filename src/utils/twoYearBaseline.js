// View-only. S3/S4a baseline B2 (data `grading/2026-10-30-dynasty-history-verdict.md` §4;
// `grading/2026-10-30-dynasty-rework-verdict.md`). Never feeds projection, the dynasty score,
// labels, factors or snapshots — `twoYearBaselineViewOnly.test.js`.
//
// Copies data lib/dynastyBacktest.mjs twoYearAveragePPG / cohortAge / ageBand (CR-33);
// twoYearBaselineParity.test.js pins both to one fixture table. Deliberate differences, not in the table:
// the birthdate comes from Sleeper `birth_date` here (data: nflverse/playerids.json `birthdate`);
// a missing/unparsable birthdate falls back to Sleeper `age` here (data yields null).
//
// Assumption: `careerStats` holds completed seasons only — the live season arrives separately as
// `currentSeasonTotals`, which is what makes `deriveDataSeason` the last completed season. This
// module never reads `currentSeasonTotals`.

import { deriveDataSeason } from './environment'

// PROVISIONAL(heuristic): two-year-average rank and age-band caution · stand-in for a forward-looking dynasty score (S5, off-season) · S3/S4a: the score does not beat the two-year average and leans toward veterans; a score that passes S4a's test replaces this

// The dynasty score's Path B/C confidences; S3's veteran population.
export const VETERAN_CONFIDENCE = new Set(['low', 'moderate', 'high'])

// computeDynastyScore sends every years_exp <= 1 player down Path A (confidence 'prospect'), so a
// Path B/C confidence already implies years_exp >= 2.
export function isVeteranRow(row) {
  return VETERAN_CONFIDENCE.has(row?.dynastyScore?.confidence) && row?.dynastyScore?.components != null
}

// B2: mean PPG over the last two completed seasons that have 8+ games. Never pads, never 0.
export function twoYearAveragePPG(careerStats, playerId) {
  const dataSeason = deriveDataSeason(careerStats)
  if (dataSeason == null) return null
  const ppgs = []
  for (const y of [dataSeason - 1, dataSeason]) {
    const d = careerStats?.[y]?.[playerId]
    if (d && d.gamesPlayed >= 8 && Number.isFinite(d.fantasyPoints)) {
      ppgs.push(d.fantasyPoints / d.gamesPlayed)
    }
  }
  if (ppgs.length === 0) return null
  return ppgs.reduce((a, b) => a + b, 0) / ppgs.length
}

// Map<playerId, { rank, poolSize, ppg }> — per-position pool of veterans with a B2 value.
// Ties share a rank (1 + count strictly higher).
export function buildTwoYearRanks(playerRows, careerStats, playersMap) {
  const byPos = new Map()
  for (const row of playerRows ?? []) {
    if (!isVeteranRow(row)) continue
    const ppg = twoYearAveragePPG(careerStats, row.player_id)
    if (ppg == null) continue
    const pos = playersMap?.[row.player_id]?.position
    if (!pos) continue
    if (!byPos.has(pos)) byPos.set(pos, [])
    byPos.get(pos).push({ id: row.player_id, ppg })
  }
  const out = new Map()
  for (const [, pool] of byPos) {
    pool.sort((a, b) => b.ppg - a.ppg || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const m of pool) {
      const rank = 1 + pool.filter(o => o.ppg > m.ppg).length
      out.set(m.id, { rank, poolSize: pool.length, ppg: m.ppg })
    }
  }
  return out
}

export const AGE_CAUTION = {
  over: { minAge: 31, text: 'The score has historically rated this age group too high.' },
  under: { maxAge: 24, text: 'The score has historically rated this age group too low.' },
}

// S3's age: whole years on `${dataSeason + 1}-06-01` (year difference, minus 1 if the birthday
// falls after that date). Falls back to Sleeper's `age` when birth_date is missing/unparsable.
export function cautionAge(player, careerStats) {
  const dataSeason = deriveDataSeason(careerStats)
  const m = typeof player?.birth_date === 'string' && dataSeason != null
    ? /^(\d{4})-(\d{2})-(\d{2})/.exec(player.birth_date)
    : null
  if (m) {
    const [, y, mo, d] = m.map(Number)
    const refYear = dataSeason + 1
    let age = refYear - y
    if (mo > 6 || (mo === 6 && d > 1)) age -= 1
    if (Number.isFinite(age)) return { age, source: 'birthdate' }
  }
  if (Number.isFinite(player?.age)) return { age: player.age, source: 'sleeper' }
  return null
}

export function ageCaution(row, player, careerStats) {
  if (!isVeteranRow(row)) return null
  const a = cautionAge(player, careerStats)
  if (a == null) return null
  if (a.age >= AGE_CAUTION.over.minAge) return 'over'
  if (a.age <= AGE_CAUTION.under.maxAge) return 'under'
  return null
}
