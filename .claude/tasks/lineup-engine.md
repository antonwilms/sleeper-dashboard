# Slice A — Lineup engine and league aggregates

**Repo:** `sleeper-dashboard`. **Session 2 model:** sonnet.
**UI changes: none.** Pure logic behind tests; three later Portfolio-redesign slices consume it.
**Not scoring-affecting.** Reads `projectedPPG` and historical PPG; changes neither.

---

## 0. Decision summary (read first — each departs from the originating brief, with the reason)

| # | Brief said | This plan does | Why |
|---|---|---|---|
| D1 | Pass `roster_positions` to surfaces "the same way `scoring_settings` is" | Add `rosterPositions` to the `leagueData` object only. **No JSX prop added to any surface.** | `scoring_settings` never reaches a surface as a prop — it rides on `leagueData.scoringSettings` (`App.jsx:859`). No surface reads `rosterPositions` in this slice; the consuming slice adds `rosterPositions={leagueData.rosterPositions}` at the same time as the code that reads it. A prop nothing reads is dead code. |
| D2 | `buildLeagueLineups({ rosterTeams, playerRows, seasonProjections, rosterPositions, season })` | `buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season })` — **`careerStats` added, `playerRows` dropped** | The brief sources `last` from `careerStats` but never passes it. `rosterTeams` players already carry `id`, `position`, `full_name` (`enrichPlayer`, `App.jsx:812-816`). `projectedPPG` is read from `seasonProjections` directly, which avoids the which-pipeline-stage hazard: base `playerRows` has no `projectedPPG`; only `playerRowsWithProj` does (`App.jsx:622-625`). |
| D3 | "`currentSeasonPPG` is a partial live season and would be wrong" | Still read `careerStats[season]` directly, but for the **correct** reason | `loadCareerHistory` loads `2012 … nflState.season − 1` only (`sleeperStats.js`, `for (let s = 2012; s < currentSeason; s++)`), so `careerStats` never holds 2026 and `row.currentSeasonPPG` **is** 2025. It is still unusable: it coerces a missing season to `0` and rounds to 2dp (`App.jsx:377-379`), which breaks the null-is-not-zero rule. |
| D4 | `buildPositionLadders(leagueLineups, myRosterId)`, `slotsLabel` derived from `rosterPositions` | Signature kept; the label is derived from `leagueLineups[0].last.slots`, which is already in `rosterPositions` order | Keeps the brief's signature and still derives the label, not hard-codes it. |
| D5 | Example label `'RB' → '2 slots + 1 flex'` | Label format `'2 slots + 2 flex + 1 superflex'` for RB in this league | The example cannot come out of this league's array (2 dedicated RB, 2 FLEX, 1 SUPER_FLEX). The format is spelled out in §2.3; the UI slice can restyle it. |
| D6 | `lastAll` = "all 12 values" | `lastAll`/`projAll` = 12 `{ rosterId, teamName, value }` objects, sorted by value desc, nulls last | A rung needs to know which team it is and which one is mine. Bare numbers lose that. |
| D7 | Slot shape `{ slot, player_id, points }` | `{ slot, player_id, name, position, points }` | `buildWeakestSlots` must return `name`, and its signature has no player lookup. |
| D8 | Weakest-slot shape `{ slot, player_id, name, mine, median, loss }` | Adds `slotIndex` | This league has `RB`,`RB` and `FLEX`,`FLEX` — the slot name alone is ambiguous. |
| D9 | — | Adds `unscored: { QB, RB, WR, TE }` to the lineup result | `byPosition` sums only measured points. A later UI must be able to say "partial — 1 starter unscored" rather than show a partial sum as if complete (*omit rather than approximate*). |
| D10 | Players pool unspecified | Pool = `starters ∪ bench ∪ reserve` | Lineups are season-level (season PPG); IR is a week-level status. Taxi players are already inside `bench` (`App.jsx:826` = `players − starters − reserve`), so excluding `reserve` alone would be inconsistent. **Product call — Anton may reverse it; it is one line.** |

---

## 1. Thread `roster_positions` onto `leagueData`

### 1.1 `src/App.jsx` — the `setLeagueData` call (`:857-861`)

Add one key next to `scoringSettings`:

```js
      setLeagueData({
        standings, weeklyScores, weeks, rosterTeams, playerMap, rosteredIds, rookieDraftPicks,
        scoringSettings: selectedLeague.scoring_settings ?? {},
        rosterPositions: selectedLeague.roster_positions ?? [],
        firstLiveDraftSeason, draftRounds: selectedLeague.settings?.draft_rounds ?? null,
      })
```

Raw array, unfiltered — filtering to starting slots is `lineup.js`'s job. Nothing else in `App.jsx`
changes: no new memo, no new prop on `<Portfolio>` or any other route (D1).
`src/utils/rookieDraft.js` keeps reading `league.roster_positions` directly; do not touch it.

### 1.2 `docs/architecture.md` → *leagueData assembly* (`:80-102`)

Add `rosterPositions` to the object block:

```
  rosterPositions,  // selectedLeague.roster_positions ?? [] — raw slot array incl. BN/TAXI/IR;
                    // src/utils/lineup.js filters it to starting slots
```

While there, make the block match what `setLeagueData` actually writes (hygiene, same commit). It
currently lists `league`, `users`, `rosters`, `myRosterId`, none of which is set, and omits
`standings`, `weeklyScores`, `weeks`, `rosteredIds`. Also fix the `rosterTeams` comment to
`[{ rosterId, ownerId, rank, teamName, managerName, starters, bench, reserve }]`. Docs only.

---

## 2. New util: `src/utils/lineup.js`

**Leaf module: imports nothing** (not even `sortUtils.js`). Pure, no React, no I/O. File header
comment must state:
- view-only;
- `null` is never `0`;
- `byPosition` attributes by player position, not slot.

### 2.0 Constants

```js
export const LINEUP_POSITIONS = ['QB', 'RB', 'WR', 'TE']
const NON_STARTING_SLOTS = new Set(['BN', 'TAXI', 'IR'])
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
}
```

Export a small helper that the other three functions and the tests use:

```js
export function startingSlots(rosterPositions)   // → string[]; (rosterPositions ?? []) minus NON_STARTING_SLOTS, order kept
```

**Any other slot string** (`K`, `DEF`, `WRRB_FLEX`, `REC_FLEX`, IDP slots) is a starting slot with no
eligible position here. It is kept in `slots`, always empty (`player_id: null`, `points: null`), and
must not throw. Do not add eligibility for slots this league does not use.

### 2.1 `buildBestLineup(players, rosterPositions, getPoints)`

**Inputs**
- `players`: array of `{ player_id, position, full_name? }`. Players whose `position` is not in
  `LINEUP_POSITIONS` are ignored. Duplicate `player_id`s: keep the first.
- `rosterPositions`: raw league array.
- `getPoints(player)` → number or `null`. Any non-finite return (`undefined`, `NaN`) is treated as
  `null`. **Never coerce to 0.**

**Output**

```js
{
  slots: [ { slot, player_id, name, position, points } ],   // one per startingSlots() entry, same order
  byPosition: { QB, RB, WR, TE },    // sum of finite points of starters with that position; null if none finite
  unscored:   { QB, RB, WR, TE },    // count of starters with that position whose points are null
  total,                             // sum of finite slot points; null if none finite
}
```

An empty slot is `{ slot, player_id: null, name: null, position: null, points: null }`.
`name` = `player.full_name ?? null`. No rounding anywhere in this module.

**Algorithm — exhaustive over per-position counts (not greedy in array order)**

Within a position, a better player never sits while a worse one starts, so a lineup is determined by
how many of each position start. Enumerate those count vectors.

1. **Sort each position's pool.** Finite points descending, then `null`s. Ties break by `player_id`
   ascending (string compare) for determinism. `n_p` = pool size; `s_p` = count with finite points.
2. **Slot counts from `startingSlots`.** `D_p` = dedicated slots for position `p`, `F` = `FLEX`
   count, `S` = `SUPER_FLEX` count.
3. **Enumerate.** For `k_QB ∈ 0..min(n_QB, D_QB+S)` and `k_p ∈ 0..min(n_p, D_p+F+S)` for RB/WR/TE,
   in nested ascending order QB → RB → WR → TE. A vector is **feasible** iff, with
   `e_p = max(0, k_p − D_p)`, both hold:
   - `e_QB ≤ S`
   - `e_RB + e_WR + e_TE ≤ F + S − e_QB`
4. **Score each feasible vector lexicographically, maximising** (starters = the top `k_p` of each
   sorted pool):
   1. `scoringStarters` = Σ `min(k_p, s_p)`
   2. `points` = Σ finite points of the starters
   3. `starters` = Σ `k_p`

   Replace the incumbent only on a **strictly greater** key, so ties keep the first vector in
   enumeration order.

   *Why key (1) precedes (2), and why that costs no points:* eligibility here is nested
   (dedicated ⊂ FLEX ⊂ SUPER_FLEX), a transversal matroid. For non-negative points, the best-scoring
   set can always be extended to a maximum-size set without losing points, so (1)→(2) equals plain
   max-points. It also settles the edge cases the brief cares about:
   - a scoring player at `0` beats a `null` (key 1);
   - a `null` fills a slot only when no scoring player can (key 3);
   - a negative-PPG scoring player starts rather than leave a slot empty (key 1).
5. **Place the chosen starters into slots (canonical placement).** This matters because
   `buildWeakestSlots` compares by slot index.
   - For each position `p`, the first `min(k_p, D_p)` players of its sorted list go into that
     position's dedicated slots, in `rosterPositions` order (best player → first slot).
   - QB excess (players `D_QB+1 … k_QB`) goes into `SUPER_FLEX` slots, in order.
   - RB/WR/TE excess is pooled and re-sorted (finite points desc, nulls last, `player_id` asc). It
     fills `FLEX` slots in order, then the remaining `SUPER_FLEX` slots in order.
   - Every unfilled slot is empty.
   - Feasibility (step 3) guarantees this placement never overflows.

Cost: at most `(D_QB+S+1)·Π(D_p+F+S+1)` ≈ 3·6·7·5 = 630 vectors for this league — trivial.

Must not throw on:
- `players` empty or `null`;
- `rosterPositions` empty or `null` → `{ slots: [], byPosition: all null, unscored: all 0, total: null }`.

### 2.2 `buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season })`

- **`rosterTeams`**: `leagueData.rosterTeams`. Pool per team = `[...starters, ...bench, ...reserve]`
  (D10), mapped to `{ player_id: p.id, position: p.position, full_name: p.full_name }`.
  - Sleeper's `"0"` empty-starter placeholder survives `filter(Boolean)` and arrives with
    `position: '?'`; `buildBestLineup` drops it by position.
- **`last` accessor.** `d = careerStats?.[season]?.[player_id]`. Return
  `d.fantasyPoints / d.gamesPlayed` when `d` exists, `d.gamesPlayed > 0`, and `d.fantasyPoints` is
  finite; otherwise `null`. Unrounded. **Do not read `row.currentSeasonPPG`** (D3).
- **`proj` accessor.** `v = seasonProjections?.[player_id]?.projectedPPG`; return `v` if finite,
  else `null`.
- **`season`**: a number, passed by the caller. This module does not derive it. The consuming slice
  passes the careerStats-derived last season: `Math.max(...Object.keys(careerStats).map(Number))`,
  the quantity `App.jsx` names `mostRecentSeason` (`:333`) and `dataSeason` (`:1030`). It must
  **not** be `nflState.season`. Do not reach for a variable named `currentSeason` in `App.jsx`: that
  name means the careerStats season at `:210/254/532/557/688` but `parseInt(nflState.season)` at
  `:873`/`:955`.
- **Returns** an array in `rosterTeams` order:
  `[{ rosterId, teamName, last: buildBestLineup(...), proj: buildBestLineup(...) }]`.
- `rosterTeams` null or empty → `[]`. `careerStats` or `seasonProjections` null → that side's points
  are all `null`; still returns a lineup per team.

### 2.3 `buildPositionLadders(leagueLineups, myRosterId)`

Returns an array of five entries, in order `QB, RB, WR, TE, Lineup`; `[]` if `leagueLineups` is
empty.

```js
{
  pos,                         // 'QB' | 'RB' | 'WR' | 'TE' | 'Lineup'
  slotsLabel,
  lastMine, lastRank, lastMedian, lastAll,
  projMine, projRank, projMedian, projAll,
  move,
}
```

**Value per team:** `lineup[side].byPosition[pos]`, or `lineup[side].total` for `Lineup`.

**`*All`:** one `{ rosterId, teamName, value }` per team. Sorted by value descending with nulls
last; ties break by `rosterId` ascending.

**Rank — competition ranking over finite values, descending.** Equal values share a rank and the
next rank skips (e.g. 1, 2, 2, 4). A team with `null` value has rank `null`.

**Median — over finite values only.** Even count → mean of the two middle values. No finite values
→ `null`.

**`*Mine`:** my team's value.
- `myRosterId` not found → `*Mine`, `*Rank` and `move` are all `null`. The other fields are still
  computed.

**`move`:** `projRank − lastRank` when both are non-null, else `null`. Positive = rank number rose =
**got worse**; say so in the JSDoc.

**`slotsLabel`:** derived from `leagueLineups[0].last.slots.map(s => s.slot)`.
- **QB:** `"{D_QB} slot(s)"`, then `" + {S} superflex"` if `S > 0`.
- **RB / WR / TE:** `"{D_p} slot(s)"`, then `" + {F} flex"` if `F > 0`, then `" + {S} superflex"` if
  `S > 0`.
- **Lineup:** `"{n} slot(s)"`, where `n` = number of starting slots.
- Singular "slot" when the count is 1.

This league: QB `"1 slot + 1 superflex"`, RB `"2 slots + 2 flex + 1 superflex"`,
WR `"3 slots + 2 flex + 1 superflex"`, TE `"1 slot + 2 flex + 1 superflex"`, Lineup `"10 slots"`.

### 2.4 `buildWeakestSlots(leagueLineups, myRosterId)`

- `mine = leagueLineups.find(l => l.rosterId === myRosterId)?.proj.slots`. Not found → `[]`.
- For each index `i`:
  - Skip if `mine[i].points` is `null` — an unscored or empty slot has no measured loss. Never treat
    it as `0`.
  - `median` = median of **finite** `proj.slots[i].points` across all **other** teams (same median
    rule as §2.3). Skip if `null`.
  - `loss = median − mine[i].points`. Keep only when `loss > 0`.
- Entry shape:
  `{ slot, slotIndex: i, player_id, name, mine: mine[i].points, median, loss }`.
- Sort by `loss` descending, ties by `slotIndex` ascending. **Return all losing slots** — taking the
  top four is the UI's job.

Slot index `i` means the same thing on every team: all teams share `rosterPositions`, and §2.1 step 5
places players canonically, so "RB slot 0" is every team's best dedicated RB.

---

## 3. Tests

### 3.1 `src/utils/lineup.test.js` (new)

Every expected number is a **literal written by hand** in the test, never recomputed with the module
under test. Fixtures use tiny `rosterPositions` arrays unless a case needs the real one. Real league
array, for cases that use it:

```js
const LEAGUE = ['QB','RB','RB','WR','WR','WR','TE','FLEX','FLEX','SUPER_FLEX', ...Array(18).fill('BN')]
```

**`startingSlots`**
1. Removes `BN`, `TAXI`, `IR`; keeps order; `LEAGUE` → 10 entries; `null` → `[]`.

**`buildBestLineup`**

2. **SUPER_FLEX takes a QB when that maximises.** `['QB','RB','SUPER_FLEX']`, players QB 25,
   QB 22, RB 15, RB 10. Expect SF = QB 22, total 62, `byPosition.QB` 47.
3. **SUPER_FLEX takes a non-QB when that maximises.** Same slots, players QB 25, QB 8, RB 15, RB 12.
   Expect SF = RB 12, total 52, `byPosition.RB` 27.
4. **FLEX excludes QB.** `['RB','FLEX']`, players QB 40, RB 10, WR 3. Expect FLEX = WR 3; the QB is
   not in `slots`.
5. **Greedy failure, FLEX-before-dedicated.** `['FLEX','RB']`, players RB 20, RB 3, WR 5.
   - Left-to-right would put RB 20 in FLEX and RB 3 in RB (23).
   - Expect FLEX = WR 5, RB = RB 20, total 25.
6. **Greedy failure, SUPER_FLEX-before-QB.** `['SUPER_FLEX','QB','WR']`, players QB 25, WR 20,
   WR 18.
   - Left-to-right would put QB 25 in SF, leave the QB slot empty, then WR 20 (45).
   - Expect QB = QB 25, SF = WR 18, WR = WR 20, total 63.
7. **`null` never displaces a scoring player.** `['RB','FLEX']`, players RB 15, RB `null`, WR 2 →
   FLEX = WR 2. The same with WR at `0` → FLEX = WR 0 (`points === 0`, not `null`).
8. **`null` fills only when nothing scores, and is never `0`.** `['RB','FLEX']`, players RB 15,
   RB `null`:
   - `slots[1].player_id` is the null RB and `slots[1].points === null`;
   - `byPosition.RB === 15`, `unscored.RB === 1`, `total === 15`;
   - `byPosition.TE === null` (not `0`).
9. **`byPosition` attributes by player position.** `LEAGUE` slots, a roster whose FLEX is an RB:
   `byPosition.RB` includes it and there is no `FLEX` key.
10. **Short roster.** `LEAGUE` slots, players QB 20, RB 10 only:
    - no throw, `slots.length === 10`;
    - QB slot and first RB slot filled; the rest have `player_id === null`, `points === null`;
    - `total === 30`.
11. **Unknown slot types.** `['QB','K','DEF']`: `K`/`DEF` present in `slots`, empty, no throw.
12. **Non-skill and non-finite inputs.** A player with `position: '?'` is ignored. A `getPoints`
    returning `undefined` or `NaN` is treated as `null`.
13. **Canonical placement.** `['RB','RB','FLEX']`, players RB 5, RB 9, RB 7: `slots` points in order
    `[9, 7, 5]`.

**`buildLeagueLineups`**

14. Reads `careerStats[season]` and not another season:
    - fixture has seasons 2024 and 2025 with different values, `season: 2025`;
    - asserts `last` uses the 2025 PPG, computed as `fantasyPoints / gamesPlayed` unrounded
      (e.g. 100 / 6 → `16.666…`, use `toBeCloseTo`).
15. `gamesPlayed: 0`, and a player absent from `careerStats[season]` (a rookie) → `last` points
    `null`. A player missing from `seasonProjections` → `proj` points `null`.
16. Pool includes `reserve` (D10): an IR player with the best PPG starts.
17. Returns `{ rosterId, teamName, last, proj }` per team in `rosterTeams` order; `rosterTeams: []`
    → `[]`.

**`buildPositionLadders`** — hand-built 12-team fixture

Build it with `buildLeagueLineups` over `['QB','RB','FLEX']` so values are easy to hand-compute. The
RB ladder must include:
- at least one tie;
- one team with no scorable RB (value `null`);
- my team in the middle;
- an **even** count of finite values (11 finite + 1 null does not qualify — make it 10 finite +
  2 null).

18. `lastRank`/`projRank` match hand-written competition ranks, including the tie (shared rank, next
    rank skipped).
19. `lastMedian` equals the hand-computed mean of the middle two finite values. The null teams are
    excluded from the median and sit last in `lastAll` with rank `null`.
20. `move` is `projRank − lastRank`, signed, for a case where my rank worsens (positive) and one where
    it improves (negative). `move === null` when either rank is `null`.
21. `slotsLabel` for `LEAGUE` equals the five literal strings in §2.3.
22. `myRosterId` not found → `*Mine`, `*Rank`, `move` are `null`; medians still computed.

**`buildWeakestSlots`**

23. Returns only slots with `loss > 0`, sorted by `loss` descending, ties by `slotIndex`.
24. The median excludes my own team. Fixture: including my value would change the median; assert the
    other-teams value.
25. A slot where my player's `proj` points are `null` is absent from the result, not reported as a
    loss.

### 3.2 `src/__tests__/lineupViewOnly.test.js` (new)

Model it exactly on `src/__tests__/opponentStrengthViewOnly.test.js`: same `PIPELINE` list, copied
verbatim.
- For each `PIPELINE` file, assert it neither imports `lineup` (`/from\s+['"][^'"]*\/lineup['"]/`)
  nor references `buildBestLineup|buildLeagueLineups|buildPositionLadders|buildWeakestSlots`.
- Assert `src/utils/lineup.js` has no `import` statement at all (`/^\s*import\s/m`), which enforces
  the leaf property.

---

## 4. Docs

- **`docs/nav/utils.md`** — add a row after `teamExposure.js`:

  > `lineup.js` | `startingSlots`, `buildBestLineup(players, rosterPositions, getPoints)` (optimal
  > legal lineup by exhaustive per-position count enumeration — not greedy; `byPosition` attributes
  > by player position, so a FLEX RB counts to RB; `null` points eligible but never displace a scorer,
  > never `0`), `buildLeagueLineups` (every roster × `last` = `careerStats[season]` PPG and
  > `proj` = `seasonProjections[id].projectedPPG`), `buildPositionLadders` (per-position +
  > `Lineup` ranks/medians, competition ranking, finite-only medians), `buildWeakestSlots` (my
  > `proj` slots vs other teams' per-slot-index median). Leaf module, imports nothing. View-only —
  > guarded by `lineupViewOnly.test.js`. No renderer yet (Portfolio redesign slices consume it).

- **`docs/architecture.md`** — §1.2 above.
- **`docs/signal-registry.md`** — add a computed-factor row directly after the *Ceiling/Floor
  career-season finish* row (`:110`), same column format:

  > | Best-lineup league aggregates (per-roster optimal lineup, per-position and lineup ladders, weakest
  > slots) | computed factor (view-layer) | app: `src/utils/lineup.js`, from in-memory `careerStats`
  > (last completed season PPG), `seasonProjections[id].projectedPPG`, and the league's
  > `roster_positions` | last completed season in `careerStats` + current projection only | **Reconstructable**
  > (pure function of season totals, projections and league settings) | **unused/candidate** — no renderer
  > yet (Portfolio redesign slices B–D); view-only by contract, guarded by `lineupViewOnly.test.js`;
  > never moves `projectedPPG`/dynasty score |

- **`CLAUDE.md`** — no change. Directory-level tables do not list modules; the per-file row goes in
  `docs/nav/utils.md`.

---

## 5. Step sequence

1. **`src/utils/lineup.js`** + **`src/utils/lineup.test.js`** — §2, §3.1. Run
   `npx vitest run src/utils/lineup.test.js` until green.
2. **`src/__tests__/lineupViewOnly.test.js`** — §3.2.
3. **`src/App.jsx`** — §1.1, one line.
4. **Docs** — §1.2, §4.
5. **Done-definition** (CLAUDE.md):
   - `npm test`, `npm run lint` (0 problems), `npm run build` (clean);
   - no user-visible change, so no smoke test — note that in the hand-back;
   - commit, then hand back.
   - `factorsSchema` and `statKeysContract` are untouched: no `seasonProjection.js` edit and no new
     stat key. `fantasyPoints` and `gamesPlayed` are row fields, not stat keys.

## 6. Touch list (exhaustive)

- New:
  - `src/utils/lineup.js`
  - `src/utils/lineup.test.js`
  - `src/__tests__/lineupViewOnly.test.js`
- Edited:
  - `src/App.jsx` (one key in `setLeagueData`)
  - `docs/architecture.md`
  - `docs/nav/utils.md`
  - `docs/signal-registry.md`
  - `docs/cross-repo-registry.md` (CR-01 Triggers, one consumer appended — §7)

**Must not change:**
- `Portfolio.jsx` or any other component;
- `seasonProjection.js`, `dynastyScore.js`, `rookieDraft.js`;
- any memo in `App.jsx`.

## 7. Cross-repo impact

- **CR-18 · Signal registry rows** — **app-side trigger touched** (`docs/signal-registry.md` gains a
  row). Direction data→app. The row is an app-computed view-layer derivation, not an ingested field,
  so **no data-side action is owed**. Mirror text, quoted per the rule:

  > This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
  > script the list above cannot already name. The listed sites are every one that exists today; a
  > *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives
  > its own side against live `scripts/` and `lib/` on every review), not by this list. When a
  > data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters
  > its historical coverage or reconstructable-vs-ephemeral status — emit the exact
  > `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
  > reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
  > data side in the same change. **Nothing fails in either repo when this drifts** — the registry
  > simply becomes wrong, and since it is the inventory that governs snapshot-capture and
  > grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
  > cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

- **CR-01 · Projection snapshot envelope** — **app-side trigger list gains a consumer.** `lineup.js`
  `buildLeagueLineups`'s `proj` accessor reads the verbatim projection payload
  (`seasonProjections[id].projectedPPG`), a class of site CR-01 enumerates by name. **Envelope
  unchanged, no snapshot `schemaVersion` bump, nothing owed by the data repo.** Session 2 edits
  `docs/cross-repo-registry.md` → CR-01 → **Triggers**, appending
  `src/utils/lineup.js` `buildLeagueLineups` (`proj` accessor) to the consumer list left of `‖`,
  after `src/App.jsx:603`. Mirror text, quoted per the rule:

  > State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump,
  > `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README
  > snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond
  > grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed
  > snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as
  > in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js`
  > `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not
  > season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive
  > `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

  Emitted statement: *envelope shape unchanged; `schemaVersion` stays 3.*

- **CR-02 · season-totals row composition** — read-only use of existing row fields
  (`fantasyPoints`, `gamesPlayed`) that many consumers already read. No shape change, so not
  triggered.
- **CR-21 · In-progress season-totals reads** — not triggered: `careerStats` never contains an
  in-progress season (D3), and this slice adds no `allowInProgress` read.
- No new coupling. `roster_positions` comes from the live Sleeper league object, not the data store.

## 8. Risks

- **Slot-index comparison assumes identical `rosterPositions` across teams** — always true within one
  league.
- **D10 (IR players eligible)** is a product call. If Anton reverses it, drop `...reserve` in §2.2
  and test 16.
- **`slotsLabel` wording** is a placeholder the UI slice may restyle. Only the counts are contract.

## 9. Plan-review record (2026-09-13)

plan-reviewer was run on this file and asked specifically to check three things:
- the §2.1 optimality argument and the step-5 overflow bound;
- the hand-computed values in tests 2–10;
- the §0 source claims.

It raised **no flag on any of those three**. Two flags, both verified against live source and both
applied:

1. **[mechanical] `currentSeason` is ambiguous in `App.jsx`.** Verified: `:873` and `:955` bind
   `parseInt(nflState.season)`, while the careerStats-derived memos use the same name. Applied:
   §2.2 now points at `mostRecentSeason` (`:333`) / `dataSeason` (`:1030`) and warns off
   `currentSeason`.
2. **[cross-repo] CR-01 omitted.** Verified: CR-01's app-side Triggers enumerate every live consumer
   of `seasonProjections[id]` by `file:line` (`App.jsx:603`, `Portfolio.jsx:366-367`, …). Applied:
   §7 quotes CR-01's Mirror with the emitted statement "envelope unchanged, `schemaVersion` stays 3",
   and §6/§7 add the one-line Triggers append to `docs/cross-repo-registry.md`.

---

## Fix pass 1

**Source:** implementation-reviewer on `9a9a237..83a4326`. Session 1 read `src/utils/lineup.js` in
full, and it implements §2.1–§2.4 correctly. This pass is **test coverage, one doc line, and one
null guard** — no change to any algorithm. Every expected value below was hand-computed against the
spec and cross-checked against the committed implementation; all new tests should pass on the first
run, except test F1-6's null-input assertion, which needs the §F1.7 guard. **If any other new test
goes red, stop and report — do not change `lineup.js` to make it pass.**

**Touch list:**
- `src/utils/lineup.test.js` — add tests only; do not edit or delete existing tests.
- `src/utils/lineup.js` — the one-line guard in F1.7 only.
- `docs/architecture.md` — F1.8 only.

### F1.1 — FLEX excess re-sort across positions (new test in `describe('buildBestLineup')`)

Name: `'F1-1. pooled FLEX excess is re-sorted across positions'`.

Slots `['RB','WR','FLEX','FLEX','SUPER_FLEX']`. Players, using the file's `p` helper:
- `rb1` RB 20, `rb2` RB 8, `rb3` RB 3;
- `wr1` WR 15, `wr2` WR 12, `wr3` WR 6.

Assert:
- `result.slots.map(s => s.player_id)` equals `['rb1','wr1','wr2','rb2','wr3']`
- `result.slots.map(s => s.points)` equals `[20, 15, 12, 8, 6]`
- `result.total === 61`, `byPosition.RB === 28`, `byPosition.WR === 33`

Comment in the test: an un-sorted RB-then-WR concatenation would place `rb2` (8) in the first FLEX,
ahead of `wr2` (12); the 3-RB/2-WR alternative scores 58.

### F1.2 — Weakest-slot sort order (new test in `describe('buildWeakestSlots')`, own fixture)

Name: `'F1-2. sorts by loss descending when that differs from slot order'`.

`leagueLineups` over slots `QB, RB, WR, TE` (hand-built like the existing fixture, `proj.slots`
only):

| rosterId | QB | RB | WR | TE |
|---|---|---|---|---|
| 1 (me) | 10 | 18 | 5 | 6 |
| 2 | 12 | 15 | 14 | 8 |
| 3 | 12 | 16 | 14 | 8 |

Hand-computed per slot:

| Slot | Other-teams median | Loss | Kept? |
|---|---|---|---|
| QB | 12 | 2 | yes |
| RB | 15.5 | −2.5 | no |
| WR | 14 | 9 | yes |
| TE | 8 | 2 | yes |

Assert `result.map(r => r.slotIndex)` equals `[2, 0, 3]` and `result.map(r => r.loss)` equals
`[9, 2, 2]`.

Test comment: the QB/TE tie falls back to `slotIndex` order. Because results are pushed in slot
order and `Array.prototype.sort` is stable, the tie-break cannot be isolated from the input order
— that is expected, not a gap to chase.

### F1.3 — Ladder `projRank` and `projMedian` (new test in `describe('buildPositionLadders')`, existing fixture)

Name: `'F1-3. projRank and projMedian match hand-computed values'`.

- **RB `projRank`** — assert `rbLadderFor(id).projRank` for:
  - `{ 1: 1, 5: 5, 7: 6, 10: 9, 6: 10, 11: null }`
  - sorted `projRB` is 28(t1), 27, 26, 24, 22(t5), 20(t7), 18, 16, 14(t10), 12(t6); teams 11/12 have
    no RB.
- **RB `projMedian`** — assert `rbLadderFor(6).projMedian === 21` (mean of 22 and 20).
- **Null teams sit last** — assert `rbLadderFor(6).projAll[10]` matches `{ rosterId: 11, value: null }`
  and `projAll[11]` matches `{ rosterId: 12, value: null }`.

### F1.4 — `move` is null when a rank is null (two new tests in `describe('buildPositionLadders')`)

`'F1-4a. both ranks null → move null'`: existing fixture, `rbLadderFor(11)`:
- `lastMine`, `lastRank`, `projMine`, `projRank` and `move` are all `null`.

`'F1-4b. one rank null → move null'`: own fixture via `buildLeagueLineups`, `rosterPositions: ['RB']`,
`season: 2025`, two teams:
- **team 1** — starter `{ id: 'a1', position: 'RB' }`; no `careerStats` entry;
  `seasonProjections.a1 = { projectedPPG: 10 }`.
- **team 2** — starter `{ id: 'a2', position: 'RB' }`;
  `careerStats[2025].a2 = { fantasyPoints: 5, gamesPlayed: 1 }`;
  `seasonProjections.a2 = { projectedPPG: 8 }`.

For `buildPositionLadders(…, 1)`'s RB entry, assert:
- `lastMine === null`, `lastRank === null`
- `projMine === 10`, `projRank === 1`
- `move === null`

### F1.5 — `buildBestLineup` edge cases (new test in `describe('buildBestLineup')`)

Name: `'F1-5. empty/null inputs, duplicate ids, id tie-break'`. Assert:
- `buildBestLineup([], null, () => 1)` `toEqual`
  `{ slots: [], byPosition: { QB: null, RB: null, WR: null, TE: null }, unscored: { QB: 0, RB: 0, WR: 0, TE: 0 }, total: null }`.
- `buildBestLineup(null, ['RB'], () => 1)`:
  - does not throw;
  - `slots` `toEqual [{ slot: 'RB', player_id: null, name: null, position: null, points: null }]`;
  - `total === null`.
- **Duplicate id, first kept:**
  `buildBestLineup([{ player_id: 'd1', position: 'RB', full_name: 'D' }, { player_id: 'd1', position: 'WR', full_name: 'D' }], ['WR'], () => 10)`
  → `slots[0].player_id === null`. The RB entry was kept; the WR duplicate was dropped.
- **Tie-break by id:**
  `buildBestLineup([{ player_id: 'b', position: 'RB', full_name: 'B' }, { player_id: 'a', position: 'RB', full_name: 'A' }], ['RB'], () => 10)`
  → `slots[0].player_id === 'a'`.

### F1.6 — league/weakest null and not-found inputs (new tests)

- In `describe('buildLeagueLineups')`, `'F1-6a. rosterTeams null → []'`:
  `buildLeagueLineups({ rosterTeams: null, careerStats: {}, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })`
  equals `[]`.
- In `describe('buildWeakestSlots')`, `'F1-6b. myRosterId not found or null input → []'`:
  - the existing fixture with `999` → `[]`;
  - `buildWeakestSlots(null, 1)` → `[]` (needs F1.7).

### F1.7 — `src/utils/lineup.js` `buildWeakestSlots` null guard

Change the first line of the function body from
`const mine = leagueLineups.find(l => l.rosterId === myRosterId)?.proj.slots` to
`const mine = leagueLineups?.find(l => l.rosterId === myRosterId)?.proj.slots`.

This makes it consistent with `buildPositionLadders`' `!leagueLineups` guard. Nothing else in
`lineup.js` changes.

### F1.8 — `docs/architecture.md` leagueData block

- **`standings` comment.** Replace it with:
  `// assembled array, sorted wins desc then pointsFor desc: [{ rosterId, ownerId, teamName, managerName, wins, losses, ties, pointsFor, pointsAgainst, rank }]`
  This matches `App.jsx:772-781`.
- **Comment alignment.** The `weeklyScores,` and `weeks,` lines have one extra space before `//`.
  Align them with the block's comment column.

### Dismissed flags (recorded, no action)

- **[cross-repo] mirror text not in commit message.** The Mirror-emission rule makes it Session 1
  output in the task file's `## Cross-repo impact` section, and §7 carries both CR-01 (with the
  "envelope unchanged, `schemaVersion` stays 3" statement) and CR-18. Nothing is owed in a commit
  message.
- **[scope] task file committed.** That is repo convention; the task file is the handoff artifact.

### Done-definition for this pass

- `npm test` (green), `npm run lint` (0), `npm run build` (clean; the pre-existing chunk-size warning
  only).
- Commit as `Fix pass 1: lineup engine test coverage + weakest-slot null guard`.
- Do not push.
- Hand back the SHA and, per new test, whether it passed on the first run.
