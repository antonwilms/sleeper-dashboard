// The single source of the coverage vocabulary (dp-v2 Slice 1). n = a count of observations
// (snapshots, seasons, games — the caller decides the unit).
//
// Deliberately does NOT mirror ktcHistory.js's confidence bands at n=1. computeKtcSignals
// (ktcHistory.js:259-275) returns 'none' for n < 2 because every signal it emits is a *trend*,
// and a trend needs two observations. coverageBand describes whether a value is readable, which
// takes one observation, so n=1 is 'low' here and 'none' there. The high/medium/low thresholds
// below mirror ktcHistory.js:283 (n >= 7 'high', n >= 4 'medium') — a deliberate, named 2-line
// duplication, not a fork of logic; ktcHistory.js is not imported because it does data-store I/O.

export const COVERAGE_BANDS = ['none', 'low', 'medium', 'high']   // ascending

export function coverageBand(n) {
  if (!Number.isFinite(n) || n < 0) return 'none'
  if (n === 0) return 'none'
  if (n <= 3) return 'low'
  if (n <= 6) return 'medium'
  return 'high'
}

export function pipCount(band) {
  switch (band) {
    case 'low':    return 1
    case 'medium': return 2
    case 'high':   return 3
    default:       return 0
  }
}
