# Market · Usage and Stats column rework — Looks/G, FP/TD/Scrim Yd shares, new box-score metrics

**Review depth: full** — the new `YBC/Att`, `Brk Tkl` and `Sacks` metrics read CR-19 keys (`rush_yac`,
`rush_btkl`, `pass_sack`; app site `marketWindowStats.js`'s `WINDOW_TOTAL_KEYS`), and the change edits the file
that holds CR-25's duplicated opportunity definition (`usage.oppPerG`), which must stay byte-identical. No
`App.jsx` change, no `factors`/projection/scoring change, no new state, no cross-repo contract change.
**`buildTeamShareTotals` (`outlookPositionStats.js`, CR-13's app site) is NOT touched** — see §1 item 1 and §2.

**Status: plan-reviewer (full) flags 1–5 folded in; Anton chose "keep retired players" for the share
denominators (2026-11-02).** Flag 1 → §6.2 rushYdPerG test; 2 → T4 fixture; 3 → §1.1/§2 (own builder, retired
players kept); 4 → T9 written and seen green on HEAD before §3.2; 5 → moot, `buildTeamShareTotals` untouched.
Re-review (full) flags 1–3 folded in: T5 rows gain volume keys; T12's WR gains `rush_td: 0, rush_yd: 0`; T3
gains a known-K fake-FG row so the `NON_OFFENCE` check is tested. **Plan approved by Anton 2026-11-02 — ready for Session 2 (sonnet).**

Session 1: opus, medium. Session 2: **sonnet**, medium. Visual change — Session 2 runs the app from
`.claude/launch.json` and smokes Usage and Stats on every pill; Anton judges the result.

Builds on `market-window-stats-a-data.md` (the tracked-key rule), `market-window-stats-b-fact-views.md`,
`market-efficiency-fact-view.md`, `market-model-view.md`. Live source wins over all of them.

---

## 0. What this is, for Anton

Market's **Usage** view gets a single volume measure that means the same thing for every position — **Looks/G**
(pass attempts + carries + targets per game) — plus three share-of-team columns: **FP Share**, **TD Share**,
**Scrim Yd Share**. **Stats** gets the box-score rates and counts a manager actually scans per position (Cmp%,
Sacks, Y/C, yards before contact, broken tackles, Catch%, Drop%, …), and WR and TE share one list.

The Model view's **Opp shift** keeps the in-season model's definition (carries + targets; QB pass attempts +
carries). Its tooltip now says it is not Looks/G, so the two numbers are never read as the same thing.

Cost/risk: all view-only; nothing reaches the projection or dynasty score. The one judgment call is TD Share for
QBs: it counts passing + rushing TDs against the team's rushing + receiving TDs, so a QB and his receivers
overlap — a QB's TD Share is comparable to other QBs (it is ranked within position), not to a WR's.

---

## 1. Decisions taken here (Session 2 does not revisit)

1. **The FP/TD/Scrim Yd team totals get their own builder, which keeps retired players** (Anton's choice over
   the brief's item 1). `buildTeamShareTotals` drops any id absent from `playerMap` (retired players), so older
   seasons' team totals lose those players and the shares read high — QB TD Share could exceed 100%
   (docs/ui.md:331–333 already records this bias as the reason not to extend that builder). The season-totals
   data also carries K, DEF and IDP rows (1,324 of 2,750 rows in `src/__fixtures__/season-totals-2025.json`),
   so the gate cannot be "every row". Stat-key sniffing does not separate them either: in the same fixture 207
   offensive rows carry `idp_*` keys and 422 carry `st_*`. The gate is therefore **offensive volume**:
   §2.1 below. With every receiver counted, Σ`rec_td` on a team equals its passing TDs, so a QB's TD Share is ≤ 1.
   Residual, accepted: a retired player in a 2012–2021 season is rescored with `position: null`, so under a
   first-down-bonus league his reconstructed `bonus_fd_*` points are missing from the FP denominator (small,
   pushes FP Share slightly high; `rescoreSeasonTotals`, `sleeperStats.js:340`). Not fixed here.
2. **`yac` → per attempt, reusing `yacoPerAtt`.** The RB Stats list already names `YACo/Att`; a `rush_yac` total
   would duplicate it and need its own twin. No `yac` metric is added.
3. **New totals get per-game twins.** `sacks` → `sacksPerG`, `btkl` → `btklPerG`, because the Stats per-game
   toggle swaps every total and `marketMetrics.test.js`'s twin test requires every non-adv total to have one.
4. **`oppPerG` leaves the registry.** `grep -rn oppPerG src` (outside `inSeason*`): the registry entry
   (`marketMetrics.js:87`) is read only by `factViews.js` and `factViews.test.js`. `usage.oppPerG` on the
   window-stats object stays (it is the CR-25 duplicate, item 3 of the brief) and its existing test stays.
5. **`rushYd` / `rushYdPerG` gain `TE`.** The shared WR/TE Stats list includes Rush Yd; `factCellValue` returns
   `null` for a position not in `metric.positions`, and `factViews.test.js` "every metric column under a
   single-position pill ranks that position" would fail.
6. **Definitions ride on header tooltips** (`FactTable`'s existing `tooltipFor` → `SortTh tooltip`), not a new
   caption line. Metric registry entries gain an optional `tooltip`; `factColumns` passes it through.
7. **`Scrim Yd Share` positions are RB/WR/TE** (the only pills that list it). `usage.scrimYdShare` is still
   computed for every row.
8. **`Sacks` / `Sacks/G` are `rank: false`.** `rankWindow` skips such metrics, so their cells carry no `#rank`.
   `better` stays `'high'` (the registry test requires `better: 'low'` only on rates; it is inert here).

---

## 2. Team totals for the new shares

`src/utils/outlookPositionStats.js` is **not edited** (`buildTeamShareTotals` and its three consumers stay as
they are; CR-13's `recAirYd` line is untouched).

### 2.1 Private builder in `src/utils/marketWindowStats.js`
Add `isTeamAggregateId` to the existing `./teamContext` import, and a module-level function (not exported):

```js
const NON_OFFENCE = new Set(['K', 'P', 'DEF'])

// Team denominators for fpShare/tdShare/scrimYdShare. Unlike buildTeamShareTotals this keeps ids absent from
// playerMap (retired players), so older seasons' shares are not biased high. A row counts when it played
// (gp >= 1), is not a TEAM_* aggregate, is not a known K/P/DEF, and had offensive volume — the season data
// also carries kicking, DEF and IDP rows whose points must not enter an offence's total.
function offenceTeamTotals(sources, pm) {
  const out = {}
  for (const [y, rows] of Object.entries(sources)) {
    const teams = {}
    for (const [pid, row] of Object.entries(rows)) {
      if ((row?.gamesPlayed ?? 0) < 1 || isTeamAggregateId(pid)) continue
      if (NON_OFFENCE.has(pm[pid]?.position)) continue
      const s = row.stats ?? {}
      if ((s.pass_att ?? 0) + (s.rush_att ?? 0) + (s.rec_tgt ?? 0) <= 0) continue
      const team = resolvePlayerTeam({ careerStats: sources }, pid, y)
      if (!team) continue
      const t = teams[team] ?? (teams[team] = { fp: 0, td: 0, scrimYd: 0 })
      t.fp += fpOf(row)
      t.td += (s.rush_td ?? 0) + (s.rec_td ?? 0)
      t.scrimYd += (s.rush_yd ?? 0) + (s.rec_yd ?? 0)
    }
    out[y] = teams
  }
  return out
}
```

Call it once next to the other two builders: `const offence = offenceTeamTotals(sources, pm)`.

Consequences Session 2 must not "fix": a known FB/OL/defender with a carry or target counts in the denominator
(so pool players' FP Shares on a team sum to < 1 when one exists — correct, they are the team's offence); a
retired kicker with a fake-punt carry counts too (rare, accepted). The pool (who gets a row) is unchanged —
still QB/RB/WR/TE in `playerMap`.

---

## 3. `src/utils/marketWindowStats.js`

### 3.1 FP helper
Add `const fpOf = row => (Number.isFinite(row.fantasyPoints) ? row.fantasyPoints : 0)` at module level and use
it in the existing `fp` reduce (`entries.reduce((a, e) => a + fpOf(e.row), 0)`) — same value.

### 3.2 `SHARES` generalised to multi-key numerators
Replace the tuple's second element (one key) with a key list, a position function, or `null` (row FP):

```js
  // [name, numerator stat keys (or a function of position; null = the row's fantasyPoints), team denominator].
  // A season counts only when every numerator key is tracked that season.
  const SHARES = [
    ['tgtShare', ['rec_tgt'], (y, t) => teamShare[y]?.[t]?.recTgt],
    ['carryShare', ['rush_att'], (y, t) => teamShare[y]?.[t]?.rushAtt],
    ['aySh', ['rec_air_yd'], (y, t) => teamShare[y]?.[t]?.recAirYd],
    ['rzTgtShare', ['rec_rz_tgt'], (y, t) => rz[y]?.[t]?.recRz],
    ['rzRushShare', ['rush_rz_att'], (y, t) => rz[y]?.[t]?.rushRz],
    ['fpShare', null, (y, t) => offence[y]?.[t]?.fp],
    ['tdShare', pos => (pos === 'QB' ? ['pass_td', 'rush_td'] : ['rush_td', 'rec_td']), (y, t) => offence[y]?.[t]?.td],
    ['scrimYdShare', ['rush_yd', 'rec_yd'], (y, t) => offence[y]?.[t]?.scrimYd],
  ]
```

Loop body: `const keys = typeof keysOf === 'function' ? keysOf(position) : keysOf`; per entry,
`if (keys && !keys.every(k => tracked[e.y].has(k))) continue`; the numerator adds
`keys ? keys.reduce((a, k) => a + (e.s[k] ?? 0), 0) : fpOf(e.row)`. Team resolution, `d > 0` check,
`basisGp[name] = g` and `usage[name] = g > 0 ? num / den : null` are unchanged. For the five existing entries
this is the same computation (a one-key list), so their values and `basisGp` must not move (test T9).
**Order: write T9 and run it green on the unmodified HEAD before making this edit**, then keep it green.

### 3.3 `looksPerG`
**Do not edit** the `// CR-25's opportunity definition (duplicated; …)` comment, the `opp` expression, or
`usage.oppPerG = opp / gp`. Directly below `usage.oppPerG = opp / gp`, add:

```js
    // Looks: pass attempts + carries + targets for every position — Market's own volume measure, deliberately
    // not CR-25's opportunity definition above (the Model view's Opp shift keeps that one).
    usage.looksPerG = ((totals.pass_att ?? 0) + (totals.rush_att ?? 0) + (totals.rec_tgt ?? 0)) / gp
```

### 3.4 `ybcPerAtt` rate
In `rates`, after `yacoPerAtt`:
`ybcPerAtt: ratio('ybcPerAtt', ['rush_yd', 'rush_yac', 'rush_att'], a => a.sums.rush_yd - a.sums.rush_yac, a => a.sums.rush_att),`
`aligned` already drops a season unless all three keys are tracked (Slice A's rule) — so a season where
`rush_yac` is untracked contributes neither its yards nor its carries, and a window with no tracked season reads
`null`.

`WINDOW_TOTAL_KEYS` is **unchanged** (every key used is already in it; `rush_yac`/`rush_btkl`/`pass_sack` are
CR-19's keys, read, not added).

---

## 4. `src/utils/marketMetrics.js`

Add (positions, format, `basis` exactly as listed):

| id | helper | label | positions | value | format | extra |
|---|---|---|---|---|---|---|
| `passAttPerG` | perGame | `Pass Att/G` | QB | `perG(tot('pass_att'))` | dec1 | |
| `passCmpPerG` | perGame | `Cmp/G` | QB | `perG(tot('pass_cmp'))` | dec1 | |
| `sacks` | total | `Sacks` | QB | `tot('pass_sack')` | int | `rank: false` |
| `sacksPerG` | perGame | `Sacks/G` | QB | `perG(tot('pass_sack'))` | dec1 | `rank: false` |
| `ybcPerAtt` | rate | `YBC/Att` | RB | `rt('ybcPerAtt')` | dec2 | `'high'`, `RUSH`, basis `ybcPerAtt` |
| `btkl` | total | `Brk Tkl` | RB | `tot('rush_btkl')` | int | |
| `btklPerG` | perGame | `Brk Tkl/G` | RB | `perG(tot('rush_btkl'))` | dec1 | |
| `looksPerG` | perGame | `Looks/G` | ALL | `us('looksPerG')` | dec1 | tooltip T-L |
| `fpShare` | rate | `FP Share` | ALL | `us('fpShare')` | pct1 | `'high'`, `null`, basis `fpShare`; tooltip T-F |
| `tdShare` | rate | `TD Share` | ALL | `us('tdShare')` | pct1 | `'high'`, `null`, basis `tdShare`; tooltip T-T |
| `scrimYdShare` | rate | `Scrim Yd Share` | RB, WR, TE | `us('scrimYdShare')` | pct1 | `'high'`, `null`, basis `scrimYdShare` |

Extras are spread onto the helper's result, e.g. `{ ...total('sacks', 'Sacks', ['QB'], tot('pass_sack'), int), rank: false }`.

Tooltips (verbatim):
- **T-L** `pass attempts + carries + targets per game`
- **T-F** `Share of the fantasy points scored by the team's offence (every player with a pass, carry or target), per season and team in the window.`
- **T-T** `Share of the team's rushing + receiving TDs, per season and team. A QB counts his passing + rushing TDs, so QB shares overlap his receivers'.`

Other changes:
- **Remove** `perGame('oppPerG', 'Opp/G', ALL, us('oppPerG'), dec1)`.
- `rushYd` and `rushYdPerG` positions → `['QB', 'RB', 'WR', 'TE']`.
- `PER_GAME_TWIN` gains `sacks: 'sacksPerG', btkl: 'btklPerG'`.
- `rankWindow`: first line inside `for (const m of metrics)` → `if (m.rank === false) continue` (the `out`
  pre-fill already leaves those ids `null`).
- Placement: keep the registry's grouping (passing / rushing / receiving / scrimmage / usage); position in the
  array does not affect behaviour.

---

## 5. `src/components/market/factViews.js`

### 5.1 `factColumns` — metric tooltip
Metric branch becomes `return { ...c, metric, label: metric.label, tooltip: metric.tooltip, align: 'right' }`.
(`metric.tooltip` is `undefined` for metrics without one — `FactTable.tooltipFor` then falls through as today.)

### 5.2 Columns
```js
const STATS_REC = ['tgt', 'rec', 'catchPct', 'dropRate', 'recYd', 'ypr', 'aDOT', 'recTd', 'rushYd', 'firstDowns', 'fp']
const USAGE_REC = ['snapPct', 'looksPerG', 'tgtPerG', 'tgtShare', 'aySh', 'rzTgtShare', 'fpShare', 'tdShare', 'scrimYdShare']

stats: {
  QB: ['passYd', 'passTd', 'cmpPct', 'sacks', 'sackRate', 'rushAtt', 'rushYd', 'rushTd', 'fp'].map(m),
  RB: ['rushAtt', 'rushYd', 'ypc', 'rushTd', 'ybcPerAtt', 'yacoPerAtt', 'btkl', 'tgt', 'rec', 'recYd', 'ypt',
       'recTd', 'scrimYd', 'firstDowns', 'fp'].map(m),
  WR: STATS_REC.map(m),          // WR and TE share one list (one array, two references)
  TE: <same array as WR>,
  ALL: unchanged,
},
usage: {
  QB: [G, GS, ...['looksPerG', 'passAttPerG', 'passCmpPerG', 'carryShare', 'rzRushShare', 'fpShare', 'tdShare'].map(m)],
  RB: [G, GS, ...['snapPct', 'looksPerG', 'carryShare', 'tgtShare', 'rzRushShare', 'rzTgtShare', 'fpShare', 'tdShare', 'scrimYdShare'].map(m)],
  WR: <one array from USAGE_REC, led by G, GS>,
  TE: <same array as WR>,
  ALL: [G, GS, ...['snapPct', 'looksPerG', 'fpShare'].map(m)],
},
efficiency.ALL: [G, ...['fpPerG', 'looksPerG', 'scrimYdPerG'].map(m)],
```
Build WR/TE as a single const each (`const STATS_REC_COLS = STATS_REC.map(m)`, `const USAGE_REC_COLS = [G, GS, ...USAGE_REC.map(m)]`)
so "identical" is structural, matching the existing `EFFICIENCY_REC` pattern.

Labels resolve from the registry: `rzRushShare` → `RZ Car Share`, `snapPct` → `Snap%` — do not rename either.
Per-game toggle: only `view === 'stats'` swaps, via `PER_GAME_TWIN`; rates/shares have no twin and stay.

### 5.3 Default sort
`FACT_DEFAULT_SORT.usage` → `{ column: 'looksPerG', direction: 'desc' }`. A stored `market-sort` of `oppPerG`
falls back through the existing `factSortableKeys` validity path — no migration code.

### 5.4 Model view — Opp shift tooltip
Keep the current string and append one sentence, so it reads:
`"Carries + targets per game (QB: pass attempts + carries): this season's evidence-weighted rate versus the baseline, as a percentage of it. Volume settles about twice as fast as points, so this moves first when a role changes. This is the in-season model's opportunity definition — not the fact views' Looks/G, which adds pass attempts and targets for every position."`
No other Model column changes.

**Not touched:** `Market.jsx`, `FactTable.jsx`, `src/utils/inSeasonEvidence.js`, `src/utils/inSeasonConstants.js`,
the pop-up's In-season Opp/G line, `Market.jsx`'s `Opp/G` hover text (that is CR-25's number), any CR-25 text.

---

## 6. Tests

Each new test is shown failing with its defect temporarily reintroduced, then reverted (done-definition 1).

### 6.1 New
| # | File | Asserts | Fails if |
|---|---|---|---|
| T1 | `marketWindowStats.test.js` | single season: an RB `{ pass_att: 2, rush_att: 100, rec_tgt: 30 }`, gp 10 → `looksPerG` 13.2; a QB `{ pass_att: 300, rush_att: 40, rec_tgt: 1 }`, gp 10 → 34.1 | `looksPerG` uses CR-25's position-split formula (RB 13.0, QB 34.0) |
| T2 | `marketWindowStats.test.js` | for QB/RB/WR/TE rows carrying all three keys, single-season `usage.oppPerG` equals `opportunitiesPerGame(row, pos)` imported from `./inSeasonEvidence`, and differs from `looksPerG` where the third key is non-zero | the CR-25 duplicate in `marketWindowStats.js` was edited (e.g. switched to Looks) |
| T3 | `marketWindowStats.test.js` | two players on KC, both with a target, fantasyPoints 60 and 140 → `fpShare` 0.3 and 0.7, sum 1; adding a `K` row and a `DEF` row on KC (fantasyPoints 100 each, positions in `playerMap`, no offensive volume) leaves both unchanged; adding a `playerMap` `K` row `{ rush_att: 1 }` (a fake-FG carry) with fantasyPoints 150 also leaves both unchanged | the offence gate lets kicking/DEF points in — the last case fails only if the `NON_OFFENCE` check is removed — or numerator and denominator read different FP fields |
| T4 | `marketWindowStats.test.js` | KC: QB `{ pass_att: 500, pass_td: 30, rush_att: 40, rush_td: 5 }`, WR `{ rec_tgt: 120, rec_td: 30, pass_td: 1 }`, RB `{ rush_att: 200, rush_td: 5 }` → team td 40; QB `tdShare` 35/40, WR 30/40, RB 5/40 | QB numerator omits `pass_td` (QB 5/40), or the non-QB numerator includes `pass_td` (WR 31/40) |
| T5 | `marketWindowStats.test.js` | `scrimYdShare`: RB `{ rush_att: 150, rush_yd: 600, rec_tgt: 30, rec_yd: 200 }`, WR `{ rec_tgt: 120, rec_yd: 1200 }` → 0.4 / 0.6 (each row needs a volume key, or §2.1's gate drops it) | numerator or denominator drops one of the two yard keys |
| T6 | `marketWindowStats.test.js` | 2014 `rb { rush_att: 100, rush_yd: 400 }` (no skill row carries `rush_yac`), 2015 `rb { rush_att: 200, rush_yd: 1000, rush_yac: 600 }` → window [2015, 2014] `ybcPerAtt` 2.0, `basisGp.ybcPerAtt` = 2015 games; window [2014] → `null` | YBC sums `rush_yd`/`rush_att` across an untracked season (would give 800/300), or a fully untracked window returns a number |
| T7 | `marketMetrics.test.js` | `rankWindow` over a 2-QB pool: `sacks` and `sacksPerG` are `null` for both; `sackRate` is ranked | `rank: false` is ignored |
| T8 | `factViews.test.js` | `factColumns('stats', 'WR', o)` and `('stats', 'TE', o)` give identical id and metric-id lists, in both stats modes | the WR and TE Stats lists diverge |
| T9 | `marketWindowStats.test.js` | a two-season fixture with a team change and one untracked `rec_rz_tgt` season pins `tgtShare`, `carryShare`, `aySh`, `rzTgtShare`, `rzRushShare` and their `basisGp` to hand-computed numbers (write them in the test, worked in a comment). **Written and seen green on the unmodified HEAD before §3.2 is applied** — the hand-back states that it was; this replaces the reintroduce-the-defect step for T9 | the `SHARES` generalisation moved an existing share value or its basis games |
| T10 | `factViews.test.js` | across `FACT_VIEWS` × QB/RB/WR/TE/ALL × both stats modes, no column label matches `/\bOpp\b/` | any fact view still shows an Opp column |
| T11 | `factViews.test.js` | the Usage/Efficiency `looksPerG`, `fpShare`, `tdShare` columns carry T-L/T-F/T-T as `tooltip`; the Model `oppShift` tooltip contains `Looks/G` | `factColumns` drops `metric.tooltip`, or the Opp shift disambiguation is lost |
| T12 | `marketWindowStats.test.js` | KC 2018: a WR in `playerMap` `{ rec_tgt: 100, rec_td: 6, rec_yd: 800, rush_td: 0, rush_yd: 0 }` (fantasyPoints 150; the explicit zeros make `rush_td`/`rush_yd` tracked — `tracked[y]` is built from pool rows only, so without them `tdShare`/`scrimYdShare` would read `null`) and a teammate **absent from `playerMap`** `{ rec_tgt: 50, rec_td: 4, rec_yd: 400 }` (fantasyPoints 50) → WR `fpShare` 0.75, `tdShare` 0.6, `scrimYdShare` 800/1200; the absent id gets no window-stats entry; a further absent row with fantasyPoints 100 and no pass/carry/target leaves all three unchanged | the denominator drops ids absent from `playerMap` (WR would read 1.0), or the offensive-volume gate is missing |

T1–T6 and T9 use the file's existing `run()` (frozen inputs) and `row()` helpers.

### 6.2 Existing tests to update (behaviour changed on purpose — assert the new outcome)
- `marketMetrics.test.js` "rushYdPerG ranks WR like rushYd" (`:145-147`): its
  `expect(METRIC_BY_ID.rushYdPerG.positions).toEqual(['QB', 'RB', 'WR'])` → `['QB', 'RB', 'WR', 'TE']`; the
  WR-ranking assertions stay.
- `outlookPositionStats.test.js`: no change (the file is not edited).
- `marketMetrics.test.js` "basis pairs": add `ybcPerAtt`, `fpShare`, `tdShare`, `scrimYdShare` to `expected`.
  "shape": add `if ('rank' in m) expect(m.rank).toBe(false)`.
- `factViews.test.js` "factSortableKeys …": `oppPerG` → `looksPerG`.
- `Market.factViews.test.jsx` test 12: `'Opp/G ↓'` → `'Looks/G ↓'`; test 2 (ALL pill): `'Opp/G'` → `'Looks/G'`.
- Any other test pinning the old Stats/Usage per-pill lists: update to §5.2's lists.
- **Keep unchanged:** `marketWindowStats.test.js` "oppPerG by position, games-weighted" (it guards CR-25's
  duplicate) and every `inSeasonEvidence*` test.

---

## 7. Docs (same change)

- `docs/ui.md` → *Fact views* bullet: one sentence each for Usage per pill and Stats per pill (§5.2 lists; WR and
  TE share both); Looks/G = pass attempts + carries + targets for every position; FP/TD/Scrim Yd Share are
  per-(season, team) shares of the team's offence — every row with a pass, carry or target, retired players
  included and known K/P/DEF excluded (deliberately not `buildTeamShareTotals`, whose `playerMap` gate drops
  retired ids — cross-reference the existing note at the `§usage` red-zone paragraph); QB TD Share counts passing
  + rushing TDs; `Sacks` carries no rank. → *Efficiency* bullet: ALL pill `Opp/G` → `Looks/G`; "Removed …: the per-header metric tooltips"
  becomes "…, and the per-header metric tooltips other than the Looks/G, FP Share and TD Share definitions".
  → *Model* bullet: `OPP SHIFT` keeps the in-season opportunity definition and its tooltip says it is not Looks/G.
- `docs/nav/utils.md`: `outlookPositionStats.js` row — no change. `marketWindowStats.js` row — `usage.looksPerG`,
  `fpShare`/`tdShare`/`scrimYdShare` over its own offence team totals (retired players kept, offensive-volume
  gate), `rates.ybcPerAtt`; `usage.oppPerG` remains CR-25's duplicated definition. `marketMetrics.js` row — optional
  `tooltip`; `rank: false` metrics (`sacks`, `sacksPerG`) are skipped by `rankWindow`.
- `docs/nav/components.md`: `market/Market.jsx` row — Efficiency ALL pill `FP/G`/`Looks/G`/`Scrim Yd/G`.
  `market/factViews.js` row — metric columns carry the metric's `tooltip`.
- `docs/signal-registry.md`: row 56 (CR-19 keys) consumers — add the Stats view's `Sacks`, `YBC/Att` (`rush_yac`
  with `rush_yd`/`rush_att`) and `Brk Tkl`. Rows 53–55 — add Market's Usage view (`Looks/G`, `TD Share`,
  `Scrim Yd Share`, `Pass Att/G`, `Cmp/G`) as a view-only consumer.
- No change to `docs/cross-repo-registry.md` (CR-19's app site and key list are unchanged; CR-25 untouched).
- Wording follows the capability-not-availability rule (`docsAvailabilityClaims.test.js`).

---

## 8. Done-definition notes

- Full `npm test`, `npm run lint` (0), `npm run build` (clean). `statKeysContract.test.js` and
  `marketWindowStatsViewOnly.test.js` must pass unchanged.
- Smoke: Usage and Stats on QB/RB/WR/TE/ALL, Totals and Per game, a completed-season window and Career; check
  no `NaN`, Sacks has no `#rank`, the Looks/G/FP Share/TD Share header tooltips show, TE Rush Yd reads a number.
- No PROVISIONAL tags expected (every value is real data); paste the `grep -rn "PROVISIONAL(" src/` count.
- No data-repo backlog entry expected.
- Hand-back per `../CLAUDE.md` → Session 2.

## Out of scope
Medians and games-played shares (D2), trimming Efficiency, route data, any change to CR-25, `inSeasonEvidence.js`,
`inSeasonConstants.js` or the in-season model, Stats ALL pill, the pop-up.

---

## Verification — implementation-reviewer (full) on `776dd15..c9382f3`

Three flags, all test coverage; no source defect. CR-25 block byte-identical, untouched files untouched, SHARES
math unchanged for the five existing shares, `offenceTeamTotals` matches §2.1, docs and CR-19 clean.
1. [fidelity] T2 loops QB/RB/WR only — TE never checked against `opportunitiesPerGame`.
2. [fidelity] T11 matches T-F by prefix and T-T by fragment, not the verbatim strings.
3. [untested] `passAttPerG`, `passCmpPerG`, `sacks`, `sacksPerG`, `btkl`, `btklPerG` values untested (a misspelt
   `tot()` key would read `—` everywhere, suite green); QB/RB/ALL Usage and QB/RB Stats lists not pinned.

Triage: all three accepted as a test-only fix pass.

## Fix pass 1

Test files only. **No source file changes.** Each changed/new assertion is shown failing with its defect
reintroduced in source, then reverted.

1. `src/utils/marketWindowStats.test.js` T2 (`it('T2: usage.oppPerG still equals CR-25 …')`): add a TE. In that
   test only, use `const map = { ...pm, te: { position: 'TE' } }`, add `te: row(stats)` to the 2025 rows, pass
   `playerMap: map`, and add `['te', 'TE']` to the loop. Do not edit the shared `pm`. Mutation: make the
   duplicate's non-QB branch read `position === 'TE' ? 0 : …` → red.
2. `src/components/market/factViews.test.js` T11: replace the two `toMatch` lines with `toBe` on the full §4
   strings T-F and T-T, copied verbatim from §4. Mutation: truncate T-T's last sentence in `marketMetrics.js` → red.
3. `src/utils/marketMetrics.test.js` `describe('per-game twins')`: add one `it` —
   `'the Usage/Stats additions read their window keys'`: `ws = { gp: 10, totals: { pass_att: 300, pass_cmp: 200,
   pass_sack: 20, rush_btkl: 30 } }` → `passAttPerG` 30, `passCmpPerG` 20, `sacks` 20, `sacksPerG` 2, `btkl` 30,
   `btklPerG` 3; and each is `null` when its key is `null`. Mutation: misspell `pass_sack` in the `sacks` entry →
   red.
4. `src/components/market/factViews.test.js`: add one `it` —
   `'Usage and Stats per-pill column ids match the plan'`: `factColumns(view, pos).map(c => c.id)` toEqual the
   §5.2 lists for usage QB/RB/ALL and stats QB/RB (with `gp`, `gs` leading where §5.2 has `G, GS`). Mutation:
   drop `tdShare` from usage QB → red.

Leave alone: every other test, every source file, docs.

### Fix pass 1 — outcome
Applied by fix-applier as `87e2be9` (test files only; each item seen red under its named mutation, then
reverted; 3370 tests green, lint 0, build clean). implementation-reviewer (light) on `c9382f3..87e2be9`: no flags.
Verification clean. Signed off by Anton 2026-11-02; pushed.
