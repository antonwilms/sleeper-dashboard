# In-season evidence — 2c wiring: evidence (Session 1 measurements, 2026-09-28)

Companion to `in-season-evidence-2c-wiring.md` (not an implementation spec). Section numbers match the task
file's references (§1, §1b, §2).

## 1. Evidence — cap placement (decision 4)

The panel JSON never computes a posterior from a *capped* prior, so Session 1 ran it read-only on the panel's
rows (data `1ca95d4`, `onRows` hook, fixed `k2a`, 2a's clustered bootstrap): Q1 cap rows (`draftTier !== 'premium'`,
all YE1 per D5), 12,527 rows / 844 players, target `modelScore(nextPPG, peak)`.

| slice | rows | MAE cap-after | MAE cap-before | Δ before − after | Δ no-cap − before |
|---|---|---|---|---|---|
| pooled | 12527 | 41.36 | 25.11 | **BEATS −16.25 [−18.03, −14.44]** | BEATS −3.27 [−4.52, −2.01] |
| YE0 | 4944 | 37.58 | 28.15 | BEATS −9.43 [−11.30, −7.54] | BEATS −3.74 [−5.92, −1.62] |
| YE1 | 7583 | 43.82 | 23.13 | BEATS −20.69 [−23.04, −18.31] | BEATS −2.97 [−4.34, −1.58] |
| n 1–4 | 5916 | 39.77 | 29.28 | BEATS −10.49 [−12.03, −8.95] | BEATS −4.71 [−6.48, −2.97] |
| n 5–8 | 4480 | 42.04 | 22.64 | BEATS −19.40 [−21.57, −17.23] | BEATS −2.33 [−3.43, −1.19] |
| n 9–40 | 2131 | 44.33 | 18.74 | BEATS −25.59 [−28.34, −22.78] | BEATS −1.27 [−2.24, −0.26] |

**Cap-before BEATS cap-after in every slice.**
- Caveat: the rows are survivors only, which favours looser caps.
- Caveat: the cap population is an upper bound, because KTC is unknown historically.
- The last column (no cap at all beats cap-before) is a finding for Anton, not an action (§10).
- The permanent record is backlog D-54.

Reproduction: cap rows as above; `after = min(modelScore(blend(projPrior, obsPPG, n, k2a), peak), 35)`,
`before = modelScore(blend(min(projPrior, 0.35·max(peak,1)), obsPPG, n, k2a), peak)`, `pairedDelta(rows, after, before)`.
Backfilled as a committed artifact by D-54.

## 1b. Evidence — the two-season check (amendment 2)

The same read-only machinery. The S+2 outcome is 2a's own `nextPPG2`: the season-S+2 PPG with gp ≥ 6,
S ≤ 2023. It is joined by `(sleeperId, S, W)` through `runInSeasonDyn`'s `assemble` test seam, which wraps
`assembleSeason`.
- Arms: A = `prospectPrior` (the position baseline, as today). B = `projPrior` (the KTC- and college-neutral
  rookie projection — exactly what §0.1 ships).
- Metric: MAE in PPG against the S+2 outcome, paired. Δ = B − A with the clustered bootstrap, so BEATS means
  the projection is better.
- "Prior" compares the starting points alone.
- "Updated" adds the in-season update: B at the 2a k, A at the 2c pooled arm-A k (2.4 / 3.6). A's k was
  fitted on S+1, which favours A.
- Population: the 2c Q1 rows that have an S+2 outcome. These are 10,526 rows, 614 players and 957
  player-seasons. Rows must also have an S+1 outcome, because `onRows` passes only those — a second
  survivorship filter.

| position | player-seasons (YE0+YE1) | MAE prior A → B | Δ prior (B − A) | MAE updated A → B | Δ updated (B − A) |
|---|---|---|---|---|---|
| **ALL** | 957 | 3.663 → 3.427 | **BEATS −0.236 [−0.428, −0.030]** | 3.064 → 3.071 | NO-GAIN +0.007 [−0.073, 0.091] |
| QB | 53 | 5.274 → 4.727 | NO-GAIN −0.547 [−1.394, 0.282] | 4.202 → 4.200 | NO-GAIN −0.002 [−0.390, 0.391] |
| RB | 308 | 4.177 → 3.800 | NO-GAIN −0.377 [−0.783, 0.019] | 3.501 → 3.434 | NO-GAIN −0.067 [−0.230, 0.088] |
| **WR** | 371 | 3.430 → 3.533 | NO-GAIN **+0.103** [−0.208, 0.408] | 2.980 → 3.092 | NO-GAIN **+0.112** [−0.016, 0.240] |
| TE | 225 | 2.922 → 2.375 | **BEATS −0.547 [−0.848, −0.241]** | 2.295 → 2.227 | NO-GAIN −0.068 [−0.192, 0.056] |

By subgroup (prior only):
- **WR:** YE0 −0.310 [−0.744, 0.142] NO-GAIN; **YE1 +0.548 [0.245, 0.851] WORSE**.
- RB: YE0 −0.732 BEATS; YE1 −0.007 NO-GAIN.
- TE: YE0 −0.906 BEATS; YE1 −0.206 NO-GAIN.
- QB: both NO-GAIN, point estimates favouring B. QB has only 30 players.

At S+1, the committed 2c panel already had WR's ΔAB at NO-GAIN for both subgroups, and WR YE1's prior-only
MAE favoured A (3.15 vs 3.30).

**Decision (Anton, revision 3): only a clear difference moves a cell.** The only WORSE cell is second-year
WRs (+0.548 [0.245, 0.851]), so **WR YE1 keeps the position-baseline start**. Every other position ×
subgroup cell is NO-GAIN or BEATS: first-year WRs (−0.310, NO-GAIN, point favouring the projection), QB, RB
and TE all switch. This matches the NO-GAIN rule used everywhere else. Permanent record: backlog D-55.

---

## 2. Expected one-time rookie reshuffle (this league, re-measured 2026-09-28 after revision 3)

Measured in the running app (Colts_420_Reloaded / Dynasty 040). Recomputing today's formula reproduced every
YE0/YE1 score exactly. `computeNextSeasonProjection` on App's own memo args reproduced every rookie
`projectedPPG` exactly. The neutral prior is that call with `ktcMap: null, collegeStats: null`, and §5.1's
trimmed `projectionArgs` give byte-identical priors to the full argument set (0 of 341 differ). The league
had 341 YE0/YE1 prospects (145 rostered) at this measurement; the earlier run's 342/146 came before today's
roster data changed.

| population | n | median \|move\| | p75 | p90 | largest | direction |
|---|---|---|---|---|---|---|
| all YE0/YE1 prospects, prior swap only (n = 0) | 341 | 0 | 5 | 12 | 26 | 136 down · 12 up · 193 unchanged |
| rostered in the league, prior swap only | 145 | 3 | 10 | 17 | 26 | 82 down · 10 up · 53 unchanged; 40 move ≥ 10 |
| rostered, excluding second-year WRs (who cannot move at n = 0) | 118 | 5 | 12 | 19 | 26 | median signed −4 |
| rostered, with live games applied (today) | 145 | 6 | 12 | 17 | 26 | — |

- By position, rostered (median |move|, median signed, largest): QB 4, −4, 14. RB 7, −7, 26.
  WR YE0 (35 players) 2, −2, 21. TE 7, −4, 24. WR YE1: 0 at n = 0.
- **Down:** J'Mari Taylor RB 52→26, Michael Trigg TE 41→17, Raheim Sanders RB 65→42, Jack Endries TE 54→32,
  CJ Daniels WR 51→30, Jacory Croskey-Merritt RB 83→63. First-year WRs: Dohnte Meyers 35→16, Malik Benson
  62→43, Deion Burks 57→39, Cyrus Allen 74→57, Colbie Young 56→39.
- **Up:** Cam Ward QB 65→79, Kaleb Johnson RB 61→72, Elijah Arroyo TE 63→74, Terrance Ferguson TE 81→90,
  Jalen Milroe QB 43→52.
- Mostly down: most rostered rookies are KTC-valued above their position's median, so dropping the KTC
  multiplier from the prior lowers their start. The 60% anchor still carries the market.
- Anton's own (High Horses), n = 0 score (with today's games in brackets):
  - Mendoza 86→86; Watkins (WR YE1) 42→42; Hawes TE 35→35 (22)
  - Singleton 76→66 (63); Washington 81→72 (68); McGowan 65→45 (48)
  - Coleman (WR YE0) 69→54 (48)
