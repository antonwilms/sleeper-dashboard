# Slice 5b — Market: the Efficiency column set and the environment filters

**Program:** [dp-v2.md](dp-v2.md). Follows
[dp-v2-5a-market-structure.md](dp-v2-5a-market-structure.md) (landed `cd90c22`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `cd90c22` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

Completes Slice 5, and with it the four-set Market the design specifies:

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
| Labels, formats, field expressions, notes | `usageEfficiency.METRIC_META` |

**Genuinely new:** a season aggregator over gamelogs for EPA/CPOE/RACR, and the carry-share
cross-family join (§3.2).

---

## 1. Confirmed against live source (`cd90c22`)

| Fact | Site |
|---|---|
| `COLUMN_SETS` is now `value`/`outlook`/`volume`; `SORTABLE_KEYS` is a per-set map; `_trend` is in all three | `Market.jsx:46-59` |
| Market's props after 5a: `playerRows, loaded, careerStats, playerMap, seasonProjections, myTeamName, onOpenPlayerDetail, ktcHistory` — **props-only, no context** | `Market.jsx:235-238` + 5a |
| Market already computes `perSeasonTeamShares` / `teamShareTotals` | `Market.jsx:302-307` |
| Sort has three branches; the **volume branch returns early** on `a._avg?.[key]` | `Market.jsx:495-512` |
| `colSpan` is set per set in three places (now `12`, `7 + …`, `3 + cols.length`) | `Market.jsx:537,606,671` |
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

That takes Market's prop list to twelve. Growing explicit lists is the accepted cost of the
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

**Default sort is air-yards share** for WR/TE (the design's lead metric); for QB and RB lead on
`EPA/ATT` and `CARRY SH` respectively. Register every column in `EFFICIENCY_SORTABLE_KEYS`, and note
the volume-branch lesson from 5a: **a key alone does not sort a nested value** — anything not a plain
row scalar needs a comparator branch.

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

**The join crosses an era boundary**: gamelogs `games[].team` is current-franchise, teamcontext is
era-accurate. Resolve through `playerTeam.resolvePlayerTeam`, which already remaps; do not add a
second remap. For `dataSeason` the domains coincide, so a current-season test proves nothing about the
join — but Market only ever shows one season, so **state that limitation rather than testing a
historical case here** (4a already covers the era join in its own tests).

### 3.3 `RACR` comes from `advStats`, and that lights a dark family
`advStats` serves `racr` precomputed, `sleeper_id`-keyed, for exactly the one season Market shows.
Use it rather than recomputing `Σ receivingYards ÷ Σ receivingAirYards` from gamelogs — a second
derivation of a served value is the duplication this program keeps avoiding.

This makes Market the **first renderer of `advStats`**, whose registry cell still reads "rendered
nowhere". That is a deliberate win — advstats is one of the six dark families this program exists to
surface — and it is why CR-18 fires (§8). Keep the existing **display-only** guard intact:
`advStatsViewOnly.test.js` must stay green, and nothing here may reach projection or scoring.

---

## 4. The four environment filters

`Team PROE` · `Team pace` · `Team off. EPA/play` · `Team RZ TD rate` — marked `NEW` in the panel.

**Reuse `environment.js` wholesale.** `SERIES_METRICS` is already exactly these four ids, and
`computeTeamSeasonMetrics` + `computeLeagueStanding` already produce the value and the rank per team.

### 4.1 Semantics: "top N of 32", with `any` as the sentinel
Each filter is a rank threshold, not a range — the design shows `top 10 of 32`, `any`. So:

```js
envProeTop: 32,   // 32 = 'any' = inactive
envPaceTop: 32,
envEpaTop: 32,
envRzTdTop: 32,
```

**32 is the sentinel**, matching `marketFilters`' existing convention that a range filters only when
it differs from its default. A player passes when his team's rank for that metric is `<= N`.

**Pace is lower-is-better** and `computeLeagueStanding` already accounts for it — do not re-invert.
Re-inverting a rank that is already correct is the most likely defect here, and it is invisible
without checking a known-fast team.

### 4.2 Wiring
- Add the four keys to `DEFAULT_MARKET_FILTERS`, the predicates in `applyMarketFilters`, **and to both
  `normalizeFilters` and `isRestorableFilters`** — they share per-key validators, and a key added to
  one but not the other silently breaks either the live restore or saved presets.
- Each counts toward `activeFilterCount` and renders a pill.
- The player→team join is `resolvePlayerTeam` at season grain. **A player with no resolved team passes
  at rest and is dropped only once the control moves** — the same graceful-null rule the existing
  range filters follow.
- A season with no `teamContextByYear` entry means no team has a rank: the filters should then be
  inert rather than emptying the table. State what you did.

---

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
- **Filters** — `32` is inert; `10` keeps only top-10 teams; pace ranks fast teams as 1; a player with
  no resolved team survives at rest and drops when the control moves; the four keys round-trip through
  `normalizeFilters` **and** `isRestorableFilters` (save a preset, reload, apply).
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
- set `Team PROE` to top 10 and confirm the survivors are all on pass-heavy offences; set `Team pace`
  to top 10 and confirm they are **fast** teams, not slow ones;
- save a preset with an environment filter, reload, re-apply it;
- the TREND gutter still persists under the new set, and sorts;
- no console errors.

---

## 7. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `market/Market.jsx` row | The fourth set, its per-position columns, the four new props, the four filters |
| `docs/ui.md` → *Market* | Same, plus the CPOE weighting rule and the `any`=32 sentinel |
| `CLAUDE.md` `src/utils/` table | The new season-efficiency helper |
| **`docs/signal-registry.md:53`** | **advstats' Current-use changes from "rendered nowhere" to rendered.** Also check `:57`/`:58` — gamelogs and teamcontext gain Market as a second consumer |
| `.claude/tasks/data-repo-backlog.md` | Only if this slice surfaces a new ask (done-definition step 7) |

---

## 8. Cross-repo impact

**CR-18 fires — settled in planning, not left open.** `docs/signal-registry.md:53` currently reads
that advstats is "**rendered nowhere**"; this slice makes Market its first renderer. `:57` (gamelogs)
and `:58` (teamcontext) already read "view-only, rendered" from Slices 4a/4c and gain a second
consumer.

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — Mirror:**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a *new*
> one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side
> against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
> removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
> make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
> family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
> when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
> snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later.
> The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Direction is **app→data-nothing**.

**Check CR-09 (gamelogs) and CR-10 (teamcontext) app-side trigger lists** and add Market's new call
sites — both were found stale in earlier slices, and this adds consumers to each.

---

## 9. Done-definition

- [ ] Four props threaded explicitly; Market still props-only
- [ ] Efficiency columns **per position**; no column of dashes on any pill
- [ ] Gamelogs aggregated **once**, memoised on the loader result — not per row
- [ ] **CPOE attempt-weighted**, asserted against the arithmetic mean
- [ ] Every rate from summed components; zero denominator → `—`; REG-only
- [ ] `CARRY SH` joins through `resolvePlayerTeam`; no second era remap
- [ ] `RACR` from `advStats`; `advStatsViewOnly.test.js` green
- [ ] Four filters in `DEFAULT_MARKET_FILTERS`, `applyMarketFilters`, **`normalizeFilters` AND
      `isRestorableFilters`**; `32` inert
- [ ] Pace rank not re-inverted
- [ ] New set's `colSpan` correct; `_trend` gutter still present and sortable
- [ ] `environment.js` / `usageEfficiency.js` / `outlookPositionStats.js` / `outlookUsage.js` zero diff
- [ ] `docs/signal-registry.md:53` updated; CR-09/CR-10 trigger lists checked
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked per §6

---

## 10. Hand-back should report

- One QB's CPOE, and the same player's unweighted mean, showing the weighting matters.
- Which teams survived a `top 10` pace filter, proving the direction.
- Confirmation that `advStats` renders for WR/TE and the view-only guard is green.
- The four zero diffs.
- The CR-09/CR-10 trigger-list outcome.
- Anything in §1 that had drifted from `cd90c22`.
