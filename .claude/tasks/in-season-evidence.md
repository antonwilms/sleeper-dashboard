# In-season evidence on the dynasty side — parent

**This file is the index and the decision record. It is not a Session 2 task file** — the slice
files listed in §Slice map are. Read this one first, then only the slice being implemented.

The body below (from "Mechanism exploration" to the end of "Phasing") is the design doc as Anton
handed it to Claude Code on 2026-09-25, **verbatim**. It is the authority for *what* and *why*.
Everything after it is Session 1's addition.

---

## Mechanism exploration (verbatim, 2026-09-22)

Status: **decided — sequenced, Phase 1 handed to Claude Code 2026-09-25.** Written 2026-09-22.
Decision taken: **the current season counts on the dynasty side** (Anton). This doc
works out how, grounded in a measured study over the repo's own data.

### Why

Breakouts, injuries and role changes move dynasty value immediately, and big
waiver-wire opportunities appear mid-season. Today the dynasty engine is walled
off from the live season: projections and dynasty scores are built from completed
seasons only (`deriveDataSeason`, `currentSeasonTotalsIsolation.test.js`).

The market (KTC) already reacts to breakouts within days. The edge available here
is to detect **opportunity shifts** — a backup inheriting a role — faster and more
reliably than leaguemates reading box scores.

### Measured study (2012–2025 nflverse gamelogs, half-PPR)

Question: after a player's first *n* games of a season, how much weight should
this season get versus last season? Fitted the optimal weight `w` on the
first-n-games mean, expressed as `k` = last season's worth in games
(`w = n / (n + k)`). Population: skill players with ≥ 8 games the prior season.

#### Rest of season (weekly horizon)

| Signal | QB | RB | WR | TE |
|---|---|---|---|---|
| Points per game — k | ~6 | ~3 | ~4.5 | ~5.5 |
| Opportunities per game — k | ~5 | **~2** | **~2.5** | **~2.5** |
| Target share — k | — | — | **~2.3** | **~2** |

#### Next season (dynasty horizon)

| Signal | QB | RB | WR | TE |
|---|---|---|---|---|
| Points per game — k | ~7.5 | ~4.5 | ~6.5 | ~6.5 |
| Opportunities per game — k | ~5.5 | ~3.5 | ~4.5 | ~4 |

#### Prior strength (rest of season, points)

| Prior | RB | WR | TE |
|---|---|---|---|
| Weak (below-median prior volume) — k | ~3 | ~3.5 | ~4 |
| Strong (above-median) — k | ~3 | ~5 | ~6 |

#### Findings

1. **The current season should take over fast.** For rest of season, last year is
   worth 3–6 games; by week 4–6 this season is the majority of the estimate.
2. **Opportunity moves first.** Volume and target share stabilise roughly twice as
   fast as points (k ≈ 2 vs 4–6). A role change is readable after 2–3 games; a
   points spike alone is not. This is the breakout / injury-replacement detector.
3. **Dynasty value should move slower than weekly value, but not much slower.** For
   next-season value, k is ~1.5–2 games higher. After 8 games this season is still
   already the majority weight for next year's value.
4. **Weak priors update faster** (WR/TE). A low-volume player who breaks out is
   re-rated faster than an established starter having a hot or cold stretch — the
   waiver-wire pathway. RB shows no difference; RB value is role-driven either way.

#### Limitations — stated, not hidden

- Prior used is raw last-season average, not the app's full projection. The real
  projection is a better prior, so true k is probably somewhat higher.
- Requires ≥ 8 prior-season games and enough current-season games: **season-ending
  injuries and rookies are excluded by construction.** The study says nothing about
  how an injury should move value, and rookie k is extrapolated, not measured.
- Averages of per-game target share (not team-summed); acceptable for a stability
  comparison, not for production math.
- The study is not reproduced in-repo. Phase 2 reproduces it as a graded backtest
  through the real pipeline and re-fits k before any constant moves a score.

### Proposed mechanism

**An in-season update layer on top of the existing engine — not a change inside it.**

- **Prior**: the pre-season projection and dynasty inputs, frozen. Unchanged
  pipeline, unchanged calibration, unchanged graded artefact.
- **Posterior**: `(prior × k + observed × n) / (k + n)`, with:
  - **opportunity-first** — volume / share evidence uses the small k; points
    evidence uses the larger k;
  - **horizon-specific k** — one set for rest-of-season, one for dynasty value;
  - **k scaled by prior confidence** — weaker priors (low prior volume, low
    projection confidence) update faster;
  - **n counts played games only** — a missed game is not evidence about talent.
- **Injuries (v1)**: no penalty from missed games; injury status surfaced, not
  modelled. The actionable side of an injury — the teammate who inherits the role
  — is captured automatically by that teammate's opportunity evidence. An explicit
  injury-severity model is deferred until it can be measured.
- **Data source**: `nfl/season-totals/<live>.json` — already read by the app, all
  players, has games, points, carries, targets, snaps. No new data source.

### What it touches

- **Scoring-affecting.** Dynasty scores and projections change everywhere they
  render (Market, My Team, trade surfaces).
- **The isolation contract is deliberately changed** (Phase 2).
  `currentSeasonTotalsIsolation.test.js` exists to forbid exactly this; it must be
  rewritten as a controlled seam, not deleted.
- **Grading — cross-repo.** Daily snapshots capture every player's `projection`
  (verified: `snapshots/2026-09-22.json` → `players[id].projection.projectedPPG`),
  and snapshots are permanent (data Invariant 5). A posterior leaking into
  `projection` would contaminate the 2026 grading run irreversibly. Snapshots must
  record prior and posterior separately; the prior is graded against the full
  season as today, the posterior only against the rest of the season after
  capture. Two-repo change (snapshot envelope + `scripts/grade-snapshot.mjs`).
- **CR-15 mirror (R3-FIT) untouched** *if* the layer sits after the pipeline — a
  second reason to layer rather than modify.

### Phasing — decided: sequenced

Anton preferred straight to scoring, and accepted sequencing on the reasoning
below.

**The hard constraint:** scoring must not switch on before the snapshot/grading
change lands. Snapshots are permanent; every day scoring runs ahead of that change
writes a contaminated 2026 projection that can never be removed. So "straight to
scoring" is not actually faster — the two-repo grading change gates it either way.
Phase 1 uses that unavoidable wait productively.

1. **Phase 1 — build the layer, view-only.** Posterior computed and shown beside
   the current value in Market. The layer is built once here; Phase 2 does not
   rebuild it. Nothing enters `seasonProjections` / `playerRows`, so snapshots are
   untouched.
2. **In parallel — plan the snapshot/grading change** (two-repo, parent-folder
   session). Additive posterior field; grading scores it rest-of-season only.
3. **Phase 2 — switch scoring on**, in the same cycle as (or after) the snapshot
   change, **never before**. Includes the in-repo graded backtest that re-fits k
   and the rewrite of the isolation test into a seam.

---

## Slice map (Session 1, 2026-09-25)

| Slice | File | State |
|---|---|---|
| Phase 1 — layer + Market view | `.claude/tasks/in-season-evidence-1-view.md` | planned 2026-09-25 |
| Phase 2 — scoring on, **including the app-side snapshot change** | not yet planned | after Phase 1 |
| Rest-of-season grading of the posterior | not yet planned — ordinary data-repo task | after Phase 2 |

## Phase 2 — decided shape (Anton, 2026-09-25, amendment 5)

This supersedes the design doc's step 2 ("in parallel — plan the snapshot/grading change,
two-repo, parent-folder session"). **No parent-folder session.**

- **The app-side snapshot change ships inside Phase 2's own slice**, not as a separate
  prerequisite: the prior stays in each player's `projection` (exactly what grading reads today),
  and the posterior goes into a **new additive per-player field** beside it. Because both land in
  the same change that switches scoring on, there is never a day on which a posterior is written
  into `projection` — the design doc's hard constraint is met by construction.
- **No data-side change is needed for capture.** Verified 2026-09-25 against the data repo:
  `scripts/register-snapshots.mjs:64-65` checks only `schemaVersion` (a number) and `capturedAt`;
  the capture commit gate `lib/snapshot-capture.mjs` `evaluateSnapshotRecord` checks
  `schemaVersion ≥ 3`, `inputStatus` and a player-count floor — envelope-level only; and
  `scripts/grade-snapshot.mjs:177` reads `player.projection`, which keeps the prior. Round 2 also
  checked CR-01's other data-side readers: `lib/grade.mjs` scores an adapted list built from
  `player.projection` by named fields; `bin/import-snapshot.mjs` and `scripts/panel-run.mjs` do not
  walk per-player keys. An additive per-player field passes every one of them untouched.
- **Rest-of-season grading of the posterior is a later, ordinary data-repo task** — nothing gates
  Phase 2 on it.
- **Still owed inside Phase 2 (planning note, not a new decision):** the snapshot shape is a CR-01
  contract, so Phase 2's task file emits CR-01's Mirror and the app applies the registry edit first,
  data syncs — the standing two-session route. Phase 2 also decides whether the additive field
  bumps the snapshot `schemaVersion` (`register-snapshots.mjs`'s skip fingerprint is
  `recordCount + schemaVersion`).

## Findings from Phase 1 planning that Phase 2 must carry

Recorded here, not in the Phase 1 file, because they change Phase 2's design, not Phase 1's.

1. **The prior is not strictly frozen today.** `projectedPPG` is built from completed seasons, but
   two of its inputs are live Sleeper fields that move in-season: the Step 8 `depthFactor`
   (`seasonProjection.js:852-864`, from `depth_chart_order` via `App.jsx:226`'s `depthMap`) and the
   team-change factors. A depth-chart promotion therefore already moves the prior. When Phase 2
   feeds opportunity evidence into scoring, the same role change enters twice — once via
   `depthFactor`, once via the opportunity posterior. Phase 2 must decide whether to freeze the
   prior at a captured date or to accept and measure the double count in its backtest.
2. **There is no projected-volume prior.** The projection outputs points (`projectedPPG`) and games
   (`projectedGames`), never opportunities. Phase 1's opportunity posterior therefore uses the
   study's own prior — raw last-season opportunities per game — while its points posterior uses the
   projection. The two posteriors rest on different kinds of prior; Phase 2's backtest has to fit
   them that way or build a volume prior.
3. **Phase 1 labels the prior "Current proj", not "pre-season"** (amendment 3) — finding 1 is why.
4. **Phase 1 does not combine opportunity and points evidence into one number.** The study measured
   a separate k per signal and nothing about how to combine them. "Opportunity-first" is therefore
   shown as its own column, not folded into the points posterior. A combined estimate is Phase 2
   work and needs the backtest behind it.
5. **Projection-confidence scaling of k is not in Phase 1.** Only the prior-volume split was
   measured (rest-of-season, points, RB/WR/TE). Scaling by the projection's `confidence` field has
   no measurement behind it.
6. **Scoring basis.** Served season-totals carry `scoringBasis: "half_ppr"` on every row of 2025 and
   2026 (measured 2026-09-25), matching the study's basis. A careerStats season built by the
   live-API fallback uses league scoring and has no `scoringBasis` field. Phase 1 refuses to blend
   across a mismatch (see the slice file §2.4); Phase 2 inherits that rule.
   **Limits of that guard** (round 2): a careerStats season is all data-store or all live-API
   (`sleeperStats.js:170-222`), so it catches the real case, a live-API season. But `projectedPPG`
   averages several seasons (`seasonProjection.js:585-593`) and only `dataSeason` is checked; and a
   rookie's `proj` is not built from careerStats at all (`rookieProjection`, `:317`; constants fitted
   on half-PPR, `:50`), so for rookies the check only confirms the store's basis.

---

## Phase 1 review records

### Round 1 — plan gate, 2026-09-25 (`in-season-evidence-1-view.md`)

plan-reviewer, one round, 12 flags. Each was checked against live source before it was applied;
all 12 held. Anton delegates review calls (standing preference), so Session 1 decided.

| # | Flag | Decision |
|---|---|---|
| 1 | (high) the blend coerces a `null` observed value to 0 when `n > 0` | **Applied** — §2.4 null rule, ordered; §6.1 test 11 |
| 2 | CR-02 fires: the medians are a cross-row reader; `maxGames` scanned DEF/`TEAM_*` rows | **Applied** — `maxGames` now over results only; §5.1a adds CR-02 edits + verbatim Mirror; §6.1 tests 3 and 13 |
| 3 | the `scoringBasis`/`gamesPlayed` obligation lived only in the task file and backlog | **Applied** — one sentence appended to CR-21's Invariant (§5.1) |
| 4 | CR-01 Market anchors are stale and omit the new `projectedPPG` reader | **Recorded, not fixed** — pre-existing drift, and Phase 2 rewrites CR-01; carried in D-42's note (§5.3) |
| 5 | §6.3 test 2 cannot pass on the base fixtures (stop at 2024, no `scoringBasis`) | **Applied** — dedicated In-season fixture specified |
| 6 | §6.3 test 7 half cannot fail (`Season` selector) and `G` collides | **Applied** — asserts `Yds/G`/`FP/G` absent |
| 7 | nothing proves the builder leaves shared inputs unmodified | **Applied** — §6.1 test 12 (frozen inputs) |
| 8 | three Market anchors off | **Applied** — `:844`, `:912`, `:846-852` |
| 9 | "the app's one definition" overclaims; `blendWeights.js` header goes stale | **Applied** — wording corrected in §1/§2.4; header-comment-only edit added to §4 and §8 |
| 10 | test 11 (source-text re-derivation check) brittle and redundant | **Applied** — dropped; §6.2 item 4 keeps the import assertion |
| 11 | signal-registry row lacks `scoringBasis`; its "FP recomputed weekly" note does not match this reader | **Applied** — §5.2 adds the field and says the stored half-PPR value is read |
| 12 | smoke expectation wrong for QB | **Applied** — §7 wording |

**Route note** (for a later reviewer): the registry edits in §5 use the two-session route (app
applies, data syncs), not a parent-folder session. That is Anton's standing decision while the
parent folder has no CLAUDE.md and review gate — not an oversight.

### Amendment 1 — Anton's review of the plan, 2026-09-25

| # | Anton's instruction | Where applied |
|---|---|---|
| 1 | Include rookies and <8-game players: weak-prior k + an "extrapolated" marker; "new role" instead of a shift against ~0, with an explicit baseline definition and boundary tests | Slice §2.1 (`MIN_BASELINE_GAMES 4`, `MIN_BASELINE_OPP 2.0`, both inclusive; k rules), §2.3 (`seasonBasis` for rookies), §2.4 (`extrapolated`/`hasBaseline`/`newRole`/`oppShiftSort`), §3.5 markers, §6.1 tests 5–5c |
| 2 | Hide the dynasty-horizon column; keep computing and testing it | §2.4 table, §3.1, §3.5, §6.3 test 2 |
| 3 | Relabel the prior "current projection" — it moves via Step 8 | §3.5 header `Current proj` + tooltip; finding 3 above |
| 4 | State the half-PPR basis on the tab like the FPA caveat | §3.6 — the exact `Teams.jsx:72` string |
| 5 | Snapshot change inside Phase 2; no data-side capture change; grading later; no parent-folder session | *Phase 2 — decided shape* above (claims verified against the data repo) |

Session 1 calls inside amendment 1, flagged for Anton: (a) **QB has no measured weak-prior k**, so
extrapolated QBs use the flat QB k (6), still marked **ext**; (b) the baseline thresholds (4 games,
2.0 opp/g) are Session 1 judgment, tagged `PROVISIONAL(heuristic)`; (c) sorting by Opp shift ranks a
new-role row as a shift from a prior of 0, shrunk by the same weight a real shift gets (round 2
fixed an unshrunk version that let new roles outrank real shifts early in the season) — for
ordering only, never rendered; (d) a no-baseline player below 2.0 opp/g this season gets `—`, not
"new role".

### Round 2 — plan gate on amendment 1, 2026-09-25

8 flags, all verified, all applied: Opp shift cell branches on `oppShift != null`; `seasonBasis`
takes the same skill-position filter so the CR-02 text is true; rule 3 restated as a mismatch
guard with its limits; new-role sort key shrunk onto the shift scale; data-side claim extended to
every CR-01 reader (checked in the data repo by Session 1 — the reviewer may not read it);
`K_ROS_POINTS` fallback wording; bare `—` for a null extrapolated ROS; test fixes (exact 2.0
boundary, uniform-basis fixture, a 1.9 opp/g fixture that integer counts can produce). Per the
workflow there is no third automatic round.
