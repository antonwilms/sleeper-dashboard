# Outlook shares → per-season-team attribution (DISPLAY-ONLY)

**Session 1 (opus) plan. Session 2 (sonnet) implements. No source was edited in Session 1.**

## 0. Goal in one sentence

Move **every share display on the Players → Dynasty → Outlook tab** off *current-team*
attribution and onto **per-season-team** attribution (`careerStats[season][id].team`,
schema-v3), for the **display layer only** — leaving the projection/scoring share path
(`computeHistoricalShares` / `computeHistoricalTeamTotals` in `teamContext.js`) and all its
consumers **completely untouched, still current-team, with their team-change neutralization
intact**.

The four Outlook share displays that move:

| Display | Current source (current-team) | After (per-season-team) |
|---|---|---|
| RB pill **Rush share** | `historicalShares` (reused verbatim) | `perSeasonTeamShares` |
| WR/TE pill **Target share** | `historicalShares` (reused verbatim) | `perSeasonTeamShares` |
| RB pill **Target share** (`rbTargetShare`) | `buildTeamReceivingTotals` denom + `playerMap.team` | `buildTeamShareTotals` denom + per-season team |
| WR/TE pill **Air-yards share** (`airYardsShare`) | `buildTeamReceivingTotals` denom + `playerMap.team` | `buildTeamShareTotals` denom + per-season team |
| ALL-view **Opp trend** column | `computeUsageTrend(buildUsageHistory(…historicalShares))` | same fns, fed `perSeasonTeamShares` |

**Snap trend does NOT move** — snap% is `off_snp/tm_off_snp`, a player's *own* snap fraction,
with no cross-player team denominator. **Role** column moves *implicitly and consistently*: it
bands off the most-recent snap% + share from `buildUsageHistory`, which now carries per-season-team
shares (for a rostered player the most-recent season's team == current team, so Role is practically
stable; for an offseason-mover it becomes *more* correct — see §3.4).

---

## 1. Verified facts (checked against live source + live CDN data on 2026-07-01)

1. **`careerStats[season][id].team` is real, served, and fully populated.** The live data store
   (`VITE_DATA_STORE_URL` → `sleeper-dashboard-data@main`) serves `nfl/season-totals/<year>.json`
   at **`schemaVersion: 3`** (manifest `lastModified` 2026-06-26). Sampled files:
   - 2023: 2777/2777 records carry `team`, **0 null**, 32 distinct teams.
   - 2020: 2350/2350, 0 null. 2012: 1285/1285, 0 null.
   So the "absent per-season team" branch is a **defensive edge, not a live condition** in the
   backfilled range (2012–present). Still implement graceful omit (never NaN) — see §3.3.

2. **Domain difference — load-bearing.** The per-season `team` is served in the **nflverse /
   schedule domain** (`LA`, not `LAR`; confirmed `LA` present, `LAR` absent in 2023). The
   current-team helpers key on `playerMap[pid].team`, which is the **Sleeper domain** (`LAR`).
   → The new per-season-team denominators are keyed in a *different string domain* than the
   current-team denominators. This is **fine and requires no normalization**, because within the
   new path the numerator player and the denominator population are grouped by the *same*
   per-season key (`record.team`) → internally consistent. **Do NOT cross-reference the two
   denominator maps, and do NOT normalize** — just never mix them.

3. **Single per-season team = the player's dominant (most-games) team.** Confirmed CMC 2022 →
   `team: 'SF'` with `gamesPlayed: 17`, `rush_att: 244` (a season that spans CAR wks 1–6 + SF
   wks 7–18; SF is his 11-game majority team). So a mid-season-traded player's **full-season
   counting total is attributed wholly to one team** → bounded residual, see §3.2.

4. **The test fixture is stale.** `src/__fixtures__/season-totals-2025.json` has **no `team`
   field** (single-season, player-keyed; 2750 records, 0 with `team`). This is a *fixture-lag*
   issue, not a data issue — the live CDN has `team`. New share tests must construct inline
   `careerStats` with `.team` (the existing outlook tests already build their own fixtures, so no
   shared-fixture dependency). **Optionally** refresh the fixture, but not required (see §Tests).

5. **Import graph is clean for a view-only migration.**
   - `buildTeamReceivingTotals` is imported **only** by `OutlookTab.jsx` (+ its own test). Once
     Outlook moves to per-season-team, it has **zero consumers → delete it** (goal: "keep only if
     some consumer still needs it — it should not").
   - `outlookUsage.js` (`buildUsageHistory`/`computeUsageTrend`/`buildRoleCohort`/`classifyRole`)
     is imported **only** by `OutlookTab.jsx` (+ its own test). **No projection/scoring module
     imports it.** `computeUsageTrend`/`buildUsageHistory` are already parameterized on the shares
     map — they need **no code change**; only the *caller* passes a different map. So **no fork of
     `computeUsageTrend` is required** (the goal's "fork if shared" precondition does not trigger).
   - `outlookPositionStats.js` is already guarded view-only by
     `src/__tests__/outlookPositionStatsViewOnly.test.js`. The new functions live in that same
     module → automatically covered. Extend the guard to also cover `outlookUsage.js` (§Tests).

6. **`computeHistoricalShares` / `computeHistoricalTeamTotals` are projection-feeding** (share-trend
   factor, dynasty-score share-trend boost, `computeRoleRanks`, RZ denominators — signal-registry
   rows `shareTrend`/`rzUsage`, and neutralized 1.0 on team change). **Not touched by this slice.**

---

## 2. Design decisions (committed)

### D1 — Extend `outlookPositionStats.js`; do NOT add a new util.
It is already the view-only Outlook position-stat module, already guarded, already imports only
view-safe deps. Add two functions and modify `buildPositionStatSeries`; **remove**
`buildTeamReceivingTotals`.

### D2 — Produce a per-season-team analogue of `historicalShares` with the SAME shape.
`historicalShares` is `{ [pid]: [{ season, share, gamesPlayed }] }`. The new
`perSeasonTeamShares` has the **identical shape**, so it is a **drop-in** for both consumers
(`buildUsageHistory`'s 4th arg and `buildPositionStatSeries`'s share-metric loop). This is the
key to keeping the diff tiny and the non-changer numbers stable.

### D3 — Build the two new maps as `useMemo`s **inside `OutlookTab.jsx`**, never in the App.jsx
pipeline and never in `ProfileDataContext`. They must stay off every path projection/scoring reads.
`historicalShares` continues to flow (unchanged) into `profileContextValue` — the Player Profile
Role-History table stays current-team (see §3.5, deliberate scope boundary).

### D4 — Faithful mirror of `computeHistoricalShares`/`computeHistoricalTeamTotals` discipline.
`buildTeamShareTotals` gates `gp ≥ 1` and skips records with no resolved `team` (mirrors the
`if (!team) continue` gate — the current-team version's gate is "in playerMap with a team", the
per-season version's gate is "record has a team"). `buildPerSeasonTeamShares` gates `gp ≥ 8`, uses
RB=rush / WR-TE=rec_tgt-else-rec, `r3` rounding — **byte-for-byte the same math**, differing only
in the team key + denominator source. This is what makes the invariance test (§Tests T3) pass.

### D5 — Position (not team) still comes from `playerMap`.
`buildPerSeasonTeamShares` reads `playerMap[pid].position` for the RB/WR/TE gate + QB-skip only
(exactly as `computeHistoricalShares` does). **Team never comes from playerMap in the new path.**
`buildPositionStatSeries` already receives `position` as an argument and resolves the per-season
team from `careerStats[season][pid].team` inside its loop, so it **no longer needs `playerMap`** at
all → drop it from that function's deps.

---

## 3. Correctness subtleties the implementer MUST preserve / document

### 3.1 "Non-team-changers byte-identical" — the precise, testable invariant.
The goal says non-team-changers must be numerically unchanged. The **exactly true, testable**
statement is: **on a dataset with no team changes anywhere (and every player present in both
`careerStats`-with-`team` and `playerMap`-with-the-same-team), `perSeasonTeamShares` is
byte-identical to `historicalShares`.** That is the invariance test (T3).

Be aware the prompt's shorthand "the only intended change is team-changers' prior-season
denominators" is a **simplification**. In *real* data a non-changer's share can still shift for two
legitimate reasons, and **both are corrections, not regressions**:
  - **(a) A teammate moved.** Re-bucketing a team-changer necessarily changes the season-total
    denominator of the team they left/joined, so a non-changer on that team sees a (more correct)
    denominator. It is arithmetically impossible for *only* team-changers to change.
  - **(b) Retired-player inclusion.** `buildTeamShareTotals` sources its population straight from
    `careerStats[season]` records (anyone with a resolved `team` + `gp≥1`), whereas
    `computeHistoricalTeamTotals` implicitly drops players absent from `playerMap`. The per-season
    path therefore **includes retired players in the denominator** that the current-team path
    omitted — this actually *fixes* the documented "historical seasons may undercount the true
    denominator" limitation (`teamContext.js:187-190`). Net effect: slightly larger, more accurate
    historical denominators.

State (a) and (b) in the docs so a future reader does not mistake real-data movement for a bug.
Design T3 on the controlled no-change fixture where neither (a) nor (b) applies → identical.

### 3.2 Mid-season-trade residual — bound it explicitly (do not silently ignore).
`careerStats[season][id].team` is a **single** string = the dominant/most-games team (CMC 2022 →
SF). A traded player's **full-season** counting total is divided by that **one** team's denominator:
  - Their share is **overstated** vs the dominant team (their away-team snaps are folded in), and
  - They are **absent** from the minority team's denominator (understating that team's other
    players' shares).
Residual magnitude is bounded by the minority-team fraction of the season (typically ≤ ~6/17 games
for an in-season trade). This is the **same residual class** the NFL-stats game-log join already
documents (`docs/ui.md` Outlook/NFL-stats "Known limitations"). Document it; do not attempt weekly
splits (out of scope — the ingest has no per-week team here).

### 3.3 Absent per-season team → graceful omit (never NaN).
If `careerStats[season][id].team` is null/absent: the record contributes to **no** team's
denominator in `buildTeamShareTotals`, and the player's share for that season is **omitted** (no
entry pushed) in `buildPerSeasonTeamShares`. Never 0, never NaN. (Live data has 0 nulls 2012–2023,
so this is defensive.) This matches the existing never-NaN/omit discipline.

### 3.4 Role / Opp-trend for offseason movers = the intended fix.
For a player who changed teams **this offseason**, their most-recent *played* season (e.g. 2025)
was with the **old** team, but `playerMap.team` is the **new** team. Current-team attribution
divides their 2025 stat by the **new** team's 2025 denominator (wrong). Per-season-team divides by
the **old** (2025) team (correct). So Opp-trend and the Role band become *more* accurate for exactly
these players — the wart the slice targets.

### 3.5 Deliberate scope boundary — the shared Player Profile stays current-team.
The Profile panel (opened from Outlook *and* Explorer *and* NFL-stats) renders a Role-History table
+ AdvancedStatsPanel from `historicalShares` (current-team). Migrating the shared Profile is **out
of scope** (bigger, cross-surface change). Only the **Outlook tab's own columns** move. This is an
intentional, documented boundary, not an oversight — note it so the internal Outlook consistency is
understood to stop at the tab's columns.

---

## 4. Data shapes & function signatures (new / changed)

```js
// ── outlookPositionStats.js — NEW ──────────────────────────────────────────
/**
 * View-only per-season-team rushing/receiving denominators.
 * Season → per-season team (careerStats[season][id].team, nflverse domain e.g. 'LA')
 *        → { rushAtt, rec, recTgt, recAirYd }.
 * gp>=1; a record with no resolved `team` is skipped (→ contributes to no denominator;
 * "absent team → graceful omit"). Mirrors computeHistoricalTeamTotals discipline but keys by the
 * PER-SEASON team from the record, NOT playerMap[pid].team. No playerMap argument.
 * REPLACES buildTeamReceivingTotals. Never feeds projection/scoring.
 * @param {object} careerStats  { [season]: { [pid]: { gamesPlayed, team, stats:{...} } } }
 * @returns {{ [season:number]: { [team:string]: { rushAtt:number, rec:number, recTgt:number, recAirYd:number } } }}
 */
export function buildTeamShareTotals(careerStats)

/**
 * View-only per-season-team share series — the per-season-team analogue of
 * teamContext.computeHistoricalShares, with the IDENTICAL output shape.
 * Oldest→newest, gp>=8, RB=rush_att share, WR/TE=rec_tgt share (fallback rec share), r3 rounding,
 * QB skipped. The ONLY differences from computeHistoricalShares: (1) team attribution is
 * careerStats[season][id].team (per-season) not playerMap[pid].team, (2) denominators come from
 * teamShareTotals. playerMap is used ONLY for position + QB-skip (never for team).
 * Never feeds projection/scoring.
 * @param {object} careerStats
 * @param {object} teamShareTotals  buildTeamShareTotals(careerStats) output
 * @param {object} playerMap        { [pid]: { position } }  — position only
 * @returns {{ [pid:string]: Array<{ season:number, share:number, gamesPlayed:number }> }}
 */
export function buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)

// ── outlookPositionStats.js — CHANGED ──────────────────────────────────────
// buildPositionStatSeries(playerId, position, careerStats, deps)
//   deps: { historicalShares, teamReceivingTotals, playerMap }
//      →  { perSeasonTeamShares, teamShareTotals }        // playerMap dropped
//   - share-metric loop reads perSeasonTeamShares[playerId] (was historicalShares[playerId])
//   - counting loop resolves seasonTeam = careerStats[season]?.[playerId]?.team ?? null per season
//     and passes it as `team` to computeMetricValue (was one constant playerMap-derived team)
//   - computeMetricValue rbTargetShare/airYardsShare denom lookup: teamShareTotals[season][team]
//   - constant SHARE_FROM_HISTORICAL → SHARE_FROM_SERIES (cosmetic rename; same {rushShare,targetShare})

// ── outlookPositionStats.js — REMOVED ──────────────────────────────────────
// buildTeamReceivingTotals(careerStats, playerMap)   // no remaining consumer
```

`computeMetricSummary`, `computeMetricValue`'s non-share branches, `POSITION_STAT_METRICS`,
`outlookUsage.js` functions, and `nflStats`/`efficiencyMetrics` imports are **unchanged**.

---

## 5. Edits grouped by file (with anchors)

### 5.1 `src/utils/outlookPositionStats.js`
- **Remove `buildTeamReceivingTotals`** — the whole `export function buildTeamReceivingTotals` +
  its docstring (**:18–48**). Its current-team caveat comment goes with it.
- **Add `buildTeamShareTotals(careerStats)`** (signature §4). Body mirrors
  `teamContext.computeHistoricalTeamTotals` (`teamContext.js:191-210`) but: team = `data.team`
  (skip when falsy), fields summed = `rushAtt (rush_att)`, `rec (rec)`, `recTgt (rec_tgt)`,
  `recAirYd (rec_air_yd)`; **no `playerMap`**, no RZ fields.
- **Add `buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)`** (signature §4). Body
  mirrors `teamContext.computeHistoricalShares` (`teamContext.js:219-257`) exactly, substituting
  `const team = careerStats[season][pid].team` for `playerMap[pid].team`, and
  `teamShareTotals[season]?.[team]` for `historicalTeamTotals[season]?.[team]`. Keep gp≥8, the
  RB rush / WR-TE rec_tgt-else-rec branch, `share === null || !isFinite` guard, and
  `Math.round(share*1000)/1000`. Position + QB-skip from `playerMap[pid].position`.
- **`buildPositionStatSeries`** (**:114–149**): change `deps` destructure (**:115**) to
  `{ perSeasonTeamShares, teamShareTotals }`; drop the `const team = playerMap?.[playerId]?.team`
  line (**:121**); in the share-metric loop (**:126–131**) iterate `perSeasonTeamShares?.[playerId]`;
  in the counting loop (**:134–146**) compute `const seasonTeam = careerStats[season]?.[playerId]?.team ?? null`
  and pass `{ season, team: seasonTeam, teamReceivingTotals: teamShareTotals }` (or rename the
  destructure in `computeMetricValue`) so the denom lookup resolves against `teamShareTotals`.
- **`computeMetricValue`** (**:55–99**): rename the `teamReceivingTotals` param to `teamShareTotals`
  in the `rbTargetShare` (**:82–89**) and `airYardsShare` (**:90–97**) denom lookups. Math
  unchanged.
- **`SHARE_FROM_HISTORICAL`** (**:16**) → `SHARE_FROM_SERIES` (cosmetic; still `{rushShare,targetShare}`).
- **Module header comment (:1)** unchanged ("view-only; never feeds…").

### 5.2 `src/components/players/OutlookTab.jsx`
- **Imports (:10–11):** drop `buildTeamReceivingTotals`; add `buildTeamShareTotals`,
  `buildPerSeasonTeamShares`.
- **Replace the `teamReceivingTotals` memo (:323–326)** with two memos:
  ```js
  const teamShareTotals = useMemo(() => buildTeamShareTotals(careerStats), [careerStats])
  const perSeasonTeamShares = useMemo(
    () => buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap),
    [careerStats, teamShareTotals, playerMap]
  )
  ```
- **`usageByPlayer` memo (:315–321):** call `buildUsageHistory(id, pos, careerStats, perSeasonTeamShares)`;
  swap the dep `historicalShares` → `perSeasonTeamShares`.
- **`series` in `enrichedRows` (:354–355):** `buildPositionStatSeries(id, r.position, careerStats,
  { perSeasonTeamShares, teamShareTotals })`.
- **`enrichedRows` deps (:386–387):** replace `historicalShares, teamReceivingTotals, playerMap`
  with `perSeasonTeamShares, teamShareTotals` (drop `playerMap` from this dep list; it is now only
  used by the `perSeasonTeamShares` memo above).
- **`profileContextValue` (:552–556):** **unchanged** — `historicalShares` stays (Profile boundary, §3.5).
- **Tooltip caveat removal (per-season-team provenance):**
  - **:162** `rushShare` tooltip — replace "reused historicalShares — same series as the ALL-view
    Opp trend" with e.g. `'rush_att / team rush_att, attributed by per-season team (careerStats[season].team) — same series as the ALL-view Opp trend. gp≥8.'`
  - **:163** `rbTargetShare` tooltip — **remove** "Note: team-changer's prior-season share is
    measured against current team." Replace with `'rec_tgt / team rec_tgt (view-only per-season-team denominator). gp≥8.'`
  - **:167** `targetShare` tooltip — mirror :162 wording (per-season team, same series as Opp trend).
  - **:168** `airYardsShare` tooltip — **remove** the team-changer caveat; replace with
    `'rec_air_yd / team rec_air_yd (view-only per-season-team denominator). gp≥8.'`
  - **:432** Opp-trend header tooltip — optionally add "(per-season team)" for clarity; not required.

No other component changes. `historicalShares` and `playerMap` remain props (both still used —
`historicalShares` for `profileContextValue`; `playerMap` for the `perSeasonTeamShares` memo +
`profileContextValue`).

---

## 6. Docs updates

### `docs/ui.md` — Outlook tab section
- **:155 (Opp trend row):** append that the share is now per-season-team attributed.
  Before: *"Latest-vs-prior **target** (WR/TE) / **carry** (RB) share, arrow + Δpp; `—` for QB or
  <2 share seasons"*.
  After: add *"— attributed by **per-season team** (`careerStats[season].team`), so a player's
  prior-season share is measured against the team they were actually on that season."*
- **:166 (Position-specific stat columns):** rewrite the **"Shares are season team-total shares"**
  sentence. Remove the "Rush share (RB) and Target share (WR/TE) reuse `historicalShares` (identical
  to the Opp-trend series); … use a view-only team-receiving denominator (`buildTeamReceivingTotals`,
  mirroring `computeHistoricalTeamTotals` …)" current-team framing.
  After: *"**Shares are per-season-team season-total shares**: all four — Rush share (RB), Target
  share (WR/TE), RB Target share, WR/TE Air-yards share — plus the ALL-view Opp trend attribute each
  player's contribution to their **per-season team** (`careerStats[season][id].team`, schema v3),
  via two view-only helpers `buildTeamShareTotals` (per-season-team denominators, mirroring
  `computeHistoricalTeamTotals` discipline + `rec_air_yd`) and `buildPerSeasonTeamShares` (the
  per-season-team analogue of `computeHistoricalShares`, same shape/gp≥8). This corrects the former
  team-changer wart where a prior-season share was divided by the player's **current** team's total.
  The projection/scoring share path (`computeHistoricalShares`/`computeHistoricalTeamTotals`)
  deliberately **stays current-team** — see the attribution-split note below."*
- **:168–173 (Trends & history):** "the target/carry **share series is reused** from
  `historicalShares` (`computeHistoricalShares`)" → *"the target/carry **share series is the
  view-only per-season-team series** (`buildPerSeasonTeamShares`), not `historicalShares`"*.
- **Add a short "Attribution split" note** to the Outlook section (near :166): *"**Display vs
  projection attribution.** The Outlook tab's share **displays** use per-season-team attribution.
  The **projection & dynasty score** (share-trend factor, dynasty share-trend boost, role ranks, RZ
  denominators) deliberately remain on **current-team** attribution with team-change neutralization
  — that migration is a separate, backtested arc and is intentionally NOT part of this display
  change."*
- **Mid-season residual:** the existing Outlook/NFL-stats "Known limitations" text (~:233–234)
  already bounds the single-per-season-team residual for the game log; add one clause noting the
  Outlook shares share this residual (a traded player's full-season total is attributed to one team).

### `docs/architecture.md`
- **:112 (historicalShares bullet):** append a sentence: *"The Players → Dynasty → **Outlook tab**
  computes a **separate, view-only per-season-team** share path for its column displays
  (`buildTeamShareTotals` + `buildPerSeasonTeamShares` in `outlookPositionStats.js`, memoized inside
  `OutlookTab.jsx`); `historicalShares` itself stays **current-team** and continues to feed the
  projection/dynasty share-trend + role-rank path and the Player Profile Role-History table."*

### `CLAUDE.md` (src/utils table)
- **`outlookPositionStats.js` row:** replace "new shares via a view-only team-receiving denominator;
  reuses `historicalShares`, `outlookConsistency.QUALIFYING_GP`, …" with wording that lists
  `buildTeamShareTotals` + `buildPerSeasonTeamShares` and states shares are **per-season-team**
  (`careerStats[season][id].team`), no longer reusing `historicalShares`. Note `buildTeamReceivingTotals`
  removed.
- **`outlookUsage.js` row:** change "Reuses `historicalShares`" → "Opp-trend consumes the **view-only
  per-season-team share series** (`outlookPositionStats.buildPerSeasonTeamShares`), not
  `historicalShares`."
- No change to `teamContext.js` row (that path is untouched).

### `docs/signal-registry.md`
- **:103 (Outlook opportunity trend row):** change "reusing `teamContext.computeHistoricalShares`"
  → "reusing the **view-only per-season-team share series** (`outlookPositionStats.buildPerSeasonTeamShares`)";
  keep the "view-only display … never moves projectedPPG/dynasty score" classification.
- **:46 (NFL per-season `team` row):** extend the consumer note from "NFL-stats game-log schedule
  join — `NflStatsTab`" to also list "**Outlook share attribution** (`OutlookTab`, view-only)".
- **:77 (shareTrend) and :88 (rzUsage):** **no change** — projection path untouched, still
  current-team / neutralized on team change (call this out so the reviewer sees it was considered).

### `README.md`
- **:163 `outlookUsage.js` / :164 `outlookPositionStats.js` one-liners:** light touch — mention
  per-season-team share attribution. Non-critical; acceptable to leave README's terse lines as-is if
  the fuller CLAUDE.md/ui.md edits land. Flag: **update or explicitly skip**, do not leave
  contradictory ("reuses historicalShares") wording if it exists (it does not currently in README).

**Docs with NO change (stated explicitly):** `docs/projection.md`, `docs/dynasty-scoring.md`,
`docs/integrations.md` — the projection/scoring share path is untouched. `docs/nfl_prediction_research`
and design docs — unaffected.

---

## 7. Tests to add / update

All in `src/utils/outlookPositionStats.test.js` unless noted. Use inline `careerStats` fixtures
**with a `.team` field** on each season record for share tests.

### Update existing tests (API rename)
- **T-existing-A (Tests 1, 2, 3, 6, 8):** these pass `deps = { historicalShares: {},
  teamReceivingTotals: {}, playerMap: {} }`. Rename keys to `{ perSeasonTeamShares: {},
  teamShareTotals: {} }` (drop `playerMap`). Behavior/assertions unchanged (they exercise
  counting metrics — cmpPct/passerRating/sacks/yardsPerCarry/aDOT — which don't use team).
- **T-existing-B (Test 4 — "rushShare from historicalShares verbatim; rbTargetShare from
  buildTeamReceivingTotals ratio"):** rewrite to: rushShare from `perSeasonTeamShares` verbatim;
  rbTargetShare from `teamShareTotals` keyed by the record's per-season `team`. Add `.team` to the
  careerStats records.
- **T-existing-C (Test 5 — `buildTeamReceivingTotals` unit test):** replace with a
  `buildTeamShareTotals` unit test (see T5 below).
- **Test 7 (`computeMetricSummary`):** unchanged (no deps).
- `src/utils/outlookUsage.test.js`: **no change** — `buildUsageHistory`/`computeUsageTrend`
  signatures are unchanged; those tests already pass their own share map.

### New tests
- **T1 — buildTeamShareTotals: per-season-team keying + gp/team gates.**
  Fixture: season 2024 with players on teams `A`/`B` (record `.team`), one `gp:0` (excluded), one
  with `team: null`/absent (excluded from all denominators), plus `rec_tgt`/`rec`/`rush_att`/
  `rec_air_yd`. Expect denominators keyed by per-season team, summing only gp≥1 resolved-team
  records; the null-team record contributes to nothing; never NaN.
- **T2 — team-changer prior-season share uses prior-season team.**
  Fixture: RB `X` — 2024 `team:'A'` `rush_att:100`; 2025 `team:'B'` `rush_att:120`;
  `playerMap['X'].team = 'B'`. Add other RBs so `A`'s 2024 and `B`'s 2024/2025 denominators differ.
  Assert `buildPerSeasonTeamShares(...)['X']`: the **2024** entry's share = `100 / (A's 2024 rushAtt)`
  (A's denominator, which *includes* X's 100) — and verify it differs from what a current-team
  computation (`100 / B's 2024 rushAtt`) would give. The 2025 entry = `120 / (B's 2025 rushAtt)`
  (unchanged since 2025 team == current). This is the core fix.
- **T3 — NON-team-changer invariance (byte-identical).**
  Fixture: ≥2 seasons, ≥2 teams, **no team changes anywhere**, every player present in `playerMap`
  with `team === record.team` and a `position`. Compute:
  ```js
  const cur = computeHistoricalShares(cs, pm, computeHistoricalTeamTotals(cs, pm))     // teamContext.js
  const psn = buildPerSeasonTeamShares(cs, buildTeamShareTotals(cs), pm)               // new
  expect(psn).toEqual(cur)                                                             // byte-identical
  ```
  (Import the two `teamContext` fns into this test.) Avoid `LA/LAR` in the fixture to keep team
  strings aligned. This proves the math mirrors `computeHistoricalShares` exactly when teams don't
  change.
- **T4 — mid-season-trade single-team behavior (residual bounded).**
  Fixture: RB `Y` 2024 `team:'SF'` `rush_att:244` (single resolved team, full-season total); other
  RBs on SF. Assert Y's 2024 share = `244 / (SF 2024 rushAtt)` — the **whole** 244 attributed to SF
  (documents the residual: no split); finite, never NaN. Assert Y is absent from any other team's
  denominator.
- **T5 — per-season team absent → graceful omit.**
  Fixture: RB `Z` 2024 with `team` null/absent, `rush_att:100`, gp≥8. Assert
  `buildPerSeasonTeamShares(...)['Z']` has **no 2024 entry** (omitted), and `buildTeamShareTotals`
  attributes Z's stats to no team. No NaN, no 0-share row.
- **T6 — view-only import guard (extend existing).**
  In `src/__tests__/outlookPositionStatsViewOnly.test.js`: keep the existing `outlookPositionStats`
  assertion (auto-covers the two new functions) **and add** a parallel assertion that no PIPELINE
  module imports `outlookUsage` (same `PIPELINE` list, regex `/from\s+['"][^'"]*outlookUsage['"]/`).

**Done-definition reminder for Session 2:** `npm test` green, `npm run lint` 0 problems,
`npm run build` clean. No `factorsSchema`/`statKeysContract` impact (no projection/factors/stat-key
change). If Test 4 (old) or Test 5 (old) are hard to locate, they are at
`outlookPositionStats.test.js` "4. …" and "5. buildTeamReceivingTotals: …".

---

## 8. Cross-repo impact

**None.** This is entirely app-internal. `careerStats[season][id].team` is **already served** by
`sleeper-dashboard-data` at `nfl/season-totals/<year>.json` schema v3 (verified live, fully
populated 2012–present) and already consumed app-side (the NFL-stats game-log join). No served
shape, manifest field, sparsity floor, snapshot schema, or `MAX_SUPPORTED_SCHEMA` changes. No data-repo
coordination required.

---

## 9. Out of scope (do NOT do)

- Do **not** modify `computeHistoricalShares`, `computeHistoricalTeamTotals`, or `computeUsageTrend`
  in a way that changes projection inputs. `computeUsageTrend` needs **no** change (caller-fed map).
- Do **not** touch the projection/dynasty share-trend factor, dynasty share-trend boost,
  `computeRoleRanks`, RZ denominators, or their current-team/neutralization behavior.
- Do **not** migrate the shared Player Profile Role-History table / AdvancedStatsPanel (§3.5).
- Do **not** normalize the per-season team domain (`LA`) to the Sleeper domain (`LAR`) or vice-versa.
- Do **not** add per-week team splits for mid-season trades (§3.2 residual is accepted + documented).
- Do **not** move the two new maps into App.jsx / the pipeline / `ProfileDataContext`.
