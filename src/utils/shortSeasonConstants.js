// Short-season games rule (L6c → short-season-wiring). Pinned by byte copy from the data repo — never hand-edit.
// Derivation: SHORT_SEASON_K[state][pos] = cells['pos|s'][`${pos}|${state}`] ?? cells.pos[pos], read from
// fixture.candidates.SOf0.k (src/__fixtures__/games-short-constants-2026-10-10.json; re-derived by
// shortSeasonConstants.test.js). Mirrored on the data side by lib/durabilityMirror.mjs rule 'l6c' (CR-28).
export const SHORT_SEASON_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-10-10-games-short-constants.json',
  commit: '4fa76897d39b36c5fda685de128725d6fc10797a',
  candidate: 'SOf0',
}
// k on the pre-round games value when the last completed season is short (row, gp < 8) or none (no row).
export const SHORT_SEASON_K = {
  short: { QB: 0.50, RB: 0.51, WR: 0.52, TE: 0.53 },
  none:  { QB: 0.50, RB: 0.50, WR: 0.50, TE: 0.55 },
}
