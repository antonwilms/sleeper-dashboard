// ---------------------------------------------------------------------------
// Conference strength multipliers
// ---------------------------------------------------------------------------
// A 1500-yard SEC season is not equivalent to a 1500-yard Sun Belt season.
// These multipliers discount dominator ratings by conference strength.
// Power-4 (SEC / Big Ten) is the baseline.

const CONFERENCE_MULTIPLIERS = {
  'SEC':              1.00,
  'Big Ten':          1.00,
  'Big 12':           0.95,
  'ACC':              0.95,
  'Pac-12':           0.95,
  'American':         0.78,
  'American Athletic': 0.78,
  'Mountain West':    0.75,
  'Sun Belt':         0.68,
  'MAC':              0.65,
  'Mid-American':     0.65,
  'Conference USA':   0.62,
  'C-USA':            0.62,
  'FBS Independents': 0.80,
  'Independent':      0.80,
}

export function getConferenceMultiplier(conference) {
  if (!conference) return 0.55
  return CONFERENCE_MULTIPLIERS[conference] ?? 0.55
}

/**
 * computeCollegeMetrics
 *
 * Derives dominator rating, breakout age, and production trend from
 * a player's matched college seasons (output of matchCollegeToSleeper).
 *
 * @param {Array}  seasons       - array of season objects sorted oldest→newest
 * @param {string} position      - Sleeper position string ('QB'|'RB'|'WR'|'TE')
 * @param {number} currentAge    - player's current age (from Sleeper playerMap)
 * @param {number} currentSeason - most recent NFL season year (e.g. 2024)
 * @returns {Object|null}        - metrics object, or null if no usable data
 */
export function computeCollegeMetrics(seasons, position, currentAge, currentSeason) {
  if (!seasons || seasons.length === 0) return null
  if (currentAge == null || currentSeason == null) return null

  const isQB    = position === 'QB'
  const isRB    = position === 'RB'
  const isSkill = position === 'WR' || position === 'TE'
  if (!isQB && !isRB && !isSkill) return null

  // ── Per-season computation ────────────────────────────────────────────────
  // Confirmed CFBD passing statType field names (step-0 diagnostic, 2023):
  // YDS, TD, YPA, COMPLETIONS, INT, PCT, ATT
  // PCT is present — use directly. Completions key is COMPLETIONS (not COMP).
  const enriched = seasons.map(s => {
    const estimatedAge = currentAge - (currentSeason - s.year)

    let domRating = null
    let qbScore   = null

    if (isSkill) {
      const rec  = s.receiving
      const team = s.teamRecTotals
      if (rec?.YDS != null && team?.YDS != null && team.YDS > 0) {
        domRating = (
          (rec.YDS / Math.max(team.YDS, 1)) * 0.65 +
          ((rec.TD ?? 0) / Math.max(team.TD ?? 1, 1)) * 0.35
        ) * 100
      }
    } else if (isRB) {
      const rush = s.rushing
      const team = s.teamRushTotals
      if (rush?.YDS != null && team?.YDS != null && team.YDS > 0) {
        domRating = (
          (rush.YDS / Math.max(team.YDS, 1)) * 0.65 +
          ((rush.TD ?? 0) / Math.max(team.TD ?? 1, 1)) * 0.35
        ) * 100
      }
    } else if (isQB) {
      const pass = s.passing
      if (pass?.YDS != null && pass?.ATT != null && pass.ATT > 0) {
        // Efficiency: yards per attempt scaled to 0–100 (4 YPA → 0, 9 YPA → 100)
        const ypa = pass.YDS / pass.ATT
        const eff = Math.max(0, Math.min(100, (ypa - 4) * 20))
        // Volume: raw attempts (200 att → 0, 800 att → 100)
        const vol = Math.max(0, Math.min(100, (pass.ATT - 200) / 6))
        qbScore = Math.round((eff * 0.55 + vol * 0.45) * 10) / 10
        // TD bonus capped at +10
        const tdBonus = Math.min(10, (pass.TD ?? 0) / 3)
        qbScore = Math.min(100, qbScore + tdBonus)
      }
    }

    // Conference strength adjustment — pull from whichever CFBD source exists
    const conference = s.receiving?.conference ?? s.rushing?.conference ?? s.passing?.conference ?? null
    const confMultiplier = getConferenceMultiplier(conference)
    if (domRating != null) domRating *= confMultiplier
    if (qbScore   != null) qbScore   *= confMultiplier

    return {
      year:          s.year,
      domRating:     domRating != null ? Math.round(domRating * 10) / 10 : null,
      qbScore:       qbScore   != null ? Math.round(qbScore   * 10) / 10 : null,
      conference,
      confMultiplier,
      estimatedAge,
      receiving:     s.receiving ?? null,
      rushing:       s.rushing   ?? null,
      passing:       s.passing   ?? null,
    }
  })

  // ── Breakout detection ────────────────────────────────────────────────────
  let breakoutAge = null
  for (const s of enriched) {
    let meetsThreshold = false
    if (isSkill)   meetsThreshold = (s.domRating >= 20) || (s.receiving?.YDS ?? 0) >= 800
    else if (isRB) meetsThreshold = (s.domRating >= 30) || (s.rushing?.YDS  ?? 0) >= 700
    else if (isQB) meetsThreshold = (s.passing?.YDS ?? 0) >= 2500 || (s.passing?.TD ?? 0) >= 20
    if (meetsThreshold) {
      breakoutAge = s.estimatedAge
      break
    }
  }

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const validRatings = enriched.map(s => isQB ? s.qbScore : s.domRating).filter(r => r != null)

  const peakDominator      = validRatings.length > 0 ? Math.max(...validRatings) : null
  const finalYearDominator = (isQB
    ? enriched[enriched.length - 1]?.qbScore
    : enriched[enriched.length - 1]?.domRating) ?? null
  const seasonsPlayed      = enriched.length

  // ── Production trend ─────────────────────────────────────────────────────
  let productionTrend = 'single-season'
  if (seasonsPlayed >= 2 && finalYearDominator != null && validRatings.length >= 2) {
    const mean = validRatings.reduce((a, b) => a + b, 0) / validRatings.length
    const ratio = finalYearDominator / mean
    if (ratio > 1.15)      productionTrend = 'improving'
    else if (ratio < 0.85) productionTrend = 'declining'
    else                   productionTrend = 'peak-final'
  }

  return {
    seasons:          enriched,
    breakoutAge,
    peakDominator,
    finalYearDominator,
    productionTrend,
    seasonsPlayed,
  }
}
