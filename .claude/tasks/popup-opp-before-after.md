# Pop-up · in-season Opp/G before → now (follows C2)

**Review depth: full** — widens a view-only guard's allowlist (`inSeasonEvidenceViewOnly.test.js`), adds a key to
`App.jsx`'s `profileContextValue` (the live season's `currentSeasonTotals`, guarded by
`currentSeasonTotalsIsolation.test.js`), and adds an export to a module two guards pin. No scoring, projection,
snapshot or cross-repo contract change (CR-25's definitions are untouched).

Session 1: opus, high. Session 2: **sonnet**, medium. Visual change — Session 2 runs the app from
`.claude/launch.json`; Anton judges the result.

**Status: approved by Anton 2026-11-01 — plan-reviewer (full) flags 1–4 folded in at his direction. Session 2
(sonnet) starts only once C2 is committed on `main` (§1 precondition check).** Flags: 1 three stale "Market-only" comments reworded (§2.1);
2 the new context key appended last and the "last four are P5c's" sentence reworded (§4, §7); 3 §6.4-4's
show-red is now a modal-side change; 4 §6.4-1 names the labelled `careerStats` copy and a concrete show-red.

**Precondition: C2 (`.claude/tasks/market-model-view.md`) is committed on `main`.** At planning time (2026-11-01,
HEAD `42491b5`) C2 was still a plan awaiting approval, so this file anchors on C2's *specified* code (its §4.3
`MODEL_CELLS.oppShift`, its §7.2 `playerRows` prop) rather than on landed source. Session 2's first step is §1's
precondition check; if any of it fails, stop and report — do not adapt.

---

## 0. What this is, for Anton

C2 takes the Opp/G baseline and Opp/G now off Market's foreground and leaves them only as a hover on the Model
view's Opp shift cell. This slice puts them in the player pop-up as one line in **Usage & efficiency**:

> **In-season Opp/G** 19.4 (2025 season) → 21.0 this season

— the same words, the same numbers and the same "show it or `—`" rule as Market's hover, for the same player.
A player with no real role in the last three seasons who now has one shows `21.0 this season` with a **new role**
chip, as Market does. Everything else shows `—`; before a live season is loaded it says so. Kickers and defences
get no line.

**Two decisions, both confirmed against live source:**

1. **Widen the guard, don't fork the definition** (agreed 2026-11-01). Only `Market.jsx` may import
   `inSeasonEvidence.js` today. The pop-up becomes the second, named importer. The alternative — writing the
   opportunity rule a second time in the pop-up — is the thing the guard exists to prevent, and the rule is also
   mirrored in the data repo (CR-25), so a second app copy would be a third copy to keep in step. The guard keeps
   its real job: no projection/scoring module, no `App.jsx` code and no snapshot may touch the module.
2. **Read the same live file Market reads.** The pop-up already has the live season's *weekly* Sleeper rows
   (`liveWeeklyRows`), which drive its SO FAR tile. They are a different feed from the season-totals file Market's
   Model view reads (`currentSeasonTotals`, captured into the data store on a schedule): the two can disagree on
   games played in a week the capture hasn't caught up with, and the weekly rows would need a second aggregation
   into the season-row shape the opportunity rule takes. So the pop-up gets `currentSeasonTotals` on its context —
   one line in `App.jsx`. **Trade-off you'll see:** for a few days after a game week, the SO FAR tile (weekly
   rows) can count one more game than the Opp/G line (season totals). The Opp/G line always matches Market.

Cost: one cheap pass per pop-up open over last season's rows and the live rows (the basis check); no new fetch.

**Deliberate behaviour you might question:** a player with a baseline who has not played yet this season shows
`—`, not "19.4 (2025 season) → —". That is Market's rule (no shift at 0 games — a missed game is not evidence), kept
identical rather than inventing a pop-up-only state.

---

## 1. Scope

**Precondition check (Session 2, before any edit):**
- `git log --oneline` shows C2's feat commit; `grep -n "MODEL_CELLS" src/components/market/Market.jsx` finds it.
- In `MODEL_CELLS.oppShift`, the relative-% span's `title` is exactly
  `` `Opp/G ${r.oppPrior.toFixed(1)} (${r.baselineSeason} season) → ${r.oppNow.toFixed(1)} this season` `` and a
  module-level `NEW_ROLE_TITLE` const exists in `Market.jsx` with In-season's copy (quoted in §2).
- `<UsageEfficiencySection` in `PlayerDetailModal.jsx` receives `playerRows={playerRows}` (C2 §7.2).

**Touch list:** `src/utils/inSeasonEvidence.js`, `src/components/market/Market.jsx` (two lines),
`src/components/dp/PlayerDetailModal.jsx`, `src/App.jsx` (one context key + its dep),
`src/context/ProfileDataContext.jsx` (comment only), `src/utils/inSeasonScoring.js` and
`src/utils/marketWindowStats.js` (comments only, §2.1), `src/__tests__/inSeasonEvidenceViewOnly.test.js`,
`src/__tests__/currentSeasonTotalsIsolation.test.js`, `src/utils/inSeasonEvidence.test.js`,
`src/components/dp/PlayerDetailModal.usageAvailability.test.jsx`, and the docs in §7.

**Not touched:** `UsageEfficiencySection.jsx` (the line lives in the modal's section card, outside the component,
so a player with no qualifying seasons — whose section early-returns a `DegradedBlock` — still gets the new-role
line); `liveSeasonLog.js` and the SO FAR tile; every PIPELINE module; `inSeasonScoring.js`'s code (its two
comments change, §2.1); the data repo.

---

## 2. `src/utils/inSeasonEvidence.js`

**Header comment.** Replace the `MARKET-ONLY:` paragraph with:

```js
// VIEW-ONLY: two named importers — `market/Market.jsx` (the Model view) and `dp/PlayerDetailModal.jsx` (the
// pop-up's Opp/G before → now line, popup-opp-before-after.md). The pop-up was added deliberately so both
// surfaces share one opportunity definition rather than fork it. Nothing here may reach `seasonProjections`,
// `playerRows`, the dynasty score or a snapshot. Guarded by `src/__tests__/inSeasonEvidenceViewOnly.test.js`.
```

(If C2's §9 already reworded line 1's "Market's In-season set", keep C2's wording there; this edit is only the
importer paragraph.)

**Two new exports**, placed directly after `usableLiveSeason` (no new imports — the module-imports pin stays
`['./blendWeights', './inSeasonConstants']`):

```js
// The before → now text both surfaces show, from one buildInSeasonPosteriors result. Shown only where the
// relative shift exists (eligible, a baseline, n > 0) — an ineligible basis-mismatch result still carries
// oppPrior/oppNow, and must not show them. → string | null
export function oppBeforeAfter(r) {
  if (r?.oppShift == null) return null
  return `${r.oppPrior.toFixed(1)} (${r.baselineSeason} season) → ${r.oppNow.toFixed(1)} this season`
}

export const NEW_ROLE_TITLE = 'No real role in the last three seasons (under 4 games, or under 2 opportunities a game in the most recent one), so there is no baseline to shift from. This is this season\'s opportunities per game.'
```

`NEW_ROLE_TITLE` is In-season's string, verbatim (live `Market.jsx:846` before C2; C2 moves it to module level).
Why `oppShift != null` is a sufficient gate: `buildInSeasonPosteriors` sets `oppShift` only inside
`if (eligible && hasBaseline)` and only when `n > 0` and `rosO.value != null`; `hasBaseline` implies a finite
`oppPrior ≥ 2` and a non-null `baselineSeason`; `blend` returns a value at `n > 0` only when `observed` (`oppNow`)
is finite.

### 2.1 Comments elsewhere that call the module Market-only (plan-reviewer flag 1)

Text only — no code, import or test changes; the module-imports pins are unaffected. Each becomes false with two
named importers, so each is reworded in this change:

- `src/utils/inSeasonScoring.js:9` — `It must not import ./inSeasonEvidence (Market-only, guarded) or anything from src/api/.`
  → `It must not import ./inSeasonEvidence (view-only: Market and the player pop-up only, guarded) or anything from src/api/.`
- `src/utils/inSeasonScoring.js:36-37` — `Copied because that module is Market-only and Market may not import this seam.`
  → `Copied because that module is view-only (only Market and the player pop-up may import it), so this seam may not.`
  (the second line, `Both copies stay, kept identical by inSeasonScoring.test.js.`, is unchanged).
- `src/utils/marketWindowStats.js:10` — `(the Market-only in-season module cannot be imported here).`
  → `(the view-only in-season module — Market and the pop-up only — cannot be imported here).`

Before committing, `grep -rn "Market-only" src/` must return no line that refers to `inSeasonEvidence`; report any
other hit rather than editing it.

## 3. `src/components/market/Market.jsx` (post-C2)

- Import: add `oppBeforeAfter, NEW_ROLE_TITLE` to the existing `inSeasonEvidence` import.
- Delete the module-level `const NEW_ROLE_TITLE = …` C2 created (its uses now read the import; no other change).
- In `MODEL_CELLS.oppShift`, the relative-% span's `title` becomes `` `Opp/G ${oppBeforeAfter(r)}` `` — the same
  string as before for every row that reaches that span (the span renders only when `relPct != null`, i.e.
  `oppShiftRel != null`, i.e. `oppShift != null`).

Nothing else in Market changes. C2's Market tests that assert the title text (`Opp/G … (2025 season) → … this
season`, and no `Opp/G` title on the `—` cell) must stay green unedited — they are this refactor's guard.

## 4. `src/App.jsx` — one context key

In `profileContextValue`, as the **last** key (after `onNeedGameLogSeason,`) add:

```js
    // popup-opp-before-after — view-only: the live season's season-totals, the same object Market's Model view
    // receives, for the pop-up's Opp/G before → now line. Read raw; the reader applies the usable-season gate.
    currentSeasonTotals,
```

and add `currentSeasonTotals` to the end of the memo's dependency array.

**Comment constraint:** the comment must not contain `inSeasonEvidence`, `buildInSeasonPosteriors` or
`scoringPosteriors` — `inSeasonEvidenceViewOnly.test.js` forbids the first two anywhere in `App.jsx` and allows the
third only in four named slices.

**Checked against `currentSeasonTotalsIsolation.test.js`:** its App-side assertions are argument-list checks on
named calls (`computeDynastyScore(`, `buildProspectLevel(`, `buildRookieDynastyPriors(`,
`computeNextSeasonProjection(`, `buildInSeasonLevel(`, `buildScoringPosteriors(`, `buildQbLiveStates(`,
`applyInSeasonProjection(`, `writeProjectionSnapshot(`, `shouldWriteProjectionSnapshot(`), the loader effect and
the `setCareerStats(null)` reset lines. `profileContextValue` is a `useMemo(` object literal, none of those. Passing
the raw object (not `liveSeasonUsable ? … : null`) is deliberate: Market receives it raw and
`buildInSeasonPosteriors` applies `usableLiveSeason` itself, so both surfaces gate identically.

**Why the context, not a prop:** the pop-up is mounted through `PlayerDetailTabs` from any surface and reads all
its data from `ProfileDataContext`; `usePlayerProfile` destructures named keys only (no spread), so the new key
reaches no projection display. §6.2 adds a guard that keeps it that way.

`src/context/ProfileDataContext.jsx` header (plan-reviewer flag 2): "eighteen keys" → "nineteen keys"; append
`currentSeasonTotals` at the **end** of the key list (after `onNeedGameLogSeason`); replace "The last four are
P5c's (the phase input, …)" with "`nflState`, `liveWeeklyRows`, `scoringSettings` and `onNeedGameLogSeason` are
P5c's (the phase input, …)" — the parenthesis unchanged — so the sentence stays true; and add one sentence:
"`currentSeasonTotals` is the live season's season-totals, the object Market reads, for the pop-up's Opp/G
before → now line (popup-opp-before-after)."

## 5. `src/components/dp/PlayerDetailModal.jsx`

**Imports:**
```js
import { buildInSeasonPosteriors, oppBeforeAfter, NEW_ROLE_TITLE, IN_SEASON_POSITIONS } from '../../utils/inSeasonEvidence'
import { deriveDataSeason } from '../../utils/environment'
```
(`environment.js` has no imports and is not a PIPELINE module; `deriveDataSeason` returns exactly Market's
`completedSeasons[0] ?? null`.)

**Context:** add `currentSeasonTotals` to the `useProfileData()` destructure.

**Memo** — placed with the other memos, **above** the `if (!dynastyScore)` early return (hook order), e.g. after
the `twoYear` memo:

```js
// popup-opp-before-after — the Opp/G before → now line: Market's Model-view result for this one player.
// buildInSeasonPosteriors' per-player result depends only on that row (plus the league-wide basis check over
// careerStats/live rows/playerMap, not the row list), so a one-row call equals Market's whole-list call.
const inSeasonOpp = useMemo(() => {
  const row = (playerRows ?? []).find(r => r.player_id === playerId)
  if (!row) return null
  const res = buildInSeasonPosteriors({
    playerRows: [row], careerStats, dataSeason: deriveDataSeason(careerStats), playerMap: playersMap,
    currentSeasonTotals,
  })
  return res ? (res.byId.get(playerId) ?? null) : undefined
}, [playerRows, playerId, careerStats, playersMap, currentSeasonTotals])
```

Return contract: `undefined` = no usable live season; `null` = no row for the player (cannot render — the modal
early-returns without `dynastyScore`, which comes from the same row); otherwise the result object. The row passed
is the context `playerRows` row (`row.position`, as Market uses), not `playersMap`'s.

**Render** — inside the `§usage` card, directly after `<UsageEfficiencySection … />`, only when
`IN_SEASON_POSITIONS.includes(player.position)`:

```jsx
<div data-testid="usage-opp-live" className="mt-4 pt-3 border-t border-dp-border flex items-baseline gap-3">
  <DefinitionPopover term="In-season Opp/G" gloss="Opportunities per game — QB: pass attempts + carries; RB/WR/TE: carries + targets. Before: the most recent of the last three seasons with 4+ games. Now: this season so far. The same numbers as Market's Model view.">
    <span className="text-xs text-dp-text-2 w-[112px] inline-block truncate text-left">In-season Opp/G</span>
  </DefinitionPopover>
  {inSeasonOpp === undefined ? (
    <span className="font-dp-mono text-xs text-dp-muted">— <span className="font-sans text-[11px]">No in-progress season loaded</span></span>
  ) : oppBeforeAfter(inSeasonOpp) != null ? (
    <span className="font-dp-mono text-xs text-dp-text">{oppBeforeAfter(inSeasonOpp)}</span>
  ) : inSeasonOpp?.newRole ? (
    <span className="font-dp-mono text-xs text-dp-text">
      {inSeasonOpp.oppNow.toFixed(1)} this season
      <span title={NEW_ROLE_TITLE} className="ml-1 font-dp-mono text-[10px] px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-2 whitespace-nowrap">new role</span>
    </span>
  ) : (
    <span className="font-dp-mono text-xs text-dp-muted">—</span>
  )}
</div>
```

Import `DefinitionPopover` from `./DefinitionPopover` (not imported in the modal today). The chip's classes are
Market's `chip()` classes verbatim. No `PROVISIONAL(` tag — every value shown is real data, and `—` is the
graceful-absence path.

The line is phase-independent on purpose: Market's Model view shows the shift whenever the live season is usable
(including the post-season, before careerStats rolls over), and the pop-up must show it at the same times.

## 6. Tests

Each test names what it asserts and the defect it catches. Session 2 shows each new/changed test red with the
defect temporarily reintroduced, then restores.

### 6.1 `src/__tests__/inSeasonEvidenceViewOnly.test.js` — the allowlist

- Rename the test to `'the only non-test files importing inSeasonEvidence are dp/PlayerDetailModal.jsx and market/Market.jsx'`
  and change the expectation to `expect(importers.sort()).toEqual(['src/components/dp/PlayerDetailModal.jsx', 'src/components/market/Market.jsx'])`
  (the `.sort()` is new: `readdirSync` order is not guaranteed, and the list now has two entries).
  Above it, a comment: `// popup-opp-before-after (2026-11-01): the pop-up was added deliberately — one opportunity
  definition shared by both surfaces beats a second copy in the pop-up. A third importer is a new decision, not a
  fix to this list.`
  Update the file's header comment: "Market's in-season display module" → "the in-season opportunity display module
  (Market's Model view and the pop-up's Opp/G line)".
  *Asserts* exactly two importers. *Catches:* any third file importing the module (e.g. a scoring helper or
  `usePlayerProfile`). *Show red:* temporarily expect only `Market.jsx` → fails on the pop-up's import.
- Every other test in the file is unedited (PIPELINE, `App.jsx`/`projectionSnapshot.js` FORBIDDEN, module-imports
  pin, the seam block).

### 6.2 `src/__tests__/currentSeasonTotalsIsolation.test.js` — the new context key stays display-only

New `describe('the pop-up reads the live season-totals for display only (popup-opp-before-after)')`:

1. `'profileContextValue passes currentSeasonTotals raw'` — slice `App.jsx` from
   `const profileContextValue = useMemo(` to the first `])` after it; assert the slice matches
   `/^\s*currentSeasonTotals,\s*$/m` and does **not** match `/liveSeasonUsable/`.
   *Catches:* the key dropped (pop-up line always `—`) or pre-gated with `liveSeasonUsable`, which would make the
   pop-up's gate differ from Market's. *Show red:* change the key to `currentSeasonTotals: liveSeasonUsable ? currentSeasonTotals : null`.
2. `'among useProfileData() consumers, only dp/PlayerDetailModal.jsx reads currentSeasonTotals'` — walk `src`
   (non-test `.js/.jsx`), keep files whose text contains `useProfileData(`, and assert
   `files.filter(f => /\bcurrentSeasonTotals\b/.test(text(f))).sort()` equals `['src/components/dp/PlayerDetailModal.jsx']`.
   *Catches:* `usePlayerProfile` (which feeds the pop-up's projection/comps displays) or the tabs shell picking up
   the live totals. *Show red:* temporarily add `currentSeasonTotals` to `usePlayerProfile.js`'s destructure.

Reuse the file's existing `moduleSpecifiers`-style helpers where possible; the walk is the same as
`inSeasonEvidenceViewOnly.test.js`'s.

### 6.3 `src/utils/inSeasonEvidence.test.js` — the helper and the one-row equivalence

New `describe('oppBeforeAfter and the one-row call (popup-opp-before-after)')`, using the file's `pRow`/`live`/
`mkTotals`/`run`/`row` helpers:

1. `'formats an eligible, baselined, played result'` — career `w: pRow(10, { rec_tgt: 100 })`, live
   `w: live(3, 30, { rec_tgt: 45 })` → `oppBeforeAfter(get(res, 'w'))` is exactly `'10.0 (2025 season) → 15.0 this season'`.
   *Catches:* a format drift (Market's hover and the pop-up both read this string).
2. `'is null where the shift is withheld, even when oppPrior/oppNow are present'` — three results:
   (a) n = 0 (`live(0, 0, {})`) with a baseline; (b) basis mismatch (live row `scoringBasis: 'league'` vs prior
   `half_ppr`, n = 3) — first assert `get(res,'w').oppPrior` and `.oppNow` are both non-null, so the case is live;
   (c) new role (no prior row, live `rec_tgt` 30 over 3 games). Each → `null`.
   *Catches:* gating on `oppPrior != null && oppNow != null` instead of `oppShift != null` — leaks the
   mismatch row's numbers (C2 flag 7's rule). *Show red:* swap the gate to that form → (b) fails.
3. `'a one-row call returns the same per-player result as the whole-list call'` — a list of six rows from
   `baseCareer()` (`wLo`, `wMid`, `wHi`, `rA`, `rB`, `qb`) with live rows for each, including one basis-mismatch and
   one n = 0; for every id, `expect(get(run({ rows: [thatRow], … }), id)).toEqual(get(run({ rows: all, … }), id))`.
   *Asserts* the property the pop-up's memo relies on (§5). *Catches:* a future change that makes a player's result
   depend on the row list (e.g. a cohort-relative shift), which would make the pop-up silently diverge from
   Market. *Show red:* temporarily set `result.oppNow` to `oppNow == null ? null : oppNow + (playerRows.length > 1 ? 0 : 0.1)` → fails.

### 6.4 `src/components/dp/PlayerDetailModal.usageAvailability.test.jsx` — the line

Add a helper in the test file that returns a deep copy of the file's `careerStats` with `scoringBasis: 'league'` on
every row (call its result `labelled`; every case below passes `labelled` as the context's `careerStats`) (the fixture rows carry none, and the basis guard needs every QB/RB/WR/TE row of `dataSeason` labelled).
Add a `wrNew` player to a local `playersMap`/`playerRows` copy for case 4 (WR, no careerStats rows,
`richDynastyScore()`). `live2026 = (players) => ({ season: 2026, complete: true, players })`; live rows
`{ gamesPlayed, fantasyPoints: 0, stats, scoringBasis: 'league' }`.

1. `'shows Market's before → now for an RB with a baseline, from the season-totals file'` — `rb1` 2025 is
   16 G, `rush_att 260 + rec_tgt 50` → 19.375. Live `rb1: { gamesPlayed: 4, stats: { rush_att: 70, rec_tgt: 14 } }`
   → 21.0. Also pass `liveWeeklyRows: { year: 2026, complete: true, weeks: [{ week: 1, rows: { rb1: { stats: { gp: 1, rush_att: 5 } } } }] }`
   (a 5.0 rate if it were read). Assert `within(getByTestId('usage-opp-live'))` has text
   `19.4 (2025 season) → 21.0 this season`, **and** that it equals
   `oppBeforeAfter(buildInSeasonPosteriors({ playerRows, careerStats: labelled, dataSeason: 2025, playerMap: playersMap, currentSeasonTotals }).byId.get('rb1'))`
   computed over the **whole** fixture `playerRows` (Market's call), where `labelled` is the **same `scoringBasis`-
   labelled deep copy** passed to the modal's context — never the fixture's raw `careerStats`, whose rows carry no
   `scoringBasis` and would make rb1 ineligible (comparison value `null`) (plan-reviewer flag 4). Also assert that
   comparison value is non-null, so the equality cannot pass as `null === null`.
   *Catches:* a wrong `dataSeason`, the pop-up reading the weekly rows, or a forked definition.
   *Show red:* in the modal memo pass `dataSeason: deriveDataSeason(careerStats) - 1` → the line renders
   `18.4 (2024 season) → 21.0 this season` (2024: (250 + 45) / 16 = 18.4375) and the assertion fails.
2. `'shows — and the not-loaded note when no live season is usable'` — three renders: `currentSeasonTotals`
   absent; `{ season: 2026, complete: false, players: {…} }`; `{ season: 2025, complete: true, players: {…} }`
   (not past `dataSeason`). Each: the row reads `—` and `No in-progress season loaded`, and contains no `19.4`.
   *Catches:* rendering an incomplete file or last season's file as "this season". *Show red:* drop the
   `undefined` branch so a null result falls to the plain `—` (note missing), or bypass `usableLiveSeason`.
3. `'shows a bare — and leaks nothing for a basis-mismatch row'` — live `rb1` as in 1 but `scoringBasis: 'ppr'`.
   The row contains a `—`, does not contain `No in-progress season loaded`, and no element inside it has text or
   `title` containing `19.4` or `21.0`. *Catches:* the leak of §6.3-2 at the render site. *Show red:* render
   `inSeasonOpp.oppPrior` whenever it is non-null.
4. `'shows the new-role rate and chip for a player with no baseline'` — `wrNew` live
   `{ gamesPlayed: 3, stats: { rec_tgt: 18 } }` → `6.0 this season` and a `new role` chip whose `title` is
   `NEW_ROLE_TITLE`. Also asserts the line renders even though this player's Usage & efficiency body is the
   "No qualifying seasons yet" `DegradedBlock`. *Catches:* the line placed inside `UsageEfficiencySection` (lost
   behind its early return) or the chip dropped. *Show red* (plan-reviewer flag 3 — a change inside the modal,
since `UsageEfficiencySection.jsx` is untouched and has no `inSeasonOpp` in scope): gate the `usage-opp-live`
block on `axisSeasons.length > 0 &&` → the row is absent for `wrNew` and the test fails.
5. `'renders no line for a kicker'` — `k1` with a usable live season → `queryByTestId('usage-opp-live')` is null.
   *Catches:* the position gate dropped.

### 6.5 Unchanged guards

`factorsSchema`, `statKeysContract` (no stat key added — `pass_att`/`rush_att`/`rec_tgt` are already read by the
module), `advStatsViewOnly`, `twoYearBaselineViewOnly`, and C2's Market tests (§3) — all green unedited.

## 7. Docs (same change)

- `docs/nav/utils.md` `inSeasonEvidence.js` row: importers are `Market.jsx` and `dp/PlayerDetailModal.jsx`
  (deliberate, one definition); add `oppBeforeAfter(r)` (the before → now text, `null` unless `oppShift` exists)
  and `NEW_ROLE_TITLE`.
- `docs/nav/components.md` `dp/PlayerDetailModal.jsx` row: the `§usage` card's In-season Opp/G line (below the
  section body; QB/RB/WR/TE only; `buildInSeasonPosteriors` one-row call over `currentSeasonTotals` from context;
  the three display states). `market/Market.jsx` row: the Opp shift hover text comes from `oppBeforeAfter`.
- `docs/navigation.md` `ProfileDataContext.jsx` row (line 92) and line 112: nineteen keys, `currentSeasonTotals`
  appended at the end of the list, and line 92's "The last four are P5c's" reworded to name the four P5c keys,
  exactly as in `ProfileDataContext.jsx` (§4; plan-reviewer flag 2).
- `docs/architecture.md` `currentSeasonTotals` state row: display readers are the seam, Market's Model view and
  the pop-up (through `ProfileDataContext`).
- `docs/ui.md` `§usage` subsection: one paragraph for the line (states as in §5).
- `docs/signal-registry.md` rows for receiving and rushing volume: the view-only in-season opportunities are
  rendered by Market's Model view **and** the pop-up, both via `inSeasonEvidence.js`.
- `src/__tests__/inSeasonEvidenceViewOnly.test.js` header (§6.1).

State mechanism, not availability (`docsAvailabilityClaims.test.js`): e.g. "reads `currentSeasonTotals`; renders
`—` with a note when `usableLiveSeason` is false".

No cross-repo registry change: CR-25 pins the definitions, which are unchanged. No data-repo backlog entry.

## 8. Done-definition and hand-back

Per `CLAUDE.md`. `npm test`, `npm run lint` (0), `npm run build` (clean). Smoke: open the app from
`.claude/launch.json`, open a skill player's pop-up, scroll to Usage & efficiency, and report the line's text; on
Market's Model view hover the same player's Opp shift value and confirm the two strings match. If no usable live
season is loaded in the running app, report that the line read `—` with the note, and say the matching check could
not be done live. Open a kicker and confirm no line. Paste `grep -rn "PROVISIONAL(" src/` (unchanged by this
slice). Hand back: commit SHA, files touched, deviations, and per new/changed test what it asserts, the defect it
catches and the red-then-restored evidence.
