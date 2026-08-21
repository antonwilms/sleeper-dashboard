# Slice 4b — Pop-up: Usage & efficiency + Availability & role

**Program:** [dp-v2.md](dp-v2.md). Follows
[dp-v2-4a-gamelog-distribution.md](dp-v2-4a-gamelog-distribution.md) (landed `855aded`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `855aded` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

---

## 0. The remainder of Slice 4 splits again, by data dependency

4a took the seam dp-v2 §4 pre-registered. The three sections left do not share one either, so they
split on **what data they need**, which is the seam that has worked twice:

| | Sections | New data required |
|---|---|---|
| **4b — this file** | Usage & efficiency, Availability & role | **None.** Everything derives from `careerStats` and values `usePlayerProfile` already computes |
| **4c — next** | Environment | **A multi-season `teamContext` load.** Slice 2 loaded `dataSeason` only; the design's Environment plots five seasons |

Grouping this way keeps 4b free of any `App.jsx` change. 4c is then a small, focused slice whose
loader extension is exactly what Slice 6's Teams detail needs at 14 seasons — designed once, in the
first slice that needs it.

---

## 1. Confirmed against live source (`855aded`)

| Fact | Site |
|---|---|
| `POSITION_STAT_METRICS` — **QB** `cmpPct, passerRating, sacks` · **RB** `rushShare, rbTargetShare, yardsPerCarry` · **WR/TE** `targetShare, airYardsShare, aDOT` | `utils/outlookPositionStats.js:9-14` |
| `buildPositionStatSeries(playerId, position, careerStats, { perSeasonTeamShares, teamShareTotals })` → `{ [metricId]: [{season, value}] }` — **already a multi-season series**, view-only | `outlookPositionStats.js:176` |
| `buildTeamShareTotals(careerStats, playerMap)` → `{ [season]: { [team]: { rushAtt, rec, recTgt, recAirYd } } }` — **no red-zone denominator** | `outlookPositionStats.js:36` |
| `computeHistoricalTeamTotals` **does** aggregate RZ: `{ rushAtt, rec, recTgt, rushRz, recRz }` | `utils/teamContext.js:249-255` |
| `buildUsageHistory(playerId, position, careerStats, historicalShares)` → per-season snap%/share history | `utils/outlookUsage.js:42` |
| `usePlayerProfile` already computes and returns `shareHistory` (last 5), `usageShare`, `roleRank`, `depthChart` — **all dark, no renderer since 1b Slice viii** | `hooks/usePlayerProfile.js:141-184`; `docs/ui.md` |
| `usePlayerProfile` is callable from `PlayerDetailModal.jsx` — the never-use rule is `PlayerDetailTabs.jsx`'s only | `PlayerDetailModal.jsx:54` |
| Slice 1 primitives: `SeriesBars` (`scaled`/`signed`, `domain`), `CoveragePips`, `DegradedBlock`, `DefinitionPopover`, `coverageBand` | `src/components/dp/`, `utils/coverageBand.js` |
| `weeklyStatus` is 18 slots indexed `week-1`, `'P'`/`'B'`/`'D'`/`'X'` | `api/sleeperStats.js:191,200,209,212` |
| **The served data never emits `'B'`** — verified across all 2,832 players in `nfl/season-totals/2025.json`: `P`/`X`/`D` only, every `byeWeeks` is `0`. Real byes land as `'X'` | data repo `f0c1fc4`; recorded in `855aded` |
| **No app loader for Sleeper players-state** — the family is capture-only in the data repo | `grep -rn playersState src` → nothing |
| `gameLogsByYear` holds **`dataSeason` only** | `App.jsx:899-917` |

---

## 2. Scope

Two sections appended to `SECTIONS` **and to the JSX**, between `distribution` and `drivers`:

```js
{ id: 'usage',        label: 'Usage & efficiency' },
{ id: 'availability', label: 'Availability & role' },
```

**Both lists must be edited and must agree** — `SECTIONS` drives the index and the scroll-spy's
`[...SECTIONS].reverse().find(...)`; the rendered order is the literal JSX order. Slice 4a
established this; do not rediscover it.

### 2.1 Must NOT do
- **No `App.jsx` change and no new loader.** If a metric appears to need one, it belongs to 4c — say
  so rather than wiring it.
- **Do not build the weekly status strip** (§4.2).
- **Do not modify `outlookPositionStats.js` or `outlookUsage.js` beyond additive exports.** They are
  view-only and already guarded; extending them is fine, rewriting them is not.
- **Nothing here may reach projection or scoring.** Every value is display-only, and the section
  carries a `DISPLAY ONLY` badge saying so.

---

## 3. Usage & efficiency

Per-metric rows: label → `SeriesBars` over the per-season values → latest value → signed delta vs the
first season shown → coverage pips + span → a one-line note → the field expression in a
`DefinitionPopover`.

### 3.1 The metric set is per position, and only partly pre-built
The design draws six metrics for a **WR**, because its mock player is one. Three of those already
exist in `POSITION_STAT_METRICS.WR`; three do not exist for any position. And the QB/RB metric sets
are different again.

**Build from `POSITION_STAT_METRICS` as the base**, then extend per position. The base set is already
correct, already per-season-team attributed, and already view-only:

| Position | From `buildPositionStatSeries` (existing) | To add (§3.2) |
|---|---|---|
| QB | `cmpPct`, `passerRating`, `sacks` | snap share |
| RB | `rushShare`, `rbTargetShare`, `yardsPerCarry` | snap share, RZ carry share |
| WR / TE | `targetShare`, `airYardsShare`, `aDOT` | snap share, RZ target share |

**`EPA per opportunity` is NOT in this slice.** The design lists `REC EPA / TARGET` for receivers, but
its only source is gamelogs, and `gameLogsByYear` holds `dataSeason` only — so it would be a
single point, not a series, in a section built entirely of series. Omit it, per the program's
omit-rather-than-approximate directive, and record it as 4c-or-later alongside the multi-season load.

### 3.2 The two additions, and where their denominators come from
- **Snap share** — `off_snp ÷ tm_off_snp` from `careerStats[season][pid].stats`, per season.
  **Hard coverage cliff at 2020**: `off_snp` does not exist before then (`tm_off_snp` does, which is
  the trap — the denominator predates the numerator by eight seasons, so a naive computation yields a
  confident-looking wrong number for 2012–2019). Seasons before 2020 are **void slots**, and the row
  carries a `NOT MEASURED THEN` note. Do not render `0`.
- **Red-zone share** — `rec_rz_tgt` (WR/TE) or `rush_rz_att` (RB) over the team's RZ total.
  **`buildTeamShareTotals` does not carry an RZ denominator** — it returns `{rushAtt, rec, recTgt,
  recAirYd}`. The RZ totals live in `computeHistoricalTeamTotals` (`{…, rushRz, recRz}`,
  `teamContext.js:249-255`). Either extend `buildTeamShareTotals` additively with `rushRz`/`recRz`
  (preferred — it keeps the view-only share machinery in one module, and it already sums
  `rec_air_yd` by the same pattern) or read the other helper. **Do not average per-game shares**;
  compute share as player-total ÷ team-total per season, the way every other share here does.

### 3.3 Attribution: use the view-only per-season-team series, not `historicalShares`
`historicalShares` is the projection's series. The display side uses
`outlookPositionStats.buildPerSeasonTeamShares`, which is per-season-team attributed via
`playerTeam.resolvePlayerTeam` and deliberately diverges from the projection's denominators (it gates
on `playerMap` membership, dropping retired ids). CLAUDE.md records this as intentional. **Follow the
existing precedent** — `buildPositionStatSeries` already takes exactly these deps.

### 3.4 Rendering rules
- **`SeriesBars` in `scaled` mode with an explicit `domain`**, and state the floor on the card — the
  Slice 1 contract. A share series compressed into a min–max window is unreadable without it.
- **Recompute every rate from components.** Never read a stored rate key: `pass_rtg` and `cmp_pct` in
  season-totals are **weekly sums and never season-valid** — the data repo documents this as a
  rate-trap. `passerRating` in `POSITION_STAT_METRICS` already recomputes; anything new must too.
- Coverage per metric from its own count of seasons with a real value — snap share will legitimately
  band lower than target share for the same player, and that is the point.
- **`DISPLAY ONLY` badge on the section**, citing the guards. None of this moves a projection or a
  score, and the badge is what makes that visible rather than merely true.

---

## 4. Availability & role

Three blocks in the design. Two are buildable; one is not.

### 4.1 Games-played grid — buildable, with a stated limitation
Five seasons × 18 weeks from `careerStats[season][pid].weeklyStatus`, indexed `week - 1`.

**`'B'` never appears in the served data** (§1). Real byes arrive as `'X'`. So the grid has three
observable states, not four:

| Code | Render |
|---|---|
| `'P'` | played |
| `'D'` | did not play |
| `'X'` | **no game recorded** — includes real byes |

**Label the `'X'` state honestly** — "no game recorded" — and carry a one-line note that byes
currently fall into it, because the served season-totals do not resolve them. **Do not** invent a bye
by cross-referencing the schedule: the season-grain team is a single dominant team per season
(CR-02's `aggregateWeeks` rule), so a traded player would be given phantom byes for his old team's
weeks. This is a data-repo generation gap, recorded in `855aded`, and the honest display is the one
that does not guess.

The legend must not show a bye colour that never appears.

### 4.2 Weekly status strip — **not built**
The design sources it from Sleeper players-state snapshots. **The app has no loader for that family**
— it is capture-only in the data repo, and wiring it is Slice-2-shaped work with its own season/keying
decisions.

**Omit the element entirely. Do not render a `DegradedBlock` in its place.** The degraded kinds
describe states of *data*; this is a state of *implementation*, and dressing an unwired capability as
`NOT YET — ACCRUING` would tell the reader something false about the data. Per the program's
omit-rather-than-approximate directive, leave it out and let its absence invite the request.

Record in the hand-back that wiring players-state remains unowned.

### 4.3 Depth chart — buildable today, currently dark
`usePlayerProfile` already returns `depthChart` from `buildTeamDepthChart` — grouped by position,
sorted by `depth_chart_order` then current PPG, with `{player_id, full_name, age, depthOrder,
dynastyLabel, dynastyScore, dynastyConf, ktcValue, currentSeasonPPG}` per entry. It has had **no
renderer since 1b Slice viii**. Render the subject's own position group, marking the subject's row.

`roleRank` and `usageShare` are dark in the same way and belong to this section if they fit the
design's role block; if they do not, leave them dark rather than inventing a home.

---

## 5. Tests

- **Metric sets are per position** — a QB renders `cmpPct`/`passerRating`/`sacks`, never `targetShare`.
- **Snap-share cliff** — a pre-2020 season renders a **void slot**, not `0`, and the row carries the
  `NOT MEASURED THEN` note. Assert void ≠ zero explicitly; this is the same distinction Slice 1 exists
  to preserve.
- **RZ share** — computed as player-total ÷ team-total for the season, not an average of per-game
  shares; a zero team denominator renders `—`.
- **No stored rate keys** — assert `passerRating` and any new rate are recomputed, not read from
  `pass_rtg` / `cmp_pct`.
- **Availability grid** — `'X'` renders as *no game recorded*, distinctly from `'D'`; the legend has
  no bye entry.
- **Depth chart** — the subject's row is marked; a player whose team has no depth data renders a
  degraded block rather than an empty list.
- **`DISPLAY ONLY` badge** present on the usage section.
- Existing modal/tabs tests must pass **unedited**; the jsdom stubs are already in place from Slice 3.

---

## 6. Smoke

Per `CLAUDE.md` → Workflow convention. Check:
- a **QB**, an **RB** and a **WR** — each gets its own metric set, none a row of dashes;
- a player with **pre-2020 seasons** — those bars are void slots, not zeros, and the note says why;
- the **games-played grid** on a player who missed time, and confirm `'D'` and `'X'` are visually
  distinct and the legend claims no bye state;
- the **depth chart** shows the subject's own position group with the subject marked;
- the index now lists **seven** entries and still scrolls rather than swaps;
- no console errors.

---

## 7. Docs

| File | Edit |
|---|---|
| `docs/ui.md` → *Player detail pop-up* | The two sections, the per-position metric sets, the snap-share cliff, the `'X'`-includes-byes limitation, and that the weekly status strip is deliberately absent |
| `CLAUDE.md` `src/components/` table | `PlayerDetailModal.jsx` row — seven sections |
| `CLAUDE.md` `src/utils/` table | Any additive change to `outlookPositionStats.js` (e.g. RZ denominators in `buildTeamShareTotals`) |
| `docs/ui.md` → *Team depth chart* | It currently says `depthChart` "has **no renderer**". This slice gives it one |
| `docs/signal-registry.md` | **Check**: does any Current-use cell change? The season-totals family is already `active→projectedPPG … + view-only display`, so probably not — but snap/RZ keys may have their own rows. If a cell changes, **CR-18 fires** and the `Mirror` text is a Session-1 deliverable |

---

## 8. Cross-repo impact

**Expected none**, but §7's `signal-registry.md` check is genuinely open and must be resolved **in
planning, not at implementation time** — CLAUDE.md makes the `Mirror` text a Session-1 output. Slice
4a's determination (CR-18 fires for gamelogs/schedule/team) does not carry over; this slice touches
neither family.

---

## 9. Done-definition

- [ ] Both `SECTIONS` and the JSX order updated and agreeing; index shows seven entries
- [ ] Metric sets per position, built on `POSITION_STAT_METRICS` rather than a parallel list
- [ ] Snap share void-slots pre-2020; never `0`
- [ ] RZ share uses a real team RZ denominator; no per-game share averaging
- [ ] No stored rate key read anywhere (`pass_rtg`, `cmp_pct` are weekly sums)
- [ ] `EPA per opportunity` **not** built (§3.1)
- [ ] Weekly status strip **not** built, and no `DegradedBlock` stands in for it (§4.2)
- [ ] Grid's `'X'` labelled honestly; legend claims no bye state
- [ ] `DISPLAY ONLY` badge on the usage section
- [ ] **No `App.jsx` diff** — verify with `git diff --stat`
- [ ] Existing tests pass unedited
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect the standing three
- [ ] Smoked per §6

---

## 10. Hand-back should report

- Which positions you checked and what each metric set showed.
- Whether you extended `buildTeamShareTotals` or read `computeHistoricalTeamTotals` for RZ, and why.
- The `signal-registry.md` / CR-18 determination.
- Confirmation that `App.jsx` has a zero diff.
- That players-state wiring remains unowned (§4.2).
- Anything in §1 that had drifted from `855aded`.
