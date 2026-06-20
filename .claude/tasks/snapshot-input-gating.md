# Snapshot input-gating — defer the daily snapshot write until lagging projection inputs settle

**Model:** sonnet implements this file exactly. **Status:** implemented (sonnet 2026-06-20).
**Goal:** Stop the once-per-UTC-day projection snapshot from being captured while three
lagging inputs are still null on a warm career load — `collegeStats` + `nflDraftMatches`
(freeze *neutral* college/draft multipliers into rookie projections) and
`priorTeamByPlayer` (freeze a missing vet team-change neutralization) — which
first-write-wins then sticks for the whole day.

---

## Step 0 — race confirmed (do not re-derive; this is the justification)

Both legs of the race hold, so the fix is warranted:

**Leg A — the two rookie multipliers default to neutral (not null/NaN) on null input.**
- `collegeContribution` (`seasonProjection.js:106–152`): `cm = collegeStats?.[playerId]`.
  With `collegeStats` null → `cm` undefined → `collegeBase` stays `1.0`,
  `productionTrendAdjust`/`finalYearAdjust` stay `0.00` → `collegeMult = clamp(1.0,…) = 1.0`
  → `collegeContribution = clamp(1.0, 0.75, 1.25) = 1.0`. **Neutral.**
- `nflDraftMultiplier` (`resolveNflDraftFactor`, `seasonProjection.js:41–69`): with
  `nflDraftMatches` null → `draftMatch = nflDraftMatches?.[playerId] ?? null = null` →
  the `if (!draftMatch)` branch returns `nflDraftMultiplier: 1.0`,
  `nflDraftMatchSource: 'unmatched'`. **Neutral.**
- Both are multiplicative on `projectedPPG` (`seasonProjection.js:169–173`), so a
  snapshot taken in the null window bakes in `×1.0 × 1.0` for rookies — silently wrong,
  not detectably-missing.

**Leg B — `seasonProjections` goes non-null before those two resolve on a warm load.**
- `seasonProjections` memo guard (`App.jsx:491`) gates only on
  `careerStats && leagueData?.playerMap && empiricalCurves && positionPeakPPG`. `empiricalCurves`/
  `positionPeakPPG` are a **synchronous** memo off `careerStats` (`App.jsx:171–175`), so
  `seasonProjections` is non-null on the *same commit* `careerStats` lands.
- `collegeStats` is **two async hops + a CFBD/data-store round-trip** behind that:
  `careerStats` → effect `App.jsx:813–823` → `loadCollegeStats()` → `setCollegeMatches` →
  `collegeStats` memo (`App.jsx:209–221`). `nflDraftMatches` is an independent async load
  (effect `App.jsx:826–836`). On a warm (cached) career load `careerStats` returns from
  IndexedDB fast, so the snapshot effect (`App.jsx:559–585`) can fire — gated only on
  `seasonProjections/ktcMap/scoringSettings/careerStats/league_id`, **none of which are
  collegeStats/nflDraftMatches** — before either lands.
- `writeProjectionSnapshot` is first-write-wins-per-UTC-day (`projectionSnapshot.js:215–235`,
  `dateKeyUTC`), so the incomplete write sticks for the whole UTC day.

→ **Race is real** for college/draft (confirmed above); the same defer applies to
`priorTeamByPlayer` (vet team-change — justified in the Design section). Fix = defer the
write until all three load attempts have *settled*.

---

## Design — the settled-state signal (core of the task)

Three lagging inputs are gated: `collegeStats` + `nflDraftMatches` (rookie college/draft
multipliers) and `priorTeamByPlayer` (vet team-change neutralization). We cannot gate on
`<input> != null`: when CFBD / the data store is disabled (college, draft) or no prior
snapshot exists yet (priorTeam), those inputs **legitimately stay null forever**, and the
snapshot must still be written — neutral college/draft and a null prior-team map (→
`isTeamChange` null → no team-change neutralization) are then the correct *permanent*
truths. Disabled / empty-mode behaviour (verified):
- CFBD fully disabled → `loadCollegeStats()` **rejects** (live-API 401 throws,
  `cfbd.js getBulkPlayerStats` step 3) → effect `.catch` → `collegeMatches` stays null.
- Data store disabled → `loadNflDraftPicks()` **resolves** with empty `{year: []}`
  (`nflDraft.js` "store unavailable" branch) → `nflDraftMatches` becomes `{}` (non-null
  but empty). Could also reject on a thrown IDB error.
- No prior snapshot (first-ever session, or any player absent from yesterday's snapshot)
  → `loadPriorSnapshotTeams()` **resolves null** (`projectionSnapshot.js:259`) →
  `priorTeamByPlayer` stays null → every player's `isTeamChange` is null. Could also
  reject on a thrown IDB error.

So the gate must be **"the load attempt settled (resolved *or* rejected)"**, not non-null,
for all three. Implement that as three boolean flags (`collegeSettled` /
`nflDraftSettled` / `priorTeamSettled`) flipped in a `.finally()` on each existing loader
chain. Because the data setter runs in `.then` and the flag flips in `.finally` (which
runs *after* `.then`), the derived state — `collegeStats` / `nflDraftMatches` /
`priorTeamByPlayer`, and therefore the recomputed `seasonProjections` that depends on all
three — is already updated by the time the gate opens. The flag-after-data ordering is
what makes the captured snapshot reflect the resolved inputs.

**priorTeam on the IndexedDB path — ordering holds (verified).** `loadPriorSnapshotTeams`
is faster than the network loaders, but speed does not change the ordering: it is `async`,
so its `.then` and `.finally` run as separate microtasks and `.finally` is chained *after*
`.then`. `setPriorTeamByPlayer` (in `.then`) is therefore always *scheduled* before
`setPriorTeamSettled` (in `.finally`), so React commits the data update in a render no
later than the flag update — the flag cannot open the gate in a render where
`priorTeamByPlayer` is still its pre-resolve value. Reinforcing this, `priorTeamByPlayer`
is already a dep of the `seasonProjections` memo (`App.jsx:523`), so when it commits
`seasonProjections` recomputes *before* `priorTeamSettled` opens the gate. The fast IDB
read cannot beat the data to the gate.

**Settled-null writes a correct projection (verified).** When `priorTeamByPlayer` settles
null, `prevTeam = null` → `isTeamChange = null` (`seasonProjection.js:274–278`). Both
team-change neutralization sites fire only on `isTeamChange === true`:
`shareTrendMultiplier` (`:358`) takes its normal `1.0 + (shareTrendRaw−1)·scale` branch,
and `teamRzShareNeutralized` (`:491–495`) stays false so the computed `teamRzShareFactor`
stands. A legitimate-null session therefore captures the *un-neutralized* projection —
identical to today's no-prior-snapshot behaviour — not a wrongly-neutralized one. The
settled-flag (resolve-or-reject) gate guarantees that session still writes.

No loader can hang the gate: all three are `async` fns that `await` network/IDB calls
(which settle). The college and snapshot effects share the `careerStats + playerMap`
precondition (so if college never fires, neither does the write — no deadlock, nothing
suppressed-that-would-otherwise-fire); the draft and priorTeam effects fire on
`leagueData.playerMap` / mount respectively, earlier.

The gate decision is extracted into a **pure, exported predicate** in
`projectionSnapshot.js` (co-located with the writer it guards) so it is unit-testable in
the existing `projectionSnapshot.test.js` — mirroring the repo's `applyQBQualityModifier`
"extracted from App.jsx for testability" precedent. App.jsx effects have no React test
harness (vitest env is `node`; no `@testing-library` render of `App`), so the *wiring*
(flag flips) is validated by build/lint + the user's manual smoke; the *logic* (the gate)
is fully unit-covered via the helper.

---

## Edits — grouped by file

### File 1 — `src/utils/projectionSnapshot.js` (add one pure export)

Add a new public export **after `writeProjectionSnapshot` (ends `:235`) and before
`loadPriorSnapshotTeams` (`:244`)**. Pure, no I/O — does not touch the mocked cache.

```js
/**
 * Pure precondition gate for the daily snapshot write effect (App.jsx).
 * Returns true only when every projection input that would otherwise be captured
 * NEUTRAL has either produced data or settled (its load attempt resolved/rejected).
 *
 * Gates collegeStats/nflDraftMatches/priorTeamByPlayer on SETTLED-NESS, not non-null:
 * in CFBD/data-store-disabled or no-prior-snapshot sessions those inputs stay null
 * forever and the snapshot must still be written (neutral college/draft and a null
 * prior-team map are the correct permanent truths there).
 * See .claude/tasks/snapshot-input-gating.md.
 *
 * @param {object} args
 * @param {object|null} args.seasonProjections
 * @param {object|null} args.playerMap        leagueData.playerMap
 * @param {Map|null}    args.ktcMap
 * @param {object|null} args.scoringSettings  leagueData.scoringSettings
 * @param {string|null|undefined} args.leagueId
 * @param {object|null} args.careerStats
 * @param {boolean}     args.collegeSettled    loadCollegeStats() has resolved or rejected
 * @param {boolean}     args.nflDraftSettled   loadNflDraftPicks() has resolved or rejected
 * @param {boolean}     args.priorTeamSettled  loadPriorSnapshotTeams() has resolved or rejected
 * @returns {boolean}
 */
export function shouldWriteProjectionSnapshot({
  seasonProjections,
  playerMap,
  ktcMap,
  scoringSettings,
  leagueId,
  careerStats,
  collegeSettled,
  nflDraftSettled,
  priorTeamSettled,
}) {
  if (!seasonProjections || !playerMap || !ktcMap || !scoringSettings) return false
  if (!leagueId)   return false
  if (!careerStats) return false
  if (!collegeSettled || !nflDraftSettled || !priorTeamSettled) return false
  return true
}
```

These checks reproduce the effect's existing inline guard (`App.jsx:560–562`) verbatim,
plus the three new settled flags — no behavioural change to the existing preconditions,
only the three added gates.

### File 2 — `src/App.jsx` (state + wiring; no new modules, state stays in App.jsx)

**2a. Import the predicate.** Extend the existing import (`:32`):
```js
import { writeProjectionSnapshot, loadPriorSnapshotTeams, shouldWriteProjectionSnapshot } from './utils/projectionSnapshot'
```

**2b. Add three settled flags** next to the inputs they track. Place `collegeSettled`
beside `collegeMatches` (`:92`), `nflDraftSettled` beside `nflDraftMatches` (`:160`), and
`priorTeamSettled` beside `priorTeamByPlayer` (`:166`):
```js
// loadCollegeStats() has resolved or rejected (CFBD attempt settled) — snapshot-write gate
const [collegeSettled, setCollegeSettled] = useState(false)
```
```js
// loadNflDraftPicks() has resolved or rejected (draft attempt settled) — snapshot-write gate
const [nflDraftSettled, setNflDraftSettled] = useState(false)
```
```js
// loadPriorSnapshotTeams() has resolved or rejected (prior-team attempt settled) — snapshot-write gate
const [priorTeamSettled, setPriorTeamSettled] = useState(false)
```
Initialise **`false`** (not null) — these are tri-state-free booleans.

**2c. Flip `collegeSettled`** in the college load effect (`:813–823`). Add a `.finally`
to the existing chain, guarded by `!cancelled` (Strict-Mode invariant — see CLAUDE.md):
```js
    loadCollegeStats()
      .then(data => {
        if (cancelled) return
        setCollegeMatches(matchCollegeToSleeper(data, leagueData.playerMap))
      })
      .catch(err => console.warn('[cfbd] Load error:', err.message))
      .finally(() => { if (!cancelled) setCollegeSettled(true) })
```

**2d. Flip `nflDraftSettled`** in the draft load effect (`:826–836`), same pattern:
```js
    loadNflDraftPicks()
      .then(picks => {
        if (cancelled) return
        setNflDraftMatches(matchNflDraftToSleeper(picks, leagueData.playerMap))
      })
      .catch(err => console.warn('[nflDraft] Load error:', err.message))
      .finally(() => { if (!cancelled) setNflDraftSettled(true) })
```

**2e. Flip `priorTeamSettled`** in the on-mount prior-snapshot effect (`:257–263`). This
effect currently has **no `.catch`** — add one (parity with the other two loaders; without
it a rejected IDB read would be an unhandled rejection *and* the `.finally` flag-flip would
still leave the rejection unhandled). Then add `.finally`, same flag-after-data ordering:
```js
    loadPriorSnapshotTeams()
      .then(m => { if (!cancelled) setPriorTeamByPlayer(m) })
      .catch(err => console.warn('[priorTeam] Load error:', err.message))
      .finally(() => { if (!cancelled) setPriorTeamSettled(true) })
```
On resolve-null (no prior snapshot) the `.then` still runs (`m = null` →
`setPriorTeamByPlayer(null)`), then `.finally` flips the flag — settled, data committed
first. On reject (IDB error) the `.then` is skipped (`priorTeamByPlayer` stays null) and
`.finally` still flips the flag — settled, neutral. Effect deps stay `[]` (mount-only), so
this flag flips once per session and never resets on a league switch.

**2f. Re-gate the snapshot write effect** (`:559–585`). Replace the three inline guard
lines (`:560–562`) with a single predicate call:
```js
  useEffect(() => {
    if (!shouldWriteProjectionSnapshot({
      seasonProjections,
      playerMap:       leagueData?.playerMap,
      ktcMap,
      scoringSettings: leagueData?.scoringSettings,
      leagueId:        selectedLeague?.league_id,
      careerStats,
      collegeSettled,
      nflDraftSettled,
      priorTeamSettled,
    })) return
    let cancelled = false
    ;(async () => {
      // …unchanged body (:564–583): allSeasons/currentSeason + writeProjectionSnapshot…
    })()
    return () => { cancelled = true }
  }, [seasonProjections, leagueData?.playerMap, ktcMap, leagueData?.scoringSettings,
      selectedLeague?.league_id, playerRowsWithProj, careerStats,
      collegeSettled, nflDraftSettled, priorTeamSettled])
```
The async body below the guard is **unchanged** — the helper guarantees `careerStats`,
`leagueData.playerMap`, `leagueData.scoringSettings`, `selectedLeague.league_id`, `ktcMap`
and `seasonProjections` are all truthy, exactly as the old inline guard did. Add
`collegeSettled, nflDraftSettled, priorTeamSettled` to the dependency array (`:585`) so the
effect re-runs and writes once the flags flip; keep `playerRowsWithProj` (used by the
write body).

**Why no reset-to-false on league switch:** the flags are session-scoped and only ever
flip false→true. On a same-day league switch the day's snapshot already exists, so a
second league's write is a first-write-wins no-op regardless of flag state — stale-true
can only let the gate open *earlier*, never suppress a write. Not resetting is therefore
safe and simpler (a reset risks a deadlock if a re-run loader stalls). This is the same
accepted-edge class as the existing "first-league-of-the-day-wins" limitation.

---

## Scope boundary & deliberate exclusions

The gated set is **three** inputs: `collegeStats`, `nflDraftMatches`, and
`priorTeamByPlayer`. `priorTeamByPlayer` was folded in by explicit user decision (it moves
`projectedPPG` via team-change neutralization, `seasonProjection.js:358` & `:491–495`, and
shares the same captured-stale failure mode). One other lagging async input was assessed
and **excluded**:

- **`ktcHistory` — EXCLUDED (correct).** Feeds only the `ktcHist*` factor family, which is
  **capture-only** and never moves `projectedPPG` (CLAUDE.md capture-only invariant;
  `App.jsx:236`). Capturing it null/stale does not corrupt the graded projection, so
  gating on it would needlessly delay / risk-suppress snapshots. Do **not** add it.

---

## Docs updates

- **`docs/integrations.md` → "Projection snapshots" (`:358–370`).** Edit the opening
  sentence (`:360`) and add one paragraph after it.
  - Before (`:360`): *"Once per UTC day, after the season projection pipeline
    (`seasonProjections`) produces its final rows, the app writes a snapshot to IndexedDB
    under the key `projection-snapshots/<YYYY-MM-DD>`."*
  - After (`:360`): *"Once per UTC day, after the season projection pipeline
    (`seasonProjections`) produces its final rows **and the lagging projection inputs (CFBD
    college stats, nflverse draft picks, the prior-snapshot team map) have settled**, the
    app writes a snapshot to IndexedDB under the key `projection-snapshots/<YYYY-MM-DD>`."*
  - Add a new paragraph immediately after it:
    > **Input-settled gate (warm-load race).** `seasonProjections` goes non-null as soon
    > as `careerStats` + age curves exist, but three inputs arrive later over async loads
    > and each defaults to a *neutral* result when null: `collegeStats` and
    > `nflDraftMatches` (CFBD / data-store) → the rookie multipliers
    > `collegeContribution` / `nflDraftMultiplier` = 1.0, and `priorTeamByPlayer`
    > (prior-snapshot IDB read) → `isTeamChange` null → no vet team-change neutralization.
    > On a warm (cached) career load the write would otherwise fire — and be frozen for
    > the whole UTC day by first-write-wins — before those land, baking neutral
    > college/draft and a missing team-change signal into that day's snapshot. The write
    > effect therefore gates on three `*Settled` flags (`collegeSettled` /
    > `nflDraftSettled` / `priorTeamSettled`) that flip once each load attempt *resolves or
    > rejects* — **settled, not non-null** — so sessions where those inputs legitimately
    > stay null forever (CFBD / data-store disabled; no prior snapshot yet) still write,
    > because neutral college/draft and a null prior-team map are then the correct
    > permanent truths. The gate predicate is the pure `shouldWriteProjectionSnapshot` in
    > `projectionSnapshot.js`. The snapshot schema is unchanged — only the write *timing*
    > moved.

- **`docs/projection.md` → "Rookie path" (`:92`).** Append one sentence to the section
  intro, after the formula block (after `:100`, the baselines line):
  > Because `collegeContribution` and the D1 `nflDraftMultiplier` both fail closed to a
  > neutral 1.0 when `collegeStats` / `nflDraftMatches` are null, the daily projection
  > snapshot defers its write until those load attempts settle so rookies aren't captured
  > with neutral college/draft inputs — see integrations.md → *Projection snapshots →
  > Input-settled gate*.

- **`docs/projection.md` → "Team-change handling (offseason)" (`:44`).** Append one
  sentence to the end of the Detection bullet list (after `:51`, the "Brand-new installs"
  bullet):
  > - **Snapshot timing:** because `isTeamChange` is null (no neutralization) until
  >   `loadPriorSnapshotTeams` resolves, the daily snapshot write defers until that read
  >   settles (`priorTeamSettled`) — so a warm career load doesn't freeze a
  >   missing-team-change projection for the day. A legitimately-null read (first-ever
  >   session) still settles and writes the correct un-neutralized projection. See
  >   integrations.md → *Projection snapshots → Input-settled gate*.

- **`docs/architecture.md` → "State management" table (`:44–59`).** Add three rows (place
  near the related inputs):
  | State | Type | Purpose |
  |---|---|---|
  | `collegeSettled` | `boolean` | `false` until `loadCollegeStats()` resolves/rejects; gates the daily snapshot write so rookie college inputs aren't captured neutral |
  | `nflDraftSettled` | `boolean` | `false` until `loadNflDraftPicks()` resolves/rejects; gates the daily snapshot write so rookie draft inputs aren't captured neutral |
  | `priorTeamSettled` | `boolean` | `false` until `loadPriorSnapshotTeams()` resolves/rejects; gates the daily snapshot write so vet team-change neutralization isn't captured missing |

- **`CLAUDE.md` — no required change.** No module is added/renamed/removed (a new *export*
  on the already-listed `projectionSnapshot.js` doesn't change its one-line responsibility),
  no command changes, no schema/factors/invariant change, and "App.jsx owns all state" is
  preserved (the three flags stay in App.jsx). *Optional* micro-edit: the `projectionSnapshot.js`
  row in the src/utils table (mentions "Snapshot and load ephemeral projection inputs…")
  could gain "+ `shouldWriteProjectionSnapshot` write-gate predicate"; skip per "keep this
  file thin" unless you're already touching that row.

- **`docs/signal-registry.md` — no change.** This task adds/removes/reclassifies no signal
  or factor and changes no reconstructable-vs-ephemeral status; it only changes *when* the
  snapshot is written. The registry governs signal classification, not write timing.

---

## Tests to add

All in the **existing** `src/utils/projectionSnapshot.test.js` (co-located unit; it
already imports from `./projectionSnapshot.js` and mocks `./cache`). Add the import of
`shouldWriteProjectionSnapshot` and a new `describe('shouldWriteProjectionSnapshot', …)`
block. The predicate is pure — no cache, no async, no React. Use a small `base()` helper
returning a fully-satisfied args object, then override one field per case.

`base()` = `{ seasonProjections: { P1: { projectedPPG: 10 } }, playerMap: { P1: { team: 'SF' } },
ktcMap: new Map(), scoringSettings: { rec: 1 }, leagueId: 'L1', careerStats: { 2025: {} },
collegeSettled: true, nflDraftSettled: true, priorTeamSettled: true }`.

| Case | Override | Expect | Why |
|---|---|---|---|
| normal cold load — all present, all three settled | (none) | `true` | happy path |
| **warm load, college unsettled** | `collegeSettled: false` | `false` | core bug-fix: defer until CFBD settles |
| **warm load, draft unsettled** | `nflDraftSettled: false` | `false` | core bug-fix: defer until draft settles |
| **warm load, priorTeam unsettled** | `priorTeamSettled: false` | `false` | even on a fast warm career load, defer until the prior-team IDB read settles |
| all three unsettled | `collegeSettled:false, nflDraftSettled:false, priorTeamSettled:false` | `false` | defer |
| **disabled / legitimate-null — all settled, data absent** | `collegeSettled:true, nflDraftSettled:true, priorTeamSettled:true` (predicate takes the *flags*, not the data; assert `true` even though college/draft never arrived **and** the prior-team read resolved null) | `true` | must-not-suppress constraint — CFBD/data-store-disabled **and** first-ever / no-prior-snapshot sessions still write |
| no seasonProjections | `seasonProjections: null` | `false` | preserves existing precondition |
| no ktcMap | `ktcMap: null` | `false` | preserves existing precondition |
| no scoringSettings | `scoringSettings: null` | `false` | preserves existing precondition |
| no playerMap | `playerMap: null` | `false` | preserves existing precondition |
| no leagueId | `leagueId: undefined` | `false` | preserves existing precondition |
| no careerStats | `careerStats: null` | `false` | preserves existing precondition |

**Not unit-tested (by design):** the App.jsx effect wiring (the three `.finally` flag
flips and the re-gated effect). The repo has no React/effect test harness (vitest `node`
env, no `@testing-library` App render); do **not** add one for this. The flag-flip wiring
is covered by `npm run build` / `npm run lint` + the user's manual smoke, per the
workflow's "visual/runtime verification is the user's job" rule. No contract test
(`factorsSchema`/`statKeysContract`) is affected — `seasonProjection.js` is untouched (the
neutral-default behaviour at `:358` / `:491` it relies on already exists).

---

## Cross-repo impact

**None.** The snapshot envelope and `players[*].projection` shape are **unchanged** — this
task changes only the *write timing/gating*, not the schema (`schemaVersion` stays 2). The
`isTeamChange` / `prevTeam` / `newTeam` factor keys already exist (additive, no bump — see
CLAUDE.md "Snapshot shape"); folding in `priorTeamByPlayer` only makes them captured
*correct*, it adds no key. The `sleeper-dashboard-data` grading harness consumes the
identical fields. The only *observable* downstream effect is that captured projections now
reflect resolved inputs instead of neutral defaults — more-correct **rookie** college/draft
multipliers and a present-vs-missing **vet** team-change signal — i.e. better *values* in
the same *shape*. No data-repo change is required; nothing to coordinate. (Confirms the
expected "none" — the CLAUDE.md "Snapshot shape" cross-repo bullet is not touched.)

---

## Done checklist (sonnet)

1. Implement File 1 + File 2 — all three flags (college + draft + priorTeam).
2. Add the `shouldWriteProjectionSnapshot` tests above; `npm test` green.
3. Apply the Docs updates (integrations.md, projection.md ×2, architecture.md). CLAUDE.md /
   signal-registry.md: no change.
4. `npm run lint` → 0 problems. `npm run build` → clean, no warnings.
5. Do **not** start the dev server / smoke — hand back for the user's manual warm-load
   check (load a league; confirm the snapshot is written only after the CFBD / draft /
   prior-team console loads log; confirm a CFBD-disabled session and a first-ever-snapshot
   session both still write).
