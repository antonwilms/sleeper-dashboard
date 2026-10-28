// Pinned in-season k — Phase 2b (in-season-evidence-2b-1-constants-snapshot.md).
// Source: sleeper-dashboard-data backtests/2026-10-07-inseason-constants.json @ f2c3b83 (re-fitted on the
// boundary-6 model by qb-inseason-refit), copied byte-for-byte to src/__fixtures__/inseason-constants-2026-10-07.json; every K_* below
// (the K_DYN_PROSPECT_A_* family re-derives from the dynasty constants fixture — see its own comment)
// is re-derived from that fixture by src/__tests__/inSeasonConstants.test.js. Never hand-edit a K_*:
// re-run the data backtest and re-pin (CR-25).
// WARNING (verdict § "Prior optimism"): these k partly compensate for the projection's known optimism
// (prior scale c ≈ 0.80–0.86 across positions — the prior sits high, so evidence earns extra weight).
// They MUST be re-fitted if that optimism is ever corrected. A calibrated prior and its k change together.
// Basis: fitted on the half-PPR panel; k is dimensionless and applied to league-basis values. The league-basis
// re-fit (D-46, sleeper-dashboard-data grading/2026-10-16-league-basis-verdict.md) did not beat it out of sample,
// so the half-PPR pins stand.

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
// the current projection model (join-defects-id-crosswalk, an app-side join correction — the first capture after
// the app push; before it absence-role (D-76), a served-data correction — the first capture after the
// coordinated push; before it rookie-total-wiring, the rookie total-points factor — the day after the app commit;
// before it short-season-wiring, the short-season games rule — the day after the app push;
// before it P12b, the rookie QB starter level — the day after the app push; before it
// P6b's QB start share, 2026-10-05, and before that 7b5b055, Step 4 up-side removal, 2026-09-12 22:27 UTC).
// The k above were re-fitted against the current (boundary-6) model by qb-inseason-refit. A frozen prior
// captured earlier is refused (§3.4). BUMP in the same commit as any change that moves
// projectedPPG/projectedGames/rookie projectedTotalPts; priorModelFrom.test.js reds until you do.
// Captures record it as the envelope's `projectionModelFrom` (D-50); the frozen-prior gate compares that
// marker, and the capture date only for unmarked captures. It is the model identity, so a bump must move it
// strictly later than its current value (the day after the push, or the next unused date) — two model
// changes pushed the same day must not share a value.
export const PRIOR_MODEL_FROM = '2026-10-28'

// D-50: the first UTC capture date that can carry the envelope's `projectionModelFrom` (= PRIOR_MODEL_FROM at
// capture). A candidate dated before both this and PRIOR_MODEL_FROM is refused before fetch (it cannot carry
// a marker); any later candidate is fetched and its marker decides — equal to PRIOR_MODEL_FROM passes, any
// other value is refused, absent falls back to the date rule. Safe in both directions: set too early, an
// unmarked capture is fetched once and refused by date; set too late, a marked capture is refused by date
// (today's behaviour).
export const MODEL_MARKER_FROM = '2026-10-12'

// 2c dynasty-side (in-season-evidence-2c-wiring §1b/§3.5).
// Arm-A k: `K_DYN_PROSPECT_A_YE1` from the dynasty constants file (research-arms-w3 D-56(a): the pre-registered
// ladder [YE1 pooled, own position] keeps every position on the pooled rung, kFit 3.6 → 3.5), re-derived from that
// file's fixture by inSeasonConstants.test.js like every other K_*. Earlier pins came from the 2c panel
// (`q1.subgroups.YE1.pooled.A.kFit`), same value.
// Basis: fitted on the half-PPR panel; the league-basis re-fit (D-46, sleeper-dashboard-data
// grading/2026-10-16-league-basis-verdict.md) did not beat it out of sample, so the half-PPR pin stands.
export const IN_SEASON_DYN_CONSTANTS_SOURCE = { file: 'sleeper-dashboard-data backtests/2026-10-11-inseason-dyn-constants.json', commit: '037047811eae63a522b23de69cb9dcbc8bc2cc4d', generatedAt: '2026-10-11T23:42:13.720Z', fixture: 'src/__fixtures__/inseason-dyn-constants-2026-10-11.json' }
export const K_DYN_PROSPECT_A_YE1 = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
// Starting point of the prospect score by yearsExp and position — the two-season check (§1b): only a clear
// S+2 loss keeps the position baseline (second-year WRs); every other cell starts from the market-neutral
// rookie projection. Equals the committed re-run's `prospectPriorKind.kind` (D-55).
export const PROSPECT_PRIOR_KIND = {
  0: { QB: 'projection', RB: 'projection', WR: 'projection', TE: 'projection' },
  1: { QB: 'projection', RB: 'projection', WR: 'position',   TE: 'projection' },
}
