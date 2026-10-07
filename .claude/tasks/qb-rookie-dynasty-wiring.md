# L4 wiring (W0) · re-pin the 2c panel to the starter-QB run, registry text, D-60/D-64 — `qb-rookie-dynasty-wiring`

**Plan item:** `future_plans/in-season-notes-plan.md` → "Sign-off 2026-10-07 16:20 local — L4 research" and the decision
line under it. Research: data `.claude/tasks/qb-rookie-dynasty-research.md` (+ `-registry.md` companion), verdict
`grading/2026-10-07-inseason-dyn-verdict.md` → "For wiring". **Session type:** parent-folder (app + data). **Session 1:**
2026-10-07, opus. **Bases:** app `8f4420e`, data `cc67908` (both clean, `main...origin/main`; registry spans
byte-identical by the anchored `sed` diff).

**Nothing moves a score.** The app's only non-comment change is the `IN_SEASON_DYN_PANEL_SOURCE` provenance object (a
string record — no `K_*` value changes) and its fixture. No change to `projectedPPG`, dynasty scores, `PRIOR_MODEL_FROM`,
any `K_*`, `QB_SAT_LONGER_*` values, or `grading/anchor-policy.md`. **If any step would change one of those, stop and
report.**

Flow: **B1** (app, one commit) → **B2** (app, backlog SHA fill) → **C1** (data registry byte copy, one commit) → Session 1
verifies → Anton signs off → push **data first, then app** (Anton's order).

---

## 0. Fixed decisions (Anton, 2026-10-07 — not reopened)

1. **D-64:** the 2c dynasty weights re-run on the current QB model are unchanged. No constant changes.
2. **P12c (Q4) → keep.** The rookie QB level in the dynasty prior stays as shipped. Registry text only.
3. **D-60 (Q5) → keep 0.90** under the pre-set rule (Q5a `insufficient`: 13 players vs the 20-player floor). Keep the
   `PROVISIONAL(heuristic)` tag at every derivation site, re-cited to the verdict, noting the thin evidence leaned
   against a discount (full-sample fit 1.09; d = 1.0 BEATS 0.90), to be revisited at the floor. **Value unchanged.**
   (The Cowork recommendation to set 1.0 was declined by Anton.)

---

## 1. Facts established in planning (read-only, Session 1)

- **F1 — the data research is already pushed.** The prompt's "push 02642a0..ad07e20 too" is stale: the push rebased onto
  cron `94e3a7a`, so the pushed SHAs are A1 `580921a`, **A2 `d9dc742`**, gate record `1057f96`, verification `cc67908`
  (`main...origin/main`, nothing ahead). The research task file still names the pre-rebase SHAs; this slice cites the
  pushed ones. The only data push left is C1.
- **F2 — the new panel.** `backtests/2026-10-07-inseason-dyn-panel.json` @ `d9dc74242625a849fdbd86896f25aef35eecd6ba`,
  58,645 bytes, sha1 `63783660f91883c5c2e6556e805bd71ac25dae7a` (`git show d9dc742:…` and the working tree agree).
  `q1.subgroups.YE1.pooled.A.kFit` = **3.6** in both the old (2026-09-27) and new panel → `Math.round(3.6*2)/2` = 3.5,
  so `K_DYN_PROSPECT_A_YE1` re-derives unchanged. `meta.qbPrior` = `starter`. The panel carries `d64`/`q4`/`q5`, which
  are aggregate-only (research V-5: zero sleeper-id matches in them).
- **F3 — the app's only reader of the panel fixture** is `src/__tests__/inSeasonConstants.test.js:154-171` (sha1,
  `fixture` path, `commit` prefix, the arm-A re-derivation). `IN_SEASON_DYN_PANEL_SOURCE` (`src/utils/inSeasonConstants.js:42-46`)
  is read by no runtime code. The L3 precedent (`911e6fa`) renamed the constants fixture in place (old file removed).
- **F4 — the 0.90 derivation sites** (all three carry the same old basis "Q5 report-only (n=15, confounded), D1 · a
  data-side Q5 replication on the app's definition (D-60)"): `src/utils/qbTakeoverConstants.js:58` (the constant),
  `src/utils/inSeasonScoring.js:355` (the multiply in `buildProspectLevel`), `src/utils/inSeasonScoring.js:509` (the band
  test in `buildQbLiveStates`). No test reads their text. No render site shows the discount as a label, so there is no
  render-site tag to change.
- **F5 — registry.** The companion's §M Mirror texts still match the live registry (app `8f4420e` = HEAD). Two edits the
  companion did not draft are needed: **CR-25 App side** names the fixture path `inseason-dyn-panel-2026-09-27.json`
  (re-pin), and **CR-25 Data side** gains `satLongerAggregates` (Stage A deviation accepted for this list) and
  `pinnedSourceOf`. The companion's CR-08 Data-side clause named `gameType`/`homeTeam`/`awayTeam` against
  `scripts/inseason-dyn-run.mjs`, where the data repo's symbol guard (`test/registry.test.mjs`) cannot resolve them —
  reworded (§3). Session 1 dry-ran all edits on scratch copies: **14 changed physical lines** (app lines 105, 108, 113,
  116, 117, 161, 165, 169, 271, 272, 276, 288, 291, 292), no sentinel literal, and the data symbol guard passes (28
  entries, 424 claims, 0 failures) on the edited span spliced into the data file.
- **F6 — Q4's companion §B "New" backlog item** fires only on `keep-not-qb-specific`; the decision is `keep` (no candidate
  was eligible on MAE, so the gate never decided). The all-position survivorship finding is recorded instead as L7 (§2.6).
- **F7 — signal registry (CR-18 check).** No served signal and no consumer changes; the dynasty-score row
  (`docs/signal-registry.md:112`) and the QB live start chain row (`:97`) stay true. No edit.
- **F8 — docs naming the old fixture:** `docs/nav/utils.md:47` ("that family, from `inseason-dyn-panel-2026-09-27.json`")
  and `docs/navigation.md:57` (the `__fixtures__/` row). No other doc names it.

---

## 2. Stage B1 — app (one commit)

All paths relative to `sleeper-dashboard/`. Run `npm test` first and record the pass count.

**Before any edit — capture the "before" read for §4 V-6** (the running app at `8f4420e`).

### 2.1 Fixture (byte copy, never hand-edited)

```bash
git rm -q src/__fixtures__/inseason-dyn-panel-2026-09-27.json
git -C ../sleeper-dashboard-data show d9dc742:backtests/2026-10-07-inseason-dyn-panel.json > src/__fixtures__/inseason-dyn-panel-2026-10-07.json
shasum -a 1 src/__fixtures__/inseason-dyn-panel-2026-10-07.json   # must print 63783660f91883c5c2e6556e805bd71ac25dae7a
```

### 2.2 `src/utils/inSeasonConstants.js`

- `IN_SEASON_DYN_PANEL_SOURCE` (`:42-46`) becomes:
  ```js
  export const IN_SEASON_DYN_PANEL_SOURCE = {
    file: 'sleeper-dashboard-data backtests/2026-10-07-inseason-dyn-panel.json',
    commit: 'd9dc74242625a849fdbd86896f25aef35eecd6ba',
    fixture: 'src/__fixtures__/inseason-dyn-panel-2026-10-07.json',
  }
  ```
- In the comment block above it (`:36-41`), after its last line `:41` ("…constants file when one exists (D-56).",
  directly above `export const IN_SEASON_DYN_PANEL_SOURCE`) insert one line:
  `// Re-pinned by qb-rookie-dynasty-wiring to the 2c re-run on the starter QB prior (D-64; kFit 3.6 as before → 3.5).`
- `K_DYN_PROSPECT_A_YE1` and every other value: **unchanged**.

### 2.3 `src/__tests__/inSeasonConstants.test.js` (`:154-165`)

- Comment `:155-156`: "a byte copy of the data file at 5c4b6c7" → "a byte copy of the data file at d9dc742 (the
  2026-10-07 re-run on the starter QB prior; first pinned at 5c4b6c7)".
- `PANEL_PATH` → `'src/__fixtures__/inseason-dyn-panel-2026-10-07.json'`.
- Test name → `'the panel fixture is the byte-identical copy of the data file at d9dc742'`.
- sha1 expectation → `'63783660f91883c5c2e6556e805bd71ac25dae7a'`; commit prefix → `startsWith('d9dc742')`.
- The `K_DYN_PROSPECT_A_YE1` and `PROSPECT_PRIOR_KIND` tests: **unchanged** (they must pass as-is against the new
  fixture — that is the proof nothing moved).

### 2.4 PROVISIONAL re-citations (comments only — the value lines must not change)

Replace each whole comment line (one line each, CLAUDE.md format `<what> · <why> · <what would make it real>`):

- `src/utils/qbTakeoverConstants.js:58` and `src/utils/inSeasonScoring.js:355` (identical text):
  ```js
  // PROVISIONAL(heuristic): rookie-QB sat-longer prospect discount · data Q5 replication on the app's definition insufficient (13 < 20 rookies; the thin sample leaned against a discount: full-sample d 1.09, d 1.0 BEATS 0.90), kept by decision 2026-10-07 (data grading/2026-10-07-inseason-dyn-verdict.md @ d9dc742) · re-run --inseason --dynasty Q5 once the flagged sample reaches the 20-player floor (D-60)
  ```
  (`inSeasonScoring.js:355` keeps its existing indentation.)
- `src/utils/inSeasonScoring.js:509`:
  ```js
  // PROVISIONAL(heuristic): sat-longer flag from a fixed games band · not fitted; the data Q5 replication on this definition was insufficient (13 < 20 rookies, verdict 2026-10-07 @ d9dc742) · re-run Q5 once the flagged sample reaches the 20-player floor (D-60)
  ```

Do not touch `qbTakeoverConstants.js:60` (the band's own mirror comment) or any non-comment line.

### 2.5 Docs (app)

- `docs/nav/utils.md:47`: `inseason-dyn-panel-2026-09-27.json` → `inseason-dyn-panel-2026-10-07.json`.
- `docs/navigation.md:57`: same replacement (one occurrence).

### 2.6 Backlog (`.claude/tasks/data-repo-backlog.md`) — in place, matching the D-59/D-63 style

- **D-64** (`:960`): heading becomes `### ~~D-64 · Re-fit the 2c dynasty k on the current QB priors~~`; insert directly
  under the heading:
  `**✅ RESOLVED 2026-10-07** — qb-rookie-dynasty-research: data A1 \`580921a\`, A2 \`d9dc742\` (pushed 2026-10-07, range \`94e3a7a..cc67908\`; pre-rebase \`02642a0\`/\`804e58a\`). Re-run on the starter QB prior with the 2026-10-07 2a k (\`DYN_2A_PIN\`): no 2c constant, reuse or decision moved (\`diffDynConstants\` equal; only six Q2 report leaves, e.g. pooled ΔHP mean −0.085 → −0.0833, still NO-GAIN); the \`K_DYN_POINTS_ROOKIE0\` reuse holds. App panel pin re-pointed to that run by qb-rookie-dynasty-wiring (app ⟨B1⟩).`
  Leave the original body below it untouched.
- **D-60** (`:928`): not struck (still open). Insert directly under the heading:
  `**Status 2026-10-07: kept at 0.90 by decision (Anton, 2026-10-07); revisit at the 20-player floor.** Replicated by qb-rookie-dynasty-research (data A2 \`d9dc742\`): 89 preseason-backup rookie QBs (week-1 chart, 2014–2024), 31 ever flagged, 13 flagged with an S+1 PPG → Q5a \`insufficient\` (floor 20); the thin sample leaned against a discount (full-sample d 1.09; d 1.0 BEATS 0.90, MAE 5.79 vs 6.33). Q5b (year-2 persistence) \`insufficient\` (6 players). The \`PROVISIONAL(heuristic)\` tags were re-cited by qb-rookie-dynasty-wiring (app ⟨B1⟩). Re-run \`node bin/backtest.mjs --inseason --dynasty --write\` when the flagged-with-S+1 sample reaches 20 players.`
- **D-65** (new, appended after D-64's body at the end of the file):
  ```markdown
  ### D-65 · All-position rookie survivorship gap in the dynasty prior (L7, offseason research)
  **Found:** qb-rookie-dynasty-research Q4d (data `d9dc742`) · **Found by:** app qb-rookie-dynasty-wiring · **Blocking:** no · **Size:** medium — offseason, research first

  Record only — not planned. Rookies who keep playing outscore their dynasty arm-B prior at every position (Σ S+1 PPG ÷ Σ prior, YE0 survivors: QB 1.124, RB 1.135, WR 1.089, TE 1.053; QB vs the rest diff 0.023, CI [−0.092, 0.143], so not QB-specific). Same direction as 2c's prior scale c 1.16–1.32. Partly survivorship (busts have no S+1 outcome). Whether it should change rookie vs veteran dynasty value needs research across all positions (plan item L7, `future_plans/in-season-notes-plan.md` sign-off 2026-10-07 16:20). A fix re-fits every rookie k (CR-25).
  ```
- Do **not** edit `future_plans/in-season-notes-plan.md` (its L7 line already exists; D-65 points at it).

### 2.7 Registry (`docs/cross-repo-registry.md`) — 14 physical lines, inside the sentinels

Apply with a scratch script (not committed) that, for each `[line, entry, field, old, new]` below, asserts the line at
app `8f4420e` starts with `- **<field>:**`, that `old` occurs **exactly once** on it, and replaces it (use a replacer
function, not a replacement string — some `new` strings contain `$`-free text but keep the habit). Edits sharing a line
apply in order. Then assert the anchored `sed` span diff vs `8f4420e` shows exactly 14 changed lines and none outside
the span.

```js
const EDITS = [
  [105, 'CR-08', 'Data side',
    "is built in `lib/qbRookieLevel.mjs` from `gameType`/`homeTeam`/`awayTeam`/`week` (CR-27)",
    "is built in `lib/qbRookieLevel.mjs` from `gameType`/`homeTeam`/`awayTeam`/`week` (CR-27); and `scripts/inseason-dyn-run.mjs` (`coverageFor`, CR-25: the sat-longer replication's coverage stop; its team-game index reuses `makeScheduleIndex`)"],
  [108, 'CR-08', 'Triggers',
    "`scripts/qb-rookie-level-run.mjs`, `lib/nflverse.mjs` `parseSchedulesCsv`",
    "`scripts/qb-rookie-level-run.mjs`, `scripts/inseason-dyn-run.mjs` (the CR-25 sat-longer coverage read), `lib/nflverse.mjs` `parseSchedulesCsv`"],
  [113, 'CR-09', 'Data side',
    "to find each rookie QB's primary-passer games (CR-27)",
    "to find each rookie QB's primary-passer games (CR-27); read offline (analysis only) by `scripts/inseason-dyn-run.mjs` through the same `primaryPassers` call and fields, behind the same ≥ 99% per-season coverage stop, to count each preseason-backup rookie QB's starts for the sat-longer replication (Q5, CR-25/CR-27)"],
  [116, 'CR-09', 'Triggers',
    "`scripts/qb-rookie-level-run.mjs` (the CR-27 rookie starter-level read)",
    "`scripts/qb-rookie-level-run.mjs` (the CR-27 rookie starter-level read), `scripts/inseason-dyn-run.mjs` (the CR-25 sat-longer read)"],
  [117, 'CR-09', 'Mirror',
    "and its points come from season-totals `weeklyPoints`. 2019 was backfilled",
    "and its points come from season-totals `weeklyPoints`. A fifth, `scripts/inseason-dyn-run.mjs` (CR-25, qb-rookie-dynasty-research), reuses that identification unchanged, behind the same coverage stop, to count a preseason-backup rookie QB's starts at each checkpoint (the app's sat-longer residual). It emits only aggregates and fitted values — counts, MAE, labels, the fitted discount — never per-player, per-rookie-season or per-fold values; any mean, MAE or ratio over fewer than three players is suppressed. Its points come from season-totals. 2019 was backfilled"],
  [161, 'CR-15', 'Data side',
    "while `scripts/inseason-dyn-run.mjs` holds the legacy QB prior",
    "and `scripts/inseason-dyn-run.mjs` uses the same starter prior (qb-rookie-dynasty-research; `legacy` kept for re-running 2026-09-27)"],
  [161, 'CR-15', 'Data side',
    "imports `reconstructAgeCurves` for the prospect-score peak normaliser",
    "imports `reconstructAgeCurves` for the prospect-score peak normaliser and, for Q4/Q5, calls `reconstructQbPreseasonShares` on the week-1 chart and `rookiePriorFor` for QB/RB/WR/TE rookies"],
  [165, 'CR-15', 'Mirror',
    "and the 2c k are unaffected (CR-25).",
    "and the 2c k are unaffected (CR-25). Since qb-rookie-dynasty-research `--inseason --dynasty` also runs on the starter QB prior, so a change to the QB start share or the rookie QB level re-runs it too."],
  [169, 'CR-16', 'Data side',
    "for the in-season QB prior and Q9 (CR-25), behind the same 0.99 `coverageFor` stop;",
    "for the in-season QB prior and Q9 (CR-25), behind the same 0.99 `coverageFor` stop; `scripts/inseason-dyn-run.mjs`'s sat-longer rows (Q5) join the same era-coded primaries to the week-1 depth chart's team and its schedule weeks (CR-25), behind the same 0.99 `coverageFor` stop;"],
  [271, 'CR-25', 'App side',
    "via the fixture `src/__fixtures__/inseason-dyn-panel-2026-09-27.json`)",
    "via the fixture `src/__fixtures__/inseason-dyn-panel-2026-10-07.json`)"],
  [272, 'CR-25', 'Data side',
    "`ladderPick`, `PROSPECT_MIRROR`)",
    "`ladderPick`, `PROSPECT_MIRROR`, `QB_DYN_RESEARCH`, `satLongerAt`, `fitDiscount`, `discountLoso`, `calibrateGroup`, `fullCalibration`, `ratioDiffBootstrap`, `decideQ4`, `decideQ5a`, `decideQ5b`, `satLongerAggregates`, `diffDynConstants`)"],
  [272, 'CR-25', 'Data side',
    "`scripts/inseason-dyn-run.mjs` (`runInSeasonDyn`, `inSeasonDynMain`, `writeInSeasonDynArtifacts`)",
    "`scripts/inseason-dyn-run.mjs` (`runInSeasonDyn`, `inSeasonDynMain`, `writeInSeasonDynArtifacts`, `DYN_2A_PIN`, `pinnedSourceOf`)"],
  [276, 'CR-25', 'Mirror',
    "(d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows.",
    "(d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90; the 2c rookie k were fitted on undiscounted rows, and Q5 measured the discount on the app's definition (too few rookies to fit — 0.90 kept)."],
  [276, 'CR-25', 'Mirror',
    "`--inseason --dynasty` reuses `assembleSeason` with the legacy QB prior, so the 2c dynasty k stay fitted on legacy QB priors (data backlog D-64).",
    "Since qb-rookie-dynasty-research `--inseason --dynasty` runs on the starter QB prior with the k of `backtests/2026-10-07-inseason-constants.json` (each QB prior is paired with the 2a file fitted under it, `DYN_2A_PIN`); re-run on it, no 2c constant, decision or reuse moved (`backtests/2026-10-07-inseason-dyn-constants.json` @ `d9dc742`), and the app's panel pin names that run. The same run measured two QB questions on held-out next-season PPG. Rookie QB level in the dynasty prior (Q4): the arm-B prior stays the rookie-path level — no draft-group level beat it, and survivors outscore the prior at every position, not only QB. Sat-longer discount (Q5, the app's own definition on the week-1 chart): too few rookies to fit (n = 13 < 20), so 0.90 stays an app heuristic. A change to the app's sat-longer rule or band re-runs Q5."],
  [288, 'CR-27', 'Data side',
    "and `primaryPassers` in `lib/qbTakeover.mjs` also decides the in-season QB prior and Q9 there",
    "and `primaryPassers` in `lib/qbTakeover.mjs` also decides the in-season QB prior and Q9 there; `scripts/inseason-dyn-run.mjs` reads `backtests/2026-10-04-qb-rookie-level-constants.json` (`starterPPG`) as Q4's GS arm, and mirrors `QB_SAT_LONGER_BAND`/`QB_SAT_LONGER_DISCOUNT` in `lib/inSeasonEvidence.mjs` `QB_DYN_RESEARCH`"],
  [291, 'CR-27', 'Triggers',
    "`loadQbTakeoverConstants` in `scripts/inseason-run.mjs`; `test/qb-mirror.test.mjs`",
    "`loadQbTakeoverConstants` in `scripts/inseason-run.mjs`; `test/qb-mirror.test.mjs`; `QB_DYN_RESEARCH` in `lib/inSeasonEvidence.mjs`"],
  [292, 'CR-27', 'Mirror',
    "`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted.",
    "`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL): the data-side replication on the app's definition (`--inseason --dynasty` Q5) found too few rookies to fit (13 < 20). A change to either constant, or to the sat-longer residual's definition, re-runs Q5."],
];
```

### 2.8 Gates before committing B1 (done-definition)

- `npm test` (count unchanged vs before — no test added or removed; the panel test's assertions change value only),
  `npm run lint` 0 problems, `npm run build` clean.
- Contract tests untouched and green: `git diff --stat` shows no change to `src/__tests__/factorsSchema.test.js` or
  `src/__tests__/statKeysContract.test.js` (and `seasonProjection.js` is untouched, so neither needs a re-run beyond the
  suite).
- **No-value-change check:** `git diff -U0 -- 'src/**/*.js' ':!src/__tests__'` shows, outside comment lines, only the
  three string values of `IN_SEASON_DYN_PANEL_SOURCE`. Record the command and the count of non-comment `+` lines (3).
- `grep -rn "PROVISIONAL(" src/` inventory pasted into the hand-back (three re-cited lines expected among it).
- Smoke (§4 V-6).
- Commit B1 with this task file: `qb-rookie-dynasty-wiring B1: re-pin the 2c panel to the starter-QB run (data d9dc742); D-60 kept at 0.90 re-cited; registry CR-08/09/15/16/25/27; D-64 struck, D-65 added`.

## 3. Stage B2 — app backlog SHA fill (one commit)

Replace the two `⟨B1⟩` placeholders in D-64 and D-60 with B1's short SHA. Commit: `Backlog: fill qb-rookie-dynasty-wiring B1 SHA in D-60/D-64`.

## 4. Stage C1 — data registry byte copy (one commit, same session)

In `../sleeper-dashboard-data`:
1. Replace the sentinel span of `cross-repo-registry.md` with the app's span byte for byte (anchored `sed` extraction of
   the app file, spliced between the data file's own lines outside the span). Assert the data diff is exactly **14
   changed lines**, all inside the span, and the anchored `sed` diff vs the app file is empty.
2. Append to `.claude/tasks/qb-rookie-dynasty-research-registry.md` a section `## Applied (wiring, 2026-10-07)`: "§A.1–A.4,
   A.6, A.7 applied by app qb-rookie-dynasty-wiring (B1 ⟨sha⟩) with the decision text filled (Q4 keep; Q5 insufficient,
   n = 13 < 20; A2 = `d9dc742`); also CR-25 App side (fixture path) and Data side (`satLongerAggregates`, `pinnedSourceOf`);
   the CR-08 Data-side clause names `coverageFor` only (the field names do not resolve in `scripts/inseason-dyn-run.mjs`
   for `test/registry.test.mjs`). §A.5 did not fire. §B: D-64 struck, D-60 kept at 0.90; the §B 'New' item did not fire
   (Q4 = keep), the all-position gap is app backlog D-65 (L7). Data byte copy C1."
3. Gates: `npm test` green (record count; unchanged), `node --test test/registry.test.mjs`,
   `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` (both green). No CLAUDE.md edit.
4. Commit: `qb-rookie-dynasty-wiring C1: registry byte copy of the app span (CR-08/09/15/16/25/27), companion applied note`.

## 5. Verification gates (Session 2 records results; Session 1 re-runs)

- **V-1** app suite/lint/build clean; counts before/after recorded.
- **V-2** fixture sha1 `63783660…` and the `K_DYN_PROSPECT_A_YE1` re-derivation test green on the new fixture.
- **V-3** no-value-change diff check (§2.8): exactly 3 non-comment `+` lines in `src/` non-test JS.
- **V-4** registry: app span diff vs `8f4420e` = 14 lines at the listed line numbers; data C1 diff 14 lines; anchored
  `sed` diff app ↔ data empty; data `registry.test.mjs` and `REGISTRY_MIRROR=1 registry-mirror.test.mjs` green; data
  `npm test` green.
- **V-5** `grep -rn "Q5 report-only (n=15" src/` returns nothing; the three new tags present.
- **V-6 — Mendoza before/after.** Run the app per `docs/architecture.md` → *Smoke-testing the running app*
  (`Colts_420_Reloaded`, Dynasty 040). Before any edit (at `8f4420e`) and again after B1, open Fernando Mendoza's player
  pop-up and record his **dynasty score** and **ROS** value exactly as displayed (and the same two for one second-year WR,
  which exercises `K_DYN_PROSPECT_A_YE1`). Do both reads in one sitting, minutes apart, same browser tab reloaded. They
  must be identical; any difference → stop and report (record both reads, and whether the console's loader lines show a
  data-store refresh in between, so Session 1 can tell a live-data change from a code change). Note the console has no
  new errors.

## 6. Push (after Anton's sign-off — not before)

`git pull --rebase origin main` in each repo first, never `--force`. **Data first** (C1), then app (B1, B2) — Anton's
order. **Expect one red CR-24 run:** data `.github/workflows/registry-mirror.yml` also triggers on `push` to `main`
when `cross-repo-registry.md` changes (`:24-30`), so the C1 push starts a mirror run against app `main` before B1 is
there, and it fails. Push the app straight after, then re-run the check with
`gh workflow run registry-mirror.yml -R antonwilms/sleeper-dashboard-data` and confirm it goes green (cron-deadman reads the
latest run, so do not leave the red one as the latest). Keep both pushes before the 06:41 UTC daily run. Nothing served
changes: no CDN purge.

---

## Cross-repo impact

Touched registry entries: **CR-08, CR-09, CR-15, CR-16, CR-25, CR-27** — 14 physical lines, exact text in §2.7, applied
app first (B1) and byte-copied to the data repo (C1) in this one parent-folder session. Mirror text after the change:

- **CR-09 Mirror** — gains, before "2019 was backfilled": "A fifth, `scripts/inseason-dyn-run.mjs` (CR-25,
  qb-rookie-dynasty-research), reuses that identification unchanged, behind the same coverage stop, to count a
  preseason-backup rookie QB's starts at each checkpoint (the app's sat-longer residual). It emits only aggregates and
  fitted values — counts, MAE, labels, the fitted discount — never per-player, per-rookie-season or per-fold values; any
  mean, MAE or ratio over fewer than three players is suppressed. Its points come from season-totals."
- **CR-15 Mirror** — appended: "Since qb-rookie-dynasty-research `--inseason --dynasty` also runs on the starter QB
  prior, so a change to the QB start share or the rookie QB level re-runs it too."
- **CR-25 Mirror** — item (d) becomes "(d) a rookie QB whose starts trail the preseason chain by more than one game has
  his prospect prior × 0.90; the 2c rookie k were fitted on undiscounted rows, and Q5 measured the discount on the app's
  definition (too few rookies to fit — 0.90 kept)."; the closing D-64 sentence becomes the "Since
  qb-rookie-dynasty-research `--inseason --dynasty` runs on the starter QB prior …" text of §2.7 (D-64 resolved at
  `d9dc742`; Q4 keep; Q5 n = 13 < 20, 0.90 stays an app heuristic; a change to the sat-longer rule or band re-runs Q5).
- **CR-27 Mirror** — "`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted." becomes "`QB_SAT_LONGER_*` are app
  heuristics (PROVISIONAL): the data-side replication on the app's definition (`--inseason --dynasty` Q5) found too few
  rookies to fit (13 < 20). A change to either constant, or to the sat-longer residual's definition, re-runs Q5."
- CR-08 and CR-16 change Data side / Triggers only; their Mirrors are unchanged.

No new CR entry. No served shape, signal-registry row (F7) or anchor-policy boundary changes. Data backlog: none owed
by this slice (the data sync is C1, in the same session).

## Out of scope

`projectedPPG`, dynasty scores, any `K_*` or `QB_SAT_LONGER_*` value, `PRIOR_MODEL_FROM`, anchor-policy boundaries; the
all-position survivorship gap (D-65 / L7, record only); Q5b `extend` design (did not fire); KTC/college in the dynasty
prior; D-54/D-55/D-56; L6.

## Review record

**Plan gate 2026-10-07** — app plan-reviewer, run as a general-purpose opus agent with the mandate of
`.claude/agents/plan-reviewer.md` inlined (targeted data-repo reads allowed for this parent-folder plan). It independently
re-applied all 17 edits of §2.7 (14 lines, each `old` unique on its line), re-ran the data symbol guard on the edited span
(28 entries, 424 claims, 0 failures), confirmed the fixture SHA/sha1/kFit, every verdict figure in D-60/D-64/D-65, the
backlog anchors, and that no other live reference to the old fixture or the old PROVISIONAL basis exists; no
`[registry-stale]`. Two flags, both verified against live source and applied:
1. *ordering* — the data registry-mirror workflow also runs on `push` (`registry-mirror.yml:24-30`), so data-first
   guarantees one red run. §6 now expects it and re-dispatches the check after the app push.
2. *mechanical* — §2.2's insert anchor sat mid-sentence (`inSeasonConstants.js:39`); now "after `:41`".

## Gate results (Session 2, 2026-10-07)

Commits: app B1 `cfb3a76`, B2 (this commit); data C1 `787cf17`. Nothing pushed.

- **V-1** app `npm test` 2853 passed / 144 files before and after (no test added or removed); `npm run lint` 0 problems; `npm run build` clean (only the existing chunk-size notice). Data `npm test` 1388 tests / 1384 pass / 0 fail (4 skipped) before and after.
- **V-2** fixture sha1 `63783660f91883c5c2e6556e805bd71ac25dae7a` (byte copy via `git show d9dc742:…`); the unchanged `K_DYN_PROSPECT_A_YE1` re-derivation test passes on the new fixture.
- **V-3** `git diff HEAD -U0 -- 'src/**/*.js' ':!src/__tests__'` (pre-commit): non-comment `+` lines = 3 (the three `IN_SEASON_DYN_PANEL_SOURCE` strings); every other changed line is a comment. `factorsSchema.test.js` and `statKeysContract.test.js` untouched.
- **V-4** app registry diff vs `8f4420e`: 14 lines at 105, 108, 113, 116-117, 161, 165, 169, 271-272, 276, 288, 291-292. Data C1 diff 14 lines (97, 100, 105, 108-109, 153, 157, 161, 263-264, 268, 280, 283-284 in the data file's own numbering); anchored `sed` span diff app vs data empty. Data `registry.test.mjs` 2/2, `REGISTRY_MIRROR=1 registry-mirror.test.mjs` 21/21 (0 skipped).
- **V-5** `grep -rn "Q5 report-only (n=15" src/` empty; the three new tags present at `qbTakeoverConstants.js:58`, `inSeasonScoring.js:355`, `inSeasonScoring.js:509` (inventory: 30 lines).
- **V-6** Mendoza and Egbuka (second-year WR), same tab. Dynasty score and market value identical across every read: Mendoza 85 / 5,345; Egbuka 94 / 5,253. The first "before" read caught the page before the in-season data loaded (Market banner "No in-progress season data is loaded"; pop-up showed PROJECTED 2.7 for Mendoza, 11.8 for Egbuka, ROS column "—"); after B1 and a reload the in-season data was loaded (ROS 1.4 for Mendoza, 9.4 for Egbuka, pop-up "REST OF SEASON"). To separate load timing from code, `src/utils` was stashed back to `8f4420e`, the tab reloaded and given time to load: it showed the identical loaded values (Mendoza ROS 1.4, Egbuka ROS 9.4), then the stash was restored. So before/after at equal load state are identical; the first read differed only by load state. No console errors.
