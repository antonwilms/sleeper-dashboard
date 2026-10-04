# Frozen QB prior — a QB frozen as `chain` never gets his share-weighted value as an unshared prior (P11)

Source: `future_plans/in-season-notes-plan.md` (parent folder) → *Sign-off 2026-10-04 04:55* → **P11**, which
carries the defect P10 recorded (`week-ours-qb-starter.md` §8, plan gate flag 4). Planned 2026-10-04 against
app `422fcfb`. Session 1 (opus) wrote this; Session 2 (sonnet) implements it exactly.

## 0. Goal and fixed decisions — do not reopen

**Bug (latent, live from the 2027 kickoff).** `buildScoringPosteriors` (`src/utils/inSeasonScoring.js`) takes a
player's prior from the frozen pre-kickoff snapshot when one passes the gates (`:189-195`, `projPrior =
frozenPrior.players[id]` = the frozen `projectedPPG`), but decides whether that prior is share-weighted from
the **live** projection (`:222` and `:239-240`, `seasonProjections[id].factors.qbTakeoverBasis === 'chain'`).
Since P6b a `chain` row's `projectedPPG` is per *team* game = `qbStarterPPG × qbStartShare` (≈ 0.16 for a
vet QB2). So a QB who was a backup in the frozen capture (frozen `chain`, frozen `projectedPPG` ≈ 2.6) but
whose live projection no longer calls him one (live basis `incumbent`, e.g. named starter after the capture,
or the incumbent cut/traded) falls into the non-start branch with `isChainRow = false` and gets the frozen
share-weighted 2.6 as his unshared ROS prior. That is the Mariota symptom (P10) again: the ROS everywhere,
and `/week` OURS through P10's `qbStarterBase` second branch (`inSeason` without `start` → `projectedPPG`).

**Why it is unreachable today.** `selectFrozenPriorCandidate` refuses any capture dated before
`PRIOR_MODEL_FROM` (`2026-10-05`), and every 2026 pre-kickoff capture predates it → every 2026 read is
`model-changed` and every record is live. The first frozen prior that can pass is a 2027 capture dated
before the 2027 kickoff. This slice fixes the seam now and proves it with a test that simulates that
rollover end to end.

**Fix.** The frozen trim records which QBs were `chain` **in the capture**; the seam decides "share-weighted
prior" from the source the prior actually came from (frozen basis on a frozen record, live basis on a live
record), and uses the starter prior whenever the prior is share-weighted.

Decisions (Session 1, 2026-10-04):
- **D1 — read the frozen basis explicitly; do not infer it.** `trimFrozenSnapshot` additionally keeps
  `qbChain: { [id]: true }` for every player whose `projection.factors.qbTakeoverBasis === 'chain'` and whose
  `projection.projectedPPG` is finite (the same rows `players` keeps). Rejected alternatives: (a) "every
  frozen QB uses the starter prior" — would move every frozen *non-chain* QB's prior from `projectedPPG`
  (rounded to 0.1, `seasonProjection.js:495,1017`) to `qbStarterPPG` (rounded to 0.001, `:546,1085`), contrary
  to P6b's deliberate "a QB the share never touched keeps projPrior" (test `inSeasonScoring.test.js:695-705`
  pins `inc` at 20, not 20.123); (b) inferring `chain` from `starterPPG − projectedPPG > ε` — a magic
  threshold standing in for a field the capture already carries.
- **D2 — "share-weighted prior" = `frozen ? frozenPrior.qbChain?.[id] === true : liveBasis === 'chain'`.**
  The non-start branch uses the starter prior when the prior is share-weighted **or** the live basis is
  `chain` (the second keeps P6b fix pass 1's live-`chain`/live-`original` path byte-identical, including a
  frozen non-chain QB who is live `chain` — there `starterPrior` is the frozen `starterPPG`, unchanged).
- **D3 — the omit rule (`:222`) is unchanged: it stays on the live basis.** A live-`chain` QB with no live
  state is still omitted. A frozen-`chain` QB whose live basis is not `chain` and who has no live state now
  keeps a record, built on the starter prior — exactly as a live incumbent with no live state keeps one
  today. (No live state is not only "loading": `buildQbLiveStates` returns an empty map whenever a week
  failed to load, so this case is persistent, not transient.)
- **D4 — an old-shape cached trim is a cache miss.** `readAndGate` (`src/api/frozenPrior.js:20`) re-fetches
  and re-trims when the cached trim has no `qbChain` key. A `?? {}` default would silently re-open this exact
  bug for such an entry. No such entry can exist today (no capture has passed the gate, so `readAndGate` has
  never run in production), so this is belt-and-braces at one line; snapshots are immutable, so re-trimming
  is always safe. The cache key stays `frozen-prior/<date>` (no registered name changes).
- **D5 — no `PRIOR_MODEL_FROM` bump, no k re-fit.** `computeNextSeasonProjection` output is untouched
  (`priorModelFrom.test.js` stays green unchanged); this changes only which frozen number the seam reads.
  No 2026 value changes anywhere (every 2026 record is live) — the smoke is a no-change check.
- **D6 — no registry text edit in this slice.** CR-26 wording joins the queued D-58 batch (§6), per the
  registry edit route.

Out of scope: P12 (rookie QB starter level), D-59 (QB k re-fit), anything in `buildQbLiveStates`,
`weeklyOwnProjection.js`, `seasonProjection.js`.

## 1. Findings against live source (`422fcfb`)

- `trimFrozenSnapshot` `src/utils/inSeasonScoring.js:107-128` keeps `players[id] = projectedPPG` (finite) and
  `starterPPG[id] = factors.qbStarterPPG` (finite); returns `{ env, players, starterPPG }`.
- `readAndGate` `src/api/frozenPrior.js:16-28`: `if (trim == null)` → fetch + trim + `setCache`; returns
  `{ status: 'ok', dateKey, players: trim.players, starterPPG: trim.starterPPG ?? {} }` (`:27`).
- `buildScoringPosteriors` `src/utils/inSeasonScoring.js:167-276` (header comment `:160-166`): frozen/live prior choice `:186-200`;
  `starterPrior` `:207-219` (frozen `starterPPG` on a frozen record → live `qbStarterPPG` → `projPrior`); omit
  `:222`; start branch `:225-235` (already uses `starterPrior` — correct on frozen records); non-start branch
  `:236-242` (`isChainRow` on the live basis — **the defect**); rookie `next` `:255-260` already uses
  `starterPrior` for every QB (correct).
- Snapshots carry `projection.factors.qbTakeoverBasis` today: CR-01's invariant is "`projection` as
  unmodified `computeNextSeasonProjection` output", and `factors.qbTakeoverBasis` is emitted on both paths
  (`seasonProjection.js:545,1084`). No data-side capture change is needed.
- `src/api/frozenPrior.test.js` already drives `loadFrozenPrior` with a 2027 capture (`CAPTURE =
  '2027-09-01'`, kickoff `2027-09-09`) under mocked `../utils/cache` and `./dataStore` — the rollover test
  reuses that mocking pattern.
- Existing tests that this slice changes on purpose: `frozenPrior.test.js:55-62` ("a pre-change cache entry
  (no starterPPG) reads as {}"), `:64-68` (the `miss` case's `toEqual`) and `:80-88` (cache entry without `qbChain`) — both now re-fetch (D4);
  `inSeasonScoring.test.js:115-135` `toEqual` on the trim shape gains `qbChain: {}`.

## 2. `src/utils/inSeasonScoring.js`

### 2.1 `trimFrozenSnapshot`
Add `const qbChain = {}`; inside the loop, in the same `if (Number.isFinite(v))` that sets `players[id]`, set
`qbChain[id] = true` when `p.projection.factors?.qbTakeoverBasis === 'chain'`. Return
`{ env, players, starterPPG, qbChain }`. Extend the comment above it (`:107-108`) to: "…plus the finite
projection.factors.qbStarterPPG (the frozen QB starter prior, CR-26) and which of the kept rows were
`qbTakeoverBasis: 'chain'` in the capture (`qbChain`, P11) — the cache never holds the 2.2 MB raw file."

### 2.2 `buildScoringPosteriors` — the non-start branch
Replace `:237-240` (the fix-pass-1 comment and `isChainRow`) with:

```js
      // A share-weighted prior (P6b fix pass 1; P11): the prior is a per-team-game chain value when the row it
      // came from was `chain` — the frozen capture's basis on a frozen record, the live basis on a live one.
      // Then the starter prior is the right base for his real starter scoring; every other row keeps projPrior.
      // A live-`chain` row also takes the starter prior (fix pass 1's live-`original` path, unchanged).
      const liveChain = seasonProjections[id].factors?.qbTakeoverBasis === 'chain'
      const priorChain = frozen ? frozenPrior.qbChain?.[id] === true : liveChain
      nonStartPrior = pos === 'QB' && (priorChain || liveChain) ? starterPrior : projPrior
```

Nothing else in the function changes: not `:222` (D3), not the start branch, not `next`, not the record shape.
In the function's header comment (`:160-166`) change the loader shape at `:161` from `{ status: 'ok', dateKey, players }`
to `{ status: 'ok', dateKey, players, starterPPG, qbChain }`, and add one sentence after the P6b paragraph: "P11: on a
frozen record, whether the prior is share-weighted is the capture's own `qbTakeoverBasis` (`frozenPrior.qbChain`),
never the live one."

## 3. `src/api/frozenPrior.js`

`readAndGate`: change `if (trim == null) {` to `if (trim == null || trim.qbChain == null) {` with a one-line
comment above it: "// A trim cached before P11 has no qbChain — re-trim it (snapshots are immutable), never default
it to {}." Return line `:27` gains `qbChain: trim.qbChain` (after `starterPPG`). Leave `starterPPG: trim.starterPPG
?? {}` as is.

## 4. Tests

### 4.1 `src/utils/inSeasonScoring.test.js`
- `trimFrozenSnapshot` (`:115-135`): the first case's `toEqual` gains `qbChain: {}`. New case "P11: `qbChain`
  marks exactly the kept rows whose capture basis was `chain`": players `c1` (projectedPPG 2.6, factors
  `{ qbStarterPPG: 16.25, qbTakeoverBasis: 'chain' }`), `i1` (18, `{ qbStarterPPG: 18.034, qbTakeoverBasis:
  'incumbent' }`), `c2` (projectedPPG null, basis `chain`), `r1` (RB, 10, `{ qbTakeoverBasis: 'none' }`), `n1`
  (12, no factors) → `qbChain` `toEqual({ c1: true })`.
- In `describe('buildScoringPosteriors — the QB start chain …')` (`:630`), add a frozen fixture
  `fz = { status: 'ok', dateKey: '2027-09-08', players: { bk: 2.1, inc: 20 }, starterPPG: { bk: 14, inc: 20.123 }, qbChain: { bk: true } }`
  and a live projection override in which `bk` is no longer a backup:
  `bkLive = { ...seasonProjections, bk: { projectedPPG: 15, projectedGames: 16, factors: factors(15, 'incumbent') } }`.
  New cases (compute expectations from `kQb` as the neighbours do):
  1. "P11: a QB frozen as `chain` who is live `incumbent` with live state `original` builds ROS on the frozen
     starterPPG, not the frozen chain value" — `args({ seasonProjections: bkLive, frozenPrior: fz, qbLiveStates:
     new Map([['bk', orig]]) })` where `orig` is the same `original` state as the fix-pass-1 case (`:717`):
     `frozen: true`, `ros.prior === 14`, `ros.value === r2((14·kQb + 11·7)/(kQb+7))`, no `start`.
  2. "P11: the same QB with no live state keeps a record on the frozen starterPPG (D3)" — `qbLiveStates: null`
     and `new Map()`: record present, `ros.prior === 14`.
  3. "P11: a frozen non-chain QB is unchanged — frozen projPrior, not the 3-dp starterPPG" — `inc` in the same
     call as case 1 (with `['inc', orig]` in the map): `ros.prior === 20`.
  4. "P11: a frozen non-chain QB who is live `chain` keeps fix pass 1's path (starter prior = frozen
     starterPPG)" — `frozenPrior: { ...fz, qbChain: {} }`, default `seasonProjections` (bk live `chain`),
     `qbLiveStates: new Map([['bk', orig]])`: `ros.prior === 14`.
  5. "P11: a frozen-`chain` QB missing from frozen starterPPG falls back to the live qbStarterPPG — never the
     frozen chain value" — `frozenPrior: { ...fz, starterPPG: {} }`, `bkLive`, `orig`: `ros.prior === 15`.
  6. "P11: a frozenPrior without `qbChain` (non-ok status, or an object built before P11) reads as no chain" —
     `frozenPrior: { status: 'ok', dateKey: '2027-09-08', players: { inc: 20 }, starterPPG: { inc: 20.123 } }`:
     `inc` `ros.prior === 20`, no throw.
- Case 1 must fail on `422fcfb`'s seam (expected 14, received 2.1). Session 2 confirms it red-then-green
  (§6) — that is the proof the test exercises the defect.

### 4.2 `src/api/frozenPrior.test.js`
- `:55-62`: rename to "cache hit with the current trim shape: no fetch, no re-cache"; the cached entry gains
  `qbChain: {}` (and keep its missing `starterPPG` so `starterPPG: {}` is still asserted); the `toEqual`
  gains `qbChain: {}`.
- New case "a pre-P11 cache entry (no `qbChain`) is re-fetched, re-trimmed and re-cached": `getCache` resolves
  an entry without `qbChain`; `tryDataStore` resolves `raw()` with a QB `q` whose factors are
  `{ qbStarterPPG: 16.25, qbTakeoverBasis: 'chain' }`; assert `tryDataStore` called once, `setCache` called
  once with a value whose `qbChain` `toEqual({ q: true })`, and the result's `qbChain` `toEqual({ q: true })`.
- `:80-88`: the cache entry gains `qbChain: {}` so it stays a hit (its assertions are otherwise unchanged).
- `:64-68` (`miss`): the `toEqual` gains `qbChain: {}`; add `expect(setCache.mock.calls[0][1].qbChain).toEqual({})`.
- Any other `toEqual` on an `ok` result gains `qbChain` — run the file and fix only shape mismatches.

### 4.3 New `src/__tests__/qbFrozenPriorRollover.test.js` — the 2027 rollover simulation
Header comment: "P11 (frozen-qb-chain-prior.md) — simulates the first season a frozen prior can pass the
model gate (2027): a QB captured as a backup (`chain`) before kickoff and promoted after it must be valued
at his starter rate, from the frozen read-back through the seam to /week OURS."

Mock `../utils/cache` and `../api/dataStore` exactly as `frozenPrior.test.js:3-14` does (paths relative to
`src/__tests__/`). `beforeEach`: `vi.clearAllMocks()`, `isDataStoreReady.mockResolvedValue(true)`, `listManifestPaths.mockResolvedValue(manifest)`,
`getCache.mockResolvedValue(null)`, `tryDataStore.mockResolvedValue(rawCapture())` (mirrors `frozenPrior.test.js:30-35`).
Cases 3–5 each call `loadFrozenPrior` themselves (no shared state between cases). Import `loadFrozenPrior`, `buildScoringPosteriors`, `applyInSeasonProjection`,
`selectFrozenPriorCandidate`, `buildOwnProjections`, `PRIOR_MODEL_FROM`, `K_ROS_POINTS`.

Fixture:
- manifest: `['snapshots/2026-09-09.json', 'snapshots/2027-09-08.json', 'snapshots/2027-09-10.json']`,
  kickoff `'2027-09-09'`, league `'L1'`, `projectionBasis: 'league'`, live season 2027, `dataSeason` 2026.
- raw capture `2027-09-08` (`capturedAt '2027-09-08T10:00:00Z'`, `leagueId 'L1'`, `targetSeason 2027`,
  `projectionBasis 'league'`): `qbX` (the backup who gets promoted) `projection: { projectedPPG: 2.6,
  factors: { qbStarterPPG: 16.25, qbStartShare: 0.16, qbTakeoverBasis: 'chain' } }`; `qbI` (a plain
  incumbent elsewhere) `projection: { projectedPPG: 18, factors: { qbStarterPPG: 18.034, qbTakeoverBasis:
  'incumbent' } }`.
- live 2027 `seasonProjections`: `qbX` `{ projectedPPG: 17.1, projectedGames: 17, factors: { qbStarterPPG: 17.1,
  qbTakeoverBasis: 'incumbent' } }`; `qbI` `{ projectedPPG: 18.2, projectedGames: 17, factors: { qbStarterPPG:
  18.2, qbTakeoverBasis: 'incumbent' } }`.
- `playerMap`: `qbX` `{ position: 'QB', years_exp: 4, team: 'KC', depth_chart_order: 1, injury_status: null }`,
  `qbI` `{ position: 'QB', years_exp: 7, team: 'BUF', depth_chart_order: 1, injury_status: null }`.
- `careerStats`: `{ 2026: { qbX: { gamesPlayed: 9, fantasyPoints: 60 }, qbI: { gamesPlayed: 17, fantasyPoints: 340 } } }`.
- `currentSeasonTotals`: `{ season: 2027, complete: true, players: { qbX: { gamesPlayed: 1, fantasyPoints: 20,
  scoringBasis: 'league' }, qbI: { gamesPlayed: 1, fantasyPoints: 22, scoringBasis: 'league' } } }`.
- live states: `new Map([['qbX', { kind: 'original', team: 'KC', gamesPlayed: 1, remaining: 16, pNext: null,
  expected: null, fraction: null, starts: 1, startPoints: 20, seasonPoints: 20, residual: null, satLonger: null }]])`.

Cases:
1. "the 2027 candidate passes the model gate (2026's would not)" —
   `selectFrozenPriorCandidate({ manifestPaths, kickoffDate: '2027-09-09' })` → `{ dateKey: '2027-09-08', reason:
   null }`; with kickoff `'2026-09-10'` → `{ dateKey: '2026-09-09', reason: 'model-changed' }`; and
   `expect('2027-09-08' >= PRIOR_MODEL_FROM).toBe(true)`.
2. "the read-back returns the capture's chain set" — `loadFrozenPrior(...)` → `status 'ok'`, `dateKey
   '2027-09-08'`, `players` `{ qbX: 2.6, qbI: 18 }`, `starterPPG` `{ qbX: 16.25, qbI: 18.034 }`, `qbChain`
   `{ qbX: true }`.
3. "a promoted frozen-chain QB is valued at his starter rate through ROS and OURS" — with that
   `frozenPrior`: `buildScoringPosteriors(...)` → `qbX`: `frozen: true`, `priorSource: 'snapshot:2027-09-08'`,
   `ros.prior === 16.25`, `ros.value === Math.round(((16.25·k + 20·1)/(k+1))·100)/100` with
   `k = K_ROS_POINTS.QB`, and `ros.value > 10` (the symptom bound: the bug gives ≈ (2.6·k+20)/(k+1)). Then
   `applyInSeasonProjection(seasonProjections, posteriors, currentSeasonTotals).qbX.projectedPPG ===
   Math.round(ros.value·10)/10`, and `buildOwnProjections({ rows: [{ player_id: 'qbX', team: 'KC' }],
   seasonProjections: scored, impliedIndex: null, currentWeek: 2, playerMap })` → `qbX`: `qbRole 'starter'`,
   `base` equals that `projectedPPG`, `baseKind 'ros'` (value/reason may be `no-line` — not asserted).
4. "the same promotion with no live state (qbWeekly incomplete) also uses the starter rate" — `qbLiveStates:
   new Map()`: `qbX` record present, `ros.prior === 16.25`.
5. "a frozen incumbent keeps his frozen projectedPPG" — `qbI` `ros.prior === 18` (not 18.034, not live 18.2).

If `buildOwnProjections`' real signature or `vegasFactor(null, …)` behaviour makes case 3's OURS call throw,
stop and report rather than inventing an `impliedIndex` shape — read `weeklyOwnProjection.test.js:80-95`
for the existing `indexFor()` helper and use the same shape.

## 5. Docs (same commit)

- `docs/nav/utils.md:48` (`inSeasonScoring.js` row): after "a preseason-`chain` QB with no live state gets no
  record" insert "; whether a QB's prior is share-weighted is read from the row it came from — the frozen
  capture's `qbTakeoverBasis` (`qbChain`, P11) on a frozen record, the live basis otherwise — and a
  share-weighted prior is replaced by the starter prior"; in the same row, where `trimFrozenSnapshot` is
  described (if it lists the trim's keys), add `qbChain`.
- `docs/navigation.md:73` (`frozenPrior.js` row): the return shape `players?` → `players?, starterPPG?,
  qbChain?`; "cached trimmed under `frozen-prior/<date>`" → "cached trimmed under `frozen-prior/<date>` (a
  cached trim without `qbChain` is re-fetched)".
- `docs/integrations.md:437` (Frozen-prior read-back paragraph): "caches only the trimmed result
  (`players[id].projection.projectedPPG` plus the envelope)" → "caches only the trimmed result
  (`players[id].projection.projectedPPG`, the QB `factors.qbStarterPPG`, which kept rows were
  `qbTakeoverBasis: 'chain'`, plus the envelope); a cached trim without that chain set predates P11 and is
  re-fetched and re-trimmed".
- `docs/architecture.md:76` (`frozenPrior` state row): `{ status, reason?, dateKey?, players?, starterPPG? }` →
  `{ status, reason?, dateKey?, players?, starterPPG?, qbChain? }`.
- `CLAUDE.md`, `docs/cross-repo-registry.md`, `docs/signal-registry.md`: no change (registry → §6 D-58 bullet;
  signal registry: no field, source or coverage change — the capture already holds `qbTakeoverBasis`).

## 6. Touch list, done-definition, commit

Touch exactly: `src/utils/inSeasonScoring.js`, `src/utils/inSeasonScoring.test.js`, `src/api/frozenPrior.js`,
`src/api/frozenPrior.test.js`, `src/__tests__/qbFrozenPriorRollover.test.js` (new), `docs/nav/utils.md`,
`docs/navigation.md`, `docs/integrations.md`, `docs/architecture.md`, `.claude/tasks/data-repo-backlog.md` (the D-58 bullet below), and
this task file (commit it). **Not** `src/App.jsx`, `src/utils/weeklyOwnProjection.js`, `src/utils/seasonProjection.js`,
`src/utils/inSeasonConstants.js`, `docs/cross-repo-registry.md`.

Red-then-green (paste both into the hand-back): with only the test files changed, run
`npx vitest run src/__tests__/qbFrozenPriorRollover.test.js src/utils/inSeasonScoring.test.js` and show case
4.3-3 and 4.1-1 failing on the defect (received ≈ the chain value / 2.1) — 4.3-2 fails for the missing
`qbChain` too; that is expected. Then apply §2–§3 and show them green.

Done-definition (CLAUDE.md): `npm test`, `npm run lint` (0), `npm run build` (no warnings beyond the
pre-existing Vite chunk-size notice). Report the suite file/test counts.

Smoke (`.claude/launch.json` preview, Anton's league per `docs/architecture.md` → *Smoke-testing*): this
is a **no-change** check — in 2026 every record is live. On This Week and on one QB's pop-up, confirm the
QB OURS/ROS numbers match `422fcfb` (Mariota ≈ 15.0 OURS if still starting; any QB2 `—`), and the Market
in-season column's frozen flag still reads `model-changed`. Console free of new errors.

Commit: one code commit, message `In-season seam: a QB frozen as chain takes his starter prior — basis read from the capture, not the live projection (P11)`,
with the attribution trailer. Push only after verification is clean.

## Cross-repo impact

Touched contract: **CR-26** (snapshot read-back) — the trim reads one more existing snapshot field
(`players[id].projection.factors.qbTakeoverBasis`). Direction data→app; no envelope change, no
`schemaVersion` bump, no capture change, no data action beyond the byte-sync. Also **CR-01** (below — the captured `inSeason` changes meaning for one
row class). Not CR-25 (no mirrored definition or k changes; `PRIOR_MODEL_FROM` unchanged, D5), not CR-27.
**No registry text edit in this slice** — it joins the queued D-58 batch.

CR-26 Mirror, quoted in full: "This is the one place the app reads its own captures back. Renaming the
`snapshots/<date>.json` template or its manifest key, re-keying captures off UTC date, rewriting a committed
snapshot, dropping `leagueId`/`targetSeason`/`projectionBasis`, or moving `projection.projectedPPG` silently
turns every frozen prior into the live one (flagged `no-snapshot`, `league`, `season` or `basis`) — nothing
errors. A snapshot `schemaVersion` bump above the app's `MAX_SUPPORTED_SCHEMA` makes `tryDataStore` refuse the
file (flag `unavailable`): raise the app ceiling first (data CLAUDE.md Invariant 4, which since this entry no
longer exempts snapshots). A capture gap before kickoff is tolerated by design (latest-before rule); a
capture gap spanning the whole pre-kickoff window leaves the season unfrozen. A frozen prior pins the
projection model: a capture dated before the app's `PRIOR_MODEL_FROM` (CR-25) is refused, so an app model
change after kickoff unfreezes the rest of that season rather than keeping a stale prior. The data side
needs no action for that — it is decided by the app constant against the capture date. Since
qb-takeover-wiring the trim also reads `projection.factors.qbStarterPPG`; moving or renaming it silently
makes every QB's ROS starter prior the live one (`start.priorSource: 'live'`)." — **Answer:** the trim now
also reads `projection.factors.qbTakeoverBasis`; moving or renaming it silently re-opens this defect (a
frozen backup's share-weighted value as his unshared prior). That sentence goes into the D-58 bullet.

- **CR-01** (projection snapshot envelope) — its Triggers name both `buildScoringPosteriors` and
  `trimFrozenSnapshot`; the per-player `inSeason` the snapshot captures is built by `buildScoringPosteriors`.
  Mirror, quoted in full: "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a
  bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README
  snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond
  grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so
  dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since
  in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so
  the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that
  ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player
  `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need
  no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the
  version. **qb-takeover-wiring:** additive keys, no version bump. A grader must not score a
  `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total
  points or segment it (`grading/anchor-policy.md` boundary 5); the same holds for an `inSeason.ros` that
  carries `start`." — **Answer:** envelope and `inSeason` shape unchanged, no `schemaVersion` bump. On a frozen
  record whose capture basis was `chain`, `inSeason.ros` (no `start`) is now built on the starter prior — a
  per-game-played rate, gradeable like any non-`start` ROS; "a `chain` row with no live QB state carries no
  `inSeason`" still holds (the omit rule stays on the live basis, D3). Data side: no action beyond the byte-sync.

Session 2 appends one bullet to D-58 in `.claude/tasks/data-repo-backlog.md` (after the P10 bullet):

> - Also pending from P11 (frozen-qb-chain-prior.md, `<sha>`): **CR-26** — App side: after "…returned by
>   `loadFrozenPrior` as `starterPPG`" append "; since frozen-qb-chain-prior it also keeps which kept rows have
>   `players[id].projection.factors.qbTakeoverBasis === 'chain'`, returned as `qbChain` (a cached trim without
>   it is re-fetched)". Invariant: after "…as the frozen QB starter prior, unmodified like `projectedPPG`."
>   append " Since frozen-qb-chain-prior the app also reads `projection.factors.qbTakeoverBasis` back, to know
>   whether a frozen QB's `projectedPPG` is share-weighted." Mirror: append "Since frozen-qb-chain-prior the
>   trim also reads `projection.factors.qbTakeoverBasis`; moving or renaming it silently gives a QB captured
>   as a backup his share-weighted frozen `projectedPPG` as an unshared ROS prior once the live projection
>   stops calling him a backup (the P10 symptom)." Triggers: unchanged (`trimFrozenSnapshot`, `frozenPrior.js`
>   already listed). **CR-01** Triggers (`[registry-stale]` since P6b, plan gate flag 2): the `trimFrozenSnapshot`
>   parenthetical "(reads served `players[id].projection.projectedPPG`)" becomes "(reads served
>   `players[id].projection.projectedPPG`, `factors.qbStarterPPG` and `factors.qbTakeoverBasis`)". Data side: no
>   action beyond the byte-sync.

## 7. Risks Session 2 should not "fix"

- A frozen-`chain` QB who is live `chain` with live state `original` and a frozen `starterPPG` takes the frozen
  `starterPPG`; with no frozen `starterPPG` he takes the live `qbStarterPPG` (P6b's fallback, flag 8). Both
  intended; do not make the fallback "omit".
- The omit rule stays live-basis only (D3). Do not extend it to `priorChain`.
- Do not bump the cache key or `PRIOR_MODEL_FROM` (D4, D5).

## 8. Findings for Anton (reported, not acted on)

- None beyond the fix. P12 will move `qbStarterPPG` for rookies; this slice is indifferent to its value.

## Review record — plan gate round 1 (2026-10-04)

plan-reviewer: 7 flags, all verified against live source; Session 1 decisions:
1. CR-01 waved off without its Mirror (Triggers name both edited symbols; captured `inSeason` changes meaning
   for frozen-`chain` rows from 2027) → **applied**: CR-01 block with Mirror quoted and answered.
2. CR-01 Triggers `trimFrozenSnapshot` parenthetical stale since P6b → **applied** to the D-58 bullet.
3. `docs/architecture.md:76` states the `frozenPrior` shape → **applied** (§5, touch list).
4. `frozenPrior.test.js:67` `miss` `toEqual` will break → **applied** (§1, §4.2).
5. `buildScoringPosteriors` header loader shape stale → **applied** (§2.2).
6. §1 anchors off by a line → **applied**.
7. Rollover test mock resolutions unstated → **applied** (§4.3 `beforeEach`, cases call the loader themselves).
