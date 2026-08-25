# In-season season-totals — close the live-season blind spot

Found by the FPA ranking's review (`.claude/tasks/fpa-defense-ranking.md` §0). **The app has no
in-progress-season data anywhere**, so it renders last-completed-season numbers on every surface for
the whole of a live season. Market's *"Fixed to the 2025 season"* header is that fact already visible.

**Review changed the size of this materially.** Planning framed §2 as "add a cron." It is not: the
validator rejects a partial season by construction, the script cannot resolve its own year, and
combining a weekly run with D-1 introduces a silent data-quality regression. §2 is now a code change
with a workflow attached, not a workflow.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `loadCareerHistory` builds `for (let s = 2012; s < currentSeason; s++)` — the only writer of `setCareerStats` | `sleeperStats.js:240`; `App.jsx:854,858` |
| **`validateNflSeason` requires ≥30 players with `gamesPlayed >= 14`** — arithmetically impossible before week 14, realistically ~week 15–16 once byes land. It also throws on `playerCount < 400` | data `lib/validate.mjs` |
| Validation runs at `scripts/update-nfl.mjs:58`, **before any write branch**, and a throw exits non-zero | measured |
| **Sleeper returns 0 entries for `stats/nfl/2026/1` today** — so from merge until week 1 has data, `totals` is `{}` and the `< 400` floor throws first | live, verified |
| **A red weekly run raises a second alert** — `check-crons.mjs:163` fails any discovered workflow whose latest run is not `success` | measured |
| **`update-nfl.mjs` emits no step output** and does not import `setStepOutput`, unlike roster/advstats/schedule/gamelogs/teamcontext/oline | measured |
| **The `nfl` subcommand has no current-season default** — `updateNfl` throws `--year is required` when absent, unlike `schedule`/`roster` | `update-nfl.mjs:33` |
| **`update-nfl.mjs` DOES read `nflverse/schedule/<year>.json`** whenever `inProgress` (D-1's bye inference) — so there **is** an ordering dependency on the Friday schedule job | `update-nfl.mjs:53` |
| The refusal guard tests **`existingEntry.inProgress`** (the manifest's stored value), while `inProgress = year >= currentSeason` is recomputed per run | `update-nfl.mjs:41,79` |
| `state.season` is **already `"2026"` in preseason**, so `inProgress` stays true for months past week 18 | live |
| **Saturday already carries three jobs** (gamelogs `47 13`, playerstate `11 14`, oline `37 14`), plus a daily dead-man. Sharing a day at a different hour is the norm — "all seven days taken" was not a real constraint | measured |
| `nflRoster.js` uses `setCacheWithMeta(…, 999999, {…})` **plus** a `lastModified` comparison — layered, not alternatives — and passes **no** `allowInProgress` | `nflRoster.js:65,77,95-101` |
| `ktcHistory.js:147` is the **only** `allowInProgress: true` precedent | measured |
| `buildFpaTable` reads the current season from **`careerStats?.[season]`** — which §3 deliberately keeps the live season out of | `opponentStrength.js:47,66,116` |

---

## 2. Data repo — three code changes, then the cron

### 2.1 `validateNflSeason` must accept a partial season

Today's floor is `gamesPlayed >= 14`, count `≥ 30`. Before week 14 **no player can satisfy it**, so a
weekly job throws every run for ~15 of 18 weeks — and `check-crons.mjs` turns each failure into a
second recurring alert.

**Make the floor self-calibrating rather than absolute:** derive `maxGames = max(p.gamesPlayed)` and
require ≥30 players at `gamesPlayed >= max(1, maxGames - 3)`.

- On a **complete** season `maxGames = 17` → threshold 14 — **numerically identical to today**, so no
  historical behaviour changes.
- Mid-season `maxGames = 5` → threshold 2 — still catches a broken scrape (a partial scrape yields a
  *few* players, not thirty clustered near the leader).

Keep every other assertion unchanged: the `< 400` count floor, the length-18 `weeklyStatus`, the
`availability` object, and the `byeWeeks`/`dnpWeeks` count agreement.

### 2.2 The preseason no-op

Sleeper returns nothing for a season that has not started. **Detect "no data yet" before validating**
and exit **0** with a log line, not a throw — otherwise the job is red from merge until week 1
settles, which is right now.

### 2.3 The season-close sealing write — a real data-quality bug

`state.season` flips to 2027 well after the Super Bowl. On the first run afterwards with `year=2026`:
`inProgress` computes **false**, so `:53` **drops the schedule**, so D-1 infers **no byes**; the hash
therefore differs from the stored file; and the refusal guard does **not** fire, because the manifest
entry still says `inProgress: true`. The job writes a sealing file in which **every D-1-inferred `'B'`
reverts to `'X'` and `byeWeeks` decrements** — a silent content regression on a completed season.

Worse, after that write the manifest reads `inProgress: false`, so any later Sleeper stat correction
makes the hash differ and hits `process.exit(1)` — **the weekly job is then permanently red with no
self-heal.**

**Fix: a completed-season SKIP, not the refusal path.** When the resolved season is no longer current,
the scheduled job should log and exit 0 without writing. The `--force` refusal stays for interactive
use; it is the wrong behaviour for a cron.

### 2.4 Then the cron

`nfl-season-totals.yml`, modelled on `nflverse-teamcontext.yml`:

- **Tuesday**, after MNF settles — but **after the Friday schedule job in ordering terms**: D-1's bye
  inference reads `nflverse/schedule/<year>.json` (§1). In practice the schedule for the season is
  written long before week 1, so this is a dependency to record, not a blocker. Planning's "no
  ordering dependency" was wrong.
- Resolve the season **inside the script** from `fetchCurrentNflSeason()` (§1 — `--year` has no
  default), and **add `setStepOutput('season', …)`** so the CDN purge can use it, per Invariant 8.
  Neither exists today.
- Content-hash dedup already prevents a commit when unchanged.
- CDN purge for the changed file and `manifest.json`, manifest first.

---

## 3. App repo — a separate slice, NOT `careerStats`

**The decision stands: do not merge the live season into `careerStats`.** But planning's evidence was
misattributed, and the corrected version matters for whoever later builds the in-season-aware slice.

**What would NOT break** (planning implied it would): momentum, trajectory, consistency, opportunity
quality and the whole vet projection consume `gp >= 8`-gated season lists
(`dynastyScore.js:601,649-652`; `seasonProjection.js:288-289`), and `computeEmpiricalAgeCurves` gates
`gp < 10` (`dynastyScore.js:65`). All of those would **skip** a partial season, not collapse on it.

**What WOULD genuinely corrupt** — the channels planning never named:

- **Durability is ungated at `gamesPlayed > 0` and recency-weighted** (`weight: idx + 1`), so a
  two-game live season carries the **highest** weight into `weightedAvgGames / 17`, feeding ~55% of
  `reliabilityScore` (`dynastyScore.js:844-848`).
- `classifyInjurySeason` counts over `allSeasons`, not the qualifying list (`:857-859`).
- `mostRecentSeason` / `currentSeasonStats` re-point at the partial season (`:663-665`).
- The prospect evidence blend uses `Math.min(gamesPlayed, 12)` (`:519-528`).
- `computePositionalRanks` gates at `>= 6` (`:257`).

That is a sharper and stronger argument for isolation than the one planning made. Plus `dataSeason`
would flip and re-point Market's Efficiency set, the environment filters, Teams and three loader
windows at a one-week season.

**So: a new view-only slice, `currentSeasonTotals`**, following the four existing view-only side-loads.

- Keyed on `nflState.season` (**string**; `deriveDataSeason` returns a Number — coerce deliberately).
- **`allowInProgress: true`, scoped to this one read.** `ktcHistory.js:147` is the only precedent;
  `nflRoster.js` is **not** one for this (it passes no `allowInProgress`).
- **Freshness: copy `nflRoster.js`'s actual pattern** — `setCacheWithMeta(…, 999999, { sourceLastModified })`
  **plus** a `lastModified` comparison. Planning framed these as alternatives; they are layered. Do
  **not** substitute a short TTL.
- Graceful absence before week 1 and between the season opening and the first cron run; consumers
  branch on the result's own flag, never on key presence.

**The FPA payoff needs one more change than planning said.** `buildFpaTable` reads
`careerStats?.[season]` (`opponentStrength.js:47,66,116`), which by design will never hold the live
season. Either widen its signature to take the current-season rows explicitly, or have the caller pass
`{ ...careerStats, [season]: currentSeasonTotals }`. **Prefer widening the signature** — synthesising a
fake `careerStats` shape at the call site is the kind of thing that later gets mistaken for the real one.

**Explicitly NOT in scope:** making the scoring pipeline in-season aware. `careerStats`, `dataSeason`
and every scoring module are untouched here.

---

## 4. Tests

- **Validator**: a synthetic 4-week season passes; a complete season's threshold is still exactly 14
  (assert the backwards-compatibility, not just the new behaviour); a genuinely broken scrape (few
  players, no cluster) still throws.
- **Preseason no-op**: empty Sleeper response → exit 0, no write, no throw.
- **Season-close skip**: a resolved season older than current → log and exit 0, **no write**; assert
  the stored file's `'B'` statuses and `byeWeeks` are untouched. This is §2.3's regression guard.
- **App loader**: `allowInProgress: true` accepted here while the default path still rejects it —
  assert both, so the opt-in is provably scoped.
- **Isolation (the important one)**: `careerStats` and `dataSeason` unchanged when
  `currentSeasonTotals` is populated; `deriveDataSeason` still returns the last completed season.
- **FPA**: with the slice present the blend's second term engages; absent, the result is exactly the
  prior rate.

---

## 5. Cross-repo impact

**Four entries fire.** Planning named one and deferred its text — the Mirror is the deliverable, so
all four are emitted verbatim below from the live registry region.

**CR-02 · season-totals schemaVersion & row composition**

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2
> flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any
> edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played
> → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat
> such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id
> scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every
> non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and
> `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself
> (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team
> row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot
> already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side
> diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and
> `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served
> `weeklyStatus`. Correct the app comment in the same change.

**CR-20 · `fan_pts_allow_*` DEF-row key preservation** — the cron makes `validateNflSeason` and
`update-nfl.mjs`, both CR-20 data-side triggers, run weekly against the live year's DEF rows.

> Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not
> widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit DEF-row
> exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade
> silently to `—` across all 32 teams** if either the keys or the rows vanish — no error, no test
> failure, indistinguishable from the API-only-mode degraded state shown for an unrelated reason. This
> is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not merely a key.

**CR-08 · nflverse schedule (read-only)** — the `inProgress`-gated schedule read becomes a weekly
dependency.

> Shape or floor changes land in both repos together. Read-only on the app side — not wired into
> projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change
> now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24),
> `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads
> this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing
> schedule file degrades silently (no byes, no throw), but a rename or reshape would silently stop byes
> from ever being written, with no validator to catch it.

**CR-04 · Manifest contract** — the second app-side `allowInProgress: true` opt-in.

> New families are additive and need no app change (the app already keys entries by path). Renaming or
> removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both
> repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second
> app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates
> `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache
> invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention
> split: nflverse families register `inProgress: false` even while the current season mutates; KTC's
> `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17).

### 5.1 CR-04 says this pattern should NOT be propagated — argue it or amend it

CR-04's Mirror states KTC's `inProgress: true` is *"a legacy current-value marker, **not a pattern to
propagate**."* §3 proposes exactly a second opt-in. **This must be resolved explicitly, not passed
over:** either the task argues why season-totals is a legitimate exception (the file genuinely *is*
in progress and genuinely *should* be read while incomplete — unlike KTC, where the marker was a
mislabel), or CR-04's Mirror is amended to distinguish the two cases. Recommend the former, stated in
the entry.

### 5.2 The new coupling routes OUT of this repo

The semantic coupling — **the app cannot distinguish a partial-week file from a complete season** — is
genuinely new and no entry records it. Planning said "decide during implementation and land it in both
repos." That is **wrong**: CLAUDE.md's Workflow convention routes a genuinely new coupling to the
Claude.ai project for a **draft entry returned to Session 1**. Session 2 must not improvise it. Either
draft it before implementation or land the slice without it and add it as a follow-up — do not let an
implementation session invent a registry entry.

### 5.3 Registry staleness to fix in passing

- CR-02's app-side triggers omit **`src/utils/opponentStrength.js`** — `collectSeasonFpaRates:66`
  iterates the served row set and `isDefenseRowId:31` depends on bare-abbr DEF rows existing in it.
  Same class of cross-row reader as `buildPerSeasonTeamShares`, which the FPA task itself added.
- CR-02 lists served `weeklyStatus` readers but no **`weeklyPoints`** reader —
  `outlookConsistency.js:18` (`extractGamePoints`) reads it directly off the row.

---

## 6. Done-definition

- [ ] `validateNflSeason`'s full-season floor is self-calibrating; a **complete** season's threshold is
      still exactly 14 (assert it)
- [ ] Preseason empty response → exit 0, no write, no throw
- [ ] Season-close → **skip**, not refuse; the stored file's `'B'` statuses and `byeWeeks` are provably
      untouched
- [ ] `setStepOutput('season', …)` added; the season resolved inside the script; CDN purge uses it
- [ ] Cron added Tuesday; the schedule-read ordering dependency recorded
- [ ] App: `currentSeasonTotals` is a **separate** slice — `careerStats`, `dataSeason` and every
      scoring module provably untouched (the isolation test)
- [ ] `allowInProgress: true` scoped to one read; `tryDataStore`'s default unchanged
- [ ] Freshness follows `nflRoster.js`'s **layered** pattern (permanent TTL + `lastModified` compare)
- [ ] `buildFpaTable`'s signature widened; no synthesised `careerStats` shape at the call site
- [ ] Four mirrors carried out; **§5.1 resolved explicitly**; §5.3's two staleness fixes applied
- [ ] `npm test` green · lint 0 · build clean; data repo `npm run smoke` green
- [ ] Drift check reports nothing (byte-identical as of data `199fa4d`)

---

## 7. Timing

**There is no data-loss cliff** — planning first claimed one and it was wrong. `fetchSeasonWeeks` loops
weeks 1–18 unconditionally and aggregates from scratch every run, so a job first run in week 5 still
yields weeks 1–5. **A late cron costs staleness, not data.**

Until it runs the app keeps showing 2025 — today's behaviour, so nothing regresses by being late.
§2.1 and §2.3 are the parts worth getting right; the cron itself is the easy half.
