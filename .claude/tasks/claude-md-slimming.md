# CLAUDE.md slimming — nav map → `docs/navigation.md`, enforced 25,000-byte ceiling

**Session 1 (opus, planning). No source files edited.**

## Goal

`CLAUDE.md` is 105,135 bytes (~26k tokens) and auto-loads into every session in this repo,
including trivial ones. Reduce it to **under 25,000 bytes, enforced by a test**, with zero loss of
load-bearing information.

The bloat is localised. Measured, by section:

| Lines | Section | Bytes |
|---|---|---:|
| 1–29 | Header + `## Commands` | 1,239 |
| 30–60 | `## Navigation map` preamble + Routing/IA table | 5,973 |
| 61–182 | The six per-file tables (`src/`…`src/utils/`) | **78,785** |
| 183–360 | `## Invariants` → `## Patterns` (the rules layer) | 19,138 |
| | **Total** | **105,135** |

75% of the file is six tables whose rows have each accreted their own changelog. Individual rows
run 3,000–5,300 bytes (`market/Market.jsx` is 5,367; `teams/Teams.jsx` is 5,334). The rules layer
below is structurally sound and is only lightly touched.

`Self-maintenance` already says "keep this file thin." That rule failed because it carries no
number and no enforcement. This task gives it both.

## Measured byte budget

Every figure below is measured from drafted replacement text, not estimated.

| Component | Bytes |
|---|---:|
| Header + `## Commands` (lines 1–29, unchanged) | 1,239 |
| `## Navigation map` — new directory-level index | 2,417 |
| `## Traps` — new (hard cap 3,000) | 2,235 |
| Rules layer after the light pass, `## Patterns` lifted out | 18,006 |
| Section separators | 10 |
| **Projected total** | **23,907** |
| Ceiling | 25,000 |
| **Headroom** | **1,093** |

**The plan reaches the ceiling.** It did not on the first pass — the first draft measured 25,420,
420 over. Two changes closed the gap without raising the ceiling and without losing information:

1. **Dropped two `## Traps` entries that duplicated `## State and data flow`.** The
   `dataSeason`-vs-`nflState.season` split and the "branch on `complete`, never key presence" rule
   are already stated, more completely, at `CLAUDE.md:334`. Writing them again in `Traps` would
   have re-created exactly the duplication this task exists to remove. `Traps` now cross-references
   that paragraph instead. Saved 523 bytes.
2. **Lifted `## Patterns` (CLAUDE.md:351–360, 984 bytes) into `docs/navigation.md`.** Its two
   subsections are per-file detail by the definition this task adopts: `### Caching` lists
   `cache.js`'s function signatures and TTL defaults (and already defers to `docs/integrations.md`
   for the rest); `### Component data access` enumerates which components take props and which read
   context. Neither is a rule. `## Patterns` is outside the step-5 protected range
   (`## Invariants` → `## State and data flow`) and outside the frozen list. Saved 984 bytes.

Both are moves, not deletions. Nothing is dropped.

`docs/navigation.md` has no ceiling. It will land around 30–40 KB after the present-tense rewrite
compresses the 84,758 bytes it inherits.

---

## Step sequence

Do these in order. Steps 1–3 are additive and independently verifiable; step 4 is the deletion, and
it must come after 1–3 so nothing is dropped before it has a home.

1. **Create `docs/navigation.md`** — move lines 34–182 there, rewritten present-tense (§A below).
2. **Extend the six source headers** that lack a trap note (§C, edits E1–E6).
3. **Add `src/__tests__/claudeMdSize.test.js`** (§Tests to add). It fails at this point — expected,
   the file is still 105 KB. Confirm the failure message is the one you want a future session to
   read.
4. **Rewrite `CLAUDE.md`** — replace lines 30–182 with the directory index, insert `## Traps`, apply
   the light pass, rewrite `## Self-maintenance`, lift `## Patterns` (§B).
5. **Update `README.md`** and the other docs pointers (§Docs updates).
6. Run the done-definition: `npm test` (the new size test now passes), `npm run lint`,
   `npm run build`. No user-visible surface changes, so no smoke run is required — say so in the
   hand-back.
7. Verify the byte count directly: `wc -c CLAUDE.md` must read under 25,000.

---

## §A — `docs/navigation.md` (new file)

Holds the full per-file navigation content currently in `CLAUDE.md`:

| Source | Content |
|---|---|
| `CLAUDE.md:34–60` | `### Routing / IA` — the route table + the nav-chrome paragraph |
| `CLAUDE.md:62–71` | `### src/` — the 3-row table + the two colour-token blockquotes |
| `CLAUDE.md:73–87` | `### src/api/` — 11 rows |
| `CLAUDE.md:89–120` | `### src/components/` — 20 rows |
| `CLAUDE.md:122–125` | `### src/context/` — 1 row |
| `CLAUDE.md:127–132` | `### src/hooks/` — 3 rows |
| `CLAUDE.md:134–181` | `### src/utils/` — 40 rows |
| `CLAUDE.md:351–360` | `## Patterns` — appended as a final section (see budget note 2) |

Give it a short preamble:

> # Navigation map
>
> Per-file detail for `sleeper-dashboard`. Rules and invariants live in
> [CLAUDE.md](../CLAUDE.md); this file answers "which file do I edit?" and "what shape is the data
> that reaches it?" Rows are present-tense — they describe what a module does now. History lives in
> `git log`.

### The rewrite rule

Every row is rewritten present-tense **while moving it**. Delete any sentence or clause whose only
function is dating a change:

- `since Slice <n>`, `since dp-v2 Slice <n>`, `since 1b Slice <n>`, `since <task-file>.md`
- `was renamed from`, `renamed from`, `used to`, `before that surface was deleted`, `reversed that`,
  `up from`, `down from`, `no longer`, `at the time`, `until Slice <n>`, `as of`
- `X was deleted in Slice <n>` / `X went dark` — where the row's subject is what remains
- a slice or task-file citation (`dp-v2 Slice 5a §4`, `master-plan §6a`, `fpa-defense-ranking.md`)
  whose only function is dating a change

**Retain**, verbatim where possible:

- responsibilities and exported function names
- data shapes, prop lists, key counts, return shapes
- gates, floors and thresholds (`MIN_ADVSTATS_ROWS=250`, `gp≥8`, `MIN_PASS_ATTEMPTS=100`,
  `PAGE_SIZE=50`, `PRIOR_WEIGHT_GAMES=6`, the four-tab FIFO cap)
- invariant references (`view-only`, `never feeds projection/scoring`, the guarding test's filename)
- cross-repo contract ids (`CR-02`, `CR-10`, `CR-16`, `CR-17`) — **never touched**
- `localStorage` key names and their migration/fallback behaviour
- deliberate-divergence notes where the divergence is still live (`SERIES_METRICS` vs
  `FILTER_METRICS`; `coverageBand` vs `computeKtcSignals` at `n=1`; the two attribution modes)

### Worked example

Before (`CLAUDE.md:94`, the `teams/Teams.jsx` row, excerpt):

> `dp-v2 Slice 6a — the 32-team index (/teams). **Zero new fetching** — reads
> teamContextByYear[dataSeason] (already loaded since Slice 2, widened to five seasons by 4c) plus
> playerRows […] **Rows are clickable since dp-v2 Slice 6b** […] **6b navigated via a plain
> window.location.hash write specifically to avoid wrapping teams/Teams.test.jsx's 14 renders in a
> Router; dp-v2 Slice 7 §8 reversed that** — tests should follow production shape, not set it […]
> Now uses useNavigate() via a component-scoped goToTeam callback`

After:

> `The 32-team index (/teams). **Zero new fetching** — reads teamContextByYear[dataSeason] plus
> playerRows; dataSeason via environment.js's deriveDataSeason(careerStats). […] Rows are clickable
> (whole-row + keyboard) and navigate to /teams/:abbr via useNavigate() in a component-scoped
> goToTeam callback — not a window.location.hash write, which the router cannot see. […]`

Note what survives: the *reason* a raw hash write is wrong is a live constraint, so it stays. What
goes is the account of 6b having done it and 7 having undone it.

### Rows needing the heaviest cuts

Ordered by current byte count. These seven are half the table mass:

| Row | Line | Bytes |
|---|---:|---:|
| `market/Market.jsx` | 97 | 5,367 |
| `teams/Teams.jsx` | 94 | 5,334 |
| `dp/PlayerDetailModal.jsx` | 114 | 3,709 |
| `environment.js` | 177 | 2,294 |
| `teams/TeamDetail.jsx` | 95→103 | 2,834 |
| `opponentStrength.js` | 179 | 2,458 |
| `marketFilters.js` | 149 | 2,993 |

---

## §B — `CLAUDE.md` edits

Grouped by location, top to bottom. Line anchors are against the current 360-line file.

### B1 — lines 30–182 → the directory index

Delete lines 30–182 entirely. Replace with (2,417 bytes as drafted):

```markdown
## Navigation map

Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). **Per-file
detail — the routing/IA table and one row per module — lives in [docs/navigation.md](docs/navigation.md).
Read it before locating any file.** The index below only chooses a directory. **Product/UX vision**
(target product, not current behaviour) lives in `docs/dynasty-decision-engine-design.md` (the six
surfaces + marginal-value thesis) and `docs/dynasty-frontend-ux-design.md` (UX/visual strategy); the
frontend migration plan is `.claude/tasks/frontend-overhaul.md`.

| Directory | What lives there |
|---|---|
| `src/` | `main.jsx` entry; `App.jsx` — owns all domain state and builds the playerRows pipeline; `constants.js`; `index.css` (`@theme` — the colour/font token source of truth) |
| `src/api/` | Every network and data-store loader: Sleeper (`sleeper.js`, `sleeperStats.js`), KTC (`ktc.js`), CFBD (`cfbd.js`), the data store (`dataStore.js`, `enrichment.js`), and the nflverse families (`nflDraft.js`, `nflRoster.js`, `advStats.js`, `nflSchedule.js`, `nflGameLogs.js`, `teamContext.js`) |
| `src/components/shell/` | App frame and nav chrome: `AppShell`, `TopBar`, `NavRail`, `BottomTabBar`, and `navItems.js` (nav config, `DEFAULT_ROUTE`) |
| `src/components/market/` | The Market surface: table, column descriptors, filter bar, filter panel |
| `src/components/portfolio/` | The Portfolio surface: metric tiles, value-by-age-band chart, holdings table (players and picks) |
| `src/components/teams/` | The `/teams` 32-team index and `/teams/:abbr` team detail |
| `src/components/dp/` | Dynasty-Portfolio design-system primitives (series/trend/coverage/degraded/popover) and the player-detail pop-up's shell and sections |
| `src/components/league/` | Standings, schedule, rosters |
| `src/components/roster/`, `board/`, `trade/` | Dormant and gated-placeholder surfaces |
| `src/context/` | `ProfileDataContext` — the pop-up's read-side data bundle |
| `src/hooks/` | `usePlayerProfile`, `usePlayersTable` (view-local table state), `useTeamHistoryLoader` |
| `src/utils/` | Everything pure: projection and dynasty-scoring modules, matching and lookup helpers, and the view-only derivations each surface renders from |
| `src/__tests__/` | Cross-cutting contract and view-only guard tests |
| `src/__fixtures__/` | `season-totals-2025.json` — the field-existence oracle |
```

### B2 — insert `## Traps` after B1, before `## Invariants`

New section, 2,235 bytes measured, cap 3,000. Placement reads: where things are → what will bite
you → the rules.

```markdown
## Traps

Cross-cutting landmines — each spans several files, so no single file's header owns it. A trap
specific to one module lives in that module's own header comment. The `dataSeason`-vs-`nflState.season`
split and the `complete`-not-key-presence rule are in [State and data flow](#state-and-data-flow).

**Two `teamContext` modules.** `src/api/teamContext.js` is the view-only nflverse team-context
loader; `src/utils/teamContext.js` is a projection-pipeline module (`computeTeamContext`,
`computeHistoricalTeamTotals`, …). `App.jsx` imports both, and its `teamContext` memo is the *utils*
one. Never wire the loader into projection/scoring — `teamContextViewOnly.test.js` guards it.

**Three team-abbr domains (CR-16).** Sleeper (`playerMap[id].team`, KTC rows,
`enrichment/coaching.json` — carries `LAR`, and the literal `'FA'` for a free agent); era-accurate
(teamcontext, schedule, `careerStats[season][id].team` — `STL`/`SD`/`OAK` in their eras); nflverse
current-franchise (gamelogs `games[].team`). The hops are `nflStats.js`'s
`normalizeTeamForSchedule`/`denormalizeTeamForSchedule` and `playerTeam.js`'s `eraTeam`;
`resolvePlayerTeam` is the single player→team resolution point. An ungated join does not error — it
silently yields an empty bucket or a `—` row.

**Never sum or average a stored rate.** Families carrying components *and* rates (teamcontext
`off.*`/`def.*`, gamelogs) publish rates as single-game values. Aggregate the `*Sum`/`*Plays`
components across the window, then divide (CR-10). Where a component is itself a per-game rate,
weight it (`cpoe` is attempt-weighted).

**`null` is not `0` in a series.** `CareerBars`/`SeriesBars`/`TrendCell` treat `null` as a void slot
(dashed baseline, excluded from the domain) and a measured `0` as a real value. Never pad a series,
and never substitute `0` for a missing observation.

**`matchKTCToSleeper` silently drops KTC's pick rows.** Picks carry `position: null` and
`team: "FA"`, so they fall past the position guard and out as unmatched. Everything downstream —
`ktcMap`, `loadKtcHistory`'s series — is therefore **players-only**. Pick prices come from the
parallel `ktcPicks.js` path. Do not widen the matcher; a pick is not a player.
```

### B3 — line 199, the Advstats invariant

Substance unchanged. Delete the history clause; keep the fact that `RACR` has a renderer, since the
invariant's own wording ("regardless of whether it has a UI consumer") depends on it.

Delete: `` **Rendered since dp-v2 Slice 5b** — `` … `` was deleted with the Explorer in 1b Slice viii; ``
and `The loader, cache and sparsity gate are unchanged.`

Result:

> **Advstats are display-only.** `src/api/advStats.js` (target/air-yards share, WOPR, RACR) must
> never influence `projectedPPG`, the dynasty score, or any `factors` entry, regardless of whether
> it has a UI consumer. `market/Market.jsx`'s Efficiency column set reads `RACR` (WR/TE only, gated
> on `advStats.complete`, not key presence); `targetShare`/`airYardsShare`/`wopr` are unrendered. No
> projection/scoring module may import it. Enforced by
> `src/__tests__/advStatsViewOnly.test.js`. See `docs/advstats-grading-findings.md`.

Also replaces the prose title `the "Advstats & Signal Grading — Findings and Open Items" doc` with
the actual path, which exists at `docs/advstats-grading-findings.md`.

### B4 — lines 211–213, the `PROVISIONAL(...)` rule

Delete the provenance tail only. The rule and its three categories are untouched.

Delete: `Introduced by the Dynasty Portfolio redesign (1b Slice i,
.claude/tasks/dynasty-portfolio-1b.md §2.4) as a standing rule for every subsequent slice, not a
one-off note for that program.`

Last sentence becomes: `Delete the tag in the same change that wires the real source.`

### B5 — line 217, `Intentional divergence`

The invariant's substance (do not unify the two draft-capital sources) is untouched. Its second half
is a post-mortem of a bug that is fixed; the *diagnostic* inside it is still useful, so keep that
and drop the account.

Replace ` **The per-league proxy was silently dead until src/utils/rookieDraft.js landed** — … before suspecting the scoring.`
with:

> If prospect scores look uniformly flat, check that `rookieDraft.js` is still identifying this
> league's rookie draft before suspecting the scoring — an unidentified draft scores every prospect
> at `draftMultiplier(null)`.

### B6 — line 334, the `dataSeason` paragraph

One deletion. `**`dataSeason` — the loader-season choice (dp-v2 Slice 2).**` → `**`dataSeason` — the
loader-season choice.**` The rest of the paragraph is substance and is **not** touched — it is the
canonical statement of both the season-source rule and the `complete`-not-key-presence rule, and
`## Traps` points at it.

### B7 — line 337, pipeline step 1

`— since dp-v2 Slice 1, `null` for an absent season` → `— `null` for an absent season`. The null-vs-0
semantics themselves stay.

### B8 — lines 322–329, `## Self-maintenance`

Rewrite the first paragraph. The `docs/signal-registry.md` clause and the whole second paragraph
(cross-repo registry / `CR-NN` mirror) are **unchanged**.

Replace from `Keep this file current as part of every task's done-definition.` through
`…rather than duplicating it here.` with:

```markdown
**This file has a hard ceiling of 25,000 bytes, enforced by `src/__tests__/claudeMdSize.test.js`.**
It is a rules-and-orientation layer, not a second README. A change that would breach the ceiling
**prunes in the same commit** — it does not raise the ceiling.

Per-file detail belongs in [docs/navigation.md](docs/navigation.md), not here: responsibilities,
data shapes, gates and floors, props and export lists. A trap specific to one module belongs in that
module's own header comment; only a trap spanning several files belongs in [Traps](#traps), itself
capped at 3,000 bytes. Nothing here records history — rows and rules state what is true now, and
`git log` holds the rest.

Keep this file current as part of every task's done-definition. If a change adds/renames/removes a
`src/` module, changes a command in `package.json`, alters a documented invariant or the factors
contract, or changes a data shape referenced here, update the relevant CLAUDE.md **or
`docs/navigation.md`** section in the **same change**. If a change adds, removes, or reclassifies a
signal/factor
```

…continuing into the existing `— a raw source, a computed factors entry, …` clause unchanged.

### B9 — line 356, `## Patterns` §2 cross-reference

Before lifting `## Patterns` to `docs/navigation.md` (B10), fix its two stale references so the
moved text is correct in its new home:

- `the fourteen-key value (see `src/context/` table above)` → `the fourteen-key value (see
  [docs/navigation.md](docs/navigation.md) → `src/context/`)` — after the move this becomes a
  same-file reference; simplify to `(see the `src/context/` table above)`.
- `**One provider site** (the Explorer's two `/players`-scoped sites were retired with that surface
  in 1b Slice viii): an` → `**One provider site**: an`

### B10 — lines 351–360, lift `## Patterns` out

Cut the whole section (984 bytes) to the end of `docs/navigation.md`. No pointer line is left behind
in `CLAUDE.md` — the `## Navigation map` preamble already directs the reader to
`docs/navigation.md`, and `## Self-maintenance` names it as the home for per-file detail. `CLAUDE.md`
now ends after `## State and data flow`.

---

## §C — Trap triage

**The single most important finding of this planning session: this repo's source headers already
carry nearly every trap the nav map narrates.** The prompt's four exemplars are all already in
place, several stated *more* precisely in source than in `CLAUDE.md`:

| Trap | `CLAUDE.md` | Already in source at | Action |
|---|---|---|---|
| PROE is `(passPlays÷plays) − (proeXpassSum÷proePlays)`, `proePlays` not `proePassPlays` | :177 | `src/utils/environment.js:7-10` — with the full ARI-week-1 arithmetic | **none** |
| Sleeper's draft `type` is the FORMAT, never `'rookie'` | :165 | `src/utils/rookieDraft.js:3-5` — with the live Dynasty 040 verification table | **none** |
| `'FA'` counts in the value denominator only; never rescale to 100% | :94 | `src/utils/teamExposure.js:10-15` | **none** |
| Do not widen `matchKTCToSleeper`; a pick is not a player | :173 | `src/utils/ktcPicks.js:4-8` | **none** |

So step 3's "extend rather than duplicate" resolves, for most traps, to **verify and leave alone**.
Duplicating these into `## Traps` would recreate the problem in a smaller file.

### C1 — Cross-cutting → `## Traps` (5 entries, §B2)

| # | Trap | Why it cannot live in one header |
|---|---|---|
| T1 | Two `teamContext` modules (`api/` loader vs `utils/` projection module) | Spans `api/teamContext.js`, `utils/teamContext.js`, `App.jsx:22,36,166-171,194`. Both files name it, but the person at risk is grepping `teamContext` and has opened neither |
| T2 | Three team-abbr domains + the `normalize`/`denormalize`/`eraTeam` hops (CR-16) | Spans `playerTeam.js`, `nflStats.js`, `teamExposure.js`, `Teams.jsx`, `TeamDetail.jsx`, `opponentStrength.js`, `seasonEfficiency.js`, `marketFilters.js`. Each header states its own half of the join |
| T3 | Never sum or average a stored rate; aggregate components, then divide (CR-10) | Applies to every nflverse family. `environment.js`, `seasonEfficiency.js`, `api/teamContext.js` and `gameLog.js` each restate it locally |
| T4 | `null` ≠ `0` in a series primitive | The rule is authored in `SeriesBars.jsx:1-9` and `cells.jsx`, but binds every future chart author, who will be editing a section component, not the primitive |
| T5 | `matchKTCToSleeper` drops pick rows, so everything downstream is players-only | Spans `ktcMatch.js`, `ktcPicks.js`, `ktcHistory.js`, `Portfolio.jsx`. Only the *consequence* chain makes it a trap |

**Two candidates deliberately NOT added** — `dataSeason`-vs-`nflState.season`, and
`complete`-not-key-presence. Both are already stated, more completely, at `CLAUDE.md:334`.
`## Traps` cross-references that paragraph. (This is also budget item 1.)

### C2 — File-specific, already covered → verify only, NO EDIT

Confirmed present by reading each file during planning. Implementer: spot-check, do not rewrite.

| Trap | Lives at |
|---|---|
| PROE denominator + the full verification arithmetic | `utils/environment.js:1-15` |
| teamcontext rates are single-game; `proeXpassSum ÷ proePlays` | `api/teamContext.js:31-38` |
| `api/` vs `utils/` `teamContext` name collision | `api/teamContext.js:12-18`, `App.jsx:166-167` |
| Draft `type` is the FORMAT; `player_type` is `0` on both drafts | `utils/rookieDraft.js:1-22` |
| Do not widen `matchKTCToSleeper`; the 36 pick rows' `name` format (CR-17) | `utils/ktcPicks.js:1-12` |
| `traded_picks` dead-season rows; `owner_id` is a roster_id | `utils/tradedPicks.js:6-14` |
| `'FA'` in the denominator; never rescale; CR-16 bucket | `utils/teamExposure.js:3-15` |
| Two grains, two domains; `playerMap[].team` is not an input | `utils/playerTeam.js:1-22` |
| CPOE attempt-weighted; `CARRY SH` cross-family join; REG pre-filter | `utils/seasonEfficiency.js:1-19` |
| `gamesPlayed<=0` explicit guard; 33-row dedup; CR-16 hop | `utils/opponentStrength.js:1-25` |
| `coverageBand` vs `computeKtcSignals` at `n=1` | `utils/coverageBand.js:1-9` |
| `NAV_GROUPS` keys `PRIMARY_NAV` by `key`, never array index | `components/shell/navItems.js:25-27` |
| `market-production-season` deliberately not renamed | `market/Market.jsx:150-153` |
| `_trend` is a comparator branch; a bare-key sort on an object no-ops | `market/Market.jsx:643-645` |
| `ascByDefault` — rank-shaped and lower-is-better columns | `hooks/usePlayersTable.js:42-49` |
| `SECTIONS` order vs JSX order; both edited together | `dp/PlayerDetailModal.jsx:13-22` |
| `min-h-0` is mandatory on the pop-up's flex row | `dp/PlayerDetailModal.jsx:302-308` |
| Never `usePlayerProfile` per tab; the single `Escape` listener | `dp/PlayerDetailTabs.jsx:14,57,86` |
| `SeriesBars` never pads / never substitutes `0`; `colour="neutral"` | `dp/SeriesBars.jsx:1-24` |
| Zero-based vs min–max normalisation | `dp/cells.jsx:1-5`, `dp/SeriesBars.jsx:1-5` |
| `DegradedBlock` is never a call to action | `dp/DegradedBlock.jsx:1-4` |
| `SectionIndex` is a TOC, not navigation; routeless pop-up | `dp/SectionIndex.jsx:3-6` |
| `Promise.allSettled` + `cancelled` + one merged write | `hooks/useTeamHistoryLoader.js:14-16` |
| `normalizeFilters` salvages / `isRestorableFilters` does not | `utils/marketFilters.js:73-75` |
| `env*Top` valid range is `[1, LEAGUE_TEAM_COUNT]`, never `0` | `utils/marketFilters.js:81-82` |
| `loadCurrentSeasonTotals`' three null-manifest states | `api/sleeperStats.js:248-252` |

**Note on a stale claim being deleted.** `CLAUDE.md:87` says `api/teamContext.js`'s "own header
comment paired them wrong until this slice." That header was corrected — it now reads
`proeXpassSum divides by proePlays, NOT the also-present proePassPlays` at
`api/teamContext.js:35-37`. The `CLAUDE.md` clause is pure history about a fix that already landed.
Delete it; make no source edit.

### C3 — File-specific, NOT covered → extend the header (the only source edits)

Six comment-only additions. **No logic, no signatures, no imports change.**

**E1 · `src/components/dp/PlayerDetailModal.jsx`** — add near the `dpwide:` classes (`:305`/`:310`/`:390`)
or to the header block at `:13-22`:
```
// Breakpoint variants here are the `dpwide:`/`max-dpwide:` tokens (--breakpoint-dpwide, src/index.css
// @theme) — never an interpolated `max-[1180px]:`. Tailwind v4 scans class names as literal strings,
// so an interpolated arbitrary variant emits no CSS at all and fails silently at runtime.
```

**E2 · `src/components/dp/SectionIndex.jsx`** — append to the header at `:3-6`:
```
// CoveragePips renders only for a row that carries a `count`. With neither `band` nor `count` it
// draws three UNFILLED pips — a visible artefact — so a site with no real coverage omits the
// element entirely rather than passing nothing.
```

**E3 · `src/components/dp/DegradedBlock.jsx`** — append to the header at `:1-4`:
```
// Always pass an explicit `kind`. An unrecognised or omitted kind falls through KINDS to an empty
// label — a bordered block with no text, which reads as a rendering bug rather than a data state.
```

**E4 · `src/components/market/FilterBar.jsx`** — insert above `buildPills` at `:39`:
```
// Hand-written per-key chain, deliberately not data-driven: a new filter key needs an explicit
// clause HERE or its pill silently never renders. (clearOne/resetAll differ — they read
// DEFAULT_MARKET_FILTERS[key] generically and need no edit for a new key.)
```

**E5 · `src/utils/ktcHistory.js`** — add to the file header:
```
// matchKTCToSleeper runs per snapshot inside this loader and drops every pick row (position: null
// falls past its position guard, then out as unmatched), so this window carries NO pick prices.
// Portfolio's ROSTER VALUE / CONCENTRATION deltas are stated "players only" for exactly that
// reason. Pick prices come from the parallel utils/ktcPicks.js path.
```

**E6 · `src/utils/marketFilters.js`** — extend the validator comment at `:73-75`:
```
// Two policies that are NOT symmetric, both deliberate:
// - `search` is the one key normalizeFilters never restores — it forces '' regardless of payload,
//   so a free-text query is applied live but never persisted.
// - isRestorableFilters treats the four env*Top keys as ABSENT != INVALID (unlike every other key):
//   a preset saved before they existed has none of them, and requiring them strictly would silently
//   drop every saved preset. A key that is PRESENT but invalid still fails, same as any other.
```

### C4 — Open questions (surfaced, not dropped)

Three notes I cannot cleanly classify as either history or trap. **Per the constraint, none is
deleted.** Each is carried into `docs/navigation.md` verbatim pending a human call.

1. **The `--color-*` / `--color-dp-*` two-token-family blockquote** (`CLAUDE.md:69,71`, 1,713 bytes).
   Not a per-file row and not a code trap — a live styling invariant ("every `--color-dp-*` surface's
   outermost element must paint its own ground before using any `text-dp-*` class"; "components
   consume tokens, never raw palette classes"). But `README.md:203` says `docs/ui.md` already owns
   "the color token system," so this may be a duplicate of content there.
   **Plan: carry verbatim into `docs/navigation.md` under `### src/`. Do not merge into `docs/ui.md`
   without checking for an existing statement there.** Question for the human: should the token
   rules consolidate into `docs/ui.md`, with `docs/navigation.md` holding only a pointer?
2. **`EPA per opportunity` remains cut permanently (`fb8c2dd` — gamelogs is too large per season for
   a 5-bar series)** (`CLAUDE.md:150`). A decision record. It cites a commit, which looks like
   history, but its function is prospective: it stops someone re-adding the metric.
   **Plan: keep in the `usageEfficiency.js` row, drop the bare SHA.** Flagging because the rewrite
   rule as written would delete it.
3. **`roster/{MyTeamView,PlayerCard,Sparkline}.jsx` — "Dormant, not deleted … still exercised by
   `shell/importIntegrity.test.jsx`"** (`CLAUDE.md:119`). Reads as history but is load-bearing: it
   is the reason a dead-code sweep must not delete these files.
   **Plan: keep, rephrased present-tense** ("Unimported by `App.jsx`; kept on disk and compiled by
   `shell/importIntegrity.test.jsx`. Not dead code — do not sweep").

---

## Docs updates

### `docs/navigation.md` — NEW

Created in full by §A. Content = `CLAUDE.md:34–182` rewritten present-tense, plus `CLAUDE.md:351–360`
(`## Patterns`) appended as a final section.

### `README.md:176-205` — `## Documentation`

Add one bullet. Insert **first** in the list (it is the entry point to the rest):

```markdown
- [docs/navigation.md](docs/navigation.md) — the navigation map: routing/IA, and one row per
  module in `src/` giving its responsibility, data shapes, gates and floors, and the invariant or
  `CR-NN` contract it is bound by. Read before locating any file.
```

Rationale for placing it first: every other bullet describes a behavioural domain; this one
describes the map to all of them.

### `CLAUDE.md`

Nine edits, all specified with before/after text in §B: B1 (nav map → directory index), B2 (insert
`## Traps`), B3 (line 199), B4 (lines 211–213), B5 (line 217), B6 (line 334), B7 (line 337), B8
(lines 322–329), B9+B10 (lines 351–360 fixed then lifted out).

### Not edited

- **`docs/cross-repo-registry.md`** — untouched, per constraint. No `CR-NN` reference anywhere in
  this change is altered; `CR-02`/`CR-10`/`CR-16`/`CR-17` are carried verbatim into
  `docs/navigation.md` and `## Traps`.
- **`docs/ui.md`, `docs/architecture.md`, `docs/integrations.md`, `docs/projection.md`,
  `docs/dynasty-scoring.md`, `docs/signal-registry.md`** — none references `CLAUDE.md`'s nav map by
  section anchor. No edit needed. (See open question C4.1 for the one possible `docs/ui.md`
  consolidation, which is deliberately *not* actioned here.)

---

## Tests to add

One test. Contract-shaped and cross-cutting, so it belongs in `src/__tests__/`, alongside
`darkThemeForced.test.js` — the existing precedent for a test that asserts on a repo-root file.

**`src/__tests__/claudeMdSize.test.js`**

- **Precedent:** `darkThemeForced.test.js:11` reads `index.html` by a **relative** path. Vitest's
  root is the config directory (repo root), so `statSync('CLAUDE.md')` resolves correctly. Use
  `statSync().size` — exact bytes on disk, which is what the ceiling is denominated in. Do **not**
  use `readFileSync(...).length` (that is UTF-16 code units in JS and undercounts every non-ASCII
  character — this file is full of `—`, `→`, `·`, `≥`).
- **Picked up by `npm test`:** `vitest.config.js:11` includes `src/**/*.test.js`. The `Stop` hook
  (`.claude/hooks/verify-on-stop.sh:16`) runs `npm test && npm run build`, so this is blocking.

| Case | Input | Expected |
|---|---|---|
| Under the ceiling | `statSync('CLAUDE.md').size` | `≤ 25000` — passes at the projected 23,907 |
| File exists | `existsSync('CLAUDE.md')` | `true` — guards a rename silently voiding the test |
| Traps sub-cap | bytes of the `## Traps` section, sliced `## Traps` → next `\n## ` | `≤ 3000` — passes at 2,235 |

Edge cases the test must handle:

- **Trailing heading.** If `## Traps` is ever the last section, the "next `## `" search returns `-1`.
  Slice to end of file in that case rather than throwing.
- **`## Traps` absent.** Skip the sub-cap assertion rather than fail — a future session may fold the
  section away, and that is not this test's business. Assert the 25,000 ceiling unconditionally.
- **Byte-exact boundary.** Assert `≤ 25000`, not `< 25000`.

Failure message — this is the test's real payload, since the person reading it is a future session
that just breached the ceiling:

```
CLAUDE.md is <N> bytes; the ceiling is 25000 (over by <N-25000>).
CLAUDE.md is auto-loaded into every session in this repo, so its size is a
per-session tax. Do not raise this ceiling.
Per-file detail belongs in docs/navigation.md. A trap specific to one module
belongs in that module's own header comment. Prune in this same commit.
```

No other test changes. The change is comment- and documentation-only; no behaviour is touched, so
no existing test needs updating and none should go red. `importIntegrity.test.jsx` and the
`*ViewOnly.test.js` guards are unaffected — no imports move.

---

## Cross-repo impact

**None.**

Checked against `docs/cross-repo-registry.md` (all 21 `CR-NN` entries) per the
`## Cross-repo contract registry` rule. This change edits `CLAUDE.md`, adds `docs/navigation.md`,
adds one test, and adds six source **comments**. It moves no data, changes no emitted or consumed
JSON shape, no manifest entry, no stat key, no cache key, and no field name. The `CR-NN` ids that
appear in the moved prose (`CR-02`, `CR-10`, `CR-16`, `CR-17`) are carried across verbatim; no entry
is created, altered, or extended. No `Mirror` text is triggered.

### Wording reported for sibling consistency

The constraint requires reporting any wording changed in the two near-mirrored sections.

**`## Workflow convention` (CLAUDE.md:255–291, incl. `### Plan review` and `### The Claude.ai
project`) — ZERO changes.** Diffed against `sleeper-dashboard-data/CLAUDE.md:270–306`; confirmed
near-identical today (the app's version additionally carries the Visual verification / How to smoke
it / screenshot-is-not-sign-off bullets, which the data repo has no equivalent for, and the data
repo says `npm run smoke` where the app says `run the build`). Untouched by this task. **Nothing for
the sibling to mirror.**

**`## Cross-repo contract registry` (CLAUDE.md:225–233) — ZERO changes.** The rule text, the
"21 entries" count, and the "a coupling that is not listed there does not exist for review purposes"
sentence are byte-identical before and after. **Nothing for the sibling to mirror.**

### One optional item the sibling may want, listed but NOT actioned here

`sleeper-dashboard-data/CLAUDE.md` is **41,030 bytes**, with its own `## Navigation map` at
`:138–221` (~84 lines) and its own `## Self-maintenance` at `:335`. It is under this repo's ceiling
but on the same trajectory, and its `Self-maintenance` section carries the same unenforced
"keep it thin" wording that failed here.

This is **out of scope** — this repo cannot edit the sibling, and the task is app-repo-only. Raised
so the human can decide whether to open a parallel task there. It is **not** a cross-repo contract
and needs no registry entry.

---

## Files touched

| File | Change |
|---|---|
| `CLAUDE.md` | Nine edits (§B). 105,135 → **23,907** bytes |
| `docs/navigation.md` | **New.** Lines 34–182 + 351–360, rewritten present-tense |
| `README.md` | One bullet added to `## Documentation` (:176–205) |
| `src/__tests__/claudeMdSize.test.js` | **New.** Size ceiling + Traps sub-cap |
| `src/components/dp/PlayerDetailModal.jsx` | Comment only (E1) |
| `src/components/dp/SectionIndex.jsx` | Comment only (E2) |
| `src/components/dp/DegradedBlock.jsx` | Comment only (E3) |
| `src/components/market/FilterBar.jsx` | Comment only (E4) |
| `src/utils/ktcHistory.js` | Comment only (E5) |
| `src/utils/marketFilters.js` | Comment only (E6) |

Constraint check: `docs/cross-repo-registry.md` not edited; no `CR-NN` reference altered; no source
change beyond added/extended header comments.
