// Pinned in-season k — Phase 2b (in-season-evidence-2b-1-constants-snapshot.md).
// Source: sleeper-dashboard-data backtests/2026-10-07-inseason-constants.json @ f2c3b83 (re-fitted on the
// boundary-6 model by qb-inseason-refit), copied byte-for-byte to src/__fixtures__/inseason-constants-2026-10-07.json; every K_* below
// (except the K_DYN_PROSPECT_A_* family, pinned from the 2c panel fixture — see its own comment)
// is re-derived from that fixture by src/__tests__/inSeasonConstants.test.js. Never hand-edit a K_*:
// re-run the data backtest and re-pin (CR-25).
// WARNING (verdict § "Prior optimism"): these k partly compensate for the projection's known optimism
// (prior scale c ≈ 0.80–0.86 across positions — the prior sits high, so evidence earns extra weight).
// They MUST be re-fitted if that optimism is ever corrected. A calibrated prior and its k change together.
// Basis: fitted on the half-PPR panel; k is dimensionless and applied to league-basis values (verdict
// Limitations; a league-basis refit is data backlog D-45).

export const IN_SEASON_CONSTANTS_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-10-07-inseason-constants.json',
  commit: 'f2c3b83b31acc589dac78b6d61a704ac02a57477',
  generatedAt: '2026-10-07T07:44:45.878Z',
  fixture: 'src/__fixtures__/inseason-constants-2026-10-07.json',
}
export const K_ROS_POINTS          = { QB: 3,   RB: 2.5, WR: 3,   TE: 3.5 }
export const K_ROS_POINTS_ROOKIE0  = { QB: 2.5, RB: 2.5, WR: 2.5, TE: 2.5 }
export const K_ROS_POINTS_ROOKIE1P = { QB: 2.5, RB: 2.5, WR: 3,   TE: 2.5 }
export const K_ROS_POINTS_SHORT    = { QB: 1.5, RB: 1.5, WR: 1,   TE: 4 }
export const K_DYN_POINTS_HISTORY  = { QB: 7.5, RB: 4,   WR: 6,   TE: 5.5 }
export const K_DYN_POINTS_ROOKIE0  = { QB: 6.5, RB: 6.5, WR: 6.5, TE: 6.5 }
export const K_DYN_POINTS_ROOKIE1P = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
export const K_DYN_POINTS_SHORT    = { QB: 2.5, RB: 2.5, WR: 2.5, TE: 2.5 }
export const K_ROS_OPP             = { QB: 2.5, RB: 1.5, WR: 3,   TE: 3.5 }   // display-only (2b-2 tab)
export const SORT_MEASURE = 'relative'                                        // verdict Q6
// A freeze pins the projection MODEL, not just its inputs (§0 design rule). First UTC capture date on
// the current projection model (P12b, the rookie QB starter level — the day after the app push; before it
// P6b's QB start share, 2026-10-05, and before that 7b5b055, Step 4 up-side removal, 2026-09-12 22:27 UTC).
// The k above were re-fitted against the current (boundary-6) model by qb-inseason-refit. A frozen prior
// captured earlier is refused (§3.4). BUMP in the same commit as any change that moves
// projectedPPG/projectedGames; priorModelFrom.test.js reds until you do.
export const PRIOR_MODEL_FROM = '2026-10-06'

// 2c dynasty-side (in-season-evidence-2c-wiring §1b/§3.5). Arm-A k: the 2c verdict's pooled YE1 arm-A fit
// (q1.subgroups.YE1.pooled.A.kFit), pinned by the constants files' rule Math.round(k*2)/2;
// re-derived from the panel fixture by inSeasonConstants.test.js — the one K_* family pinned from a panel,
// not a constants file. Pooled across positions (rung 0); an own-position rung is pinned from a data
// constants file when one exists (D-56).
export const IN_SEASON_DYN_PANEL_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-09-27-inseason-dyn-panel.json',
  commit: '5c4b6c79c9a881a2a445841b9f2b196135378733',
  fixture: 'src/__fixtures__/inseason-dyn-panel-2026-09-27.json',
}
export const K_DYN_PROSPECT_A_YE1 = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
// Starting point of the prospect score by yearsExp and position — the two-season check (§1b): only a clear
// S+2 loss keeps the position baseline (second-year WRs); every other cell starts from the market-neutral
// rookie projection.
export const PROSPECT_PRIOR_KIND = {
  0: { QB: 'projection', RB: 'projection', WR: 'projection', TE: 'projection' },
  1: { QB: 'projection', RB: 'projection', WR: 'position',   TE: 'projection' },
}
