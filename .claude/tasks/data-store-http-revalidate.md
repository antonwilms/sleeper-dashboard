# Data-store HTTP revalidation (in-season notes P9)

Source: `future_plans/in-season-notes-plan.md` → "Sign-off 2026-10-04" → P9. Planned 2026-10-04
against app **`c53db19`** (clean, level with origin/main). Small app-only slice: one fetch option,
one test block, one doc paragraph.

## 0. Goal and fixed decisions (settled, do not reopen)

**Problem.** jsDelivr serves every data-store file with
`cache-control: public, max-age=604800, s-maxage=43200`. `fetchWithTimeout`
(`src/api/dataStore.js:22-26`) calls `fetch(url, { signal })` with the default cache mode, so the
browser may answer `manifest.json` from its HTTP cache for up to **7 days**. The 60-minute
IndexedDB TTL on `data-store/manifest` (`MANIFEST_TTL`, `:10`) only controls when the app *asks*.
The answer can still be a week old. Cowork saw this live at 01:18 UTC 2026-10-04: the app had just
written a `data-store/manifest` record whose schedule `lastModified` was 2026-09-25T18:03Z, while the
CDN (fetched with `no-store`) served 2026-10-02T18:39Z. The result was "thru wk 2" records and "—"
for week-3 results in the game log.

**Decision: every data-store fetch uses `cache: 'no-cache'`.** That covers the manifest and the
family files, both of which go through `fetchWithTimeout`. `no-cache` is not `no-store`: the browser
keeps its copy but revalidates it with the edge on every request (`If-None-Match`), and gets a
header-only 304 when nothing changed.

Why `no-cache` for family files and not a `?v=<manifest lastModified>` cache-bust (P9 left the
choice open):
- **jsDelivr ignores the query string at the edge.** Probed 2026-10-04: two random `?v=` values on
  `nflverse/schedule/2026.json` returned the same `age: 5` and the same ETag as the bare URL. A
  `?v=` would only bust the browser cache. That is the same reach as `no-cache`.
- **`?v=` can pin a stale body; `no-cache` recovers.** If the edge serves an old body under a new
  `?v=` (the edge-specific lag P8 found), the browser would cache that old body under the new
  version key for 7 days. `no-cache` asks again on the next fetch and picks up the fresh body once
  the edge has it.
- **Revalidation is cheap and works.** jsDelivr sends weak ETags. A conditional GET for
  `manifest.json` with the current ETag returned `HTTP/2 304` (probed 2026-10-04). Family files are
  fetched only on an IndexedDB miss or a `lastModified` change, so the extra round-trips are few.
- **One code path.** Both fetches share `fetchWithTimeout`, so the change is one line and needs no
  per-caller URL building. No URL changes, so nothing keyed on the URL string can move.

Why this matters beyond the manifest: `loadNflSchedule` (`src/api/nflSchedule.js:64-89`),
`nflGameLogs.js:70-95` and `teamContext.js:86-111` stamp the **manifest's** `entry.lastModified`
onto whatever body `tryDataStore` returns, then cache that pair in IndexedDB. If the manifest were
fresh and the body came from the HTTP cache, the old body would be cached as current. It would
stay that way until the next data change for that file. With `no-cache` on the body fetch, the
browser cannot produce that pair.

**Out of scope (decided):**
- **Edge-level staleness** (one jsDelivr PoP behind origin, P8). Browser cache modes cannot fix it.
  P8's recorded fallback is a commit-pinned URL, which is cross-repo and needs a registry entry.
  Not planned here.
- **A body-vs-manifest freshness guard.** Family bodies carry their own `generatedAt` (schedule
  2026 has `generatedAt: 2026-10-02T18:39:52.475Z` against manifest `lastModified`
  `…18:39:52.477Z`, 2 ms apart). So a guard that rejects a body older than its manifest entry is
  possible. But the two timestamps come from different writes, and the field is not in any
  validator or registry entry. Not built here; listed in §6 as a candidate.
- **Other fetchers.** `src/api/sleeper.js`, `sleeperStats.js`, `ktc.js` (proxy) and `cfbd.js` do
  not hit the data store. Unchanged.
- **The stale IndexedDB manifest already in Anton's browser.** It expires within 60 minutes of being
  written, and the next fetch revalidates. No migration needed.

## 1. Findings against live source (c53db19)

- `fetchWithTimeout` has exactly two callers, both in `dataStore.js`: the manifest at `:39` (5 s) and
  `tryDataStore`'s file fetch at `:98` (15 s). Every data-store family reaches the network only
  through `tryDataStore`. `ktcHistory.js:97` and `ktc.js:127-134` read the **cached** manifest
  object from IndexedDB and never fetch it themselves. Grep: no other `fetch(` in `src/` targets
  `VITE_DATA_STORE_URL`.
- No existing test asserts `fetch`'s second argument (`grep -rn fetch src | grep '\.test\.'` with
  `CalledWith`/`calls[`/`signal` finds nothing), so adding `cache` breaks no assertion.
- jsDelivr CORS: `access-control-allow-origin: *`. The browser adds `If-None-Match` itself when it
  revalidates, which does not trigger a preflight. No CORS change.
- **Registry anchors.** `docs/cross-repo-registry.md` cites `src/api/dataStore.js`
  `getManifestEntry:66` and `isValidSchedule:165`, both currently exact (CR-04, CR-08). Other
  `dataStore.js` anchors there are already stale; that predates this slice and is not fixed here.
  Constraint: **the file's line count stays 209, and no line moves.** All edits are in place on
  lines 21 and 25 (§2). Done-check: `wc -l src/api/dataStore.js` → 209, and `getManifestEntry`
  still at `:66`.
- `docs/signal-registry.md`: no `dataStore` / fetch rows (`grep -c` → 0). No signal changes.

## 2. `src/api/dataStore.js`: two in-place line rewrites

Current `:20-26`:

```js
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}
```

Target (line 21 goes from blank to a one-line comment, line 25 gains `cache`, nothing else changes):

```js
}
// no-cache: revalidate each fetch (ETag → 304) — jsDelivr sends max-age=604800 (integrations.md → HTTP caching).
function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal, cache: 'no-cache' }).finally(() => clearTimeout(id));
}
```

Do not add a parameter or an options object. Both callers want the same mode, and a parameter
would allow a future caller to opt out without anyone noticing.

## 3. Tests: `src/api/dataStore.test.js`

Add one `describe('HTTP cache revalidation (P9)', …)` block after the existing
`'manifest HTTP error → sessionDisabled'` block (around `:94`). It uses the file's existing
`beforeEach` (`fetchSpy` resolves the season-totals-2023 manifest for every call, plus
`vi.resetModules()`) and the global `../utils/cache` mock (`getCache` → null, so the manifest is
always fetched). Use `const URL = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'`
with `vi.stubEnv('VITE_DATA_STORE_URL', URL)`, as the neighbouring tests do.

1. **Manifest fetch revalidates.** `await isDataStoreReady()` → `true`. `fetchSpy.mock.calls[0][0]`
   is exactly `` `${URL}/manifest.json` ``. `fetchSpy.mock.calls[0][1].cache` is `'no-cache'`.
   `fetchSpy.mock.calls[0][1].signal` is an `AbortSignal`, so the timeout wiring survived.
2. **Family-file fetch revalidates, URL unchanged.** `await tryDataStore('nfl/season-totals/2023.json')`
   returns non-null (no validator; the stub body is fine). `fetchSpy` was called twice.
   `calls[1][0]` is exactly `` `${URL}/nfl/season-totals/2023.json` ``: no query string, which pins
   the decision against `?v=`. `calls[1][1].cache` is `'no-cache'` and `calls[1][1].signal` is an
   `AbortSignal`.

Both tests must fail if line 25 reverts to `{ signal: controller.signal }`. Check this once by
reverting temporarily, and say so in the hand-back.

## 4. Docs: `docs/integrations.md`

After the `### Manifest` section's first paragraph ("Fetched once per session … under key
`data-store/manifest`. Shape:", `:153`), insert a short `#### HTTP caching` subsection **after the
shape code block and the `inProgress` paragraph that follows it** (before `### Failure modes`). It
should say four things in about four sentences:
- jsDelivr's `cache-control: public, max-age=604800, s-maxage=43200`.
- Every data-store fetch (manifest and files) goes through `fetchWithTimeout` with
  `cache: 'no-cache'`, so the browser revalidates (ETag → 304) instead of reusing a body for up to
  7 days. The IndexedDB TTL controls *when* the app asks, and the cache mode makes sure the answer
  is current at the edge.
- Why not `?v=`: the edge ignores query strings, and the loaders that stamp the manifest's
  `lastModified` onto the body need a body that is not older than the manifest.
- What it cannot fix: one edge location lagging origin (P8). Refer to it as "P8, in the data repo's
  `.claude/tasks/cdn-purge-verify.md`". That file lives in the sibling repo, not here, so write the
  reference as prose and not as a relative link.
- Offline/slow behaviour: once the IndexedDB TTL has expired, a manifest fetch that can't reach the
  edge within 5 s no longer falls back to the browser's cached copy. It rejects, and the store is
  disabled for the session (the existing "Manifest times out" failure mode). Say this in one
  sentence, and extend the `:174` Failure-modes row with a clause saying the browser copy is not
  reused.

No other doc changes. The `### src/api/dataStore.js` exports table (`:369`) does not change.

## 5. Cross-repo impact

**None.** `fetchWithTimeout` is not on any `CR-NN` trigger list. CR-04's app-side triggers are
`getManifestEntry`, `listManifestPaths`, the validator block and the direct `manifest.files` reads.
The manifest's field names, the served paths and the URLs are all unchanged. The data repo has
nothing to mirror. No registry anchor moves (§1 line-count constraint). No `data-repo-backlog.md`
entry.

## 6. Hand-back notes for Session 1 (report, do not build)

- Candidate follow-up: a `generatedAt`-vs-`lastModified` freshness guard in `tryDataStore`
  (§0 out of scope). Worth building only if edge staleness keeps recurring after P8's checks.

## 7. Touch list, done-definition, commit

Files: `src/api/dataStore.js` (lines 21, 25 only), `src/api/dataStore.test.js`,
`docs/integrations.md` (new subsection + the `:174` row clause). Nothing else.

Done-definition (CLAUDE.md) plus:
- `wc -l src/api/dataStore.js` → **209**. `grep -n "export async function getManifestEntry" src/api/dataStore.js` → `66:`.
  `grep -n "export function isValidSchedule" src/api/dataStore.js` → `165:`.
- The temporary-revert check from §3.
- **Smoke** (user-visible only through freshness): start the `sleeper-dashboard` preview from
  `.claude/launch.json` and load the app once. Click **Clear data store cache**
  (`ClearCacheButton`, which clears `data-store/` and calls `invalidateManifest()`), then reload.
  Then run in the page:
  `performance.getEntriesByType('resource').filter(e => e.name.endsWith('/manifest.json')).map(e => ({ transferSize: e.transferSize, status: e.responseStatus }))`.
  Expect `transferSize > 0` on the post-reload entry (jsDelivr sends `timing-allow-origin: *`, probed
  2026-10-04, so `transferSize` is not zeroed for this cross-origin entry). A browser HTTP-cache hit reports `0`, while a
  304 revalidation or a full 200 reports non-zero. Also confirm the game log's 2026 season shows
  week-3 results (not "—"). Report both values. A screenshot is not sign-off.

One commit:
`P9: revalidate data-store fetches (cache: 'no-cache') — jsDelivr max-age=604800 let the browser serve a week-old manifest`

## Plan-gate record (2026-10-04)

plan-reviewer returned 4 flags. Session 1 verified each against live source and decided:

1. **[mechanical, medium] §4 linked `.claude/tasks/cdn-purge-verify.md`, which does not exist in
   this repo.** Confirmed: the file is in `sleeper-dashboard-data/.claude/tasks/`. **Applied:** §4
   now asks for a prose reference naming the data repo, not a relative link.
2. **[edge-case, low] `no-cache` turns the offline/slow fallback into session disable.** Confirmed:
   `:39` has a 5 s timeout and `:48-51` sets `sessionDisabled`. Before this change, the HTTP cache
   could answer even after the IndexedDB TTL expired. **Decision kept:** a working edge answers a
   revalidation with a header-only 304, well inside 5 s, and silently serving a week-old manifest
   is the bug being fixed. **Applied:** §4 now asks for a sentence in the subsection plus a clause
   on the `:174` Failure-modes row. No code change.
3. **[edge-case, low] `transferSize` is zeroed cross-origin without `Timing-Allow-Origin`.**
   Probed: jsDelivr sends `timing-allow-origin: *`. The check is valid as written. **Applied:** a
   note in §7. No change to the check.
4. **[registry-stale, low] CR-04's Triggers list (`docs/cross-repo-registry.md:76`) omits
   `src/api/ktc.js:131-135`'s direct `manifest.files` read.** This was already there and is not
   caused by this slice. **Not applied here.** Per the registry edit route, it goes in the next
   registry sync batch (D-58), not in this task.

## Verification record (2026-10-04)

Session 2 left the diff uncommitted (deviation from done-definition step 8). implementation-reviewer
read the working-tree diff on c53db19 and found no fidelity, scope, invariant, test-honesty or
cross-repo issues. The §2 hunks are byte-exact (`-21 +21`, `-25 +25`). Both §3 tests fail if
line 25 reverts. The §4 subsection and the `:174` clause are present. It raised two process flags:

1. **Uncommitted, no SHA.** Resolved: Session 1 committed the reviewed diff with the §7 message.
   The diff was not altered.
2. **Build chunk-size warning, no baseline.** Resolved: the warning was already there before this
   slice. Earlier slices recorded it on a clean tree (e.g. `player-popup-season-phase.md`'s
   verification record), and this diff adds about 18 bytes to the bundle.

Session 1 re-ran the gates: `npm test` 142 files / 2801 passed; `npm run lint` 0 problems;
`wc -l src/api/dataStore.js` = 209. Smoke (Session 2): `manifest.json` resource entry
`responseStatus 200`, `transferSize 4204`. The smoke did **not** exercise a 304 revalidation (fresh
pane storage), and the game-log week-3 view was not opened. Both are left for Anton's live check.
