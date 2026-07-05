# Re-anchor projection share attribution to per-season-team (R2-REANCHOR)

**Type:** Session-1 implementation plan (planning only — no source edited this session). Scoring-affecting ⚑, backtest-gated.
**Date:** 2026-07-05.
**App HEAD at planning:** `3bb3cc8742136de6a2c32c5fc1b91d1de4b869d9` ("plan: roadmap audit") = `origin/main`, verified via GitHub MCP `list_commits`; every line anchor below is grounded at this SHA.
**Substrate (reference, not re-derived):** `roadmap.md` (R2-REANCHOR row, decisions D-1/D-4), data-repo `team-context-validation.md` (D2 finding, D4 join policy), `projection-model-assessment.md` (E-2 precondition (b)).

**The defect being fixed (validation D2, high):** every historical player-season is attributed to the player's **current** team (`playersMap[pid].team`) — a player's 2023 usage joins his 2026 team. Correct key: `careerStats[season][pid].team` (season-totals schema v3, era-accurate, served 2012–2025).

**Execution gate (D-1):** this slice may be implemented and merged at any time — the new attribution ships **dormant** behind a mode default that preserves today's behavior byte-for-byte. **Flipping the default is a separate one-line activation commit, blocked until** the R1-HARNESS retrospective before/after comparison (§7) clears. R1-HARNESS's reusable panel is the hard dependency for the gate, not for this merge.

---

## 1. Design: the attribution mode

One new concept in `src/utils/teamContext.js`, consumed everywhere attribution happens:

```js
// Historical-attribution modes. 'current-team' = legacy behavior (playersMap
// current team). 'per-season-team' = careerStats[season][pid].team (season-
// totals v3), falling back to the current team when the season record carries
// no team (live-API-aggregated seasons, v1/v2 cache entries, API-only mode).
// DEFAULT_ATTRIBUTION flips to 'per-season-team' ONLY in the activation commit
// after the retrospective gate clears (see this plan §7).
export const DEFAULT_ATTRIBUTION = 'current-team'

/**
 * Resolve the team a player-season is attributed to.
 * @param {Object|null|undefined} seasonEntry  careerStats[season][playerId]
 * @param {Object|null|undefined} player       playersMap[playerId]
 * @param {'current-team'|'per-season-team'} mode
 * @returns {string|null}
 */
export function resolveAttributedTeam(seasonEntry, player, mode) {
  if (mode === 'per-season-team') return seasonEntry?.team ?? player?.team ?? null
  return player?.team ?? null
}
```

Why this shape:
- **Least-invasive against live source:** every changed function gains one trailing options argument defaulting to `DEFAULT_ATTRIBUTION`; no call site in `App.jsx` changes at merge (defaults flow through), so `docs/architecture.md`'s memo descriptions stay true. Activation is a one-constant diff.
- **The fallback is load-bearing, not a convenience.** Verified at this SHA: the season-totals **v3 served files** carry `team` per record, but (a) the app's **live-API aggregation** (`src/api/sleeperStats.js` — `team` appears only in the bye-vs-DNP logic, lines 174–207; no `team` field is written to records) produces records with **no `team`**, (b) v1/v2 cache entries lack it, and (c) the in-season current year is live-aggregated even in store mode (`inProgress` → live fallback). Without the fallback, per-season mode would silently null out Step 3/5h and the dynasty boost in exactly those sessions. With it, degraded sessions reproduce legacy behavior; store-backed seasons get correct attribution. The fixture `src/__fixtures__/season-totals-2025.json` also has **no `team` field** — tests must build team-bearing entries via factories (§10).
- Do NOT thread this through `resolvePlayerTeam` (`src/utils/playerTeam.js`) or the pack loader — those are view-only-fenced (R3-TCWIRE's slice). This node touches only `teamContext.js`, `teamRzShare.js`, `seasonProjection.js`.

---

## 2. Edits — `src/utils/teamContext.js`

### 2a. Add `DEFAULT_ATTRIBUTION` + `resolveAttributedTeam` (top of file, near line 1)
As §1. Exported for `seasonProjection.js`, `teamRzShare.js`, and tests.

### 2b. `computeHistoricalTeamTotals` (line 191) — signature + keying
```js
export function computeHistoricalTeamTotals(careerStats, playersMap, { attribution = DEFAULT_ATTRIBUTION } = {})
```
Line 197 `const team = playersMap[playerId]?.team` → `const team = resolveAttributedTeam(data, playersMap[playerId], attribution)`. Nothing else changes (gamesPlayed ≥ 1 gate, the five summed keys `rushAtt/rec/recTgt/rushRz/recRz`, per-season grouping). Note: in per-season mode, records whose player is **absent from `playersMap`** (long-retired) now contribute to totals via their season `team` — that is the intended denominator repair (§6). Update the stale header comment at lines 187–190 (see Docs §9, item 6).

### 2c. `computeHistoricalShares` (line 219) — signature + keying
```js
export function computeHistoricalShares(careerStats, playersMap, historicalTeamTotals, { attribution = DEFAULT_ATTRIBUTION } = {})
```
Line 231 `const team = player.team` → `const team = resolveAttributedTeam(data, player, attribution)`. The `if (!player) continue` at 227–228 stays (position must come from `playersMap`; a share row for a playersMap-absent player has no consumer). **Consistency requirement:** the `historicalTeamTotals` passed in must have been built with the **same mode** — assert nothing at runtime (denominator lookup simply misses), but App.jsx builds both from the same default so they can't diverge in practice; the harness/tests pass modes explicitly and must pass them pairwise.

### 2d. `computeTeamContext` (line 111) — signature + both loops
```js
export function computeTeamContext(careerStats, playersMap, currentSeason, { attribution = DEFAULT_ATTRIBUTION } = {})
```
- Step-1 aggregation, lines 120–123: replace the `player?.team` continue-guard + `const team = player.team` with `const team = resolveAttributedTeam(data, playersMap[playerId], attribution); if (!team) continue`.
- Step-2 player shares, lines 151–154: same replacement (position gate `player.position` keeps requiring a `playersMap` entry, line 152).
- `teamOffenseRank` (lines 166, 174) inherits the attributed team's rank — for an offseason mover in per-season mode, the share AND its rank now both describe the team he actually played for in `currentSeason`. (Display surface: `PlayersTab.jsx:439-442` "Team offense: Ranked N of 32" chip; dynasty signals record at `dynastyScore.js:1051`.)
- **Unchanged by design:** `computeQBQualityByTeam` (line 10) and `applyQBQualityModifier` (line 62) key on `row.nfl_team` — forward-looking joins onto the player's next-season team; correct as-is. `buildTeamDepthChart` (line 316) — current rosters, forward. `computeShareTrend` (line 263) — pure over the share series, no team key.

---

## 3. Edits — `src/utils/teamRzShare.js`

### 3a. `buildCohortTable` (line 63) + `getCohortTable` (line 96) — mode-aware cohort
- `buildCohortTable(careerStats, playersMap, historicalTeamTotals, attribution)`: line 80 `const team = playersMap[pid]?.team` → `const team = resolveAttributedTeam(d, playersMap[pid], attribution)` (import from `./teamContext` — no cycle: `teamContext.js` does not import `teamRzShare.js`).
- Cohort cache (line 56): key must include the mode — `const cohortCache = { careerStats: null, attribution: null, table: null }`; `getCohortTable` rebuilds when either identity or mode differs. (Same-session mode switches only happen in tests/harness, but a stale-mode cohort would silently mix attributions.)

### 3b. `computeTeamRzShareFactor` (line 120) — accept the mode, resolve nothing new itself
```js
export function computeTeamRzShareFactor(
  position, lastSeasonStats, season, playerTeam,
  historicalTeamTotals, careerStats, playersMap,
  { attribution = DEFAULT_ATTRIBUTION } = {},
)
```
`playerTeam` keeps its role as the join team, but the **caller** now passes the attributed team (§4a) instead of `player.team`; the options object only feeds `getCohortTable`. Update the JSDoc `@param playerTeam` ("player's current team abbreviation" → "the team the scored season is attributed to — `resolveAttributedTeam(careerStats[season][pid], player, mode)`"). `MIN_TEAM_DENOM = 20` (line 51) stays; its "retired-player undercount noise" comment softens (§6, Docs item 7).

---

## 4. Edits — `src/utils/seasonProjection.js`

### 4a. Thread the mode; re-key the Step 5h join
- Arg object (lines 245–263): add `attribution = DEFAULT_ATTRIBUTION` (import `DEFAULT_ATTRIBUTION`, `resolveAttributedTeam` alongside the existing `computeShareTrend` import, line 3).
- Step 5h call (lines 487–489): compute `const lastQTeam = resolveAttributedTeam(lastSeasonRaw, player, attribution)` (note `lastSeasonRaw = careerStats[lastQ.season][playerId]`, line 407 — exactly the season entry whose `team` we want) and pass `lastQTeam` where `player.team` is passed today; append the `{ attribution }` options argument. Update the comment at line 486 ("Denominators from historicalTeamTotals[lastQ.season][player.team]" → attributed team).
- **Step 3 (lines 340–360): no code change.** It consumes `historicalShares` built upstream; attribution is decided where the shares are built. Do not add a second mode decision here.
- **`historicalShares`/`historicalTeamTotals` coherence:** `App.jsx` builds both memos with defaults (no call-site change at merge); the projection's own `attribution` default matches. All three flip together via the single constant.

### 4b. Team-change neutralization — KEEP both, reworded rationale (deliverable #3)
Recommendation: **keep the Step 3 (line 358) and Step 5h (lines 491–495) neutralizations unchanged in this slice.** Reasoning, for the record:
- **Pre-flip** they patch data corruption (old-team share vs new-team denominator — genuinely meaningless numbers).
- **Post-flip** the mover's shares become *well-defined old-team history* — the corruption argument dies, but a different question replaces it: does role/share trend **transfer** across a team change? That is an empirical modeling question with no committed evidence either way. Removing the neutralization would be a **second scoring change riding the same flip**, confounding the gate's before/after diff (the gate must isolate the attribution correction). One change per gate.
- So: neutralization survives as a *modeling belief* ("share trend does not transfer across teams — hold neutral"), no longer as a data patch. `docs/projection.md` must be reworded to say exactly that (Docs item 2). Its removal/refit becomes a named candidate for the fitted-weights stage (assessment §B.4's team-change interaction), gated on its own evidence.
- **Known asymmetry, explicitly not fixed here:** the dynasty-score share boost (`dynastyScore.js:895-903`) has **no team-change neutralization at all** today — movers currently get wrong-denominator boosts silently; post-flip they get correct-but-old-team trends (strictly better, still unneutralized). Adding dynasty neutralization would require threading `priorTeamByPlayer` into `computeDynastyScore` — out of scope; record as a follow-up candidate in the task summary.

---

## 5. Consumer enumeration (deliverable #1) — what changes on flip, what doesn't

| Consumer | Path | Behavior change on flip to `per-season-team` |
|---|---|---|
| **Step 3 share trend** | `historicalShares` → `computeShareTrend` → `shareTrendMultiplier` (`seasonProjection.js:340-360`) → `rawPPG` (line 597) | **Yes — scoring.** Movers' share history becomes real per-season usage (was: their stats ÷ wrong team's totals). Non-movers shift slightly: denominators gain departed/retired players' volume, so share *levels* drop a bit; the trend is self-relative (recent vs own prior), so level shifts largely cancel — label flips only near boundaries. Neutralization still forces 1.0 for confirmed movers (§4b). |
| **Step 5h team-RZ-share** | `computeTeamRzShareFactor` join team + `historicalTeamTotals` denominators + cohort pool (`seasonProjection.js:487-495`, `teamRzShare.js`) | **Yes — scoring.** Join is now lastQ-season team (matters when `isTeamChange` is `null` — unknown, not neutralized — and for mid-season movers, D-4 §below); denominators complete; cohort pool recomputed under the same mode so percentiles stay internally consistent. Mover neutralization unchanged. |
| **Step 5g own-rate RZ usage** | `computeUsageFactors` (`usageMetrics.js`) | **No.** Numerator and denominator are both the player's own stats; no team key anywhere. Stated explicitly because the prompt names "RZ-usage denominators": the team-side RZ denominators (`rushRz`/`recRz`) live in `historicalTeamTotals` and are consumed **only** by Step 5h. |
| **Step 7 team offense** | `teamContext.teamOffense[player.team].rank` (`seasonProjection.js:544`) | **Aggregation side only.** The forward join stays on the player's current team (correct — that's the environment he'll play in). But rank *values* shift slightly: mover stats now aggregate to the team they were earned on. |
| **Step 7b QB quality** | `qbQualityByTeam[player.team]` (line 565) | **No.** Forward-looking; `computeQBQualityByTeam` derives from playerRows current teams, no historical totals. |
| **Dynasty share-trend boost** | `computeShareTrend(historicalShares[pid])` → ±8/4 OQ points (`dynastyScore.js:895-903`) → `opportunityScore` → score | **Yes — dynasty score.** Same corrected shares. No neutralization exists here (§4b asymmetry). Moves dynasty scores → positional ranks → market divergence for affected players. |
| **Dynasty OQ share score** | `teamContext.playerShares[pid]` → `shareScore` (`dynastyScore.js:879`, `218-223`) | **Yes — dynasty score.** Current-season carry/target share now computed vs the attributed current-season team (movers). |
| **Workhorse-RB QB-mod gate** | `row.dynastyScore.signals.carryShare > 0.30` (`applyQBQualityModifier`, `teamContext.js:76`) | **Edge cases.** `carryShare` values shift (denominator completeness) → the 0.30 gate can flip for borderline RBs → their QB-mod applies/stops applying. Inherited, not separately coded. |
| **Role ranks** | `computeRoleRanks(playerRowsFinal, historicalShares)` (`dynastyScore.js:372-401`; App.jsx:477-483) | **Yes — display ranks.** Weighted recent share ordering shifts; Role chip (RankingsRow) reranks. |
| **Display ride-alongs** | Profile share history (`usePlayerProfile.js:143-144, 181`), dynasty signals `shareHistory/currentShare/teamOffenseRank` (`dynastyScore.js:1049-1057`), "Team offense: Ranked N of 32" chip (`PlayersTab.jsx:439-442`) | **Yes — display.** Same corrected data, view-only surfaces; no code change, values move. |
| **Outlook per-season-team shares** | `outlookPositionStats.buildPerSeasonTeamShares` (view-only) | **No change — convergence note.** The Outlook view already attributes per-season-team (via `resolvePlayerTeam`). Post-flip, scoring-side shares finally agree in attribution semantics with the Outlook view (small residual differences remain: Outlook uses its own share definitions). Worth one line in the task summary; no code. |

Everything else in the 13-step pipeline (base PPG, age, regression, momentum, 5c/5d/5e/5f, Step 6, Step 8, Step 9, confidence, rookie path) has no team-keyed input — unchanged.

---

## 6. D-4 join policy + retired-player undercount (deliverables #2 and #4)

**Dominant-team resolution (D-4): inherited from the data field, not re-derived in the app.** `careerStats[season][pid].team` is already single-valued per player-season, resolved by the data repo at aggregation (`sleeper-dashboard-data/lib/sleeper.mjs`, `aggregateWeeks` lines 198–239): **team with the most played weeks that season; ties → the team of the most recent played week; zero played weeks → last team seen in a weekly response; normalized to the schedule domain.** The app treats the field as opaque. So "dominant team" for a mid-season-traded player = most-games team, tie-broken toward the later stint — exactly the v1 policy the roadmap's D-4 recommends. **Games-weighted blend across stints is explicitly NOT built** — it needs week-grain team (gamelogs domain), belongs to a graded future upgrade, and would change data shapes; record it in the task summary as deferred-with-reason.

**Retired-player denominator undercount: mostly subsumed, not a distinct sub-item.** Today's undercount exists because `playersMap[pid].team` is null for retired/FA players → skipped from totals (`teamContext.js:188-190` comment; `docs/projection.md` Step 5h data-quality note). Under per-season attribution their season records carry a real `team` → they re-enter every denominator for all v3-served seasons (2012–2025 complete). Residual undercount, stated honestly:
- (a) records with `team: null` in v3 (data-side unresolvable — zero played weeks; negligible for denominators since the gamesPlayed ≥ 1 / ≥ 8 gates skip most),
- (b) fallback situations (live-aggregated in-season year, v1/v2 cache, API-only mode) where behavior degrades to legacy — including the legacy undercount,
- (c) players absent from `careerStats` entirely (didn't register stats — not a real denominator loss).
No separate fix is scoped; `MIN_TEAM_DENOM = 20` and the shrinkage stay as guards for the residual cases. Docs items 6–7 update the two limitation notes rather than delete them.

**REG-only / LOO (deliverable #5): nothing to build here.** The careerStats this node aggregates contain **regular-season weeks only** — the app's live loop fetches weeks 1–18 (`sleeperStats.js` `loadCareerHistory`) and the data repo's `aggregateWeeks` fills an 18-slot `weeklyStatus` from the same weekly endpoints (`lib/sleeper.mjs:172`); no postseason rows exist in season totals. REG-only-basis and defense-faced leave-one-out are **pack-consumption** conventions — record both in the task summary as inherited preconditions bound to R3-TCWIRE's spec (per roadmap R2 DoD), with no code in this slice.

---

## 7. Backtest gate mechanism (D-1 — deliverable, the activation contract)

**Mechanism (app side):** the mode parameter + `DEFAULT_ATTRIBUTION = 'current-team'` constant (§1). Merge ships the new path dormant; **the activation commit is exactly: flip the constant to `'per-season-team'` + Docs items marked [on-flip] + the task-summary note.** Nothing else moves. A parity test (§10, T-1) guards against accidental activation.

**Gate (data side, hard dependency = R1-HARNESS's reusable panel):** the R1-HARNESS pseudo-factor panel assembler computes the historical projection panel **under both attribution modes** and diffs residuals against actual Y+1 outcomes:
- *Old mode reconstruction:* for a pseudo-projection made after season Y, "current team" is not archived pre-2026 — the reconstructable stand-in is the player's **season-Y team** applied to ALL his historical seasons (this reproduces the mis-attribution mechanism: every past season keyed to the projection-time team). State this stand-in explicitly in the harness so nobody mistakes it for the app's literal `playersMap` read.
- *New mode:* attribute season *s* to team(*s*) from the v3 files — semantics identical to §1's resolver (the harness reads served v3, so the fallback branch never fires there).
- *What the comparison measures:* per position — MAE and Spearman rank correlation of projected vs actual Y+1 PPG, pooled 2013→2025; **plus the mover cohort** (players with team(Y) ≠ team(Y−1)) reported separately, since movers are where attribution bites and the overall panel could mask a mover-cohort regression.
- *Clearing criterion:* the per-season-team mode must be **no worse overall** (MAE, rank corr, per position) and **no worse on the mover cohort** — more-correct attribution must not degrade retrospective accuracy. Committed report in `backtests/` (the R1-HARNESS convention) is the artifact; **flipping `DEFAULT_ATTRIBUTION` is blocked until that report exists and clears.**
- The harness must mirror the Step 3/5h **neutralization** behavior in both modes (movers neutralized identically), or the diff conflates §4b's question with attribution.

---

## 8. Step sequence for the implementer

1. `teamContext.js`: add `DEFAULT_ATTRIBUTION` + `resolveAttributedTeam` (§2a); re-key `computeHistoricalTeamTotals` (§2b), `computeHistoricalShares` (§2c), `computeTeamContext` (§2d).
2. `teamRzShare.js`: mode-aware cohort + cache key + options arg (§3).
3. `seasonProjection.js`: `attribution` arg + Step 5h attributed-team join (§4a). No Step-3 change; no neutralization change (§4b).
4. Tests (§10) — including the T-1 parity test FIRST (it pins legacy behavior before refactoring).
5. Docs (§9), excluding the [on-flip] items.
6. `npm test` (incl. `factorsSchema.test.js` — must pass with **zero** edits: no factors keys change), `npm run lint`, `npm run build`.
7. Task summary must state: cross-repo coordination note (§11), the dynasty-neutralization asymmetry follow-up (§4b), the deferred games-weighted blend (§6), and the R3-TCWIRE inherited preconditions (§6).

---

## 9. Docs updates

1. **`docs/projection.md:5`** — extend the signature line with `attribution = DEFAULT_ATTRIBUTION` (additive arg, after `priorTeamByPlayer`).
2. **`docs/projection.md:44-64` §Team-change handling (offseason)** — rewrite the framing:
   - Line 46 ("Per-season team is not stored in the projection pipeline — `playersMap` carries only the player's **current** team.") → replace with: "Per-season team IS now available to the pipeline (`careerStats[season][pid].team`, season-totals v3); historical attribution is mode-gated by `DEFAULT_ATTRIBUTION` in `teamContext.js` (`'current-team'` until the retrospective gate clears — see `.claude/tasks/projection-reanchor-per-season-team.md` §7). Team-change *detection* for the offseason neutralization remains snapshot-based as below."
   - Lines 55–56 (what fires on a confirmed change): keep both bullets, but replace the *rationales*: Step 3 — "share history is attributed to the old team" → "the share trend describes old-team roles; trend transfer across a team change is un-validated → held neutral"; Step 5h — "the numerator reflects old-team RZ work while the denominator is the new team's total" → "under per-season attribution the share is well-defined old-team history; transfer to the new team's RZ structure is un-validated → held neutral". Add one sentence: "Pre-flip (`current-team` mode) the original data-corruption rationale still applies."
   - Line 62 ("**Deferred:** full re-anchoring … robust per-season team recovery (requires a cross-repo data change …)") → replace with: "**Implemented behind the gate:** re-anchoring ships dormant (`DEFAULT_ATTRIBUTION`); activation is blocked on the R1-HARNESS before/after report. The cross-repo data prerequisite (per-season `team`) landed in season-totals v3." (The old sentence's premise is dead — the data change shipped.)
3. **`docs/projection.md:85` Step 5h paragraph** — "Scored against the player's most-recent qualifying season (`lastQ.season`) and their **current team's** denominator for that same season" → "…and the **attributed team's** denominator for that same season (`resolveAttributedTeam` — current team in legacy mode, the lastQ-season team once flipped)".
4. **`docs/projection.md:87` Data-quality limitation** — [on-flip] rewrite: denominators are complete for v3-served seasons (retired/departed players included via per-season team); residual undercount only in fallback situations (live-aggregated current season, v1/v2 cache, API-only). Until the flip, add "(legacy `current-team` mode retains the undercount)".
5. **`docs/dynasty-scoring.md:85-95`** (OQ modifiers) — add one sentence under the share-trend boost: "Share attribution follows `teamContext.js` `DEFAULT_ATTRIBUTION` (per-season-team once flipped); note the boost has NO team-change neutralization (unlike projection Steps 3/5h) — a known asymmetry, follow-up candidate."
6. **`src/utils/teamContext.js:187-190` header comment** (in-code doc) — replace the "active players currently in playersMap only" limitation text with the mode-conditional statement (per-season mode restores retired players for v3-served seasons; fallback retains the limitation).
7. **`src/utils/teamRzShare.js:49-50`** `MIN_TEAM_DENOM` comment — "guards against retired-player undercount noise" → "guards residual sparse denominators (undercount largely resolved by per-season attribution; fallback modes retain it)".
8. **`CLAUDE.md` §src/utils table** — `teamContext.js` row: append "; historical attribution is mode-gated (`DEFAULT_ATTRIBUTION`/`resolveAttributedTeam` — per-season-team re-anchor, backtest-gated flip)". `teamRzShare.js` row: no change needed beyond what's there (signature detail stays in projection.md).
9. **`docs/signal-registry.md` §3B** — Share trend row and Team-RZ-share row: append to *Current use* / notes: "attribution mode-gated (`current-team` default until the R2 gate clears)". [on-flip] Team-RZ-share row: drop "(denominator over active players — minor undercount)".
10. **`docs/architecture.md`** — no change (App.jsx memo call sites unchanged; state this in the implementation summary).
11. **`README.md`** — check the projection blurb; if it repeats the share-trend description verbatim, mirror item 2's one-line framing; otherwise no change.

---

## 10. Tests to add

**T-1 — parity/golden guard (write FIRST), `src/utils/teamContext.test.js`:** with a fixture containing a mover (season entries `team: 'A'` then `'B'`, playersMap current `'C'`) and a retired player (in careerStats with `team`, absent from playersMap): `computeHistoricalTeamTotals/Shares/computeTeamContext` called with NO options and with `{ attribution: 'current-team' }` produce deep-equal outputs, and those outputs match the pre-change expectations (extend the existing `describe` blocks at lines 42/94). Also assert `DEFAULT_ATTRIBUTION === 'current-team'` (fails loudly on accidental flip; the activation commit updates this single assertion).

**T-2 — `resolveAttributedTeam` unit, `teamContext.test.js`:** per-season mode returns `seasonEntry.team`; falls back to `player.team` when entry team is absent/null; returns null when both missing; current mode ignores `seasonEntry.team` entirely.

**T-3 — per-season totals re-key, `teamContext.test.js`:** mover's season-A stats land in team A's totals (mode per-season) vs team C's (mode current); retired player's volume included per-season / excluded current (the undercount repair, §6); a `team: null` v3 record with a playersMap team falls back rather than dropping.

**T-4 — per-season shares, `teamContext.test.js`:** mover's 2023 share computed vs team-A totals and 2024 vs team-B totals in per-season mode; share history ordering/rounding unchanged; player absent from playersMap yields totals contribution but no share row.

**T-5 — `computeTeamContext` per-season, `teamContext.test.js`:** offseason mover's currentSeason share + `teamOffenseRank` reflect the attributed (season) team; team ranks shift when a mover's volume re-keys.

**T-6 — cohort mode-awareness, `src/utils/teamRzShare.test.js`:** same `careerStats` identity, different `attribution` → cohort rebuilt (cache does not serve the stale mode); cohort shares computed vs attributed teams; `computeTeamRzShareFactor` joins the caller-passed team (pass a mover: attributed team ≠ playersMap team; factor non-neutral only under the attributed join).

**T-7 — Step 5h wiring, `src/utils/seasonProjection.test.js`:** build a mover whose `isTeamChange` is `null` (no `priorTeamByPlayer`) with lastQ-season `team` ≠ current `playersMap` team: legacy mode joins current team (neutral — no totals entry), per-season mode joins the lastQ team (non-neutral factor). Assert `factors` key set unchanged (spot-check; `factorsSchema.test.js` is the contract backstop and needs zero edits).

**T-8 — neutralization interaction, `seasonProjection.test.js`:** with `isTeamChange === true` (via `priorTeamByPlayer`), `shareTrend === 1.0` and `teamRzShare === null`/factor 1.0 in BOTH modes — the mover neutralization is mode-independent (§4b).

**T-9 — fallback path, `seasonProjection.test.js` or `teamContext.test.js`:** careerStats entries with NO `team` field anywhere (live-API shape) under per-season mode reproduce legacy outputs exactly (fallback = current team).

Fixture note: build entries via `src/__fixtures__/factories.js` `makeSeasonEntry(...)` spread with `team:` (the factory and `season-totals-2025.json` fixture carry no `team` — do not modify the fixture; `statKeysContract` is untouched since `team` is not a stat key).

No integration/browser tests: the App.jsx call sites are unchanged at merge.

---

## 11. Cross-repo impact

**Contracts: none.** Verified against both CLAUDE.md contract tables: no `factors` key is added/renamed/removed (values move on flip only), so the snapshot shape ("`projection` field is verbatim `computeNextSeasonProjection` output") is untouched — no snapshot `schemaVersion` bump, nothing for `register-snapshots.mjs` or the grader to mirror (grading joins outcomes by `sleeper_id`, never by team). Season-totals v3 is consumed additively as already contracted (`team` field); `MAX_SUPPORTED_SCHEMA` unchanged. `lib/fantasyPoints.mjs` untouched.

**Coordination notes (task summary must carry both):**
1. **R1-HARNESS (data repo)** must implement the dual-mode panel semantics of §7 — including the old-mode "season-Y team stands in for current team" reconstruction and identical mover neutralization — before the gate can run. The dominant-team semantics it inherits are the data repo's own (`lib/sleeper.mjs` `aggregateWeeks`, lines 198–239), since it reads the same v3 files.
2. On flip, snapshots' `shareTrend`/`teamRzShare*` (and dynasty-derived signals) change **values** from that date forward — pre/post cohorts are distinguishable by snapshot date, same convention as the 2026-06-12 bounce-back correction (`docs/projection.md` Step 5c precedent). State the flip date in the activation commit message.
