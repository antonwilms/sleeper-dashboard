/**
 * src/utils/regressionSignals.js — Trajectory & consistency signals for the
 * season projection.
 *
 * weightedLinearRegression and stdDev are byte-identical ports of the private
 * helpers in dynastyScore.js; computeConsistency reproduces its CV-based
 * consistency formula. dynastyScore.js is intentionally left untouched in this
 * batch; a future task should de-duplicate. Keep the formulas in sync.
 *
 * The trajectory *normalisation* (denominator floor of 4.0) is projection-
 * specific — see computeTrajectory. dynastyScore.js uses an unfloored
 * `slope / meanPPG`; reconcile during de-duplication.
 */

// Byte-identical to dynastyScore.js (the unused `const n` from that copy is
// omitted — it does not affect the result).
function weightedLinearRegression(xs, ys) {
  const ws     = xs.map((_, i) => i + 1)
  const wSum   = ws.reduce((a, b) => a + b, 0)
  const wxSum  = ws.reduce((s, w, i) => s + w * xs[i], 0)
  const wySum  = ws.reduce((s, w, i) => s + w * ys[i], 0)
  const wxxSum = ws.reduce((s, w, i) => s + w * xs[i] * xs[i], 0)
  const wxySum = ws.reduce((s, w, i) => s + w * xs[i] * ys[i], 0)
  const denom  = wSum * wxxSum - wxSum * wxSum
  if (Math.abs(denom) < 1e-10) return 0
  return (wSum * wxySum - wxSum * wySum) / denom
}

// Byte-identical to dynastyScore.js.
function stdDev(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Career trajectory — weighted linear-regression slope over PPG, normalised.
 *
 * @param {number[]} ppgs  PPG per qualifying season, oldest → newest (GP >= 8).
 * @returns {{ slope: number|null, normalizedSlope: number|null }}
 *          Both null when fewer than 2 seasons, or the result is non-finite.
 *
 * Normalisation: slope / max(meanPPG, 4). dynastyScore.js uses an unfloored
 * `slope / meanPPG`; the 4.0 floor is a projection-specific stability guard for
 * very-low-mean players (it changes nothing for meanPPG >= 4, which is
 * essentially every qualifying veteran).
 */
export function computeTrajectory(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 2) {
    return { slope: null, normalizedSlope: null }
  }
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length
  const xs = ppgs.map((_, i) => i)
  const slope = weightedLinearRegression(xs, ppgs)
  const normalizedSlope = slope / Math.max(meanPPG, 4)
  if (!isFinite(slope) || !isFinite(normalizedSlope)) {
    return { slope: null, normalizedSlope: null }
  }
  return { slope, normalizedSlope }
}

/**
 * Consistency — 100 − coefficient-of-variation × 100, clamped [0, 100].
 * Byte-identical to dynastyScore.js's consistency sub-score.
 *
 * @param {number[]} ppgs  PPG per qualifying season (GP >= 8).
 * @returns {{ consistencyScore: number|null }}
 *          consistencyScore is null when fewer than 3 seasons (dynastyScore.js
 *          defaults to 50 internally; the projection uses a null sentinel
 *          instead of shipping a fake value).
 */
export function computeConsistency(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 3) return { consistencyScore: null }
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length
  const cv = meanPPG > 0 ? stdDev(ppgs) / meanPPG : 1
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100))
  return { consistencyScore }
}
