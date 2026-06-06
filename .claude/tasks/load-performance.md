# Cold-start load performance — investigation & fix plan

**Type:** performance investigation. Perf-only, behaviour-preserving (projection / dynasty-score / rank outputs must be byte-identical before and after). Analysis written here; **no source edited** in this session.
**Model for implementation:** sonnet for Fixes A/B (config + localized cache-gate fix); the synchronous-compute item (C) is measure-first and likely a separate opus pass if it proves dominant.

---

## TL;DR — the bottleneck is confirmed, with config evidence

The data store is **not being hit at all**. `.env.local` sets the URL to the literal placeholder:

```
VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/<user>/sleeper-dashboard-data@main
```

`<user>` is never substituted. The first `manifest.json` fetch 404s → `sessionDisabled = true` (dataStore.js:43) → the data store is dead for the whole session → **every** season-totals load falls through to the live-API 18-week loop. The feature meant to eliminate the ~7-minute load is silently off.

This is compounded by a **cache-reuse bug**: season-totals written by the live-API path are never reused on the next visit, so the 18-week × ~13-season loop (plus ~44 s of artificial inter-week delays) re-runs on **every** load even though the per-week stats are cached.

Two targeted fixes (A: configure the URL; B: serve live-API-cached season-totals), both output-identical. A third item (synchronous compute over the whole player universe) is real but secondary — instrument first.

---

## Q1 — Is the data store actually hit on cold start? **No. Silently disabled.**

Code path:
- `dataStore.js:3-4` — `BASE_URL = VITE_DATA_STORE_URL ?? 'https://cdn.jsdelivr.net/gh/<user>/sleeper-dashboard-data@main'`. Both the env value (`.env.local`, verified) **and** the fallback contain the literal `<user>`.
- `loadManifest()` (dataStore.js:28-46) fetches `${BASE_URL}/manifest.json` with a 5 s timeout. jsDelivr returns 404 for a non-existent `<user>` repo → `res.ok` false → `throw` → `catch` sets **`sessionDisabled = true`** (line 43), logs once, returns null.
- Every gate then short-circuits for the rest of the session: `isDataStoreReady()` (line 53 `if (!ENABLED || sessionDisabled) return false`), `getManifestEntry()` (line 60), `tryDataStore()` (line 67) all return null/false.
- In `getSeasonTotals` (sleeperStats.js:131-143), `tryDataStore(dsPath, …)` returns null → step (2) skipped → step (3) **live-API 18-week loop** runs for every season (sleeperStats.js:145-212).

The `inProgress` / `schemaVersion > MAX_SUPPORTED_SCHEMA` / shape-validate gates (dataStore.js:74-87) are all downstream of the manifest load and never reached — the manifest never loads. IndexedDB short-circuit for the *manifest* (line 29-30) works, but a cold start has no cached manifest, so it hits the network and fails.

**Root cause: configuration.** The docs ship the placeholder too — docs/integrations.md:141 lists the default URL with `<user>` verbatim, and README's env section (README.md:22-24) only mentions `VITE_CFBD_API_KEY`, never `VITE_DATA_STORE_URL`. A fresh setup is guaranteed to leave the placeholder and run API-only.

## Q3 — Is large-payload data served from cache on return visits? **Partially — and season-totals are not.**

- **`getAllPlayers()` (~5 MB):** cached 24 h (sleeper.js:46, TTL 1440). On return within 24 h it is served from IndexedDB — but as a ~5 MB structured-clone deserialize on the main thread (cache.js:23 `db.get`), and it sits on the `leagueData` critical path (App.jsx:998-1003 `Promise.all`), so it gates the standings first paint. There is no in-memory memo, so it is re-read from IndexedDB on every league switch within a session. Secondary cost.
- **season-totals: NOT reused when sourced from the live API.** This is a code bug, independent of the URL:
  - Live-API path writes with `setCache(cacheKey, totals, 999999)` (sleeperStats.js:211) — plain `setCache`, so **no `sourceLastModified`**.
  - The cache-hit branch (sleeperStats.js:107-122) only returns the cached data inside `if (record.sourceLastModified)` (line 113). For a live-API entry that field is null → the `if` is false → **no return** → falls through to (2) data store (disabled → null) → (3) live-API loop **again**.
  - Net: with the data store off, the full ~13-season × 18-week loop re-runs on **every** visit. The per-week stats *are* cached (`fetchStats`, TTL 10080), so the network mostly hits cache on return — but the loop still pays `await delay(200)` between weeks (sleeperStats.js:200): **13 seasons × 17 delays × 200 ms ≈ 44 s of pure artificial delay per load**, plus 13×18 IndexedDB reads and full re-aggregation on the main thread.
  - (Data-store-sourced entries do not have this bug — they are written with `setCacheWithMeta(… sourceLastModified …)` at line 136-139, so they pass the gate. The bug only bites the live-API fallback, which is exactly the path the placeholder URL forces everyone onto.)

## Q2 — What runs synchronously on the critical path before first meaningful paint?

Two distinct paints:
- **Standings (first meaningful paint)** is gated on `leagueData` only (App.jsx:990-1096; `setActiveTab('standings')` at 995). Blocking work: `Promise.all([getLeagueUsers, getLeagueRosters, getAllPlayers (~5 MB), getLeagueDrafts])` + the matchups `Promise.all`. `getAllPlayers` dominates here.
- **Explorer / projections** is gated on `careerStats`, which is the background career load (App.jsx:1148-1174) — i.e. the multi-minute path above. *After* `careerStats` lands, a synchronous `useMemo` chain runs on the main thread over the whole player universe:
  - `computeEmpiricalAgeCurves(careerStats, playerMap)` — iterates every season × every player (App.jsx:532-535).
  - `computeHistoricalTeamTotals` / `computeHistoricalShares` — iterate all careerStats (App.jsx:554-563).
  - `playerRows` (App.jsx:612-776) — builds rows over **all** careerStats IDs + rostered + rookies and calls `computeDynastyScore` per player.
  - `seasonProjections` (App.jsx:874-902) — loops `playerRowsWithRanks` calling `computeNextSeasonProjection` per player (the 13-step pipeline + career-comp cohort tables). This is the heaviest memo.

These recompute over the whole player universe, not just what's visible, and block the Explorer paint. They are **downstream of** the career-load network cost, so they are secondary to Q1/Q3 — but they cause a main-thread stall once data lands and should be sized by measurement before any change. (Per-read `console.log` in `getCache` (cache.js:25/30/33) also fires hundreds of times during the career loop and the memos — minor synchronous overhead, removable.)

---

## Instrumentation to add FIRST (measure before fixing)

Lightweight, log-only, no behaviour change. Add a tiny timing helper and a handful of marks; read the numbers from the browser console on one cold start and one return visit.

1. **Resolved data-store config + readiness** — `src/api/dataStore.js`, end of `loadManifest()` (both success and catch):
   - On success: `console.info('[perf][dataStore] manifest OK from', BASE_URL)`.
   - On failure: the existing `logOnce('manifest-fail', …)` already logs; add `BASE_URL` to it so the placeholder is visible: `… 'data store disabled — URL was', BASE_URL`.
   - Add a one-time guard log if `BASE_URL.includes('<user>')`: `console.warn('[perf][dataStore] VITE_DATA_STORE_URL is a placeholder — data store will be disabled')`. **This single line surfaces the root cause immediately.**

2. **Per-season path + timing** — `src/api/sleeperStats.js` `getSeasonTotals`: wrap with `const t0 = performance.now()` at entry and, at each `return`, log `console.info('[perf][career]', season, '<path>', Math.round(performance.now()-t0)+'ms')` where `<path>` ∈ `cache-hit | data-store | live-api`. (Partly exists as plain logs — formalize with elapsed + a stable path tag.)

3. **Career load total** — `src/api/sleeperStats.js` `loadCareerHistory`: `const t0 = performance.now()` at top; before `return`, log total ms and a count of seasons by path (accumulate the tags from #2). Expose via a returned `__perf` field? No — keep it log-only to avoid shape changes; just `console.info('[perf][career] total', …, 'ms', pathCounts)`.

4. **leagueData + getAllPlayers timing** — `src/App.jsx` league-load effect: `performance.now()` around the `Promise.all` (lines 998-1003) and a dedicated mark around `getAllPlayers()` alone (wrap it: `const tP = performance.now(); const playerMapPromise = getAllPlayers().then(r => { console.info('[perf] getAllPlayers', Math.round(performance.now()-tP)+'ms'); return r })` inside the array). Log total leagueData assembly ms before `setLeagueData`.

5. **Heavy-memo timing** — `src/App.jsx`: inside `playerRows` (612), `seasonProjections` (874), and `empiricalCurves` (532) memo bodies, bracket the compute with `performance.now()` and `console.info('[perf][memo] <name>', ms, 'rows=', n)` once per recompute. Pure measurement; do not change the memo logic or deps.

**How to read it:** open DevTools console, hard-reload (cold: clear IndexedDB first via Application tab), then reload again (return visit). Expect on the unfixed tree: `[perf][dataStore] … placeholder …`; every season tagged `live-api` on cold start and **still `live-api` on the return visit** (proving the cache-reuse bug); `[perf][career] total` in the minutes; `getAllPlayers` a few hundred ms; `seasonProjections`/`playerRows` memos tens-to-hundreds of ms.

---

## Conditional fixes (keyed to what the measurement shows)

### Fix A — Configure the data store URL (expected: manifest-fail / placeholder log fires)
**Cause:** placeholder `VITE_DATA_STORE_URL`. **Change:**
1. Set `VITE_DATA_STORE_URL` in `.env.local` to the real published path, e.g. `https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main` with the actual GitHub owner (the human must supply the owner; the plan cannot guess it).
2. Harden the code so this can't silently regress: in `dataStore.js`, if the resolved `BASE_URL` contains `'<user>'`, treat the data store as disabled deliberately and `logOnce` a clear message (don't even attempt the fetch). This converts a silent 404-disable into an explicit, greppable warning.
3. Replace the fallback default (dataStore.js:4) so it does not ship a fetchable-looking placeholder — either drop the `??` default (let it be `undefined` → disabled) or keep `<user>` only as a sentinel the guard in (2) catches.

**Behaviour-preserving?** Yes. The live API and the data store are designed to produce identical season-totals (sleeperStats.js:38 "Mirrors lib/sleeper.mjs … so the live and stored shapes agree"; validated by `isValidSeasonTotals`). Switching the *source* does not change `careerStats` content, so all downstream dynasty-score/projection/rank outputs are identical. No cache-TTL change (respects the CLAUDE.md invariant "Do not modify cache TTL values").

**Scope:** `.env.local` (config) + ~6 lines in `dataStore.js` (`loadManifest`/`BASE_URL` guard). Smallest, highest-impact fix.

### Fix B — Reuse live-API-cached season-totals across visits (expected: return visit still tagged `live-api`)
**Cause:** the `if (record.sourceLastModified)` gate (sleeperStats.js:113) drops valid v2-shaped live-API cache entries on the floor. **Change (in `getSeasonTotals`):** when the cached record is v2-shaped (`sample.weeklyStatus !== undefined`) and there is no *confirmed-newer* data-store version, **serve the cache**:
- Keep the existing data-store-staleness check when `sourceLastModified` exists.
- Add an `else` branch: when `sourceLastModified` is absent, consult `getManifestEntry(dsPath)`; if the data store is unavailable (null) **or** has no newer entry, `return record.data` (with `onWeekProgress?.(18, true)`), instead of falling through to the live loop. Only fall through when the manifest confirms a newer/usable data-store version actually exists (genuine migration).
- Separately, gate the inter-week `await delay(200)` (sleeperStats.js:200) so it runs **only after an actual network fetch**, not when the week was served from cache (the delay exists solely to rate-limit live Sleeper calls). This removes the ~44 s of artificial delay on any genuine live-loop run whose weeks are already cached.

**Behaviour-preserving?** Yes. Serving the stored season-totals returns the exact bytes a re-run of the same live loop would reproduce from the same (cached) per-week Sleeper data — output-identical `careerStats`. The only semantic change is *staleness*: a live-API entry is now reused rather than re-pulled when the data store has nothing newer — which is the documented intent of its permanent (999999-min) TTL. No TTL value is modified. Flag for the implementer: if product wants live-API entries to expire/re-pull on a schedule, that is a **separate** decision and out of scope here.

**Scope:** ~10-15 lines in `getSeasonTotals`, one file. Pairs naturally with Fix A (and is the safety net if the data store is ever down).

### Fix C — Synchronous compute over the whole player universe (measure first; likely SEPARATE task)
If `[perf][memo] seasonProjections` / `playerRows` prove to be a multi-hundred-ms main-thread stall after `careerStats` lands, the behaviour-preserving options are: (i) remove the per-read `console.log` in `cache.js:getCache` (free win, no output change); (ii) chunk `computeNextSeasonProjection` across animation frames / yield to the event loop so the Explorer paints progressively. Option (ii) is a larger change that must **not** reorder the playerRows pipeline (CLAUDE.md invariant "playerRows pipeline order is load-bearing") nor move state out of App.jsx (CLAUDE.md "App.jsx owns all state") — so it is **out of scope for this task** and should be its own opus-planned pass if measurement justifies it. Do not fold it in. (i) alone is safe to include.

**Out of scope (flag, do not implement here):** anything that changes a computed value (projection/dynasty/rank), a Web-worker offload of the compute, chunking the memo chain, or altering cache TTLs — all either change behaviour or collide with the invariants above.

---

## Docs updates

- **README.md** (env section, ~lines 20-25): add `VITE_DATA_STORE_URL` to the `.env.local` example and state it must be a real published URL or the data store is disabled (API-only mode).
  - *Before:* fenced block contains only `VITE_CFBD_API_KEY=your_key_here`.
  - *After:* add a line `VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main` and a sentence: "Replace `<owner>` with the GitHub account hosting `sleeper-dashboard-data`. If unset or left as a placeholder, the app runs API-only and the ~7-minute live career load is not avoided."
- **docs/integrations.md** "Data store integration" (line 111+):
  - Line 120 / 141 currently show the `<user>` placeholder as if usable — add an explicit callout that `<user>` must be replaced and that a placeholder/invalid URL → `sessionDisabled` for the session (the failure mode at the top of the "failure modes" table).
  - Update the "Career history loader" fetch-order description to reflect Fix B: a v2-shaped cached season-totals entry is served on return visits when the data store has nothing newer (previously such entries fell through to a live re-fetch).
- **CLAUDE.md** "Required env var" block (under Commands): currently lists only `VITE_CFBD_API_KEY`. Add `VITE_DATA_STORE_URL` with the same "must be real or data store is disabled" note. No invariant text changes (no TTLs, pipeline order, or state ownership touched).

If the implementer ends up only doing Fix A as a pure `.env.local` change with the `dataStore.js` guard, the README/CLAUDE.md env additions and the integrations.md placeholder callout are still required.

## Tests to add

No api-layer test files exist today (`src/api/*.test.js` would be new). Contract tests live in `src/__tests__/`.

- **`src/api/sleeperStats.test.js`** (new) — **Fix B output-equivalence guard (required):**
  - *Input:* mock `getCacheRecord` to return a v2-shaped season-totals record (`{ data: {<pid>: {gamesPlayed, fantasyPoints, dnpWeeks, weeklyStatus:[…]}}, sourceLastModified: null }`); mock `tryDataStore`/`getManifestEntry` to simulate (a) data store unavailable (null) and (b) data store present-but-not-newer.
  - *Expected:* `getSeasonTotals` returns the cached `record.data` **deep-equal**, and `fetch`/the 18-week loop is **never invoked** (spy on global `fetch`, assert 0 calls). This pins "cache served = identical to stored" — the behaviour-preserving guarantee.
  - *Edge cases:* manifest reports a strictly-newer `lastModified` than `sourceLastModified` → must still fall through to refresh (migration preserved); empty/`weeklyStatus===undefined` (pre-phase-5) record → still re-fetches (unchanged).
  - *Delay guard:* assert no `delay` is awaited when weeks come from cache (inject a fake timer or spy).
- **`src/api/dataStore.test.js`** (new) — degradation/guard:
  - Placeholder URL (`BASE_URL` includes `<user>`) → `isDataStoreReady()` resolves false and `tryDataStore()` resolves null **without** attempting a fetch (assert `fetch` not called); `logOnce` fires once.
  - Manifest HTTP error → `sessionDisabled` set; subsequent `tryDataStore` short-circuits.
- **Instrumentation:** none (log-only).
- **Cross-cutting output-equivalence:** the existing `factorsSchema.test.js` / `statKeysContract.test.js` and the projection/dynasty suites already pin compute outputs; since Fixes A/B change only the *source/caching* of `careerStats` (not its content), those suites are the regression backstop and must stay green. No new projection/dynasty test is needed (no compute path changes).

## Cross-repo impact

**Effectively none for contracts — but a deployment dependency to state explicitly.** Fix A makes the app actually consume `sleeper-dashboard-data` at the configured jsDelivr URL. That requires the sibling repo to be **published and reachable** at that URL with the existing `manifest.json` + `nfl/season-totals/<year>.json` shapes — which it already is; no schema, manifest, or field change is introduced here, so the data repo needs **no mirroring change**. The only cross-repo action is operational: confirm the real GitHub owner/branch for the `VITE_DATA_STORE_URL` value. The `MAX_SUPPORTED_SCHEMA` / manifest / season-totals contracts (CLAUDE.md → Cross-repo contracts) are read-only here and untouched.
