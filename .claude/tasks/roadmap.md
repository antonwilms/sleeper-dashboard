# Roadmap — reality-checked consolidation (dependency-ordered)

**Date:** 2026-07-05 (planning session — sequencing substrate only; no source edits in either repo)

**Resolved HEADs (session-start discipline, verified via GitHub MCP `list_commits` = local `origin/main` = local HEAD, both trees clean):**
- **App** `sleeper-dashboard`: `4230b5ae792e4465098bc980d4ffb005ef119b2a` ("plan: codebase audit")
- **Data** `sleeper-dashboard-data`: `a817d45b4a293728a53b7041698a00dbaa10f7dc` ("nflverse: … teamcontext ingest")

**Substrate documents consumed (not re-derived):**
- `sleeper-dashboard/.claude/tasks/projection-model-assessment.md` (2026-07-04; "assessment" below — E-0..E-3 phasing, C-gaps, D-feasibility)
- `sleeper-dashboard/.claude/tasks/codebase-data-audit.md` (2026-07-05; "audit" below — A1 + capture gaps + F-drift)
- `sleeper-dashboard-data/.claude/tasks/team-context-validation.md` (2026-07-05; "validation" below — A4/B4/B5/D2/D3/D4/E-classifications). Note: this file lives in the data repo's **gitignored** `.claude/tasks/` — it is not on GitHub; the local copy (verified same-day, anchored at exactly these two SHAs in its own header) is the live source.
- Plus: `git log --name-only -30` both repos; app `CLAUDE.md` (model-routing table, invariants), `docs/signal-registry.md` (active vs parked); every status below re-verified against live source, not doc wording.

**Naming note:** the item IDs below are this roadmap's canonical IDs. The audit's spawn-order numbering (A1, B1–B3…) and the assessment's phase codes (E-0a…E-3c) are cross-referenced per item.

---

## 1. Sequenced roadmap

Ordering rule applied: (1) permanent-data-loss clock first, (2) dependency topology, (3) strategic value (the market-vs-model-delta arc). ⚑ = scoring-affecting, backtest-gated per the standing discipline.

### Tier 0 — active-loss stoppers (now; all independent of each other)

| ID | Item | Disposition | Prereqs | Repo · session type | Backtest-gated |
|---|---|---|---|---|---|
| **R0-BANK** | Export the app's IndexedDB projection snapshots and import them (`bin/import-snapshot.mjs`) — committed store ends `snapshots/2026-06-21.json`, 14 days exposed in one browser profile | capture-gap-urgent | none | data (+ user browser) · straight execution, no plan session | no |
| **R0-KTC** | A1 KTC `inProgress`-contract fix: every `ktc/snapshot-*` manifest entry is `inProgress: true` (data `scripts/update-ktc.mjs:212`) and app `tryDataStore` rejects `inProgress` (`src/api/dataStore.js:80`) → `ktcHist*` all-null since ship + empty Explorer KTC Δ | fix-now | decision D-2 (§4) on which side changes | cross-repo (one side edits) · straight-Sonnet after the one-line side decision | no (capture/display repair; capture-only factors can't move `projectedPPG`) |
| **R0-CRON** | A2 missed-cron detector: Mondays 2026-05-25 + 06-08 produced no run and no trace; add a dead-man check (fail red when `today − max(ktc/snapshot-*)` > 8 days) | capture-gap-urgent | none | data · straight-Sonnet | no |
| **R0-SLEEPER** | A4 ephemeral Sleeper players-state ingest: weekly server-side capture of `team`/`status`/`injury_status`/`depth_chart_order` from `/players/nfl` — today captured only via app-visit snapshots; `injury_status` captured nowhere (app `projectionSnapshot.js:85-92` records `status` only) | capture-gap-urgent | none | data · **Session-1 plan** (new served family: grain/schema/gate decisions) | no (capture-only on arrival, per doctrine) |
| **R0-OLINE** | Forward ephemeral captures continue (assessment E-3a): `enrichment/oline.json` slice per data `.claude/tasks/context-instability-capture.md`; scheme/coaching entries. Softer clock than R0-SLEEPER (offseason churn, hand-authored) | capture-gap (soft clock) | none | data · straight-Sonnet (plan exists) | no |

*Loss-clock rationale:* R0-BANK stops an exposure that compounds daily; R0-KTC starts the ktcHist accrual clock that R3-KTCMOM waits on (every week unfixed delays the market-vs-model arc by a week); R0-CRON protects the very accrual R0-KTC starts; R0-SLEEPER permanently closes the largest ephemeral hole and structurally de-risks the R0-BANK dependency on manual export.

### Tier 1 — harness + panel (dependency topology; parallelizable)

| ID | Item | Disposition | Prereqs | Repo · session type | Backtest-gated |
|---|---|---|---|---|---|
| **R1-HARNESS** | Assessment **E-0a**: joint-model-over-reconstructable-panel run — pseudo-factor panel assembler (2013→2025 outcomes), grade standing candidates (`air_yards_share` first, share-level second) — **landed**; first verdict committed at `grading/2026-07-08-e0a-verdict.md` (data repo). Verdict: shareLevel clears at no position (WR UNSTABLE, TE DEGRADES, RB NO-GAIN); airYardsShare CLEARS for WR and TE but provisional-pending-age (age-blind baseline) | landed (gate-running, not activation) | none (runs on current data); re-run after R1-SNAPS | data · **Session-1 plan** (panel assembler extends `bin/backtest.mjs` pattern; analysis-only) | it IS the gate instrument |
| **R1-SNAPS** | Assessment **E-1a** (C-6): nflverse snap-counts family (`nflverse/snaps/<year>.json`, 2012+) + playerids **pfr parse-widening** — closes the pre-2020 `snapShare` listwise-drop; roughly triples control-complete panel years | open | none | data · **Session-1 plan** (new family + crosswalk widening) | no (capture-only on arrival) |
| **R1-EFF** | Assessment **E-1b** (C-1): QB efficiency season artifact (`nflverse/effstats/<year>.json`): Σ`passing_epa`/Σ`attempts` from `stats_player`; season CPOE from per-play pbp (rate — never summed from weeklies) | open | none (crosswalk exists); graded via R1-HARNESS | data · **Session-1 plan** (new family) | activation ⚑ (E-2b); arrival capture-only |
| **R1-BANDS** | Assessment **E-0b**: retrospective uncertainty bands (residual quantiles by position × confidence tier) — display-layer only, scoring-decoupled by construction | open | R1-HARNESS panel | data (compute) + app (display) · straight-Sonnet once panel exists | no (display-only) |
| **R1-AGE** | Add age to the E-0a panel: port the `draft_picks`→`sleeper_id` join server-side (or emit a crosswalk), then re-grade. The committed E-0a verdict (`grading/2026-07-08-e0a-verdict.md`) is age-blind — `draft_picks` has no server-side `sleeper_id` join, so the panel baseline cannot control for age | open — **gate on any `airYardsShare` activation** (R3-EFFACT) | none | data · Session-1 plan | it IS the gate for the airYardsShare CLEARS verdicts below |

**Standing caveat on E-0a verdicts:** the committed baseline is age-blind. Any candidate that clears against it (see the airYardsShare CLEARS verdicts, WR/TE) is **provisional-pending-age**, not cleared for activation — a candidate can clear by proxying for age and add nothing once age is present app-side. R1-AGE is the prerequisite that resolves this. The **shareLevel** candidate is **graded-and-parked**: it cleared at no position (WR UNSTABLE, TE DEGRADES, RB NO-GAIN) — do not resurrect without a new construction.

### Tier 2 — the critical-path node

| ID | Item | Disposition | Prereqs | Repo · session type | Backtest-gated |
|---|---|---|---|---|---|
| **R2-REANCHOR** | **Per-season-team re-anchoring of the projection pipeline** (validation **D2**, high; assessment E-2 precondition (b); the prompt's "share-attribution projection re-anchoring"): app `src/utils/teamContext.js` still keys every historical player-season by `playersMap[pid].team` — Sleeper's *current* team (verified live at `4230b5a`: `computeTeamContext` line 120-123, `computeHistoricalTeamTotals` line 197, `computeHistoricalShares` line 227) — onto `careerStats[season][pid].team` (season-totals v3, era-accurate). **Single high-fan-out node: gates BOTH R3-TCWIRE and R3-FIT** — until it lands, consuming the pack silently corrupts (joins a player-season to the wrong team's context), and fitting weights on share/team-keyed features learns attribution noise as signal. Model as one node, not two edges. | dependency-critical ⚑ (scoring-affecting: changes share-trend/team factors for team-changers) | E-0/R1-HARNESS committed baseline strongly recommended first (see conflict C-1) | app · **opus Session-1 plan** (playerRows-pipeline + `teamContext.js` — opus per the model-routing table) | ⚑ — see open decision D-1 on gate form |

**Bound to R2-REANCHOR's definition-of-done** (feature definitions that corrupt fitted coefficients if unenforced — not deferrable conventions):
- **REG-only consumption basis** (validation **A4**): all season aggregates over teamcontext fix `seasonType === 'REG'` as the default basis, stated once for all recipes (POST rows make unfiltered sums inconsistently sampled across teams).
- **Mandatory leave-one-out for defense-faced** (validation **B4**): the LOO recipe (per-game component sums minus own-matchup games, then divide) written as a required step, not an optional refinement.
- **Multi-team-season join policy** (validation **D4**): dominant-team join vs games-weighted blend — decide once in this node's spec (see D-4).

### Tier 3 — consumption + fit + the market-vs-model arc

| ID | Item | Disposition | Prereqs | Repo · session type | Backtest-gated |
|---|---|---|---|---|---|
| **R3-TCWIRE** | Team-context consumption wiring (the projection refactor consuming `nflverse/teamcontext/`): PROE/pace/RZ environment as candidate factors. Spec must carry, by name: REG-only + LOO (bound at R2), defense-faced = same-season-adjustment-only never forward (validation **E4**), score fields = team-quality prior only, renamed from "game script" (validation **E5**/B5), RZ conversion enters (if at all) as regression-to-mean, tendency as levels (validation **E3**). Includes the **D3 fence amendment** as an **enumerated allowance for named modules** — extend `teamContextViewOnly.test.js`'s PIPELINE fence + both repos' contract wording to permit exactly the named projection modules (and decide whether `resolvePlayerTeam` becomes projection-legal or gets a projection-side sibling) — NOT a blanket loosening of display/scoring decoupling | open ⚑ | **R2-REANCHOR (blocking)**; R1-HARNESS (gate instrument); optionally R3-HCEXT | app · **opus Session-1 plan** (+ small data-side doc/contract mirror in the same slice summary) | ⚑ yes — weights activate only on clearing verdicts |
| **R3-FIT** | Assessment **E-2**: fitted per-position exponents over the existing factor stack (hand-tuned values as shrinkage prior; season-blocked CV; ship only positions that clear) | open ⚑ | R1-HARNESS (committed baseline) + R1-SNAPS (panel width, precondition (a)) + **R2-REANCHOR** (precondition (b)) | data (fit, analysis-only) → app (activation: `seasonProjection.js` weight constants + factors/snapshot contract + registry reclassifications) · **opus Session-1** for the activation slice | ⚑ yes, by definition |
| **R3-EFFACT** | Assessment **E-2b**: feature activations — QB EPA/att+CPOE vs passer rating (Step 5e), `air_yards_share` level (WR/TE; E-0a CLEARS for WR/TE, but provisional-pending-age — **gated on R1-AGE**), share-level anchor (E-0a graded-and-parked — cleared at no position, do not activate) | open ⚑ | R3-FIT framework + R1-EFF (QB family) + **R1-AGE (blocks airYardsShare activation)**; advstats already served | app · straight-Sonnet per activation once verdicts commit | ⚑ yes |
| **R3-HCEXT** | Assessment **E-1c-ext**: HC identity/HC-change additive fields on the teamcontext family (pbp `home_coach`/`away_coach`, era-remapped) — script-produced beats hand-backfilling coaching.json; feeds the C-2 instability factor | open | none hard; sensible before/parallel with R3-TCWIRE | data · straight-Sonnet (additive fields; catalog/registry/manifest updates owed) | activation ⚑ later |
| **R3-KTCMOM** | KTC-momentum as a market-vs-model-delta input | open ⚑ | **R0-KTC + post-fix history accrual** (the `ktcHist*` window needs ≥8 spaced snapshots ≈ 40+ days; a gradeable signal needs months) + R1-HARNESS-style gate | app · **opus Session-1** when accrual suffices | ⚑ yes |
| **R3-DOCS** | Docs-drift reconcile batch: audit **F1–F9** (incl. **F4** the capture-only-factor drift — advstats "recorded as capture-only factors in seasonProjection.js" claimed in registry §3A + data CLAUDE.md, never implemented) + validation **D5** (data-catalog.md:181,186) + **B5** wording (README/data-catalog "game script") | drift-route-to-reconcile | R0-KTC side-decision first (F9's wording depends on which side changed) | both repos · straight-Sonnet doc pass | no |

### Calendar-gated horizon (no session to schedule now)

- **R4-GRADE** (assessment **E-3b**): first in-basis forward grading when 2026 season-totals settle (~Jan–Feb 2027); recalibrate bands on true residuals; begin rookie calibration grading. Depends on R0-BANK discipline holding all season.
- **R4-REFIT** (assessment **E-3c** ⚑): re-fit exponents on forward residuals once ≥2 graded target seasons exist.
- **C-2 instability factor** becomes gradable only after ≥2 seasons of forward captures (R0-OLINE/R3-HCEXT accrual) — slow-burn by design.

### Orthogonal UI arc (open, independent, not on this critical path)

- **R-UI-VALUEEDGE**: the `value-tab-edge-career-navrail.md` slice (Explorer total/total career figure via a new `src/utils/careerSummary.js` + market dot + NavRail collapse) — **not landed** (verified: `careerSummary.js` absent, no `nav-collapsed` in `NavRail.jsx`, no market-dot in `PlayersTab.jsx`); plan exists; app · straight-Sonnet; view-only, no gate. This is the real item behind the backlog's "profile career-average migration" — see purge item P-3.
- Frontend-overhaul remaining slices (Board/Trade/Weekly gates, slice 7 `DEFAULT_ROUTE` flip) — tracked in `frontend-overhaul.md`; no interaction with the data/projection arc.

---

## 2. Dependency graph (edges, verified)

```
R0-BANK ────────────────────────────────► R4-GRADE (honest forward record)
R0-KTC ──► ktcHist accrual (calendar) ──► R3-KTCMOM
R0-CRON ─► protects all weekly captures (incl. the accrual R0-KTC starts)
R0-SLEEPER ─► server-side ephemeral record (de-risks R0-BANK structurally;
              future depth/status/injury factors accrue forward)
R1-HARNESS ─► gate instrument for every ⚑ ──► R3-FIT, R3-TCWIRE weights, R3-EFFACT, R3-KTCMOM
R1-SNAPS ──► panel width ──► R3-FIT (precondition a); strengthens every R1-HARNESS re-run
R1-EFF ───► QB candidates ──► R3-EFFACT
R2-REANCHOR ─► gates BOTH R3-TCWIRE AND R3-FIT (single node, high fan-out;
               carries REG-only + LOO + D4 policy in its DoD)
R3-TCWIRE ─► includes D3 fence amendment (enumerated allowance, named modules)
R3-HCEXT ──► feeds C-2 instability factor (with R0-OLINE forward accrual)
R3-DOCS ◄── R0-KTC side decision (F9 wording)
```

- Independent set (start any order, in parallel): all of Tier 0, R1-HARNESS, R1-SNAPS, R1-EFF, R-UI-VALUEEDGE.
- **No circular precedence found**: assessment ("C-6 before any fitting"; re-anchoring = E-2 precondition (b)) and validation ("re-anchoring before consumption") point the same direction; audit's spawn-order and this roadmap's loss-clock ordering agree on Tier 0 membership and differ only in intra-tier listing order (immaterial — all independent).

---

## 3. Stale premises purged (correct the planning notes)

| # | Stale premise (where it lives) | Reality (live anchor) |
|---|---|---|
| P-1 | frontend-1e "planned, awaiting sonnet impl" (memory/planning notes) | **Landed-already**: app commit `1c6975c` "feat: 1e dark contrest, palette, full width" |
| P-2 | aggregateWeeks/computeAvailability tests "awaiting sonnet impl" (memory; data `.claude/tasks/aggregate-weeks-tests.md` reads as pending) | **Landed-already**: data `test/sleeper.test.mjs` exists with the planned table-driven suite (CA1–CA11… present; imports `aggregateWeeks`, `computeAvailability` from `lib/sleeper.mjs`) |
| P-3 | "Profile career-average migration" (roadmap backlog wording) | **Phantom as described**: `value-tab-edge-career-navrail.md:39-44` explicitly does **not** touch the Profile metric ("we do not touch the Profile metric") — the Profile keeps mean-of-season-PPGs deliberately; the planned work is a **new Explorer** total/total career figure (`careerSummary.js`). That slice is **open** (see R-UI-VALUEEDGE), but no "Profile migration" exists to schedule |
| P-4 | "app loader + signal-registry row still open" (assessment header ref-drift note + its C-7 cell, written 2026-07-04) | **Landed-already** same-day-after: app `ae529f5` shipped `src/api/teamContext.js`, `src/utils/playerTeam.js`, and the registry row |
| P-5 | Assessment E-0c and audit B2 listed as separate items | **Duplicate** — same item (keep the snapshot import current); consolidated as R0-BANK |
| P-6 | advstats metrics "recorded as capture-only factors in `seasonProjection.js`" (app `docs/signal-registry.md` §3A; data CLAUDE.md contract row) | **Phantom** — never implemented; no advstats keys in the 73/51 factors contract (`factorsSchema.test.js`) or any captured snapshot (audit F4/E2). Routed to R3-DOCS + decision D-5 |
| P-7 | Older planning notes still describing as pending: KTC Spearman guard, season-keyed purge fix, usePlayersTable/PlayersDataTable extraction, season-totals v3 (both sides) | **All landed-already** — verified in the audit at `ae529f5`/`a817d45` (guard in `scripts/update-ktc.mjs` + `weekly-ktc.yml`; season-sourced purge in all 5 season-keyed workflows; shared table scaffolding in `src/hooks/usePlayersTable.js` + `PlayersDataTable.jsx`; v3 ↔ `MAX_SUPPORTED_SCHEMA=3`) |
| P-8 | Registry coverage cells: CFBD "data-store files 2017–2024"; season-totals-2025 "still `inProgress: true`"; KTC "weekly Monday snapshots thereafter" | **Stale** — college 2025 files on disk + manifest since 06-27; season-totals-2025 `inProgress: false` since 06-26; two KTC Mondays missing (audit F3/B1). Already routed to R3-DOCS; listed here so no plan builds on them |

---

## 4. Sequencing conflicts / open decisions (product-owner calls)

| # | Decision | Tension | Recommendation |
|---|---|---|---|
| **D-1** | **Gate form for R2-REANCHOR** (and by extension every ⚑ before 2027): forward in-basis grading is calendar-blocked until 2026 outcomes settle (~Jan–Feb 2027), yet R2-REANCHOR is scoring-affecting. Holding all scoring-affecting work for forward grading delays the entire arc a year; shipping ungated violates the standing discipline. | This is the roadmap's one genuine "scoring-affecting change with no committed grading run before it" flag — no committed grading or backtest report exists at all today (`backtests/`+`grading/` = `.gitkeep`). | Sequence R1-HARNESS **before** R2-REANCHOR and let the committed retrospective baseline + a season-blocked before/after comparison serve as the gate; frame R2-REANCHOR as a correctness fix (current attribution is factually wrong for team-changers) that still must show its retrospective delta before activation. Forward grading remains the Phase-3 recalibration, not the activation gate. |
| **D-2** | **Which side fixes R0-KTC**: app-side (`tryDataStore` allowlist/bypass for `ktc/snapshot-*`) vs data-side (register KTC snapshots `inProgress: false`, retiring the marker convention). | Data CLAUDE.md invariants deliberately define the marker; app semantics ("inProgress = fall back to live") are correct for season-totals. One side must move. | App-side: KTC snapshots are append-only and immutable, the flag is a semantic marker not a mutability signal, and the app is the only consumer misreading it. Either way R3-DOCS carries the wording (audit F9). |
| **D-3** | **R1-HARNESS timing vs R1-SNAPS**: run the baseline now on the ~2020–2024 control-complete panel and re-run after the snaps backfill, or wait for the panel first. | Not a true conflict — accepted duplication. | Run now (it is also the D-1 gate instrument and unblocks R2); re-run post-R1-SNAPS before R3-FIT. |
| **D-4** | **Multi-team-season join policy** (validation D4): dominant-team join (cheapest; season-totals v3 carries one `team`) vs games-weighted blend (team-week grain already pays for it). | Affects the exact players a projection cares about (trades correlate with role changes). | Decide inside R2-REANCHOR's spec; default dominant-team for v1, blend as a graded upgrade. |
| **D-5** | **Advstats capture-only factors** (P-6): correct the docs only, or actually wire `targetShare`/`airYardsShare`/`wopr`/`racr` into `factors`. | Wiring adds snapshot bulk for signals that are fully reconstructable from served per-year files — capture adds nothing grading needs. | Docs-correct only (R3-DOCS); activation of any advstats signal is an R1-HARNESS/R3-EFFACT question, not a capture question. |
| **D-6** | **Backlog wording** for "profile career-average migration" (P-3). | The named item doesn't exist as described. | Rename to the R-UI-VALUEEDGE slice (Explorer career figure per the existing plan file); explicitly reaffirm the Profile metric stays mean-of-seasons per that plan's divergence note. |

---

## 5. Per-item source + status citations

| ID | Source doc(s) | Live-source status anchor (verified this session) |
|---|---|---|
| R0-BANK | audit B2; assessment E-0c | data `snapshots/` ends `2026-06-21.json` at `a817d45` (manifest: 17 entries) |
| R0-KTC | audit A1 (headline) | `src/api/dataStore.js:80` (`if (entry.inProgress) return null`); data `manifest.json` all 5 `ktc/snapshot-*` `inProgress: true`; empirical all-null `ktcHist*` in `snapshots/2026-06-{11,21}.json` |
| R0-CRON | audit B1 | `git log -- ktc/`: no commit 05-25 or 06-08; `weekly-ktc.yml` cron `17 13 * * 1` |
| R0-SLEEPER | audit B3; registry §3C | app `projectionSnapshot.js:85-92` (no `injury_status`); data repo has no players-state ingest (script/workflow listing at `a817d45`) |
| R0-OLINE | assessment E-3a; data `context-instability-capture.md` | `enrichment/` holds coaching/scheme/injuries/notes only — no `oline.json` at `a817d45` |
| R1-HARNESS | assessment E-0a/§A.4/§F1 | landed; first verdict committed at `grading/2026-07-08-e0a-verdict.md` (data repo) |
| R1-SNAPS | assessment C-6/D.3/E-1a | `off_snp` 2020+ only (registry coverage table); no `nflverse/snaps/` family at `a817d45` |
| R1-EFF | assessment C-1/D.1-D.2/E-1b | no `nflverse/effstats/` family at `a817d45`; gamelogs serve per-game EPA/CPOE (view-only contract) |
| R1-BANDS | assessment E-0b/§B.3 | no bands in app display layer |
| R2-REANCHOR | validation D2 (high); assessment E-2 precondition (b); `docs/projection.md` "Deferred" | **verified live at `4230b5a`**: `src/utils/teamContext.js:120-123` (`playersMap[playerId]` → `player.team`), `:197` (`playersMap[playerId]?.team`), `:227` — current-team anchoring intact |
| R3-TCWIRE | validation D3/D4/A4/B4/E3/E4/E5; assessment E-1c; audit E1 | `App.jsx` has no `loadTeamContext` reference (loader-only confirmed); `teamContextViewOnly.test.js:26-47` fence forbids `api/teamContext` + `resolvePlayerTeam` across 14 pipeline modules |
| R3-FIT | assessment B.1(2)/E-2 | hand-set weights throughout `seasonProjection.js` (assessment §A.2, not re-derived) |
| R3-EFFACT | assessment E-2b/B.4 | Step-5e passer-rating composite live; advstats served 2012–2025 |
| R3-HCEXT | assessment E-1c-ext/C-2/D.2 | teamcontext family has no coach fields at `a817d45` |
| R3-KTCMOM | task prompt (market-vs-model arc); audit A1 blast radius | `ktcHist*` window requires ≥8 spaced snapshots (`ktcHistory.js:14-15`); accrual restarts at R0-KTC fix |
| R3-DOCS | audit F1–F9; validation D5/B5 | `docs/integrations.md:213` still v2/MAX=2; app `CLAUDE.md:76,187` still "2019 absent upstream"; `data-catalog.md:181,186` per validation |
| R4-GRADE/R4-REFIT | assessment E-3b/E-3c; grading-in-basis memory | season-totals 2025 settled `inProgress: false` 06-26; all committed snapshots target season 2026 |
| R-UI-VALUEEDGE | app `.claude/tasks/value-tab-edge-career-navrail.md` | `src/utils/careerSummary.js` absent; no `nav-collapsed` in `NavRail.jsx`; no market-dot tokens in `PlayersTab.jsx` |

**Data-repo verification note for the reviewer:** the app-scoped plan-reviewer cannot check data-repo claims; every data-side status above cites an exact path (`snapshots/`, `ktc/`, `backtests/`, `grading/`, `enrichment/`, `manifest.json`, `scripts/update-ktc.mjs:212`, `test/sleeper.test.mjs`) at `a817d45` for direct human verification.
