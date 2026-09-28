// The rookie dynasty-side prior (in-season-evidence-2c-wiring §0.1): the rookie-path projection recomputed
// through the same pure function with ktcMult = 1.0 and collegeContribution = 1.0 — the prior the 2c
// backtest measured (its reconstruction holds both at 1.0). The season projection keeps both; only the
// dynasty prior drops them, so the market is counted once (the 60% KTC anchor).
// Pure, no React, no I/O; imports no seam module (guarded by the isolation tests).
import { computeNextSeasonProjection } from './seasonProjection'

// → { [playerId]: projectedPPG } for QB/RB/WR/TE with years_exp 0 or 1 and a finite result.
export function buildRookieDynastyPriors({ playerIds, projectionArgs }) {
  const out = {}
  for (const id of playerIds) {
    const info = projectionArgs.playersMap?.[id]
    if (!['QB', 'RB', 'WR', 'TE'].includes(info?.position)) continue
    if (info.years_exp !== 0 && info.years_exp !== 1) continue
    const p = computeNextSeasonProjection({ ...projectionArgs, playerId: id, ktcMap: null, collegeStats: null })
    if (Number.isFinite(p?.projectedPPG)) out[id] = p.projectedPPG
  }
  return out
}
