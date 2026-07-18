# Share-denominator diagnostic — Outlook "Rush share" vs Profile "Role History" 2x disagreement

**Type:** read-only diagnostic. No source, test, or doc edited.
**Date:** 2026-07-16.
**App HEAD:** `1ca1382c3eb1e210965cb904886e35970cffe304` ("feat: activate R2 per-season-team attribution", flip date 2026-07-11 per message, committed 2026-07-16) = `origin/main`, verified via GitHub MCP `list_commits` + local `git fetch`. Post-flip source confirmed (`DEFAULT_ATTRIBUTION = 'per-season-team'`).
**Data HEAD:** `52eea562bc344f5fa3a56c99b21c3c51833561b2` ("nflverse: roster 2026-07-14") = `origin/main`, verified via GitHub MCP; local checkout fast-forwarded from `1912d2b` before any file was read.
**Player under test:** Jonathan Taylor, `sleeper_id 6813` (identified in served data: 332 rush_att/17gp IND 2021 · 303/14 2024 · 323/17 2025).

---

## Verdict (3 lines)

1. **Both surfaces intend the same metric** — player `rush_att` ÷ team season `rush_att`, per-season-team attributed. The Outlook tile computes it correctly (2025: 323/442 = **73.1%**, trend vs 2024 = **+12.0** — both match the screen exactly); the Profile Role History divides by an **exactly doubled** denominator (323/884 = 36.5% → 37%; 2024: 303/992 → 31%; 2021: 332/998 → 33% — all three match the screen).
2. **Mechanism:** the served season-totals v3 files contain Sleeper's `TEAM_<abbr>` team-aggregate pseudo-rows (whole-team stats keyed as a player, with `gamesPlayed: 17` and a per-season `team` field); the app's `computeHistoricalTeamTotals` sums **every** careerStats entry with no entity/membership filter, so each team denominator = individual players' sum + an equal TEAM_ row = 2x. The Outlook path is immune because `buildTeamShareTotals` gates on playersMap membership, which `TEAM_*` ids fail.
3. **Scoring-affecting, app-owned fix** — the same inflated object feeds projection Step 3 (volatility-label distortion) and Step 5h (recorded `teamRzShare` halved; factor ≈ invariant); the dynasty channels are shielded by the R2 current-team pin. One correction to the prompt's framing, with evidence in Q7: the **2x form is flip-exposed, not pre-flip** — pre-flip current-team mode dropped the TEAM_ rows and distorted in the *opposite* direction (Taylor 2021 ≈ 84% est.). The latent defect (unfiltered summation) and the surfaces' disagreement do predate the flip; the specific halving does not.

---

## Q1 — Provenance of the Outlook "RUSH SHARE" tile

**Render:** `src/components/players/OutlookTab.jsx:162` — metric descriptor `{ id: 'rushShare', label: 'Rush share', tooltip: 'rush_att / team rush_att, attributed by per-season team (careerStats[season].team) — same series as the ALL-view Opp trend. gp≥8.', ...pctShareFmt }` (the tooltip self-documents the intended denominator). Rendered uppercase ("RUSH SHARE") by the column-header styling; `pctShareFmt` (line 142) formats `0.731 → 73.1%`. Cell summary via `computeMetricSummary` (OutlookTab.jsx:364 → `outlookPositionStats.js:219-241`): `level` = latest-season value, `trend.delta` = latest − prior (`0.731 − 0.611 = +0.120` → the +12.0 arrow).

**Value chain (all in-app, from served v3 counting stats):**
- `OutlookTab.jsx:316` memo `buildTeamShareTotals(careerStats, playerMap)`; `:320` memo `buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)`.
- `buildPositionStatSeries` (`src/utils/outlookPositionStats.js:172-207`) — `rushShare` is in `SHARE_FROM_SERIES` (line 17) → reads the per-season share series directly (lines 183-188).
- **Numerator:** `careerStats[season][6813].stats.rush_att` (`buildPerSeasonTeamShares`, outlookPositionStats.js:88-89).
- **Denominator:** `buildTeamShareTotals` (outlookPositionStats.js:32-52) — Σ `stats.rush_att` over entries with `gamesPlayed ≥ 1` (line 37) **AND `if (!player) continue` playersMap-membership gate (lines 38-39)** **AND** `resolvePlayerTeam` non-null (lines 40-41 — `careerStats[season][pid].team` only, **no fallback**; team-less records contribute to no denominator), bucketed per-season-team.
- **Window:** one value per season (gp≥8 for the share row, outlookPositionStats.js:75); the tile shows the latest season (2025) with delta vs prior (2024).

**Ground-truth (served `nfl/season-totals/2025.json` / `2024.json`):** membership-gated IND denominator = 442 (2025) / 496 (2024) — the TEAM_ row fails the membership gate; bare `IND` DEF entry passes membership but carries **no offensive stat keys** (verified null), contributing 0. Taylor: `323/442 = 0.7308` → **73.1%**; prior `303/496 = 0.6109`; delta `+0.120`. **Exact match to the observed tile — the Outlook value is correct.**

## Q2 — Provenance of the Profile "ROLE HISTORY" Carry Share column

**Render:** `src/components/PlayersTab.jsx:543-583` — "Role History" heading (548), column label `'Carry Share'` for RB (545), cell = `Math.round(entry.share * 100)%` (568), one row per season, latest 5.

**Value chain:**
- `shareHistory` = `historicalShares?.[playerId]?.slice(-5)` (`src/hooks/usePlayerProfile.js:142-145`), read from `ProfileDataContext` (provider `PlayersTab.jsx:2243`; App passes the prop at `App.jsx:1038`).
- `historicalShares` memo `App.jsx:210-213` → `computeHistoricalShares(careerStats, leagueData.playerMap, historicalTeamTotals)` — **default attribution, post-flip = `'per-season-team'`**.
- **Numerator:** `careerStats[season][6813].stats.rush_att`; RB share = `rushAtt / Math.max(teamTotals.rushAtt, 1)` (`src/utils/teamContext.js:265`).
- **Denominator:** `computeHistoricalTeamTotals` (`teamContext.js:216-235`) — Σ `stats.rush_att` over **every** entry in `careerStats[season]` with `gamesPlayed ≥ 1` whose `resolveAttributedTeam(data, playersMap[playerId], attribution)` (line 222) is non-null. Per-season mode resolves `data.team ?? playersMap[pid]?.team` — **no playersMap-membership gate, no entity/position filter**. `TEAM_IND` carries `team: 'IND'`, `gamesPlayed: 17` → it is summed.
- **careerStats provenance:** the data-store path returns the served v3 file **verbatim** (`src/api/sleeperStats.js:146-158`) — TEAM_ rows and DEF entries included. (The live-API fallback path filters to `activePlayerIds` — sleeperStats.js:185, built from playersMap at App.jsx:823-826 — and would exclude them; all seasons 2012–2025 are currently store-provenance.)
- **Window:** per-season values, gp≥8 (teamContext.js:251), last 5 seasons displayed.

## Q3 — Are they the same quantity?

**Same intended quantity; one implementation is wrong.** Both compute "player's share of his team's season rushing attempts, attributed to the team he played for that season." The only semantic difference between the two denominators is entity filtering: Outlook sums *players the app knows about* (playersMap members); the Profile sums *every key in the data file*, which includes a hidden whole-team aggregate row per team. The Profile denominator is defective — it is not a different-but-defensible metric (RB-room share, per-game normalization, etc. were ruled out; the expressions are otherwise identical).

**One sentence for a non-engineer:** both numbers mean "what fraction of the Colts' rushing attempts went to Taylor," but the data file contains an extra invisible 'whole team' row alongside the individual players, and the Profile adds that row into the team total — counting every carry twice — while the Outlook tab correctly ignores it.

## Q4 — Ground-truth check on the denominator

Computed directly from the served files (data repo HEAD `52eea56`, script preserved at scratchpad `denom-check.mjs` / `team-row-detail.mjs`):

| Season | App Profile denominator (per-season IND Σ rush_att) | Composition | Taylor share as computed | Displayed | True share |
|---|---|---|---|---|---|
| 2021 | **998** | players 499 + `TEAM_IND` 499 | 332/998 = 0.333 | 33% ✓ | 332/499 = **66.5%** (matches external ~60-65%) |
| 2024 | **992** | players 496 + `TEAM_IND` 496 | 303/992 = 0.305 | 31% ✓ | 303/496 = **61.1%** |
| 2025 | **884** | players 442 + `TEAM_IND` 442 | 323/884 = 0.365 | 37% ✓ | 323/442 = **73.1%** |

A team's real season rush_att (~440-500) is exactly reproduced by the individual player sum; the denominator is exactly 2x it in every checked season.

**The specific mechanism:** Sleeper's weekly stats endpoints include per-team aggregate pseudo-entities keyed `TEAM_<abbr>` (65 non-numeric ids per served season file: 32 `TEAM_*` + 32 `<abbr>` DEF + 1 misc). The data repo's `aggregateWeeks` (`sleeper-dashboard-data/lib/sleeper.mjs:129+`) iterates every weekly entry with **no id filter**, so TEAM_ rows aggregate like players — `gamesPlayed: 17`, all 98 offensive stat keys (2021 `TEAM_IND`: rush_att 499, rec_tgt 505, rec 324, rec_air_yd 1941, rush_rz_att 106, rec_rz_tgt 63, fantasyPoints 1391.32), and the dominant-team resolution assigns them `team: 'IND'`. The app then sums them as if they were players.

**Candidate causes ruled out explicitly:** multi-season accumulation (denominators are per-season-keyed; 2021≠2024≠2025 values); league-wide/multi-team leakage (only IND-attributed rows contribute; contributor list is IND-only); cross-team position-group sums (no position grouping in the sum); double-counted weeks (would inflate player numerators equally — player sums match external reality; only the extra *entity* doubles the total); `aggregateWeeks` schedule-domain normalization (only remaps team abbreviations — `normalizeTeamForSchedule`, lib/sleeper.mjs:22-27). The RZ denominators double the same way (`IND 2021 rushRz: 212 with TEAM row, 106 without; recTgt: 1007 vs 502`).

## Q5 — Blast radius

The defective object pair is the per-season `historicalTeamTotals` (App.jsx:202-205-region memo) + `historicalShares` (App.jsx:210-213). Post-flip consumer map:

| Consumer | Affected? | Why |
|---|---|---|
| **Projection Step 3 share trend** (`seasonProjection.js:341-361` ← `historicalShares`) | **YES — scoring, second-order.** | All shares uniformly halved. The trend ratio `(recent−prior)/max(prior, 0.01)` is scale-invariant → **labels unchanged**; but `shareVolatility` is an absolute SD (`teamContext.js:313-320`, thresholds 0.05/0.10) → halved SD shifts labels toward `entrenched` → `shareVolatilityScale` rises (0.50→0.80→1.00 tiers) → the Step-3 multiplier's deviation is **under-damped** for any player whose true share SD is in (0.05, 0.20]. Also the `max(prior, 0.01)` floor binds at 2x the true share level. |
| **Projection Step 5h team-RZ share** (`seasonProjection.js` Step 5h ← `historicalTeamTotals`; `teamRzShare.js:127-169`) | **YES — recorded value; factor ≈ invariant.** | Recorded `teamRzShare` (snapshots/factors) is **halved** (own RZ opps ÷ doubled denom). The *factor* is a percentile against a cohort built from equally-halved shares (`buildCohortTable`, teamRzShare.js:68-99) → percentile rank invariant under uniform scaling → factor essentially unchanged. Second-order: the `MIN_TEAM_DENOM = 20` gates (lines 88, 148) — doubled denominators admit teams/players (true denom 10-19) that the guard was meant to exclude. |
| **Dynasty share-trend boost** (`dynastyScore.js:894-903`) | **NO.** | The R2 hold feeds it `historicalSharesCurrentTeam` (App.jsx:223-226, arg at 380), built in current-team mode: `resolveAttributedTeam` reads `playersMap['TEAM_IND']?.team` → playersMap has no `TEAM_*` keys → null → row skipped (`teamContext.js:222` + continue). Not inflated. (It retains the separate, settled current-team mis-bucketing — the R2 hold; not a defect here.) |
| **Dynasty OQ share score** (`dynastyScore.js:879, 218-223` ← `teamContext.playerShares`) | **NO.** | `computeTeamContext` is pinned `{ attribution: 'current-team' }` (App.jsx:192) → TEAM_ rows resolve to null team → skipped in both its loops (`teamContext.js:143, 174`). |
| **Workhorse-RB carryShare gate** (`applyQBQualityModifier`, `teamContext.js:96`) | **NO.** | Reads `signals.carryShare` from the same pinned `teamContext.playerShares` — see above. |
| **Role ranks** (`computeRoleRanks`, `dynastyScore.js:372-401`; App.jsx:493 ← per-season `historicalShares`) | **Effectively NO (today).** | Every player's weighted share is halved by the same factor → within-position **ordering is preserved** → identical ranks. Becomes affected only if scaling stops being uniform (see hazard below). |
| **Display ride-alongs** (Profile Role History + `usageShare` chip, `usePlayerProfile.js:142-145, 183-186`; Outlook ALL-view Opp trend uses the *separate correct* per-season series, `outlookUsage.js`) | **YES (Role History/usage chip halved)** — the observed defect. The Outlook surfaces are correct. |

**Forward hazard (conditional, flagged — not yet observable):** if a live-API-aggregated season ever coexists in `careerStats` with store seasons (the live path excludes TEAM_ rows and writes no `team` field — `sleeperStats.js:161-234`), the per-season share series mixes an *unhalved* latest season against *halved* priors → `computeShareTrend` reads ~+100% jumps → near-universal `growing` labels in Step 3 and recency-skewed role ranks. Whether the in-season year enters `careerStats` depends on the `loadCareerHistory` loop bound (`for s = 2012; s < currentSeason`, sleeperStats.js:240) and how `currentSeason` advances — verify when the 2026 store file goes `inProgress`.

**Gate/panel note (fact, not re-litigation):** the flip gate's panel built its share denominators the same unfiltered way (`buildTeamTotalsForSeason`, data repo `lib/panel.mjs:67-81`; same pattern `lib/backtest.mjs:214-216`) — TEAM_ rows doubled the denominators in **both arms identically** (common-mode), so the comparative FLIP-CLEARS verdict is unaffected; absolute share-feature levels in those artifacts are ~halved.

## Q6 — Cross-repo locus

- **The numbers are correct as emitted.** Each `TEAM_*` row truthfully aggregates that team's weekly stats; the data repo introduces no doubling. The rows enter because `aggregateWeeks` (`lib/sleeper.mjs:129+`) has no entity filter over the Sleeper weekly endpoint's contents — pass-through by omission, present in served files since data commit `135d8ac` (2026-05-19).
- **The defect is app-side misuse:** `computeHistoricalTeamTotals` (`teamContext.js:216-235`) and `computeTeamContext` (`teamContext.js:131+`, currently shielded by the current-team pin) treat every file key as an individual player. The app's own Outlook path (`buildTeamShareTotals`, outlookPositionStats.js:38-39) already demonstrates the correct discipline (membership gate).
- **Contract ambiguity (data-side, doc-level):** the season-totals contract ("players keyed by `sleeper_id`", app CLAUDE.md cross-repo table) nowhere states that `TEAM_*` aggregates and `<abbr>` DEF pseudo-ids are present. Whichever remedy is chosen, the contract should state it explicitly. Fix ownership: **app** (filter at consumption — non-breaking, no regeneration) unless a deliberate decision is made to exclude pseudo-ids at emission (data-pipeline change, regenerates 2012–2025, also normalizes the panel's absolute levels; must be coordinated).

## Q7 — Recency

Established via git history in both repos:

1. **App summation, unfiltered from birth:** `computeHistoricalTeamTotals` present since the app's initial commit `9cb4286` (2026-05-29); no entity filter at any point in its history. Latent defect, long-standing.
2. **TEAM_ rows in served data:** **absent** from the initial data export `82235d2` (2026-05-18: 0 `TEAM_` ids in 2021.json); **present** since `135d8ac` (2026-05-19, Phase 5 regeneration: 32 ids), and in every regeneration since. The per-season `team` field that makes them *attributable* arrived with v3 (`5b1acdc`, 2026-06-26).
3. **The observed 2x halving is flip-exposed, not pre-flip.** This corrects the task brief's assumption, with evidence: pre-flip (`current-team` mode) `resolveAttributedTeam` keyed TEAM_ rows through `playersMap`, which has no `TEAM_*` entries → they were **dropped** from every denominator. (Runtime corroboration that playersMap lacks them: the Outlook tile's observed 73.1% is only reproducible if the membership gate excludes `TEAM_IND`.) Pre-flip the Profile suffered a *different*, opposite-direction distortion — current-team bucketing undercounts (retired/departed 2021 Colts excluded): estimated Taylor 2021 ≈ `332/397 ≈ 84%` (denominator proxied with the 2026 nflverse roster's IND players; approximation, see Runtime checks). So: the two surfaces disagreed before the flip too (≈84% vs 66.5%), the *latent defect* predates the flip, but the specific ~2x-low readings began at the flip (app `1ca1382`, flip date 2026-07-11, committed 2026-07-16), when attribution switched to the `team` field that TEAM_ rows carry. **This does not implicate the flip/hold design** — the flip is behaving as specified; it changed which latent data hazard the unfiltered summation is exposed to.

---

## Candidate remedies (one line each — not begun)

- **App-side entity filter** in `computeHistoricalTeamTotals`/`computeTeamContext` (mirror the Outlook membership gate, or skip `TEAM_*`-prefixed/DEF-position ids): **scoring-affecting** (Step 3 volatility labels + recorded `teamRzShare` values move; snapshot-date convention + gate discipline apply).
- **Data-side emission filter** (exclude pseudo-ids from season-totals): **data-pipeline** (regenerates 2012–2025 served files; cross-repo coordination; also corrects panel absolute levels).
- **No display-only fix exists** — the Profile reads the same object that feeds scoring; relabeling cannot reconcile a 2x factual error.
- **Optional future design:** consume `TEAM_*` rows *intentionally* as exact team denominators (cheaper and more complete than summing players): **data-pipeline/design**, would need the contract to bless the rows first.

## Runtime checks for Anton

Everything above is established from served files + source; two things remain worth confirming in the browser (DevTools → Application → IndexedDB → database **`sleeper-dashboard`** → object store **`cache`**):

1. **The cached careerStats actually contains the TEAM_ rows (store provenance).** Key **`season-totals/2021`** → record `{ key, data, expiresAt, sourceLastModified }`. Expect: `sourceLastModified` non-null (data-store provenance) and `data.TEAM_IND` = `{ team: 'IND', gamesPlayed: 17, stats: { rush_att: 499, … } }`. If `data.TEAM_IND` is absent and `sourceLastModified` is null, that season is live-API provenance and the Profile defect would NOT reproduce for it (and the mixed-provenance hazard in Q5 becomes live).
2. **playersMap has no `TEAM_*` keys** (the load-bearing fact behind both the Outlook immunity and the dynasty-pin immunity). Key **`/players/nfl`** (set via `fetchWithCache`, `src/api/sleeper.js:44-46`) → in the console: `Object.keys(data).filter(k => k.startsWith('TEAM_'))` → expect `[]`, while `data['IND']` exists with `position: 'DEF'`.

(The pre-flip 84% estimate in Q7 used the 2026 nflverse roster as a proxy for playersMap current teams — directionally solid, not exact; no action needed unless you want the precise pre-flip value, which would require re-running `computeHistoricalShares` with `{ attribution: 'current-team' }` against the cached playersMap.)

## Cross-repo impact

- **No contract shape change is implicated by the diagnostic itself.** If the app-side filter remedy is chosen: app-only change; the data repo needs **one doc annotation** — the season-totals contract (data repo CLAUDE.md cross-repo table + data-catalog.md season-totals section) should state explicitly that served files include `TEAM_<abbr>` aggregate and `<abbr>` DEF pseudo-ids, and that consumers must filter to individual players for denominators.
- If the data-side emission filter is chosen instead: that **is** a cross-repo contract change (served-file contents change; 2012–2025 regeneration; app fixture `src/__fixtures__/season-totals-2025.json` should be checked for pseudo-id presence and the panel artifacts' absolute levels shift) — both repos change together.
- Bears on the R2 annotation already output by `.claude/tasks/r2-flip-activation.md` §7: the "silent-scoring-change surface" note for `aggregateWeeks` now has a concrete instance — the *contents* of the aggregation (which entities), not just the dominant-team rule, are scoring-load-bearing post-flip.
