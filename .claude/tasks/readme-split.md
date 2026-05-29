# Task: Split README.md into focused docs/

## Goal

`README.md` is a single 1,210-line file that grows every sprint. Both opus
(planning) and sonnet (implementing) read large parts of it each session — a
context tax that rises every feature. Split the deep behavioural content into
five focused docs under `docs/` so a prompt can point at ONE doc plus the
relevant module instead of the whole file.

**Design criterion:** each doc maps to a unit of planning work. Planning a
projection-pipeline change → read `docs/projection.md` + `src/utils/seasonProjection.js`
and nothing else. Boundaries follow the module/feature lines the CLAUDE.md
navigation map already implies.

**This is a docs-only change.** Zero `src/` edits. Content is relocated
VERBATIM — no paraphrasing, summarising, or "improving" moved sections. The only
permitted edits to moved text are (a) fixing internal cross-reference links and
(b) adding a single one-line intro sentence at the top of each new doc. Dropping
or rewording detail is a failure mode.

---

## New files to create (under repo root `docs/`)

1. `docs/architecture.md`
2. `docs/projection.md`
3. `docs/dynasty-scoring.md`
4. `docs/integrations.md`
5. `docs/ui.md`

Each begins with one new one-line intro sentence (text given per-doc below),
then the relocated sections verbatim.

---

## Section → destination mapping

Every current README `##` section, in file order, with its destination. Line
ranges are from the current `README.md` (1,210 lines).

| # | README section (line) | Destination |
|---|---|---|
| 1 | `# Sleeper Dashboard` intro (1–4) | **stays in README** |
| 2 | `## Tech stack` (6–13) | **stays in README** |
| 3 | `## Running locally` (15–27) | **stays in README** |
| 4 | `## Testing` (31–69) — incl. *The captured season-totals fixture*, *Adding integration tests*, *Scope* | **stays in README** |
| 5 | `## Project structure` (73–111) | **stays in README** |
| 6 | `## App-level architecture` (115–245) — *State management*, *leagueData assembly*, *playerRows pipeline*, *Player row shape*, *Player ID sources*, *Relevance filter* | `docs/architecture.md` |
| 7 | `## Features` (249–269) — *Persistent session*, *League selection*, *Standings · Schedule · Rosters · My Team* | `docs/ui.md` |
| 8 | `## Player Explorer` (272–327) — *Columns*, *Filter sidebar*, *Sort persistence* | `docs/ui.md` |
| 9 | `## KeepTradeCut (KTC) integration` (331–333) — summary/pointer | `docs/integrations.md` (merge with #26) |
| 10 | `## College Football Data (CFBD) integration` (337–441) — *Fetching*, *Matching*, *College metrics* | `docs/integrations.md` |
| 11 | `## Data store integration` (445–517) | `docs/integrations.md` |
| 12 | `## Career history loader` (519–552) | `docs/integrations.md` |
| 13 | `## Empirical age curves` (556–567) | `docs/dynasty-scoring.md` *(boundary call — see below)* |
| 14 | `## Dynasty scoring` (571–697) | `docs/dynasty-scoring.md` |
| 15 | `## Next-season projections` (700–819) | `docs/projection.md` |
| 16 | `## SpiderChart` (822–840) | `docs/ui.md` |
| 17 | `## Team depth chart` (844–859) | `docs/ui.md` |
| 18 | `## Role ranks` (863–869) | `docs/architecture.md` |
| 19 | `## Positional ranks` (873–886) | `docs/architecture.md` |
| 20 | `## Career comparables` (890–904) | `docs/projection.md` *(boundary call — see below)* |
| 21a | `## Player Profile panel` (908–924) + *Panel layout / Stats tab / Dynasty tab / Team tab* (937–991) | `docs/ui.md` |
| 21b | `### Enrichment overlay` subsection (925–935) | `docs/integrations.md` *(boundary call — see below)* |
| 22 | `## Explorer trend signal` (995–1004) | `docs/ui.md` |
| 23 | `## Tooltip system` (1008–1010) | `docs/ui.md` |
| 24 | `## API layer` (1014–1069) — sleeper / sleeperStats / ktc / cfbd / nflDraft / dataStore tables | `docs/integrations.md` |
| 25 | `## Cache` (1072–1109) — *Cache (cache.js)*, *Debug panel*, *Projection snapshots* | `docs/integrations.md` *(boundary call — see below)* |
| 26 | `## KeepTradeCut (KTC) integration` (1113–1169) — *Fetching*, *HTML parsing*, *Matching*, *Data flow*, *Historical KTC signals* | `docs/integrations.md` (merge with #9) |
| 27 | `## Vite configuration` (1173–1192) | `docs/architecture.md` |
| 28 | `## Sleeper API notes` (1196–1204) | `docs/architecture.md` |
| 29 | `## React Strict Mode` (1207–1209) | `docs/architecture.md` |

### Resulting doc contents (section order within each)

- **architecture.md** — App-level architecture (#6) · Role ranks (#18) ·
  Positional ranks (#19) · Vite configuration (#27) · Sleeper API notes (#28) ·
  React Strict Mode (#29).
- **projection.md** — Next-season projections (#15) · Career comparables (#20).
- **dynasty-scoring.md** — Empirical age curves (#13) · Dynasty scoring (#14).
- **integrations.md** — CFBD integration (#10) · Data store integration (#11) ·
  Career history loader (#12) · Enrichment overlay (#21b) · API layer (#24) ·
  Cache / Debug panel / Projection snapshots (#25) · KeepTradeCut (KTC)
  integration (#9 + #26 merged).
- **ui.md** — Features (#7) · Player Explorer (#8) · SpiderChart (#16) · Team
  depth chart (#17) · Player Profile panel (#21a) · Explorer trend signal (#22) ·
  Tooltip system (#23).

---

## Ambiguous boundary calls (resolved)

The task flagged four genuinely ambiguous placements. Each gets ONE home,
cross-linked from the other(s). Reasoning recorded so a later session doesn't
re-litigate.

1. **Empirical age curves → `dynasty-scoring.md`.**
   `computeEmpiricalAgeCurves` lives in `dynastyScore.js` (CLAUDE.md nav map),
   and its output (`positionPeakPPG`) is described as "the normalisation
   baseline throughout dynasty scoring." It feeds projection Step 2 as a
   consumer, not an owner. Home = dynasty-scoring.md.
   - Cross-link FROM `projection.md` (Step 2 "Age curve delta") → dynasty-scoring.md.
   - Cross-link FROM `architecture.md` (playerRows upstream memo
     `empiricalCurves`/`positionPeakPPG`) → dynasty-scoring.md.

2. **Career comparables → `projection.md`.**
   `careerComps.js` is consumed by both the Profile Stats tab (UI) and the
   projection veteran pipeline (Step 9, via `compsIntegration.js`). The
   projection pipeline is the heavier dependency and the candidate doc set
   placed it here. Home = projection.md.
   - Cross-link FROM `ui.md` (Stats tab → "Career comparables") → projection.md.
   - The existing in-section "Projection reuse" note (README line 904) already
     points at Step 9 — both now live in projection.md, so it resolves locally.

3. **Enrichment overlay → `integrations.md`.**
   The overlay is a data-store-fed layer: loaded by `src/api/enrichment.js`,
   read by `src/utils/enrichmentLookup.js`, authored/validated in the data repo.
   Planning an enrichment change edits those modules → integrations.md. The
   whole `### Enrichment overlay` block (README 925–935) moves intact (verbatim)
   out of "Player Profile panel" into integrations.md.
   - Cross-link FROM `ui.md` (Stats tab → AvailabilityHistory DNP tooltips, and
     the `enrichmentMap` value in ProfileDataContext) → integrations.md.

4. **Projection snapshots & Cache → `integrations.md`.**
   The whole `## Cache` section (README 1072–1109: cache.js, Debug panel,
   Projection snapshots) is data-layer plumbing. Home = integrations.md. This
   also makes the CLAUDE.md ephemeral-inputs invariant's pointer resolve to a
   single doc (see Docs updates).
   - Cross-link FROM `projection.md` ("Projection snapshots" capture the
     pipeline output) → integrations.md.

---

## Internal cross-references to rewrite

These are the in-prose "See …" references that currently rely on single-file
anchors. After the split, repoint each to its new doc. (Markdown `→` arrows in
formulas/tables are not links and need no change.)

| Source (README line) | Current text | New target |
|---|---|---|
| architecture.md, ex-line 195 | "See College Metrics section below." | "See [College metrics](integrations.md#college-metrics-srcutilscollegemetricsjs) in integrations.md." |
| architecture.md, ex-line 196 | "See Next-season projections section below." | "See [Next-season projections](projection.md) in projection.md." |
| dynasty-scoring.md, ex-line 626 | "See Next-season projections." | "See [Next-season projections](projection.md)." |
| dynasty-scoring.md, ex-line 661 | "see Next-season projections § Step 5c." | "see [Next-season projections § Step 5c](projection.md) in projection.md." |
| dynasty-scoring.md, ex-line 696 | note referencing `seasonProjection.js` / Thread D | add trailing cross-link "(see [projection.md](projection.md))" — wording otherwise verbatim. |
| projection.md, ex-line 799 | 'See "Historical KTC signals" under KTC integration for the loader.' | 'See [Historical KTC signals](integrations.md#historical-ktc-signals-srcutilsktchistoryjs) in integrations.md for the loader.' |
| projection.md, ex-line 730/728 (Step 9 / Step 5e) | references `compsIntegration.js` / `efficiencyMetrics.js` | no link change — both targets are now within projection.md; text stays verbatim. |
| integrations.md, ex-line 333 | "See [Fetching](#fetching-srcapiktcjs) section below …" | keep anchor — the KTC summary and the detailed Fetching section both live in integrations.md, so `#fetching-srcapiktcjs` still resolves. |

**KTC double-heading merge:** the README has two `## KeepTradeCut (KTC)
integration` headings (summary at 331; full at 1113). Both move to
integrations.md and MUST become a single `##` section to avoid a duplicate
heading. Put the summary sentence (331–333, including its "See Fetching below"
link) as the lead paragraph, immediately followed by the detailed subsections
(`### Fetching`, `### HTML parsing`, `### Matching`, `### Data flow`,
`### Historical KTC signals`) verbatim. No sentence is dropped.

**Data-repo links stay verbatim** (they point at the data repo's README, which
this task does not change): README lines 933 (`sleeper-dashboard-data/README.md →
Enrichment overlay`, moves into integrations.md with Enrichment overlay) and 1109
(`sleeper-dashboard-data/README.md → snapshots/<date>.json`, moves into
integrations.md with Projection snapshots).

---

## New top-level README structure

After the split, `README.md` is a human entry point only:

```
# Sleeper Dashboard          (intro — verbatim, lines 1–4)
## Tech stack                (verbatim)
## Running locally           (verbatim)
## Testing                   (verbatim, incl. its 3 subsections)
## Project structure         (verbatim)
## Documentation             (NEW — index, text below)
```

### `## Documentation` index text (new — the only net-new prose in README)

```markdown
## Documentation

Deep behavioural docs live in [`docs/`](docs/). Each maps to one unit of
planning work — pair it with the named module when making a change.

- [docs/architecture.md](docs/architecture.md) — App.jsx state, `leagueData`
  shape & assembly, the playerRows pipeline and player-row shape, player-ID
  sources, the `isRelevantPlayer` filter, positional & role ranks, Vite config,
  Sleeper API notes, React Strict Mode.
- [docs/projection.md](docs/projection.md) — Next-season projections (the 13-step
  veteran pipeline, comp-blend, rookie path, capture-only factors) and career
  comparables.
- [docs/dynasty-scoring.md](docs/dynasty-scoring.md) — Empirical age curves and
  dynasty scoring (routing, prospect & component scores, labels, special
  signals, late-career/depth gates).
- [docs/integrations.md](docs/integrations.md) — Sleeper stats & career-history
  loader, KTC (fetch/parse/match/history), CFBD, nflverse draft, data-store
  integration, enrichment overlay, cache, projection snapshots, and the
  API-layer tables.
- [docs/ui.md](docs/ui.md) — Player Explorer (columns, filters, sort), the
  Player Profile panel and its tabs, SpiderChart, Tooltip, team depth chart, and
  the Features/tabs overview.
```

(The `projection-data-plan.md` planning doc is separate and is NOT linked from
this index — see Out of scope.)

---

## Step sequence

1. **Create `docs/`** and the five empty files.
2. **Move content into each doc**, in the within-doc order listed above. Cut the
   sections from README and paste verbatim. Add the one-line intro sentence at
   the top of each doc:
   - architecture.md: "Deep reference for the App.jsx state model, the playerRows
     pipeline, ranks, and platform/runtime notes."
   - projection.md: "Deep reference for next-season projections and career
     comparables."
   - dynasty-scoring.md: "Deep reference for empirical age curves and dynasty
     scoring."
   - integrations.md: "Deep reference for the API/data-store layer, loaders,
     enrichment, cache, and projection snapshots."
   - ui.md: "Deep reference for the Explorer, Player Profile panel, and shared UI
     components."
3. **Merge the two KTC headings** in integrations.md into one section (see above).
4. **Move the `### Enrichment overlay` block** intact into integrations.md (as a
   `##` section).
5. **Rewrite internal cross-links** per the table above.
6. **Trim README** to the new top-level structure and insert the `## Documentation`
   index.
7. **Update CLAUDE.md** per Docs updates below.
8. **Verify links resolve:** every `docs/…#anchor` referenced above matches a
   real heading; the README index links to all five files; no remaining
   `README.md → …` pointer survives in CLAUDE.md except the model-routing row
   (line 163, intentionally left). Run `npm run build` as a smoke check (no
   source changed, so it must stay clean) — this is the done-definition for a
   docs-only change.

---

## Docs updates

### CLAUDE.md (app repo) — three section references to rewrite

**1. Navigation map (line 29)**
- Before: `Deep behaviour is in README.md. Use this table to find which file to edit.`
- After: `Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). Use this table to find which file to edit.`

**2. Ephemeral-inputs invariant (line 108) — final sentence only**
- Before: `… Use `projectionSnapshot.js` to capture them at observation time. See README.md → "Projection snapshots" and "Data store integration".`
- After: `… Use `projectionSnapshot.js` to capture them at observation time. See docs/integrations.md → "Projection snapshots" and "Data store integration".`

**3. Self-maintenance (line 175) — final sentence only**
- Before: `… Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into README.md and link to it rather than duplicating it here.`
- After: `… Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into the relevant `docs/` file and link to it rather than duplicating it here.`

**Reviewed and intentionally NOT changed:**
- CLAUDE.md line 163 (`| README / CLAUDE.md updates after a feature lands | sonnet |`) — a model-routing table row, not a section pointer; still accurate (README + docs are both maintained by sonnet).
- CLAUDE.md cross-repo-contracts and nav-map rows that reference `src/…` files — unaffected by a docs move.

### README Documentation-index text

Given verbatim above under "New top-level README structure → `## Documentation`
index text." This is the only net-new prose introduced by the task.

---

## Tests to add

None. This is a docs-only change — no source, no behaviour, no contracts touched.
The factors/stat-key contract tests and the suite are unaffected. `npm run build`
remains the only smoke check.

---

## Cross-repo impact

**Action required: none.** (Constraint also forbids editing the data repo.)

Findings from `sleeper-dashboard-data`:
- The data repo's `CLAUDE.md` "Cross-repo contracts" table (lines 115–122) maps
  every contract to **app `src/…` files** (`projectionSnapshot.js`,
  `dataStore.js`, `enrichment.js`, `enrichmentLookup.js`, `pivotStatRows`), not
  to any README section. The split does not touch source, so these resolve
  unchanged.
- The data repo's "Sibling repo" note (`CLAUDE.md` line 127) says only: "Its
  README documents the projection pipeline and data-store consumption." This is a
  generic statement with no anchor/section link. After the split that detail
  lives in `docs/projection.md` and `docs/integrations.md`, reachable via the
  README Documentation index, so the statement remains broadly true. It would
  read marginally more precisely as "Its README and `docs/` document …", but
  editing the data repo is out of scope and not required for anything to resolve.
- `grep` of the data repo's `README.md` and `CLAUDE.md` found **no links into
  app-README anchors** — nothing breaks.

---

## Out of scope (do not touch)

- Any file under `src/` — zero source edits.
- The data repo (`sleeper-dashboard-data`) — including its generic sibling-repo
  note.
- `.claude/tasks/projection-data-plan.md` — separate planning doc; `docs/projection.md`
  may cross-link to it but must not absorb it. (Note: this file was not found in
  the repo at plan time; if it does not exist, simply do not create or link it.)
