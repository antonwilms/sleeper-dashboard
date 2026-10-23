# data-store-raw-fallback — family files fall back to raw GitHub after a jsDelivr failure (CR-29)

Session 1 (opus), 2026-10-23. Planning only — no source edited. Checked against app `ee4939d`,
data repo task file `../sleeper-dashboard-data/.claude/tasks/data-store-cdn-limit.md` (Revision 1 →
"Stage 1 — app repo: family-file raw fallback (CR-29)"). **That section is the approved spec; where
it and the original §5 disagree, Revision 1 wins. Its decisions (D1 jsDelivr-first, raw fallback;
Guards 1 and 2) are settled — do not reopen them.**

**Status: approved by Anton 2026-10-23, with plan-reviewer flags 1–6 folded in (§3.1 declaration
order, §3.5/§6 label retitle, §2 anchor, §5 recordCount, §7 D-86 placement, §8 cold-manifest smoke).**

Review depth: full — changes a CR-29 site (`src/api/dataStore.js` transport) and the read path of
CR-26 (`frozenPrior.js` reads through `tryDataStore`).

Not scoring-affecting: identical bytes from either host. It removes a failure mode (jsDelivr 403
"package size exceeded the configured limit of 50 MB" → silent `null` → `getSeasonTotals` live-API
loop with pre-D-76 classification). No `factors` key, no stat key, no projection module changes.

Session 2 runs on **sonnet**, medium effort.

---

## 1. Why (one paragraph)

jsDelivr intermittently refuses individual family files from this >50 MB repo (cold path + failed
per-file origin fetch → whole-repo tarball fallback → 403). Today `tryDataStore` returns `null` on
any non-OK status **with no log**, and its catch-all logs every throw as "timeout". Callers then take
their live-API fallback (season totals) or degrade to empty (every nflverse family, the frozen prior,
the in-progress season). This slice adds raw.githubusercontent.com as a second host for family files,
tried only after the primary (`VITE_DATA_STORE_URL`) fails, with a per-session host skip and a log
line for every failed fetch.

---

## 2. Touch list (exhaustive)

| File | Change |
|---|---|
| `src/api/dataStore.js` | `rawBaseUrl` (new export), `rawManifestUrl` rewritten on top of it, `failedHosts` module state, `tryDataStore` candidate loop + failure classification + logging; CR-29 header comment (`:28-31`) rewritten |
| `src/api/dataStore.test.js` | New `rawBaseUrl` table; new `describe('tryDataStore family-file fallback (CR-29)')` block (§5). **P9 block `:107-116` unchanged.** No other existing test edited |
| `src/api/frozenPrior.js` | Comment only, `:14-15`: "tryDataStore's 15 s timer" → the new budget (§4). No code change |
| `docs/integrations.md` | URL structure block (`:117-122`), Fetch order step 2 (`:135-137`), HTTP caching paragraph (`:172`), Failure modes table (`:174-185`), both Exports tables (`:187-196`, `:376-384`) |
| `docs/navigation.md` | `dataStore.js` row (`:77`) |
| `docs/cross-repo-registry.md` | CR-29 retitle, invariant, App sites, Tests (§6) |
| `.claude/tasks/data-repo-backlog.md` | One new `D-NN` item asking the data side to strike its app-repo-backlog entry (§7) |

Nothing else. In particular: **no change** to `sleeperStats.js` (incl. `SEASON_TOTALS_CACHE_REVISION`
and its comment — that is Stage 2's), `loadManifest`'s behaviour or timeouts, `MAX_SUPPORTED_SCHEMA`,
the `inProgress` gate, any validator, `bodyMatchesEntry`, `expectedRecordCount`, `wasServedStale`,
`invalidateManifest`, `fetchWithTimeout`, any cache TTL, CR-30's text, or any data-repo file.

---

## 3. `src/api/dataStore.js` — exact spec

### 3.1 `rawBaseUrl(baseUrl)` (exported, new)

```js
export function rawBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return null;
  const m = JSDELIVR_BASE_RE.exec(baseUrl.trim().replace(/\/$/, ''));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : null;
}

export function rawManifestUrl(baseUrl) {
  const raw = rawBaseUrl(baseUrl);
  return raw ? `${raw}/manifest.json` : null;
}
```

`rawManifestUrl`'s outputs are identical to today for every input; its existing `it.each` table
(`dataStore.test.js:585-600`) stays unchanged and must pass. `loadManifest` is untouched.

Compute once at module level: `const RAW_BASE_URL = rawBaseUrl(BASE_URL);`, declared **immediately
after `rawManifestUrl`** (i.e. after `JSDELIVR_BASE_RE` at `:32`). **The declaration must follow the
regex.** `rawBaseUrl` is a hoisted function, but `JSDELIVR_BASE_RE` is a `const`: evaluating
`RAW_BASE_URL` above `:32` (e.g. beside `BASE_URL` at `:3`) throws
`ReferenceError: Cannot access 'JSDELIVR_BASE_RE' before initialization` at module load, breaking the
app and every test that loads the real module. (`BASE_URL` is a module constant; tests stub the env
before each dynamic import, so computing it once is safe.)

### 3.2 Module state

```js
const failedHosts = new Set();   // 'primary' | 'raw' — a host that failed once this page session
```

- Never cleared: not by `invalidateManifest`, not by a later success on that host. Sticky for the
  page session (module lifetime).
- Test isolation is already provided: the file's `beforeEach` calls `vi.resetModules()` and every
  `tryDataStore` test does `await import('./dataStore.js')` after `vi.stubEnv` — the same mechanism
  that resets `manifestPromise`/`sessionDisabled`/`loggedKeys`/`staleServed` today. No reset export
  is added.

### 3.3 Helper (private)

```js
function hostnameOf(url) { try { return new URL(url).hostname; } catch { return url; } }
```

(`new URL` throws on a relative base; logging must never throw.)

### 3.4 `tryDataStore` — everything after the schema-ceiling check (`:145-181` today)

Lines before the fetch (`ENABLED`/`sessionDisabled`, manifest await, `entry`, `inProgress` gate,
schema ceiling + its log) are **unchanged**.

**Candidates.**

```js
const all = [{ host: 'primary', url: `${BASE_URL}/${relativePath}`, ms: 15_000 }];
if (RAW_BASE_URL) all.push({ host: 'raw', url: `${RAW_BASE_URL}/${relativePath}`, ms: 10_000 });
```

**Skip rule — choose `candidates` from `all`:**

1. **Guard 1:** `all.length === 1` → `candidates = all`. A single-candidate base (the CI capture's raw
   `VITE_DATA_STORE_URL`, localhost, any non-jsDelivr base) **never** consults or writes
   `failedHosts`' skip — behaviour is exactly today's per-path behaviour. (Writing `failedHosts` for
   it is harmless but must never cause a skip; simplest is to not add to `failedHosts` when
   `all.length === 1`. Either is acceptable; the test in §5 pins the behaviour, not the set.)
2. **Guard 2:** every host in `all` is in `failedHosts` → `candidates = [all[0]]` (primary, 15 s).
   No `host-skipped` log in this state.
3. Otherwise → `candidates = all.filter(c => !failedHosts.has(c.host))`. For each host removed
   here, `logOnce(\`host-skipped:${host}\`, \`host ${hostnameOf(url)} skipped for the rest of this session after an earlier failed fetch\`)`.

Reachable states of `failedHosts` for a two-candidate base are `{}`, `{primary}`, `{primary, raw}`
(raw is only ever fetched after a primary failure). Rule 3 is written generically anyway.

**Loop.** For `i` over `candidates`:

```
let res, json;
try {
  res = await fetchWithTimeout(url, ms);
  if (!res.ok) { reason = `HTTP ${res.status}`; }
  else json = await res.json();
} catch (err) {
  reason = err?.name === 'AbortError' ? 'timeout'
         : err instanceof SyntaxError ? 'parse-error'
         : 'network';
}
```

(Shape is indicative; Session 2 may structure it differently provided **only** `fetchWithTimeout(...)`
and `res.json()` are inside this `try`, and the four reasons are exactly `HTTP <status>`, `timeout`,
`parse-error`, `network`.)

On a failure (`reason` set):
- if `all.length > 1`, `failedHosts.add(host)`;
- `next = i < candidates.length - 1 ? 'trying raw' : 'no more hosts'`;
- `logOnce(\`fetch-fail:${host}:${relativePath}\`, \`fetch failed host=${hostnameOf(url)} path=${relativePath} status=${reason} — ${next}\`)`;
- `continue` (or, if last, `return null`).

`next` states only what `tryDataStore` knows. It never says "falling back to live API" — that is the
caller's business. (`'trying raw'` is correct as written because the only possible non-last candidate
is the primary with raw after it.)

On success (parsed `json`), **outside** the transport `try`:

```js
let shapeOk;
try { shapeOk = !validate || !!validate(json); } catch { shapeOk = false; }
if (!shapeOk) {
  logOnce(`shape-mismatch:${relativePath}`, `shape mismatch for ${relativePath} — falling back`);  // today's text, unchanged
  return null;
}
```

- A `false` return **or a throw** from `validate` is a shape-mismatch (e.g. `isValidSeasonTotals`
  throws a `TypeError` on `'gamesPlayed' in <primitive>`).
- Shape-mismatch **returns `null` immediately**: no raw fetch, host **not** added to `failedHosts`.
- Then today's `bodyMatchesEntry` / `staleServed` block, verbatim, applied to this body regardless of
  which host served it, then `return json`. (`bodyMatchesEntry`/`expectedRecordCount` cannot throw on
  any parsed JSON value — every property read is guarded — so it needs no `try`.)

**`tryDataStore` must never reject.** Every path returns JSON or `null`.

Remove today's catch-all (`logOnce(\`fetch-fail:${relativePath}\`, \`timeout — falling back …\`)`). The
old `fetch-fail:<path>` log key disappears; the new key is `fetch-fail:<host>:<path>`.

**Unchanged and applied to the succeeding body:** `MAX_SUPPORTED_SCHEMA`, the `inProgress` gate
(checked once against the manifest entry before any fetch, so it applies to raw too), `validate`,
`bodyMatchesEntry`, `wasServedStale`. `fetchWithTimeout` keeps `cache: 'no-cache'` for both hosts.

### 3.5 Header comment (`:28-31`)

Retitle the opening label `// CR-29 — manifest transport.` to `// CR-29 — data-store transport.`
(matching the retitled registry entry). Leave the `dataStore.test.js:582` comment
(`// CR-29 — manifest transport (raw GitHub primary, jsDelivr fallback)`) unchanged — it sits over the
manifest-only tests and stays accurate. Replace "Family files are unchanged: `${BASE_URL}/<path>` via tryDataStore." with a short statement
of the new transport: family files read from `${BASE_URL}/<path>` (15 s) first and, for a jsDelivr
base only, from raw GitHub (10 s) on HTTP error/timeout/parse error/network error; a host that fails
is skipped for the rest of the page session (unless it is the only host, or both have failed). Keep
it ≤ 6 lines; no history.

---

## 4. Time budget (header waits; body reads have no timer, as today)

- **One call:** worst case 15 s + 10 s = **25 s**, only on the call that sees the primary's first
  failure. After that, each call waits on one host: raw 10 s, or primary 15 s under Guard 2.
- **`loadFrozenPrior`** (`FROZEN_PRIOR_TIMEOUT_MS = 30_000` race): its one read is ≤ 25 s of header
  waits, ≥ 5 s left for the body (~0.5 MB gzipped). Exceeding it resolves `timeout` → "live prior,
  flagged", today's outcome on a jsDelivr hang. Raw-only (≤ 10 s) if the primary already failed.
- **`loadCareerHistory`** (14 sequential seasons): raw survives → ≤ 25 s extra once (vs today's worst
  14 × 15 = 210 s). Both fail → 25 + 13 × 15 = **220 s**, 10 s worse than today; accepted (same
  outcome).
- In-flight requests at the moment of first failure each pay their own ≤ 25 s, in parallel.

`frozenPrior.js:14-15` comment becomes: "Bounded by the caller's race (tryDataStore waits ≤ 25 s for
headers across its two hosts, and its timers clear when headers arrive, so a stalled body read has no
limit of its own)." — wording may vary; the number must be 25 s.

### Residual staleness (document, do not fix)

Raw sends `max-age=300`. Once a session has fallen to raw, **every later family path in that session**
is read from raw, so a push < ~5 min old can be served pre-push. For a completed season-totals file
rewritten in place, `bodyMatchesEntry` cannot detect it (no `generatedAt`, unchanged `recordCount`).
Stage 2's CR-30 release rule (data side) closes it for CR-30 releases. For the in-progress file the
residual is ≤ one daily rewrite, no worse than jsDelivr's branch cache today. Sessions with no
jsDelivr failure never read raw.

---

## 5. Tests — all in `src/api/dataStore.test.js`

`src/api/sleeperStats.test.js` mocks `./dataStore` wholesale (`:10-15`) and the nflverse loader tests
replace `tryDataStore` with `vi.fn()`, so the real fallback runs only here.

**Mock conventions in this file (read before writing):** the `beforeEach` default
`fetchSpy.mockResolvedValue(...)` answers *every* un-queued call with `ok: true` and the default
manifest body (`{ files: { 'nfl/season-totals/2023.json': { schemaVersion: 2, inProgress: false, … } } }`).
So every fallback test must queue the raw response explicitly with `mockResolvedValueOnce`, and must
assert URLs (`fetchSpy.mock.calls.map(c => c[0])`) rather than rely on the default. Call 0 is always
the raw manifest.

Constants for the new block:

```js
const BASE = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'
const RAW  = 'https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main'
const P1 = 'nfl/season-totals/2023.json', P2 = 'nfl/season-totals/2022.json'
// manifest with both P1 and P2, schemaVersion 4, inProgress false — queued explicitly as call 0
// (the default mock's manifest lists P1 only, so tryDataStore(P2) would return null before fetching)
// Every manifest entry carries a recordCount equal to expectedRecordCount(path, body) of the body
// that test queues for it (season-totals: Object.keys(body).length; for a P2 served by the default
// mock, whose body is the default manifest object { files }, that is 1). This keeps stale-body
// warnings and wasServedStale out of every test except test 11, which mismatches on purpose.
// Tests 10 and 12 define their own manifest entries under the same rule.
// Warning assertions still filter by substring with warns(spy, …), never count all [dataStore] warns.
const abort = () => Object.assign(new Error('aborted'), { name: 'AbortError' })
const warns = (spy, s) => spy.mock.calls.filter(a => a.some(x => typeof x === 'string' && x.includes(s)))
```

**Keep unchanged:** the P9 test "family-file fetch revalidates with no-cache and adds no query string"
(`it(…)` at `:107-116`). Do not edit it; it must still pass (primary URL unchanged, 2 calls).

**New `rawBaseUrl` table** (`describe('rawBaseUrl')`, beside `rawManifestUrl`'s): the same nine inputs
as `rawManifestUrl`'s table, expected outputs without the `/manifest.json` suffix (`null` stays `null`).

**New `describe('tryDataStore family-file fallback (CR-29)')`:**

1. **Primary 403 → raw.** Queue manifest, `{ ok: false, status: 403 }`, raw body. Asserts: return
   equals raw body; `urls()` = `[RAW/manifest.json, BASE/P1, RAW/P1]` (the third is literally
   `https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main/nfl/season-totals/2023.json`);
   exactly one `[dataStore]` warning containing `host=cdn.jsdelivr.net`, `path=nfl/season-totals/2023.json`,
   `status=HTTP 403`.
2. **Primary timeout → raw.** Primary `mockRejectedValueOnce(abort())`. Same URL/return assertions;
   warning contains `status=timeout`.
3. **Primary parse error → raw.** Primary `{ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token')) }`.
   Same assertions; warning contains `status=parse-error`.
4. **Primary network error → raw.** Primary `mockRejectedValueOnce(new TypeError('Failed to fetch'))`;
   warning contains `status=network`.
5. **Validate false on primary → `null`, no raw, no skip.** Pass `validate: isValidSeasonTotals`,
   primary body `{ p1: { gamesPlayed: 1 } }` (returns `false`; note `{ nope: 1 }` would *throw*
   inside `isValidSeasonTotals`, which is test 6's case). Asserts: `null`; `urls()` has no `RAW/P1`; a shape-mismatch warning;
   then `tryDataStore(P2)` (default-mock body is fine — no validate) fetches `BASE/P2` (primary not skipped).
6. **Validate throws on primary → same as 5.** Validator `() => { throw new TypeError('x') }`.
   Asserts `null` (not a rejection), no raw fetch, shape-mismatch warning (not a `fetch failed`
   warning), next path fetches `BASE/P2`.
7. **Log `next`.** Primary 403 and raw 403 for P1. Asserts: return `null`; one warning with
   `host=cdn.jsdelivr.net` … `— trying raw`; one with `host=raw.githubusercontent.com` … `status=HTTP 403 — no more hosts`.
8. **Skip.** P1: primary 403, raw OK. Then `tryDataStore(P2)` with raw OK. Asserts the P2 call fetched
   only `RAW/P2` (no `BASE/P2` anywhere in `urls()`), and one `host-skipped:` / `skipped for the rest of this session` warning.
9. **Guard 2.** P1: primary 403, raw 403. Then `tryDataStore(P2)` (default mock OK). Asserts the last URL is
   `BASE/P2` and P2's result is non-null; no `RAW/P2` fetch.
10. **Guard 1.** `vi.stubEnv('VITE_DATA_STORE_URL', RAW)` (a raw base; manifest then comes from
    `${RAW}/manifest.json` only). P1: `{ ok: false, status: 403 }`. Then `tryDataStore(P2)`. Asserts
    `urls()` = `[RAW/manifest.json, RAW/P1, RAW/P2]` and P2 non-null; the P1 warning ends `— no more hosts`.
11. **Stale via fallback.** Manifest entry for `nflverse/oline/2025.json` with `recordCount: 10`
    (as in the R4 block); primary 403; raw serves `{ rowCount: 9 }`. Asserts body returned and
    `wasServedStale('nflverse/oline/2025.json') === true`.
12. **In-progress path.** Manifest entry `nfl/season-totals/2026.json` `{ schemaVersion: 4, inProgress: true, … }`;
    `tryDataStore('nfl/season-totals/2026.json', { validate: isValidSeasonTotals, allowInProgress: true })`;
    primary 403, raw serves a valid season-totals body. Asserts the raw body is returned and the raw URL
    was fetched. (This is the call `loadCurrentSeasonTotals` makes, `sleeperStats.js:419`.)

Each test: `vi.stubEnv` then `await import('./dataStore.js')` (fresh module via the file's
`beforeEach`). Tests 1-4 may be one `it.each` over the four primary failures if every assertion is
kept per row.

No existing test in the file asserts on a family-file failure, so none needs editing. If Session 2
finds one that does, **stop and report** rather than edit it.

---

## 6. `docs/` and the index (same change)

Docs follow CLAUDE.md → Self-maintenance: state mechanism, never current availability
(`docsAvailabilityClaims.test.js`).

**`docs/cross-repo-registry.md` CR-29** becomes exactly:

```
#### CR-29 · Data-store transport
- **Invariant:** Manifest read raw-first; family files read from `VITE_DATA_STORE_URL` first, raw GitHub on HTTP error/timeout/parse error; jobs purge every family path, never the manifest.
- **App:** `src/api/dataStore.js` (`rawManifestUrl`, `loadManifest`, `rawBaseUrl`, `tryDataStore`)
- **Data:** `scripts/purge-cdn.mjs` (`purgeAndVerify`)
- **Tests:** `test/purge-cdn.test.mjs`; `src/api/dataStore.test.js`
```

(The added Tests group is checked for existence by `crossRepoIndex.test.js`; the data repo's
`test/registry.test.mjs` only checks `test/` paths.) Do **not** touch CR-30. The capitalised title
"Manifest transport" appears nowhere else in either repo outside `.claude/tasks/`; the lowercase label
"manifest transport" appears at `dataStore.js:28` (retitled per §3.5) and `dataStore.test.js:582`
(left as is).

**`docs/integrations.md`:**
- URL structure block: add the raw family-file line, e.g.
  `https://raw.githubusercontent.com/<owner>/sleeper-dashboard-data/main/<path>   (family-file fallback, CR-29)`.
- Fetch order step 2: "network fail" → note that a failed primary family fetch is retried once on raw
  before step 3.
- HTTP caching paragraph: replace "The manifest alone is read from raw GitHub" framing with: manifest
  raw-first; family files jsDelivr-first with raw as fallback; the per-session skip; the residual
  staleness of §4 (raw `max-age=300`; after a fallback raw serves the rest of the session; an in-place
  rewrite of a completed season-totals file is undetectable by `bodyMatchesEntry` — CR-30's release
  rule covers it).
- Failure modes table: replace the "Specific file 404 or times out (> 15 s)" row with rows for
  (a) primary HTTP error / timeout (> 15 s) / parse error / network error on a jsDelivr base → retried
  on raw (10 s); primary skipped for the rest of the session; warning
  `fetch failed host=… path=… status=… — trying raw`; (b) raw also fails → miss, caller's fallback;
  warning `… — no more hosts`; subsequent paths try the primary again (15 s); (c) non-jsDelivr base →
  single host, no skip, miss on failure with `— no more hosts`. Amend the shape-mismatch row: a
  validator that throws counts as a mismatch; never retried on raw.
- Both Exports tables: add `rawBaseUrl(baseUrl)` — "jsDelivr `gh/<owner>/<repo>@<ref>` base → raw
  GitHub base, else `null`".

**`docs/navigation.md:77`** `dataStore.js` row: add one clause — "family files from
`VITE_DATA_STORE_URL`, raw GitHub fallback (`rawBaseUrl`) with a per-session host skip (CR-29)".

CLAUDE.md: no change needed (no module added/renamed, no invariant text referencing transport).

---

## 7. Backlog line

The tracking entry "Family-file raw fallback (CR-29)" lives in the **data** repo's
`.claude/tasks/app-repo-backlog.md`; this repo-scoped session cannot write it. Per `../CLAUDE.md` →
Cross-repo rule, add to **this** repo's `.claude/tasks/data-repo-backlog.md` item **D-86**, placed
as the last item **under `## Open`** (`:26-63`), immediately before the `---` divider at `:63` — not in
the "Pre-existing data-repo backlog" section (`:130-188`) and not before `## Done`. (D-86 is the next
unused number: D-85 is the highest in the file and `data-repo-backlog-resolved.md` has no D-8x.)

```
### D-86 · Strike app-repo-backlog "Family-file raw fallback (CR-29)" — done in the app
**Found:** data-store-raw-fallback (app `<this slice's SHA>`) · **Blocking:** no · **Size:** trivial

The app side of data-store-cdn-limit Stage 1 landed in app `<SHA>`: `tryDataStore` falls back to raw GitHub after a primary failure, with a per-session host skip; CR-29 is retitled "Data-store transport". Strike through the data repo's `.claude/tasks/app-repo-backlog.md` entry "Family-file raw fallback (CR-29)" with that commit. Stage 2 (provenance warning, CR-30 release rule) is independent and still open.
```

The SHA is the implementation commit; if the backlog line is in the same commit, cite it as
"this commit" and give the SHA in the hand-back. Flag this item in the hand-back.

---

## 8. Done-definition (Session 2)

1. Tests per §5; the P9 block `:107-116` and the `rawManifestUrl` table byte-identical
   (`git diff` shows no hunk inside them).
2. `npm test` — full suite green, including `crossRepoIndex.test.js`, `docsAvailabilityClaims.test.js`,
   `claudeMdSize.test.js`.
3. Contract tests: not applicable (`seasonProjection.js` and stat-key references untouched).
4. `npm run lint` — 0 problems.
5. `npm run build` — clean, no warnings.
6. Smoke: no visible surface changes. Start the app from `.claude/launch.json` (preview config) on a
   **cold manifest**: clear the page's IndexedDB first (the manifest is cached 60 min, and on a warm
   load `loadManifest` returns the cached copy and prints nothing). Confirm it loads, the console
   shows `[perf][dataStore] manifest OK`, and no new `[dataStore]` warnings appear; stop it. Report that the fallback itself is exercised by unit tests only
   (forcing a live jsDelivr 403 is not practical). Do not edit source to simulate failure.
7. Data-repo backlog line per §7.
8. `grep -rn "PROVISIONAL(" src/` — paste output (expected unchanged; this slice adds none).
9. Commit (one commit, or impl + docs if preferred), message ending with the attribution line.
   **Do not push** — push happens after Session 1's verification is clean.
10. Hand back: commit SHA(s), every file touched, every deviation from this file, what each new test
    asserts, the PROVISIONAL inventory, and the flagged backlog item.

**Stop and ask** (do not improvise) if: any existing test other than those named needs editing;
`vi.resetModules()` turns out not to reset `failedHosts`; the registry byte cap (12,000; currently
8,547) or CLAUDE.md ceiling would be breached; or any caller of `tryDataStore` relies on the removed
`fetch-fail:<path>` log key.

---

## Fix pass 1

Approved by Anton 2026-10-23. Source: implementation-reviewer (full) on `ff9a751`, flags 1, 2, 3, 5.
Flag 4 (D-86 cites "this commit") is **not** part of this pass — it is resolved at push time, after
`git pull --rebase`, by replacing "this commit" in D-86 with the final app SHA.

Touch only `src/api/dataStore.test.js` (inside `describe('tryDataStore family-file fallback (CR-29)')`,
`:766` onward) and `docs/cross-repo-registry.md:153`. **No change to `src/api/dataStore.js`** or to any
other test. If any new assertion fails against the current implementation, stop and report — do not
change source to make it pass.

### F1 — Guard 2 test must distinguish primary-only (`dataStore.test.js:864`)

Today P2 is served by the default mock, so the primary succeeds and `not.toContain(RAW/P2)` passes
vacuously. Replace that `it` with one that, after the two P1 403s, queues a **third**
`{ ok: false, status: 403 }` for P2's primary, adds `const warnSpy = vi.spyOn(console, 'warn')`, and asserts:
- `await tryDataStore(P1)` is `null`;
- `await tryDataStore(P2)` is `null`;
- `urls().slice(-1)` equals `[\`${BASE}/${P2}\`]` and `urls()` does not contain `\`${RAW}/${P2}\``;
- the `fetch failed` warning whose text includes `path=${P2}` ends `— no more hosts`;
- `warns(warnSpy, 'skipped for the rest of this session')` has length 0 (§3.4 rule 2: no host-skipped
  log in the Guard 2 state).

Keep the existing success case as a second `it` ("Guard 2: a later primary success is returned") with
its current assertions unchanged.

### F2 — skip "logged once" must be tested across two skipped calls (`dataStore.test.js:848`)

In the skip test, queue one more `respond(body1)` and add a third call after P2:
`expect(await tryDataStore(P1)).toEqual(body1)`. Assert the last URL is `\`${RAW}/${P1}\``, that
`\`${BASE}/${P1}\`` appears exactly once in `urls()` (the original failed fetch only), and that
`warns(warnSpy, 'skipped for the rest of this session')` still has length 1. Keep the existing
assertions.

### F3 — timeout budgets (new `it`s in the same describe)

Two tests with fake timers. Use a hanging fetch that rejects with `AbortError` when its signal aborts:

```js
const hang = (_url, opts) => new Promise((_, reject) =>
  opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
```

Pattern: `vi.stubEnv(BASE)`; queue the manifest with `mockResolvedValueOnce(respond(manifest))`; import;
`await isDataStoreReady()` (so the manifest fetch completes on real timers); then `vi.useFakeTimers()`;
`fetchSpy.mockImplementationOnce(hang)` for each hanging host; start `const p = tryDataStore(P1)`
**without awaiting**; drive with `await vi.advanceTimersByTimeAsync(n)`. Restore with
`vi.useRealTimers()` in a `try/finally` (or an `afterEach` local to these tests).

- **Primary waits 15 s before raw:** primary hangs, raw `respond(body1)`. After advancing 14_999 ms,
  `urls()` does not contain `RAW/P1`; after 1 ms more, it does; `await p` equals `body1`; the
  primary warning contains `status=timeout — trying raw`.
- **Raw waits 10 s:** primary hangs, raw hangs. Advance 15_000 ms (raw is now fetched), then 9_999 ms:
  no `fetch failed` warning containing `host=raw.githubusercontent.com` yet; 1 ms more: `await p` is
  `null` and that warning contains `status=timeout — no more hosts`.

If `advanceTimersByTimeAsync` needs extra microtask flushing for the `await fetchWithTimeout` chain,
Session may add `await vi.advanceTimersByTimeAsync(0)` before the assertions; it must not change the
millisecond boundaries.

### F5 — CR-29 invariant names network errors (`docs/cross-repo-registry.md:153`)

Change `raw GitHub on HTTP error/timeout/parse error;` to `raw GitHub on HTTP error/timeout/parse/network error;`.
Nothing else in the entry changes. (`dataStore.js` header and `integrations.md:185` already say network.)

### Done-definition for this pass

`npm test` (full) green, `npm run lint` 0, `npm run build` clean. No smoke needed (tests + one doc line).
Commit **this task file** (`.claude/tasks/data-store-raw-fallback.md`, currently untracked) together
with the fix in one commit on `main`. Do not commit `.claude/tasks/snapshot-dynasty-capture.md`. **Do not
push.** Hand back: SHA, files touched, deviations, what each new/changed assertion checks.
