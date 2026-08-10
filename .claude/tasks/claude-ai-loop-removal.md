# Remove the Claude.ai project from the standard loop

Docs + agent-config only. **No source under `src/` is touched. No runtime or product behaviour changes.**

Session 1 (opus) plan. Implementer: sonnet.

---

## 0. Objective

Make the standard development loop fully in-repo and self-contained:

```
Session 1 (planning, opus)
  → plan-reviewer subagent   ← PRIMARY review gate
  → human approval
  → Session 2 (implementation, sonnet)
```

Two responsibilities currently held outside this repo move into `.claude/agents/plan-reviewer.md`:

- **(a) Strategic / principles review** — is the planned approach sound, and does it conform to this repo's Invariants?
- **(b) Cross-repo intent** — does the change touch a contract `sleeper-dashboard-data` must mirror, and what is that mirror?

Because the subagent is app-repo-scoped (`tools: Read, Grep, Glob`, no sibling tree access), (b) is performed **against an enumerated registry in CLAUDE.md, never by reading the sibling repo**. That forces a third change: the cross-repo section is converted from narrative prose to an explicit registry with a defined entry format. **This repo owns that format definition**; the data repo mirrors it verbatim.

---

## 1. Finding: the premise is half-true, and it shrinks the edit set

The task framing says CLAUDE.md "currently routes planning, plan-review, and prompt-authoring through an external Claude.ai project." **It does not.** Verified:

```
grep -rniE "claude\.ai|claude ai|claude project|project knowledge|prompt-author" --include="*.md" CLAUDE.md README.md docs/
→ zero hits outside .claude/tasks/ filesystem-path strings
```

`CLAUDE.md:210-241` documents only: the two-session flow, the handoff rule, a one-line plan-review call (`:220`), the model-routing table, and the sibling-repo pointer. The Claude.ai routing is **undocumented practice**, not documented workflow.

Consequences for this plan:

- There is **no prose to delete**. The workflow edit is *additive* — a loop diagram, an expanded review-gate subsection, and a new Claude.ai-is-out-of-loop subsection.
- The "preserve verbatim except where the rewrite requires" constraint is easy to honour: the two-session bullets, handoff paragraph, model-routing table, Stop hook and token-discipline rules are **untouched**. Only `:220` (the one-line plan-review call) is genuinely replaced, because that line is the thing whose ownership is changing.
- Nothing in `README.md` or `docs/*.md` describes the workflow, so those files need **no edits at all** (see §7).

---

## 2. Finding: the app-side cross-repo list is missing 6 contracts the sibling already tracks

Converting prose → registry is the moment this surfaces. Compared row-by-row against the data repo's table (`sleeper-dashboard-data/CLAUDE.md:245-262`):

| Contract | App CLAUDE.md `:179-188` | Data CLAUDE.md `:245-262` |
|---|---|---|
| Snapshot shape / target season | ✅ `:179` | ✅ `:247`, `:260` |
| season-totals schemaVersion | ✅ `:180` | ✅ `:248` |
| Enrichment schemas | ✅ `:181` | ✅ `:249` |
| Manifest | ✅ `:182` | ✅ `:250` |
| CFBD statType | ✅ `:183` | ✅ `:251` |
| roster/draft | ✅ `:184` | ✅ `:255` |
| advstats | ✅ `:185` | ✅ `:256` |
| schedule | ✅ `:186` | ✅ `:257` |
| gamelogs | ✅ `:187` | ✅ `:258` |
| teamcontext | ✅ `:188` | ✅ `:259` |
| **Snap & RZ usage stat keys** | ❌ **absent** | ✅ `:252` |
| **`pass_cmp` stat key** | ❌ **absent** | ✅ `:253` |
| **`rec_air_yd` stat key** | ❌ **absent** | ✅ `:254` |
| **`calculateFantasyPoints` port** | ❌ **absent** | ✅ `:261` |
| **R3-FIT factor-multiplier mirror** | ❌ **absent** | ✅ `:262` |
| **era-team remap (`eraTeam`)** | ⚠️ buried inside `:188` prose | ⚠️ buried inside `:259` prose |

The five missing ones are exactly the couplings where **the app is the source of truth and the data repo silently follows** — a change to `src/utils/fantasyPoints.js` or `src/utils/momentum.js` diverges the sibling's grading/fit with **no app-side diff and no test failure**. A registry that omits them gives the reviewer a blind spot precisely where the failure is silent.

**Decision: enumerate all 16.** Entries CR-01…CR-10 are the direct conversion of `:179-188`; CR-11…CR-16 are marked `(reconciliation — new to this repo's list, already tracked by the sibling)` so the human can strike any of them at approval time without unpicking the rest. This is a documentation reconciliation only — no behaviour, no contract, and no sibling file changes as a result.

---

## 3. Design: the registry entry format (this repo owns the definition)

### 3.1 Constraint that drives the design

> The format must be expressible in the data repo's CLAUDE.md **with no changes** — the sibling mirrors it exactly.

So: **no field may be perspective-relative.** The sibling's existing table uses `| Contract | This repo | App counterpart |`, whose column labels change meaning depending on which repo you are reading. That is precisely what cannot be mirrored. The format below uses absolute labels (`App side`, `Data side`), so **both repos hold a byte-identical registry body** and drift between them is a plain `diff`.

Block-per-entry, not a table: the sibling's current rows already run 500–2 000 characters wide, which is unreadable, un-diffable, and unparseable for the reviewer. Blocks also give the reviewer a stable field to scan (`Triggers`) and a stable field to quote (`Mirror`).

### 3.2 Format spec

Each entry is a level-4 heading plus a fixed six-field definition list. Field order is fixed. No field is optional.

```md
#### CR-NN · <short contract name>
- **App side:** <files / symbols / constants in sleeper-dashboard>
- **Data side:** <files / scripts / served paths in sleeper-dashboard-data>
- **Invariant:** <the single thing that must stay true across both repos>
- **Direction:** app→data | data→app | both
- **Triggers:** <concrete app-side paths/symbols>  ‖  <concrete data-side paths/symbols>
- **Mirror:** <the instruction to emit for the other repo when this entry is touched>
```

Field semantics:

| Field | Type | Cardinality | Notes |
|---|---|---|---|
| `CR-NN` | stable ID, zero-padded 2-digit | 1 | **Never renumbered or reused.** A retired contract keeps its ID and gains `**RETIRED (<date>):**` as the first words of `Invariant`. IDs are the shared handle across both repos — an ID present in one and not the other *is* the drift signal. |
| short contract name | free text, ≤ 6 words | 1 | Must match the sibling's copy character-for-character. |
| `App side` | comma-separated paths/symbols | ≥ 1 | Repo-relative paths in `sleeper-dashboard`. |
| `Data side` | comma-separated paths/symbols | ≥ 1 | Repo-relative paths in `sleeper-dashboard-data`, plus served CDN paths where they are the contract surface. |
| `Invariant` | one sentence | 1 | The thing that breaks if the two sides diverge. Not a description of the feature. |
| `Direction` | enum | 1 | `app→data` = app defines, data mirrors. `data→app` = data defines, app follows. `both` = shared constant or shape, neither leads, both change together. |
| `Triggers` | two lists separated by `‖` | 2 | Left = app-side, right = data-side. **Each repo's reviewer evaluates only its own side** — this is what keeps the check possible without cross-repo reads. |
| `Mirror` | imperative instruction | 1 | Written to be pasted into the other repo's task summary verbatim. |

Rules that travel with the format:

1. **Symmetry.** Both repos hold the identical registry body — same IDs, same names, same six fields, same order. Only the surrounding section prose differs.
2. **Additive by default.** New coupling → new highest-numbered entry in **both** repos in the same change.
3. **Triggers are concrete.** Paths, exported symbol names, constant names, served JSON paths. Never a category ("anything scoring-related") — the reviewer must be able to `Grep` a trigger.
4. **`Direction: app→data` entries are the silent ones.** Their `Mirror` text must say so, because nothing app-side fails when they drift.

### 3.3 The registry rule (new, normative)

> Any change touching a listed contract **must emit the sibling's mirror instructions as Session 1 output** — a `## Cross-repo impact` section in the task file quoting the entry ID and its `Mirror` field. "Called out in the task summary" is no longer sufficient; the mirror text itself is the deliverable.

### 3.4 The one residual Claude.ai case

The reviewer can check a plan against a **known list**. It cannot reason about a coupling that has never been written down. So:

> **Residual case (the only one):** a change that introduces a **brand-new cross-repo coupling not present in the registry**. Take that to the Claude.ai project, which can hold both repos in context at once. Its output is not a decision — it is a **draft CR entry** in the §3.2 format, which comes back into Session 1, lands in both repos' registries, and is then subject to the normal in-repo gate.

Everything else — including *extending* an existing entry — stays in-repo.

---

## 4. Edits grouped by file

Two files change. Nothing else.

### 4.1 `CLAUDE.md` — 4 edits

Current file is 281 lines. Apply in the order given (bottom-up line anchors stay valid if you work top-down and re-locate by heading text rather than by number).

---

#### Edit A — replace the cross-repo section body with the enumerated registry

**Location:** `CLAUDE.md:175-188` — heading `### Cross-repo contracts (with sleeper-dashboard-data)` (`:175`), lead prose (`:177`), 10 bullets (`:179-188`). Stop before the blank line at `:189` and the `---` at `:190`.

**Before (replace all of `:175-188`):**
```
### Cross-repo contracts (with sleeper-dashboard-data)

This repo cannot edit the data repo. Any change affecting these contracts **must be called out in the task summary** so `sleeper-dashboard-data` can be updated to match.

- **Snapshot shape:** …            (:179)
- **season-totals schemaVersion:** …  (:180)
- **Enrichment schemas:** …        (:181)
- **Manifest contract:** …         (:182)
- **CFBD pivot:** …                (:183)
- **nflverse roster/draft:** …     (:184)
- **nflverse advstats (view-only):** … (:185)
- **nflverse schedule (read-only):** … (:186)
- **nflverse gamelogs (view-only):** … (:187)
- **nflverse teamcontext (view-only):** … (:188)
```

**After:** the block below, verbatim. Note the heading text changes (`contracts` → `contract registry`) — Edit D fixes the one inbound anchor.

````md
### Cross-repo contract registry (with sleeper-dashboard-data)

This repo cannot edit the data repo. The registry below is the **complete enumerated list** of contracts the two repos share. It is the only authority for cross-repo checks — the plan-reviewer subagent checks against this list and never reads the sibling tree.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention).

#### Entry format

`sleeper-dashboard` owns this format definition; `sleeper-dashboard-data` mirrors the registry body byte-for-byte. Field order is fixed; no field is optional.

```
#### CR-NN · <short contract name>
- **App side:** <files / symbols / constants in sleeper-dashboard>
- **Data side:** <files / scripts / served paths in sleeper-dashboard-data>
- **Invariant:** <the single thing that must stay true across both repos>
- **Direction:** app→data | data→app | both
- **Triggers:** <app-side paths/symbols>  ‖  <data-side paths/symbols>
- **Mirror:** <instruction to emit for the other repo when this entry is touched>
```

- **Ids are permanent.** Never renumbered, never reused. A retired contract keeps its id and starts its `Invariant` with `**RETIRED (<date>):**`. An id present in one repo's registry and absent from the other *is* the drift signal.
- **`Direction`** — `app→data`: the app defines, the data repo mirrors. `data→app`: the data repo defines, the app follows. `both`: a shared constant or shape; neither leads, both change together.
- **`Triggers`** — app-side list, then `‖`, then data-side list. Each repo's reviewer evaluates **only its own side**; that is what makes the check possible without cross-repo reads. Triggers are always concrete paths, exported symbols, constant names or served JSON paths — never a category.
- **`Direction: app→data` entries are the silent ones** — nothing app-side fails when they drift. Their `Mirror` text says so.
- New coupling → new highest-numbered entry, added to **both** repos in the same change.

#### CR-01 · Projection snapshot envelope
- **App side:** `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 2`), `src/utils/exportData.js` `classifyKey` (routes `projection-snapshots/<date>` → `snapshots/<date>.json`), `src/utils/seasonProjection.js` (the verbatim `projection` payload)
- **Data side:** `snapshots/<date>.json`, `bin/update.mjs snapshots`, `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs` (`deriveTargetSeason` is the v1-only fallback), README snapshot section
- **Invariant:** the snapshot envelope the app writes is byte-compatible with what the importer and grader expect — at v2 that includes top-level `targetSeason`, `currentSeason` and verbatim `scoringSettings`, with `projection` as unmodified `computeNextSeasonProjection` output.
- **Direction:** app→data
- **Triggers:** `src/utils/projectionSnapshot.js`, `classifyKey` in `src/utils/exportData.js`, the `factors` object shape in `src/utils/seasonProjection.js`  ‖  `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `bin/import-snapshot.mjs`
- **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals only). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

#### CR-02 · season-totals schemaVersion & row composition
- **App side:** `src/api/dataStore.js` `MAX_SUPPORTED_SCHEMA = 3`, `src/utils/teamContext.js` `isTeamAggregateId`, `src/utils/playerTeam.js` `resolvePlayerTeam` (season grain reads `careerStats[season][pid].team`)
- **Data side:** `nfl/season-totals/<year>.json` (written v3), `lib/sleeper.mjs` `aggregateWeeks` (dominant-team derivation), `data-catalog.md` season-totals row
- **Invariant:** the app's supported-schema ceiling covers what the data repo writes, and the served row set is player rows **plus** `TEAM_<abbr>` whole-team aggregate pseudo-rows **plus** `<abbr>` DEF rows — consumers must exclude `TEAM_*` from any cross-player summation.
- **Direction:** both
- **Triggers:** `MAX_SUPPORTED_SCHEMA` in `src/api/dataStore.js`, `isTeamAggregateId`, any consumer summing across season-totals rows  ‖  `lib/sleeper.mjs` `aggregateWeeks`, the season-totals writer, the `TEAM_`/DEF pseudo-row emitters
- **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking.

#### CR-03 · Enrichment schemas
- **App side:** `src/api/enrichment.js` (`loadEnrichment`), `src/utils/enrichmentLookup.js` (`findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes`)
- **Data side:** `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs`, `npm run validate:enrichment`
- **Invariant:** every field the app's null-safe lookups read exists, with the same name and shape, in the enrichment files the data repo authors and validates.
- **Direction:** data→app
- **Triggers:** `src/api/enrichment.js`, `src/utils/enrichmentLookup.js`  ‖  `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs`
- **Mirror:** Any field add, rename or removal must be mirrored in the app's loader and lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching season-totals file; orphaned entries are validator-flagged and silently ignored app-side.

#### CR-04 · Manifest contract
- **App side:** `src/api/dataStore.js` — `getManifestEntry` plus every validator gating on `schemaVersion` / `inProgress` / `lastModified`
- **Data side:** `manifest.json`, `lib/manifest.mjs`
- **Invariant:** manifest field names and shape are a public API; the app keys entries by served path and must ignore unknown families.
- **Direction:** data→app
- **Triggers:** `getManifestEntry` and the validator block in `src/api/dataStore.js`  ‖  `manifest.json`, `lib/manifest.mjs`
- **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate.

#### CR-05 · CFBD statType keys
- **App side:** `src/api/cfbd.js` `pivotStatRows`
- **Data side:** `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `college/<category>/<year>.json`
- **Invariant:** the confirmed `statType` set stored per category is exactly the set the app's pivot expects.
- **Direction:** both
- **Triggers:** `pivotStatRows` in `src/api/cfbd.js`  ‖  `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`
- **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones.

#### CR-06 · nflverse roster & draft
- **App side:** `src/api/nflRoster.js` (`MIN_ROSTER_IDS = 1500`), `src/api/nflDraft.js`, `src/utils/nflDraftMatch.js`
- **Data side:** `nflverse/roster/<year>.json`, `nflverse/draft/draft_picks.json`, `bin/update.mjs roster` / `draft`, `scripts/update-roster.mjs`, `scripts/update-draft.mjs`
- **Invariant:** the served shapes (`players` keyed by `sleeper_id`; `rowCount`; `picksByYear`) and the shared `MIN_ROSTER_IDS = 1500` sparsity gate match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflRoster.js`, `src/api/nflDraft.js`, `MIN_ROSTER_IDS`  ‖  `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, the roster/draft writers
- **Mirror:** Shape or sparsity-constant changes land in both repos together. The app has no live fallback for either family — it must get them from the store.

#### CR-07 · nflverse advstats (view-only)
- **App side:** `src/api/advStats.js` (`MIN_ADVSTATS_ROWS = 250`), `src/components/AdvancedStatsPanel.jsx`, guarded by `src/__tests__/advStatsViewOnly.test.js`
- **Data side:** `nflverse/advstats/<year>.json`, `bin/update.mjs advstats`, `scripts/update-advstats.mjs`
- **Invariant:** served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the shared `MIN_ADVSTATS_ROWS = 250` gate match, and the family stays out of projection/scoring on both sides.
- **Direction:** both
- **Triggers:** `src/api/advStats.js`, `MIN_ADVSTATS_ROWS`, `src/components/AdvancedStatsPanel.jsx`  ‖  `scripts/update-advstats.mjs`
- **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

#### CR-08 · nflverse schedule (read-only)
- **App side:** `src/api/nflSchedule.js`, `src/api/dataStore.js` `isValidSchedule` + `MIN_SCHEDULE_GAMES = 200`, `src/utils/nflStats.js` `buildGameLog`, guarded by `src/__tests__/scheduleViewOnly.test.js`
- **Data side:** `nflverse/schedule/<year>.json`, `bin/update.mjs schedule`, `scripts/update-schedule.mjs` (← nflverse `nfldata` `games.csv`)
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`, each game carrying the 15 named fields; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` are valid) and the shared `MIN_SCHEDULE_GAMES = 200` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflSchedule.js`, `isValidSchedule` + `MIN_SCHEDULE_GAMES` in `src/api/dataStore.js`  ‖  `scripts/update-schedule.mjs`
- **Mirror:** Shape or floor changes land in both repos together. Read-only — not wired into projection/scoring. The app-side consumer is `NflStatsTab`'s game log, joining on the per-season `team` from season-totals v3 (CR-02).

#### CR-09 · nflverse gamelogs (view-only)
- **App side:** `src/api/nflGameLogs.js`, `src/api/dataStore.js` `isValidGameLogs` + `MIN_PLAYERGAME_ROWS = 3000`, guarded by `src/__tests__/gameLogsViewOnly.test.js`
- **Data side:** `nflverse/gamelogs/<year>.json`, `bin/update.mjs gamelogs`, `scripts/update-gamelogs.mjs`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; sparse per-game stats where an absent key is null and a present `0` is a real zero) and the shared `MIN_PLAYERGAME_ROWS = 3000` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflGameLogs.js`, `isValidGameLogs` + `MIN_PLAYERGAME_ROWS` in `src/api/dataStore.js`  ‖  `scripts/update-gamelogs.mjs`
- **Mirror:** Shape or floor changes land in both repos together. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed. `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 is absent upstream (known gap; degrades to the empty shape).

#### CR-10 · nflverse teamcontext (view-only)
- **App side:** `src/api/teamContext.js` (loader — distinct from `src/utils/teamContext.js`), `src/api/dataStore.js` `isValidTeamContext` + `MIN_TEAMCONTEXT_ROWS = 60`, `src/utils/playerTeam.js` (join), guarded by `src/__tests__/teamContextViewOnly.test.js`
- **Data side:** `nflverse/teamcontext/<year>.json`, `bin/update.mjs teamcontext`, `scripts/update-teamcontext.mjs` (← nflverse pbp)
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST) and the shared `MIN_TEAMCONTEXT_ROWS = 60` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/teamContext.js`, `isValidTeamContext` + `MIN_TEAMCONTEXT_ROWS` in `src/api/dataStore.js`, `src/utils/playerTeam.js`  ‖  `scripts/update-teamcontext.mjs`
- **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. View-only on both sides. Team-key domain is CR-16.

#### CR-11 · Snap & red-zone usage stat keys *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/usageMetrics.js` `computeUsageFactors` (reads `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`), `src/utils/teamRzShare.js`
- **Data side:** `lib/sleeper.mjs` aggregation into `nfl/season-totals/<year>.json` — these keys are preserved as-is and never stripped or filtered by any schema operation
- **Invariant:** the five usage stat keys survive season-totals aggregation unmodified.
- **Direction:** data→app
- **Triggers:** `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`  ‖  `lib/sleeper.mjs`, any season-totals key filter or schema operation
- **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The dependency is invisible at runtime; this registry entry is the only thing recording it.

#### CR-12 · `pass_cmp` stat key (QB passer rating) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/efficiencyMetrics.js` `passerRating` (`pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`), reused view-only by `src/utils/outlookPositionStats.js`
- **Data side:** `lib/sleeper.mjs` generic sum-all-keys path into `nfl/season-totals/<year>.json`
- **Invariant:** `pass_cmp` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** `src/utils/efficiencyMetrics.js` `passerRating`  ‖  `lib/sleeper.mjs` key-preservation path
- **Mirror:** Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) — silent, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app, and must be preserved as-is rather than "fixed".

#### CR-13 · `rec_air_yd` stat key (aDOT diagnostic) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/seasonProjection.js` — reads `rec_air_yd` and `rec_tgt` to compute the capture-only `factors.adot` (WR/TE)
- **Data side:** `lib/sleeper.mjs` generic sum-all-keys path into `nfl/season-totals/<year>.json`; confirmed present 2012–present
- **Invariant:** `rec_air_yd` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** the aDOT block in `src/utils/seasonProjection.js`  ‖  `lib/sleeper.mjs` key-preservation path
- **Mirror:** Preserve `rec_air_yd`. Missing → `factors.adot: null`; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

#### CR-14 · `calculateFantasyPoints` port *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/fantasyPoints.js` `calculateFantasyPoints(stats, scoringSettings)` — the source of truth
- **Data side:** `lib/fantasyPoints.mjs` — a hand-maintained mirror; feeds `buildInBasisOutcomes` and in-basis grading in `lib/grade.mjs` / `bin/grade.mjs`
- **Invariant:** the data repo's port reproduces the app's scoring formula exactly — loop `scoringSettings` keys, skip null multiplier or stat, round to 2 dp.
- **Direction:** app→data
- **Triggers:** `src/utils/fantasyPoints.js`  ‖  `lib/fantasyPoints.mjs`
- **Mirror:** Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed.

#### CR-15 · R3-FIT factor-multiplier mirror *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/momentum.js`, `src/utils/regressionSignals.js`, `src/utils/teamContext.js` (`computeShareTrend`, `computeHistoricalShares`, `computeHistoricalTeamTotals`, `resolveAttributedTeam`), `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/seasonProjection.js` (qualifying-season builder, rookie-vs-veteran routing, basePPG per-length weight table, label→factor maps, forward-mover neutralization, `combinedNewFactorRaw` membership and its `[0.67, 1.50]` clamp)
- **Data side:** `lib/projectionFactors.mjs`, `lib/panel.mjs` `predictWithExponents`, `bin/panel.mjs --fit`, parity-guarded by `test/panel-fit.test.mjs`
- **Invariant:** every mirrored constant, gate, shrinkage K, qualifying threshold, routing condition, sentinel branch, series-construction branch, denominator accumulator, cohort reference season, position gating, and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly.
- **Direction:** app→data
- **Triggers:** any of the six listed `src/utils/` modules  ‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `test/panel-fit.test.mjs`
- **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.**

#### CR-16 · Era-accurate team-code remap *(reconciliation — was buried in the teamcontext prose)*
- **App side:** `src/utils/playerTeam.js` `eraTeam(abbr, season)` — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019
- **Data side:** the pbp `eraTeam` remap in `scripts/update-teamcontext.mjs`, plus the schedule-domain normalization in `lib/sleeper.mjs` that produces season-totals `team`
- **Invariant:** both repos map franchise abbreviations to the same era-accurate code for the same season, so team keys join across teamcontext, schedule and season-totals.
- **Direction:** both
- **Triggers:** `eraTeam` in `src/utils/playerTeam.js`  ‖  the era remap in `scripts/update-teamcontext.mjs`, schedule-domain normalization in `lib/sleeper.mjs`
- **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change**. A one-sided edit produces silently empty joins rather than an error — the team key simply never matches.
````

---

#### Edit B — rewrite the workflow section

**Location:** `CLAUDE.md:210-220` — from the `## Workflow convention` heading through the one-line plan-review call at `:220`. **Stop at `:220`.** Everything from `:222` (`### Which model for which task`) onward — the routing table `:224-236`, the sonnet-uncovers line `:238`, the sibling-repo line `:240` — is **preserved verbatim** (`:240` gets a one-token anchor fix in Edit D).

**Before (`:210-220`):**
```
## Workflow convention

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: …
- Sonnet session: …
- **Visual verification is the user's job.** …

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2.
```

**After:** the block below. The three bullets at `:214-216` and the handoff paragraph at `:218` are **copied through unchanged** — do not retype them, and do not reword them. Only the framing paragraph is new, and `:220` is replaced by the `### Plan review` and `### The Claude.ai project` subsections.

```md
## Workflow convention

**The standard loop is fully in-repo.** Every step — planning, review, approval, implementation — happens in this repository against live source. Nothing in the standard loop depends on an external tool or on a chat held outside it.

```
Session 1 (planning, opus)
  → plan-reviewer subagent   ← the review gate
  → human approval
  → Session 2 (implementation, sonnet)
```

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.
- **Visual verification is the user's job.** Claude Code must NOT start the dev server (`npm run dev` / `npm run preview`) or run any browser/visual/smoke test. Validate with `npm test` / `npm run lint` / `npm run build` only, then hand back for the user's manual smoke. This is especially load-bearing for theming/palette work, whose acceptance is the user's eyes in light **and** dark.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

### Plan review

The plan-reviewer subagent (`.claude/agents/plan-reviewer.md`) is the **primary review gate**, not a lint pass. Invoke it on the task file at the end of Session 1, before Session 2. Its mandate is three-part:

1. **Factual / mechanical** — paths, function signatures, data shapes, stat keys and step ordering, checked against live source.
2. **Strategic / principles** — whether the planned approach is sound and conforms to the [Invariants](#invariants) above: a plan that is factually accurate but violates an invariant, or solves the problem the wrong way, gets flagged.
3. **Cross-repo intent** — whether the plan touches a [registry](#cross-repo-contract-registry-with-sleeper-dashboard-data) entry, and if so whether Session 1 emitted that entry's `Mirror` text. The reviewer checks against the registry only; it never reads the sibling tree.

**Flags are advisory input to the human, not an auto-apply queue.** Session 1 reports them verbatim and does not act on them. The human decides what to fix. Session 2 starts only after human approval.

### The Claude.ai project

**Out of the standard loop.** The Claude.ai project is an occasional exploration tool — open-ended thinking, cross-repo reading, research that has not yet become a plan. It is not a review gate, it does not author task files, and no step of the standard loop waits on it.

**The one residual case that still routes there:** a change that introduces a **brand-new cross-repo coupling not yet present in the registry**. A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling that has never been written down, and it cannot read the sibling tree to discover one. Take that case to the Claude.ai project, which can hold both repos at once.

Its output is not a decision — it is a **draft registry entry** in the [entry format](#entry-format). That draft returns to Session 1, lands in both repos' registries in the same change, and is then subject to the normal in-repo gate like anything else. Extending an existing entry is *not* this case and stays in-repo.
```

---

#### Edit C — point self-maintenance at the registry rule

**Location:** `CLAUDE.md:248` — the closing line of `## Self-maintenance`. Single-line replacement; leave `:246` untouched.

**Before (`:248`):**
```
If a change affects a Cross-repo contract, state it explicitly in your task summary so `sleeper-dashboard-data` can be updated to match.
```

**After:**
```
If a change touches a [registry](#cross-repo-contract-registry-with-sleeper-dashboard-data) entry, emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).
```

---

#### Edit D — fix the one inbound anchor

**Location:** `CLAUDE.md:240`. Edit A renames the heading, so this link breaks. One-token change; the rest of the line is unchanged.

**Before:** `… See [Cross-repo contracts](#cross-repo-contracts-with-sleeper-dashboard-data).`
**After:** `… See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data).`

`grep -rn "cross-repo-contracts" --include="*.md" .` (excluding `.claude/tasks/`) returns **only** this line — verified. Historical task files under `.claude/tasks/` reference the old heading in prose; they are point-in-time records and must **not** be rewritten.

---

### 4.2 `.claude/agents/plan-reviewer.md` — 1 edit (full-body replacement)

**Location:** whole file, 22 lines. **Frontmatter `:1-6` changes only in the `description` line; `name`, `tools` and `model` stay exactly as they are** — `tools: Read, Grep, Glob` is what makes the sibling-tree ban structural rather than merely instructed.

**After (full file):**

```md
---
name: plan-reviewer
description: Read-only reviewer for Session 1 task files — the primary review gate. Invoke after a task file is written to .claude/tasks/ and before Session 2 implementation. Checks the plan against live source, against this repo's invariants, and against the cross-repo contract registry.
tools: Read, Grep, Glob
model: opus
---

You are the review gate for this repo's planning sessions. A planning session has written a task file to .claude/tasks/<feature>.md. Your job is to surface problems before mechanical implementation begins. You are the only review the plan gets before a human approves it — there is no external reviewer behind you.

Read the task file under review (the one named in the invocation, or the most recently modified file in .claude/tasks/ if none is named). Then read only the source files, functions, and data shapes the plan references — targeted reads, not whole directories.

Your mandate has three parts. Run all three on every task file.

## 1. Factual / mechanical

- Wrong file or repo targeted (path or repo does not match where the symbol actually lives).
- A data shape, function signature, or stat key in the plan that does not match live source.
- Step ordering that would break intermediate state (e.g. a consumer edited before the producer it depends on; a migration applied before its guard).
- A missing edge case the change clearly needs.

## 2. Strategic / principles

Read the **Invariants** section of CLAUDE.md before judging this — read it, do not rely on memory, and do not restate it in your output. Then ask whether the plan is the right shape:

- Does it violate a documented invariant, or route around one instead of through it?
- Is a factually-correct plan still solving the problem the wrong way — a new module where an existing one already owns the concern, a fork of logic that has a single source today, state placed where this repo's architecture says it does not belong?
- Does it widen a boundary the repo deliberately holds narrow (a view-only family reaching into projection/scoring, a capture-only factor moving a score, an ephemeral input treated as reconstructable)?
- Does it add a dependency, library, or layer the invariants exclude?

Flag the specific invariant the plan runs into, by name. Do not flag stylistic preferences, and do not re-litigate a design the plan states as a settled decision with a reason.

## 3. Cross-repo intent

Read the **Cross-repo contract registry** section of CLAUDE.md. It is an enumerated list of `CR-NN` entries; it is your **only** authority here.

**You cannot read the sibling repo — do not try, and do not infer its contents.** Check the plan's touched artifacts against each entry's `Triggers` field, app side only (the part left of `‖`).

For every entry the plan touches:

- If the task file has no `## Cross-repo impact` section quoting that entry's id and `Mirror` text, flag it — and include the `Mirror` text yourself in the MIRROR block below so the planning session has it.
- If the section exists but the mirror text is incomplete or contradicts the entry, flag the difference.
- Pay particular attention to `Direction: app→data` entries. Nothing in this repo fails when those drift; a missing mirror there is a silent defect, not a paperwork miss.

If the plan appears to create a cross-repo coupling that **no registry entry covers**, flag it as `[registry-gap]`. That is the one case that routes out of the in-repo loop — say so, and do not attempt to draft the entry yourself.

## Output

Stay silent on solid decisions. Do not restate or summarize the plan. Do not rewrite it. Do not propose stylistic changes. Do not edit any file. Your flags are advisory — the human decides what gets fixed.

Emit up to two blocks, in this order:

```
FLAGS
FLAG [category]: <one-line problem> — <file:symbol or line anchor>
…

MIRROR
CR-NN · <contract name> — <the entry's Mirror text>
…
```

Categories: `mechanical`, `shape`, `ordering`, `edge-case`, `invariant`, `strategy`, `cross-repo`, `registry-gap`.

Omit `FLAGS` if there are none. Omit `MIRROR` if the plan touches no registry entry. If both are empty, output exactly: "No blocking issues found." and nothing else.
```

**Note the deliberate change in the no-issues contract.** The old file said "if the plan is sound, output exactly 'No blocking issues found.' and nothing else" — which would suppress the mirror block on a clean plan that touches a contract. The new rule scopes that string to *both* blocks being empty.

---

## 5. Step sequence

Docs-only, so ordering is about reviewability, not correctness.

1. **Edit A** — replace `CLAUDE.md:175-188` with the registry (largest edit; do it first while anchors are fresh).
2. **Edit D** — fix the anchor at `:240`. Do this immediately after A so the file never sits with a broken link.
3. **Edit B** — rewrite `CLAUDE.md:210-220`. Copy the three bullets and the handoff paragraph through byte-for-byte.
4. **Edit C** — replace `CLAUDE.md:248`.
5. **Replace `.claude/agents/plan-reviewer.md`** in full.
6. **Verify** (§6).
7. **Do not touch the data repo.** §8 is the spec for a *separate* data-repo session; this session ends at the app repo boundary.

---

## 6. Verification

No behavioural change, so verification is structural. Run in order:

```bash
npm test && npm run lint && npm run build
```

All three must be green — not because this change could break them, but because the Stop hook (`.claude/hooks/verify-on-stop.sh`) runs `npm test && npm run build` whenever `git status --porcelain` is non-empty, and a docs edit makes the tree dirty. **This is expected. Let it run; do not bypass it, and do not touch the hook** (preserving it verbatim is an explicit constraint of this task).

Then the structural checks:

| # | Check | Command / method | Expected |
|---|---|---|---|
| V1 | No source touched | `git status --porcelain -- src/` | empty |
| V2 | Only two files changed | `git status --porcelain` | exactly `CLAUDE.md` + `.claude/agents/plan-reviewer.md` (plus this task file) |
| V3 | Anchor resolves | `grep -n "cross-repo-contract-registry-with-sleeper-dashboard-data" CLAUDE.md` | 3 hits: the link at `:240`, the link in Edit C's line, the link in Edit B's Plan-review item 3 — and a heading `### Cross-repo contract registry (with sleeper-dashboard-data)` |
| V4 | No stale anchor | `grep -rn "#cross-repo-contracts-with" --include="*.md" . \| grep -v .claude/tasks/` | no hits |
| V5 | 16 entries, contiguous ids | `grep -n "^#### CR-" CLAUDE.md` | `CR-01`…`CR-16`, in order, no gaps |
| V6 | Every entry has all six fields | `grep -c "^\- \*\*Mirror:\*\*" CLAUDE.md` and the same for `App side` / `Data side` / `Invariant` / `Direction` / `Triggers` | 16 each |
| V7 | Model table intact | `git diff CLAUDE.md` | the `### Which model for which task` table shows **no** diff lines |
| V8 | Two-session bullets intact | `git diff CLAUDE.md` | the three workflow bullets and the handoff paragraph show **no** diff lines |
| V9 | Agent tool grant unchanged | `grep -n "^tools:" .claude/agents/plan-reviewer.md` | `tools: Read, Grep, Glob` |

**V7 and V8 are the real acceptance test for the "preserve verbatim" constraint.** If either shows diff lines, the bullets were retyped rather than copied — revert and redo Edit B.

---

## 7. Docs updates

Every doc that needs editing, and confirmation for those that do not.

### Needs editing

| File | Section | What |
|---|---|---|
| `CLAUDE.md` | `### Cross-repo contracts (with sleeper-dashboard-data)` (`:175-188`) | **Replace the whole section with the enumerated registry in Edit A.** Heading text changes to `### Cross-repo contract registry (with sleeper-dashboard-data)`. |
| `CLAUDE.md` | `## Workflow convention` (`:210-220` only) | **Replace with the rewritten section in Edit B** — adds the in-repo framing + loop diagram, the `### Plan review` subsection, and the `### The Claude.ai project` subsection incl. the residual-case paragraph. Preserves the three bullets and the handoff paragraph byte-for-byte. `:222` onward untouched. |
| `CLAUDE.md` | `## Self-maintenance`, final line (`:248`) | **Replace with Edit C** — one-line swap from "state it in your task summary" to the registry-emission rule. `:246` untouched. |
| `CLAUDE.md` | Sibling-repo line (`:240`) | **Anchor fix, Edit D** — `#cross-repo-contracts-with-…` → `#cross-repo-contract-registry-with-…`. |
| `.claude/agents/plan-reviewer.md` | whole file | **Replace with the body in §4.2.** Frontmatter `description` updated; `name` / `tools` / `model` unchanged. |

### Explicitly needs no editing

- **`README.md` — no changes.** Verified: it documents tech stack, theming, local setup, testing, project structure and the docs index. It contains no workflow, review, or cross-repo-contract content. The `## Documentation` index at `:173-205` lists only `docs/*.md` files, none of which are affected.
- **`docs/*.md` — no changes, all 13 files.** Verified by grep across `docs/` for workflow, review, session, and Claude.ai keywords: zero hits describing the development loop. The docs are behavioural/product documentation (`architecture.md`, `projection.md`, `dynasty-scoring.md`, `integrations.md`, `ui.md`, `signal-registry.md`, the two design docs, the findings docs). `docs/signal-registry.md` is a *signal* registry and is unrelated to the *contract* registry introduced here — do not conflate them, and do not cross-link them.
- **`.claude/hooks/verify-on-stop.sh` — no changes** (explicit constraint).
- **`.claude/settings.json` — no changes.**
- **`.claude/tasks/*.md` — no changes.** Historical task files reference the old heading name in prose. They are point-in-time records; rewriting them would falsify the record.

---

## 8. Cross-repo impact

**This change touches the registry format itself — the highest-order cross-repo contract there is.** It also *creates* the artifact the sibling must mirror.

By the rule this plan introduces, no existing `CR-NN` entry is touched: nothing here changes a served shape, a shared constant, a stat key, or a scoring formula. The impact is entirely at the meta level — **`sleeper-dashboard` now owns a registry format definition that `sleeper-dashboard-data` must adopt.**

Below is everything the data repo needs. **It is a spec for a separate data-repo session, not work for this one.** Sequence it *after* the app-repo edits land, so the app's registry is the reference copy.

### 8.1 Format spec the sibling adopts

Exactly §3.2 of this file — reproduced in the data repo's CLAUDE.md as the `#### Entry format` block from Edit A, **verbatim**. It is already perspective-neutral: `App side` / `Data side` mean the same thing read from either repo, so no field needs adapting. That was the design constraint, and it is met — **the registry body is byte-identical in both repos.**

This replaces the sibling's current 3-column table (`| Contract | This repo | App counterpart |`, `CLAUDE.md:245-262`), whose `This repo` column is perspective-relative and therefore cannot be mirrored.

### 8.2 Registry content for the data repo

**The full 16-entry body from Edit A, copied byte-for-byte.** Do not re-author it from the data repo's perspective — that would reintroduce exactly the asymmetry the format exists to remove, and would make drift undetectable by `diff`.

Mapping from the sibling's current rows, so nothing is lost in the conversion:

| Data CLAUDE.md row (`:245-262`) | Becomes |
|---|---|
| Snapshot shape (`:247`) + Snapshot target season (`:260`) | **CR-01** (merged — they are one envelope) |
| season-totals schemaVersion (`:248`) | CR-02 |
| Enrichment schemas (`:249`) | CR-03 |
| Manifest contract (`:250`) | CR-04 |
| CFBD statType keys (`:251`) | CR-05 |
| nflverse roster/draft (`:255`) | CR-06 |
| nflverse advstats (`:256`) | CR-07 |
| nflverse schedule (`:257`) | CR-08 |
| nflverse gamelogs (`:258`) | CR-09 |
| nflverse teamcontext (`:259`) | CR-10 |
| Snap & RZ usage stat keys (`:252`) | CR-11 |
| `pass_cmp` stat key (`:253`) | CR-12 |
| `rec_air_yd` stat key (`:254`) | CR-13 |
| `calculateFantasyPoints` port (`:261`) | CR-14 |
| R3-FIT factor-multiplier mirror (`:262`) | CR-15 |
| era-remap prose inside teamcontext (`:259`) | **CR-16** (promoted to its own entry — its trigger is a franchise move, orthogonal to any one family) |

Preserve as-is, immediately after the registry body: the two `> *Note:*` paragraphs at `:264` (`nflverse/playerids.json` is repo-internal, not a cross-repo contract) and `:266` (`nflverse/oline/<year>.json` is capture-only, no app loader, not a cross-repo contract). **These are deliberate non-entries and are load-bearing** — they record that two families were *considered* and *excluded*. Do not convert them into `CR-` entries; do not drop them.

Section framing for the data repo (replacing `:243`):

```md
## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The registry below is the **complete enumerated list** of contracts the two repos share, and it is byte-identical to the copy in `sleeper-dashboard/CLAUDE.md` — `sleeper-dashboard` owns the format definition; this repo mirrors it exactly. It is the only authority for cross-repo checks; the plan-reviewer subagent checks against this list and never reads the sibling tree.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see Workflow convention.
```

### 8.3 Workflow rewrite for the data repo

The data repo **has no `## Workflow convention` section at all** — its two-session flow is undocumented, and plan review appears only as `Done-definition` item 4 (`:284`). It needs the equivalent of Edit B, created from scratch.

- **Insert a new `## Workflow convention` section between `## Sibling repo` (`:270-274`) and `## Done-definition` (`:278`)** — i.e. after the `---` at `:276`.
- Content: the same in-repo framing paragraph, the same loop diagram, the same `### Plan review` three-part-mandate subsection, and the same `### The Claude.ai project` out-of-loop + residual-case subsection, with these repo-appropriate substitutions:
  - The `Invariants` link points at the data repo's own `## Invariants` (`:215-237`).
  - The registry link points at the data repo's own registry section.
  - **Do not import the app's model-routing table or its visual-verification bullet** — visual verification is app-specific and there is nothing to look at here.
  - The two-session bullets adapt: the opus bullet is unchanged in substance; the sonnet bullet's validation step is `npm run smoke` (+ `npm run validate:enrichment` for enrichment changes), not `npm run build`.
- **`Done-definition` item 4 (`:284`)** — replace `"Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2."` with a pointer: `"Plan review: see Workflow convention → Plan review. The subagent is the primary review gate, not a lint pass."` Items 1, 2, 3, 5 unchanged.
- **`## Session git workflow` (`:289-301`) is untouched** — it is data-repo-specific (manifest union-merge, rebase-before-push, CDN purge) and has no app analogue.
- **`## Self-maintenance` (`:307`), final sentence** — replace `"If a change affects a Cross-repo contract, state that explicitly in your task summary so the sibling repo can be updated to match."` with the registry-emission rule from Edit C, adapted: emit the entry's `Mirror` text in a `## Cross-repo impact` section quoting the `CR-NN` id; a new coupling gets an entry in both repos in the same change. The signal-registry and `data-catalog.md` sentences earlier in that paragraph are untouched.

### 8.4 Subagent mandate for the data repo

`sleeper-dashboard-data/.claude/agents/plan-reviewer.md` (24 lines) gets the same three-part restructure. Keep `tools: Read, Grep, Glob` and `model: opus`.

- **Part 1 (factual/mechanical)** — keep the data repo's existing domain-specific checks verbatim; they are sharper than the app's and must not be flattened into the app's wording. Specifically retain: the manifest-before-data-file ordering trap, the CDN-purge sequencing rule (re-runs purge both manifest and season file; new season files self-serve), the capture-only invariant check, the append-only / content-hash-idempotency check (count-based guards false-positive on broad recalibration), and the per-season rate-aggregation trap (`pass_rtg` summed instead of recomputed).
- **Part 2 (strategic/principles)** — new. Same shape as the app's: read the data repo's `## Invariants` section, do not restate it, flag the specific invariant by name. The data repo's eight invariants are the reference (append-only, never hand-edit primary data, manifest-is-the-index, schemaVersion discipline, snapshots-are-permanent, enrichment schemas, yearly sentinel maintenance, season-derived CDN purge URLs, grading-never-recomputes).
- **Part 3 (cross-repo intent)** — new, replacing the current single bullet at `:20` (`"a cross-repo contract the plan touches but does not flag for the sibling app repo (shared constants such as MIN_SCHEDULE_GAMES, the fantasyPoints scoring mirror)"`). Same text as the app's Part 3 with one substitution: the reviewer evaluates the **data side** of each `Triggers` field — the part **right** of `‖` — and cannot read the app tree.
- **Output block** — identical to §4.2, including the `FLAGS` / `MIRROR` split and the scoped "No blocking issues found." rule.

### 8.5 Drift check, once both sides land

The registry bodies are byte-identical by construction, so:

```bash
diff <(sed -n '/^#### CR-01/,/^---$/p' "CLAUDE.md") <(sed -n '/^#### CR-01/,/^---$/p' "../sleeper-dashboard-data/CLAUDE.md")
```

Empty output = in sync. This is a manual check for the human, **not** something either subagent can run (neither can read the other tree) and not a CI gate — adding one would mean giving a build step cross-repo access, which is the coupling this whole design avoids.

---

## 9. Tests to add

**None.**

This change edits two markdown files. It adds no function, no module, no data shape, and no runtime path. Nothing in `src/` is touched, so there is no behaviour for a Vitest suite to assert against, and the repo has no docs-linting or markdown-link-checking infrastructure to extend.

Per `CLAUDE.md` → *Done-definition* item 1, purely non-behavioural changes — "renames, docs, lint, dead-code removal" — need no tests. This is squarely that case.

**Verification is the structural checklist in §6 (V1–V9), which the implementer runs by hand.** V7 and V8 in particular are the acceptance test for the preserve-verbatim constraint. The existing suite still runs green via the Stop hook, which is coverage that nothing was broken, not coverage of what was added.

**Not worth building, and deliberately declined:**
- A markdown-link checker. It would catch V3/V4, but adding a lint dependency and a `package.json` script to a docs-only change violates the "no runtime/product change" constraint and is disproportionate to a one-time anchor rename.
- A registry-format schema validator. The registry is read by a human and by an LLM subagent, both tolerant of formatting slips; a validator would be more brittle than the thing it validates, and it would need to live in both repos to be worth anything.
- A cross-repo registry-diff CI gate. Rejected in §8.5 for a substantive reason: it would require giving a build step access to both trees, which is exactly the coupling this design exists to avoid.

---

## 10. Non-goals / out of scope

- **No source under `src/` is touched.** V1 is the check.
- **No data-repo edits in this session.** §8 is a spec, not a task list for here.
- **The Stop hook, task-file handoff, effort/model routing table and token-discipline rules are preserved verbatim.** Only review ownership and the cross-repo registry format change.
- **Historical `.claude/tasks/*.md` are not rewritten.** They record what was true when written.
- **`docs/signal-registry.md` is untouched and unrelated.** Signal registry ≠ contract registry.
- **The Claude.ai project is not deleted or disabled** — it is documented as out of the standard loop, with exactly one residual routing case.
- **Whether the six reconciliation entries (CR-11…CR-16) stay is the human's call at approval.** They are marked in-line so any can be struck without disturbing CR-01…CR-10. Striking them costs nothing structurally and loses the `app→data` silent-drift coverage.
