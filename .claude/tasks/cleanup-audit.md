# Tech-Debt / Cleanup Audit — Maintainability Pass

_Date: 2026-06-12 | Read-only assessment | No source files edited._
_Lens: maintainability only — dead code, lint, drift risk, structural hygiene. Logic/correctness findings live in `backend-audit.md` / `backend-audit-deep.md` and are NOT re-reported here._
_Baseline: `npm run lint` → **40 errors + 1 warning**. Suite green; no TODO/FIXME markers anywhere in src; no commented-out code blocks found._

---

## TOP RECOMMENDATIONS

Ranked by value-to-effort. The strategic point of 1–4: get lint to **zero** so it can join the done-definition as a hard gate — at 40 standing errors, error #41 is invisible.

1. **Dead-identifier deletion batch** — ~20 unused imports/vars across App.jsx, utils, and test files; pure deletions, zero behavior change. (C1, C2, C5)
2. **Config + directive fixes** — `allowEmptyCatch` for the 4 idiomatic `catch {}` blocks, `--fix` the stale eslint-disable, delete the duplicate `'ole miss'` key. (C3, C4, C6)
3. **Un-export `dynastyLabelColor`** — zero external consumers; kills the react-refresh error and a stale CLAUDE.md claim in one move. (D1)
4. **Justified per-line disables for the 10 react-hooks compiler-era errors** — the perf instrumentation and load-effect patterns are deliberate; annotate, don't refactor. (C7, C8)
5. **Fix broken `npm run test:ui`** — `@vitest/ui` is not installed; the documented command errors. Add the devDep or delete the script + its docs rows. (H1)
6. **Stale-docs batch** — `computeNextSeasonProjection` signature in docs/projection.md is missing 2 options; factories.js header claims "all 15" of 17 option keys; clampHi fixture comment cites the pre-Option-A envelope. (S1–S3)
7. **Remove the two write-only state slots** (`rawCollegeData`, `nflDraftPicks`) — stored on every load, read by nothing, each costing a render. (D2)
8. **Unit tests for the untested pure matchers** — `ktcMatch`, `collegeMatch`, `collegeMetrics`, `enrichmentLookup` have zero test references; all pure, all cheap to cover; silent-mismatch bugs land here. (T1)
9. **Resolve the `currentSeason` dead option** — accepted and documented but never read; annotate as reserved (deep-audit D2-D needs it) or remove from the surface. (D3)
10. **Cross-reference the two `normalizeName` implementations** — near-duplicates with different suffix/punctuation handling; one comment each prevents accidental "unification" that would shift matching. (DUP1)

---

## FINDINGS — Lint (40 errors + 1 warning, by cluster)

#### C1: Dead imports/vars in production source (13 errors, `no-unused-vars`)

- **What/Where**: App.jsx `useCallback`(:1), `Tooltip`(:2), `ProfileDataContext`(:4), `usePlayerProfile`(:5), `findCareerComps`+`compsProjectedPPG`(:32) — leftovers from the PlayerProfile/usePlayerProfile extractions; App.jsx `rawCollegeData`(:469), `nflDraftPicks`(:527) (see D2); PlayersTab.jsx `i`(:675, unused map index); dynastyScore.js `n`(:558, `weightedLinearRegression` computes `xs.length` then never reads it); exportData.js `PERMANENT_SENTINEL`(:6, see D4); seasonProjection.js `momentum`(:386) and `trajectorySlope`(:461) — destructured but only the sibling fields (`momentumLabel`, `trajectoryNormalized`) are consumed.
- **Why it's debt**: dead identifiers misstate what the code consumes; the App.jsx import ghosts imply dependencies on modules it no longer touches.
- **Cleanup**: delete the identifiers / drop the unused destructure keys. For dynastyScore.js this is a 1-line deletion inside an otherwise-frozen module — safe, but touch nothing else in the function.
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (no value is read anywhere).

#### C2: Dead vars in test files (7 errors, `no-unused-vars`)

- **Where**: nflRoster.test.js:36 `lastModifiedNote`; efficiencyMetrics.test.js:95,112,113 (`playersMap`, `careerStats`); ktcHistory.test.js:58 `series`; projectionSnapshot.test.js:22 `makeKtcMap`; seasonProjection.test.js:43 `defaultPPRScoring`; plus factories.js:163 `team` param on `clampLoCareerStats` — **no caller passes a second argument** (verified all 4 call sites).
- **Cleanup**: delete; for `clampLoCareerStats`, remove the parameter and its `= 'DAL'` default.
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### C3: `no-empty` ×4 — idiomatic empty `catch` (App.jsx :486, :500, :508, :515)

- **What**: `try { localStorage.setItem(...) } catch {}` in the tooltip/comparison persistence helpers. The empty catch is the intended behavior (storage quota/private-mode failures are non-fatal).
- **Cleanup**: config, not code — in eslint.config.js add `rules: { 'no-empty': ['error', { allowEmptyCatch: true }] }`. (The config currently sets no custom rules at all.)
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (config only).

#### C4: `no-useless-assignment` ×2 (ktc.js:88, nflDraftMatch.js:132)

- **What**: `let x = null` immediately followed by an unconditional reassignment-or-break inside `try` — the initializer is never observable.
- **Cleanup**: ktc.js — declare `players` via the `try` result (e.g. assign inside try, reference after a `continue/break` guard); nflDraftMatch.js — same micro-restructure for `matched`. Keep control flow identical; this is initializer removal, not logic change.
- **Effort/risk**: XS / low (verify with existing nflDraftMatch tests; ktc.js has no tests — keep the diff to the declaration line). **Behavior-neutral: yes.**

#### C5: `no-dupe-keys` — duplicate `'ole miss'` (collegeMatch.js:23 and :34)

- **What**: the college-alias map declares `'ole miss': 'mississippi'` twice with **identical values** (verified), so the duplicate is pure dead weight — but the lint error masks the day someone adds a *conflicting* duplicate.
- **Cleanup**: delete line 34.
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (same key, same value).

#### C6: Unused eslint-disable directive (App.jsx:971, the 1 warning)

- **What**: `// eslint-disable-next-line react-hooks/exhaustive-deps` above the boot-time auto-load effect; the v7 hooks plugin no longer reports there, so the directive is dead.
- **Cleanup**: `eslint --fix` removes it (the one auto-fixable problem).
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### C7: `react-hooks/purity` ×6 — `performance.now()` in the perf-instrumented memos (App.jsx :540, :542, :633, :781, :854, :881)

- **What**: the `[perf][memo]` timing logs inside `empiricalCurves`, `playerRows`, and `seasonProjections` memos call `performance.now()`, which the v7 compiler-era rule flags as impure-during-render.
- **Why it's debt**: 6 standing errors that will never be "fixed" — the instrumentation is deliberate diagnostics. Standing errors normalize a red lint run.
- **Cleanup**: per-line `// eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation` (6 lines). Do NOT remove the instrumentation (it's the documented monitoring channel for memo cost) and do NOT disable the rule globally (it's valuable for new code).
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (comments only).

#### C8: `react-hooks/set-state-in-effect` ×4 (App.jsx :956, :977, :1090; PlayersTab.jsx :1775)

- **What**: synchronous `setState` at the top of data-loading/reset effects — boot auto-load, league-change reset cascade, myTeam load start, and PlayersTab's reset-page-on-filter-change.
- **Why it's debt**: same as C7 — permanent red lint. But these are intentional load/reset patterns; "fixing" them properly (derived state, event-handler resets, `key=` remounts) **changes render behavior** and is exactly the kind of App.jsx state rework the invariants guard against.
- **Cleanup**: per-line justified disables with a one-line reason each (e.g. `-- intentional league-switch reset cascade`). The PlayersTab `setPage(1)` case has a clean derived-state alternative if PlayersTab is ever reworked — note it in the disable comment, don't do it now.
- **Effort/risk**: XS / none as specified. **Behavior-neutral: yes (disables only). The "proper" refactor would NOT be — out of scope, flagged here.**

#### C9: `react-refresh/only-export-components` (PlayersTab.jsx:72) → resolved by D1 below.

---

## FINDINGS — Dead code

#### D1: `dynastyLabelColor` is exported with zero external consumers

- **What/Where**: PlayersTab.jsx:72 `export function dynastyLabelColor` — used 4× **inside** PlayersTab.jsx only; repo-wide grep finds no other importer. CLAUDE.md:55 still documents "exports `dynastyLabelColor`".
- **Why it's debt**: the dead `export` is the sole cause of the react-refresh lint error (component file exporting a non-component), and the CLAUDE.md row asserts an API that nothing uses.
- **Cleanup**: drop the `export` keyword; update CLAUDE.md:55 (delete "; exports `dynastyLabelColor`"). If a future consumer needs it, move it to a util then.
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### D2: Write-only state slots `rawCollegeData` and `nflDraftPicks`

- **What/Where**: App.jsx:469 + :1178, and :527 + :1193. Both effects fetch, `set` the raw payload into state, then immediately derive the real product (`collegeMatches` / `nflDraftMatches`). The raw values are never read again — each `set` buys one extra render of the whole app for nothing.
- **Cleanup**: delete both `useState` pairs; keep the fetched payload as a local in the effect (`const data = …; setCollegeMatches(matchCollegeToSleeper(data, …))`). The derived state slots stay.
- **Effort/risk**: XS / low (verify nothing in dev tooling reads them — grep already confirms). **Behavior-neutral: yes** (one fewer no-op render; no output change).

#### D3: `currentSeason` is an accepted, documented, never-read option of `computeNextSeasonProjection`

- **What/Where**: seasonProjection.js:257 (lint: defined but never used); passed by App.jsx, listed in docs/projection.md:5 and the factories.js option table.
- **Why it's debt**: misleading API surface — a reader (or a snapshot consumer) reasonably assumes the projection is anchored to it. It isn't; the pipeline derives season context from `careerStats` keys.
- **Cleanup (choose one, recommend the first)**: (a) keep the option but drop the unused destructure binding, and annotate the docs/factories entries "(currently unused — reserved for staleness capture, deep-audit D2-D)" — D2-D's `seasonsSinceLastQ` capture is the planned consumer; (b) remove it from the destructure, the App.jsx call, docs, and factories entirely. (a) avoids churn when D2-D lands.
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (the value is never read today).

#### D4: `PERMANENT_SENTINEL` dead const (exportData.js:6)

- **What**: `999999 * 60 * 1000` computed and never used; the permanent-TTL handling in the same file works off a comment + different logic (:41). Likely a leftover from an earlier expiry check.
- **Cleanup**: delete the line. The explanatory comment at :41 stays (that one is load-bearing).
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

_Sweep notes: no unused module exports beyond D1 (the only zero-consumer export, `buildProjectionSnapshot`, is the documented pure-builder test seam — used internally + 15 test refs); no unreachable branches surfaced by lint; no commented-out code blocks._

---

## FINDINGS — Stale comments / docs

(The previously-flagged stale spots — projectionSignals.js header, `computeQBQualityByTeam` header, the Step-8/9 numbering — were verified **already fixed** by the shipped batches. The following are the survivors.)

#### S1: docs/projection.md:5 — `computeNextSeasonProjection` signature is missing two options

- **What**: the signature line ends at `nflDraftMatches = null` — `historicalTeamTotals = null` (D3 team-RZ share) and `priorTeamByPlayer = null` (team-change detection) were added to the real signature but never to this line.
- **Cleanup**: append both options; while there, apply the D3 annotation for `currentSeason`.
- **Effort/risk**: XS / none. **Behavior-neutral: yes** (docs).

#### S2: factories.js:27 — "Option keys (all 15 accepted…)" is two behind

- **What**: the option-key table in the factories header documents 15 keys; the function accepts 17 (`historicalTeamTotals`, `priorTeamByPlayer` missing from the list too).
- **Cleanup**: update the count and add the two missing rows (shapes: `{ [season]: { [team]: totals } }` and `{ [player_id]: team }`).
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### S3: factories.js:118-120 — `clampHiCareerStats` doc cites the retired envelope

- **What**: "drive every positive combinedNewFactor signal above the **[0.78, 1.30]** clamp's upper bound" — the envelope has been [0.67, 1.50] since the Option-A restructure. The tests that *intentionally* reference old bounds do so as named regression cases; this fixture header just states a stale fact.
- **Cleanup**: reword to "above the OLD [0.78, 1.30] envelope's upper bound (pre-Option-A); under the current [0.67, 1.50] rail this fixture lands inside the rail unless D2 usage stats are stacked (see the 'new upper rail' test)".
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### S4: CLAUDE.md:55 — PlayersTab "exports `dynastyLabelColor`" → covered by D1.

---

## FINDINGS — Duplication (non-deliberate only)

#### DUP1: Two divergent `normalizeName` implementations

- **What/Where**: ktcMatch.js:45 (private) vs collegeMatch.js:9 (exported; also consumed by nflDraftMatch.js). They are **not identical**: different suffix handling (regex `\b(jr|sr|ii|iii|iv|v)\b\.?` vs a SUFFIXES-set filter), different punctuation classes (periods), and only one has a null guard.
- **Why it's debt**: the names are identical and the bodies are 90% similar — a future session will "deduplicate" them and silently shift KTC or draft matching at the edges (suffix names, punctuated names). There is no comment in either file acknowledging the other.
- **Cleanup**: comment-only — one line in each: "NOTE: ktcMatch.js/collegeMatch.js each carry their own normalizeName; they differ in suffix/punctuation handling and are NOT interchangeable — do not unify without match-rate regression tests." Actual unification would be behavior-touching and needs its own tested task.
- **Effort/risk**: XS / none (comments). **Behavior-neutral: yes as specified; unification would NOT be — flagged, not proposed.**

#### DUP2: Skill-position sets re-declared per module

- **What/Where**: `SKILL_POSITIONS` (dynastyScore.js), `SKILL` (seasonProjection.js), inline `['QB','RB','WR','TE']` literals in App.jsx (3×), PlayersTab `POSITION_ORDER`, computePositionalRanks' inline list.
- **Why it's (mild) debt**: 6+ declarations of the same 4-element fact.
- **Cleanup**: honestly — leave it. A shared constants module would touch two frozen files and App.jsx to remove ~5 lines of trivially-correct duplication. Only consolidate opportunistically if a real change touches those lines anyway. Recorded so the next audit doesn't re-derive it.
- **Effort/risk**: not recommended. **Behavior-neutral: would be, but not worth the frozen-module churn.**

_(The 6× private `clamp()` one-liner is classified deliberate — see Confirmed NOT debt.)_

---

## FINDINGS — Test seams / coverage gaps

#### T1: Four pure modules with zero test references

- **What/Where** (verified zero `*.test.js` mentions): `ktcMatch.matchKTCToSleeper` (name+position/team fuzzy matching), `collegeMatch.normalizeName/normalizeCollege/matchCollegeToSleeper` (the file with the dupe-key map), `collegeMetrics.computeCollegeMetrics/getConferenceMultiplier` (dominator/breakout-age math; the deep audit's D1-E/D1-F live here, gated — but *tests* aren't gated), `enrichmentLookup` (4 null-safe lookups).
- **Why it's debt**: these are exactly the modules whose failure mode is *silent data loss* (a player simply doesn't match) — the class of bug no UI symptom reveals. They're already pure; no extraction needed, just fixtures.
- **Cleanup**: co-located unit tests per module — matcher happy-path + suffix/punctuation edge + miss case; `getConferenceMultiplier` known/unknown labels; `enrichmentLookup` null-safety sweep. Order by blast radius: collegeMatch ≥ ktcMatch > collegeMetrics > enrichmentLookup. (nflDraftMatch already has tests to crib the fixture style from.)
- **Effort/risk**: S per module / none. **Behavior-neutral: yes** (tests only).

#### T2: Eleven presentational components defined inside App.jsx

- **What/Where**: App.jsx:58-443 + :1382-1448 — `AppHeader`, `StandingsTable`, `ScheduleGrid`, `SlotBadge`, `RostersTab`, `Sparkline`, `PlayerCard`, `MyTeamView`, `CareerLoadProgressBar`, `ClearCacheButton`, `ExportDataButton` — ~400 lines of a ~1450-line file.
- **Why it's debt**: every edit to any of them invalidates fast-refresh for the whole app file; none are unit-testable; App.jsx reads as state + pipeline + UI soup. The components/ directory and the props-only pattern already exist for exactly this (CLAUDE.md → Component data access).
- **Cleanup**: mechanical move into `src/components/` (props-only, no state moves — the invariant is about *state*, not JSX). Highest-value single move: `MyTeamView` (real logic: projection merge, dual-mode sort, roster total). Requires CLAUDE.md navigation-map + docs/architecture.md updates in the same change.
- **Effort/risk**: M (mostly mechanical, large diff) / low. **Behavior-neutral: yes** (pure relocation). Optional — do it per-component, MyTeamView first, or skip entirely.

#### T3: `playerRows` memo inline derivations (trend label, sparkline, ownerMap)

- **What/Where**: App.jsx ~:638-710 — the 'up'/'down'/'flat' trend classifier, `careerSparkline` padding, owner-map build.
- **Why it's debt**: same shape as the pre-extraction `relevance.js`/`applyQBQualityModifier` logic — pure row derivations living untested in the memo.
- **Cleanup**: only if T2/other App.jsx work happens anyway; on its own the trend/sparkline logic is small and stable. Lower priority than T1.
- **Effort/risk**: S / low. **Behavior-neutral: yes** (extraction + tests).

---

## FINDINGS — Dependency & import hygiene

#### H1: `npm run test:ui` is broken — `@vitest/ui` not installed

- **What**: the script runs `vitest --ui`, which requires the separate `@vitest/ui` package; `node_modules/@vitest/` contains no `ui`. The command is documented in CLAUDE.md → Commands and README.
- **Cleanup**: either `npm i -D @vitest/ui` (pin compatible with vitest ^2.1.9) or delete the script and its two doc rows. Recommend installing — the docs already promise it.
- **Effort/risk**: XS / none. **Behavior-neutral: yes.**

#### H2: Import graph — clean (verified)

All util-layer edges verified acyclic: `seasonProjection → dynastyScore → {teamContext, momentum, regressionSignals, ageCurve, projectionSignals → {ageCurve, durabilitySignals}}`; `projectionSnapshot → {teamContext, dynastyScore, cache}`; `nflDraftMatch → collegeMatch`; `ktcHistory → {ktcMatch, cache, dataStore}`. The ageCurve extraction note in CLAUDE.md still matches reality. **No finding.**

#### H3: Runtime deps all used; `@types/react`/`@types/react-dom` in a no-TS repo

- `idb`, `jszip`, `react`, `react-dom` all imported. The two `@types` devDeps serve editor IntelliSense only — harmless, conventional for Vite templates; leave them. **No action.**

---

## Confirmed NOT debt (deliberate — leave alone)

- **`buildProjectionSnapshot` exported with no src consumer** — it's the documented pure-builder test seam (15 test refs, called internally by `writeProjectionSnapshot`). The pattern, not an accident.
- **6× private `clamp()` one-liners** (seasonProjection, dynastyScore, compsIntegration, efficiencyMetrics, usageMetrics, teamRzShare) — leaf-module self-containment; unifying would touch frozen modules to delete five one-line functions and create a shared dependency where none is needed. Closed: do not unify.
- **`[perf][memo]` console instrumentation** — deliberate monitoring channel (memo cost, relevance diagnostics, snapshot writes); C7 annotates it for lint, nothing is removed.
- **Capture-only factors** (`ktcHist*`, `positionMultiplicity*`, `adot*`, `breakoutAgeFactor`, `combinedNewFactorRaw`, etc.) — banked by design; "unused in projectedPPG" is the contract, not dead code.
- **Documented intentional divergences** — dynasty vs projection draft-slot source; floored vs unfloored trajectory; dynasty `allSeasons` vs projection `qualifying` iteration; `qbQualityByTeamRostered` legacy split (backtest-gated swap pending — the sibling memo is load-bearing, not duplication).
- **The A2/A3/A4 Limited-Data inline returns in dynastyScore.js** — deliberately NOT factored into a helper (scoring-robustness task decision) to keep the additive-guard diffs inert.
- **Load-bearing "why" comments** throughout (envelope monitoring guidance, cache-key identity assumptions, Strict-Mode `cancelled` flags, stat-key contract notes) — none flagged anywhere in this audit; compressing them is anti-cleanup in a stateless-session workflow.
- **`@types/*` devDeps** (H3) and the **`process.env.NODE_ENV` pattern** alongside `import.meta.env.DEV` — both work under Vite; standardizing them is churn without payoff.

## Already tracked elsewhere — not re-reported

Maintainability items already on file in the deep audit (do not double-count): D4-B (capped-peak-age derivation duplicated within dynastyScore.js), D4-C (cohort-cache key-identity header comments), D4-D (rollingAvg3 positional smoothing doc note), and the F4-C cache-key extension. They remain valid and live in `backend-audit-deep.md`.

## Data-repo follow-ups

**None.** Nothing in this audit touches a cross-repo contract; every proposed cleanup is app-local and shape-preserving. (The existing data-repo follow-ups from the logic audits — finiteness validation, seasonLength manifest field, CFBD TD contract — are unaffected.)
