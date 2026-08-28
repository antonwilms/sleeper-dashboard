# Data-repo backlog — asks discovered from the app side

**What this is.** A running list of work that belongs in `sleeper-dashboard-data`, discovered while
building in **this** repo. The app repo cannot edit the data repo, so these accumulate here and are
executed in one batch rather than interrupting app slices.

**Decision (Anton, 2026-08-21):** batch these and do them **after dp-v2 Slice 7**, unless an item is
**truly blocking** — meaning an app slice cannot ship a correct result without it. Nothing currently
listed is blocking; each is either cosmetic or gates a feature that was deliberately cut rather than
shipped broken.

**How to use it.**
- **Appending** is part of every slice's done-definition. When a slice discovers a data-repo ask,
  add a row *in the same change*, with the commit that found it.
- **Do not fix these from the app repo.** If an app-side workaround exists, it belongs in the slice;
  if it does not, the item is what gets recorded.
- **When the batch runs**, this file is the *input*, not the plan. Each item gets transcribed into a
  proper task file in the data repo's own `.claude/tasks/`, planned under that repo's conventions
  (opus plans → plan-reviewer → sonnet), and then struck through here with its data-repo commit.
- **This is not the cross-repo contract registry.** `docs/cross-repo-registry.md` records *contracts
  that already exist*; this records *work that does not exist yet*. An item here may or may not end
  up touching a `CR-NN` entry — that gets decided when it is planned.

---

## Open

### D-5 · A completed season's `inProgress` flag is never re-sealed
**Found:** in-season app-read planning review (`22ed5c1`) · **Blocking:** no (bites in ~a year) · **Size:** small

**Introduced by §2 of the in-season work** (data `697ae73`), so this is a regression to close, not a
pre-existing gap. `shouldSkipCompletedSeason` returns at `scripts/update-nfl.mjs:85`, **before**
`updateManifestEntry` at `:148`. The scheduled job passes no `--year` (it always targets the current
season), so once a season closes every subsequent run skips early and **its manifest entry keeps
`inProgress: true` indefinitely** — only a manual `--force` would ever flip it.

**Why it bites, and why it is silent.** A year later that season enters the app's `careerStats`
window (`s < currentSeason`). `getSeasonTotals` reads with the **default** `allowInProgress: false`,
so `tryDataStore` rejects the entry, and **every user falls back to the 18-week live-API loop for
that season permanently** — on the league's own scoring basis rather than the store's `pts_half_ppr`,
i.e. a silent mixed-basis corpus. No error, no test failure.

**The fix:** on the skip path, still update the manifest entry's `inProgress` to `false` — a
metadata-only write with no data write. §2's fix closed the *write-refusal* half of the season-close
problem; this is the *flag* half, which it did not reach.

### D-1 · Byes never resolve in served season-totals
**Found:** dp-v2 Slice 4a (`855aded`) · **Blocking:** no · **Size:** small

The store-served `nfl/season-totals/<year>.json` never emits `weeklyStatus: 'B'`. Verified across all
**2,832 players** in the 2025 file: the distribution is `P`/`X`/`D` only, and **every** player's
`byeWeeks` is `0`. Real byes land as `'X'` (unresolved) — confirmed against
`nflverse/schedule/2025.json` for a team with a known bye.

The app's live-API path (`src/api/sleeperStats.js:205-213`) classifies byes correctly by checking the
set of teams playing that week, so the two paths disagree: the same player shows `'B'` in API-only
mode and `'X'` when served from the store. The data repo's generation script does not do the
equivalent resolution.

**Impact is cosmetic and bounded — proven, not assumed.** `computeAvailability` builds absence
segments **exclusively from `'D'` runs**, `absenceCause` is hard-coded `'unknown'`, and
`seasonProjection.js:514,524` reads only `absenceSegments` and `longestAbsence`. So `'B'` versus
`'X'` is *indistinguishable to every scoring path*. The only visible consequence is the pop-up's
Availability grid, which renders a `'no game recorded'` state where a bye belongs (dp-v2 Slice 4b,
`eab9fe7`, §4.1) and cannot show a bye legend under normal operation.

**The fix** is in the data repo's season-totals generation: resolve byes the way `sleeperStats.js`
does, from the set of teams playing each week, and populate `weeklyStatus 'B'` + `byeWeeks`.

**Do not "fix" this app-side by reconstructing byes from the schedule.** The season-grain team is a
single *dominant* team per season (CR-02's `aggregateWeeks` rule), so a traded player would be given
phantom byes for his old team's weeks. That route is explicitly forbidden in Slice 4b's task file.

### D-2 · `advStats` carries no EPA
**Found:** dp-v2 (`fb8c2dd`) · **Blocking:** no · **Size:** medium

`nflverse/advstats/<year>.json` serves `targetShare`, `airYardsShare`, `wopr`, `racr` and their
components — but **no EPA**. It is the only cheap season-aggregated per-player family; `gamelogs`
carries EPA but at **8.2 MB/season**.

**Consequence:** *EPA per opportunity* (rec EPA ÷ target, rush EPA ÷ carry, pass EPA ÷ attempt) cannot
be shown as a per-season series without loading ~33 MB of gamelogs for five seasons. It was therefore
**cut** from the pop-up's Usage & efficiency section (Slice 4b) rather than deferred, and the same
constraint will apply to Market's Efficiency set in Slice 5.

**The ask:** add season-aggregated EPA to the advstats pack — `passingEpa`, `rushingEpa`,
`receivingEpa` summed per player-season, alongside the existing components, so a rate can be
recomputed app-side without summing stored rates.

This is the higher-value of the two: it unlocks a metric the project's own research
(`docs/prediction-research-eval.md` §D-1) rates as the single highest-priority gap, on both surfaces
that want it.

### D-4 · `validateKtc` asserts nothing about the 36 pick rows
**Found:** dp-v2 Slice 7 planning review (`f3996a7`) · **Blocking:** no · **Size:** small
**✅ RESOLVED 2026-08-24** — data repo `02cf41d`. `validateKtc` now requires ≥1 pick row per round
1–4 and ≥24 total, matched on `/^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/`. Deliberately a
**floor, not an equality**: 36 = 3 classes × 3 tiers × 4 rounds is upstream-controlled, so `=== 36`
would fail on good data the year KTC publishes a fourth draft class. Verified against a live scrape
(500 rows) and by four new tests. Planned in the data repo's
`.claude/tasks/post-dp-v2-data-batch.md` §6 (that file is local — `.claude/` is gitignored there).

`validateKtc` (`lib/validate.mjs`) asserts total row count (250–600), ≥5 rows each for QB/RB/WR/TE,
non-empty names, and a value range — **nothing about the 36 pick rows** (`<YYYY> <Early|Mid|Late>
<1st|2nd|3rd|4th>`, `position: null`, `team: "FA"`) that `src/utils/ktcPicks.js` started reading in
this slice (CR-17, extended).

**Why it matters now, not before:** before this slice nothing in `src/` read the pick rows, so their
silent disappearance had no consumer to notice. Now Portfolio's ROSTER VALUE headline and holdings
table read them directly. If KTC's DOM changed and all 36 pick rows vanished from a scrape,
`validateKtc`'s existing floors would still pass (500 → 464 rows is still ≥250, and every
position-count floor is untouched by losing rows with `position: null`) — the scrape would validate
clean and the app would silently show every pick as unpriced, with no error and no test failure on
either side.

**The fix** is in the data repo's KTC validator: add a pick-row floor (expect 36, or at minimum ≥1 per
round 1–4) alongside the existing player-row assertions.

**Why it is not blocking:** the app already renders an unpriced pick correctly (a dashed `—`, counted
into `+ N UNPRICED ASSETS`, `PROVISIONAL(no-data)`) — this is a detection gap for a scrape regression,
not a present incorrectness. Batched with D-1/D-2/D-3 per the file-level decision above.

### D-3 · Four stat keys are load-bearing with no contract recording it
**Found:** dp-v2 Slice 5b planning (`d2f1a4f`) · **Blocking:** no · **Size:** small
**✅ RESOLVED 2026-08-24** — implemented per `.claude/tasks/d3-efficiency-stat-key-contract.md`.
Research turned up a **fifth** key the entry below missed (`pass_sack`, with a second consumer at
`outlookPositionStats.js:128`) and a fabricated-zero bug in `sackPct`/`ayPerAtt` (missing key
divided a surviving denominator, rendering a confident `0.0` instead of `—`) — both fixed in the
same change. All five keys now enforced by `EFFICIENCY_SET_KEYS` in `statKeysContract.test.js`, and
recorded as **CR-19**, landed byte-identical in this repo's `docs/cross-repo-registry.md` and the
data repo's `README.md` mirrored region. `docs/signal-registry.md` gained a row for the five keys.
**Different in kind from D-1/D-2** — this is a *registry* gap, not an ingest change, and it lands in
**both** repos rather than only the data one.

`rush_yac`, `rush_btkl`, `rec_drop` and `pass_air_yd` have **zero** app-side readers today, appear in
**no** `docs/signal-registry.md` row, and are covered by **no** `CR-NN` entry. Slice 5b makes all four
load-bearing for a visible surface (Market's Efficiency set: `YAC`, `BTKL`, `DROPS`, `AY/ATT`).

CR-02 governs season-totals *schemaVersion and row composition*, not key preservation — which is
exactly why CR-11, CR-12 and CR-13 exist as per-key entries over the same `aggregateWeeks` path. These
four have no equivalent, so if the data repo ever renamed or filtered one, the app would lose a column
with **no error and no test failure**.

**Why it is not blocking:** the keys are read-only from the app's side and all four are present today.
The risk is future silent breakage, not present incorrectness.

**How it gets done** — and it is the one item here that does **not** start in the data repo. Per
CLAUDE.md's workflow convention, a coupling no registry entry covers is the single residual case that
routes to the **Claude.ai project**, which can hold both repos at once. Its output is a *draft*
`CR-NN` entry in the format at the top of `docs/cross-repo-registry.md`; that draft returns to a
normal in-repo planning session and lands in **both** registries in the same change.

---

## Pre-existing data-repo backlog — recorded there, not here

These were known before dp-v2 and live in the data repo's own docs. Listed only so nobody re-discovers
them and files a duplicate:

- `nflverse/roster` 2012–2015 absent (upstream files fail the shared `MIN_ROSTER_IDS` gate).
- CFBD college files lag at 2017–2024 until 2025 is materialized.
- Enrichment overlay: `scheme.json` / `injuries.json` / `notes.json` are 0-entry scaffolds; only
  `coaching.json` is populated (~95 entries). The hand-authored path has demonstrably not filled them.
- A precomputed teamcontext season-summary pack was **considered and rejected** for dp-v2 (Slice 6's
  14-season fetch is permanently cached and first-visit only). Recorded so it is not re-proposed as
  new.

---

## Done

*(none yet — struck-through items move here with their data-repo commit)*
