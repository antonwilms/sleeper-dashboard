# Refactor assessment — sleeper-dashboard

**Type:** triage / analysis only. No source edits. Each greenlit item gets its own planning pass later.
**Baseline:** 222 tests green; ~9.9k lines across 37 in-scope files.
**Method:** dead-export scan (total-reference count incl. same-file + tests), console-logging census with NODE_ENV-gating check, duplication census (`clamp`/`percentileRank`/cohort-cache), cross-checked against CLAUDE.md Invariants and docs/.

---

## Headline

This tree is mature and deliberately structured; most "duplication" here is **documented intentional** (the Thread-B "duplicate tiny helpers rather than import from frozen modules" precedent) and most density is load-bearing. The honest yield is **one clear win, one modest win, and three rejects.** Nothing structural (pipeline, App.jsx state, abstractions) clears the bar.

Ranked by value ÷ risk:

| # | Candidate | Verdict |
|---|---|---|
| 1 | Remove dead `computeEfficiencyMetrics` + `buildEfficiencyPool` (dynastyScore.js) | **RECOMMEND** |
| 2 | Prune ungated dev-verification logging in App.jsx | **RECOMMEND (modest)** |
| 3 | Remove unused `getPointsBreakdown` (fantasyPoints.js) | Don't recommend (weak) |
| 4 | Unify duplicated `clamp` / `percentileRank` / cohort-cache | Don't recommend |
| 5 | Remove "unused" `getCoaching`/`getScheme`/`getNotes` (enrichmentLookup.js) | Don't recommend (flag, don't delete) |

---

## Candidate 1 — Remove dead `computeEfficiencyMetrics` + `buildEfficiencyPool`  ✅ RECOMMEND

**What:** `dynastyScore.js` exports `computeEfficiencyMetrics` (≈ lines 149–175) and its only-caller private helper `buildEfficiencyPool` (≈ lines 113–137). Total references across the entire repo (source + tests + App + docs + CLAUDE): **the definition lines only — zero call sites anywhere.** It is the "simple efficiency" implementation that the file's own comment says was *"replaced by"* `computeOpportunityQuality`. It is not in CLAUDE.md's documented `dynastyScore.js` export list.

**Why it's a real win:** genuine dead weight (~50 lines incl. blank/comment) sitting in the one file CLAUDE.md mandates be **"read in full before touching."** Every future opus session pays a re-reading tax on a dead, undocumented exported function that also dangles a misleading public API. Removal is pure subtraction.

**Files touched:** `src/utils/dynastyScore.js` only.

**Invariant-collision check:** None.
- *Not* the frozen `efficiencyMetrics.js` module — this dead code lives in `dynastyScore.js` (different file); the frozen-module exclusion does not apply.
- Shared private `percentileRank` (dynastyScore.js:139) is **retained** — still used by `computeOpportunityQuality` (lines 252–253) and current-level scoring (line 825). Confirmed it does not orphan.
- Doesn't touch trajectory divergence, pipeline order, App.jsx state, or capture-only factors.

**Risk:** LOW. Isolated cluster, zero references (so no test can break on the symbol), `npm test` + `npm run build` will catch any dangling reference immediately.

**Rough scope:** small — delete two functions, run suite + build.

**Docs / Tests / Cross-repo flags:** Docs **none** (not referenced in docs/ or CLAUDE.md — verified). Tests **none** (non-behavioural removal; suite must stay green). Cross-repo **none**.

---

## Candidate 2 — Prune ungated dev-verification console logging (App.jsx)  ✅ RECOMMEND (modest)

**What:** App.jsx ships a layer of **ungated** diagnostic `console.log`s straight to the production console, several hardcoded to specific players, plus dead computation that exists only to feed them:
- the `// ── DIAGNOSTIC: retired/empty player entries ──` block (Brady/Ryan lookups + `allSkill`/`noTeamNoAge`/`noTeamNoAgeNoExp` filters over the full player map, run every league load purely to log) — App.jsx ~1128–1141;
- `[cfbd] CeeDee Lamb …`, `[collegeMetrics] computed for N`, `[players] Before/After filter` + `Excluded sample`, the `[proj]` block hardcoding Josh Allen / Bijan / Davante / top-rookie, `[collegeMatch]`/`[nflDraft]` verification logs.

Leave alone: the **NODE_ENV-gated** per-player logs in `dynastyScore.js:578` and `sleeperStats.js:241` (dev-only, stripped in prod build — not dead weight in production), the `careerLoadProgress` UI state, and `console.warn`/`error` handlers. The `[snapshot] wrote/skipped` line is a judgment call (mild operational value) — keep or downgrade, planner's call.

**Why it's a real win:** these are leftover dev-verification artifacts, not design. The DIAGNOSTIC block runs `Object.values(playerMap).filter(...)` passes every league load solely to `console.log`. Removing them eliminates dead per-load computation and production console noise. The hardcoded player names (CeeDee Lamb, Brady, Bijan…) are unambiguous "left the scaffolding in" tells.

**Files touched:** `src/App.jsx` (primary). Optionally `dynastyScore.js:88–90` `[age curve]` unconditional log (runs 4×/session — low value, low priority; can leave).

**Invariant-collision check:** None. Removing log statements + log-only computation does not move state out of App.jsx (the state and pipeline are untouched), touches no capture-only factor, no pipeline reorder. Must verify (trivially) that no removed expression has a non-logging side effect — they are all `console.*`, so none do.

**Risk:** LOW–MODERATE. Pure removal of side-effect-free logging; "moderate" only because it is spread across many small sites in a big file and needs the gated-vs-ungated / operational-vs-cruft judgment above (so it deserves its own small planning pass rather than a blind sweep).

**Rough scope:** small–medium (many small deletions, one file).

**Docs / Tests / Cross-repo flags:** all **none**.

---

## Candidate 3 — Remove unused `getPointsBreakdown` (fantasyPoints.js)  ⚠️ Don't recommend (weak)

**What:** `getPointsBreakdown` (fantasyPoints.js:25) has zero references anywhere (incl. tests). Its sibling `getCategoryPoints` is **not** dead (imported by seasonProjection.js:397).

**Why it's marginal:** it is **documented** in CLAUDE.md as `"getPointsBreakdown for debug"` — i.e. intentional debug tooling, not abandoned scaffolding. Removing ~15 lines also forces a CLAUDE.md edit. The win is tiny and the "is this kept-on-purpose tooling?" ambiguity is real.

**Invariant check:** none, but it touches a CLAUDE.md-documented surface.

**Risk:** very low mechanically; the judgment ("is debug tooling dead weight?") is the only real question.

**Verdict:** **Not worth a dedicated pass.** If Candidate 1 expands into a deliberate dead-export sweep, fold this in (with the CLAUDE.md line removed in the same change); otherwise leave it.

**Docs / Tests / Cross-repo:** Docs = CLAUDE.md line. Tests none. Cross-repo none.

---

## Candidate 4 — Unify duplicated `clamp` / `percentileRank` / cohort-cache  ❌ Don't recommend

**What:** `clamp` is defined identically 6× (compsIntegration, efficiencyMetrics, teamRzShare, dynastyScore, seasonProjection, usageMetrics); `percentileRank` identically 4× (efficiencyMetrics, teamRzShare, dynastyScore, usageMetrics); the cohort-cache memo wrapper (`{careerStats, table}` + identity-check getter) appears 3× (efficiencyMetrics, usageMetrics, teamRzShare).

**Why it fails the bar:**
- **Intentional + documented.** Module headers explicitly state the tiny helpers are *"DUPLICATED here rather than imported from the frozen efficiencyMetrics.js per the Thread B precedent,"* and factories.js documents the cohort-cache pattern. This is design, not cruft — exactly the trap this assessment is meant to avoid.
- **Touches frozen files.** Any shared-module extraction must edit `efficiencyMetrics.js` and `usageMetrics.js` (frozen) to import — trading tested stability for tidiness.
- **Premature DRY / ~nil drift risk.** `clamp` is `Math.max(lo, Math.min(hi, v))` — there is no second correct way to write it, so it cannot meaningfully drift. `percentileRank` is a 5-line tested counting loop. The cohort *builders* legitimately differ per signal; only a ~6-line memo wrapper is truly shared — extracting a HOF would add an abstraction layer to save a handful of net lines.

**Invariant-collision check:** **Collides** — the deliberate-duplication precedent and the frozen-module rule. Disqualified on those grounds alone.

**Verdict:** **No.** Explicit "not worth it": cost (editing frozen, tested files for cosmetic DRY) far exceeds the gain (near-zero drift risk on trivial helpers).

---

## Candidate 5 — `getCoaching` / `getScheme` / `getNotes` look unused  ❌ Don't recommend (flag, don't delete)

**What:** 3 of the 4 `enrichmentLookup.js` exports have zero references anywhere (only `findInjuryForWeek` is consumed). On a pure reference scan they read as dead.

**Why removal is wrong here:** they are the **read side of a documented, cross-repo-contracted feature** (the enrichment overlay — coaching/scheme/notes — authored and schema-validated in `sleeper-dashboard-data`, described in docs/integrations.md and CLAUDE.md). The data is loaded into `enrichmentMap`; only the injury lookups are wired into the UI so far. These three are almost certainly **scaffolding for pending UI**, not abandoned code. Deleting them would discard deliberate API surface tied to a cross-repo contract and force re-authoring when the coaching/scheme/notes panels land.

**Invariant-collision check:** brushes the **enrichment cross-repo contract** surface — reason enough to leave it.

**Risk of removal:** deceptively low mechanically, but high in intent terms (deletes a contracted feature's read layer).

**Verdict:** **Do not remove.** If certainty is wanted, confirm with the product owner whether coaching/scheme/notes UI is still planned; default is keep. Classic "intentional design mistaken for cruft."

---

## Also considered, not listed as candidates

- **Splitting App.jsx (1511 lines) / PlayersTab.jsx (2139 lines) into smaller files.** Disqualified: aesthetic restructuring of heavily-integration-tested code; App.jsx splitting also brushes the "App.jsx owns all state / no new hooks" invariant. The in-file sub-components already provide logical separation. Risk ≫ gain.
- **`dynastyLabelColor` exported but only used within PlayersTab.jsx.** Dropping the `export` keyword is harmless churn on a CLAUDE.md-documented export; no win. Skip.
- **Broader DRY across the per-signal projection modules.** Each is a deliberately self-contained, separately-tested unit (momentum/regression/projectionSignals/efficiency/usage/teamRzShare). Consolidation is premature DRY against an intentional one-module-per-signal architecture.

---

## Overall recommendation

**Do Candidate 1; optionally do Candidate 2. Skip 3, 4, and 5.**

Candidate 1 is the only unambiguous, near-zero-risk win — genuine dead code in the highest-traffic file, no docs/tests/cross-repo impact. Candidate 2 is a legitimate but modest dead-weight/console-hygiene cleanup worth doing on its own small pass if you want App.jsx tidier; it carries low risk but is not urgent. Everything else is either intentional design (4), documented tooling/scaffolding (3, 5), or aesthetic churn against the invariants — leaving them is the correct call for a mature, tested tree.

If you want a single minimal pass: **Candidate 1 alone**, as its own planned change.
