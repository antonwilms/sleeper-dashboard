# registry-slim (app side) — replace the mirrored cross-repo registry with a slim index

**Session 1:** opus, 2026-10-17, planned from the parent folder. **Session 2: sonnet**, medium effort,
**started in the parent folder** `~/Claude Projects/Sleeper Dashboard` (this task edits `../CLAUDE.md`,
which is outside the repo, and its data-side twin must run in the same session right after it).
Not scoring-affecting: no constant, projection or served data shape changes.

**Decision (Anton, 2026-10-17):** replace the cross-repo contract registry with the minimum safe
bookkeeping. This file plans the how; the what is settled.

**Twin task file:** `../sleeper-dashboard-data/.claude/tasks/registry-slim.md` (data side).

**Decisions (Anton, 2026-10-17, after the first plan review):** (1) delete data `lib/registry.mjs` +
`scripts/registry-audit.mjs` in the data PR; (2) close D-74 as obsolete and move it to the resolved
file (A6); (3) index cap **12,000 bytes** (A2); (4) sibling reads: a read-only `Read(...)` allow rule
in each repo's `.claude/settings.json` (A5b) **and** reviewer text that treats an absent, refused or
erroring sibling read as NOT VERIFIED (A5). The two CR-24 `[cross-repo]` review flags are accepted
as format-only: this change retires CR-24, so no `## Cross-repo impact` section is written.

---

## Ordering between repos (read first)

1. **This file, steps A1–A8** — write the new index and everything that points at it. **Commit on
   `main`. Do NOT push yet.**
2. **Data task file** — data repo branch `registry-slim`, delete the data copy and mirror machinery,
   open a PR. The data-side `test/registry.test.mjs` reads *this* repo's working tree, so it sees
   the new index before anything is pushed.
3. **Hand back** both (app SHA + data PR). Session 1 verifies both diffs.
4. **After Anton merges the data PR**, push app `main` (done-definition step 9).

Why this order: ids never dangle (the new index exists locally before the data copy is deleted, and
the old app registry stays on GitHub until the data copy is gone), and the data repo's daily
`registry-mirror.yml` (06:41 UTC, checks out app `main` from GitHub) never sees a mismatched pair —
pushing the app index first would red that run and then the next `cron-deadman` run.

---

## Verified context (2026-10-17, live files)

- `docs/cross-repo-registry.md` is 188,363 bytes with **29** entries, CR-01…CR-29 (the brief said
  30). CR-20 is already retired (2026-10-02). The data copy's mirrored span is byte-identical by
  `test/registry-mirror.test.mjs` (data) and `.github/workflows/registry-mirror.yml` (data).
- **No app-side test verifies registry definition sites today.** The only app test touching the
  registry is `src/__tests__/docsAvailabilityClaims.test.js`, which *excludes* it by name because
  it was mirrored (CR-24).
- The data `README.md` has **no** sentinel span — its "mirror span" is a pointer section
  (`## Cross-repo contract registry`, README.md:1695-1697). Handled in the data task file.
- `.claude/tasks/data-repo-backlog.md`: lines 1–139 are header + `## Open` + `## Watch` +
  `## Pre-existing…`; line 141 `## Done` to EOF (line 1075) is every resolved item, all struck
  through. Nothing resolved sits above line 141. Open item D-74 is lines 63–66, preceded by the
  blank line 62 (line 61 ends D-73; line 67 is blank; line 68 is `---`).

---

## A1 · Rewrite `docs/cross-repo-registry.md` (whole file)

Replace the entire file with exactly the content below (between the `````` fences, not including
them). 8,052 bytes (cap 12,000, A2). Every site below was checked against live source on 2026-10-17: all 34 App
symbols and 30 Data symbols resolve whole-word in the file they are grouped under, and every
`Tests` path exists.

**Grammar (the tests in A2 and the data task enforce it):**
- Entry header: `#### CR-NN · <name>`. Retired: `#### CR-NN · <name> — retired YYYY-MM-DD`, no fields.
- Live entry fields, each one line: `- **Invariant:** …`, `- **App:** …`, `- **Data:** …`, optional
  `- **Tests:** …`.
- `App` / `Data` / `Tests` value: the literal `none`, or groups joined by `; ` (semicolon, space).
  Group = `` `path` `` optionally followed by ` (` + `` `sym` `` list joined by `, ` + `)`. No prose.
- `Tests` paths starting `src/` are app tests; starting `test/` are data tests.

``````markdown
# Cross-repo contract index

Contracts shared with sleeper-dashboard-data. Ids are permanent; a retired id keeps its header. Rule: `../CLAUDE.md` → *Cross-repo rule*. Sites are `path` (`symbol`) groups joined by `; `; each repo's test checks its own side. Not contracts: `nflverse/playerids.json`, `nflverse/oline/`.

#### CR-01 · Projection snapshot envelope
- **Invariant:** The v3 envelope the app writes (`targetSeason`, `scoringSettings`, `inputStatus`, `projectionBasis`) is what the data gate and grader read.
- **App:** `src/utils/projectionSnapshot.js` (`writeProjectionSnapshot`)
- **Data:** `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord`); `scripts/grade-snapshot.mjs` (`gradeSnapshot`)

#### CR-02 · season-totals schema & rows
- **Invariant:** App schema ceiling ≥ written version; rows are players, `TEAM_*` (never summed) and DEF; scoring keys survive.
- **App:** `src/api/dataStore.js` (`MAX_SUPPORTED_SCHEMA`, `isValidSeasonTotals`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`, `prunePlayerStats`)
- **Tests:** `test/sleeper.test.mjs`

#### CR-03 · Enrichment schemas
- **Invariant:** Every enrichment field the app reads exists, same shape.
- **App:** `src/utils/enrichmentLookup.js` (`getCoaching`)
- **Data:** `lib/enrichment.mjs` (`validateEntry`)

#### CR-04 · Manifest contract
- **Invariant:** Manifest field names are a public API; unknown families are ignored.
- **App:** `src/api/dataStore.js` (`getManifestEntry`, `listManifestPaths`)
- **Data:** `lib/manifest.mjs` (`updateManifestEntry`)

#### CR-05 · CFBD statType keys
- **Invariant:** The pivoted envelope and statType names match the app's normalizer.
- **App:** `src/api/cfbd.js` (`normalizeCollegeStats`)
- **Data:** `lib/cfbd.mjs` (`pivotCfbdRows`)

#### CR-06 · nflverse roster & draft
- **Invariant:** Shapes and `MIN_ROSTER_IDS = 1500` match.
- **App:** `src/api/nflRoster.js` (`MIN_ROSTER_IDS`)
- **Data:** `lib/nflverse.mjs` (`MIN_ROSTER_IDS`)

#### CR-07 · nflverse advstats
- **Invariant:** Shape and `MIN_ADVSTATS_ROWS = 250` match; never scored.
- **App:** `src/api/advStats.js` (`MIN_ADVSTATS_ROWS`)
- **Data:** `lib/nflverse.mjs` (`MIN_ADVSTATS_ROWS`)
- **Tests:** `src/__tests__/advStatsViewOnly.test.js`

#### CR-08 · nflverse schedule
- **Invariant:** Shape and `MIN_SCHEDULE_GAMES = 200` match.
- **App:** `src/api/dataStore.js` (`isValidSchedule`)
- **Data:** `lib/nflverse.mjs` (`MIN_SCHEDULE_GAMES`)
- **Tests:** `src/__tests__/scheduleViewOnly.test.js`

#### CR-09 · nflverse gamelogs
- **Invariant:** Shape (absent key = null) and `MIN_PLAYERGAME_ROWS = 3000` match.
- **App:** `src/api/dataStore.js` (`isValidGameLogs`)
- **Data:** `lib/nflverse.mjs` (`MIN_PLAYERGAME_ROWS`)
- **Tests:** `src/__tests__/gameLogsViewOnly.test.js`

#### CR-10 · nflverse teamcontext
- **Invariant:** Shape (era abbr keys) and `MIN_TEAMCONTEXT_ROWS = 60` match.
- **App:** `src/api/dataStore.js` (`isValidTeamContext`)
- **Data:** `lib/nflverse.mjs` (`MIN_TEAMCONTEXT_ROWS`)
- **Tests:** `src/__tests__/teamContextViewOnly.test.js`

#### CR-11 · Snap & red-zone usage stat keys
- **Invariant:** `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` survive aggregation.
- **App:** `src/utils/usageMetrics.js` (`computeUsageFactors`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)
- **Tests:** `test/sleeper.test.mjs`

#### CR-12 · `pass_cmp` stat key
- **Invariant:** `pass_cmp` survives aggregation.
- **App:** `src/utils/efficiencyMetrics.js` (`passerRating`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)

#### CR-13 · `rec_air_yd` stat key
- **Invariant:** `rec_air_yd` survives aggregation.
- **App:** `src/utils/outlookPositionStats.js` (`buildTeamShareTotals`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)

#### CR-14 · `calculateFantasyPoints` port
- **Invariant:** The data port scores exactly as the app, incl. pre-2022 first downs.
- **App:** `src/utils/fantasyPoints.js` (`calculateFantasyPoints`, `scoreSeasonStats`)
- **Data:** `lib/fantasyPoints.mjs` (`calculateFantasyPoints`, `scoreSeasonStats`)
- **Tests:** `test/fantasy-points-season.test.mjs`

#### CR-15 · R3-FIT factor-multiplier mirror
- **Invariant:** Mirrored factor constants, gates and models reproduce the app exactly.
- **App:** `src/utils/seasonProjection.js` (`computeNextSeasonProjection`)
- **Data:** `lib/projectionFactors.mjs` (`REGRESSION_MODELS`); `lib/panel.mjs` (`predictFullPipeline`)
- **Tests:** `test/step4-mirror.test.mjs`; `test/rookie-mirror.test.mjs`; `test/qb-mirror.test.mjs`

#### CR-16 · Era-accurate team-code remap
- **Invariant:** Both map an abbr to the same era code per season, alias first.
- **App:** `src/utils/playerTeam.js` (`eraTeam`); `src/utils/nflStats.js` (`SCHEDULE_TEAM_ALIAS`)
- **Data:** `lib/nflverse.mjs` (`eraTeam`); `lib/sleeper.mjs` (`SCHEDULE_TEAM_ALIAS`)

#### CR-17 · KTC value snapshots
- **Invariant:** A bare `{ name, team, value, position }` array; picks keyed by `name`.
- **App:** `src/utils/ktcHistory.js` (`isValidKtcSnapshot`)
- **Data:** `scripts/update-ktc.mjs` (`updateKtc`)

#### CR-18 · Signal registry rows
- **Invariant:** Every ingested field has a current signal-registry row.
- **App:** `docs/signal-registry.md`
- **Data:** `data-catalog.md`

#### CR-19 · Market Efficiency stat keys
- **Invariant:** `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`, `rec_drop` survive.
- **App:** `src/utils/usageEfficiency.js` (`METRIC_META`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)
- **Tests:** `src/__tests__/statKeysContract.test.js`

#### CR-20 · `fan_pts_allow_*` DEF-row keys — retired 2026-10-02

#### CR-21 · In-progress season-totals reads
- **Invariant:** An `inProgress` season is partial; scored only via `inSeasonScoring.js`.
- **App:** `src/api/sleeperStats.js` (`loadCurrentSeasonTotals`)
- **Data:** `scripts/update-nfl.mjs` (`shouldSkipCompletedSeason`)

#### CR-22 · Data repo executes the app
- **Invariant:** `localStorage` keys, boot auto-load, `[snapshot] wrote` marker and IndexedDB layout stay fixed.
- **App:** `src/App.jsx` (`LS_USER`, `LS_LEAGUE`); `src/utils/cache.js` (`DB_NAME`)
- **Data:** `scripts/capture-snapshot.mjs`

#### CR-23 · Team-season summary pack (parked)
- **Invariant:** If built, values equal `sumRegOff`/`sumRegDef`.
- **App:** `src/utils/environment.js` (`sumRegOff`, `sumRegDef`)
- **Data:** none

#### CR-24 · Registry mirror drift check — retired 2026-10-17

#### CR-25 · In-season evidence and fitted k
- **Invariant:** Evidence definitions match; each `K_*` equals its pinned file.
- **App:** `src/utils/inSeasonConstants.js` (`IN_SEASON_CONSTANTS_SOURCE`)
- **Data:** `lib/inSeasonEvidence.mjs` (`fitK`)
- **Tests:** `src/__tests__/inSeasonConstants.test.js`; `test/inseason.test.mjs`

#### CR-26 · Snapshot read-back (frozen prior)
- **Invariant:** Snapshots are immutable, `inProgress: false`, carrying raw `projectedPPG`.
- **App:** `src/api/frozenPrior.js` (`loadFrozenPrior`)
- **Data:** `scripts/register-snapshots.mjs` (`registerSnapshots`)
- **Tests:** `src/__tests__/priorModelFrom.test.js`

#### CR-27 · QB takeover constants
- **Invariant:** QB features, coefficients and chain equal the pinned files.
- **App:** `src/utils/qbTakeoverConstants.js` (`QB_TAKEOVER_SOURCE`)
- **Data:** `lib/qbTakeover.mjs` (`expectedStarts`); `lib/qbRookieLevel.mjs` (`levelTable`)
- **Tests:** `src/__tests__/qbTakeoverConstants.test.js`; `test/qb-mirror.test.mjs`

#### CR-28 · Season-totals absence classification
- **Invariant:** `'D'` only in a played team-week: `gp ≠ 1`, or (2016+) rostered ACT/INA/RES/PUP.
- **App:** `src/utils/durabilitySignals.js` (`classifyInjurySeason`)
- **Data:** `lib/absence.mjs` (`classifyAbsences`); `lib/durabilityMirror.mjs`
- **Tests:** `test/durability-mirror.test.mjs`

#### CR-29 · Manifest transport
- **Invariant:** Manifest read raw-first; jobs purge every family path, never the manifest.
- **App:** `src/api/dataStore.js` (`rawManifestUrl`, `loadManifest`)
- **Data:** `scripts/purge-cdn.mjs` (`purgeAndVerify`)
- **Tests:** `test/purge-cdn.test.mjs`
``````

The file ends with a single trailing newline after the CR-29 `Tests` line. If any App symbol fails
A2's test, **stop and report** — do not substitute a different symbol.

**Dropped by design** (git + task files hold it): Direction, Triggers, Mirror, all line anchors,
consumer lists, history and rationale. The data copy's two `> *Note:*` paragraphs collapse into the
preamble's "Not contracts" clause.

---

## A2 · New test `src/__tests__/crossRepoIndex.test.js`

Guards what the slim index needs and nothing tests today: ids keep resolving (~100 docs cite them),
the 12,000-byte cap holds, and every App site and app test named exists. Style follows
`src/__tests__/claudeMdSize.test.js` (cwd = repo root, `node:fs`, vitest).

```js
import { statSync, existsSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// docs/cross-repo-registry.md is the cross-repo contract index (../CLAUDE.md → Cross-repo rule).
// This test guards the app half: ids run CR-01…CR-NN with no gap, reuse or renumbering (docs in
// both repos cite them), the index stays under its 12,000-byte cap, every App site resolves here, and
// every app test it names exists. The data repo's test/registry.test.mjs checks the Data half of
// the same file. Symbols are matched whole-word in the named file, never by line number.

const INDEX = 'docs/cross-repo-registry.md'
const CAP_BYTES = 12000
const RETIRED_IDS = ['CR-20', 'CR-24']
const MIN_LIVE_IDS = 29
const GROUP_RE = /^`([^`]+)`(?: \((`[^`]+`(?:, `[^`]+`)*)\))?$/

function parseIndex(text) {
  const entries = []
  let current = null
  for (const line of text.split('\n')) {
    const header = line.match(/^#### (CR-\d+) · (.+)$/)
    if (header) {
      current = { id: header[1], title: header[2], fields: {} }
      entries.push(current)
      continue
    }
    const field = current && line.match(/^- \*\*([A-Za-z]+):\*\* (.+)$/)
    if (field) current.fields[field[1]] = field[2]
  }
  return entries
}

function parseGroups(value) {
  if (value === 'none') return []
  return value.split('; ').map((group) => {
    const m = group.match(GROUP_RE)
    if (!m) throw new Error(`malformed site group: ${group}`)
    const symbols = m[2] ? [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]) : []
    return { file: m[1], symbols }
  })
}

function symbolResolvesIn(symbol, source) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(source)
}

const isRetired = (e) => / — retired \d{4}-\d{2}-\d{2}$/.test(e.title)

describe('cross-repo contract index', () => {
  const text = readFileSync(INDEX, 'utf8')
  const entries = parseIndex(text)

  it('stays at or under its 12,000-byte cap', () => {
    const size = statSync(INDEX).size
    expect(size, `${INDEX} is ${size} bytes; cap is ${CAP_BYTES}. Prune in the same commit.`).toBeLessThanOrEqual(CAP_BYTES)
  })

  it('numbers ids CR-01…CR-NN contiguously, once each, in order', () => {
    const ids = entries.map((e) => e.id)
    expect(ids.length).toBeGreaterThanOrEqual(MIN_LIVE_IDS)
    ids.forEach((id, i) => expect(id).toBe(`CR-${String(i + 1).padStart(2, '0')}`))
  })

  it('keeps retired ids as bare headers and gives every live entry Invariant, App and Data', () => {
    for (const id of RETIRED_IDS) expect(isRetired(entries.find((e) => e.id === id))).toBe(true)
    for (const e of entries) {
      if (isRetired(e)) expect(Object.keys(e.fields), e.id).toEqual([])
      else for (const f of ['Invariant', 'App', 'Data']) expect(e.fields[f], `${e.id} ${f}`).toBeTruthy()
    }
  })

  it('resolves every App site in this repo', () => {
    const failures = []
    let checked = 0
    for (const e of entries.filter((x) => !isRetired(x))) {
      for (const { file, symbols } of parseGroups(e.fields.App)) {
        if (!existsSync(file)) { failures.push(`${e.id}: missing ${file}`); continue }
        const src = readFileSync(file, 'utf8')
        for (const s of symbols) {
          checked++
          if (!symbolResolvesIn(s, src)) failures.push(`${e.id}: \`${s}\` not in ${file}`)
        }
      }
    }
    expect(checked, 'guard may be vacuous').toBeGreaterThanOrEqual(30)
    expect(failures).toEqual([])
  })

  it('names only app tests that exist', () => {
    const missing = entries
      .flatMap((e) => (e.fields.Tests ? parseGroups(e.fields.Tests).map((g) => [e.id, g.file]) : []))
      .filter(([, file]) => file.startsWith('src/') && !existsSync(file))
    expect(missing).toEqual([])
  })

  it('parses only the documented site grammar', () => {
    expect(parseGroups('none')).toEqual([])
    expect(parseGroups('`a.js` (`x`, `y`); `b.md`')).toEqual([
      { file: 'a.js', symbols: ['x', 'y'] },
      { file: 'b.md', symbols: [] },
    ])
    expect(() => parseGroups('`a.js` (x)')).toThrow(/malformed/)
    expect(() => parseGroups('see `a.js`')).toThrow(/malformed/)
  })

  it('matches symbols whole-word only', () => {
    expect(symbolResolvesIn('eraTeam', 'export function eraTeam(')).toBe(true)
    expect(symbolResolvesIn('eraTeam', 'const eraTeamMap = {}')).toBe(false)
  })
})
```

`checked >= 30`: the index names 34 App symbols today; the floor stops a parser regression from
passing by checking nothing.

---

## A3 · `src/__tests__/docsAvailabilityClaims.test.js`

The index is now app-owned and editable here, so it moves **into** the guard's scope (it states
mechanism only; the A1 text contains none of the `ALTERNATIVES` phrases).

1. Comment block, lines 23–25: the sentence that starts at the end of line 23
   (`` `docs/cross-repo-registry.md` ``), runs through line 24 (`is EXCLUDED, deliberately and by
   name…`) and ends on line 25 (`…cannot land from this repo.`) is replaced by:
   `` `docs/cross-repo-registry.md` (the cross-repo index) is in scope: it is app-owned and no longer mirrored. ``
   Re-wrap to the block's ~100-column `// ` lines. The `The docs/design_*, docs/dynasty-*, …`
   sentence that follows on line 25 continues unchanged.
2. `IN_SCOPE_GLOBS`: append `'docs/cross-repo-registry.md',` after `'docs/signal-registry.md',`.
3. `EXCLUDED_GLOBS`: delete the line `'docs/cross-repo-registry.md', // mirrored, CR-24 byte-identity`.
4. The case at line 240, `it('excludes docs/cross-repo-registry.md explicitly (mirrored, CR-24)', …)`,
   becomes:
   ```js
   it('includes docs/cross-repo-registry.md (app-owned index, no longer mirrored)', () => {
     expect(IN_SCOPE_FILES).toContain('docs/cross-repo-registry.md')
     expect(EXCLUDED_GLOBS).not.toContain('docs/cross-repo-registry.md')
   })
   ```
   This changes what the case asserts (the reverse of before) because the behaviour changed — the
   hand-back must say so.
5. `ALLOWLIST` (lines 145–162): delete the whole second object — the one with
   `file: 'CLAUDE.md'`, `substring: 'is not listed there does not exist for review purposes'` and its
   `why` (lines 154–161, from its `{` through its `},`). A4.1 deletes the CLAUDE.md sentence it
   allowlists; left in place it would red two cases ("every allowlist entry still matches a real
   sentence" and "reports the line the matched phrase is actually on"). The first object (`an engine
   that doesn't exist`) stays. The comment at :294 ("none of the three does") was already stale and
   is out of scope.

---

## A4 · `CLAUDE.md` (app)

1. Replace the whole subsection from `### Cross-repo contract registry (with sleeper-dashboard-data)`
   (line 139) through the paragraph ending `…lands in **both** repos' registries in the same change.`
   (line 149) — keep the `---` that follows — with:
   ```
   ### Cross-repo contracts (with sleeper-dashboard-data)

   Contracts shared with the data repo are indexed in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), checked by `src/__tests__/crossRepoIndex.test.js`. The rule for changing one is `../CLAUDE.md` → *Cross-repo rule*.
   ```
2. Line 181: `See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data).`
   → `See [Cross-repo contracts](#cross-repo-contracts-with-sleeper-dashboard-data).`
3. Line 203, the whole paragraph `Cross-repo mirroring is not restated here: … and they apply to every change.`
   → `Cross-repo changes follow `../CLAUDE.md` → *Cross-repo rule*, which applies to every change.`
4. Lines 212–214: in the scope list, change
   `` `docs/signal-registry.md`, and `src/` comments — not `docs/cross-repo-registry.md` (mirrored,\nCR-24) or the dated design/strategy docs. ``
   to
   `` `docs/signal-registry.md`, `docs/cross-repo-registry.md`, and `src/` comments — not the dated\ndesign/strategy docs. ``
5. Leave done-definition item 7 (data-repo backlog) unchanged — it is still the repo-scoped path the
   new rule names. Leave every `CR-NN` citation elsewhere in the file unchanged.

Ceiling check: the file shrinks (~1.3 KB removed); `claudeMdSize.test.js` stays green.

---

## A5 · Reviewer subagents (app)

### `.claude/agents/plan-reviewer.md`

1. Frontmatter `description`: `against the cross-repo contract registry.` → `against the cross-repo contract index.`
2. Replace the whole `## 3. Cross-repo intent` section (heading through the `[registry-gap]`
   paragraph, i.e. up to but not including `## 4. Slice size`) with:
   ```
   ## 3. Cross-repo

   Read docs/cross-repo-registry.md — the cross-repo contract index, one block per `CR-NN` (the rule is in `../CLAUDE.md` → *Cross-repo rule*). For every entry whose **App** site the plan touches — the file, or a listed symbol, changed, renamed, moved or deleted — or whose contract the planned change reads or writes:

   - Read that entry's **Data** sites live under `../sleeper-dashboard-data/`. Read-only: never write there. If the sibling repo is absent OR a read of it is refused or errors, report the touched contract as NOT VERIFIED (`cross-repo` flag) — never as verified, and never infer its contents.
   - Flag the plan if it leaves the two sides inconsistent. It must either change the data side in the same piece of work (a parent-folder session) or add a line to `.claude/tasks/data-repo-backlog.md` and name it for the hand-back.
   - Flag a renamed, moved or deleted listed site whose index entry the plan does not update in the same change, and a new cross-repo coupling the plan does not add to the index in the same change.

   Tag each of these `cross-repo`, naming the `CR-NN` id and the `file:symbol` on each side.
   ```
3. `## Output`: replace from `Emit up to two blocks, in this order:` through the end of the file with:
   ````
   Emit one block:

   ```
   FLAGS
   FLAG [category]: <one-line problem> — <file:symbol or line anchor>
   …
   ```

   Categories: `mechanical`, `shape`, `ordering`, `edge-case`, `invariant`, `strategy`, `cross-repo`, `slice-size`.

   If there are no flags, output exactly: "No blocking issues found." and nothing else.
   ````
   (`MIRROR` block, `registry-gap`, `registry-stale` and the standing app-side re-verification duty
   are gone.)

### `.claude/agents/implementation-reviewer.md`

Replace the whole `## 4. Cross-repo carry-over` section (heading through the backlog bullet, up to
but not including `## Output`) with:
```
## 4. Cross-repo carry-over

Read docs/cross-repo-registry.md. For every entry whose **App** site the diff touches:

- Read that entry's **Data** sites live under `../sleeper-dashboard-data/` (read-only — never write there). If the sibling repo is absent OR a read of it is refused or errors, report the touched contract as NOT VERIFIED (`cross-repo` flag) — never as verified, and never infer its contents. Flag the diff if the two sides are now inconsistent and neither the same piece of work changed the data side nor `.claude/tasks/data-repo-backlog.md` gained a line for it.
- A renamed, moved or deleted listed site must be updated in the index in the same diff. `crossRepoIndex.test.js` reds on a dangling App site; it cannot see a coupling the index never listed — that one is yours.
- If the change surfaced work belonging to the data repo, `.claude/tasks/data-repo-backlog.md` must be appended in the same change, naming the commit that found it and whether it blocks. Flag an append that is missing, and flag one that names no commit or no blocking status.
```
Categories line stays as is (`cross-repo` already present).

---

## A5b · `.claude/settings.json` (app) — read-only sibling allow rule

Merge a `permissions` key into the existing object; keep `env` and `hooks` exactly as they are. Result:
```json
{
  "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" },
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/verify-on-stop.sh", "args": [] } ] }
    ]
  },
  "permissions": { "allow": ["Read(~/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data/**)"] }
}
```
Read-only by construction: `Read(...)` only — no `Edit`, `Write`, `Bash` or `additionalDirectories`.
Validate with `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.

---

## A6 · Prune `.claude/tasks/data-repo-backlog.md`

Work from a copy of the pre-change file (`cp data-repo-backlog.md /tmp/backlog-before.md`) so every
line number below refers to the **pre-change** file.

1. **D-74 → resolved (decision 2).** Build the resolved D-74 block from pre-change lines 63–66:
   - line 63's heading text is wrapped in `~~` after `### `, matching the other Done headings:
     ```
     ### ~~D-74 · `extractRegistryRegion` should anchor to line-start sentinels, like the drift check~~
     ```
   - then a new line `**✅ RESOLVED 2026-10-17 — obsolete: registry-slim removed extractRegistryRegion**`;
   - then pre-change lines 64–66 byte-for-byte.
2. Create `.claude/tasks/data-repo-backlog-resolved.md`, concatenated in this order:
   1. `# Data-repo backlog — resolved items (moved verbatim from data-repo-backlog.md, 2026-10-17)`
   2. a blank line
   3. pre-change lines 141–142 (`## Done` and the blank line after it)
   4. the resolved D-74 block from step 1, then one blank line
   5. pre-change lines 143–1075 byte-for-byte (`sed -n '143,$p'`).
   Do it with `sed`/`cat`, not by retyping.
3. In `data-repo-backlog.md`: delete pre-change lines 62–66 (the blank separator and the D-74
   block, so D-73 is followed by the blank line and `---`), delete pre-change lines 141–EOF, and
   append in their place:
   ```
   ## Done

   Resolved items live in [data-repo-backlog-resolved.md](data-repo-backlog-resolved.md), moved verbatim.
   ```
4. Header bullet "**When the batch runs** … then struck through here with its data-repo commit."
   → change `then struck through here with its data-repo commit.` to
   `then struck through and moved to data-repo-backlog-resolved.md with its data-repo commit.`
   Change nothing else in lines 1–139 — every other Open/Watch item stays byte-identical.
5. Checks, reported in the hand-back:
   - `diff <(sed -n '143,1075p' /tmp/backlog-before.md) <(tail -n +$((N)) data-repo-backlog-resolved.md)`
     is empty, where N is the line of the resolved file holding the D-45 heading
     (`grep -n '^### ~~D-45' data-repo-backlog-resolved.md`);
   - `diff <(sed -n '64,66p' /tmp/backlog-before.md) <(grep -A4 '^### ~~D-74' data-repo-backlog-resolved.md | tail -n 3)` is empty;
   - `diff <(sed -n '1,61p;67,139p' /tmp/backlog-before.md) <(sed -n '1,134p' data-repo-backlog.md)`
     shows only the step-4 header line change.

---

## A7 · Parent `../CLAUDE.md` (not under version control — edit carefully, no commit)

1. Insert this section immediately before `## Task files are history` (after the
   `## Where to start a session` paragraph and its blank line). 693 bytes, under the 800-byte limit:
   ```
   ## Cross-repo rule

   Shared contracts are indexed in `sleeper-dashboard/docs/cross-repo-registry.md`. Any session may read the sibling repo; a repo-scoped session never writes to it.

   - Before changing a definition site listed in the index, read the sibling's side of that entry.
   - Keep both sides, and the index, consistent in the same piece of work: from a parent-folder session edit both; from a repo-scoped session add a line to `.claude/tasks/data-repo-backlog.md` (app) or `.claude/tasks/app-repo-backlog.md` (data) and flag it in the hand-back.
   - If the sibling repo is not on disk, say so and flag it; never assume its contents.
   - A new coupling gets an index entry in the same change.
   ```
2. `### The Claude.ai project`: delete the two sentences beginning `Its one residual case is a
   **brand-new cross-repo coupling absent from the registry**` through `Extending an existing entry
   stays in-repo.` The paragraph ends at `…nothing waits on it.`
3. In the workflow convention block, `implementation-reviewer` bullet text and the model table are
   unchanged. Rule (a) (`…touches a CR-NN entry…`) is unchanged.
4. Before/after byte counts of `../CLAUDE.md` go in the hand-back.

---

## A8 · Done-definition, commit (no push)

1. `npm test` — green, including the new `crossRepoIndex.test.js` and the changed
   `docsAvailabilityClaims.test.js`, plus `claudeMdSize.test.js`. `.claude/settings.json` parses (A5b).
2. `npm run lint` — 0 problems. 3. `npm run build` — clean.
4. No running-app smoke: no user-visible surface.
5. Commit on `main` (one commit): `docs: slim cross-repo registry to an index; retire CR-24 mirror (registry-slim)`.
   `../CLAUDE.md` is not in the repo and is not committed.
6. **Do not push.** Go to the data task file. Push only after Anton merges the data PR and Session 1
   verification is clean (`git pull --rebase origin main` first).

---

## Tests to add / change / retire (app)

| Test | Change | Asserts |
|---|---|---|
| `src/__tests__/crossRepoIndex.test.js` | **new** | index ≤ 12,000 B; ids CR-01…CR-NN contiguous, unique, ≥29; CR-20/CR-24 retired bare headers; every live entry has Invariant/App/Data; every App group's file exists and each listed symbol resolves whole-word in it (≥30 checked); every `src/` Tests path exists; grammar parser rejects prose and unbacktick'd symbols; whole-word matching |
| `src/__tests__/docsAvailabilityClaims.test.js` | case at :240 **inverted**; `ALLOWLIST[1]` **removed** | index is in scope, not excluded (because it is now app-owned); the allowlist no longer seeds the deleted CLAUDE.md sentence |
| all `*ViewOnly`, `*Constants`, `statKeysContract`, `priorModelFrom` tests | **unchanged** | — |

No app test is retired (none checked the registry's content).

## Docs / README

App `README.md` and `docs/` (other than the index) do not describe the mirror process — verified by
grep 2026-10-17; they only cite `CR-NN` ids, which keep resolving. No change.

## Out of scope (leave as is, do not "fix")

- Every `CR-NN` citation in any file other than those edited above.
- `src/utils/weeklyUsage.js:147` comment saying the registry cites its lines — now stale (the index
  cites no line numbers) but harmless; not part of this slice.
- `.claude/tasks/*` other than the two backlog files.

## Cross-repo

This slice is itself the two-sided change: data side in the twin task file, run in the same
parent-folder session, in the order above. CR-24 is retired by A1 and implemented by the data file.

## Hand-back (to Session 1)

App commit SHA (unpushed), every file touched (incl. `../CLAUDE.md` with byte counts), every
deviation from this file, the A6 verbatim-move check output, and what each new/changed test
asserts. Then the data hand-back (see twin).

## Decisions already taken (do not reopen)

See the *Decisions* paragraph at the top: D-74 closed (A6), cap 12,000 (A2), settings allow rule
(A5b) and NOT VERIFIED reviewer wording (A5), CR-24 review flags accepted as format-only.
