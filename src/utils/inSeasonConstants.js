// Pinned in-season k — Phase 2b (in-season-evidence-2b-1-constants-snapshot.md).
// Source: sleeper-dashboard-data backtests/2026-09-26-inseason-constants.json @ a071bdb,
// copied byte-for-byte to src/__fixtures__/inseason-constants-2026-09-26.json; every K_* below
// is re-derived from that fixture by src/__tests__/inSeasonConstants.test.js. Never hand-edit a K_*:
// re-run the data backtest and re-pin (CR-25).
// WARNING (verdict § "Prior optimism"): these k partly compensate for the projection's known optimism
// (prior scale c ≈ 0.80–0.86 across positions — the prior sits high, so evidence earns extra weight).
// They MUST be re-fitted if that optimism is ever corrected. A calibrated prior and its k change together.
// Basis: fitted on the half-PPR panel; k is dimensionless and applied to league-basis values (verdict
// Limitations; a league-basis refit is data backlog D-45).

export const IN_SEASON_CONSTANTS_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-09-26-inseason-constants.json',
  commit: 'a071bdb324976203ed915e14a57b88fb740fb0b6',
  generatedAt: '2026-09-26T10:10:30.744Z',
  fixture: 'src/__fixtures__/inseason-constants-2026-09-26.json',
}
export const K_ROS_POINTS          = { QB: 3,   RB: 2.5, WR: 3,   TE: 3.5 }
export const K_ROS_POINTS_ROOKIE0  = { QB: 3,   RB: 3,   WR: 2.5, TE: 3 }
export const K_ROS_POINTS_ROOKIE1P = { QB: 2.5, RB: 2.5, WR: 3,   TE: 2.5 }
export const K_ROS_POINTS_SHORT    = { QB: 1.5, RB: 1.5, WR: 1,   TE: 4 }
export const K_DYN_POINTS_HISTORY  = { QB: 7.5, RB: 4,   WR: 6,   TE: 5.5 }
export const K_DYN_POINTS_ROOKIE0  = { QB: 6.5, RB: 6.5, WR: 6.5, TE: 6.5 }
export const K_DYN_POINTS_ROOKIE1P = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
export const K_DYN_POINTS_SHORT    = { QB: 2.5, RB: 2.5, WR: 2.5, TE: 2.5 }
export const K_ROS_OPP             = { QB: 2.5, RB: 1.5, WR: 3,   TE: 3.5 }   // display-only (2b-2 tab)
export const SORT_MEASURE = 'relative'                                        // verdict Q6
// A freeze pins the projection MODEL, not just its inputs (§0 design rule). First UTC capture date on
// the current projection model (7b5b055, Step 4 up-side removal, 2026-09-12 22:27 UTC — also the model
// these k were fitted against). A frozen prior captured earlier is refused (§3.4). BUMP in the same
// commit as any change that moves projectedPPG/projectedGames; priorModelFrom.test.js reds until you do.
export const PRIOR_MODEL_FROM = '2026-09-13'
