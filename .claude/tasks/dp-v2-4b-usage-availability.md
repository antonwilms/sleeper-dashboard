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
| `usePlayerProfile` returns `shareHistory` (last 5), `usageShare`, `roleRank`, and **`teamDepthChart`** — all dark, no renderer since 1b Slice viii | `hooks/usePlayerProfile.js:155,233`; `docs/ui.md:196-198` |
| **The key is `teamDepthChart`, NOT `depthChart`.** `docs/ui.md:196-197` records this correction explicitly ("that name appears nowhere in the hook; corrected 2026-08-17") | `usePlayerProfile.js:155` |
| **`buildUsageHistory` already returns per-season `snapPct`** = `off_snp ÷ tm_off_snp`, and `Market.jsx:313` already calls it with `perSeasonTeamShares` | `outlookUsage.js:20-28,42` |
| **`SNAP_POSITIONS = {RB, WR, TE}` — QB is deliberately gated out** of snap share; `usageMetrics.js:22-24` documents why (near-constant ~0.95, p10 0.81 — it would wrongly penalise injury-fill starters) | `outlookUsage.js:7` |
| **`buildPositionStatSeries` OMITS non-qualifying seasons** (`continue` on `gp < QUALIFYING_GP` or non-finite) — the array is `[{season, value}]` with gaps **absent**, not null-filled | `outlookPositionStats.js:186-214` |
| `SeriesBars({ values })` takes a **flat array** and reads non-finite entries as void slots | `dp/SeriesBars.jsx:18` |
| `usePlayerProfile` is callable from `PlayerDetailModal.jsx` — the never-use rule is `PlayerDetailTabs.jsx`'s only | `PlayerDetailModal.jsx:54` |
| Slice 1 primitives: `SeriesBars` (`scaled`/`signed`, `domain`), `CoveragePips`, `DegradedBlock`, `DefinitionPopover`, `coverageBand` | `src/components/dp/`, `utils/coverageBand.js` |
| `weeklyStatus` is 18 slots indexed `week-1`, `'P'`/`'B'`/`'D'`/`'X'` | `api/sleeperStats.js:191,200,209,212` |
| **The SERVED data never emits `'B'`** — verified across all 2,832 players in `nfl/season-totals/2025.json`: `P`/`X`/`D` only, every `byeWeeks` is `0`. Real byes land as `'X'` | data repo `f0c1fc4`; recorded in `855aded` |
| **But `'B'` IS reachable.** The store is only step (2) of `loadCareerHistory`; with `VITE_DATA_STORE_URL` unset the app runs in **API-only mode** — a documented supported mode — and the live path at `sleeperStats.js:209` writes `'B'`. The grid needs a `'B'` rule | `api/sleeperStats.js:145-158,209`; `CLAUDE.md:26` |
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
- **Do not modify `outlookPositionStats.js` or `outlookUsage.js` at all.** After the §3 rewrite this
  slice only *calls* them. (The RZ extension that would have touched `buildTeamShareTotals` is cut —
  §3.2.)
- **Accepted cost, stated rather than left implicit:** with no `App.jsx` change, the pop-up recomputes
  `buildTeamShareTotals` / `buildPerSeasonTeamShares` over the whole `careerStats` corpus, which
  `Market.jsx:302-307` already does independently. Two view components then own the same whole-corpus
  derivation. That is the price of keeping this slice loader-free; if it shows up as a load-time
  problem, hoisting it to `App.jsx` is 4c's business, not this slice's.
- **Nothing here may reach projection or scoring.** Every value is display-only, and the section
  carries a `DISPLAY ONLY` badge saying so.

---

## 3. Usage & efficiency

Per-metric rows: label → `SeriesBars` over the per-season values → latest value → signed delta vs the
first season shown → coverage pips + span → a one-line note → the field expression in a
`DefinitionPopover`.

### 3.1 Build on the existing per-position set — and reuse, do not re-derive
The design draws six metrics for a **WR** because its mock player is one. `POSITION_STAT_METRICS`
already carries a correct, per-season-team-attributed, view-only set per position, and
`buildUsageHistory` already carries snap share. **This slice renders existing derivations; it creates
none.**

| Position | `buildPositionStatSeries` (existing) | Plus |
|---|---|---|
| QB | `cmpPct`, `passerRating`, `sacks` | — |
| RB | `rushShare`, `rbTargetShare`, `yardsPerCarry` | snap share |
| WR / TE | `targetShare`, `airYardsShare`, `aDOT` | snap share |

**Snap share comes from `buildUsageHistory`'s `snapPct`, not a fresh computation.** The earlier draft
specified computing `off_snp ÷ tm_off_snp` again; that forks a derivation with exactly one source
today, which `Market.jsx:313` already calls with the same `perSeasonTeamShares` deps this section
uses.

**QB gets no snap-share row.** `SNAP_POSITIONS = {RB, WR, TE}` gates it out deliberately —
`usageMetrics.js:22-24` records the reason (QB snap share is near-constant around 0.95, so a
percentile treatment wrongly penalises injury-fill starters). Do not widen that set; respecting it is
the point.

**Two metrics from the design are NOT in this slice:**
- **`EPA per opportunity`** — only source is gamelogs, and `gameLogsByYear` holds `dataSeason` only,
  so it would be a single point in a section built of series. Returns with 4c's multi-season load.
- **Red-zone share** — **cut in review**, see §3.2.

### 3.2 Red-zone share is cut, and the reason is worth keeping
The earlier draft added it, sourcing the denominator either by extending `buildTeamShareTotals` with
`rushRz`/`recRz` or by reading `computeHistoricalTeamTotals`. Both routes are bad here:

- **Extending `buildTeamShareTotals`** inherits its `playerMap` membership gate, which drops
  directory-absent (retired) ids from the denominator — a deliberate divergence from
  `computeHistoricalTeamTotals`, which keeps them. Older seasons lose proportionally more
  denominator, so shares read **high** in older seasons, which puts a systematic downward bias into
  precisely the "signed delta vs the first season shown" this section headlines. It also fires
  **CR-02**, whose app-side triggers name that function.
- **Reading `computeHistoricalTeamTotals`** avoids the bias but is not on `ProfileDataContext`, so it
  needs threading through `App.jsx` — which breaks this slice's defining constraint (§2.1).

So it is **cut and moved to 4c**, which is already touching data plumbing and can thread a denominator
properly. That also keeps 4b free of `App.jsx` and free of CR-02.

### 3.2a Season-axis alignment — required, and easy to miss
`buildPositionStatSeries` returns `[{season, value}]` with non-qualifying seasons **absent**, while
`SeriesBars` takes a **flat array** positional in time. Feeding the sparse arrays straight in produces
two silent defects: a gap season **collapses** (a player who missed 2023 shows four bars that look
consecutive), and rows for different metrics end up **different lengths**, so bars in one row sit over
different seasons than the row above.

**Build one season axis for the section** — the last N seasons displayed — and project every metric
onto it, emitting `null` where that metric has no entry for that season. `SeriesBars` renders the
nulls as void slots, which is exactly the encoding Slice 1 built for it, and every row then shares an
x-axis. Do this once, in the section, not per metric row.

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
- Coverage per metric from its own count of seasons with a **real, non-null** value on the shared
  axis — snap share bands lower than target share for the same player because `off_snp` starts in
  2020, and that difference is the point of showing coverage per metric rather than per section.
- **Pre-2020 snap-share seasons are void slots**, never `0`. `tm_off_snp` exists from 2012 while
  `off_snp` does not, so a naive ratio yields a confident-looking wrong number rather than an obvious
  failure. `buildUsageHistory` already guards this (`off_snp != null && tm_off_snp > 0` →
  `snapPct = null`); the alignment step in §3.2a carries the null through.
- **`DISPLAY ONLY` badge on the section**, citing the guards. None of this moves a projection or a
  score, and the badge is what makes that visible rather than merely true.

---

## 4. Availability & role

Three blocks in the design. Two are buildable; one is not.

### 4.1 Games-played grid — buildable, with a stated limitation
Five seasons × 18 weeks from `careerStats[season][pid].weeklyStatus`, indexed `week - 1`.

**Render all four codes.** The earlier draft specified three, on the grounds that `'B'` never appears
— but that was verified only against the **served** file. With `VITE_DATA_STORE_URL` unset the app
runs in API-only mode (documented in `CLAUDE.md:26`) and `sleeperStats.js:209` writes `'B'` from the
live path. A grid with no `'B'` rule would fall through to whatever the default branch does, in a mode
the app officially supports.

| Code | Render |
|---|---|
| `'P'` | played |
| `'D'` | did not play |
| `'B'` | **bye** — real, but only ever seen in API-only mode today |
| `'X'` | **no game recorded** — in store-served data this is where real byes land |

**Label `'X'` honestly** — "no game recorded" — and carry a one-line note that byes currently fall
into it under store-served data, because those season-totals do not resolve them. **Do not** invent a bye
by cross-referencing the schedule: the season-grain team is a single dominant team per season
(CR-02's `aggregateWeeks` rule), so a traded player would be given phantom byes for his old team's
weeks. This is a data-repo generation gap, recorded in `855aded`, and the honest display is the one
that does not guess.

The legend should list `'B'` only when at least one appears in the rendered window — a permanent
legend entry for a state the reader will never see in normal operation is noise, but suppressing the
render rule itself would be a bug.

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
`usePlayerProfile` already returns **`teamDepthChart`** from `buildTeamDepthChart` — **not
`depthChart`**; that name appears nowhere in the hook and `docs/ui.md:196-197` corrected it on
2026-08-17. Grouped by position,
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
- **One title needs updating, not an assertion:** `PlayerDetailModal.gameLogDistribution.test.jsx:147`
  is named "the index lists **five** entries…". Its assertions are `toBeGreaterThan(0)` so it stays
  green, but the name becomes false at seven. Rename it; that is a doc fix, not a test edit.

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
| **`docs/signal-registry.md`** | **Mandatory — resolved in review, it fires.** `:104` scopes the Outlook snap-trend's view-only use to "Market's Outlook column set"; this slice widens it to the pop-up. Check `:47-48` (`off_snp`/`tm_off_snp`) too — their Current-use cells name the consumers. Update the cells that change |

---

## 8. Cross-repo impact

**CR-18 fires.** The earlier draft said "expected none" and left it open; review settled it. Widening
the snap-trend's rendered scope beyond Market changes at least one `docs/signal-registry.md`
Current-use cell (`:104`), and per CLAUDE.md the `Mirror` text is a **Session-1 deliverable**:

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

Direction is **app→data-nothing**: no coverage, source or ephemerality changed, only which app code
renders the keys.

**CR-02 and CR-11 were flagged and are now avoided, not merely unaddressed.** Both would have fired on
the earlier draft's red-zone work — CR-02 because `buildTeamShareTotals` is a named app-side trigger
and the draft added cross-row sums to its loop; CR-11 because the draft introduced new app-side
readers of `off_snp`/`tm_off_snp` and `rec_rz_tgt`/`rush_rz_att`. Cutting RZ share (§3.2) and sourcing
snap share from the existing `buildUsageHistory` (§3.1) means this slice adds **no new stat-key reader
and touches neither function**. If the implementer finds themselves reaching for either, that is the
signal to stop — it means the work belongs to 4c.

**One `[registry-stale]` finding, reported not fixed:** CR-02's app-side `Triggers` names
`buildTeamShareTotals` from `outlookPositionStats.js` but not `buildPerSeasonTeamShares` (`:72`, row
loop `:78-80`), which depends on the same implicit `TEAM_*` exclusion and per-season-`team` read. Worth
a one-line registry addition in a future slice; out of scope here since this slice touches neither.

## 9. Done-definition

- [ ] Both `SECTIONS` and the JSX order updated and agreeing; index shows seven entries
- [ ] Metric sets per position, built on `POSITION_STAT_METRICS` rather than a parallel list
- [ ] Snap share reads `buildUsageHistory`'s `snapPct` — **not** a fresh `off_snp ÷ tm_off_snp`
- [ ] **QB has no snap-share row** (`SNAP_POSITIONS` respected, not widened)
- [ ] Pre-2020 snap seasons are void slots, never `0`
- [ ] **One season axis for the section**, every metric projected onto it with `null` for gaps (§3.2a)
- [ ] `EPA per opportunity` and **red-zone share** both **not** built (§3.1, §3.2)
- [ ] `outlookPositionStats.js` and `outlookUsage.js` have a **zero diff**
- [ ] Weekly status strip **not** built, and no `DegradedBlock` stands in for it (§4.2)
- [ ] Grid renders **all four** codes including `'B'` (reachable in API-only mode); `'X'` labelled
      "no game recorded" with the byes-land-here note
- [ ] Depth chart read as **`teamDepthChart`**, not `depthChart`
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

---

## 11. Plan-review record (2026-08-21)

Twelve flags, all verified and applied; §3 was rewritten rather than patched, and **three cross-repo
entries were flagged where the draft claimed none**.

**The draft created work that already existed.** `buildUsageHistory` already returns per-season
`snapPct` from exactly the `off_snp ÷ tm_off_snp` ratio §3.2 specified computing afresh — and
`Market.jsx:313` already calls it with the same deps. The rewrite reduces this slice to *rendering
existing derivations*, which is what it should have been.

**It also widened a deliberately narrow set.** Snap share was added to QB, but `SNAP_POSITIONS` gates
QB out on purpose: `usageMetrics.js:22-24` records that QB snap share is near-constant around 0.95, so
percentile treatment wrongly penalises injury-fill starters.

**A shape mismatch that would have produced silently wrong charts.**
`buildPositionStatSeries` omits non-qualifying seasons entirely, while `SeriesBars` takes a flat
positional array — so a gap season would collapse and rows for different metrics would sit over
different seasons. §3.2a adds the season-axis alignment the draft never specified.

**Red-zone share is cut** on a finding worth keeping: extending `buildTeamShareTotals` inherits its
`playerMap` gate, which drops retired ids from the denominator, so older seasons read
systematically **high** — biasing the exact "delta vs first season" the section headlines. The
alternative source needs `App.jsx` threading, which breaks the slice's defining constraint. Moving it
to 4c resolves the bias, the constraint, and CR-02 at once.

**`'B'` is reachable after all.** `855aded` verified only the *served* file; in API-only mode — a
documented supported configuration — the live path writes `'B'`. The grid needs four states, not
three.

And the draft reintroduced **`depthChart`** for a hook key that is `teamDepthChart` — a name
`docs/ui.md:196-197` had corrected on 2026-08-17, after this same session flagged it. Fixed in three
places.

**Cross-repo:** CR-18 fires (settled, `Mirror` quoted in §8). CR-02 and CR-11 would have fired on the
draft and are now **avoided by construction** rather than unaddressed. One `[registry-stale]` finding
reported for a future slice.

