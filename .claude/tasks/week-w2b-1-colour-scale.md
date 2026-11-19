# Brief W2b-1 — This week colour scale: league-starter percentiles, season-grid recolour, legend, season total

**Status:** planning artifact (Session 1, opus). This session edited no source or doc files.
**Review depth: full — new Sleeper read (prior-season league + matchups) and new App.jsx state/memos, a `leagueData` shape change, new pure modules, and new `@theme` tokens.**
**Session 2:** sonnet, effort medium. Runs the app from `.claude/launch.json` (`sleeper-dashboard`) for the visual check (§9), stops it when done.
Planned against live source at app HEAD `5fa8479`. Every anchor below was read at `5fa8479`.
**Revisions (2026-11-19):** R1 and R2 answer plan-reviewer rounds 1–2 (log:
`.claude/reviews/week-w2b-1-colour-scale.plan-reviewer.md`). R2 moved the Questionable chip to its own
slice, `.claude/tasks/week-w2b-1q-questionable-chip.md`.

**Design source.** `ux-briefs-week-and-myteam.md` §4/§6 lives in the Claude.ai project, **not on disk** —
this plan works from the 2026-11-19 handoff brief's restatement of §6 (stops, missed/bye colours,
legend, season total; the Q chip is in W2b-1q). The W2b outline at the bottom of
`week-w2a-lineup-matchup-layout.md` ("discrete stated steps") is **superseded** on colour by this
file. W2a's phone scroll window, edge shade and PROJ-scrolls-away behaviour are not reopened.

---

## Decisions recorded

**D1 — Pool.** Per position: every `(player, week)` in a **filled starting slot** of **any** roster
(all 12), completed weeks only (`week ≤ nflState.week − 1`, the matchups loop's bound), **and the
player played**. Unweighted. Position = `playerMap[id].position`, never the slot. Membership ignores
`matchup_id` (a `null`-id roster — OI-1's playoff byes — still set a lineup).

**D2 — "Did not play" detection = the grid's own `played` test.** A starter-week enters the pool iff
that week's Sleeper stat row has `stats.gp === 1` — the predicate `weeklySeasonGrid.js:52` uses for
a `played` cell. Rows come from App.jsx's existing `defenceWeeklyByYear[season]` (`dataSeason` in
full + the live season's completed weeks; same cache keys `/week` reads). That loader keeps only
QB/RB/WR/TE + `TEAM_` rows, so K/DEF starters are excluded by construction (this league has no K/DEF
slot). A failed week contributes nothing. No new stat fetch.

**D3 — Points basis = our own league scoring, not `starters_points`.** Each sample is
`calculateFantasyPoints(row.stats, leagueData.scoringSettings)` — the function and settings behind the
cell's own number (`weeklySeasonGrid.js:53`), so a cell is ranked on the arithmetic that produced it.
`starters_points` is not read; matchups give only **who started**. The 2025 fallback is scored with
the current league's settings, as `defenceAllowed`'s prior half is (`App.jsx:792–802`).

**D4 — Threshold and fallback.** `MIN_POOL_SAMPLES = 60` per position. Why 60: the 20th-percentile
cut-off's sampling error is ≈ √(0.2·0.8/60) ≈ 5 percentile points, a quarter of one 20-point legend
band. TE (~12–20 starter-weeks a week) crosses 60 around week 4–5, others sooner. Per position, all-or-nothing: a position
with live `n < 60` uses the **prior season's pool for that position entirely** (no blending); others
stay live. Prior season = `selectedLeague.previous_league_id`'s league (2025, `1253804638616956928`),
its regular-season weeks `1 .. settings.playoff_week_start − 1` (fall back to `1..14` if that field
is not a positive integer). The prior pool is usable only if `defenceWeeklyByYear[priorLeagueSeason]`
is `complete` **and** its `year === priorLeagueSeason` (it is loaded iff that season is `dataSeason`).
Below threshold **and** no usable prior pool → that position has **no basis** (§6c); it does not
fall back to a thin live pool.

**D5 — Where it is built: App.jsx.** League-wide domain data that My Team (M3) will also need →
App.jsx state/memos passed as a prop (App.jsx-owns-state invariant), not a `/week` hook. The existing
`weeklyScores` matchups loop (986–1006) keeps starters; the prior read is a new App.jsx effect; logic
lives in two pure utils.

**D6 — Fetch the prior season only when needed, and only once the live pool is known.** `needsPrior`
is computed only after the live pool has **resolved** (`isLivePoolResolved`, §1): `leagueData` and
`careerStats` present, and either the live season has no entry in `defenceLoadPlan` (offseason /
week 1 — nothing to wait for) or `defenceWeeklyByYear[live]` has arrived (complete or not). Before
that, `needsPrior` is `false` and the basis is `pending`, so a boot at week 11 never fires the
prior read. Cost when it does fire: one `getLeague` (60-min TTL) + ≤ 14 `getMatchups`
(completed-week TTL, 1 week — `currentNflWeek = 0`).

**D6b — Basis status.** `resolvePercentileBasis` returns `status: 'pending' | 'ready'`. `pending` when
the live pool is unresolved, or when `needsPrior` and the prior read is still `idle`/`loading`.
`pending` too when the prior read is `loaded` but its season's stat rows have not arrived yet
(`isPriorRowsPending`, §1 — the defence effect loads them in parallel). `ready` otherwise (including
prior `failed` or `unavailable` — no `previous_league_id`). SeasonGrid
renders `pending` as loading (§6e), never as "no basis".

**D7 — Colour mapping.** `p ∈ [0,1]` → **linear sRGB interpolation** between six stops at
`p = 0, .2, … 1`: `#2A1B4D, #3B3F86, #22708A, #25A07A, #5FD06A, #C2F59A`. Measured in planning (1,001
samples): unrounded output is strictly non-decreasing in luminance (0.018 → 0.791); integer rounding
adds tiny dips, so T12 tests unrounded channels. Ink = whichever of **pure `#000000`/`#ffffff`** has
higher contrast — worst 4.586:1 at p ≈ 0.474; `dp-canvas` `#07080b` gives 4.48:1 there, so no dp text token.

**D8 — Percentile of a value.** Mid-rank: `p = (count(< v) + 0.5·count(= v)) / n`, clamped `[0,1]`.
Legend cut-offs: linear-interpolated quantiles (type 7: `h = (n−1)·q`) at q = .2/.4/.6/.8, printed
`Math.round`ed.

**D9 — Special cells.** Missed (`dnp`) = solid `#E24B4A`, no text. Bye = `#E8E6E0` with `#B4B2A9`
45° stripes, no text. `projected`/`future`/`unknown` stay **unfilled** as today, so no neutral cell
reads as a scale colour. A played cell with no (or pending) basis = flat `dp-chip` (§6c).

**D10 — moved.** The Questionable chip is slice W2b-1q (see Revision 2).

**D11 — Season total column** right of week 18: `"<round(total)> · <games>"` over `played` cells
only. Zero played games → `—`.

---

## Touch list

| File | Change |
|---|---|
| `src/utils/starterPercentiles.js` | **new**, pure — pool, threshold/fallback resolution, percentile, cut-offs (§1) |
| `src/utils/percentileColour.js` | **new**, pure — stops, interpolation, luminance, contrast, ink (§2) |
| `src/index.css` | new `@theme` tokens + one `@utility` (§3) |
| `src/App.jsx` | matchups loop keeps starters; `leagueData.starterWeeks`; prior-season state + effect; two memos; prop to `WeekView` (§4) |
| `src/components/week/WeekView.jsx` | pass `percentileBasis` through to `SeasonGrid` (§5) |
| `src/utils/weeklySeasonGrid.js` | rows carry `position`; rows carry `seasonTotal` (§6a) |
| `src/components/week/SeasonGrid.jsx` | recolour, special cells, legend, season-total column (§6) |
| tests | §8 |
| docs | §10 |

Nothing in projection, scoring, `factors`, snapshots or the data repo; no cross-repo entry.

### Copied definitions

1. **Scale stops** — the six hex values exist in `index.css` (`--color-dp-scale-0..5`, render-side:
   legend gradient) and in `percentileColour.js`'s `SCALE_STOPS` (compute-side: interpolation,
   contrast). Equality test T13 reads `src/index.css` and asserts each token equals `SCALE_STOPS[i]`
   (case-insensitive). Original = `index.css`.
2. **Ink colours** — `--color-dp-scale-ink-dark`/`-light` vs `SCALE_INK = { dark: '#000000', light: '#ffffff' }`.
   Same test T13.

No other copy. `MIN_POOL_SAMPLES`, `LEGEND_POSITIONS` are defined once. The cell title's ordinal is
**imported** from `src/utils/environment.js`'s exported `ordinal` (line 188) — not re-written.

---

## §1 `src/utils/starterPercentiles.js` (new, pure, view-only)

Header comment: view-only; nothing here reaches projection, scoring or a dynasty value; the pool
depends on `filterDefenceInputRows` (src/api/defenceWeekly.js) keeping QB/RB/WR/TE rows. Imports
`calculateFantasyPoints` (`./fantasyPoints`), `isFilledSlotId` (`./rosterSlots`), and
`defenceLoadPlan` (`./opponentStrength`), `deriveDataSeason` (`./environment`) only — the same
sources App.jsx imports them from (App.jsx:28–29).

```js
export const MIN_POOL_SAMPLES = 60
export const LEGEND_POSITIONS = ['QB', 'RB', 'WR', 'TE']   // display order and the needsPrior check set

// matchups: Sleeper matchup entries for ONE week (all rosters). -> string[] of filled starter ids
// ('0' / null / '' dropped via isFilledSlotId). Ignores matchup_id entirely (D1).
export function startersFromMatchups(matchups)

// starterWeeks: [{ week, ids: string[] }]; weeklyResult: a loadDefenceWeeklyRows result
// ({ year, weeks: [{week, rows}], failedWeeks, complete }); throughWeek: last completed week.
// -> { [position]: number[] } each sorted ascending. Per (week, id): skip week > throughWeek; skip if
// weeklyResult has no entry for that week; row = rows[id]; skip unless row?.stats?.gp === 1; position =
// playerMap[id]?.position, skip if absent; push calculateFantasyPoints(row.stats, scoringSettings ?? {}).
// weeklyResult not complete -> {}.
export function buildStarterPool({ starterWeeks, weeklyResult, playerMap, scoringSettings, throughWeek })

// true iff leagueData and careerStats are non-null AND (the live season — parseInt(nflState.season) —
// has no entry in defenceLoadPlan({ dataSeason: deriveDataSeason(careerStats), nflState }), OR
// defenceWeeklyByYear[live] != null). nflState null -> false.
export function isLivePoolResolved({ leagueData, careerStats, nflState, defenceWeeklyByYear })

// priorStatus: 'idle' | 'loading' | 'loaded' | 'failed' | 'unavailable'.
// -> { status: 'pending'|'ready', basis: { [pos]: { values, n, season, source: 'live'|'prior' } | null },
//      needsPrior: boolean, liveSeason, priorSeason }
// liveResolved false -> { status: 'pending', basis: {}, needsPrior: false, … }.
// Otherwise, for each pos in LEGEND_POSITIONS only (K, DEF … have no basis: absent key):
//   live n >= MIN -> live; else prior pool for pos with n >= MIN -> prior; else null.
// needsPrior = some LEGEND_POSITIONS pos has live n < MIN. `prior` may be null (not loaded / unavailable).
// A prior pos with n < MIN is NOT used (null) — same threshold both sides.
// status = 'pending' if needsPrior && (priorStatus is 'idle' or 'loading', or priorRowsPending); else 'ready'.
export function resolvePercentileBasis({ live, prior, liveSeason, priorSeason, liveResolved, priorStatus, priorRowsPending = false, minSamples = MIN_POOL_SAMPLES })

// true iff priorStarterWeeks.status === 'loaded', its season is a finite number, careerStats and
// nflState are non-null, that season has an entry in defenceLoadPlan({ dataSeason:
// deriveDataSeason(careerStats), nflState }), and defenceWeeklyByYear[season] == null (planned, not
// yet arrived). A season with no plan entry will never load -> false (resolves ready, no basis).
export function isPriorRowsPending({ priorStarterWeeks, careerStats, nflState, defenceWeeklyByYear })

export function percentileOf(sortedValues, v)          // D8 mid-rank; empty/null input -> null
export function quantile(sortedValues, q)              // D8 type 7; empty -> null
export function percentileCutoffs(sortedValues)        // [q.2, q.4, q.6, q.8]
```

`throughWeek` is applied inside too (defence in depth: the live week's matchups show zeros).

## §2 `src/utils/percentileColour.js` (new, pure)

```js
export const SCALE_STOPS = ['#2A1B4D', '#3B3F86', '#22708A', '#25A07A', '#5FD06A', '#C2F59A']
export const SCALE_INK = { dark: '#000000', light: '#ffffff' }
export function hexToRgb(hex)                 // -> { r, g, b } 0..255
export function scaleRgb(p)                   // clamp p to [0,1]; segment s = min(4, floor(p*5)); UNROUNDED channels
export function scaleCss(p)                   // `rgb(R, G, B)` — integers, COMMA form (jsdom's CSSStyleDeclaration parses it; the space form may be dropped)
export function relativeLuminance({ r, g, b }) // WCAG 2.x
export function contrastRatio(l1, l2)
export function scaleInk(p)                   // SCALE_INK.dark or .light, whichever has higher contrast vs scaleRgb(p)
```

## §3 `src/index.css`

Add inside `@theme`, after the `--color-dp-accent*` block (single values — dark-only, do not touch the
`.dark` block):

```css
  /* W2b-1 — league-starter percentile scale (bottom of starters → top). Copied in
     src/utils/percentileColour.js SCALE_STOPS / SCALE_INK — equality-tested (percentileColour.test.js). */
  --color-dp-scale-0: #2A1B4D;
  --color-dp-scale-1: #3B3F86;
  --color-dp-scale-2: #22708A;
  --color-dp-scale-3: #25A07A;
  --color-dp-scale-4: #5FD06A;
  --color-dp-scale-5: #C2F59A;
  --color-dp-scale-ink-dark:  #000000;
  --color-dp-scale-ink-light: #ffffff;
  --color-dp-missed:      #E24B4A;  /* did not play — solid, no text */
  --color-dp-bye:         #E8E6E0;  /* bye base */
  --color-dp-bye-stripe:  #B4B2A9;  /* bye hatch */
```

Outside `@theme`, add a Tailwind v4 utility:

```css
@utility bg-dp-bye-hatch {
  background-color: var(--color-dp-bye);
  background-image: repeating-linear-gradient(45deg, var(--color-dp-bye-stripe) 0 1.5px, transparent 1.5px 4px);
}
```

## §4 `src/App.jsx`

**4a. Matchups loop (lines 986–1006).** Inside the existing per-week loop, before/independent of the
`matchup_id` grouping, push `{ week, ids: startersFromMatchups(allMatchups[i]) }` onto a new
`starterWeeks` array (declared beside `weeks`/`weeklyScores`). Do **not** change the grouping or the
`pair.length !== 2` logic — OI-1 is a separate slice; if OI-1 lands first, rebase onto it and keep its
guard. Add `starterWeeks` to the `setLeagueData({...})` object (line 1064).

**4b. State and ref** (beside `defenceWeeklyByYear`, line 209):
`const [priorStarterWeeks, setPriorStarterWeeks] = useState({ status: 'idle', leagueId: null, season: null, starterWeeks: [] })`
and `const priorStartersRequestedFor = useRef(null)` (add `useRef` to the React import — absent today, App.jsx:1).
**Do not** add either to the league-switch reset cascade (line 950): the state carries its `leagueId`
and every reader gates on it (§4c), so another league's state is ignored, and re-selecting the same
league keeps its loaded result instead of resetting state while the ref still says "requested"
(the round-2 stuck-pending defect).

**4c. Live pool + basis memos** (after the `defenceAllowed` memo, line 802; do not name either with
the substring `defenceAllowed` — `opponentStrengthViewOnly.test.js` pins that identifier's lines):

```js
// W2b-1 — view-only. League starters' weekly points by position (starterPercentiles.js), the basis
// SeasonGrid colours against. Not part of the playerRows chain.
const liveStarterPool = useMemo(() => {
  const live = nflState?.season != null ? parseInt(nflState.season, 10) : null
  if (!leagueData || live == null) return {}
  return buildStarterPool({
    starterWeeks: leagueData.starterWeeks ?? [], weeklyResult: defenceWeeklyByYear[live],
    playerMap: leagueData.playerMap, scoringSettings: leagueData.scoringSettings ?? {},
    throughWeek: Math.max(0, (nflState.week ?? 0) - 1),
  })
}, [leagueData, nflState, defenceWeeklyByYear])

const priorStarterPool = useMemo(() => {
  if (priorStarterWeeks.status !== 'loaded' || !leagueData) return null
  if (priorStarterWeeks.leagueId !== (selectedLeague?.league_id ?? null)) return null
  const r = defenceWeeklyByYear[priorStarterWeeks.season]
  if (!r?.complete || r.year !== priorStarterWeeks.season) return null
  return buildStarterPool({
    starterWeeks: priorStarterWeeks.starterWeeks, weeklyResult: r,
    playerMap: leagueData.playerMap, scoringSettings: leagueData.scoringSettings ?? {},
    throughWeek: 18,
  })
}, [priorStarterWeeks, selectedLeague, leagueData, defenceWeeklyByYear])

const starterPercentiles = useMemo(() => {
  const leagueId = selectedLeague?.league_id ?? null
  const priorStatus = !selectedLeague?.previous_league_id ? 'unavailable'
    : priorStarterWeeks.leagueId === leagueId ? priorStarterWeeks.status : 'idle'
  return resolvePercentileBasis({
    live: liveStarterPool, prior: priorStarterPool,
    liveSeason: nflState?.season != null ? parseInt(nflState.season, 10) : null,
    priorSeason: priorStarterWeeks.season,
    liveResolved: isLivePoolResolved({ leagueData, careerStats, nflState, defenceWeeklyByYear }),
    priorStatus,
    priorRowsPending: priorStatus === 'loaded'
      && isPriorRowsPending({ priorStarterWeeks, careerStats, nflState, defenceWeeklyByYear }),
  })
}, [selectedLeague, liveStarterPool, priorStarterPool, nflState, priorStarterWeeks, leagueData, careerStats, defenceWeeklyByYear])
const starterNeedsPrior = starterPercentiles.needsPrior
```

**4d. Prior-season effect** (after the defenceWeekly effect, ~line 1204). Deps exactly
`[selectedLeague, starterNeedsPrior]` — it reads no state, so `exhaustive-deps` is satisfied; the
ref is the de-dupe guard, not state. **No setState runs synchronously in the effect body**
(`react-hooks/set-state-in-effect`, cf. App.jsx:1212) — every setter is inside the async function.

```js
// W2b-1 — view-only. The prior league's regular-season starters, read only when some position's live
// starter pool is below MIN_POOL_SAMPLES (starterPercentiles.js). The ref de-dupes per league; the
// cleanup releases it if the read was abandoned, so Strict Mode's second run (or a later need) refetches.
useEffect(() => {
  const leagueId = selectedLeague?.league_id ?? null
  const prevId = selectedLeague?.previous_league_id ?? null
  if (!starterNeedsPrior || !leagueId || !prevId) return
  if (priorStartersRequestedFor.current === leagueId) return
  priorStartersRequestedFor.current = leagueId
  let cancelled = false
  let settled = false
  async function load() {
    setPriorStarterWeeks({ status: 'loading', leagueId, season: null, starterWeeks: [] })
    try {
      const prev = await getLeague(prevId)
      const season = parseInt(prev?.season, 10)
      const pws = prev?.settings?.playoff_week_start
      const last = Number.isInteger(pws) && pws > 1 ? pws - 1 : 14
      const weeks = Array.from({ length: last }, (_, i) => i + 1)
      const results = await Promise.allSettled(weeks.map(w => getMatchups(prevId, w, 0)))
      const starterWeeks = []
      results.forEach((r, i) => { if (r.status === 'fulfilled') starterWeeks.push({ week: weeks[i], ids: startersFromMatchups(r.value) }) })
      if (starterWeeks.length === 0) throw new Error('no prior-season matchup week loaded')  // a total miss is a failure, so re-select retries
      settled = true
      if (!cancelled) setPriorStarterWeeks({ status: 'loaded', leagueId, season: Number.isFinite(season) ? season : null, starterWeeks })
    } catch (err) {
      // A failed read is released like an abandoned one, so re-selecting the league retries it.
      if (priorStartersRequestedFor.current === leagueId) priorStartersRequestedFor.current = null
      settled = true
      console.warn('[priorStarters] Load error:', err.message)
      if (!cancelled) setPriorStarterWeeks({ status: 'failed', leagueId, season: null, starterWeeks: [] })
    }
  }
  load()
  return () => {
    cancelled = true
    if (!settled && priorStartersRequestedFor.current === leagueId) priorStartersRequestedFor.current = null
  }
}, [selectedLeague, starterNeedsPrior])
```

Why this cannot stick: an abandoned or failed read releases the ref, so the next run with
`starterNeedsPrior` true refetches; a loaded read keeps ref and state, so re-selecting that league
reuses it; a stale `'loading'` only matters while `needsPrior` is true, which re-runs the effect.
`needsPrior` waits for `isLivePoolResolved` (D6), so a week-11 boot never fires it.
If Session 2 finds any lint error with this shape, stop and report — do not add an eslint-disable.
`prev.season` not finite → `season: null` → `priorStarterPool` returns null (no `defenceWeeklyByYear[null]`).
No `previous_league_id` → the effect never fires; `priorStatus` is `'unavailable'` → `ready`.

**4e.** `/week` route (line ~1492): add `percentileBasis={starterPercentiles}` to `<WeekView>`.

## §5 `src/components/week/WeekView.jsx`

New prop `percentileBasis = null`; pass to `<SeasonGrid percentileBasis={percentileBasis} />` (line 198).

## §6 SeasonGrid

**6a. `weeklySeasonGrid.js`.** `buildSeasonGrid` rows gain `position: player.position ?? null` and
`seasonTotal: { points, games }` where `games` = count of `played` cells and `points` = sum of their
`points` (unrounded). Update the JSDoc return type. No other change to cell resolution.

**6b. `SeasonGrid.jsx` groups.** Each group player carries `position` (`r.position` for lineup rows,
`p.position` for reserve). Props gain `percentileBasis = null` (the `resolvePercentileBasis` object). `null` or
`status === 'pending'` → **loading** state (§6e); `status === 'ready'` → per-position basis.

**Element placement (fixes today's split, SeasonGrid.jsx:129–134).** The `<td>` keeps `data-testid`
and `data-kind` and gains `data-pct` (scaled played cells only). The inner `<div>` carries the fill:
classes, inline `style`, `role`, `aria-label`, `title`. Tests select the `<td>` by test id and read
the fill from `.firstElementChild`.

**6c. Cell rendering.** Remove `cellClass`'s dp-up path, `MIN_INTENSITY`, `playedCellStyle` and the
`maxPlayedPoints` loop. Per kind:

| kind | fill | text | attributes |
|---|---|---|---|
| played, basis for row position | `style.backgroundColor = scaleCss(p)`, `style.color = scaleInk(p)` where `p = percentileOf(basis.values, cell.points)` | `points.toFixed(0)` | `title="<pts.toFixed(1)> pts · <round(p·100)>th pct of <POS> starters (<season>)"`; `data-pct` = `round(p·100)` |
| played, basis pending (loading) | class `bg-dp-chip`, text `text-dp-text-2` | `points.toFixed(0)` | `title="<pts> pts"` — no tag: the data is loading, not missing |
| played, ready but no basis for POS | class `bg-dp-chip`, text `text-dp-text-2` | `points.toFixed(0)` | `title="<pts> pts · no <POS> basis yet"`; `// PROVISIONAL(no-data): played cell with no percentile basis · fewer than MIN_POOL_SAMPLES league-starter weeks at this position and no usable prior-season pool · a season reaching the threshold, or the prior league's matchups loading` |
| dnp | class `bg-dp-missed` | none | `role="img"`, `aria-label="Did not play"`, `title="Did not play"` |
| bye | class `bg-dp-bye-hatch` | none | `role="img"`, `aria-label="Bye"`, `title="Bye"` |
| projected | unchanged (`border border-dp-border-raised`, no fill) | unchanged | — |
| future | unchanged (`border border-dp-border`) | none | — |
| unknown | unchanged (nothing) | none | existing PROVISIONAL tag stays |

The number span keeps `font-dp-mono text-[9px]`; its colour comes from the cell's inline `color` on
scaled cells (drop `text-dp-text-2` there so the ink wins). The ordinal in the title is
`ordinal(round(p·100))` imported from `../../utils/environment` — no local helper.

**6d. Season total column.** Header `SEASON` after week 18 (`text-right px-2`, same mono style);
body cell `data-testid="grid-total-<id>"`, text `${Math.round(points)} · ${games}` or `—` when
`games === 0`. Divider rows' `colSpan` becomes `SEASON_WEEKS + 2`.

**6e. Legend** (replace the footer's single sentence; keep that sentence as the last line).
`data-testid="grid-legend"`:
1. A 120×8px bar, `background: linear-gradient(to right, var(--color-dp-scale-0) 0%, var(--color-dp-scale-1) 20%, … var(--color-dp-scale-5) 100%)`, labelled left `bottom of starters`, right `top`.
2. One line per position in `LEGEND_POSITIONS` that has a basis: `data-testid="legend-cutoffs-<POS>"`,
   text `QB: 12 / 16 / 21 / 26 pts` (`percentileCutoffs`, rounded). Position with no basis:
   `TE: no basis yet`.
3. Basis line `data-testid="legend-basis"`, exactly one of (B = positions in `LEGEND_POSITIONS`
   with a non-null basis; prior-sourced positions also get `· <priorSeason>` appended to their
   cut-off line):
   - B empty → `No league-starter basis yet`
   - all of B live → `Basis: <liveSeason> league starters`
   - all of B prior → `Basis: <priorSeason> league starters (<liveSeason> has fewer than <MIN_POOL_SAMPLES> starter-weeks per position)`
   - mixed → `Basis: <liveSeason> league starters; <prior POS list, comma-joined> use <priorSeason> until <MIN_POOL_SAMPLES> starter-weeks`
4. Two swatches: missed (`bg-dp-missed`) `Did not play`, bye (`bg-dp-bye-hatch`) `Bye`.
**Loading** (`percentileBasis == null` or `status === 'pending'`): lines 2–3 are replaced by one line
`data-testid="legend-basis"` = `Loading the league-starter basis…`; the bar and swatches still render;
played cells use the pending row of the §6c table.

## §8 Tests

Each states the fixture fact that makes its red step bite; Session 2 shows each red then restores.

**`src/utils/starterPercentiles.test.js`** (new)
- **T1 bench excluded** — fixture: roster A `starters: ['p1','0']`, `players: ['p1','p2']`; p2 has a
  played row. Asserts pool contains only p1's points; fails if `players` is read instead of `starters`
  (red: read `m.players`).
- **T2 `'0'` slot excluded** — `startersFromMatchups([{ starters: ['0','p1', null, ''] }])` → `['p1']`;
  fails if the filter is dropped (red: return `m.starters` unfiltered).
- **T3 DNP starter excluded** — p1 started weeks 1 and 2; week-2 row `stats.gp: 0` with 0 points, p3 absent from rows.
  Asserts pool length 1; fails if a 0 is pushed for a non-`gp===1` row (red: drop the gp check).
- **T4 live week excluded** — starterWeeks includes week 11 with a played row; `throughWeek: 10`.
  Asserts week-11 points absent; red: remove the `week > throughWeek` skip.
- **T5 position from playerMap** — (`starterWeeks` carries ids only, so slot-vs-player cannot be
  miswired in `buildStarterPool`; this test plus T2 cover "TE in FLEX".) Fixture: p1 is `playerMap` TE and started in
  the FLEX index of `starters`; p9 is played but absent from `playerMap`. Asserts `pool.TE` holds p1's
  sample, the pool's keys are exactly `['TE']` (no `undefined` key, p9 dropped). Red: drop the
  absent-position skip (pool gains an `undefined` key).
- **T6 failed/absent week contributes nothing** — weeklyResult.weeks lacks week 3 (in `failedWeeks`);
  a week-3 starter is not in the pool; red: treat a missing week's row as 0.
- **T7 fallback triggers below threshold** — `liveResolved: true`, `priorStatus: 'loaded'`; live TE
  n = 59 (non-empty), prior TE n = 60 → `basis.TE.source === 'prior'`, `needsPrior === true`. Fails if
  a thin-but-non-empty live pool is kept. Red: fall back only when live is empty (`n === 0`).
(T8–T10 also pass `liveResolved: true`, `priorStatus: 'loaded'` unless stated.)
- **T8 fallback not triggered at/above threshold** — live TE n = 60 → `source === 'live'`, and with
  all four ≥ 60 `needsPrior === false`; red: threshold off by one (`n > min`).
- **T9 no thin fallback** — live TE n = 10, prior null → `basis.TE === null`; red: return the live pool when prior missing.
- **T10 prior below threshold unused** — live TE 10, prior TE 30 → `basis.TE === null`. Fails if the
  prior pool is used without its own threshold check. Red: drop the `n >= min` check on the prior side.
- **T10b pending vs ready** — (i) `liveResolved: false` with live `{}` → `status 'pending'`,
  `needsPrior false` (fails if boot-time emptiness triggers the prior read; red: compute needsPrior
  before the liveResolved gate). (ii) resolved, TE thin, `priorStatus 'loading'` → `pending`; (iii)
  same with `'failed'` and with `'unavailable'` → `ready`, `basis.TE === null`; (iv) all four ≥ 60,
  `priorStatus 'idle'` → `ready`. Red for (iii): treat `'failed'` as pending (stuck loading).
  (v) resolved, TE thin, `priorStatus 'loaded'`, `priorRowsPending: true`, prior `null` → `pending`
  (fails if the prior rows' late arrival shows a "no basis" flash; red: ignore `priorRowsPending`).
- **T10d `isPriorRowsPending`** — nflState week 11 2026, careerStats key 2025, `priorStarterWeeks
  { status: 'loaded', season: 2025 }`: `defenceWeeklyByYear {}` → true; `{ 2025: {…} }` → false;
  season 2023 (not in the plan) with `{}` → false; status `'loading'` → false. Red: drop the plan-entry
  check (season 2023 would stay pending forever).
- **T10c `isLivePoolResolved`** — nflState `{ season: '2026', season_type: 'regular', week: 11 }`,
  careerStats with key 2025, leagueData `{}`: `defenceWeeklyByYear {}` → false; `{ 2026: { complete: false } }`
  → true; week 1 (no live plan entry) with `{}` → true; leagueData null → false. Red: require
  `complete` (an all-failed live load would then leave the basis pending forever).
- **T11 percentileOf / quantile** — `[10,20,30,40]`: `percentileOf(.., 30) = 0.625`, `(.., 5) = 0`,
  `(.., 99) = 1`; `quantile(.., 0.2) = 16`; `percentileCutoffs([1..11])` = `[3,5,7,9]`. Red: drop the
  0.5·ties term (30 → 0.5).

**`src/utils/percentileColour.test.js`** (new)
- **T12 monotonic luminance** — 201 samples of `scaleRgb(i/200)`, luminance strictly non-decreasing;
  also `scaleRgb(0)`/`scaleRgb(1)` equal stops 0/5. Red: reverse `SCALE_STOPS` order, or interpolate
  segments with `p*4` (wrong segment width).
- **T13 copied-definition equality** — reads `src/index.css`, extracts `--color-dp-scale-0..5` and the
  two ink tokens, asserts equal to `SCALE_STOPS[i]` / `SCALE_INK` (case-insensitive). Red: change one hex in either side.
- **T14 contrast ≥ 4.5:1** — at the six stops and at the 201 samples, for both `scaleRgb` (unrounded)
  and the parsed integer output of `scaleCss`: `contrastRatio(L(bg), L(scaleInk(p))) >= 4.5`. Red:
  set `SCALE_INK.dark` to `#07080b` (planning measured 4.48 at p≈0.474) — the test must fail there.
- **T15 scaleCss shape** — `scaleCss(0) === 'rgb(42, 27, 77)'`. Red: emit the space form.

**`src/utils/weeklySeasonGrid.test.js`** (extend)
- **T16 season total** — fixture: weeks 1–2 played (10.4, 20.2 points via `pass_yd`), week 3 bye,
  week 4 dnp, `currentWeek 6`. Asserts `seasonTotal = { points ≈ 30.6, games: 2 }`; red: count the
  dnp/bye as games, or sum projected.

**`src/components/week/SeasonGrid.test.jsx`** (replace the two dp-up intensity tests — that
behaviour is removed; keep the three group/unknown tests)
- **T17 played cell coloured by basis** — basis WR values = integers `0..99` plus `200` (101 values,
  sorted). Row p1 (WR) has two played cells: 90 pts and 5 pts (the 90 is the grid's max). Asserts the
  90-pt cell's inline `backgroundColor === scaleCss(90.5/101)` and `data-pct="90"`; the 5-pt cell's
  `data-pct="5"` and its parsed background luminance is lower. Red: colour by ratio to the grid max
  (the old path) — the 90-pt cell would get the top stop / `data-pct="100"`.
- **T18 0-point played cell stays filled** — basis WR values = integers `1..100` (all > 0, so
  `percentileOf(values, 0) === 0`); a 0-point played WR cell's fill `backgroundColor === 'rgb(42, 27, 77)'`
  (stop 0), no `opacity`. Red: render no fill when points are 0.
- **T19 dnp = red, no text, label** — a `dnp` cell has class `bg-dp-missed`, `textContent === ''`,
  `aria-label="Did not play"`, `title="Did not play"`, no inline backgroundColor. Red: restore the `—` glyph.
- **T20 bye = hatch, not scale** — bye cell has `bg-dp-bye-hatch`, empty text, `aria-label="Bye"`,
  `style.backgroundColor === ''`. Red: route bye through the played branch.
- **T21 no basis → neutral** — `percentileBasis={{ status: 'ready', basis: { WR: null }, needsPrior: true }}`:
  the played WR cell's fill has `bg-dp-chip`, no inline background, and its `title` contains
  `no WR basis yet` (distinguishing it from the pending row). Red: colour with an empty pool
  (`percentileOf` null → `scaleCss(NaN)`, an inline background is set).
- **T22 season total cell** — row with the T16 shape renders `grid-total-p1` = `31 · 2`; a row with no played week `—`. Red: drop `Math.round` → `30.6 · 2`.
- **T23 legend cut-offs and basis season** — `status 'ready'`, basis QB values `[1..11]` live 2026,
  TE prior 2025, RB/WR null: `legend-cutoffs-QB` = `QB: 3 / 5 / 7 / 9 pts`; `legend-cutoffs-TE` ends
  `· 2025`; `legend-cutoffs-RB` = `RB: no basis yet`; `legend-basis` = the mixed form naming 2026, `TE`
  and 2025. Red: print the 25/50/75 quartiles.
- **T23b legend basis variants** — all-prior → the all-prior form; all-null → `No league-starter basis
  yet`. Red: always render the mixed form (all-prior would read "Basis: 2026 league starters; …").
- **T23c loading** — `percentileBasis={{ status: 'pending', basis: {}, needsPrior: false }}`:
  `legend-basis` = `Loading the league-starter basis…`, no `legend-cutoffs-*`, a played cell's fill has
  `bg-dp-chip` and its title has no `no … basis` text. Red: render pending as ready-with-no-basis.

**`src/__tests__/opponentStrengthViewOnly.test.js`** (extend — no new file, no copy of `PIPELINE`)
- **T25 percentile modules stay view-only** — add a second `describe` that loops the same `PIPELINE`
  list and asserts each file's source does not match `/from\s+['"][^'"]*(starterPercentiles|percentileColour)['"]/`.
  Red: temporarily add `import { MIN_POOL_SAMPLES } from './starterPercentiles'` to `dynastyScore.js`.

- **T25b App.jsx reference pin** — modelled on the existing `'App.jsx references defenceAllowed
  only…'` test (lines 50–57) in the same file: collect App.jsx's non-comment lines matching
  `/\b(liveStarterPool|priorStarterPool|starterPercentiles|starterNeedsPrior)\b/`; assert the trimmed
  set equals an explicit expected list. Every line the regex matches must be in it, which with §4c/§4d
  as written means: the `./utils/starterPercentiles` import line (the regex matches the module name);
  the `liveStarterPool`/`priorStarterPool`/`starterPercentiles` declarations; the `starterPercentiles`
  memo's dep line only (the other two dep lines contain none of the four names); the `live: liveStarterPool, prior: priorStarterPool,` argument line; `const starterNeedsPrior
  = starterPercentiles.needsPrior`; the §4d guard `if (!starterNeedsPrior || !leagueId || !prevId) return`
  and dep line `}, [selectedLeague, starterNeedsPrior])`; and exactly one `percentileBasis={starterPercentiles}`.
  Session 2 copies the trimmed lines from its implementation and lists them in the hand-back. Fails if any
  playerRows-chain memo reads the basis. Red: add `void liveStarterPool` inside the `playerRows` memo.

**App.jsx effect behaviour** (ref release, `leagueId` gate) has no mounted test — App is not unit-mounted
anywhere; the decision logic it depends on is pure and covered by T10b/T10c, and the pin (T25b)
covers placement. The smoke (§9) confirms the grid is coloured live and, via the network panel, that
no `/league/1253804638616956928` request fires on a week-11 load.

## §9 Smoke + screenshots (Session 2, then re-checked in verification)

Preview from `.claude/launch.json` (`sleeper-dashboard`), `/week`. Take **before** screenshots first
(before any edit), then after: desktop 1440×900 and phone 375×812 (`resize_window`), season grid and
legend in view. Then, after, two colour-vision simulations at desktop size by injecting (via
`javascript_tool`, debug only, removed after) an SVG filter on `<html>`:

```js
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="cvd"><feColorMatrix type="matrix" values="MATRIX"/></filter></svg>`); document.documentElement.style.filter = 'url(#cvd)'
```

Machado et al. 2009, severity 1.0 — deuteranopia
`0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0`;
protanopia
`0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0`.
Report, per simulation: is missed (red) distinguishable from the dark-purple bottom, and lime top
from the hatched bye? Lime and bye base are luminance-equal (≈ 0.79), so only the hatch and the
missing number separate them — say whether that holds at 9px. Also confirm in the live app: no `NaN`, legend
cut-offs plausible (QB > TE at every cut-off), basis line says live 2026. Screenshots are evidence of *not broken*; Anton judges *good*.

## §10 Docs (same change)

- `docs/architecture.md` — *leagueData assembly*: add `starterWeeks` (`[{ week, ids }]`, filled
  starter ids of every roster per completed week, `matchup_id`-independent). *State management*
  table: `priorStarterWeeks` row. Memo list near `defenceAllowed` (line ~180): `liveStarterPool`,
  `priorStarterPool`, `starterPercentiles` — view-only, not in the playerRows chain.
- `docs/nav/utils.md` — rows for `starterPercentiles.js`, `percentileColour.js`; amend `weeklySeasonGrid.js` (position, seasonTotal).
- `docs/nav/components.md` — `SeasonGrid.jsx` row (scale, special cells, legend, SEASON column,
  `percentileBasis` prop); `WeekView.jsx` row (new prop).
- `docs/navigation.md` `/week` row — "SeasonGrid.jsx (…six kinds…)" gains: played cells coloured on
  the league-starter percentile scale for the player's position, with a legend of per-position cut-offs.
- `docs/ui.md` — a short "Percentile scale (W2b-1)" note in the colour section: tokens, ink rule,
  missed/bye, and that the scale is a *rank among league starters*, not a verdict.
- Mechanism-only phrasing (docsAvailabilityClaims): "positions below `MIN_POOL_SAMPLES` read the
  prior league's pool", never "early in 2026 TE uses 2025".
- `docs/signal-registry.md` — not a signal/factor; no change. `cross-repo-registry.md` — no change.

## Risks

- **Prior-season effect loops / sticks** — ref de-dupe released on abandonment, `leagueId`-gated
  status, `isLivePoolResolved` gate (§4c/§4d, D6). Smoke checks no prior request at week 11.
- **`previous_league_id` missing** on either `selectedLeague` source (App.jsx:935 `getLeague`, 1452
  league list — both full league objects) → Session 2 stops and reports.
- **Defence-loader filter coupling** — named in §1's header comment; narrowing that filter empties
  positions (renders "no basis", never a wrong colour).
- **OI-1 overlap** — both touch App.jsx 986–1006. Different lines; whichever lands second rebases.

## Done-definition notes for Session 2

Full done-definition (CLAUDE.md). `factorsSchema`/`statKeysContract` untouched (no projection or
stat-key change) but run the full suite. Paste `grep -rn "PROVISIONAL(" src/` diff (one new tag, §6c)
in the hand-back. Commit before hand-back; do not push.

---

## W2b-2 and W2b-3 — outline only (plan each after its dependency is verified)

**W2b-2 Shared player cell** — depends on W2a only; may be planned in parallel with W2b-1. One
`PlayerCell` in `dp/cells.jsx` (l.79): ~40px photo, team-logo watermark, abbr as text, FA plain;
adopted by This week (replaces `LineupTable`'s own cell), Market (`FactTable`), My Team, team detail,
pop-up compare (TopBar stays local, `docs/ui.md:198`). Clean-columns pass; Market frozen player column
+ `Prev rk` left of FP/G. Full review. Does not touch W2b-1's tokens.

**W2b-3 Strips** — depends on W2b-1. `dp/WeeklyStrip.jsx` replaces `FormBars` (l.84) / LAST 3 (l.479):
all played weeks (≤ 18 bars, last 3 emphasised) coloured via `scaleCss(percentileOf(…))` on the
`starterPercentiles` basis, bye/missed per W2b-1. Usage trend in Usage & form. Matchup columns coloured
on their own per-metric 32-team basis. Likely full. M3 then reuses `starterPercentiles`.

**W2b-1q Questionable chip** — planned: `.claude/tasks/week-w2b-1q-questionable-chip.md`. Independent.

**OI-1** (own tiny slice): skip `matchup_id == null` groups in `weeklyScores`; ship before ~2026-12-22. Light.
