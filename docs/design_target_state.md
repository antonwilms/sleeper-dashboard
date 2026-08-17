# Target state — an independent design handoff

**Written:** 2026-08-16, against `sleeper-dashboard` @ `145b7d2` and `sleeper-dashboard-data` @ current.
**Method:** app source read directly (not docs); every data claim verified by opening the actual
served file and counting nulls; competitor products fetched live.
**Deliberately not read:** `docs/design_brief_v2/`. This is an independent conclusion.

**Verification:** 56 of 56 cited data fields were confirmed present by opening the served files —
gamelogs, teamcontext, season-totals, players-state, enrichment, oline and the crosswalk. All
app-side symbols cited (`yearsFromPeak`, `divergenceSignal`, `ownerTeamName`, `ktcValue`,
`careerSparkline`, `resolvePlayerTeam`, `passerRating`) resolve in live `src/`.
**One citation failed and the text was corrected:** `roster_positions` appears nowhere in `src/` —
see §7.4. `computeKtcRecentDelta` was confirmed recoverable from commit `3f55245`.

**Competitor evidence:** KeepTradeCut (rankings table, player page, trade calculator) and
PlayerProfiler (full metric glossary) were fetched live. FantasyCalc's data model was read from its
live public API. DynastyProcess's open-data repo was read. **Dynasty Daddy and Fantasy Points could
not be inspected** — both are client-rendered and the browser tooling was unavailable this session;
their treatment below leans on secondary sources and is the weakest part of this document.

---

## 1. Thesis

> **Every number on screen traces to a game that was actually played — for all twelve rosters, not
> just yours.**

The competitive gap is specific and it is not "a better score." KeepTradeCut and FantasyCalc are
market instruments that carry **no on-field data at all** — KTC's player page shows value, rank,
tier, liquidity, bio and a price chart, and not one target, snap or yard. PlayerProfiler carries
deep on-field data but **no knowledge of your league** and puts most of it behind a paywall.
Sleeper knows your league perfectly and shows you almost nothing about why a player is good.

This app is the only one of the four that already holds all three: your league's real rosters, a
per-game record of what happened on the field back to 2012, and a model that can disagree with the
market. It currently shows the third and hides the second.

**What the competitors do that this app should copy.** Three specific things, all observed live:

- **KTC's price history and neighbours.** The player page carries a value chart with
  1mo/3mo/6mo/1yr/All-time toggles, separate overall- and positional-rank history charts, and
  "Value Adjacent" lists showing the players immediately above and below. The adjacency list is the
  cheapest good idea on their site — it turns an abstract number into "you'd have to give up
  roughly this." All of it is buildable here from the KTC series (§3.1).
- **FantasyCalc's redraft-vs-dynasty split.** Their API returns `value`, `redraftValue` and
  `redraftDynastyValueDifference` side by side, keyed by `sleeperId`. Quantifying *how much of an
  asset's price is win-now versus future* is the most useful thing any of them publishes, and none
  of the others foregrounds it.
- **KTC's trade-shape analysis.** Their calculator reports not just the totals but
  Value Dispersion, 6-Month Value Span and per-side Quick Facts (age, rank) — i.e. whether you are
  consolidating or spreading. That framing survives without a decision engine.

**What none of them do**, and what this app is uniquely positioned for: connect a player's on-field
evidence to *your specific league's* ownership map. KTC and FantasyCalc have no idea who owns whom.
PlayerProfiler has no idea your league exists. Sleeper knows ownership and shows no analytics.

That is also the standing directive (`dynasty-portfolio-1b.md` §4a.1 — *"the first prio is to
visualise all kinds of data for the nfl players; having computed scores and rankings is secondary"*).
The design that shipped leads with the opposite emphasis. This plan corrects that.

---

## 2. What is actually dark today

This is the core finding and it is much larger than "a meaningful amount."

### 2.1 Families with a working loader that nothing ever calls

`grep` for the loader across `src/` returns only the loader's own file:

| Family | Loader | Content, verified | Cost to light up |
|---|---|---|---|
| **Per-game player stats** | `src/api/nflGameLogs.js` · `loadNflGameLogs` | 2012–2025, 6,357 game rows in 2025 alone. Per game: `targetShare`, `airYardsShare`, `wopr`, `racr`, `receivingAirYards`, `receivingYardsAfterCatch`, `passingEpa`, `passingCpoe`, `rushingEpa`, `receivingEpa`, `passingFirstDowns`, plus every counting stat. **100% non-null** for counting stats; EPA/CPOE 100% for QBs with ≥10 attempts; `targetShare`/`receivingEpa` 100% for WR/TE with ≥3 targets | Loader, cache, sparsity gate and tests all exist. Wiring is a call site. |
| **Team context** | `src/api/teamContext.js` · `loadTeamContext` | 2012–2025, 570 team-week rows in 2025, **zero nulls**. Offense: `plays`, `passRate`, `proe`, `epaPerPlay`, `passEpaPerPlay`, `rushEpaPerPlay`, `successRate`, `rzTrips`, `rzPassRate`, `rzTdTrips`, `neutralSecPerPlay` (pace), `pointsScored`. Defense faced: same shape + `rzTripsAllowed`, `pointsAllowed` | Same — loader exists, TEAM-keyed, joins via `utils/playerTeam.js` |
| **Schedule / results / Vegas lines** | `src/api/nflSchedule.js` · `loadNflSchedule` | 1999–2026 | Same |

**These are not "loaded and unrendered." They are never loaded at all.** So the current cost is
zero and the incremental cost of showing them is a call site plus a component — not an ingest
project. CLAUDE.md's phrasing ("the loader still runs for nobody") is slightly off: it doesn't run.

### 2.2 Families loaded every session and rendered nowhere

| Family | Loaded at | Where it dies |
|---|---|---|
| **Advanced receiving** (`advStats`) | `App.jsx:868` | Flows into `ProfileDataContext`, exposed by `usePlayerProfile` as `advStatsRow`/`advStatsSeason`/`snapShare`/`usageShare` — **no component destructures any of them.** Renderer deleted with the Explorer in Slice viii |
| **Enrichment overlay** | `App.jsx:256` | `utils/enrichmentLookup.js` (`findInjuryForWeek`/`getCoaching`/`getScheme`/`getNotes`) has **zero consumers anywhere in `src/`.** Note: 3 of its 4 files are empty upstream — `injuries.json`, `scheme.json`, `notes.json` all contain `entries: []`. Only `coaching.json` has data (HC/OC/DC per team, 2026) |
| **College metrics** | `App.jsx:822` | Feeds the rookie projection (live, correct). `collegeMetrics` exposed by the hook, rendered by nothing |
| **KTC history** | `App.jsx:247` | Feeds capture-only projection factors that by invariant cannot move `projectedPPG`. Rendered by nothing since `computeKtcRecentDelta` was deleted in Slice viii |

### 2.3 Computed per player, every session, rendered nowhere

`usePlayerProfile` returns 30 keys. `PlayerDetailModal` destructures 13. Never rendered:

`dynRank` · `ktcRank` · `recentRank` · `peakRank` · `consistencyRank` · `dynastyRank` ·
`rankMovement` · `movementLabel` · `careerTotalPts` · `careerTotalGP` · `historicalRanks` ·
`availableSeasons` · `getSeasonData` · `roleRank` · `shareHistory` · `collegeMetrics` ·
`teamDepthChart` · `nextSeasonRank` · `advStatsRow` · `advStatsSeason` · `snapShare` · `usageShare`

### 2.4 Ingested in the data repo with no app loader at all

| Family | Content | Status |
|---|---|---|
| **`nflverse/oline/2026.json`** | 10,047 rows, 32 teams, weekly OL depth chart by slot (LT/LG/C/RG/RT) with `gsisId` | No `src/api/` module exists. Not in CLAUDE.md's nav table |
| **`nfl/players-state/<date>.json`** | 4 weekly snapshots (2026-07-18 → 2026-08-08), 1,039 players. `injuryStatus`, `injuryBodyPart`, `injuryNotes`, `depthChartPosition`, `depthChartOrder`, `team`, `status`, `active` | Capture-only. The **only** record of depth-chart and injury state over time — Sleeper's own API is current-state only, so every uncaptured week is permanently lost |
| **`nflverse/playerids.json`** | 6,154-row gsis→sleeper crosswalk | Internal to the data repo |

---

## 3. Corrections to the record

Two things the repo currently believes are wrong. Both change what can be built.

**3.1 The KTC snapshot series is healthy, not "sparse/broken."**
`dynasty-portfolio-1b.md` §2.2 cut the 30-day value delta because the series was believed broken,
and Slice viii deleted `computeKtcRecentDelta` outright. Verified: `ktc/snapshot-*.json` holds **11
weekly snapshots** from 2026-05-18 to 2026-08-10; **473 of ~500 players appear in all eleven**, 491
appear in at least eight. `ktcHistory.js` already passes `allowInProgress: true`, so the
`inProgress` flag is not blocking it. **The 30-day delta, the value sparkline and the risers/fallers
list are all buildable today.**

**3.2 EPA is not absent from the app's world — it is absent from its screens.**
`prediction-research-eval.md` D-1 calls QB EPA/attempt the highest-priority gap and routes it to a
data-repo sourcing question (§F.4: *"does nflverse expose season-level EPA/attempt joinable by
sleeper_id?"*). It already does, and this repo already ingests it: `nflverse/gamelogs/<year>.json`
carries `passingEpa` and `passingCpoe` per game, keyed by `sleeper_id`, **100% present for every QB
game with ≥10 attempts across 2012, 2019 and 2025** (spot-checked; the family is complete 2012–2025).
Displaying it is a rendering job. *Activating* it into the projection remains a grading question and
this plan does not propose activating it.

**3.3 A coverage cliff the spec must respect.** `off_snp` (snap share) exists **only from 2020**.
Verified: 0% of players in every season 2012–2019, then 100% of players with ≥20 targets from 2020
on. Any snap-share chart must start at 2020 and render `—` before it, never zero. By contrast
`rec_air_yd`, `rec_rz_tgt`, `rec_yar` and `rec_drop` are ~85–100% complete for ≥20-target players
across the whole 2012–2025 span.

---

## 4. Feasibility answers

### 4.1 Routes run — **No. Do not plan for YPRR.**

- **True routes run is proprietary.** PFF sells it; PlayerProfiler licenses it (their glossary
  carries `Route Participation`, `Target Rate` = targets/routes, `Route Separation`, `Slot Rate`)
  via SportsDataIO/FTN partnerships. There is no free feed.
- **nflverse FTN charting** (`load_ftn_charting`, 2022+, CC-BY-SA) is play-level and carries
  **no player identifiers** — 29 columns of play context (hash, QB location, box count, motion,
  play action, screen, RPO). Useless for a per-player denominator.
- **nflverse participation data** (`load_participation`, 2023+ via FTN, post-season only, no
  in-season updates) does carry `offense_players` — a semicolon-delimited list of gsis IDs on the
  field per play — and **would** join to `sleeper_id` through the existing
  `nflverse/playerids.json` crosswalk. But counting pass plays a player was on the field for gives
  **pass snaps, not routes**: it cannot distinguish a route from pass protection or a chip release.
- **Verdict:** the honest derivable metric is *yards per pass snap*, 2023+, refreshed once a year
  after the postseason. That is a different, weaker statistic than the one the research rates at
  r≈0.55, and shipping it labelled "YPRR" would be a fabrication. **Recommend: do not build.** If
  the efficiency-per-opportunity idea is wanted, `receivingEpa` per target from the gamelogs family
  is already available at 100% coverage back to 2012 and needs no new source.

### 4.2 Traded picks — **Yes, fully reconstructable. This is the biggest unlock in the plan.**

`GET /v1/league/<id>/traded_picks` returns, per the official docs, an array of:

```
{ season, round, roster_id, previous_owner_id, owner_id }
```

`roster_id` = **original** owner (i.e. whose pick it is, which sets its slot), `owner_id` = who
holds it now. It returns **only traded picks** — untraded ones are implicit, so reconstruction is:

1. Seed: every roster owns its own pick in every round, for each future season the league tracks.
2. Overlay each `traded_picks` row: move `(season, round, roster_id)` to `owner_id`.

Round count comes from the league's `settings`; roster→manager from `/rosters` + `/users`, both
already loaded.

**The plumbing is cheaper than it looks.** `src/api/sleeper.js` already exports `getLeagueDrafts`
and `getDraftPicks` — the app calls both to build `leagueData.rookieDraftPicks` (a map of
*already-drafted* players → `{round, pick}`, feeding `computeDynastyScore`'s per-league draft
proxy). So the league-scoped draft fetch pattern, cache wrapper and `leagueData` assembly point all
exist. Adding `getTradedPicks(leagueId)` is one more function in the same file and one more key on
`leagueData`. Note the two are unrelated in meaning: `rookieDraftPicks` is about where a current
player *was* drafted; this is about which *future, unused* picks a manager holds.

**And the values already exist.** The ingested KTC snapshots contain **36 pick rows** —
`2026/2027/2028 × Early/Mid/Late × rounds 1–4`, e.g. `2027 Early 1st = 7096`, `2026 Mid 2nd = 3061`
— carried as `{name, team:"FA", position:null, value}`. So a pick can be valued the moment its
holder is known.

**The one honest gap:** KTC prices Early/Mid/Late separately, and which tier a future pick lands in
depends on the *original* roster's eventual finish, which is unknown. Options: (a) use the Mid value
and label the tier assumption on screen; (b) show a range from Late to Early; (c) infer the tier
from the original roster's current value rank. **(b) is the only one that fabricates nothing** — it
states what is actually known: the pick is worth between X and Y. This is an open question for you
(§8).

### 4.3 Pending trade offers — **No. Not now, not later, without scraping.**

I fetched the complete official API reference. The entire documented surface is: user · avatars ·
leagues (league, rosters, users, matchups, brackets, **transactions**, **traded_picks**, state) ·
drafts (drafts, draft, picks, traded_picks) · players (all, trending). The docs state plainly it is
a **read-only** API with no authentication, "only contains league information."

`/transactions/<round>` documents `status: "complete"` and describes itself as "all free agent
transactions, waivers and trades" — completed events. A pending offer is private to two managers and
has no public resource. **2a's `HOLD` card, which exists specifically so inbound offers get an
answer, is unbuildable.** Not deferred — unbuildable within the stated constraints.

---

## 5. Verdicts on the two uncommitted directions

### 5.1 `2a` — Decision desk — **KILL**

Not "defer." Kill the design and replace the slot.

1. **It inverts the standing directive.** §4a.1 says surface data over verdicts; 2a is a screen made
   entirely of verdicts, with the data demoted to supporting evidence inside expandable cards.
2. **Its central card cannot be built** (§4.3). Card 5 (`HOLD` Ja'Marr Chase, "three offers came in
   this week") depends on inbound offers. There is no path to that data.
3. **Every confidence number is unsourced.** The cards carry `conf 78`, `71`, `66`, `55`, `92` on a
   64×5px meter. The app computes no calibrated probability of anything. These would be invented.
4. **The verb tags are the `CALL` column again**, which §4a.2 already cut from Portfolio for exactly
   this reason — and cutting it there while shipping a whole screen of it here is incoherent.
5. **The standing summary paragraph** ("You are a contender with the second-most valuable roster and
   an ageing backfield…") must regenerate from posture. Posture is the season-phase classifier that
   gates `/board` and `/trade` and does not exist.

What is worth keeping is one idea, inverted: 2a's **"QUIET — NOTHING TO DO"** card is the only part
that makes an *absence* explicit. That instinct — tell me what changed and what didn't — survives as
a different surface:

> **Build `/changes` instead.** A reverse-chronological feed of *events*, not judgments: KTC value
> moves ≥ threshold over the last 30 days (now buildable, §3.1), depth-chart order changes and
> injury-designation changes from `nfl/players-state` week-over-week, and completed league
> transactions from `/transactions`. Every row is a fact with a date. No confidence score, no verb,
> no recommendation. This answers "what do I need to look at" without pretending to answer "what
> should I do."

### 5.2 `2b` — League map — **BUILD, reduced**

This is the highest-value unbuilt surface and most of it needs no new data.

**Build:**
- **The scatter** (age × value, quadrant dividers, ownership ring encoding). Every input exists:
  `row.age`, `row.ktcValue`, `row.ownerTeamName`, `row.divergenceSignal`. Picks plot at age 21 —
  now genuinely possible (§4.2).
- **The supply/need matrix** (12 rosters × QB/RB/WR/TE/PICKS). This answers the one question no
  surface answers today and it is the precondition for any trade tool: *who is short where.*
- **The selected-asset panel's** three stat rows (market value, model vs market, position on age
  curve) — all from `row.ktcValue`, `row.divergenceSignal`, `row.dynastyScore.signals.yearsFromPeak`.

**Cut:**
- **"FIT WITH" prose.** Hand-authored per manager in the mock ("Bowers is the one asset you should
  never sell, which makes this a dead end"). Nothing generates it.
- **"SHAPE OF A DEAL"** (`YOU SEND` / `YOU GET` / value gap). Decision-engine output.
- **"Build an offer"** button. Routes nowhere.
- The other two plot modes (Model × market, Points × cost). Ship one mode; add the others when
  someone asks.

**The one real modelling decision:** the matrix cell is "startable assets above replacement, by
position." Replacement level is not a field — it is a definition. Derivable honestly from the
league's `roster_positions` (starters at each position × 12 teams gives the replacement rank), but
it is a choice you should make, not one I should assume. See §8.

---

## 6. Target information architecture

| Surface | The question it answers | Why it exists | Status |
|---|---|---|---|
| `/player/:id` (pop-up) | *What is true about this player, and what does the market think?* | The single highest-leverage surface. Where all four dark families land | **Expand heavily** — §7.1 |
| `/market` | *Who exists, and how do they compare on any axis I choose?* | The scan/filter/compare workhorse. Already good | Extend — §7.2 |
| `/portfolio` | *What do I own and what is it worth?* | Ownership view | Extend with picks — §7.3 |
| `/league` (was 2b) | *Where does value sit across all twelve rosters, and who is short where?* | The only surface that sees the other eleven teams as assets rather than opponents | **Build** — §7.4 |
| `/changes` | *What moved since I last looked?* | Replaces 2a. Events, not verdicts | **Build** — §7.5 |
| `/team/:abbr` | *What kind of offence is this player walking into?* | Lights `teamContext`. Every player's outlook is conditioned on it | **Build** — §7.6 |
| `/league/standings·schedule·rosters` | League admin views | Existing, unchanged | Keep |
| `/board`, `/trade` | — | Gated on an engine that doesn't exist | Keep gated, but see §8.3 |

**Default route.** `DEFAULT_ROUTE` is `/market` "temporarily" because Portfolio was a placeholder.
Portfolio is now real. Given the thesis, **the default should stay `/market`** — the app's value is
the whole player universe, not your fourteen guys. Revisit only if `/changes` ships, which is a
better landing surface than either.

---

## 7. Surface-by-surface specification

Every element below cites a real field in a real file. Fields marked ⚠ are subject to the
coverage limits in §3.3.

### 7.1 Player detail pop-up — the priority

Keep the existing body (identity row, four tiles, career PPG chart, drivers panel, comps, right
rail). Add **four tabs inside the pop-up body**, because this is where the dark data belongs and a
single scroll cannot hold it.

**Tab 1 — Overview.** Exactly what ships today. No change.

**Tab 2 — Usage.** *Source: `nflverse/gamelogs/<year>.json` → `players[sleeper_id].games[]`*

| Element | Field | Note |
|---|---|---|
| Target share, by game, last 3 seasons | `games[].targetShare` | 100% non-null for WR/TE with ≥3 targets |
| Air-yards share, same axis | `games[].airYardsShare` | The project's own backtest rates this the orthogonal WR/TE signal (β +0.218 WR / +0.305 TE full-panel) — **the one to lead with** |
| aDOT per game | `games[].receivingAirYards ÷ games[].targets` | Recompute; never a stored rate |
| Snap share, by season | `nfl/season-totals/<y>.json` → `stats.off_snp ÷ stats.tm_off_snp` | ⚠ **2020+ only.** Render `—` for 2012–2019, never 0 |
| Red-zone target share | `stats.rec_rz_tgt` / `stats.rush_rz_att` | ~98% for ≥20-target players, all seasons |
| Route-based metrics | — | **Omit.** No source (§4.1) |

**Do not show `wopr`.** It is in the data and it is a trap: this project's own grading found it
collinearity-inflated because it bundles `target_share`, which volume already captures. Showing it
next to `airYardsShare` invites the reader to double-count. (`advstats-grading-findings.md` §3–4.)

**Tab 3 — Efficiency.** *Source: same gamelogs family*

| Element | Field | Position |
|---|---|---|
| EPA per dropback, by game | `games[].passingEpa ÷ games[].attempts` | QB — 100% coverage 2012–2025 |
| CPOE, by game | `games[].passingCpoe` | QB |
| Receiving EPA per target | `games[].receivingEpa ÷ games[].targets` | WR/TE/RB — 70.8% of all rows, 100% for ≥3 targets |
| Rushing EPA per carry | `games[].rushingEpa ÷ games[].carries` | RB — 36.9% of all rows (i.e. rows with carries) |
| Passer rating (existing) | `stats.pass_rtg` via `efficiencyMetrics.passerRating` | Keep alongside EPA, not instead of it |

**This tab must carry a display-only banner.** EPA is view-only here; it does not and must not feed
`projectedPPG` or the dynasty score. `gameLogsViewOnly.test.js` already guards this family, so
extending it is sufficient — no new guard file needed. (The five existing guards are
`advStatsViewOnly`, `gameLogsViewOnly`, `outlookPositionStatsViewOnly`, `scheduleViewOnly`,
`teamContextViewOnly`.)

**Tab 4 — Context.** *Source: `nflverse/teamcontext/<year>.json` → `teams[abbr].games[]`, joined via
`utils/playerTeam.js` → `resolvePlayerTeam`*

| Element | Field | Why it's here |
|---|---|---|
| Team pass rate over expected (PROE) | `off.proe`, season-aggregated from `off.proeXpassSum` / `off.proePlays` | Pass-tilt is the single biggest lever on a pass-catcher's volume |
| Pace | `off.neutralSecPerPlay` (aggregate `off.neutralSeconds ÷ off.neutralGaps`) | Plays per game ceiling |
| Team EPA/play, offense | `off.epaSum ÷ off.epaPlays` | Offensive quality |
| Red-zone trips + RZ pass rate | `off.rzTrips`, `off.rzPassRate` (from `off.rzPassPlays ÷ off.rzPlays`) | TD equity, structural rather than TD-chasing |
| Defense faced, EPA allowed | `def.epaSum ÷ def.epaPlays` | Schedule difficulty, honestly framed |
| Coaching | `enrichment/coaching.json` → `entries[]` filtered by `team` + `year` | HC/OC/DC. Real for 2026 |

**Rates are never summed.** The data repo's own contract: per-week rates are stored alongside their
components, and season figures must be recomputed from the `*Sum`/`*Plays` components. The designer
should assume every rate on this tab is a computed aggregate, not a stored number.

**Also surface, in the existing right rail** (all already computed, all currently thrown away):
`recentRank`, `peakRank`, `consistencyRank`, `dynastyRank` and `movementLabel` as a small rank
block; `nextSeasonRank` beside the Next Season tile; `collegeMetrics` (dominator, breakout age) as a
rookie-only section; `teamDepthChart` as a depth-position line in the identity row.

### 7.2 Market — extensions

Keep the three column sets. Add:

- **A fourth column set, "Context"** — team PROE, pace, team EPA/play, RZ pass rate, joined per
  player via `resolvePlayerTeam`. This is the cheapest way to light `teamContext` for all players at
  once, and it reuses the existing set-switch machinery exactly.
- **30-day value delta column** — `ktcHistory` series (§3.1). Restore `computeKtcRecentDelta`
  (deleted in Slice viii; recover from git history). Add to the Value set beside `KTC`.
- **Air-yards share column** in the Outlook set, per-position, from `advStats` (already loaded,
  currently rendered nowhere) or recomputed from gamelogs. Prefer gamelogs — one family, per-game
  grain, no sparsity gate.

### 7.3 Portfolio — extensions

- **Restore the "· N rookie picks" subline** and add picks to the holdings table as rows, now that
  §4.2 makes ownership reconstructable. A pick row shows the pick label (`2027 1st`), the holder,
  and a **value range** rather than a point value.
- **Roster value must include picks** once they exist, or the tile understates the roster and the
  concentration figure is wrong. This is a correctness issue, not an enhancement.
- **Add the 30-day delta** to the roster-value tile — the master plan cut all four tile deltas for
  want of a series. One of the four now has a real one.

### 7.4 League map (`2b` reduced)

- **Scatter:** x = `row.age` (from `leagueData.playerMap[id].age`), y = `row.ktcValue`.
  Dot fill = `row.ownerTeamName === myTeamName`. Ring = `row.divergenceSignal`
  (`undervalued`/`overvalued`/`aligned`). Picks plot at x = 21 with y = the KTC pick value.
- **Matrix:** 12 rows × QB/RB/WR/TE/PICKS. Cell = count of that roster's players above replacement
  at that position, minus the league mean. **Note a real dependency here:** `leagueData` is
  `{standings, weeklyScores, weeks, rosterTeams, playerMap, rosteredIds, rookieDraftPicks,
  scoringSettings}` — it does **not** carry `roster_positions`, and nothing in `src/` reads that
  field today. If replacement level is to be derived from lineup requirements, `App.jsx` must start
  passing `selectedLeague.roster_positions` through, the same way it already passes
  `scoring_settings`. Definition itself is **pending your decision, §10.1**.
- **Selected panel:** market value (`row.ktcValue`), model-vs-market direction only
  (`row.divergenceSignal` — the existing `VsMarketCell` already words this correctly as *rank*
  distance, not price delta; keep that wording), age-curve position
  (`row.dynastyScore.signals.yearsFromPeak`).
- **Cut** the two prose panels and the offer builder (§5.2).

### 7.5 Changes

Three sections, all facts with dates:

| Section | Source | Note |
|---|---|---|
| Value moves, 30 days | `ktcHistory` series per player | Risers and fallers. KTC does exactly this and it is the most-used thing on their site |
| Depth-chart and injury changes | `nfl/players-state/<date>.json`, diffed week over week on `depthChartOrder` and `injuryStatus` | **Needs a new app loader** — none exists. Only 4 weeks of history so far, growing weekly |
| League transactions | `/v1/league/<id>/transactions/<round>` | Already reachable; adds/drops/trades with dates |

### 7.6 Team pages

One page per NFL team, from `nflverse/teamcontext/<year>.json` — season-aggregated PROE, pace,
EPA/play splits, RZ tendencies, defense faced, plus the roster of fantasy-relevant players at that
team and `enrichment/coaching.json` for the staff. 2012–2025 selectable.

This is the cheapest large win in the plan: one loader call, one page, and a 100%-complete
fourteen-season family stops being dead weight.

---

## 8. Ranked missing data, with acquisition cost

| # | What's missing | Cost | Verdict |
|---|---|---|---|
| 1 | **Pick ownership** | One unauthenticated `GET`, ~40 lines of reconstruction. Values already ingested | **Do it.** Biggest unlock per unit of work in the whole plan. Without it, roster value, concentration and any trade view are all systematically wrong |
| 2 | **Wiring gamelogs + teamcontext** | Zero acquisition. Loaders, caches, gates and tests exist; call sites don't | **Do it.** This is the thesis |
| 3 | **`players-state` app loader** | New `src/api/playersState.js` mirroring the other data-store loaders | **Do it** — it is the only injury/depth history that will ever exist, and the archive grows whether or not the app reads it |
| 4 | **KTC 30-day delta** | Un-delete one function | **Do it** |
| 5 | **Enrichment: injuries / scheme / notes** | Data-repo ingest. Currently `entries: []` in all three | **Defer.** Empty upstream; `players-state` covers injuries better and is already flowing |
| 6 | **Inbound trade offers** | No public source | **Never** (§4.3) |
| 7 | **Routes run / YPRR** | PFF or SportsDataIO licence; free approximation is a different statistic | **Don't build** (§4.1) |
| 8 | **OL composition** | `nflverse/oline/2026.json` exists; needs a loader, and 2025+ only | **Defer.** Real data, but no evidence yet that it changes a dynasty call. Revisit if the context-instability signal is ever graded |
| 9 | **A calibrated confidence number** | Requires the joint model that grading is parked on | **Blocked, correctly.** Do not invent one to fill 2a-shaped holes |

---

## 9. Mobile — what makes it cheap or expensive later

Desktop-only is the stated constraint. Three decisions in this plan are the ones that determine
whether mobile is a re-skin or a rewrite:

- **Cheap: the pop-up tabs (§7.1).** Tabbing the detail body is *more* mobile-friendly than a long
  scroll, and `PlayerDetailTabs.jsx` already owns a tab strip. Reuse that pattern rather than
  inventing a second one.
- **Cheap: Market's fourth column set.** The set-switch is already the responsive escape hatch —
  fewer columns per view is exactly what a narrow screen needs.
- **Expensive: the 2b scatter.** Absolutely-positioned dots in a 430px plot with a 300px side panel
  has no small-screen form. If mobile matters at all, spec the matrix as the primary artefact and
  the scatter as the desktop-only enrichment — the matrix is a 12×5 grid, which collapses fine.
- **Expensive: a sixth nav item.** `BottomTabBar` is capped at 5 and `PRIMARY_NAV` is flat. This
  plan adds `/changes`, `/league` (map) and `/team/:abbr`. **At most one can join the tab bar.**
  Recommend: `/changes` takes the slot; the map and team pages are reached from within Market and
  the pop-up respectively, not from the tab bar.
- **A standing trap:** `--color-dp-*` is dark-only by design with no `.dark` override, so every new
  surface must paint its own ground (`bg-dp-canvas`) before using any `text-dp-*` class or it
  renders unreadable when the app's theme toggle is set to light. That applies to all four new
  surfaces here.

---

## 10. Open product questions — I can't answer these without you

**10.1 What is "above replacement"?** (blocks the 2b matrix)
The matrix cell needs a replacement baseline. Defensible options: the Nth-best player at that
position across the league where N = starters-at-position × 12; or a fixed positional rank; or a
value threshold. Each produces a different matrix and each is a real product opinion. I won't pick.

**10.2 How should an untraded future pick be priced?** (blocks picks in Portfolio)
KTC prices Early/Mid/Late separately and which one applies depends on a finish nobody knows yet.
Range (Late→Early) fabricates nothing but is harder to sum into a roster total. A single Mid value
sums cleanly but asserts something unknown. My recommendation is the range, with the roster-value
tile showing a range too — but that changes a headline number on a shipped screen, so it's yours.

**10.3 Does `/changes` replace `/market` as the default route?**
It is the better daily landing surface. It is also the one surface here that doesn't exist yet, so
committing the default to it is a bet.

**10.4 Is the pop-up the right container for four tabs of data?**
An alternative is promoting player detail to a real route with the pop-up as a preview. The pop-up
was a deliberate choice in `1b` ("never a separate route") and I'd keep it — but four tabs of dense
charts inside a modal is more than that decision was originally sized for, and you own that call.

**10.5 Should EPA be shown at all while grading is parked?**
Showing a metric the model doesn't use invites "why doesn't the score reflect this?" The display-only
invariant answers it technically. Whether it answers it *for you as a user* is a product question.

---

## 11. What I would not build

Stated plainly, because the brief asked for it:

- **2a in any form.** §5.1.
- **A risk Low/Med/High label.** Still no defensible threshold. `±SD` alone is honest and already
  ships.
- **Any `CALL` / verb / recommendation column**, anywhere, until the marginal-value engine exists.
- **WOPR**, despite it being in the data and in the literature. This project's own backtest says it's
  a trap.
- **A trade "fairness" verdict.** A two-basket value calculator with KTC sums is trivial and useful;
  a verdict on whether the trade is *good* is the gated engine wearing a hat.
