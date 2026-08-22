# Slice 5b — Market: the EFFICIENCY column set

**Program:** [dp-v2.md](dp-v2.md). Follows
[dp-v2-5a-market-structure.md](dp-v2-5a-market-structure.md) (landed `cd90c22`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `cd90c22` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

**Split from the environment filters after review (§11).** The first draft carried both on the
grounds that they "share one plumbing change" — they do not: Efficiency needs `gameLogsByYear` +
`advStats` + `historicalTeamTotals` and a per-position column system; the filters need
`teamContextByYear`, a **memoised league rank table**, a widened `applyMarketFilters` signature, and
changes to two filter components. The review drew twenty flags across the two, which is the signal.
Filters move to **5c**; §10 records what that slice must not rediscover.

Delivers the fourth set of the design's Market:

```
MODEL & MARKET          ON FIELD
[ VALUE ][ OUTLOOK ]    [ VOLUME ][ EFFICIENCY ]
```

---

## 0. Most of this is already built — reuse, do not re-derive

Slices 4b and 4c built the derivations this slice needs. **The failure mode of every draft in this
program has been specifying new work over helpers that already exist**; check here first.

| Need | Existing source |
|---|---|
| The four team metrics (PROE, pace, success rate, RZ TD rate) | `utils/environment.js` → `computeTeamSeasonMetrics(games)`, `SERIES_METRICS` |
| League rank for a team metric | `environment.js` → `computeLeagueStanding(loaded, metricId, team)` |
| Target/air-yards share, aDOT, cmp%, passer rating, sacks, rush share, RB target share, Y/C | `outlookPositionStats.buildPositionStatSeries` — take the **latest** entry |
| Red-zone share (unbiased denominator) | `usageEfficiency.buildRzShareSeries(careerStats, playerId, position, historicalTeamTotals)` |
| Snap share | `outlookUsage.buildUsageHistory` → `snapPct` |
| Labels, formats, field expressions, notes | `usageEfficiency.METRIC_META` — **but only 7 of ~19 columns**; the rest need new entries (§3.4) |

**Genuinely new, and more than the first draft implied:** a season aggregator over gamelogs for
EPA/CPOE, the carry-share cross-family join, metadata for a dozen columns, a position-aware default
sort, and an explicit `efficiency` branch in two memos that currently **fall through** to volume.

---

## 1. Confirmed against live source (`cd90c22`)

| Fact | Site |
|---|---|
| `COLUMN_SETS` is now `value`/`outlook`/`volume`; `SORTABLE_KEYS` is a per-set map; `_trend` is in all three | `Market.jsx:46-59` |
| Market's props after 5a are those eight — **props-only, no context** | `Market.jsx:267-270` |
| **The sort memo's third branch is an UNGUARDED fall-through** (`// volume`, no `columnSet === 'volume'` test), as is `enrichedRows`' ternary. A fourth set without an explicit branch **silently sorts through `a._avg?.[key]` and renders `volumeRows`** | `Market.jsx:473,504-509` |
| `DEFAULT_SORT` is keyed by **set only**; `usePlayersTable` takes one `defaultSort`; the fallback effect fires on `!SORTABLE_KEYS[columnSet].has(column)` | `Market.jsx:38-44,277,289-294` |
| **`advStats` state is `{ byId, year, complete, rowCount }`**, initial `null` — RACR is `advStats?.byId?.[id]?.racr`, and consumers **branch on `complete`** | `api/advStats.js:40`; `App.jsx:151` |
| **`buildPositionStatSeries` and `buildPerSeasonTeamShares` gate at `gamesPlayed >= 8`** (`QUALIFYING_GP`; the denominator loop hard-codes `< 8`) | `outlookPositionStats.js:79,199` |
| `advStatsViewOnly.test.js` scans a hard-coded `src/utils/` `PIPELINE` list — **Market rendering RACR keeps it green** | `__tests__/advStatsViewOnly.test.js` |
| Market already computes `perSeasonTeamShares` / `teamShareTotals` | `Market.jsx:367-373` |
| Sort has three branches; the **volume branch returns early** on `a._avg?.[key]` | `Market.jsx:495-512` |
| `colSpan` is set per set in three places (now `12`, `7 + …`, `3 + cols.length`) | `Market.jsx:537,606,671` |
| **§1's anchors in the first draft were ~65 lines stale** — re-verify before trusting any line number here |  |
| `DEFAULT_MARKET_FILTERS` has twelve keys; `normalizeFilters` **and** `isRestorableFilters` share per-key validators | `utils/marketFilters.js:33-46` |
| Season-totals stat keys confirmed present in the fixture: `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`, `rec_drop`, `off_snp`, `tm_off_snp` | `src/__fixtures__/season-totals-2025.json` |
| `advStats` is App.jsx state, loaded for **one season** (`dataSeason`) — and `docs/signal-registry.md:53` still reads "**rendered nowhere**" | `App.jsx:871`; registry `:53` |
| `historicalTeamTotals` is an App.jsx memo, already on `ProfileDataContext` since 4c | `App.jsx:196`; `ProfileDataContext.jsx` |

---

## 2. Scope

### 2.1 Four new props
Market stays **props-only** — do not switch it to `ProfileDataContext` (CLAUDE.md's two data-access
patterns). Add four explicit props:

`gameLogsByYear` · `teamContextByYear` · `historicalTeamTotals` · `advStats`

`teamContextByYear` is needed **only for carry share's denominator** (§3.2) — the environment filters
that were its other consumer are now 5c. That takes Market's prop list to twelve. Growing explicit lists is the accepted cost of the
props-only pattern; **do not** collapse it to a spread or a context read.

### 2.2 Must NOT do
- **No new loader, no new season.** Everything is already in `App.jsx` state at `dataSeason`.
- **Do not modify `environment.js`, `usageEfficiency.js`, `outlookPositionStats.js` or
  `outlookUsage.js`** beyond additive exports. Call them.
- **Do not build a five-season anything.** Market is one season per row.

---

## 3. The EFFICIENCY column set — per position

The design draws one receiver-shaped block; round 5 already corrected that to per-position. Sources
below deliberately prefer **season-totals** (already in `careerStats`) over gamelogs wherever both
could serve — fewer aggregations, and the numbers then agree with the Volume set beside them.

| Position | Column | Source |
|---|---|---|
| **QB** | `EPA/ATT` | gamelogs: `Σ passingEpa ÷ Σ attempts` (§3.1) |
| | `CPOE` | gamelogs: **attempt-weighted** mean of `passingCpoe` (§3.1) |
| | `SACK%` | season-totals: `pass_sack ÷ (pass_att + pass_sack)` |
| | `AY/ATT` | season-totals: `pass_air_yd ÷ pass_att` |
| | `RUSH EPA` | gamelogs: `Σ rushingEpa` |
| **RB** | `CARRY SH` | gamelogs × teamcontext join (§3.2) |
| | `TGT SH` | `buildPositionStatSeries` → `rbTargetShare`, latest |
| | `RUSH EPA/ATT` | gamelogs: `Σ rushingEpa ÷ Σ carries` |
| | `YAC` | season-totals: `rush_yac` |
| | `BTKL` | season-totals: `rush_btkl` |
| **WR / TE** | `TGT SH` · `AY SH` · `aDOT` | `buildPositionStatSeries`, latest |
| | `EPA/TGT` | gamelogs: `Σ receivingEpa ÷ Σ targets` |
| | `RACR` | **`advStats`** — the purpose-built source (§3.3) |
| | `RZ SH` | `buildRzShareSeries`, latest |
| | `SNAP%` | `buildUsageHistory` → `snapPct`, latest |
| | `DROPS` | season-totals: `rec_drop` |

### 3.0a The season is `dataSeason`, and the control stays hidden
Gamelogs and advstats are loaded for **`dataSeason` only**, so every Efficiency column pins to it —
including the season-totals ones, so all columns in the set share one season and are internally
consistent.

**The first draft claimed the numbers would "agree with the Volume set beside them". They will not**,
and that is worth stating rather than papering over: Volume has a user-selectable season
(`market-production-season`) and Efficiency does not. Keep the season `<select>` **hidden** for
Efficiency, as it is for Value and Outlook, and note in the header that the set is fixed to the most
recent season with data.

### 3.0b The `gp >= 8` gate makes half the share columns empty mid-season
`buildPositionStatSeries` gates at `QUALIFYING_GP` (8), and `buildPerSeasonTeamShares` hard-codes
`< 8` when building the **denominator**. So through roughly the first half of every season, `TGT SH`,
`AY SH`, `aDOT`, `RZ SH` and `SNAP%` are empty for everyone — not because the data is missing, but
because the gate exists for *trend* purposes and Market is asking a single-season question.

**Do not remove or fork the gate** (§2.2, and the denominator is shared with the projection's
attribution). Instead:
- Render `—` when a share has no value, exactly as any other missing value.
- Say so in the set's header or a definition popover — *shares stabilise once a player reaches eight
  games* — so an empty column mid-season reads as a stated limitation rather than a broken table.
- **State this in the hand-back.** It is the most likely "is this broken?" question a real user will
  ask of this set, and it is seasonal, so a smoke run in August will not surface it.

### 3.0c Two memos currently fall through to volume — add an explicit branch
`Market.jsx:473` (`enrichedRows`) and `:504-509` (the sort memo) both treat volume as the **unguarded
else**. Adding a fourth set without an explicit `efficiency` branch **placed before** them silently
renders `volumeRows` and sorts through `a._avg?.[key]` — no error, plausible-looking output. Add both
branches explicitly.

### 3.0d Default sort is per position, and there is no mechanism for that yet
`DEFAULT_SORT` is keyed by **set only**, `usePlayersTable` is constructed with a single `defaultSort`,
and the stale-column fallback fires on `!SORTABLE_KEYS[columnSet].has(column)` — so a union
`EFFICIENCY_SORTABLE_KEYS` passes that check for every pill and switching QB→WR would keep a column
the new pill has no header for.

Make the Efficiency default sort a function of `(set, posFilter)` and **re-assert it on pill change**
via the `setSortState` escape hatch Slice iii added for exactly this. Lead metrics: WR/TE air-yards
share, QB `EPA/ATT`, RB `CARRY SH`.

**And the 5a lesson applies:** a key alone does not sort a nested value — anything not a plain row
scalar needs a comparator branch, in the Efficiency branch specifically.

### 3.4 Metadata for a dozen new columns
`METRIC_META` covers **7** of the ~19 Efficiency columns. `EPA/ATT`, `CPOE`, `SACK%`, `AY/ATT`,
`RUSH EPA`, `CARRY SH`, `RUSH EPA/ATT`, `YAC`, `BTKL`, `EPA/TGT`, `RACR` and `DROPS` have no entry.

**Extend `METRIC_META` additively** — that is one place for metric metadata and adding keys is exactly
the additive change §2.2 permits. Do not start a second parallel map in the Market module; two
metadata sources for one concept is the duplication this program keeps refusing.

### 3.1 The gamelogs season aggregator — one pass, one memo
New pure helper (e.g. `utils/seasonEfficiency.js`). Aggregate **once** over
`gameLogsByYear[dataSeason].players`, producing a `{ [playerId]: { …metrics } }` map, and memoise on
the loader result. ~600 players × ~17 games recomputed on every sort or filter change is the obvious
trap, and 5a's TREND gutter set the precedent for memoising this class of work.

**Sum components, then divide. Never average a per-game rate.** This is CR-10's rule and it applies
here even though the family is gamelogs rather than teamcontext:
- `EPA/ATT` = `Σ passingEpa ÷ Σ attempts` — **not** the mean of per-game EPA/att.
- **`CPOE` is the trap.** It is a per-game *rate*, so a plain mean over-weights low-attempt games.
  Weight by attempts: `Σ (passingCpoe × attempts) ÷ Σ attempts`. A player with one 3-attempt game at
  +40% CPOE must not read as elite.
- A zero denominator renders `—`, never `0`.
- **REG only**, consistent with 4a's game log and 4c's Environment (`g.seasonType === 'REG'`).

### 3.2 `CARRY SH` is the only cross-family join
`Σ gamelogs.carries ÷ Σ teamcontext.off.rushPlays`, matched on `(team, week)`.

Two things make it worth the extra work rather than reusing `rushShare` from
`buildPositionStatSeries`: `teamcontext.off.rushPlays` **includes QB scrambles and sneaks**, which the
skill-cohort denominator excludes — `advstats-grading-findings.md` §4.8 flags that exclusion as
inflating RB rushing shares — and it is the design's own specified expression.

**Filter to `seasonType === 'REG'` before resolving the team.** `resolvePlayerTeam`'s week grain is
`games.find(g => g.week === week)` — **seasonType-blind** — while teamcontext weeks run continuously
REG→POST, so an unfiltered `find` can match a POST row for a REG week.

**The join crosses an era boundary**: gamelogs `games[].team` is current-franchise, teamcontext is
era-accurate. Resolve through `playerTeam.resolvePlayerTeam`, which already remaps; do not add a
second remap. For `dataSeason` the domains coincide, so a current-season test proves nothing about the
join — but Market only ever shows one season, so **state that limitation rather than testing a
historical case here** (4a already covers the era join in its own tests).

### 3.3 `RACR` comes from `advStats`, and that lights a dark family
`advStats` serves `racr` precomputed for exactly the one season Market shows. **Its shape is
`{ byId, year, complete, rowCount }` with `byId` keyed by `sleeper_id`** — so the read is
`advStats?.byId?.[id]?.racr`, and like every other loader result it is **gated on `complete`**, not on
key presence. Initial state is `null`.
Use it rather than recomputing `Σ receivingYards ÷ Σ receivingAirYards` from gamelogs — a second
derivation of a served value is the duplication this program keeps avoiding.

This makes Market the **first renderer of `advStats`**, whose registry cell still reads "rendered
nowhere". That is a deliberate win — advstats is one of the six dark families this program exists to
surface — and it is why CR-18 fires (§8). Keep the existing **display-only** guard intact:
`advStatsViewOnly.test.js` must stay green, and nothing here may reach projection or scoring.

---

## 4. The environment filters are 5c — and here is what that slice must not rediscover

Deferred after review. Recorded so 5c starts from these rather than finding them again:

- **`SERIES_METRICS` is NOT the filter set.** It is `['proe','pace','successRate','rzTdRate']`
  (`environment.js:73`) — the design's filters are PROE, pace, **off. EPA/play**, RZ TD rate. So
  `epaPerPlay` is missing from it and `successRate` is extra. The first draft claimed they matched.
- **`computeLeagueStanding` is O(all teams × all games) per call** — it re-runs
  `computeTeamSeasonMetrics` for all 32 teams to return one rank (`environment.js:96`). Called per row
  per metric inside a filter predicate that is ~600 rows × 4 metrics on every keystroke. **5c needs a
  memoised rank table**, computed once per season, not a "reuse wholesale" instruction.
- **`applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections })` has no ctx path**
  for `teamContextByYear`, the season, or `careerStats` — all three are needed for the rank join. The
  signature has to widen, and the plan must say who computes the table.
- **Adding required keys to `isRestorableFilters` silently invalidates every existing saved preset.**
  `FilterBar.loadPresets` drops any payload where a key fails validation, and pre-5c presets carry no
  environment keys. A test that saves a *new* preset and reloads it passes while every stored preset
  vanishes. 5c needs either a defaulting path for absent keys or an explicit accepted-loss decision.
- **`32 = any` inverts the control direction.** No existing filter's off-state is its *maximum*
  (`minProjectedGames` off = 0; ranges off = full span). The sentinel *gating* convention still fits,
  but the panel control needs a lower bound of **1** — `0` would mean "no team passes".
- **Two components render filters and were missing from the first draft's file list:**
  `FilterBar.buildPills` is a hand-written per-key `if` chain, and `FilterPanel` is a hand-written
  group grid.

## 5. Tests

- **Per-position columns** — QB renders `EPA/ATT`/`CPOE`/`SACK%`, never `TGT SH`; WR never renders
  `CPOE`.
- **CPOE weighting** — a fixture with one high-CPOE low-attempt game and one low-CPOE high-attempt
  game produces the attempt-weighted answer, not the arithmetic mean. **Assert the difference**; this
  is the calculation most likely to be silently wrong.
- **Rates from components** — `EPA/ATT` over two games equals `Σepa ÷ Σatt`, not the mean of ratios.
- **Zero denominators** → `—`, never `0`.
- **REG-only** — a POST row does not contribute.
- **Sort works for every Efficiency column**, including nested ones (5a's volume-branch lesson).
- **The `efficiency` branch is reached** — an Efficiency render does not fall through to `volumeRows`,
  and an Efficiency sort does not go through `a._avg` (§3.0c). Assert both; the failure is silent.
- **Position-aware default sort** — switching QB→WR re-asserts the WR lead metric rather than keeping
  a column WR has no header for (§3.0d).
- **`advStats` gating** — `complete: false` and `byId: null` both render `—`, not a crash.
- **`advStatsViewOnly.test.js` stays green** — rendering must not create a projection path.
- **`colSpan`** for the new set matches its column count.
- Existing Market tests pass unedited except the set-count assertions, which are required updates.

---

## 6. Smoke

Per `CLAUDE.md` → Workflow convention:
- switch to `EFFICIENCY` under each position pill — three genuinely different column sets, no column
  of dashes;
- a QB's `CPOE` is plausible (roughly −5 to +8 for real starters; a `+40` means the weighting is wrong);
- `RACR` populates for WR/TE (advstats' first render) and is `—` for QB;
- switching the position pill while Efficiency is active re-sorts to that position's lead metric;
- the share columns (`TGT SH`/`AY SH`/`aDOT`/`RZ SH`/`SNAP%`) are populated **for the current
  offseason data**; note that mid-season they will be empty until players reach eight games (§3.0b),
  which a smoke run now cannot surface;
- the TREND gutter still persists under the new set, and sorts;
- no console errors.

---

## 7. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `market/Market.jsx` row | The fourth set, its per-position columns, the four new props, the four filters |
| `docs/ui.md` → *Market* | Same, plus the CPOE weighting rule and the `any`=32 sentinel |
| `CLAUDE.md` `src/utils/` table | The new season-efficiency helper |
| **`docs/signal-registry.md:53`** | **advstats' Current-use changes from "rendered nowhere" to rendered.** Also `:57`/`:58` — gamelogs and teamcontext gain Market as a second consumer |
| **`CLAUDE.md` → Invariants, "Advstats are display-only"** | It reads "**Currently has no UI consumer at all**". False after this slice. Keep the invariant; correct the status |
| **`CLAUDE.md` `src/api/advStats.js` row** | Same — "View-only … never feeds" stays true, "no UI consumer" does not |
| **`src/__tests__/advStatsViewOnly.test.js` header comment** | Says "advStats currently has no UI consumer at all". The test itself stays green and unchanged; only the comment is stale |
| `.claude/tasks/data-repo-backlog.md` | Only if this slice surfaces a new ask (done-definition step 7) |

---

## 8. Cross-repo impact — five entries fire, and one gap routes out of the loop

The first draft emitted only CR-18. Review found four more, and one genuinely uncovered coupling.

| Entry | Why it fires |
|---|---|
| **CR-07** advstats | Market becomes its **first renderer**; the entry's app side literally reads "No UI consumer as of 1b Slice viii" |
| **CR-09** gamelogs | First app-side readers of `passingEpa` / `passingCpoe` / `rushingEpa` / `receivingEpa` / `attempts` / `carries` / `targets` |
| **CR-10** teamcontext | First app-side reader **anywhere** of `off.rushPlays` — it is not even in `environment.js`'s `OFF_SUM_FIELDS` |
| **CR-11** snap & RZ keys | Market's new `buildRzShareSeries` call site |
| **CR-18** signal registry | Three Current-use cells change (§7) |

**Emit each entry's `Mirror` text in the hand-back** — naming a contract in prose is not the
deliverable. The texts are in `docs/cross-repo-registry.md`; do not paraphrase them.

**Correction carried from review:** the first draft wrote "Direction is app→data-nothing" for CR-18.
**CR-18's own `Direction` field is `data→app`.** Read each entry's Direction rather than assuming; this
program has now written that wrong more than once.

### 8.1 `[registry-gap]` — routes to the Claude.ai project, not fixed here
`rush_yac`, `rush_btkl`, `rec_drop` and `pass_air_yd` have **zero** app-side readers today, appear in
**no** `docs/signal-registry.md` row, and are covered by **no** `CR-NN` entry. CR-02 governs
schemaVersion and row composition, not key preservation — which is precisely why CR-11/CR-12/CR-13
exist as per-key entries over the same `aggregateWeeks` path.

This slice makes all four load-bearing for a visible surface with nothing recording the coupling.
Per CLAUDE.md that is the one residual case that leaves the in-repo loop: it needs a **draft registry
entry** authored in the Claude.ai project, which can hold both repos at once, then landed in both
registries. **Do not draft it in this session and do not block on it** — record it in the hand-back
and in `data-repo-backlog.md`, and ship the slice; the keys are read-only and the risk is future
silent breakage, not present incorrectness.

### 8.2 `[registry-stale]` — report, do not fix
Five trigger-list gaps found in review, all pre-existing: CR-07 omits `src/App.jsx` entirely; CR-09
omits `dp/GameLogSection.jsx` and `utils/gameLog.js` (live since 4a); CR-11 omits `Market.jsx:379`'s
`buildUsageHistory` call; CR-13 omits `dp/UsageEfficiencySection.jsx:32` and `Market.jsx:433`; and
**every `App.jsx` anchor in CR-07/08/09/10 has drifted** (`loadAdvStats` 857→878, `loadTeamContext`
887→899, `loadNflGameLogs` 900→915, `loadNflSchedule` 915→930, context keys 578-580→581-583).
Fixing the anchors is cheap and this slice already edits the file; do that much and report the rest.

## 9. Done-definition

- [ ] Four props threaded explicitly; Market still props-only
- [ ] Efficiency columns **per position**; no column of dashes on any pill
- [ ] Gamelogs aggregated **once**, memoised on the loader result — not per row
- [ ] **CPOE attempt-weighted**, asserted against the arithmetic mean
- [ ] Every rate from summed components; zero denominator → `—`; REG-only
- [ ] `CARRY SH` joins through `resolvePlayerTeam`; no second era remap
- [ ] `RACR` from `advStats`; `advStatsViewOnly.test.js` green
- [ ] **Explicit `efficiency` branch in BOTH memos**, placed before the volume fall-through
- [ ] Default sort resolved per `(set, posFilter)` and re-asserted on pill change
- [ ] `advStats` read as `byId` and gated on `complete`
- [ ] `METRIC_META` extended additively for the ~12 new columns — no second metadata map
- [ ] Season pinned to `dataSeason`; the season `<select>` stays hidden for Efficiency
- [ ] `gp >= 8` limitation stated in the UI and the hand-back, not worked around
- [ ] New set's `colSpan` correct; `_trend` gutter still present and sortable
- [ ] `environment.js` / `usageEfficiency.js` / `outlookPositionStats.js` / `outlookUsage.js` zero diff
- [ ] `docs/signal-registry.md:53` updated, plus the three advstats status sites in §7
- [ ] **Five `Mirror` texts** quoted in the hand-back (CR-07/09/10/11/18), verbatim
- [ ] `[registry-gap]` recorded in `data-repo-backlog.md` and the hand-back — **not** drafted here
- [ ] The drifted `App.jsx` anchors in CR-07/08/09/10 corrected
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked per §6

---

## 10. Hand-back should report

- One QB's CPOE, and the same player's unweighted mean, showing the weighting matters.
- Confirmation that Efficiency does not fall through to volume in either memo.
- Confirmation that `advStats` renders for WR/TE and the view-only guard is green.
- The four zero diffs.
- The CR-09/CR-10 trigger-list outcome.
- Anything in §1 that had drifted from `cd90c22`.

---

## 11. Plan-review record (2026-08-21)

**Twenty flags — the most any slice in this program has drawn, on a slice the draft described as
"mostly reuse". That framing was the error**, and the count is what prompted the split: the Efficiency
set and the environment filters do **not** share a plumbing change, and each had a slice's worth of
problems.

**Filters moved to 5c** with six specific findings recorded (§4) so that slice starts from them:
`SERIES_METRICS` is not the filter set; `computeLeagueStanding` is O(all teams × all games) *per call*
and would run ~600 × 4 times per keystroke; `applyMarketFilters`' signature has no path for the data
the join needs; adding required keys to `isRestorableFilters` **silently invalidates every saved
preset**; `32 = any` inverts the control direction and needs a lower bound of 1; and two filter
components were missing from the file list entirely.

**Three findings would have shipped a broken or misleading Efficiency set:**
- Both `enrichedRows` and the sort memo treat volume as an **unguarded else**, so a fourth set without
  an explicit branch renders volume's rows and sorts through `a._avg` — no error, plausible output.
- The `gp >= 8` gate on the share machinery means `TGT SH`/`AY SH`/`aDOT`/`RZ SH`/`SNAP%` are **empty
  for everyone through the first half of every season**. Seasonal, silent, and invisible to an
  offseason smoke. Now stated in the UI rather than worked around.
- Per-position default sorts had **no mechanism** — `DEFAULT_SORT` is keyed by set only, and a union
  `SORTABLE_KEYS` makes the stale-column check pass for every pill.

**Two shape errors:** `advStats` is `{ byId, complete, … }`, not a flat map, and must be gated on
`complete`; and `resolvePlayerTeam`'s week grain is **seasonType-blind**, so the carry-share join needs
a REG filter before resolving or a POST row can win the `find`.

**`METRIC_META` covers 7 of ~19 columns**, not all of them — the draft's reuse claim overstated it.

**Cross-repo was wrong in three ways.** The draft emitted only CR-18; **five** entries fire
(CR-07/09/10/11/18). It wrote "Direction: app→data-nothing" when **CR-18's own Direction field is
`data→app`**. And there is a genuine **`[registry-gap]`**: `rush_yac`, `rush_btkl`, `rec_drop` and
`pass_air_yd` have no reader, no registry row and no CR entry, and this slice makes all four
load-bearing for a visible surface — the one case CLAUDE.md routes to the Claude.ai project.

Five pre-existing `[registry-stale]` trigger-list gaps were also reported; the drifted `App.jsx`
anchors are cheap enough to fix here.

