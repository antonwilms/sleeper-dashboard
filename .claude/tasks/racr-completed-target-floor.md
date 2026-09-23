# Target floor on the completed-season RACR column

**Type:** small fix to a shipped surface. **Model:** sonnet.
**Baseline:** app `13d86e4`. **Surface:** Market → Efficiency (WR / TE / ALL), the completed `RACR` column.
**Origin:** follow-up flagged by `advstats-live-season-column.md` §1.3. RACR is a per-target rate and the
only Efficiency rate with no denominator floor. `efficiency-rate-denominator-floors.md` covered only the four
gamelogs-derived rates. The live `RACR <season>` column already floors at `MIN_TARGETS`, so this change
makes the two side-by-side columns follow one rule.

---

## §0 Decisions already made — do not reopen

- The floor is **`MIN_TARGETS` (25)** from `src/utils/seasonEfficiency.js:32`, the floor `EPA/TGT` and the
  live column already use. Do not add a new constant.
- The denominator is the advstats row's own `components.targets`, the same field the live column reads. Do not
  join to gamelogs or season-totals targets.
- The rate stays `racr` exactly as served. Do not recompute it.

## §1 Evidence (for this file only; must not appear in code comments or docs)

On `nflverse/advstats/2025.json`, among WR/TE rows with non-null `racr`:
- **WR: 118 of 218 kept (54%).** Unfloored range 0–8.33; floored range 0.27–3.55.
- **TE: 55 of 120 kept (46%).** Unfloored range 0–7.0; floored range 0.50–2.43.

The keep rates match `MIN_TARGETS`' existing comment (54% / 45%, measured on gamelogs), so the floor
means the same thing on both sources. Today, a descending RACR sort is topped by 1–3 target players,
the exact defect `efficiency-rate-denominator-floors.md` §1 fixed for the other rates.

---

## §2 `src/utils/liveAdvStats.js` — one floored accessor, two callers

- New export **`flooredRacr(row)`**: it returns `row.racr` when `Number.isFinite(row?.racr)` **and**
  `Number.isFinite(row?.components?.targets)` **and** `targets >= MIN_TARGETS`, and `null` otherwise.
- Refactor `liveRacrCell` to use it: take `racr` from `flooredRacr(row)`, and return null if that is
  null. Keep the weeks checks and the `{ racr, weeks, targets }` return shape. **Its behaviour is
  unchanged**, and the existing `liveAdvStats.test.js` cases must pass unedited.
- Header comment: the module now also serves the completed column's floor. Reword the first line to
  "Governs Market's RACR columns: the per-target floor shared by the completed and live columns, and
  when the live column is usable." Describe mechanism only (CLAUDE.md, *Reference docs state
  capability and mechanism*).

## §3 `src/components/market/Market.jsx:645`

Change `_eff.racr = advRow?.racr ?? null` to `_eff.racr = flooredRacr(advRow)`, and add `flooredRacr` to
the existing import at `:17`. **This must be a one-line in-place edit with no added or removed lines
anywhere in `Market.jsx`.** CR-19 pins `Market.jsx` line anchors, and D-41's anchors were re-derived at
`55e1373`; a line shift would stale them again. Line 17's import edit stays on one line.

The banner at `:959` currently says "(≥ 25 targets)" about the live column only. Leave it as is: the
column popover (§4) carries the completed column's rule, as it does for `EPA/TGT`.

## §4 `src/utils/usageEfficiency.js:164`, the `racr` note

Rewrite the note **in place, as a single line**, so that no line after it shifts (CR-19 anchors at `:169`):
`note: 'Receiver Air Conversion Ratio, served precomputed. Blank below 25 targets (the EPA/target floor).',`
Leave `field`, `label` and the formatters unchanged.

---

## §5 Tests

**Each new test must fail without the change it guards. Show red-under-revert in the hand-back** (revert
§3's line; revert `flooredRacr`'s targets check).

- `src/utils/liveAdvStats.test.js`, `flooredRacr`:
  - Returns null at 24 targets and the value at 25 (the boundary).
  - Returns null for `racr: null`, for missing `components`, and for an undefined row.
  - Returns a measured `0` at ≥ 25 targets as `0`, not null. Null is not zero.
- `Market.test.jsx`:
  - **Fixture correction:** the completed-column fixtures at `:781` and `:944` are
    `{ wr1: { racr: 1.15 } }` with no `components`. Under the floor they render `—`, so add
    `components: { targets: 30 }` to both. This is a fixture correction, not a weakened assertion.
    The shared `:781` default feeds **three** tests that assert `1.15`: `:927-932`, `:1030-1031`
    ("The completed RACR column still shows its own value") and the default render. The hand-back
    must name all three so that verification doesn't read them as untouched. `:944-947` keeps its
    assertion that `1.15` is **absent** (it does not assert `—`). Without `components`, the floor
    alone would blank the value and the test would stop discriminating the `year !== dataSeason` pin.
  - New: the completed RACR fixture at `targets: 24` renders `—` in the WR row's RACR cell, not `1.15`.
    Make the assertion specific to that cell, not "some `—` in the row". The row has other `—` cells,
    so a row-wide assertion passes regardless. Scope it by column index taken from the `RACR` header's
    position, or by giving the fixture a value that appears nowhere else and asserting it is absent.
  - New: sort by `RACR` descending with two WR fixtures, one at `racr: 5.0, targets: 3` and one at
    `racr: 1.2, targets: 40`. The 40-target player sorts first and the 3-target player sinks
    (`compareNullsLast`). Follow the harness's existing sort-click pattern.
- `advStatsViewOnly.test.js`: no change. It already forbids `liveAdvStats` in pipeline modules.

## §6 Smoke

Market → Efficiency → WR, sorted by `RACR` descending. The top rows are players with ≥ 25 targets
and no single-digit-target outliers. Some low-volume WRs show `—`. The live `RACR <season>` column is
unchanged.

## §7 Docs (same change, mechanism only)

- `docs/ui.md:206` (the denominator-floors bullet): reword the count. "four per-opportunity rates"
  and "only the four rates get the gate" become five. Add `RACR`, and note that its floor is the same
  `MIN_TARGETS` but applied to the advstats row's own `components.targets` via
  `liveAdvStats.flooredRacr`, not inside `seasonEfficiency.js`.
- `docs/ui.md:207` (the `RACR` bullet): add "below `MIN_TARGETS` targets → `—`".
- `docs/nav/utils.md:43` (the `liveAdvStats.js` row): add `flooredRacr`, used by both RACR columns.
  Reword the opening, which describes a live-column-only util, and the closing "Feeds …'s live
  `RACR <liveSeason>` column only". The module now serves both RACR columns.
- `docs/nav/components.md:22` (the Market row): the completed `RACR` read is now floored at
  `MIN_TARGETS`. Edit only that clause.
- `docs/signal-registry.md:55` (the Current-use cell): add "(both columns blank below `MIN_TARGETS`
  targets)" after the RACR mention. Do not touch the coverage cells.
- `CLAUDE.md`: no change. It has almost no headroom, and the floor is per-file detail.

---

## §8 Cross-repo impact

No data-repo file, schema, floor, cadence or manifest family changes. The obligation is emission.
**Do not edit `docs/cross-repo-registry.md`** (CR-24). If the registry needs updating, append it to D-41
in `.claude/tasks/data-repo-backlog.md`. Do not open a new item.

**CR-07 · nflverse advstats (view-only): triggered.** Its app-side Triggers name Market's
`advStats?.byId?.[id]?.racr` read, which §3 edits. The completed column now also reads
`components.targets` by name. D-41 already proposes the clause "the live column additionally reads
`components.targets` and `components.weeks` by name". **Amend D-41** (`data-repo-backlog.md`) in four places,
re-deriving every anchor with `grep -n` on the post-change tree:
1. `:40` (the sub-field clause) → "the completed and live RACR columns read `components.targets` by
   name (the `MIN_TARGETS` floor, via `liveAdvStats.flooredRacr`); the live column also reads
   `components.weeks`".
2. `:37` (the App-side append): describe `src/utils/liveAdvStats.js` as "`flooredRacr`, the
   `MIN_TARGETS` floor both RACR columns share, and `usableLiveAdvStats`/`liveRacrCell`, the live
   column's year check and cell", rather than as the live column's only.
3. `:39` (the Triggers append): add the completed read `_eff.racr = flooredRacr(advRow)`
   (`Market.jsx:645`) alongside the live read.
4. `:41` (the registry-stale list): add a line saying CR-07's trigger text
   "`market/Market.jsx`'s `advStats?.byId?.[id]?.racr` read" no longer matches source. Propose the
   replacement "`market/Market.jsx`'s completed `RACR` read (`advRow` built with the `year ===
   dataSeason` pin, floored via `flooredRacr`) and live `RACR <season>` read". Also add that CR-07's
   anchors `loadAdvStats:46` → `:95` and `MIN_ADVSTATS_ROWS … :35` → `:41` (in `src/api/advStats.js`)
   are stale.

> **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**CR-19 · Market Efficiency stat keys: triggered.** Its Triggers name "`market/Market.jsx`'s Efficiency-set
call sites" (§3 edits one) and "`utils/usageEfficiency.js`'s `METRIC_META` field strings". §4 edits the
note, not the `field`, but it is the same entry. No Sleeper stat key changes. §3 and §4 are in-place
single-line edits so that no CR-19 line anchor shifts. Verify with `git diff --stat` that the two
files show equal insertions and deletions.

```text
- **Mirror:** Do not remove, rename or filter `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`
  or `rec_drop`. They drive five columns of Market's Efficiency set plus the Outlook `sacks` metric,
  and **nothing in either repo fails when they vanish** — no error, no test failure. `rush_yac`,
  `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data" rather than
  "the pipeline broke." `pass_sack` and `pass_air_yd` were worse until this entry was written: their
  call sites divided by a denominator that survives the key's absence, so a missing key rendered a
  confident **`0.0`** rather than blanking. Both were hardened in the same change; the hazard is
  recorded because the *shape* invites the identical bug in any future consumer that divides by a
  surviving denominator. These keys are **view-only** — unlike CR-11/12/13 they never touch
  `projectedPPG`, the dynasty score or any `factors` entry, so changes need no graded gate; the cost
  of losing them is silent display corruption, not silent scoring drift.
```

**CR-18 · Signal registry rows: triggered.** §7 edits `docs/signal-registry.md:55`. The app owns the file,
and nothing is owed data-side.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

---

## §9 Done-definition

CLAUDE.md's steps (test, lint, build, smoke, commit). Also:
- The existing `liveAdvStats.test.js` cases pass unedited.
- `git diff --stat` shows `Market.jsx` and `usageEfficiency.js` with equal insertions and deletions.
- All four D-41 amendments (§8) land in the same commit.
- **Do not push.** Session 1 verifies first.
- Hand-back: the SHA, the files touched, deviations, red-under-revert evidence, and the smoke result.

---

## Plan review record (plan-reviewer, 2026-09-23)

The gate raised 7 flags. All were verified and applied: the three D-41 lines plus the CR-07 trigger
wording and anchors (§8 items 1–4); the `ui.md:206` count wording; the `nav/utils.md:43` "only" wording;
the `:944` assertion corrected to "`1.15` absent"; and the three dependent tests named for the hand-back
(§5). The gate confirmed that the one-line-edit constraint is achievable (no max-len lint rule) and that
the §5 tests discriminate. None were rejected.
