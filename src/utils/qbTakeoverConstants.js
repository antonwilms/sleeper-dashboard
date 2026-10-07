// QB takeover model constants (P6b) — pinned from sleeper-dashboard-data @ c3f16f8 (P6a).
// Pure, no imports. Never hand-edit a coefficient: re-run `node bin/backtest.mjs --qb-takeover --write`
// in the data repo and re-pin by byte copy of the fixture (CR-27). The provenance oracle is
// src/__fixtures__/qb-takeover-constants-2026-10-03.json; qbTakeoverConstants.test.js re-derives
// every coefficient below from its pattern tables.

export const QB_TAKEOVER_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-10-03-qb-takeover-constants.json',
  commit: 'c3f16f82351151b9dd019781c5ea6e07bcdb1b9a',
  generatedAt: '2026-10-03T20:19:11.236Z',
  fixture: 'src/__fixtures__/qb-takeover-constants-2026-10-03.json',
}

// Categorical level lists — the code of a level is its index.
export const QB_LEVELS = {
  dg: ['udfa', 'day3', 'day2', 'r1', 'top12'],
  rk: ['vet', 'rookie'],
  ps: ['first', 're'],
  iq: ['mid', 'weak', 'strong', 'unknown'],
  bn: ['b0', 'b1', 'b2'],
  wk: ['early', 'mid', 'late'],
  dp: ['d2', 'd1', 'd3'],
  wp: ['mid', 'losing', 'winning'],
  og: ['no', 'yes'],
  st: ['s1', 's2', 's3'],
  dg3: ['late', 'day2', 'r1'],
  dq: ['mid', 'weak', 'strong', 'unknown'],
}

export const QB_HAZARD = {
  features: ['dp', 'og', 'rk', 'iq'],
  coef: {
    intercept: -2.8804,
    'dp=d1': 1.1438,
    'dp=d3': -1.2045,
    'og=yes': 0.5135,
    'rk=rookie': 0.515,
    'iq=weak': 0.6519,
    'iq=strong': -0.3787,
    'iq=unknown': 0.1323,
  },
}

export const QB_STICK = {
  features: ['st'],
  coef: {
    intercept: 0.7877,
    'st=s2': 0.2005,
    'st=s3': 0.9821,
  },
}

export const QB_DEFS = {
  incK: 3, priorMinGames: 4, obsMinGamesNoPrior: 2, weakCut: 0.85, strongCut: 1.10,
  bnCap: 8, streakCap: 4,
}

// PROVISIONAL(heuristic): rookie-QB sat-longer prospect discount · data Q5 replication on the app's definition insufficient (13 < 20 rookies; the thin sample leaned against a discount: full-sample d 1.09, d 1.0 BEATS 0.90), kept by decision 2026-10-07 (data grading/2026-10-07-inseason-dyn-verdict.md @ d9dc742) · re-run --inseason --dynasty Q5 once the flagged sample reaches the 20-player floor (D-60)
export const QB_SAT_LONGER_DISCOUNT = 0.90
// Not in the pinned constants file (it has no q5 key): mirrors data lib/qbTakeover.mjs QB_TAKEOVER_DEFAULTS.q5.band @ c3f16f8 (:43), the band Q5 classified with
export const QB_SAT_LONGER_BAND = 1          // residual < −1 → sat longer
