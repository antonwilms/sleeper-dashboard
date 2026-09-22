# Lineup pool — only players who can be started (no IR, no taxi)

**Scope:** Portfolio's best-lineup engine (`buildLeagueLineups`) stops pooling IR (`reserve`) and taxi
players, and `rosterTeams[].bench` stops containing taxi players at the source. View-layer only. No
projection, scoring or dynasty-score input changes.

**What moves for the user:** Portfolio's lineup tiles, summary sentence, Starting ten, League ladders,
Weakest slots and the Bench `VS MEDIAN STARTER` bars — but **only** for teams whose computed best
lineup was starting an IR or taxi player. Every other team's numbers must come out identical (§9).

---

## §0 Decisions already made — do not reopen

| # | Decision | Reason |
|---|---|---|
| D1 | **Reverse `lineup-engine.md` D10.** The pool is `starters ∪ bench` minus every id in `reserve` or `taxi`, on **both** sides (`last` and `proj`). | Anton's call (2026-09-22). D10 pooled IR on the argument that lineups are season-level and IR is week-level, and was explicitly marked "Anton may reverse it". Both sides keep one pool so `move` (ladders) still compares like with like. Accepted consequence: a star on short-term IR drops out of his team's projected lineup until activated. |
| D2 | **`bench` excludes taxi at the source** (`App.jsx` roster assembly): `bench = players − starters − reserve − taxi`. | `bench` should mean what Sleeper's BN means. W2a (`weekly-decision-2a-lineup-truth.md` §2) left taxi inside `bench` only to avoid touching Portfolio in that slice; this slice is that touch. |
| D3 | **Every lineup builder excludes by the explicit `reserve`/`taxi` fields, never by trusting `bench`'s composition.** `buildLeagueLineups` filters by id; `/week`'s existing taxi filters (`weeklyLineup.js:140`, `useWeeklyDecision.js:119`) **stay**, with comments updated. | One rule, stated where it is enforced, and unit-testable without `App.jsx`. The W2a test "taxi in both bench and taxi appears in neither" keeps guarding `/week` if D2 ever regresses. |
| D4 | **The three union sites move to one helper, `rosteredPlayers(team)`**, which adds `taxi`. | After D2, `[...starters, ...bench, ...reserve]` silently drops every taxi player from ownership (Portfolio's `ownedRows`, Market's owner column), from the career-fetch id set, and from League → Rosters. Adding `taxi` at three hand-written sites is the exact "fix one call site, miss its twin" failure W1/W2 review caught twice. |
| D5 | **No new UI.** IR/taxi players that stop starting simply fall into Portfolio's Bench section (they are still owned). No IR/Taxi badge on Portfolio rows, no copy change. | Omit rather than approximate — Anton will ask for a marker if he misses it. Portfolio's `STATUS` column already shows an injury designation where Sleeper has one. |
| D6 | `SlotBadge` is **not** changed. Taxi players in League → Rosters now carry `slot: 'Taxi'` and render the text `Taxi` in the Bench style (the existing `styles[slot] ?? styles.Bench` fallback). | Truer than the current `Bench` label; styling is not this slice. |

---

## §1 Findings against live source (verified 2026-09-22)

- **Live league** `1312015497465716736` (Dynasty 040), `GET /league/{id}/rosters`: 44 taxi ids and 21
  reserve ids across 12 rosters. **All 44 taxi and all 21 reserve ids are also in `roster.players`**;
  none is in `roster.starters`. Every roster has taxi players (1–4); 9 of 12 have IR players.
- `App.jsx:821-837` builds each entry with `bench = players − starters − reserve` → taxi sits in
  `bench` today. `taxi` exists as its own field since W2a (`App.jsx:836`), commented as deliberately
  duplicated.
- `lineup.js:172` `buildLeagueLineups` pools `[...starters, ...bench, ...reserve]` → IR and taxi are
  both in the optimisation pool. `lineup.test.js:220` test **16 "Pool includes reserve (IR)"** pins
  the D10 behaviour; `lineup-engine.md` §8 names it as the test to drop on reversal.
- Union sites reading `starters + bench + reserve` (all must keep taxi after D2):
  `App.jsx:344` (ownerMap → `row.ownerTeamName`; readers: Portfolio `ownedRows`, Market owner,
  `teamExposure.js:17`, `marketFilters.js:127-136`, `TeamDetail.jsx:100-106`, `usePlayerProfile.js:161`,
  **and the projection** — `teamContext.js:56` `computeQBQualityByTeam`'s rostered-only branch,
  "projection Step 7b input". So `rosteredPlayers(team)` must yield **exactly the same id set** as the
  old `starters + bench(incl. taxi) + reserve` union, or `projectedPPG` moves silently; §9 proves it),
  `App.jsx:889` (career-history `rosterIds` → `activePlayerIds`), `RostersTab.jsx:10`.
- No other `src/` reader of `.bench`/`.reserve`/`.taxi` exists besides `/week`
  (`weeklyLineup.js:140-142`, `useWeeklyDecision.js:119-130`), which already exclude taxi by field and
  never read `reserve` as candidates.
- `rosteredIds` (`App.jsx:840`, from `roster.players`) is unaffected — it already includes taxi.
- Test fixtures across the repo (`importIntegrity.test.jsx`, `LeagueView.test.jsx`, `Portfolio.test.jsx`,
  `lineup.test.js`) carry **no `taxi` key**. Every new read must default `?? []`.
- `isFilledSlotId` is used in `App.jsx` only at `:822` and `:827` — both move into the new helper, so
  the import drops it (otherwise lint fails on an unused import).

---

## §2 `src/utils/rosterSlots.js` — two helpers (leaf module, still imports nothing)

Update the header comment: the module now owns Sleeper roster → id-list splitting as well as starter
alignment. Add:

```js
// Sleeper's roster.players includes reserve (IR) and taxi ids. Returns four disjoint id lists:
// starters (filled slots only, in set order), bench = players − starters − reserve − taxi, reserve,
// taxi. null/absent reserve or taxi (Sleeper sends null when empty) -> [].
export function splitRosterIds(roster) {
  const starters = (roster?.starters ?? []).filter(isFilledSlotId)
  const reserve = roster?.reserve ?? []
  const taxi = roster?.taxi ?? []
  const excluded = new Set([...starters, ...reserve, ...taxi])
  const bench = (roster?.players ?? []).filter(id => !excluded.has(id))
  return { starters, bench, reserve, taxi }
}

// Every rostered player on a rosterTeams entry, once each, in starters → bench → reserve → taxi order
// (first occurrence wins). The union sites — ownership, the career-fetch id set, the Rosters tab — read
// this so taxi players stay owned now that `bench` excludes them. Absent fields -> [].
export function rosteredPlayers(team) {
  const seen = new Set()
  const out = []
  for (const p of [...(team?.starters ?? []), ...(team?.bench ?? []), ...(team?.reserve ?? []), ...(team?.taxi ?? [])]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}
```

## §3 `src/App.jsx`

**Roster assembly (`:820-838`).** Replace the `starterSet`/`reserveSet` lines and the four list
builders with one `splitRosterIds(roster)` call. **The block must stay exactly 19 lines (`:820-838`),
so `App.jsx`'s total line count is unchanged** — the registry anchors `App.jsx:1009`, `:1032`, `:1047`,
`:1067` (CR-08/09/10) are accurate today and a registry edit is a two-session change. Target shape,
line for line:

```js
      const rosterTeams = standings.map(s => {                                   // 820 unchanged
        const roster = rosterById[s.rosterId]                                    // 821 unchanged
        // Four disjoint id lists — bench = players − starters − reserve − taxi, because Sleeper's
        // roster.players includes reserve and taxi (lineup-pool-startable.md, rosterSlots.js).
        const ids = splitRosterIds(roster)
        return {                                                                 // 825
          rosterId: s.rosterId, ownerId: s.ownerId, rank: s.rank,                // unchanged
          teamName: s.teamName, managerName: s.managerName,                      // unchanged
          starters: ids.starters.map(id => enrichPlayer(id, 'Starter')),
          // weekly-decision-2a-lineup-truth.md §2 — the field /week renders from, aligned by index
          // to startingSlots(rosterPositions).                                  // 829-830 unchanged
          starterSlots: alignStarterSlots(roster.starters ?? []),               // unchanged
          bench: ids.bench.map(id => enrichPlayer(id, 'Bench')),
          reserve: ids.reserve.map(id => enrichPlayer(id, 'IR')),
          // In neither `bench` nor any lineup pool; still rostered — the union sites read
          // rosteredPlayers(team) (ownership, career-fetch ids, the Rosters tab).
          taxi: ids.taxi.map(id => enrichPlayer(id, 'Taxi')),
        }                                                                        // 837
      })                                                                         // 838
```

(The trailing `// NNN` markers above are for this spec only — do not write them.) The three-line
"Deliberately left included in `bench` too …" comment is replaced by the two-line taxi comment. Import
line `:37` becomes `import { alignStarterSlots, splitRosterIds, rosteredPlayers } from './utils/rosterSlots'`
(still one line).

**`:344`** → `for (const p of rosteredPlayers(team)) ownerMap[p.id] = team.teamName`
**`:889`** → `for (const p of rosteredPlayers(team)) rosterIds.add(p.id)`

**Union-site check:** `grep -rnE "\.\.\.\(?[A-Za-z]+\??\.bench" src --exclude='*.test.*'` must hit only
`src/utils/rosterSlots.js` (`rosteredPlayers`) and `src/utils/lineup.js` (§5) — no hand-written
`starters + bench + reserve` union left anywhere else. (`ids.bench`/`ids.reserve` in `App.jsx` are the
split, not a union, and are not matched.)

## §4 `src/components/league/RostersTab.jsx`

`:10` → `for (const p of rosteredPlayers(team))`, importing from `../../utils/rosterSlots`. Nothing else.

## §5 `src/utils/lineup.js` — `buildLeagueLineups` (`:168-190`)

```js
// Pool = players who can be started: starters + bench, minus any id in reserve (IR) or taxi.
// Excluded by the explicit fields, never by trusting bench's composition (lineup-pool-startable.md;
// reverses lineup-engine.md D10). Same pool for `last` and `proj`.
const excluded = new Set([...(team.reserve ?? []), ...(team.taxi ?? [])].map(p => p.id))
const pool = [...(team.starters ?? []), ...(team.bench ?? [])]
  .filter(p => !excluded.has(p.id))
  .map(p => ({ player_id: p.id, position: p.position, full_name: p.full_name }))
```

Accessors (`lastPoints`, `projPoints`), return shape and every other export are untouched. `lineup.js`
stays a leaf (no import added — `lineupViewOnly.test.js` asserts it).

## §6 `/week` — comments only, logic unchanged

- `src/utils/weeklyLineup.js` near `:140`: comment that `bench` no longer contains taxi at the source
  (`App.jsx`, lineup-pool-startable.md) and the filter is kept so `/week` never trusts `bench`'s
  composition (D3).
- `src/utils/weeklyLineup.js:133` — the surplus comment says "excluded from myTeam.bench (App.jsx's
  starterSet)"; `starterSet` no longer exists. Change that parenthetical to `(splitRosterIds in
  rosterSlots.js)`. Rest of the comment unchanged.
- `src/hooks/useWeeklyDecision.js` `:113` (`renderedPlayers` header): same one-line note.

## §7 `src/components/portfolio/Portfolio.jsx` — not touched

No edit, not even the header comment: CR-19's Triggers anchor `portfolio/Portfolio.jsx:370,375,377`,
accurate today, and any added line would stale them. The rule is documented at `lineup.js` (§5).

---

## §8 Tests

Each row's last column is the plausible wrong implementation the test must go red against.

| Test | File | Goes red under |
|---|---|---|
| **16 rewritten → "16. Pool excludes reserve (IR)".** Same fixture as today (starter `p1` 10 PPG, reserve `p2` 20 PPG, `['RB']`). Assert `last.slots[0].player_id === 'p1'` **and** `proj` likewise (add `seasonProjections` p1 10 / p2 20), and `p2` in no slot on either side. | `lineup.test.js` | Current `...reserve` pooling |
| **16b. Taxi id present in both `bench` and `taxi` is not pooled** (the pre-D2 shape). bench `[p1 10, p2 20]`, taxi `[p2]`, `['RB']` → `p1` starts, both sides. | `lineup.test.js` | Pooling by `bench` without the taxi exclusion |
| **16c. Exclusion leaves a slot empty rather than filling it with IR.** `['RB','RB']`, starters `[p1]`, reserve `[p2]` → slot 1 `player_id === null`, `total` equals p1's alone. | `lineup.test.js` | Any "fall back to reserve when short" logic |
| `splitRosterIds`, live-shaped: players `[s1,s2,b1,ir1,tx1,tx2]`, starters `['s1','0','s2']`, reserve `['ir1']`, taxi `['tx1','tx2']` → `{ starters:['s1','s2'], bench:['b1'], reserve:['ir1'], taxi:['tx1','tx2'] }`. | `rosterSlots.test.js` | Dropping `taxi` from `excluded` (old formula) |
| `splitRosterIds` with `reserve: null, taxi: null` → both `[]`, `bench = players − starters`; `splitRosterIds({})` → four empty arrays. | `rosterSlots.test.js` | Spreading a null `reserve` |
| `rosteredPlayers`: includes taxi; order starters→bench→reserve→taxi; an id in both `bench` and `taxi` appears **once** with `slot: 'Bench'`; an entry with no `taxi` key works. | `rosterSlots.test.js` | Omitting taxi / no dedupe |
| **Portfolio integration.** New `describe`: `rosterPositions: ['RB']`, one team "My Team" (rosterId 1): bench `[rb-ok]` proj 10, reserve `[rb-ir]` proj 20, taxi `[rb-tx]` proj 30; all three in `playerRows` with `ownerTeamName: 'My Team'` and in `seasonProjections`. Assert Starting ten row 0's `col-player` contains `rb-ok`'s name; the `bench` testid table lists both `rb-ir` and `rb-tx`. | `Portfolio.test.jsx` | Current pooling (starts `rb-ir`) |

Existing tests: 14, 15, 17, F1-6a and all ladder/weakest/median tests must pass **unchanged** (their
fixtures have empty `reserve` and no `taxi`). The W2a `/week` tests at `weeklyLineup.test.js:113-145`
must pass unchanged. `importIntegrity.test.jsx` / `LeagueView.test.jsx` must pass unchanged (no `taxi`
key → `?? []`). Do not edit any of these fixtures.

## §9 Smoke check (done-definition step 6) — numbers change only where IR/taxi was being started

Recipe: `docs/architecture.md` → *Smoke-testing the running app* (`Colts_420_Reloaded`, Dynasty 040).

**Step 0 — before editing any source**, open `/portfolio` and record via `get_page_text`: the two lineup
tiles (`tile-lineup-last`, `tile-lineup-proj`), `summary-sentence`, the League ladders block and the
Weakest slots block. Also record `/week`'s `BENCH · n` count. And run the **ownership/projection
fingerprint** below in `javascript_tool` on `/portfolio`, keeping its output:

```js
const el = document.querySelector('[data-testid="starting-ten"]')
let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber'))]
while (f && !(f.memoizedProps && 'rosterTeams' in f.memoizedProps && 'seasonProjections' in f.memoizedProps)) f = f.return
const rows = f.memoizedProps.playerRows
const owned = rows.filter(r => r.ownerTeamName != null).map(r => `${r.player_id}:${r.ownerTeamName}`).sort()
;({ owned: owned.length, ownedKey: owned.join('|').length, projSum: rows.reduce((a, r) => a + (Number.isFinite(r.projectedPPG) ? r.projectedPPG : 0), 0).toFixed(6), projN: rows.filter(r => Number.isFinite(r.projectedPPG)).length })
```

**After the change**, on `/portfolio`, run this in `javascript_tool` (dev server only — it imports the
live modules and reads Portfolio's props off the React fiber; debugging use, no source edit):

```js
const el = document.querySelector('[data-testid="starting-ten"]')
let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber'))]
while (f && !(f.memoizedProps && 'rosterTeams' in f.memoizedProps && 'seasonProjections' in f.memoizedProps)) f = f.return
const P = f.memoizedProps
const { buildLeagueLineups } = await import('/src/utils/lineup.js')
const { deriveDataSeason } = await import('/src/utils/environment.js')
const base = { careerStats: P.careerStats, seasonProjections: P.seasonProjections, rosterPositions: P.rosterPositions, season: deriveDataSeason(P.careerStats) }
// Pre-change pool reproduced: starters ∪ bench ∪ reserve, with taxi back inside bench.
const oldL = buildLeagueLineups({ ...base, rosterTeams: P.rosterTeams.map(t => ({ ...t, bench: [...t.bench, ...(t.taxi ?? []), ...(t.reserve ?? [])], reserve: [], taxi: [] })) })
const newL = buildLeagueLineups({ ...base, rosterTeams: P.rosterTeams })
const out = { violations: [], changed: [], benchTaxiOverlap: [] }
P.rosterTeams.forEach((t, i) => {
  const blocked = new Set([...(t.reserve ?? []), ...(t.taxi ?? [])].map(p => p.id))
  if (t.bench.some(p => blocked.has(p.id))) out.benchTaxiOverlap.push(t.teamName)
  for (const side of ['last', 'proj']) {
    const o = oldL[i][side], n = newL[i][side]
    const oldBlocked = o.slots.filter(s => blocked.has(s.player_id)).map(s => `${s.name} (${s.slot})`)
    if (n.slots.some(s => blocked.has(s.player_id))) out.violations.push(`${t.teamName} ${side}: new lineup starts IR/taxi`)
    const same = JSON.stringify(o) === JSON.stringify(n)
    if (!oldBlocked.length && !same) out.violations.push(`${t.teamName} ${side}: changed with no IR/taxi starter`)
    if (oldBlocked.length && same) out.violations.push(`${t.teamName} ${side}: IR/taxi starter but unchanged`)
    if (oldBlocked.length) out.changed.push({ team: t.teamName, side, removed: oldBlocked, oldTotal: o.total, newTotal: n.total })
  }
})
out
```

Both snippets declare top-level `const`/`let`; if `javascript_tool` reports a redeclaration when a
second snippet runs in the same page, reload the page and run it again.

Pass conditions:
1. `violations` and `benchTaxiOverlap` are both empty.
2. **Harness check:** the user's team's `oldTotal`/`newTotal` (or, if the user's team is not in
   `changed`, its unchanged total) — old matches the Step-0 tile values, new matches the tiles now shown.
   If old does not match Step 0, the harness is wrong: stop and report, do not pass the smoke.
3. Report `changed` verbatim in the hand-back (which players were removed from which team's lineup).
   An empty `changed` is a legitimate outcome only if no team's best lineup was starting an IR/taxi
   player — say so explicitly, with the league's 21 IR / 44 taxi counts as context.
4. If the user's team is in `changed`: Step-0 vs now differences in tiles, summary, ladders and weakest
   slots are expected; the removed players now appear in Portfolio's Bench section. If it is **not** in
   `changed`, the user's own Starting ten must be identical to Step 0 (ladder ranks/medians may still
   move because other teams changed — attribute any such move to a team in `changed`).
5. Source fix: `/week`'s `BENCH · n` equals Step 0 (W2a already excluded taxi). League → Rosters still
   lists every taxi player (badge text `Taxi`) and no player named `0`. Market still shows the owner for
   one of the user's taxi players. Portfolio's Bench still lists the user's taxi players.
6. **Ownership and projections unchanged:** the fingerprint re-run after the change is identical to
   Step 0 on all four fields. Any difference means `rosteredPlayers` changed the owned set, which feeds
   `computeQBQualityByTeam` (projection Step 7b) — stop and report; do not pass the smoke.
7. Console clean; `npm run build` clean.

## §10 Docs (same change)

- `docs/architecture.md:90-94` — the `rosterTeams` shape comment: `bench` = players − starters −
  reserve − taxi; drop "bench includes taxi players" and the "/week excludes taxi via the explicit
  field instead" line; add that the union of all four is `rosteredPlayers(team)` (`rosterSlots.js`).
- `docs/signal-registry.md` row "Best-lineup league aggregates" (`:112`) — two cells, nothing else:
  - **Source** cell: append ` Pool: the league's current \`rosterTeams\` starters + bench, excluding
    \`reserve\` (IR) and \`taxi\` (lineup-pool-startable.md).`
  - **Reconstructable** cell: replace `**Reconstructable** (pure function of season totals, projections
    and league settings)` with `**Reconstructable inputs, ephemeral pool** — season totals, projections
    and league settings are reconstructable; the pool is the league's *current* rosters and their
    current IR/taxi designations (Sleeper live state, not captured). View-only and never graded, so
    nothing downstream needs it reproduced`.
  - Why: the old cell was already imprecise (current roster membership is live state) and D1 adds
    another live-state input. Not an "ephemeral inputs must be snapshotted" violation — that invariant
    governs projection inputs captured via `projectionSnapshot.js`; this family is view-only and never
    enters a snapshot. Fires CR-18 (§11).
- `docs/nav/utils.md` — `rosterSlots.js` row (`:57`): add `splitRosterIds(roster)` (four disjoint id
  lists; `bench = players − starters − reserve − taxi`) and `rosteredPlayers(team)` (the deduped union
  of all four, read by every ownership/roster-membership site). `lineup.js` row (`:58`): in the
  `buildLeagueLineups` clause, add "pool = `starters + bench` minus any `reserve`/`taxi` id". The
  `weeklyLineup.js` row (`:55`) stays as is (its "minus taxi" is still what the code does).
- `CLAUDE.md` — no change (`src/components/week/` row still true).

## §11 Cross-repo impact

**CR-01 · Projection snapshot envelope** — triggered: its app-side Triggers list names
"`src/utils/lineup.js` `buildLeagueLineups` (`proj` accessor)". Mirror text, verbatim:

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

Response: **envelope shape unchanged; `schemaVersion` not bumped (stays 3).** The `proj` accessor still
reads `seasonProjections[id].projectedPPG` exactly as before; only which rostered players enter the
view-layer pool changed. `projectionSnapshot.js`, `seasonProjection.js` and `exportData.js` are not
touched. Data-repo action: none. **Do not edit `docs/cross-repo-registry.md`** (mirrored region, CR-24).

**CR-18 · Signal registry rows** — triggered: its app-side Trigger is `docs/signal-registry.md`, edited
in §10. Mirror text, verbatim:

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Response: the edited row is an **app-computed view-layer factor**, not an ingested family — it has no
`data-catalog.md` row and no data-side producer. Row edit (for the record): Source cell gains the pool
definition; reconstructable cell becomes "Reconstructable inputs, ephemeral pool" (exact text in §10).
It is view-only and never captured, so no snapshot-capture or grading-inclusion decision changes.
Data-repo action: none.

No other entry fires: no stat key, served shape, loader or snapshot is touched. **Line anchors:**
`App.jsx` keeps its line count (§3) and `Portfolio.jsx` is untouched (§7), so no registry anchor moves.
`rosterSlots.js`, `lineup.js`, `RostersTab.jsx`, `weeklyLineup.js`, `useWeeklyDecision.js` carry no
line-anchored registry trigger. Known and **out of scope**: CR-07's `src/App.jsx:878` is already stale
(the advStats call site is at `:997` today) — pre-existing, not worsened here; a registry edit is a
two-session change.

## §12 Done-definition

1. `npm test` green (new tests in §8 present and passing; no existing fixture edited).
2. `npm run lint` clean (the dropped `isFilledSlotId` import in particular).
3. `npm run build` clean.
4. Union-site check from §3 holds, and `wc -l src/App.jsx` is identical before and after (§3); `git
   diff --stat` shows no change to `Portfolio.jsx`.
5. Smoke §9 run, all seven pass conditions reported, `changed` pasted verbatim.
6. Hand-back per CLAUDE.md → Workflow convention (SHA/range, files touched, deviations, what each new
   or changed test asserts).

**Touch list (complete):** `src/utils/rosterSlots.js`, `src/utils/rosterSlots.test.js`, `src/App.jsx`,
`src/components/league/RostersTab.jsx`, `src/utils/lineup.js`, `src/utils/lineup.test.js`,
`src/utils/weeklyLineup.js` (comment), `src/hooks/useWeeklyDecision.js` (comment),
`src/components/portfolio/Portfolio.test.jsx`, `docs/architecture.md`, `docs/nav/utils.md`, `docs/signal-registry.md`
(row `:112`, two cells). Anything else is a deviation — stop and ask.

---

## Review record — plan gate, 2026-09-22

plan-reviewer (general-purpose on opus, mandate from `.claude/agents/plan-reviewer.md` inlined — the
type is not registered in this session). Five flags; each verified against live source; all applied.

| Flag | Verdict | Change |
|---|---|---|
| mechanical — §3 grep `\.bench\b`/`\.reserve\b` matches the plan's own `ids.bench`/`ids.reserve` in `App.jsx`, so step 4 could never pass | Correct | Replaced with a union-site grep (`...X.bench` spreads) that must hit only `rosterSlots.js` and `lineup.js` |
| mechanical — `weeklyLineup.js:133` comment names `App.jsx`'s `starterSet`, which §3 deletes | Correct | §6 rewrites that parenthetical to `splitRosterIds` |
| edge-case — `row.ownerTeamName` is a projection input (`teamContext.js:56` `computeQBQualityByTeam`, Step 7b) plus four more readers; nothing proves ownership is unchanged | Premise half-right: `rosteredPlayers` keeps taxi, so the set should be identical by construction — but nothing checked it, and a slip moves `projectedPPG` silently | §1 lists every reader; §9 adds a before/after ownership + `projectedPPG` fingerprint as pass condition 6 |
| invariant — signal-registry row `:112` says "pure function of season totals, projections and league settings", false once IR/taxi membership matters; "CR-18 does not fire" rested on it | Cell was already imprecise (current roster membership is live state). Not an ephemeral-inputs violation — that invariant governs projection inputs captured by `projectionSnapshot.js`; this family is view-only and never snapshotted | §10 edits two cells of row `:112`; §11 emits CR-18's Mirror with response "data action none" |
| (planner, same round) — `docs/nav/utils.md` rows for `rosterSlots.js`/`lineup.js` would go stale (CLAUDE.md Self-maintenance) | — | Added to §10 and the touch list |
| cross-repo — §7's `Portfolio.jsx` comment edit would shift CR-19's accurate `Portfolio.jsx:370,375,377` anchors | Correct; the same applies to `App.jsx`'s accurate `:1009/:1032/:1047/:1067` anchors (§3 as first drafted was net −3 lines) | §7 dropped (`Portfolio.jsx` untouched); §3 specifies a 19-line block so `App.jsx`'s line count is unchanged; §12 gates on `wc -l` |

### Confirmation round (same day)

Same reviewer, scoped to the five flags plus anything the revisions introduced (the 19-line `App.jsx`
block, the union-site grep, the §9 fingerprint, the §10/§11 doc and CR-18 edits). **No flags.** MIRROR
block named CR-01 and CR-18, both already quoted verbatim in §11. Plan gate closed; awaiting Anton's
approval, then Session 2 (sonnet).

---

## Verification — implementation review of `b88c662`, 2026-09-22

implementation-reviewer (general-purpose on opus, mandate from `.claude/agents/implementation-reviewer.md`
inlined). The reviewer confirmed each test goes red under its §8 wrong implementation, the §3 block matches
line for line (`App.jsx` 1325 → 1325), and the union-site grep hits only `rosterSlots.js` and `lineup.js`.
Two flags:

| Flag | Verdict |
|---|---|
| fidelity — `docs/nav/utils.md:55` and the `useWeeklyDecision.test.js:209` comment still name `App.jsx`'s `starterSet`, which `b88c662` deleted | Correct. A **plan gap**, not a deviation: §6 fixed the code-comment copy and §10 wrongly said to leave the nav row alone. Grep confirms these are the only two remaining `starterSet` references in `src/` and `docs/`. → Fix pass 1 |
| cross-repo — the commit message omits the CR-01/CR-18 mirror responses | **No change.** The responses sit verbatim in this task file's §11, which is committed in `b88c662`. The task file is the record, and both responses say the data repo has nothing to do. |

Fingerprint condition 6: `projSum` moved 5246.2 → 5016.7 while `owned`/`ownedKey` stayed identical.
Session 2 reproduced 5016.7 on pre-change code after a fresh reload, and the reviewer confirmed nothing in
the diff can move `projectedPPG`. Accepted as live-data drift between the two readings; ownership held.

## Fix pass 1

Comment and doc text only. No code or test logic changes, and no other file.

1. `docs/nav/utils.md:55` (`weeklyLineup.js` row): replace
   ``since `App.jsx`'s `starterSet` already excludes them from `myTeam.bench`.``
   with
   ``since `rosterSlots.js`'s `splitRosterIds` already excludes them from `myTeam.bench`.``
   Leave the rest of the row unchanged.
2. `src/hooks/useWeeklyDecision.test.js:209-210`: in the comment, replace `App.jsx's starterSet` with
   `splitRosterIds (rosterSlots.js)`, re-wrapping only if the line would exceed the file's width. Keep the
   comment's line count unchanged.
3. Check: `grep -rn "starterSet" src docs` returns nothing. `npx vitest run src/hooks/useWeeklyDecision.test.js`
   is green. Commit as `Lineup pool fix pass 1: stale starterSet references`.
