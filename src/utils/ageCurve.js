// src/utils/ageCurve.js — pure age-curve interpolation. Imports nothing (leaf module).
//
// Extracted from dynastyScore.js to break the dynastyScore ↔ projectionSignals
// import cycle (projectionSignals.computeBreakoutFlag needs this lookup, and
// dynastyScore now imports the flag helpers back). interpolateAgeCurve depends on
// nothing else, so this is a safe leaf. NOTE: computeEmpiricalAgeCurves (the curve
// *builder*) intentionally stays in dynastyScore.js — it is not in the cycle and
// has its own deps; do not move it here.

// Linear interpolation into an age curve.
// If age is outside the curve's range, clamps to nearest endpoint.
export function interpolateAgeCurve(curve, age) {
  if (curve.length === 0) return 0
  if (age <= curve[0].age) return curve[0].medianPPG
  if (age >= curve[curve.length - 1].age) return curve[curve.length - 1].medianPPG

  for (let i = 0; i < curve.length - 1; i++) {
    const lo = curve[i], hi = curve[i + 1]
    if (age >= lo.age && age <= hi.age) {
      const t = (age - lo.age) / (hi.age - lo.age)
      return lo.medianPPG + t * (hi.medianPPG - lo.medianPPG)
    }
  }
  return curve[curve.length - 1].medianPPG
}
