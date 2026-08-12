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

Because the subagent is app-repo-scoped (`tools: Read, Grep, Glob`, no sibling tree access), (b) is performed **against an enumerated registry, never by reading the sibling repo**. That forces a third change: the cross-repo section is converted from narrative prose to an explicit registry with a defined entry format. **This repo owns that format definition**; the data repo mirrors it verbatim.

**Placement decision (settled).** The enumerated registry body does **not** live in `CLAUDE.md`. It lives in a new `docs/cross-repo-registry.md`; `CLAUDE.md` keeps only a one-line pointer plus the normative rule. This honours CLAUDE.md's own self-maintenance rule — *"Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into the relevant `docs/` file and link to it rather than duplicating it here."* An 18-entry registry inlined into CLAUDE.md would be the single largest block in the file and would violate that rule the day it landed. Nothing is lost: the subagent has `Read`, the pointer names the exact path, and a file read on demand is strictly cheaper than a permanently-resident block in the always-loaded instructions file.

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
- Nothing in `README.md` or `docs/*.md` describes the workflow, so no existing doc needs a content edit (see §7).

---

## 2. Finding: the app-side cross-repo list is missing 6 contracts the sibling already tracks — and both repos are missing 2 more

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
| **KTC value snapshots** | ❌ **absent from both** | ❌ **absent from both** |
| **`docs/signal-registry.md` data→app row obligation** | ⚠️ Self-maintenance prose (`:246`), never a contract | ⚠️ Self-maintenance prose (`:307`), never a contract |

The five missing ones are exactly the couplings where **the app is the source of truth and the data repo silently follows** — a change to `src/utils/fantasyPoints.js` or `src/utils/momentum.js` diverges the sibling's grading/fit with **no app-side diff and no test failure**. A registry that omits them gives the reviewer a blind spot precisely where the failure is silent.

The last two rows are worse: they are absent from *both* repos' lists. KTC is a fully live served family with a fetch site, a validator and a producer script, and it has never been written down as a contract on either side. The signal-registry obligation is documented as *prose in a Self-maintenance paragraph in each repo* and is therefore invisible to a reviewer checking a registry.

**Decision: enumerate all 18.** Entries CR-01…CR-10 are the direct conversion of `:179-188`; CR-11…CR-16 are marked `(reconciliation — new to this repo's list, already tracked by the sibling)` so the human can strike any of them at approval time without unpicking the rest; CR-17 and CR-18 are marked `(new — found by the §2.1 completeness sweep, absent from both repos)`. This is a documentation reconciliation only — no behaviour, no contract, and no sibling data change as a result.

### 2.1 Which contracts exist (entry-discovery sweep)

Two mechanical passes, both run against live source rather than against the old prose list.

**Pass 1 — every app-side data-store fetch/validate call site.** `grep -rn "tryDataStore(" src/` (excluding tests) returns 13 non-test call sites; each maps to a family:

| Call site | Validator | Covered by |
|---|---|---|
| `src/api/sleeperStats.js:147` | `isValidSeasonTotals` | CR-02 |
| `src/api/enrichment.js:46-49` (×4) | `isValidEnrichment` | CR-03 |
| `src/api/cfbd.js:61` | `isValidCFBDRows` | CR-05 |
| `src/api/nflRoster.js:77` | `isValidRoster` | CR-06 |
| `src/api/nflDraft.js:72` | `isValidDraft` | CR-06 |
| `src/api/advStats.js:62` | `isValidAdvStats` | CR-07 |
| `src/api/nflSchedule.js:75` | `isValidSchedule` | CR-08 |
| `src/api/nflGameLogs.js:81` | `isValidGameLogs` | CR-09 |
| `src/api/teamContext.js:93` | `isValidTeamContext` | CR-10 |
| **`src/utils/ktcHistory.js:147`** | **`isValidKtcSnapshot`** | **nothing — gap → CR-17** |

Plus `getManifestEntry` / the `tryDataStore` validator block itself → CR-04, and the write direction (`src/utils/projectionSnapshot.js` + `classifyKey`) → CR-01. **One gap: KTC.**

**Pass 2 — the documented Self-maintenance obligations in both CLAUDE.md files.** App `:246`: keep CLAUDE.md current (repo-internal), and update `docs/signal-registry.md` on any signal/factor add/remove/reclassify. Data `:307`: keep CLAUDE.md current (repo-internal), flag the app's `docs/signal-registry.md` for update on any ingested-field/stat-key/source change, update `data-catalog.md` (data-repo-internal storage index), and the cross-repo sentence itself. **One gap: the signal-registry obligation is a genuine data→app coupling with no entry → CR-18.** `data-catalog.md` is data-repo-internal and rides along as the data-side half of CR-18's mirror rather than earning its own entry.

**Everything else is clean, explicitly:**

- No app-side consumer exists for `nflverse/playerids.json`, `nflverse/oline/<year>.json`, or `nfl/players-state/<date>.json` — `grep -rn "playerids\|playerIds\|players-state\|oline" src/` returns one unrelated comment hit in `src/hooks/usePlayerProfile.js:14` and nothing else. The data repo's two deliberate `> *Note:*` non-entries (`CLAUDE.md:264`, `:266`) remain correct as written; `nfl/players-state/*` reaches the app only as additive manifest entries, which CR-04 already covers.
- No other app-side artifact is written *into* the data repo besides the projection-snapshot export path (CR-01).

After CR-17 and CR-18, both passes are clean. No further entries were found.

### 2.2 Whether each contract's triggers are complete (per-entry consumer/producer sweep)

§2.1 answers *which contracts exist*. It does **not** answer *whether a given entry's `Triggers` would actually fire* — and three consecutive review rounds found live consumers missing from entries that were themselves correctly present. An entry whose triggers miss a real consumer is worse than a missing entry: it looks like coverage and is not.

**Method, run for all 18 entries.** For every stat key, exported symbol, shape field and file path an entry names, grep it across **both** trees — `src/` on the app side, `lib/` + `scripts/` + `bin/` on the data side — and require that a change to *any* real consumer or producer of that data matches a trigger on the correct side. Test-only, fixture-only and comment-only hits do not count as consumers; a hit that reads or writes the value does.

#### 2.2.0 The two completeness burdens are bounded, not eliminated — and this is what closes the review loop

The three rounds of app-side trigger gaps were treated as a defect to be ground out by ever-more-thorough grepping. That framing is wrong — but the fix is not "app-side completeness doesn't matter." It is symmetric: each repo's plan-reviewer self-heals its **own** side of the registry, because it reads that repo's live source on every review, and it consults the **far** side as frozen authority, because it cannot read the sibling tree at all. From this repo's reviewer, the app side is near and the data side is far — but the data repo's own reviewer is in the mirror-image position (§8.1), and it treats *this repo's* app-side triggers as its frozen authority. So both sides must be kept reasonably complete; what differs is not whether completeness matters, but how the burden of maintaining it is paid:

| Side of `‖`, from this repo's reviewer | Burden | Why |
|---|---|---|
| **Data side** (`lib/`, `scripts/`, `bin/`, README, mirrored constants) — the **far** side here | **Frozen authority.** Must be right in the registry, verified by this pass, kept right by the both-repos-same-change rule. | The app-repo subagent checks cross-repo intent **against the registry and never reads the sibling tree** (`tools: Read, Grep, Glob`, no sibling access). A data-side trigger the registry omits is invisible — there is no live source to fall back on, ever, from this side. |
| **App side** (`src/`) — the **near** side here | **Bounded, self-healing maintenance — not zero maintenance.** Must still be reasonably complete, because the data repo's reviewer treats this exact list as *its* frozen authority. What bounds the ongoing cost is that this repo's subagent re-derives app-side consumers against live source on **every** Session 1 review that touches an entry, so a gap surfaces and gets corrected at the next relevant review instead of requiring a dedicated exhaustiveness sweep. | The subagent reads live app source on every review. It can re-derive app-side consumers on the spot and flag what an entry misses — so ongoing `src/` churn is absorbed by normal review cadence, not by how thoroughly any one pass grepped. |

**So the fix is a standing duty on both sides, not a bigger one-time grep.** §4.3's Part 3 gains an explicit obligation: on every review, for each registry entry whose data shape or stat key the planned change reads or writes, **re-verify that entry's app-side consumers against live `src/` source** and flag any consumer the entry does not cover. The data repo carries the mirror-image duty on its own near (data) side (§8.4). Neither duty exempts either repo from keeping its side reasonably complete — it only means completeness is maintained continuously by the review loop itself, rather than needing a one-off perfect enumeration.

This is what lets the registry legitimately call itself each reviewer's authority. The claim it makes is precise and symmetric: **each side is frozen authority for the sibling's reviewer, and self-healing, via live re-verification, for its own.** The app-side triggers below need to be reasonably complete now, for the data repo's sake; the standing duty is what keeps that true as `src/` changes, without requiring this pass — or any single pass — to be the last word.

> **Supersession.** This reframe supersedes any earlier language in this plan claiming app-side triggers need not be complete, or that no further app-side maintenance is ever required — including the closing guarantee previously at the end of §2.2. Data-side completeness is unchanged and remains a hard requirement; app-side completeness is also required, for the data repo's sake, and is kept true by the standing re-verification duty rather than by any one pass being exhaustive. The app-side triggers recorded below are still the best current list, and the corrections in this pass still land.

**One structural finding shaped several rows.** Three families of trigger were systematically absent from the pre-sweep entries:

1. **Constant *definition* sites.** Every shared sparsity constant is defined in `lib/nflverse.mjs` (`MIN_ROSTER_IDS:18`, `MIN_ADVSTATS_ROWS:35`, `MIN_SCHEDULE_GAMES:45`, `MIN_PLAYERGAME_ROWS:48`, `MIN_TEAMCONTEXT_ROWS:53`) and enforced in `lib/validate.mjs`. The entries listed only the `scripts/update-*.mjs` consumers — so **editing a shared constant's value matched no trigger in CR-06…CR-10.** That is the single highest-value hole the sweep closed.
2. **Data-side shape validators.** `lib/validate.mjs` holds the data-repo mirror of every app `isValid*` function (`validateNflSeason:100`, `validateCfbdCategory:204`, `validateKtc:237`, `validateRoster:307`, `validateDraft:339`, `validateAdvStats:407`, `validateSchedule:435`, `validateGameLogs:467`, `validateTeamContext:504`, `validateEnrichmentShape:747`). Not one appeared in any entry.
3. **Keys with no literal data-side occurrence.** `pass_cmp` and `rec_air_yd` appear **nowhere** in `lib/`, `scripts/` or `bin/` — season-totals aggregation is a generic sum-all-keys loop (`lib/sleeper.mjs` `aggregateWeeks`, the `Object.entries(stats)` loop at `:216`), so a key-name grep can never be the data-side trigger for those entries. The loop itself is the trigger, and the entries now say so.

**Results, entry by entry.** "Verified complete" means the grep found no consumer or producer outside the triggers already listed.

| Entry | App side | Data side |
|---|---|---|
| CR-01 | Verified complete — writer, router and payload are the whole surface | **Added** `scripts/panel-run.mjs` `resolveScoring` (`:70-77`, reads `snapshot.scoringSettings`) and `lib/grade.mjs` (scores the snapshot payload) |
| CR-02 | **Added (round 3)** the only readers of the v3 per-season `team`: `resolvePlayerTeam` (`src/utils/playerTeam.js:53-63`) and `resolveAttributedTeam` (`src/utils/teamContext.js:18`, consumed at `:164`/`:195`/`:247`/`:281`, `src/utils/teamRzShare.js:85`, `src/utils/seasonProjection.js:488`). Also replaced the category trigger "any consumer summing across season-totals rows" with six concrete summers, including `computeTeamContext` (`:154`, loops `:161`/`:192`) as a distinct summer from `computeHistoricalShares` (corrected to `:269`, row loop `:275` — the two were previously conflated under one anchor) | **Added** `scripts/update-nfl.mjs` (writer, `:49/:53`), `lib/validate.mjs` `validateNflSeason` (`:100`), `lib/backtest.mjs` `isTeamAggregateId` (the data-side `TEAM_` filter), `lib/panel.mjs` `buildTeamTotalsForSeason` (`:80`), `lib/sleeper.mjs:261` (writes per-season `team`) |
| CR-03 | **Added** `src/App.jsx:268` (`loadEnrichment` call site), `src/components/AvailabilityHistory.jsx:116` (`findInjuryForWeek` — the injury-payload consumer) | **Added** `lib/validate.mjs` `validateEnrichmentShape` (`:747`) |
| CR-04 | **Corrected (round 3)** — the earlier "verified complete" was **wrong**. Nine `src/api/*` modules go through `getManifestEntry`, but `src/utils/ktcHistory.js` `loadKtcHistory:92-126` reads the manifest **object directly** (`getCache('data-store/manifest')` → `Object.keys(manifest.files)`, `manifest.files[path].lastModified`), bypassing the accessor entirely — its own header at `:4-6` labels this a "Coupling note". Renaming `files` or `lastModified` matched no trigger. Added | **Corrected** the registrar count: 12 of the 13 `scripts/update-*.mjs` writers route through the exported symbols `updateManifestEntry` (`lib/manifest.mjs:34`) / `readManifest` (`:19`) — `update-enrichment.mjs` does **not** register — plus three non-`update-*` registrars, `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, and `lib/enrichment.mjs`, so the symbol is the greppable trigger rather than any one path list |
| CR-05 | **Corrected (round 3)** — the round-2 anchor was a comment and named the wrong reader. `src/utils/collegeMetrics.js:57-59` is a **comment block**; its live literal reads are only `YDS`/`TD`/`ATT` (`:69-124`). `COMPLETIONS` and `PCT` are read in `src/components/PlayersTab.jsx:682-683`, which appeared in neither field. Both files now listed with their symptoms separated. Kept: `isValidCFBDRows` (`src/api/dataStore.js:107-110`), `src/utils/collegeMatch.js:125-127` | **Added** `lib/validate.mjs` `validateCfbdCategory` (`:204`) |
| CR-06 | **Added** `loadCurrentRoster` (`src/api/nflRoster.js:55`), `loadNflDraftPicks` (`src/api/nflDraft.js:50`), `src/utils/relevance.js` (consumes the roster-id Set) | **Added** `lib/nflverse.mjs` `MIN_ROSTER_IDS` (`:18` — definition), `lib/validate.mjs` `validateRoster` (`:307`) / `validateDraft` (`:339`) |
| CR-07 | **Added** `loadAdvStats` (`src/api/advStats.js:46`), `src/App.jsx:893` | **Added** `lib/nflverse.mjs` `MIN_ADVSTATS_ROWS` (`:35`), `lib/validate.mjs` `validateAdvStats` (`:407`) |
| CR-08 | **Added** `src/components/players/NflStatsTab.jsx:273` (the only live consumer of the loader) | **Added** `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES` (`:45`), `lib/validate.mjs` `validateSchedule` (`:435`) |
| CR-09 | Verified complete (loader + `isValidGameLogs` + `resolvePlayerTeam` already added last pass) | **Added** `lib/nflverse.mjs` `MIN_PLAYERGAME_ROWS` (`:48`), `parsePlayerGameLogs` / `rekeyGameLogsBySleeper`, `lib/validate.mjs` `validateGameLogs` (`:467`) |
| CR-10 | **Added** `getTeamSeasonRows` / `getTeamWeekRow` (`src/api/teamContext.js:121/131` — the shape-reading lookups) | **Added** `lib/nflverse.mjs` `MIN_TEAMCONTEXT_ROWS` (`:53`) + `aggregateTeamContext`, `lib/validate.mjs` `validateTeamContext` (`:504`, incl. the era-domain guard at `:515`) |
| CR-11 | **Added** `src/utils/durabilitySignals.js:34-35`, `src/utils/teamContext.js:254-255`, and — beyond the flagged pair — `src/utils/outlookUsage.js:62-63` (view-only snap% history) | **Added** the `aggregateWeeks` sum-all-keys loop (`lib/sleeper.mjs:216`) as the producer trigger, plus data-side consumers `lib/panel.mjs` (`:87-88`, `:179`, `:191/:206`, `:874-886`, `:911-912`, `:1131-1132`), `lib/backtest.mjs` (`:225-226`, `:274-275`, `:284-297`), `lib/projectionFactors.mjs` |
| CR-12 | **Added** `src/utils/nflStats.js:28` (`compPct` recomputed from `pass_cmp`) | **Added** the `aggregateWeeks` loop. Recorded: `pass_cmp` has **zero** literal occurrences in `lib/`/`scripts/`/`bin/` — the key-name grep cannot be the trigger |
| CR-13 | **Added** `src/utils/outlookPositionStats.js:51/153/141` (team air-yards denominator, AY share, aDOT cell) | **Added** the `aggregateWeeks` loop. Recorded: `rec_air_yd` also has zero literal data-side occurrences |
| CR-14 | Verified complete — `src/App.jsx:788/790/795` and `src/api/sleeperStats.js:199` call `calculateFantasyPoints` but do not define the math; the mirror contract is the module, so triggers stay scoped to `src/utils/fantasyPoints.js` | **Corrected**: `buildInBasisOutcomes` is `scripts/grade-snapshot.mjs:87` (imports `calculateFantasyPoints` + `RATE_KEYS` at `:20`, applies at `:90`/`:109`), consumed by `scripts/panel-run.mjs:92` — **not** in `lib/grade.mjs` or `bin/grade.mjs`. Recorded: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) has **no app counterpart** |
| CR-15 | Verified complete — the six listed modules are the mirror surface. `dynastyScore.js` appears at `lib/projectionFactors.mjs:110` only as a *contrast* ("dynastyScore.js's copy unfloored"), so it is **not** mirrored and is deliberately not a trigger | **Added** `scripts/panel-run.mjs` (`runFit` `:878`, `attachFactorMultipliers` call `:166`) |
| CR-16 | **Added** `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` (`:2`) + `normalizeTeamForSchedule` (`:4`) — a **second** mirrored constant in the same team-code domain, which the data repo explicitly mirrors | **Corrected** to `lib/nflverse.mjs` `eraTeam` (`:958`, applied `:1084-1087`); **added** `lib/sleeper.mjs` `SCHEDULE_TEAM_ALIAS` (`:22`) / `normalizeTeamForSchedule` (`:25`, applied `:261`) and the `lib/validate.mjs:515` era-domain guard. **Removed** `scripts/update-teamcontext.mjs` as a trigger — it names `eraTeam` only in a header comment (`:13`), so it is not greppable and violated the entry format's own rule |
| CR-17 | **Added** `src/api/ktc.js` (live DOM scraper emitting the identical `{name,team,value,position}` at `:51`), `computeKtcSignals` (`src/utils/ktcHistory.js`, consumed by `src/utils/seasonProjection.js:11/307`), `computeKtcRecentDelta` (`:338`, consumed by `src/components/PlayersTab.jsx:9/1873`), `src/App.jsx:249` | **Added** `lib/validate.mjs` `validateKtc` (`:237`), `snapshotHash` (`scripts/update-ktc.mjs:39`) |
| CR-18 | Verified complete | **Added** `data-catalog.md:6` (its explicit *"link, don't merge"* pointer at the app's registry) and `CLAUDE.md:274` (the Sibling-repo pointer). **Round 3:** replaced the category trigger "any change to an ingested field/stat key/source or its historical coverage" with the concrete ingest and coverage-floor anchors (`scripts/update-*.mjs`, the `lib/nflverse.mjs` parsers/aggregators, and the `MIN_*_SEASON` / `MIN_DRAFT_YEAR` constants that *encode* historical coverage) |

**Guarantee this buys — stated precisely, per §2.2.0.**

- **Data side: frozen authority for this repo's reviewer.** Every entry's data-side triggers match a change to any live consumer or producer in `lib/`, `scripts/` or `bin/`, verified by grep against live source rather than inherited from prose. This is load-bearing because the app-repo subagent has no other way to see the sibling tree. It stays true via the both-repos-same-change rule, not via re-grepping.
- **App side: reasonably complete now, kept that way by the standing duty — not exempt from completeness.** The app-side triggers are the best current list and three rounds of corrections have landed in them. They matter for the mirror-image reason the data side does: the data repo's own reviewer treats this exact list as *its* frozen authority, since it cannot read `src/`. What bounds the ongoing maintenance cost is the mandate's standing re-verification duty (§4.3 Part 3), which re-derives app-side consumers against live source on every relevant review and surfaces a gap at the next touch rather than letting it rot unseen. Do **not** read this section as saying app-side completeness is optional; §2.2.0 corrects any earlier reading that said so.

Re-run the data-side half of this sweep whenever an entry is added or a data-repo family gains a consumer — that half has no live-source fallback on the app-repo side of the loop, so a gap there stays invisible until the next dedicated sweep, not merely until the next touch.

---

## 3. Design: the registry entry format (this repo owns the definition)

### 3.1 Constraint that drives the design

> The format must be expressible in the data repo's CLAUDE.md/README **with no changes** — the sibling mirrors it exactly.

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

1. **Symmetry.** Both repos hold the identical registry body — same IDs, same names, same six fields, same order. Only the surrounding section prose and the *host file* differ.
2. **Additive by default.** New coupling → new highest-numbered entry in **both** repos in the same change.
3. **Triggers are concrete.** Paths, exported symbol names, constant names, served JSON paths. Never a category ("anything scoring-related") — the reviewer must be able to `Grep` a trigger.
4. **`Direction: app→data` entries are the silent ones.** Their `Mirror` text must say so, because nothing app-side fails when they drift.

### 3.3 The registry rule (new, normative)

> Any change touching a listed contract **must emit the sibling's mirror instructions as Session 1 output** — a `## Cross-repo impact` section in the task file quoting the entry ID and its `Mirror` field. "Called out in the task summary" is no longer sufficient; the mirror text itself is the deliverable.

### 3.4 The one residual Claude.ai case

The reviewer can check a plan against a **known list**. It cannot reason about a coupling that has never been written down. So:

> **Residual case (the only one):** a change that introduces a **brand-new cross-repo coupling not present in the registry**. Take that to the Claude.ai project, which can hold both repos in context at once. Its output is not a decision — it is a **draft CR entry** in the §3.2 format, which comes back into Session 1, lands in both repos' registries, and is then subject to the normal in-repo gate.

Everything else — including *extending* an existing entry — stays in-repo.

### 3.5 Where the body lives is a per-repo choice; the body itself is not

The format spec and the entry bodies are byte-identical across both repos. **The host file is not, and deliberately so** — each repo puts the body wherever its own thin-CLAUDE.md rule says deep detail belongs:

| Repo | CLAUDE.md holds | Registry body lives in | Because |
|---|---|---|---|
| `sleeper-dashboard` | pointer + rule | **`docs/cross-repo-registry.md`** (new) | CLAUDE.md `:246`: *"Push deep detail into the relevant `docs/` file and link to it."* |
| `sleeper-dashboard-data` | pointer + rule | **`README.md`**, new top-level section | Data CLAUDE.md `:309`: *"push deep detail into README.md and link to it."* The data repo **has no `docs/` tree** — see §8.0. |

This does not weaken the symmetry rule. The `diff` in §8.5 targets the two bodies, wherever they sit; the ids, names, fields and order are what must match, and they do.

---

## 4. Edits grouped by file

Three files change: `CLAUDE.md` (4 edits), a new `docs/cross-repo-registry.md`, and `.claude/agents/plan-reviewer.md`. Nothing else.

### 4.1 `CLAUDE.md` — 4 edits

Current file is 281 lines. **Apply bottom-up — Edit C, then D, then B, then A** (see §5). Every line anchor below is against the *unmodified* file, and working from the highest line number downward keeps all of them valid.

---

#### Edit A — replace the cross-repo section body with a pointer and the rule

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

```md
### Cross-repo contract registry (with sleeper-dashboard-data)

This repo cannot edit the data repo. The **complete enumerated registry** — the entry-format definition and all 18 `CR-NN` entries — lives in [docs/cross-repo-registry.md](docs/cross-repo-registry.md). It is the sole authority for what the data repo must mirror: the plan-reviewer subagent reads that file and never reads the sibling tree. Its app-side trigger lists are a maintained cache the subagent re-verifies against live `src/` on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention).
```

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

**After:** the block below. It contains an inner fenced code block, so the outer fence is **four backticks** — copy everything between the four-backtick markers, not including them. The three bullets at `:214-216` and the handoff paragraph at `:218` are **copied through unchanged** — do not retype them, and do not reword them. Only the framing paragraph is new, and `:220` is replaced by the `### Plan review` and `### The Claude.ai project` subsections.

````md
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
3. **Cross-repo intent** — whether the plan touches an entry in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), and if so whether Session 1 emitted that entry's `Mirror` text. The reviewer checks against that registry only; it never reads the sibling tree.

**Flags are advisory input to the human, not an auto-apply queue.** Session 1 reports them verbatim and does not act on them. The human decides what to fix. Session 2 starts only after human approval.

### The Claude.ai project

**Out of the standard loop.** The Claude.ai project is an occasional exploration tool — open-ended thinking, cross-repo reading, research that has not yet become a plan. It is not a review gate, it does not author task files, and no step of the standard loop waits on it.

**The one residual case that still routes there:** a change that introduces a **brand-new cross-repo coupling not yet present in the registry**. A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling that has never been written down, and it cannot read the sibling tree to discover one. Take that case to the Claude.ai project, which can hold both repos at once.

Its output is not a decision — it is a **draft registry entry** in the format defined at the top of [docs/cross-repo-registry.md](docs/cross-repo-registry.md). That draft returns to Session 1, lands in both repos' registries in the same change, and is then subject to the normal in-repo gate like anything else. Extending an existing entry is *not* this case and stays in-repo.
````

---

#### Edit C — point self-maintenance at the registry rule

**Location:** `CLAUDE.md:248` — the closing line of `## Self-maintenance`. Single-line replacement; leave `:246` untouched.

**Before (`:248`):**
```
If a change affects a Cross-repo contract, state it explicitly in your task summary so `sleeper-dashboard-data` can be updated to match.
```

**After:**
```
If a change touches an entry in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).
```

---

#### Edit D — fix the one inbound anchor

**Location:** `CLAUDE.md:240`. Edit A renames the heading, so this link breaks. One-token change; the rest of the line is unchanged.

**Before:** `… See [Cross-repo contracts](#cross-repo-contracts-with-sleeper-dashboard-data).`
**After:** `… See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data).`

`grep -rn "cross-repo-contracts" --include="*.md" .` (excluding `.claude/tasks/`) returns **only** this line — verified. Historical task files under `.claude/tasks/` reference the old heading in prose; they are point-in-time records and must **not** be rewritten.

---

### 4.2 `docs/cross-repo-registry.md` — new file (Edit E)

**Location:** new file at `docs/cross-repo-registry.md`. Nothing is replaced; this is a create.

**After (full file):** everything between the four-backtick markers. The outer fence is four backticks because the file body contains a three-backtick fenced block (the entry-format template).

````md
# Cross-repo contract registry (with sleeper-dashboard-data)

This app repo cannot edit `sleeper-dashboard-data`, and the data repo cannot edit this one. This file is the **complete enumerated list** of contracts the two repos share, and the sole authority for what the sibling must mirror — the plan-reviewer subagent (`.claude/agents/plan-reviewer.md`) checks against this list and never reads the sibling tree. Precisely: the **far side** of each entry's `Triggers` is authoritative here because no live source is reachable for it; the **near side** is a maintained cache the reviewer re-verifies against live source on every review. See *Entry format* below.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable. See CLAUDE.md → *Cross-repo contract registry* and *Workflow convention*.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see CLAUDE.md → *Workflow convention → The Claude.ai project*.

`sleeper-dashboard` owns the format definition below. `sleeper-dashboard-data` mirrors the format and the entry bodies byte-for-byte, in its own `README.md` (it has no `docs/` tree). The two bodies are `diff`-able; see *Drift check* at the end.

## Mirrored region and its sentinels

Everything between the two sentinel comments below is the **mirrored region**: it is byte-identical to the corresponding region of `sleeper-dashboard-data/README.md`, and the drift check at the end of this file diffs exactly that span. The region includes the `## Entry format` block that follows this section, not only the entries — the byte-identical guarantee has to cover the format definition itself, or the two repos could silently drift on what an entry is even required to contain while `diff` kept reporting nothing. Rules:

- The sentinels are the literal lines `<!-- CR-REGISTRY-BEGIN -->` and `<!-- CR-REGISTRY-END -->`, alone on their own line, once each per file. Prose may mention them only inline (in backticks, as here) — never as a bare line — because the drift check anchors on `^…$`.
- **Everything repo-specific goes outside the sentinels**: section framing, the pointer prose, the two `> *Note:*` non-entry paragraphs the data repo preserves, and each file's own terminating heading. Inside the sentinels is the shared, byte-identical body — the `## Entry format` block (definition plus rules) and all `CR-NN` entries — and nothing else.
- Adding, editing or retiring an entry means editing inside the sentinels in **both** repos in the same change. So does editing the entry-format definition or its rules.

<!-- CR-REGISTRY-BEGIN -->

## Entry format

Field order is fixed; no field is optional.

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
- **`Triggers` must name definition sites, not just call sites.** A shared constant's *definition* (`lib/nflverse.mjs MIN_SCHEDULE_GAMES`) and a shape's *validator* (`lib/validate.mjs validateSchedule`, `src/api/dataStore.js isValidSchedule`) are triggers in their own right. Where a value flows through a generic path that never names it — season-totals aggregation is a sum-all-keys loop — the **loop** is the trigger, because the key name greps to nothing.
- **The two sides carry different completeness burdens.** Each repo's reviewer can read its own tree and cannot read the other one, so:
  - **The far side of `‖` is frozen authority.** A reviewer cannot fall back on live source for the repo it cannot read, so a trigger missing there is invisible. Far-side triggers must be correct in this registry and are kept correct by the both-repos-same-change rule — never by re-deriving them at review time.
  - **The near side of `‖` is a maintained cache.** The reviewer re-verifies it against live source on every review (see the plan-reviewer mandate) and flags consumers the entry does not list. So the near-side list should be accurate, but it is not required to be provably exhaustive at any one point in time — a gap in it is self-healing rather than silent, because the standing re-verification duty catches it at the next relevant review. That does not make the near side low-stakes: it is the *far*-side authority for the sibling repo's reviewer, which cannot read this side's live source at all.

  Read from `sleeper-dashboard`, "near" is the app side and "far" is the data side; read from `sleeper-dashboard-data`, it is the reverse. The wording is deliberately perspective-neutral so this bullet mirrors byte-for-byte like the rest of the registry.
- New coupling → new highest-numbered entry, added to **both** repos in the same change.

#### CR-01 · Projection snapshot envelope
- **App side:** `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 2`), `src/utils/exportData.js` `classifyKey` (routes `projection-snapshots/<date>` → `snapshots/<date>.json`), `src/utils/seasonProjection.js` (the verbatim `projection` payload)
- **Data side:** `snapshots/<date>.json`, `bin/update.mjs snapshots`, `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs` (`deriveTargetSeason:34` is the v1-only fallback; envelope reads at `:168`/`:231`/`:316`), `lib/grade.mjs` (scores the snapshot payload), `scripts/panel-run.mjs` `resolveScoring` (`:70-77`, reads `snapshot.scoringSettings`), `bin/import-snapshot.mjs`, README snapshot section
- **Invariant:** the snapshot envelope the app writes is byte-compatible with what the importer and grader expect — at v2 that includes top-level `targetSeason`, `currentSeason` and verbatim `scoringSettings`, with `projection` as unmodified `computeNextSeasonProjection` output.
- **Direction:** app→data
- **Triggers:** `src/utils/projectionSnapshot.js`, `classifyKey` in `src/utils/exportData.js`, the `factors` object shape in `src/utils/seasonProjection.js`  ‖  `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `lib/grade.mjs`, `resolveScoring` in `scripts/panel-run.mjs`, `bin/import-snapshot.mjs`
- **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals only). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

#### CR-02 · season-totals schemaVersion & row composition
- **App side:** `src/api/dataStore.js` `MAX_SUPPORTED_SCHEMA = 3`, `src/utils/teamContext.js` `isTeamAggregateId`, `src/utils/playerTeam.js` `resolvePlayerTeam` (season grain reads `careerStats[season][pid].team`)
- **Data side:** `nfl/season-totals/<year>.json` (written v3), `lib/sleeper.mjs` `aggregateWeeks:151` (dominant-team derivation) and `normalizeTeamForSchedule` at `:261` (writes the per-season `team`), `scripts/update-nfl.mjs` (the writer, `:49`/`:53`), `lib/validate.mjs` `validateNflSeason:100`, `lib/backtest.mjs` `isTeamAggregateId` (the data-side `TEAM_` filter), `lib/panel.mjs` `buildTeamTotalsForSeason` (`:80`, applies that filter), `data-catalog.md` season-totals row
- **Invariant:** the app's supported-schema ceiling covers what the data repo writes, and the served row set is player rows **plus** `TEAM_<abbr>` whole-team aggregate pseudo-rows **plus** `<abbr>` DEF rows — consumers must exclude `TEAM_*` from any cross-player summation.
- **Direction:** both
- **Triggers:** `MAX_SUPPORTED_SCHEMA` in `src/api/dataStore.js`; `isTeamAggregateId` in `src/utils/teamContext.js`; the per-season-`team` readers `resolvePlayerTeam` (`src/utils/playerTeam.js:53-63`) and `resolveAttributedTeam` (`src/utils/teamContext.js:18`, consumed at `:164`/`:195`/`:247`/`:281`, `src/utils/teamRzShare.js:85`, `src/utils/seasonProjection.js:488`); the cross-row summers `computeTeamContext` (`src/utils/teamContext.js:154`, loops `:161`/`:192` — a separate summer from `computeHistoricalShares` that does **not** apply `isTeamAggregateId`; see its own note `:148-152`), `computeHistoricalShares` (`:269`, row loop `:275`), `computeHistoricalTeamTotals` (`:242-246`), `buildTeamShareTotals` (`src/utils/outlookPositionStats.js:38-40`), `computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:63-64`) and `buildSeasonPositionRanks` (`src/utils/seasonRanks.js:20`)  ‖  `aggregateWeeks` in `lib/sleeper.mjs`, `scripts/update-nfl.mjs`, `validateNflSeason` in `lib/validate.mjs`, `isTeamAggregateId` in `lib/backtest.mjs`, `buildTeamTotalsForSeason` in `lib/panel.mjs`
- **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking.

#### CR-03 · Enrichment schemas
- **App side:** `src/api/enrichment.js` (`loadEnrichment:44`, called from `src/App.jsx:268`), `src/utils/enrichmentLookup.js` (`findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes`), `src/components/AvailabilityHistory.jsx:116` (the injury-payload consumer)
- **Data side:** `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs` (`validateEntry:164`, `validateAll:259`), `lib/validate.mjs` `validateEnrichmentShape:747`, `npm run validate:enrichment`
- **Invariant:** every field the app's null-safe lookups read exists, with the same name and shape, in the enrichment files the data repo authors and validates.
- **Direction:** data→app
- **Triggers:** `src/api/enrichment.js`, `src/utils/enrichmentLookup.js`, `src/components/AvailabilityHistory.jsx`  ‖  `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs`, `validateEnrichmentShape` in `lib/validate.mjs`
- **Mirror:** Any field add, rename or removal must be mirrored in the app's loader and lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching season-totals file; orphaned entries are validator-flagged and silently ignored app-side.

#### CR-04 · Manifest contract
- **App side:** `src/api/dataStore.js` — `getManifestEntry:65` plus every validator gating on `schemaVersion` / `inProgress` / `lastModified` (nine `src/api/*` modules go through the accessor; the field names are the contract, so the definition site is the surface). **Plus one accessor bypass:** `src/utils/ktcHistory.js` `loadKtcHistory:92-126` reads the manifest **object** directly — `getCache('data-store/manifest')`, then `Object.keys(manifest.files)` and `manifest.files[path].lastModified` — so it depends on the top-level `files` map and the per-entry `lastModified` by name, not through `getManifestEntry`. The module's own header (`:4-6`) flags this as a deliberate "Coupling note".
- **Data side:** `manifest.json`, `lib/manifest.mjs` (`readManifest:19`, `updateManifestEntry:34`) — 12 of the 13 `scripts/update-*.mjs` writers register through `updateManifestEntry` (`update-enrichment.mjs` does **not**), plus three non-`update-*` registrars: `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, and `lib/enrichment.mjs`
- **Invariant:** manifest field names and shape are a public API; the app keys entries by served path and must ignore unknown families — and the `files` map plus per-entry `lastModified` are readable directly, not only through the app's accessor.
- **Direction:** data→app
- **Triggers:** `getManifestEntry` and the validator block in `src/api/dataStore.js`, the direct `manifest.files` / `lastModified` reads in `src/utils/ktcHistory.js` (`:92-126`)  ‖  `updateManifestEntry` / `readManifest` in `lib/manifest.mjs`, `manifest.json`
- **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17).

#### CR-05 · CFBD statType keys
- **App side:** `src/api/cfbd.js` `pivotStatRows:85`, `src/api/dataStore.js` `isValidCFBDRows:107` (gates on `playerId` / `statType`), `src/utils/collegeMatch.js:125-127` (pivots all three categories), `src/utils/collegeMetrics.js:69-124` (reads the literals `YDS`, `TD`, `ATT` — dominator rating and the QB score), `src/components/PlayersTab.jsx:681-683` (reads `PCT`, and `COMPLETIONS` as its fallback, for the Player Profile college stat line; also `YDS`/`TD`/`INT` at `:678-680`, `CAR` at `:691` (rush category), and `REC` at `:697` (rec category))
- **Data side:** `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `lib/validate.mjs` `validateCfbdCategory:204`, `college/<category>/<year>.json`
- **Invariant:** the confirmed `statType` set stored per category is exactly the set the app's pivot expects.
- **Direction:** both
- **Triggers:** `pivotStatRows` in `src/api/cfbd.js`, `isValidCFBDRows` in `src/api/dataStore.js`, `src/utils/collegeMatch.js`, the `YDS`/`TD`/`ATT` reads in `src/utils/collegeMetrics.js`, the `PCT`/`COMPLETIONS`/`CAR`/`REC` reads in `src/components/PlayersTab.jsx`  ‖  `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `validateCfbdCategory` in `lib/validate.mjs`
- **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it, and the blast radius differs by key: `YDS`/`TD`/`ATT` are read by name in `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB college score; `PCT` and `COMPLETIONS` are read only in `src/components/PlayersTab.jsx:682-683`, where `PCT ?? (COMPLETIONS / ATT)` builds the completion-% term — renaming both silently drops that term from the Player Profile college stat line, which still renders without it. No error, no test failure, in either case. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.)

#### CR-06 · nflverse roster & draft
- **App side:** `src/api/nflRoster.js` `loadCurrentRoster:55` (`MIN_ROSTER_IDS = 1500` at `:38`), `src/api/nflDraft.js` `loadNflDraftPicks:50`, `src/api/dataStore.js` `isValidRoster:113` / `isValidDraft:118`, `src/utils/nflDraftMatch.js`, `src/utils/relevance.js` (consumes the roster-id Set for the stale-team gate)
- **Data side:** `nflverse/roster/<year>.json`, `nflverse/draft/draft_picks.json`, `bin/update.mjs roster` / `draft`, `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `lib/nflverse.mjs` `MIN_ROSTER_IDS:18` (**the definition**), `lib/validate.mjs` `validateRoster:307` / `validateDraft:339`
- **Invariant:** the served shapes (`players` keyed by `sleeper_id`; `rowCount`; `picksByYear`) and the shared `MIN_ROSTER_IDS = 1500` sparsity gate match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflRoster.js`, `src/api/nflDraft.js`, `MIN_ROSTER_IDS` in `src/api/nflRoster.js`, `isValidRoster` / `isValidDraft` in `src/api/dataStore.js`, `src/utils/relevance.js`  ‖  `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `MIN_ROSTER_IDS` in `lib/nflverse.mjs`, `validateRoster` / `validateDraft` in `lib/validate.mjs`
- **Mirror:** Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

#### CR-07 · nflverse advstats (view-only)
- **App side:** `src/api/advStats.js` `loadAdvStats:46` (`MIN_ADVSTATS_ROWS = 250` at `:35`), `src/api/dataStore.js` `isValidAdvStats:122`, `src/App.jsx:893` (the call site), `src/components/AdvancedStatsPanel.jsx`, guarded by `src/__tests__/advStatsViewOnly.test.js`
- **Data side:** `nflverse/advstats/<year>.json`, `bin/update.mjs advstats`, `scripts/update-advstats.mjs`, `lib/nflverse.mjs` `MIN_ADVSTATS_ROWS:35` (**the definition**), `lib/validate.mjs` `validateAdvStats:407`
- **Invariant:** served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the shared `MIN_ADVSTATS_ROWS = 250` gate match, and the family stays out of projection/scoring on both sides.
- **Direction:** both
- **Triggers:** `src/api/advStats.js`, `MIN_ADVSTATS_ROWS` in `src/api/advStats.js`, `isValidAdvStats` in `src/api/dataStore.js`, `src/components/AdvancedStatsPanel.jsx`  ‖  `scripts/update-advstats.mjs`, `MIN_ADVSTATS_ROWS` in `lib/nflverse.mjs`, `validateAdvStats` in `lib/validate.mjs`
- **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

#### CR-08 · nflverse schedule (read-only)
- **App side:** `src/api/nflSchedule.js` `loadNflSchedule:60`, `src/api/dataStore.js` `isValidSchedule:135` + `MIN_SCHEDULE_GAMES = 200` (`:130`), `src/utils/nflStats.js` `buildGameLog`, `src/components/players/NflStatsTab.jsx:273` (the only live call site), guarded by `src/__tests__/scheduleViewOnly.test.js`
- **Data side:** `nflverse/schedule/<year>.json`, `bin/update.mjs schedule`, `scripts/update-schedule.mjs` (← nflverse `nfldata` `games.csv`), `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES:45` (**the definition**), `lib/validate.mjs` `validateSchedule:435`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`, each game carrying the 15 named fields; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` are valid) and the shared `MIN_SCHEDULE_GAMES = 200` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflSchedule.js`, `isValidSchedule` + `MIN_SCHEDULE_GAMES` in `src/api/dataStore.js`, `buildGameLog` in `src/utils/nflStats.js`, `src/components/players/NflStatsTab.jsx`  ‖  `scripts/update-schedule.mjs`, `MIN_SCHEDULE_GAMES` in `lib/nflverse.mjs`, `validateSchedule` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. Read-only — not wired into projection/scoring. The app-side consumer is `NflStatsTab`'s game log, joining on the per-season `team` from season-totals v3 (CR-02).

#### CR-09 · nflverse gamelogs (view-only)
- **App side:** `src/api/nflGameLogs.js`, `src/api/dataStore.js` `isValidGameLogs` + `MIN_PLAYERGAME_ROWS = 3000`, `src/utils/playerTeam.js` `resolvePlayerTeam` (week grain reads `games[].week` and `games[].team`), guarded by `src/__tests__/gameLogsViewOnly.test.js`
- **Data side:** `nflverse/gamelogs/<year>.json`, `bin/update.mjs gamelogs`, `scripts/update-gamelogs.mjs`, `lib/nflverse.mjs` `MIN_PLAYERGAME_ROWS:48` (**the definition**) + `parsePlayerGameLogs` / `rekeyGameLogsBySleeper`, `lib/validate.mjs` `validateGameLogs:467`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game carrying `week`, `seasonType`, `team`, `opponent` plus sparse per-game stats where an absent key is null and a present `0` is a real zero) and the shared `MIN_PLAYERGAME_ROWS = 3000` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflGameLogs.js`, `isValidGameLogs` + `MIN_PLAYERGAME_ROWS` in `src/api/dataStore.js`, `resolvePlayerTeam` in `src/utils/playerTeam.js`  ‖  `scripts/update-gamelogs.mjs`, `MIN_PLAYERGAME_ROWS` / `parsePlayerGameLogs` / `rekeyGameLogsBySleeper` in `lib/nflverse.mjs`, `validateGameLogs` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed. `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 is absent upstream (known gap; degrades to the empty shape).

#### CR-10 · nflverse teamcontext (view-only)
- **App side:** `src/api/teamContext.js` (loader — distinct from `src/utils/teamContext.js`) incl. the shape-reading lookups `getTeamSeasonRows:121` / `getTeamWeekRow:131`, `src/api/dataStore.js` `isValidTeamContext:171` + `MIN_TEAMCONTEXT_ROWS = 60` (`:164`), `src/utils/playerTeam.js` (join), guarded by `src/__tests__/teamContextViewOnly.test.js`
- **Data side:** `nflverse/teamcontext/<year>.json`, `bin/update.mjs teamcontext`, `scripts/update-teamcontext.mjs` (← nflverse pbp), `lib/nflverse.mjs` `MIN_TEAMCONTEXT_ROWS:53` (**the definition**) + `aggregateTeamContext`, `lib/validate.mjs` `validateTeamContext:504` (incl. the era-domain guard at `:515`)
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST) and the shared `MIN_TEAMCONTEXT_ROWS = 60` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/teamContext.js` (incl. `getTeamSeasonRows` / `getTeamWeekRow`), `isValidTeamContext` + `MIN_TEAMCONTEXT_ROWS` in `src/api/dataStore.js`, `src/utils/playerTeam.js`  ‖  `scripts/update-teamcontext.mjs`, `MIN_TEAMCONTEXT_ROWS` / `aggregateTeamContext` in `lib/nflverse.mjs`, `validateTeamContext` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. View-only on both sides. Team-key domain is CR-16.

#### CR-11 · Snap & red-zone usage stat keys *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/usageMetrics.js` `computeUsageFactors` (`RZ_CONFIG:59-61`, snap share `:87-88`/`:141-142` — reads `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`), `src/utils/teamRzShare.js` (`RZ_SHARE_CONFIG:45-46`), `src/utils/durabilitySignals.js:34-35` (`off_snp`/`tm_off_snp` → contributor-season classification; imported by `seasonProjection.js`, `dynastyScore.js`, `projectionSignals.js`), `src/utils/teamContext.js:254-255` (accumulates `rush_rz_att`/`rec_rz_tgt` into the `rushRz`/`recRz` denominators `teamRzShare.js` divides by), `src/utils/outlookUsage.js:62-63` (view-only per-season snap%)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:216`) writing `nfl/season-totals/<year>.json` — these keys are preserved as-is and never stripped or filtered by any schema operation. Data-side **consumers** of the same keys: `lib/panel.mjs` (`:87-88`, `:179`, `:191`/`:206`, `RZ_CONFIG`-equivalents `:874-886`, `:911-912`, `:1131-1132`), `lib/backtest.mjs` (`:225-226`, `:274-275`, `:284-297`), `lib/projectionFactors.mjs`
- **Invariant:** the five usage stat keys survive season-totals aggregation unmodified, and both repos read them under the same names.
- **Direction:** data→app
- **Triggers:** `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/durabilitySignals.js`, the RZ denominator block in `src/utils/teamContext.js`, `src/utils/outlookUsage.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` / `findNonFinite:69` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21` (the one key filter that exists on this data today, read-side), `lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`
- **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

#### CR-12 · `pass_cmp` stat key (QB passer rating) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/efficiencyMetrics.js` `passerRating` (`:37`, `:178` — `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`), reused view-only by `src/utils/outlookPositionStats.js`, and `src/utils/nflStats.js:28` (`compPct` recomputed as `pass_cmp/pass_att`, never the stored `cmp_pct`)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:216`) into `nfl/season-totals/<year>.json`. **`pass_cmp` appears nowhere in `lib/`, `scripts/` or `bin/`** — the key is carried by a loop that never names it, which is exactly why the loop, not the key, is the data-side trigger.
- **Invariant:** `pass_cmp` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** `passerRating` in `src/utils/efficiencyMetrics.js`, the `compPct` line in `src/utils/nflStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`
- **Mirror:** Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from counting stats), and must be preserved as-is rather than "fixed".

#### CR-13 · `rec_air_yd` stat key (aDOT diagnostic) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/seasonProjection.js:445`/`:453` — reads `rec_air_yd` and `rec_tgt` to compute the capture-only `factors.adot` (WR/TE); `src/utils/outlookPositionStats.js:51` (per-season-team air-yards denominator), `:153` (AY share), `:141` (the aDOT cell)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:216`) into `nfl/season-totals/<year>.json`; confirmed present 2012–present. **`rec_air_yd` appears nowhere in `lib/`, `scripts/` or `bin/`** — same generic-path situation as CR-12.
- **Invariant:** `rec_air_yd` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** the aDOT block in `src/utils/seasonProjection.js`, the air-yards denominator / AY-share / aDOT builders in `src/utils/outlookPositionStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`
- **Mirror:** Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

#### CR-14 · `calculateFantasyPoints` port *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/fantasyPoints.js` `calculateFantasyPoints(stats, scoringSettings):12` — the source of truth. (`src/App.jsx:788`/`:790`/`:795` and `src/api/sleeperStats.js:199` call it but do not define the math, so they are not triggers.)
- **Data side:** `lib/fantasyPoints.mjs` — a hand-maintained mirror (`calculateFantasyPoints:9`, plus `RATE_KEYS:21`); imported by `scripts/grade-snapshot.mjs:20`, which defines `buildInBasisOutcomes:87` (applying the port at `:90`/`:109`); that builder is consumed by in-basis grading (`scripts/grade-snapshot.mjs:131`/`:431`) **and** by `scripts/panel-run.mjs:92` on the R3-FIT path
- **Invariant:** the data repo's port reproduces the app's scoring formula exactly — loop `scoringSettings` keys, skip null multiplier or stat, round to 2 dp.
- **Direction:** app→data
- **Triggers:** `src/utils/fantasyPoints.js`  ‖  `lib/fantasyPoints.mjs`, `buildInBasisOutcomes` in `scripts/grade-snapshot.mjs`, its call site in `scripts/panel-run.mjs`
- **Mirror:** Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

#### CR-15 · R3-FIT factor-multiplier mirror *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/momentum.js`, `src/utils/regressionSignals.js`, `src/utils/teamContext.js` (`computeShareTrend`, `computeHistoricalShares`, `computeHistoricalTeamTotals`, `resolveAttributedTeam`), `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/seasonProjection.js` (qualifying-season builder, rookie-vs-veteran routing, basePPG per-length weight table, label→factor maps, forward-mover neutralization, `combinedNewFactorRaw` membership and its `[0.67, 1.50]` clamp)
- **Data side:** `lib/projectionFactors.mjs`, `lib/panel.mjs` (`predictWithExponents:962`, `attachFactorMultipliers:998`, `buildCohortPools:895`, `selectFitFactors:1206`), `scripts/panel-run.mjs` (`runFit:878`, the `attachFactorMultipliers` call at `:166`), `bin/panel.mjs --fit`, parity-guarded by `test/panel-fit.test.mjs`
- **Invariant:** every mirrored constant, gate, shrinkage K, qualifying threshold, routing condition, sentinel branch, series-construction branch, denominator accumulator, cohort reference season, position gating, and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly.
- **Direction:** app→data
- **Triggers:** any of the six listed `src/utils/` modules  ‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `test/panel-fit.test.mjs`
- **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

#### CR-16 · Era-accurate team-code remap *(reconciliation — was buried in the teamcontext prose)*
- **App side:** `src/utils/playerTeam.js` `eraTeam(abbr, season):32` — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019 — **and** `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS:2` (`{ LAR: 'LA' }`) + `normalizeTeamForSchedule:4`, which `playerTeam.js:63` composes with `eraTeam`
- **Data side:** `lib/nflverse.mjs` `eraTeam:958` (**the definition**), applied to pbp at `:1084-1087`; `lib/sleeper.mjs` `SCHEDULE_TEAM_ALIAS:22` + `normalizeTeamForSchedule:25` (the data-side mirror of the app's alias, applied at `:261` to produce the season-totals `team`); `lib/validate.mjs:515` era-domain guard
- **Invariant:** both repos map franchise abbreviations to the same era-accurate code for the same season **through the same two-stage composition** (schedule-domain alias, then era remap), so team keys join across teamcontext, schedule and season-totals.
- **Direction:** both
- **Triggers:** `eraTeam` in `src/utils/playerTeam.js`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `src/utils/nflStats.js`  ‖  `eraTeam` in `lib/nflverse.mjs`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `lib/sleeper.mjs`, the era-domain guard in `lib/validate.mjs`
- **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing.

#### CR-17 · KTC value snapshots *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `src/utils/ktcHistory.js` — `isValidKtcSnapshot:27`, the `SNAPSHOT_RE` manifest enumeration `/^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/` (`:19`), the `tryDataStore(s.path, { validate: isValidKtcSnapshot, allowInProgress: true })` fetch (`:147`), and the downstream extractors `computeKtcSignals` (consumed by `src/utils/seasonProjection.js:11`/`:307` for the `ktcHist*` capture factors) and `computeKtcRecentDelta:338` (consumed by `src/components/PlayersTab.jsx:9`/`:1873` for the Explorer's ~30-day Δ cell); `src/api/dataStore.js` `tryDataStore:72` `allowInProgress` opt-in (`:80`); `src/utils/ktcMatch.js` `matchKTCToSleeper:64` (consumes `name`/`team`/`position`), called on the store path at `ktcHistory.js:176` and on the live path at `src/App.jsx:249`; `src/api/ktc.js:51` — the app's own DOM scraper, which emits the **identical** `{ name, team, value, position }` record
- **Data side:** `ktc/snapshot-<YYYY-MM-DD>.json`, `scripts/update-ktc.mjs` (`updateKtc:131`, `ktcOrderingGuard:114`, `KTC_ORDERING_THRESHOLD`, `snapshotHash:39` for content-hash dedup, the `updateManifestEntry({ inProgress: true })` call at `:208-213`), `lib/ktc.mjs` `fetchKtcSnapshot:76`, `lib/validate.mjs` `validateKtc:237` + `KTC_TOP_QB_SENTINELS`, `bin/update.mjs ktc`, `.github/workflows/weekly-ktc.yml`, `ktc/quarantine/` (script-produced, unregistered, app-ignored)
- **Invariant:** a served KTC snapshot is a **bare top-level JSON array** of `{ name, team, value, position }` objects satisfying `isValidKtcSnapshot` (non-empty array whose first element has a string `name` and a numeric `value`), published at exactly `ktc/snapshot-<YYYY-MM-DD>.json` and registered with `schemaVersion: 1` and `inProgress: true` — the one family the app's read path opts into via `allowInProgress: true`.
- **Direction:** both
- **Triggers:** `isValidKtcSnapshot`, `SNAPSHOT_RE`, the `allowInProgress: true` call site, `computeKtcSignals` and `computeKtcRecentDelta` in `src/utils/ktcHistory.js`, `matchKTCToSleeper` in `src/utils/ktcMatch.js`, the record shape emitted by `src/api/ktc.js`, the `allowInProgress` branch of `tryDataStore` in `src/api/dataStore.js`  ‖  `scripts/update-ktc.mjs` (incl. `ktcOrderingGuard`, `snapshotHash` and the `updateManifestEntry({ inProgress: true })` call), `fetchKtcSnapshot` in `lib/ktc.mjs`, `validateKtc` in `lib/validate.mjs`, `.github/workflows/weekly-ktc.yml`
- **Mirror:** Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family plus the Explorer's ~30-day KTC Δ cell degrade to empty with **no error and no test failure**. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

#### CR-18 · Signal registry rows (`docs/signal-registry.md`) *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `docs/signal-registry.md` (the canonical rows), the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*
- **Data side:** the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*, the Sibling-repo pointer in `CLAUDE.md` → *Sibling repo*, `data-catalog.md` (data-side storage index — its header explicitly says the app's registry is the field-level index and to *"link, don't merge"*), and any ingest that adds/removes/reclassifies a field, stat key or source — `scripts/update-*.mjs`, `lib/sleeper.mjs`, `lib/nflverse.mjs`
- **Invariant:** every ingested field, stat key and source in the data repo has a current row in the app repo's `docs/signal-registry.md`, with its layer, source, historical coverage, reconstructable-vs-ephemeral status and current use accurate as of the change that touched it.
- **Direction:** data→app
- **Triggers:** `docs/signal-registry.md`  ‖  `data-catalog.md`, the signal-registry and Sibling-repo pointers in `CLAUDE.md`, the ingest scripts `scripts/update-{nfl,cfbd,ktc,roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs`, the field-producing parsers/aggregators in `lib/nflverse.mjs` (`parseRosterCsv:164`, `parseDraftCsv:258`, `parsePlayerIdsCsv:350`, `aggregateAdvReceiving:476`, `parsePlayerGameLogs:741`, `parseSchedulesCsv:866`, `aggregateTeamContext:1012`, `aggregateOlineStates:1307`), `aggregateWeeks` in `lib/sleeper.mjs`, `lib/cfbd.mjs`, `lib/ktc.mjs`, and the **coverage-floor constants that encode historical coverage** — `MIN_DRAFT_YEAR:25`, `MIN_SCHEDULE_SEASON:38`, `MIN_GAMELOG_SEASON:50`, `MIN_TEAMCONTEXT_SEASON:55`, `MIN_OLINE_SEASON:60` in `lib/nflverse.mjs`
- **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

<!-- CR-REGISTRY-END -->

## Drift check

The mirrored region is byte-identical in the two repos, though it lives in different files (this file; `sleeper-dashboard-data/README.md`). Both sides are bounded by the **same sentinel pair**, so the compared spans start and end on identical lines and a synced pair diffs to nothing:

```bash
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
```

Empty output = in sync. Three properties make that honest, and each is a rule to keep:

1. **Both ends are explicit.** Neither range runs to EOF, and neither depends on a heading that exists in only one of the files — the previous CR-01-to-heading form could never return empty, because the two files legitimately have different headings after the entries.
2. **Repo-specific text is outside the sentinels.** The data repo's two preserved `> *Note:*` non-entry paragraphs, both files' framing prose, and each file's terminating heading all sit outside, so they never enter the comparison.
3. **The patterns are line-anchored** (`^…$`), so the inline backticked mentions of the sentinels in the *Mirrored region* section above do not start or stop a range. Never write a sentinel as a bare line except as an actual sentinel.

This is a manual check for the human, **not** something either subagent can run (neither can read the other tree) and not a CI gate — adding one would mean giving a build step cross-repo access, which is the coupling this design avoids.
````

---

### 4.3 `.claude/agents/plan-reviewer.md` — 1 edit (full-body replacement)

**Location:** whole file, 22 lines. **Frontmatter `:1-6` changes only in the `description` line; `name`, `tools` and `model` stay exactly as they are** — `tools: Read, Grep, Glob` is what makes the sibling-tree ban structural rather than merely instructed.

**After (full file):** everything between the four-backtick markers. The outer fence is four backticks because the file body contains a three-backtick fenced block (the output template).

````md
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

Read docs/cross-repo-registry.md. It is an enumerated list of `CR-NN` entries. For the **data side** it is your only authority — you cannot read the sibling repo, so treat its data-side triggers as complete and never infer beyond them. CLAUDE.md carries the rule and points at that file; the entries themselves are only there.

**You cannot read the sibling repo — do not try, and do not infer its contents.** Check the plan's touched artifacts against each entry's `Triggers` field, app side only (the part left of `‖`).

For every entry the plan touches:

- If the task file has no `## Cross-repo impact` section quoting that entry's id and `Mirror` text, flag it — and include the `Mirror` text yourself in the MIRROR block below so the planning session has it.
- If the section exists but the mirror text is incomplete or contradicts the entry, flag the difference.
- Pay particular attention to `Direction: app→data` entries. Nothing in this repo fails when those drift; a missing mirror there is a silent defect, not a paperwork miss.

### Standing duty: re-verify the app side against live source

The registry's **app-side** trigger list is a maintained cache, not the authority — you can read live app source, so you are the thing that keeps it honest. On **every** review, for each registry entry whose data shape, served field or stat key the planned change reads or writes:

- Grep live `src/` for that entry's stat keys, served shape fields and exported symbols.
- Compare what you find against the entry's app-side `Triggers` (left of `‖`).
- Flag as `[registry-stale]` any live consumer or producer in `src/` that the entry does not cover, naming the `file:line` and the entry id. Comment-only, test-only and fixture-only hits are not consumers.

Do this even when the plan's own mirror text is correct — a stale trigger list is a defect in its own right, and it is invisible to everyone except you. Do **not** apply the fix; report it and let the human decide, like every other flag.

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

Categories: `mechanical`, `shape`, `ordering`, `edge-case`, `invariant`, `strategy`, `cross-repo`, `registry-gap`, `registry-stale`.

Omit `FLAGS` if there are none. Omit `MIRROR` if the plan touches no registry entry. If both are empty, output exactly: "No blocking issues found." and nothing else.
````

**Note the deliberate change in the no-issues contract.** The old file said "if the plan is sound, output exactly 'No blocking issues found.' and nothing else" — which would suppress the mirror block on a clean plan that touches a contract. The new rule scopes that string to *both* blocks being empty.

**Note the `registry-stale` category and its standing duty.** This is the mechanism from §2.2.0: the app-side trigger lists are a cache the subagent refreshes, so app-side gaps surface at review time instead of accumulating silently. It is deliberately a *standing* duty rather than a one-off audit — three rounds of manual sweeps found app-side gaps, and a fourth sweep would have the same half-life. `registry-gap` (a coupling with no entry at all) and `registry-stale` (an entry that exists but misses a live app-side consumer) are different findings and route differently: the first leaves the in-repo loop, the second is a one-line registry edit.

---

## 5. Step sequence

Docs-only, so ordering is about keeping the plan's own line anchors valid, not about correctness.

**Apply the CLAUDE.md edits bottom-up.** Every anchor in §4.1 is against the unmodified 281-line file, and Edits A and B both change their sections' line counts. Working downward would invalidate every anchor below the first edit. Working upward, each edit's target sits entirely above everything already changed, so all four anchors stay exactly as written.

1. **Edit C** — replace `CLAUDE.md:248` (highest anchor).
2. **Edit D** — fix the anchor at `CLAUDE.md:240`.
3. **Edit B** — rewrite `CLAUDE.md:210-220`. Copy the three bullets and the handoff paragraph through byte-for-byte.
4. **Edit A** — replace `CLAUDE.md:175-188` with the pointer + rule.
5. **Edit E** — create `docs/cross-repo-registry.md` from §4.2. Do this after A so the pointer and its target land in the same working tree state; the file does not exist before this step.
6. **Replace `.claude/agents/plan-reviewer.md`** in full (§4.3).
7. **Verify** (§6).
8. **Do not touch the data repo.** §8 is the spec for a *separate* data-repo session; this session ends at the app repo boundary.

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
| V2 | Only three files changed | `git status --porcelain` | exactly `CLAUDE.md` + `.claude/agents/plan-reviewer.md` modified and `docs/cross-repo-registry.md` untracked (`??`), plus this task file |
| V3 | Heading renamed, anchor link resolves | `grep -c "^### Cross-repo contract registry (with sleeper-dashboard-data)$" CLAUDE.md` and `grep -c "#cross-repo-contract-registry-with-sleeper-dashboard-data" CLAUDE.md` | `1` heading and `1` link (the sibling-repo line from Edit D — the only in-file anchor link; Edits A/B/C link to the docs file by path, not by anchor) |
| V4 | No stale anchor | `grep -rn "#cross-repo-contracts-with" --include="*.md" . \| grep -v .claude/tasks/` | no hits |
| V5 | Pointer wired up | `grep -c "docs/cross-repo-registry.md" CLAUDE.md` | `4` — Edit A's pointer, Edit B's Plan-review item 3, Edit B's `### The Claude.ai project` draft-entry paragraph, Edit C. (`grep -c` counts *lines*, not occurrences; Edit A's line contains the path twice and still counts once.) |
| V6 | Sentinels present, balanced, line-anchored | `grep -n "^<!-- CR-REGISTRY-\(BEGIN\|END\) -->$" docs/cross-repo-registry.md` | exactly 2 hits — one `BEGIN`, one `END`, in that order. The backticked mentions in the *Mirrored region* section must **not** match |
| V7 | 18 entries, contiguous ids | `sed -n '/^#### CR-01 ·/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md \| grep -n "^#### CR-"` | `CR-01`…`CR-18`, in order, no gaps — **18 hits** |
| V8 | Every entry has all six fields | for each of `App side` / `Data side` / `Invariant` / `Direction` / `Triggers` / `Mirror`: `sed -n '/^#### CR-01 ·/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md \| grep -c "^\- \*\*<Field>:\*\*"` | `18` each |
| V9 | Model table intact | `git diff CLAUDE.md` | the `### Which model for which task` table shows **no** diff lines |
| V10 | Two-session bullets intact | `git diff CLAUDE.md` | the three workflow bullets and the handoff paragraph show **no** diff lines |
| V11 | Agent tool grant unchanged | `grep -n "^tools:" .claude/agents/plan-reviewer.md` | `tools: Read, Grep, Glob` |

**Why V7/V8 slice from the first entry heading, not from the BEGIN sentinel.** The `## Entry format` block sits **inside** the sentinel pair — see *Mirrored region and its sentinels* in §4.2 — because the byte-identical guarantee has to cover the format definition too, not only the entries. But that block is also a literal template: it contains one `#### CR-NN · <short contract name>` line and one line for each of the six field labels. A `grep -c` across the full `BEGIN`…`END` span would therefore return 19 for the heading count and 19 for every field count, not 18 — the discrepancy would look like an extra entry rather than the known template line. V7 and V8 instead slice from the first real entry heading (`^#### CR-01 ·`) through `END`, which excludes the template by construction and leaves every expected count exactly the entry count. This slice is **narrower** than the one the drift check (this file's *Drift check* section, and §8.5) uses — the drift check needs the `## Entry format` block included, since covering it is the whole point of the sentinel's placement, while V7/V8 need it excluded to count entries correctly. V6 guards the sentinel pair itself: if the sentinels are missing or unbalanced, both slices degrade — V7/V8 return 0 or garbage and the drift check returns nothing or everything.

**V9 and V10 are the real acceptance test for the "preserve verbatim" constraint.** If either shows diff lines, the bullets were retyped rather than copied — revert and redo Edit B.

---

## 7. Docs updates

Every doc that needs editing, and confirmation for those that do not.

### Needs editing

| File | Section | What |
|---|---|---|
| `CLAUDE.md` | `### Cross-repo contracts (with sleeper-dashboard-data)` (`:175-188`) | **Replace the whole section with the pointer + rule block in Edit A.** Heading text changes to `### Cross-repo contract registry (with sleeper-dashboard-data)`. The 10 bullets are not deleted — their content becomes CR-01…CR-10 in the new docs file. |
| `CLAUDE.md` | `## Workflow convention` (`:210-220` only) | **Replace with the rewritten section in Edit B** — adds the in-repo framing + loop diagram, the `### Plan review` subsection, and the `### The Claude.ai project` subsection incl. the residual-case paragraph. Preserves the three bullets and the handoff paragraph byte-for-byte. `:222` onward untouched. |
| `CLAUDE.md` | `## Self-maintenance`, final line (`:248`) | **Replace with Edit C** — one-line swap from "state it in your task summary" to the registry-emission rule. `:246` untouched. |
| `CLAUDE.md` | Sibling-repo line (`:240`) | **Anchor fix, Edit D** — `#cross-repo-contracts-with-…` → `#cross-repo-contract-registry-with-…`. |
| `docs/cross-repo-registry.md` | whole file — **new** | **Create from Edit E (§4.2).** Format definition + the sentinel convention + all 18 `CR-NN` entries between `<!-- CR-REGISTRY-BEGIN -->` / `<!-- CR-REGISTRY-END -->` + the drift-check block. This is the registry body; CLAUDE.md only points at it. Reproduce the sentinel lines exactly — they are the boundary both the drift check and V6/V7/V8 anchor on. |
| `.claude/agents/plan-reviewer.md` | whole file | **Replace with the body in §4.3.** Frontmatter `description` updated; `name` / `tools` / `model` unchanged. Part 3 now reads `docs/cross-repo-registry.md` rather than a CLAUDE.md section. |

### Explicitly needs no editing

- **`README.md` — no changes.** Verified: it documents tech stack, theming, local setup, testing, project structure and the docs index. It contains no workflow, review, or cross-repo-contract content. **On the new docs file specifically:** the `## Documentation` index at `:173-205` is a *curated* list of deep behavioural docs, not an exhaustive directory listing — it names 8 of the 10 `.md` files in `docs/` (`advstats-grading-findings.md` and `prediction-research-eval.md` are already unindexed). `docs/cross-repo-registry.md` is a contract registry, not behavioural documentation, and its discoverability path is the CLAUDE.md pointer the reviewer actually follows. Adding a one-line index entry is a reasonable option at approval time; it is not required for correctness and is deliberately left out to keep the diff at three files.
- **`docs/*.md` — no content changes to any of the 10 existing files.** Verified by grep across `docs/` for workflow, review, session, and Claude.ai keywords: zero hits describing the development loop. The docs are behavioural/product documentation (`architecture.md`, `projection.md`, `dynasty-scoring.md`, `integrations.md`, `ui.md`, `signal-registry.md`, the two design docs, the two findings/eval docs). The eleventh file, `docs/cross-repo-registry.md`, is created by this change.
- **`docs/signal-registry.md` — content untouched, but *not* unrelated.** No row in it changes here. It is, however, the app-side artifact of **CR-18**: a data-repo signal/factor change obligates a row update in this file, and that obligation was previously recorded only as prose in each repo's Self-maintenance paragraph (`CLAUDE.md:246`, `sleeper-dashboard-data/CLAUDE.md:307`). Under Edit A's rule — *an unlisted coupling does not exist for review purposes* — leaving it unlisted would have deleted a real obligation, so CR-18 lists it. **What still holds:** signal registry ≠ contract registry. They are different artifacts with different jobs (an inventory of signals vs. an inventory of cross-repo couplings), and neither is a section of the other. **What no longer holds:** the previous instruction not to cross-link them. CR-18 names `docs/signal-registry.md` as an app-side artifact and a `Triggers` entry, which is exactly the cross-link the completeness rule requires.
- **`.claude/hooks/verify-on-stop.sh` — no changes** (explicit constraint).
- **`.claude/settings.json` — no changes.**
- **`.claude/tasks/*.md` — no changes.** Historical task files reference the old heading name in prose. They are point-in-time records; rewriting them would falsify the record.

---

## 8. Cross-repo impact

**This change touches the registry format itself — the highest-order cross-repo contract there is.** It also *creates* the artifact the sibling must mirror.

By the rule this plan introduces, no existing `CR-NN` entry is touched: nothing here changes a served shape, a shared constant, a stat key, or a scoring formula. The impact is entirely at the meta level — **`sleeper-dashboard` now owns a registry format definition that `sleeper-dashboard-data` must adopt**, plus two entries (CR-17, CR-18) that are new to *both* repos.

Below is everything the data repo needs. **It is a spec for a separate data-repo session, not work for this one.** Sequence it *after* the app-repo edits land, so the app's registry is the reference copy.

### 8.0 Placement in the data repo — read this first

> **The move to a `docs/` file is APP-ONLY.** `sleeper-dashboard-data` has **no `docs/` tree** — verified: its top level is `bin/ lib/ scripts/ test/` plus data directories and four root markdown files (`README.md`, `CLAUDE.md`, `data-catalog.md`, `snapshot-workflow.md`, `schedule-ingest-guide.md`). **Do not instruct the data repo to create a `docs/` directory.** Its own thin-file rule points the other way — `CLAUDE.md:309`: *"Keep this file thin — a navigation-and-rules layer, not a second README; push deep detail into README.md and link to it."*
>
> So in the data repo: **CLAUDE.md keeps a pointer + the rule; the registry body lands in `README.md`.** Format and entries are mirrored exactly; only the host file differs. This is the same discipline applied to two different repo conventions, not an asymmetry in the registry.

### 8.1 Format spec the sibling adopts

Exactly §3.2 of this file — reproduced in the data repo's `README.md` as the `## Entry format` block from Edit E, **verbatim**, including the bullets that follow it. That block sits inside the same `<!-- CR-REGISTRY-BEGIN -->`/`<!-- CR-REGISTRY-END -->` sentinel pair as the 18 entries (§4.2's *Mirrored region and its sentinels*), so it is copied in the same pass as §8.2's copy-boundary instructions below — there is no separate reproduction step. It is already perspective-neutral: `App side` / `Data side` mean the same thing read from either repo, so no field needs adapting. That was the design constraint, and it is met — **the registry body, including the format definition, is byte-identical in both repos and is what the drift check in §8.5 actually diffs.**

**The near-side / far-side completeness bullet mirrors unchanged, and inverts on its own.** It is written in terms of "the near side of `‖`" and "the far side of `‖`" rather than "app" and "data" precisely so one wording serves both repos: read from `sleeper-dashboard`, near = app and far = data; read from `sleeper-dashboard-data`, near = data and far = app. Do **not** rewrite it to say "app side" and "data side" in the sibling's copy — that would break byte-identity *and* invert the meaning. The practical consequence for the data repo is the mirror image of §2.2.0: its reviewer treats the registry's **app-side** triggers as frozen authority (it cannot read `src/`) and re-verifies the **data-side** triggers against live `lib/`/`scripts/`/`bin/` on every review.

```md
#### CR-NN · <short contract name>
- **App side:** <files / symbols / constants in sleeper-dashboard>
- **Data side:** <files / scripts / served paths in sleeper-dashboard-data>
- **Invariant:** <the single thing that must stay true across both repos>
- **Direction:** app→data | data→app | both
- **Triggers:** <app-side paths/symbols>  ‖  <data-side paths/symbols>
- **Mirror:** <instruction to emit for the other repo when this entry is touched>
```

This replaces the sibling's current 3-column table (`| Contract | This repo | App counterpart |`, `CLAUDE.md:245-262`), whose `This repo` column is perspective-relative and therefore cannot be mirrored.

### 8.2 Registry content for the data repo

**The full mirrored body from Edit E (§4.2) — the `## Entry format` block plus all 18 `CR-NN` entries, sentinel lines included — copied byte-for-byte into `sleeper-dashboard-data/README.md`.** Do not re-author it from the data repo's perspective — that would reintroduce exactly the asymmetry the format exists to remove, and would make drift undetectable by `diff`. The entry bodies are **not** reprinted here: a second copy inside this one file would be a third divergent version before the change even lands. §4.2 is the single source; this section enumerates what must arrive and where it comes from.

**Copy boundary — this is what makes the drift check work.** Copy from the `<!-- CR-REGISTRY-BEGIN -->` line through the `<!-- CR-REGISTRY-END -->` line inclusive, and paste it *between* the data repo's own framing prose (before) and its two preserved `> *Note:*` paragraphs (after). Everything repo-specific stays outside the sentinels in both repos; inside them is the `## Entry format` block plus all 18 entries, and nothing else. Get this wrong — sentinel omitted, or a `> *Note:*` paragraph pasted inside — and §8.5's `diff` reports drift forever on a correctly-mirrored pair.

The 18 entries, in order, with the data-repo table row each one absorbs. **The source table has 16 contract rows** — `:247-262` inclusive, since `:245` is the header and `:246` the separator — which map onto 18 entries because CR-01 merges two rows, CR-16 is promoted out of one row's prose, and CR-17/CR-18 are new to both repos. Do not read "18 entries" as "18 rows to convert":

| # | Entry | Direction | From the data `CLAUDE.md` table (16 rows, `:247-262`) |
|---|---|---|---|
| CR-01 | Projection snapshot envelope | app→data | Snapshot shape (`:247`) **+** Snapshot target season (`:260`) — merged; they are one envelope |
| CR-02 | season-totals schemaVersion & row composition | both | season-totals schemaVersion (`:248`) |
| CR-03 | Enrichment schemas | data→app | Enrichment schemas (`:249`) |
| CR-04 | Manifest contract | data→app | Manifest contract (`:250`) |
| CR-05 | CFBD statType keys | both | CFBD statType keys (`:251`) |
| CR-06 | nflverse roster & draft | both | nflverse roster/draft (`:255`) |
| CR-07 | nflverse advstats (view-only) | both | nflverse advstats (`:256`) |
| CR-08 | nflverse schedule (read-only) | both | nflverse schedule (`:257`) |
| CR-09 | nflverse gamelogs (view-only) | both | nflverse gamelogs (`:258`) |
| CR-10 | nflverse teamcontext (view-only) | both | nflverse teamcontext (`:259`) |
| CR-11 | Snap & red-zone usage stat keys | data→app | Snap & RZ usage stat keys (`:252`) |
| CR-12 | `pass_cmp` stat key | data→app | `pass_cmp` stat key (`:253`) |
| CR-13 | `rec_air_yd` stat key | data→app | `rec_air_yd` stat key (`:254`) |
| CR-14 | `calculateFantasyPoints` port | app→data | `calculateFantasyPoints` port (`:261`) |
| CR-15 | R3-FIT factor-multiplier mirror | app→data | R3-FIT factor-multiplier mirror (`:262`) |
| CR-16 | Era-accurate team-code remap | both | era-remap prose inside teamcontext (`:259`) — **promoted to its own entry**; its trigger is a franchise move, orthogonal to any one family. Now covers **two** mirrored constants: `eraTeam` and the `SCHEDULE_TEAM_ALIAS` schedule-domain alias |
| CR-17 | KTC value snapshots | both | **nothing — new to both repos.** KTC has a live producer (`scripts/update-ktc.mjs`), a live app fetch site (`src/utils/ktcHistory.js:147`) and a served shape, and was never written down as a contract on either side |
| CR-18 | Signal registry rows (`docs/signal-registry.md`) | data→app | **nothing — new to both repos.** Previously prose-only, in `CLAUDE.md:307` (data) and `CLAUDE.md:246` (app) |

**What the data-repo session gains beyond the format change.** The §2.2 sweep added data-side triggers that the old 16-row table never named, and they are the practical payload of this mirror for the data repo: `lib/nflverse.mjs` as the **definition site** of all five shared sparsity constants (CR-06…CR-10), `lib/validate.mjs` as the data-side shape-validator surface for **every** family (CR-02, CR-03, CR-05, CR-06…CR-10, CR-17), the `aggregateWeeks` sum-all-keys loop plus `scripts/update-nfl.mjs`, `validateNflSeason` and `RATE_KEYS` as the greppable producer/filter triggers for the three stat-key entries (CR-11…CR-13), the corrected `buildInBasisOutcomes` location (CR-14), the corrected `eraTeam` location (CR-16), the enumerated ingest/parser/coverage-floor anchors on CR-18, and `scripts/panel-run.mjs` on both CR-01 and CR-15. A data-repo session editing any of those previously matched **no** trigger.

**Note which of those the data repo must keep frozen, and which it re-verifies.** Under the near-side/far-side rule (§8.1), the data repo's reviewer re-derives the **data-side** triggers above against live source on every review — so those are its self-healing side. What it can never re-derive is the **app-side** column: `src/` is unreadable from there, so the app-side triggers this pass corrected (CR-02's `resolveAttributedTeam` readers and the `computeTeamContext`/`computeHistoricalShares` summer split, CR-04's `ktcHistory.js` manifest bypass and corrected registrar count, CR-05's `PlayersTab.jsx` `PCT`/`COMPLETIONS`/`CAR`/`REC` reads, CR-13's corrected `outlookPositionStats.js` anchors) are exactly the part the data-repo session must take on faith and must not "tidy".

Preserve as-is, immediately after `<!-- CR-REGISTRY-END -->` in the README: the two `> *Note:*` paragraphs currently at `CLAUDE.md:264` (`nflverse/playerids.json` is repo-internal, not a cross-repo contract) and `:266` (`nflverse/oline/<year>.json` is capture-only, no app loader, not a cross-repo contract). **These are deliberate non-entries and are load-bearing** — they record that two families were *considered* and *excluded*. Both were re-verified against live app source during this plan's sweep (§2.1) and remain correct. Do not convert them into `CR-` entries; do not drop them; **do not place them inside the sentinels.** `nfl/players-state/*` belongs with them for the same reason: no app loader exists, and it reaches the app only as additive manifest entries, which CR-04 covers.

**Section framing for the data repo's `README.md`** — insert as a new top-level section between `## Versioning policy` (ends at the `---` on `:1074`) and `## Enrichment overlay` (`:1076`):

```md
## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The registry below is the **complete enumerated list** of contracts the two repos share, and it is byte-identical to the copy in `sleeper-dashboard/docs/cross-repo-registry.md` — `sleeper-dashboard` owns the format definition; this repo mirrors it exactly. (The app keeps its copy under `docs/`; this repo has no `docs/` tree and keeps it here, per CLAUDE.md's push-detail-into-README rule. Only the host file differs — the format and every entry are identical.) It is the sole authority for what the app must mirror; the plan-reviewer subagent checks against this list and never reads the sibling tree. Its **data-side** trigger lists are a maintained cache this repo's reviewer re-verifies against live `lib/`/`scripts/`/`bin/` on every review; the **app-side** lists are frozen authority here, since `src/` is unreachable from this repo.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see CLAUDE.md → Workflow convention.

Everything between the two sentinel comments below is the **mirrored region**, byte-identical to `sleeper-dashboard/docs/cross-repo-registry.md`; the drift check diffs exactly that span. Repo-specific text — this framing, the non-entry notes that follow, the next heading — stays outside the sentinels.
```

**Replacement in the data repo's `CLAUDE.md`** — replace `:241-266` (the heading at `:241`, the lead prose at `:243`, the 16-row contract table at `:245-262`, and the two `> *Note:*` lines at `:264`/`:266`) with the pointer + rule block below. **Note the anchor: the replacement starts at `:241`, the heading itself** — starting at `:243` would leave the stale `## Cross-repo contracts (with sleeper-dashboard)` heading sitting above the new one. The `---` at `:239` and `:268` stay.

```md
## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The **complete enumerated registry** — the entry-format definition and all 18 `CR-NN` entries — lives in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). It is the sole authority for what the app must mirror: the plan-reviewer subagent reads that section and never reads the sibling tree. Its data-side trigger lists are a maintained cache the subagent re-verifies against live source on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see Workflow convention.
```

Inbound-reference sweep in the data repo after this replacement: `## Sibling repo` (`:272`) ends with *"See Cross-repo contracts above"* and Invariant 3 (`:221`) says *"(see Cross-repo contracts)"* — both are prose references to the old heading name and need the one-token update to *Cross-repo contract registry*. Neither is a markdown anchor link, so nothing breaks silently; they are just stale names.

### 8.3 Workflow rewrite for the data repo

The data repo **has no `## Workflow convention` section at all** — its two-session flow is undocumented, and plan review appears only as `Done-definition` item 4 (`:284`). It needs the equivalent of Edit B, created from scratch.

- **Insert a new `## Workflow convention` section between `## Sibling repo` (`:270-274`) and `## Done-definition` (`:278`)** — i.e. after the `---` at `:276`.
- Content: the same in-repo framing paragraph, the same loop diagram, the same `### Plan review` three-part-mandate subsection, and the same `### The Claude.ai project` out-of-loop + residual-case subsection, with these repo-appropriate substitutions:
  - The `Invariants` link points at the data repo's own `## Invariants` (`:215-237`).
  - The registry link points at the data repo's own `README.md` registry section — **not** at a `docs/` path (§8.0).
  - **Do not import the app's model-routing table or its visual-verification bullet** — visual verification is app-specific and there is nothing to look at here.
  - The two-session bullets adapt: the opus bullet is unchanged in substance; the sonnet bullet's validation step is `npm run smoke` (+ `npm run validate:enrichment` for enrichment changes), not `npm run build`.
- **`Done-definition` item 4 (`:284`)** — replace `"Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2."` with a pointer: `"Plan review: see Workflow convention → Plan review. The subagent is the primary review gate, not a lint pass."` Items 1, 2, 3, 5 unchanged.
- **`## Session git workflow` (`:289-301`) is untouched** — it is data-repo-specific (manifest union-merge, rebase-before-push, CDN purge) and has no app analogue.
- **`## Self-maintenance` (`:305`), final sentence of the paragraph at `:307`** — replace `"If a change affects a Cross-repo contract, state that explicitly in your task summary so the sibling repo can be updated to match."` with the registry-emission rule from Edit C, adapted: emit the entry's `Mirror` text in a `## Cross-repo impact` section quoting the `CR-NN` id; a new coupling gets an entry in both repos in the same change. **The signal-registry and `data-catalog.md` sentences earlier in that paragraph stay** — but they are now *also* CR-18, so add a parenthetical naming it (`— this is CR-18`) so the prose obligation and the registry entry cannot drift apart.

### 8.4 Subagent mandate for the data repo

`sleeper-dashboard-data/.claude/agents/plan-reviewer.md` (25 lines) gets the same three-part restructure. Keep `tools: Read, Grep, Glob` and `model: opus`.

- **Part 1 (factual/mechanical)** — keep the data repo's existing domain-specific checks verbatim; they are sharper than the app's and must not be flattened into the app's wording. Specifically retain: the manifest-before-data-file ordering trap, the CDN-purge sequencing rule (re-runs purge both manifest and season file; new season files self-serve), the capture-only invariant check, the append-only / content-hash-idempotency check (count-based guards false-positive on broad recalibration), and the per-season rate-aggregation trap (`pass_rtg` summed instead of recomputed).
- **Part 2 (strategic/principles)** — new. Same shape as the app's: read the data repo's `## Invariants` section, do not restate it, flag the specific invariant by name. The data repo's **nine** invariants are the reference — append-only, never hand-edit primary data, manifest-is-the-index, schemaVersion discipline, snapshots-are-permanent, enrichment schemas, yearly sentinel maintenance, season-derived CDN purge URLs, grading-never-recomputes. (The list is numbered 1–8 with the number `8` used twice, at `:235` and `:237`; there are nine items. Fixing the numbering is optional and out of scope here — do not renumber as a side effect of this change.)
- **Part 3 (cross-repo intent)** — new, replacing the current single bullet at `:20` (`"a cross-repo contract the plan touches but does not flag for the sibling app repo (shared constants such as MIN_SCHEDULE_GAMES, the fantasyPoints scoring mirror)"`). Same text as the app's Part 3 with two substitutions: the reviewer reads **`README.md` → Cross-repo contract registry** (not a `docs/` path), and it evaluates the **data side** of each `Triggers` field — the part **right** of `‖` — and cannot read the app tree.
- **Part 3's standing re-verification duty — mirrored, and inverted.** The app's mandate obliges its reviewer to re-verify the **app-side** triggers against live `src/`. The data repo's mandate obliges the same duty on its own near side: for each entry whose data shape or stat key the planned change reads or writes, grep live `lib/`, `scripts/` and `bin/` for that entry's keys, served-shape fields and exported symbols, compare against the entry's **data-side** triggers, and flag any uncovered live consumer or producer as `[registry-stale]` with `file:line` and the entry id. Correspondingly it treats the **app-side** triggers as frozen authority — it cannot read `src/`, so it must not flag them as incomplete or attempt to "fix" them. Add `registry-stale` to its category list alongside `registry-gap`.
- **Why this matters more here than it looks.** The data side is where the sweep found the deepest holes (constant definition sites, the whole of `lib/validate.mjs`, the generic `aggregateWeeks` loop), and it is also the open-ended one — a new ingest script is a new producer no static list can anticipate (CR-18 says so explicitly). The data repo's reviewer is the only party that can see those, exactly as the app's reviewer is the only party that can see new `src/` consumers. Note the old bullet's two examples are now *entries* with far wider trigger sets than the bullet implied (`MIN_SCHEDULE_GAMES` is CR-08 and is **defined** in `lib/nflverse.mjs`, not in the update script; the scoring mirror is CR-14 and reaches the fit path via `scripts/panel-run.mjs`), which is precisely why the enumerated registry replaces the bullet rather than sitting alongside it.
- **Output block** — identical to §4.3, including the `FLAGS` / `MIRROR` split and the scoped "No blocking issues found." rule.

### 8.5 Drift check, once both sides land

The mirrored regions are byte-identical by construction even though they live in different files, because the **same sentinel pair bounds both**:

```bash
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "docs/cross-repo-registry.md") \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "../sleeper-dashboard-data/README.md")
```

Empty output = in sync — and a correctly-mirrored pair genuinely returns empty, which the earlier `CR-01`-to-heading form could not: the data repo has no `## Drift check` heading, so its range ran to EOF, and substituting `## Enrichment overlay` as its terminator still left the two `> *Note:*` paragraphs and a non-matching terminator line inside the compared span. The sentinels remove all three problems by construction — identical start line, identical end line, nothing repo-specific in between.

Both files must therefore carry the sentinel lines verbatim (§8.2's copy boundary). If the `diff` ever reports the whole block as changed, check the sentinels before checking the entries — a missing or reworded sentinel makes one `sed` return nothing and the other return everything.

This is a manual check for the human, **not** something either subagent can run (neither can read the other tree) and not a CI gate — adding one would mean giving a build step cross-repo access, which is the coupling this whole design avoids.

---

## 9. Tests to add

**None.**

This change edits two markdown files and adds a third. It adds no function, no module, no data shape, and no runtime path. Nothing in `src/` is touched, so there is no behaviour for a Vitest suite to assert against, and the repo has no docs-linting or markdown-link-checking infrastructure to extend.

Per `CLAUDE.md` → *Done-definition* item 1, purely non-behavioural changes — "renames, docs, lint, dead-code removal" — need no tests. This is squarely that case.

**Verification is the structural checklist in §6 (V1–V11), which the implementer runs by hand.** V9 and V10 in particular are the acceptance test for the preserve-verbatim constraint; V6/V7/V8 are the acceptance test for the registry's structural completeness. Note what V1–V11 deliberately do **not** check: whether each entry's `Triggers` actually cover every live consumer. That is not mechanically checkable from a `grep` over markdown, and per §2.2.0 the two sides are handled differently — the **data side** was verified once by the §2.2 sweep and is held true by the both-repos-same-change rule; the **app side** is re-verified continuously by the plan-reviewer's `registry-stale` duty (§4.3), which is a runtime property of the loop, not something a V-row can assert at landing time. The existing suite still runs green via the Stop hook, which is coverage that nothing was broken, not coverage of what was added.

**Not worth building, and deliberately declined:**
- A markdown-link checker. It would catch V3/V4/V5, but adding a lint dependency and a `package.json` script to a docs-only change violates the "no runtime/product change" constraint and is disproportionate to a one-time anchor rename plus one new file path.
- A registry-format schema validator. The registry is read by a human and by an LLM subagent, both tolerant of formatting slips; a validator would be more brittle than the thing it validates, and it would need to live in both repos to be worth anything.
- A cross-repo registry-diff CI gate. Rejected in §8.5 for a substantive reason: it would require giving a build step access to both trees, which is exactly the coupling this design exists to avoid.

---

## 10. Non-goals / out of scope

- **No source under `src/` is touched.** V1 is the check.
- **No data-repo edits in this session.** §8 is a spec, not a task list for here.
- **No `docs/` directory is created in the data repo.** §8.0 — the app-side move to `docs/` is app-only; the sibling mirrors format and entries into its `README.md`.
- **The Stop hook, task-file handoff, effort/model routing table and token-discipline rules are preserved verbatim.** Only review ownership and the cross-repo registry format change.
- **Historical `.claude/tasks/*.md` are not rewritten.** They record what was true when written.
- **`docs/signal-registry.md` content is untouched** — no row changes here. It is *not* out of scope conceptually: it is CR-18's app-side artifact (see §7). Signal registry ≠ contract registry; the two are cross-linked by CR-18 and are not merged.
- **The data repo's Invariants numbering is not fixed** (`8` appears twice). Noted in §8.4; renumbering is a separate change.
- **The Claude.ai project is not deleted or disabled** — it is documented as out of the standard loop, with exactly one residual routing case.
- **Whether the six reconciliation entries (CR-11…CR-16) stay is the human's call at approval.** They are marked in-line so any can be struck without disturbing CR-01…CR-10. Striking them costs nothing structurally and loses the `app→data` silent-drift coverage. **CR-17 and CR-18 are not in that category** — they are live couplings absent from both repos, and striking either re-opens a gap that Edit A's "an unlisted coupling does not exist for review purposes" rule would then make invisible to the reviewer. If any entry is struck, V7/V8's expected count drops accordingly and must be edited to match, and §8.2's mapping table loses its row.
- **The §2.2 sweep's added triggers are not individually optional, on either side.** The data-side additions are frozen authority — the app-repo subagent has no live source to fall back on for the sibling tree, so dropping one re-creates a genuinely invisible gap. The **app-side** additions matter for the mirror-image reason: they are frozen authority for the *data repo's* reviewer, which cannot read `src/` either. Per §2.2.0, what differs is not whether app-side completeness matters, but how it stays true over time — the standing `registry-stale` re-verification duty (§4.3 Part 3) bounds the ongoing maintenance cost by catching a future gap at the next relevant review, rather than requiring this pass to be the last word.
- **Chasing a one-off, provably-exhaustive static app-side enumeration is out of scope, by design — completeness itself is not.** §2.2.0 replaces the goal of a perfect static list with the standing `registry-stale` duty in the mandate, which keeps the app side reasonably complete on an ongoing basis. A fifth manual sweep of `src/` run purely to certify exhaustiveness is not the fix and should not be scheduled; the standing duty already does that job, continuously.
