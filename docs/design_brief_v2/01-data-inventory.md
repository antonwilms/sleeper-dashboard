# Appendix A — What the app can actually show

Ground truth for [`README.md`](README.md) §5. Every data family reaching the app or the store, with
**verified** coverage, the fields it carries, whether anything renders it today, and where it
should go.

**Verified 2026-08-16** against `sleeper-dashboard` @ `3f55245` and `sleeper-dashboard-data` @
`f0c1fc4`, by reading the actual JSON files and the actual source — not the documentation. Where a
figure came from docs without independent check it is marked **[doc]**. Everything else was
counted.

**Why this exists.** The repo already has two registries — `docs/signal-registry.md` (how the app
*consumes* each signal) and the data repo's `data-catalog.md` (how each family is *stored*).
Neither answers the design question: *what can be put on a screen, how far back does it go, and how
often is it missing?* That is this file.

---

## 1. Visibility status legend

| Status | Meaning |
|---|---|
| **RENDERED** | Something on screen shows this today. |
| **LOADED-DARK** | The app fetches and caches it every session and renders none of it. |
| **LOADER-DARK** | A loader module exists in `src/api/` and `App.jsx` never calls it. |
| **STORE-ONLY** | Sits in the data repo with no app loader at all. |
| **COMPUTED-DARK** | The app derives it every session and no component reads it. |

---

## 2. Player-grain families

### 2.1 Sleeper season totals — `nfl/season-totals/<year>.json`

**Coverage 2012–2025** (2025 still `inProgress`). schemaVersion 3, keyed by `sleeper_id`, per-season
`team` on every row. Rows are not uniform: numeric player rows, one `TEAM_<abbr>` whole-team
aggregate per team, `<abbr>` DEF entries, and rare legacy suffixed ids. **Consumers must exclude
`TEAM_*` from any cross-player summation** — the app does this via `teamContext.isTeamAggregateId`;
failing to did once double every team denominator.

Per-row envelope: `stats{}`, `team`, `gamesPlayed`, `gamesStarted`, `byeWeeks`, `dnpWeeks`,
`weeklyPoints[]`, `weeklyStatus[]`, `fantasyPoints`, `scoringBasis`, `availability`.

**Stat keys carried on skill-position rows** [data-checked, 2024 panel, 630 skill rows]. Grouped by
whether anything renders them:

| Group | Keys | Rows carrying a finite value (of 630) | Status |
|---|---|---|---|
| Scoring / rank | `pts_half_ppr` `pts_ppr` `pts_std` `pos_rank_half_ppr` `pos_rank_ppr` `pos_rank_std` `gp` `gs` `gms_active` | 430–630 | RENDERED (points); **`pos_rank_*` unused** |
| Snaps | `off_snp` `tm_off_snp` `st_snp` `tm_st_snp` | 576 / 597 | RENDERED (Outlook snap trend) |
| Receiving volume | `rec` `rec_tgt` `rec_yd` `rec_air_yd` `rec_td` `rec_lng` | 289–526 | RENDERED |
| Receiving rate | `rec_ypr` `rec_ypt` `rec_yar` | 486–498 | partly — `rec_yar` (yards after reception) **unused** |
| **Target-depth buckets** | `rec_0_4` `rec_5_9` `rec_10_19` `rec_20_29` `rec_30_39` `rec_40p` | 125–405 | **UNUSED — this is a real aDOT distribution, not just a mean** |
| Receiving detail | `rec_fd` (first downs) `rec_drop` (drops) `rec_td_lng` `rec_td_40p` `rec_td_50p` | 47–411 | **UNUSED** |
| Rushing | `rush_att` `rush_yd` `rush_td` `rush_ypa` `rush_lng` `rush_fd` | 166–365 | RENDERED (volume) |
| Rushing detail | `rush_yac` (yards after contact) `rush_btkl` (broken tackles) `rush_tkl_loss` `rush_tkl_loss_yd` `rush_40p` | 40–317 | **UNUSED** |
| Passing | `pass_att` `pass_cmp` `pass_yd` `pass_td` `pass_int` `pass_ypa` `pass_ypc` `pass_air_yd` `pass_fd` `pass_sack` `pass_sack_yds` `pass_lng` | 85–135 | RENDERED (Production set) |
| Red zone | `rec_rz_tgt` `rush_rz_att` `pass_rz_att` | 102–394 | feeds projection; **not displayed** |
| Misc | `anytime_tds` `fum` `fum_lost` `penalty` `penalty_yd` `kr*` `pr*` | 89–366 | **UNUSED** |
| Rate traps | `pass_rtg` `cmp_pct` | 122–134 | **must not be used** — these are weekly sums, never season-valid. The app recomputes rates from components instead. |

`TEAM_<abbr>` rows additionally carry team-level keys not present on player rows [data-checked, 32
rows each]: `rz_att` `rz_conv` `rz_pct` `g2g_att` `g2g_conv` `g2g_pct` `down_3_att` `down_3_conv`
`down_3_pct` `down_4_*` `off_yd` `off_yd_per_play` `opp_off_yd` `opp_off_yd_per_play` `fd`
`opp_fd` `opp_pass_fd` `opp_rush_fd` `td` `int` `sack` `qb_hit` `tkl` `ff` `fum_rec`. **All unused
and all directly relevant to a Teams surface** — red-zone conversion and goal-to-go rate in
particular.

**Known coverage cliff:** `off_snp` (the snap-share *numerator*) is **2020+ only** — zero finite
rows 2012–2019 [doc, verified in `signal-registry.md`'s own data check]. The denominator
`tm_off_snp` goes back to 2012, so the limiter is the numerator. **Snap share cannot be shown
before 2020 and any multi-season snap chart must say so.**

---

### 2.2 nflverse per-game stats — `nflverse/gamelogs/<year>.json` · **LOADER-DARK**

**The single largest unexploited family in the system.** Loader `src/api/nflGameLogs.js` exists;
`App.jsx` never imports it [data-checked].

**Coverage 2012–2025, every season, no gap.** Keyed by `sleeper_id` →
`{ gsisId, name, position, games[] }`. Positions QB/RB/WR/TE/FB. 407 players in 2012, 592 in 2018,
607 in 2025 [data-checked].

**Every `games[]` field, identical across all seasons checked (2012 / 2018 / 2025)** [data-checked]:

```
week  seasonType  team  opponent
completions  attempts  passingYards  passingTds  passingInterceptions
sacksSuffered  sackYardsLost  sackFumbles  sackFumblesLost
passingAirYards  passingYardsAfterCatch  passingFirstDowns
passingEpa  passingCpoe  passing2ptConversions  pacr
carries  rushingYards  rushingTds  rushingFumbles  rushingFumblesLost
rushingFirstDowns  rushingEpa  rushing2ptConversions
receptions  targets  receivingYards  receivingTds
receivingFumbles  receivingFumblesLost  receivingAirYards
receivingYardsAfterCatch  receivingFirstDowns  receivingEpa
receiving2ptConversions  racr
targetShare  airYardsShare  wopr
fantasyPoints  fantasyPointsPpr
```

**Non-null rates, 2024 panel, per position-game** [data-checked]:

| Position | passingEpa | rushingEpa | receivingEpa | passingCpoe | targetShare | airYardsShare | racr |
|---|---|---|---|---|---|---|---|
| QB (697 games) | **95%** | 88% | 1% | **95%** | 100% | 100% | 1% |
| RB (1573) | 0% | **86%** | 66% | 0% | 100% | 100% | 65% |
| WR (2558) | 1% | 13% | **86%** | 1% | 100% | 100% | 86% |
| TE (1285) | 0% | 3% | **89%** | 0% | 100% | 100% | 88% |

Read: the phase-relevant EPA is populated for 86–95% of games at every position. `racr` is null
where there are no air yards (behind-LOS work), which is honest, not broken.

**What this unlocks:** a real game log with context; a per-game points distribution; EPA/attempt for
QBs and EPA/target for pass-catchers; CPOE; air-yards share and aDOT at weekly grain; a per-game
usage trajectory rather than the season-level trend the app currently derives.

**Constraint:** view-only, enforced by `gameLogsViewOnly.test.js`. Per-game rate fields are verbatim
and must never be summed — aggregate the components.

---

### 2.3 nflverse advanced receiving — `nflverse/advstats/<year>.json` · **LOADED-DARK**

**Coverage 2012–2025, no gap.** 520 rows in 2025 [data-checked]. Fields: `targetShare`,
`airYardsShare`, `wopr`, `racr`, plus a `components` object (`targets`, `airYards`, `recYards`,
`receptions`, `weeks`) so ratios can be recomputed rather than trusted. Ratios are null on zero
denominators — ~10–25% of rows every year, almost all RBs [doc].

**Loaded every session and rendered nowhere** since `AdvancedStatsPanel.jsx` was deleted in Slice
viii. Recorded as capture-only factors in the projection; a hard invariant plus
`advStatsViewOnly.test.js` forbids it moving `projectedPPG`.

**Design note:** this family is now **largely redundant with §2.2**, which carries the same four
metrics at finer grain with the same coverage. Worth a deliberate decision: keep advstats as the
cheap pre-aggregated season read, or retire it in favour of aggregating gamelogs. Do not show both
and risk them disagreeing.

---

### 2.4 CFBD college stats — `college/{passing,receiving,rushing}/<year>.json`

**Coverage 2017–2025** (store files lag at 2017–2024 until the data repo materialises 2025) [doc].
Pre-2017 exists upstream and is not ingested. Feeds `computeCollegeMetrics` → dominator rating,
breakout age, production trend → the rookie projection path.

**No display consumer.** The Explorer's profile panel was the last one.

**Coverage cliff that matters for design:** any player whose college career predates 2017 has **no
dominator rating**. On a Rookies surface that is irrelevant; on a veteran's profile it means a
"college production" section is empty for everyone drafted before ~2018.

---

### 2.5 nflverse draft picks — `nflverse/draft/draft_picks.json`

**Coverage 2010 → present.** Round, pick, season, draft slot. Matched to Sleeper ids by
name/team/year. Feeds the rookie projection's 10-tier draft-capital multiplier.

The research calls draft capital one of only two defensible pre-NFL inputs (Appendix B §1.3). It is
in the model and **not surfaced anywhere** except as an internal `factors` key.

---

### 2.6 nflverse rosters — `nflverse/roster/<year>.json`

**Coverage 2016–2026.** 2012–2015 exist upstream but fail the `MIN_ROSTER_IDS = 1500` population
gate and are documented-absent [doc]. Team, position, status, full name, keyed by `sleeper_id`.
Used as an active-roster relevance gate, not displayed.

---

### 2.7 KeepTradeCut — `ktc/snapshot-<date>.json` + `src/utils/ktcHistory.js`

**Current value: RENDERED** (Market `KTC` column, `VS MARKET` chip, Portfolio value tiles).
**History: COMPUTED-DARK.**

**Verified snapshot series** [data-checked] — 11 snapshots:

```
2026-05-18  2026-06-01  2026-06-15  2026-06-23  2026-06-29
2026-07-06  2026-07-13  2026-07-20  2026-07-27  2026-08-03  2026-08-10
```

Two early gaps (missed Mondays 2026-05-25 and 06-08, which is what prompted the cron dead-man
detector); **unbroken weekly since 2026-06-23**. Total span ~12 weeks.

`loadKtcHistory` requires `WINDOW_SIZE = 8` snapshots at `MIN_SPACING_DAYS = 5` — **now satisfied**.
The `inProgress` contract bug that null'd this whole family is fixed app-side
(`ktcHistory.js` passes `allowInProgress: true`) [data-checked].

`computeKtcSignals(series)` returns, per player, all currently unrendered:

```
ktcHistDelta  ktcHistDeltaPct
ktcHistVolatility  ktcHistVolatilityPct
ktcHistTrajectorySlope  ktcHistTrajectoryNormalized  ktcHistTrajectoryLabel
ktcHistRankVsMedianTrend  ktcHistRankVsMedianLabel  ktcHistValueVsPosMedian
ktcHistSampleSize  ktcHistWindowSpanDays
ktcHistConfidence   // 'high' ≥7 snapshots · 'medium' ≥4 · 'low' · 'none'
```

`ktcHistConfidence` is worth noting: the data layer **already models its own confidence** in exactly
the way §6.2 of the brief asks the UI to. That vocabulary should be reused, not reinvented.

**Note:** `computeKtcRecentDelta` — the ≈30-day delta function — was **deleted** in Slice viii along
with its only consumer. Reinstating the 30D column means restoring a small function, not building a
capability.

**No pre-history exists or can be backfilled.** KTC exposes no historical API. Everything before
2026-05-18 is permanently unavailable.

---

### 2.8 Sleeper players-state — `nfl/players-state/<date>.json` · **STORE-ONLY**

**No app loader exists.** Weekly server-side capture of `/v1/players/nfl`.

**Coverage: 4 captures** — 2026-07-18, 07-25, 08-01, 08-08 [data-checked]. 1,039 players in the
latest. Per player:

```
name  team  position  fantasyPositions[]
status  injuryStatus  injuryBodyPart  injuryStartDate  injuryNotes
practiceParticipation  practiceDescription
depthChartPosition  depthChartOrder  active
teamChangedAt  newsUpdated  searchRank
```

**This is the only path to a role/injury timeline that will ever exist.** Sleeper serves current
state only; every uncaptured week is permanently lost. `injuryStatus`, `practiceParticipation` and
`depthChartOrder` over time are captured nowhere else — not even in the app's own projection
snapshots, which record `status` only.

**Design consequence:** the Changes surface and the availability timeline are real capabilities with
a **four-week** history today, growing one week at a time. Design them to look correct thin.

---

## 3. Team-grain families

### 3.1 nflverse team context — `nflverse/teamcontext/<year>.json` · **LOADER-DARK**

The first team-keyed family. `src/api/teamContext.js` exists; `App.jsx` never imports it
[data-checked]. Join to players via `src/utils/playerTeam.js` (`resolvePlayerTeam`), which returns
era-accurate codes.

**Coverage 2012–2025, all 32 teams, 17 games each** [data-checked, 2025]. Grain: team-week; row
identity `(team, week)`, weeks continuous REG→POST. A bye is an absent row, never a placeholder.

**Every field, offence and defence** [data-checked]:

| Offence | Defence (faced) |
|---|---|
| `plays` `passPlays` `rushPlays` `passRate` | `plays` `passPlays` `rushPlays` |
| `epaSum` `epaPlays` `epaPerPlay` | `epaSum` `epaPlays` `epaPerPlay` |
| `passEpaSum` `passEpaPlays` `passEpaPerPlay` | `passEpaSum` `passEpaPlays` `passEpaPerPlay` |
| `rushEpaSum` `rushEpaPlays` `rushEpaPerPlay` | `rushEpaSum` `rushEpaPlays` `rushEpaPerPlay` |
| `successes` `successPlays` `successRate` | `successes` `successPlays` `successRate` |
| `proePlays` `proePassPlays` `proeXpassSum` **`proe`** | — |
| `rzTrips` `rzPlays` `rzPassPlays` `rzRushPlays` `rzPassRate` `rzTdTrips` `rzFgTrips` | `rzTripsAllowed` `rzTdTripsAllowed` |
| `neutralSeconds` `neutralGaps` **`neutralSecPerPlay`** (pace) | — |
| `pointsScored` | `pointsAllowed` |

Plus per game: `week`, `seasonType`, `gameId`, `opponent`.

**Every rate is stored alongside its components**, deliberately, so season figures are recomputed
from summed components and never averaged from weekly rates. A design that shows a season PROE must
respect this.

**What this unlocks:** the entire Teams surface, the Environment section of the pop-up, team-context
filters in Market, and — because the defensive side is the *faced* mirror — a genuine
pass-funnel/run-funnel read.

**Era-remap note for anyone joining by team code:** this pack is remapped to era-accurate codes
(`LA→STL` ≤2015, `LAC→SD` ≤2016, `LV→OAK` ≤2019). The gamelogs family deliberately does the
opposite and keeps current-franchise codes. `playerTeam.resolvePlayerTeam` is the single reconciler.

---

### 3.2 nflverse schedules — `nflverse/schedule/<year>.json` · **LOADER-DARK**

**Coverage 1999–2026.** 285 games in 2025 [data-checked]. Per game:

```
gameId  season  week  gameType  homeTeam  awayTeam  homeScore  awayScore  result
spreadLine  totalLine  roof  surface  temp  wind
```

`loadNflSchedule` was called only by the Explorer's game log and now runs for nobody
[data-checked].

**Correct use:** context on a game log — who, where, what the game was expected to be, what the
weather was. **Incorrect use:** a season-long strength-of-schedule signal. Vegas lines and opponent
quality are one-week predictors; the repo's own research position is that they do not belong in a
multi-year projection, and there is a `scheduleViewOnly.test.js` guarding the code path.

---

### 3.3 nflverse OL composition — `nflverse/oline/<year>.json` · **STORE-ONLY**

**Coverage: 2026 only** [data-checked — one file, 21 weekly states per team]. Team-keyed,
`teams[abbr].states[]`, each `{ week: "2026-W12", date, dt, ol: [{ slot, rank, name, gsisId,
espnId }] }` across LT/LG/C/RG/RT. Pre-2025 exists upstream in an incompatible legacy schema and is
deliberately unparsed.

OL continuity is the third of the research's three instability axes. **With one season there is no
trend to show.** Reserve the slot in the design; do not build the surface.

---

### 3.4 Enrichment overlay — `enrichment/*.json` · **LOADED-DARK**

Hand-authored, the one non-script family. Loaded every session by `App.jsx`; nothing renders it
since `AvailabilityHistory.jsx` was deleted.

**Verified entry counts** [data-checked]:

| File | Entries | Shape |
|---|---|---|
| `coaching.json` | **95** | `{ id, year, team, role: HC/OC/DC, name }` — 32 HC + 32 OC + 31 DC across 32 teams, **all year 2026** (one DC missing) |
| `scheme.json` | **0** | empty scaffold |
| `injuries.json` | **0** | empty scaffold |
| `notes.json` | **0** | empty scaffold |

**The gap that matters:** 95 coaching entries at one year is a *roster*, not a *history*. Detecting
"new OC" — the research's second-biggest disruptor — needs at least two seasons. This is the
cheapest high-value acquisition in the whole package (Appendix C rank 4).

---

## 4. Computed in the app, rendered nowhere

### 4.1 `dynastyScore` — components and signals

`components` (RENDERED, in the pop-up's drivers panel) [data-checked, `dynastyScore.js:1023`]:

| Component | Weight | Extra fields carried |
|---|---|---|
| `ageAdjusted` | 0.28 | — |
| `trajectory` | 0.25 | `slope` |
| `currentLevel` | 0.22 | `percentile` |
| `opportunityQuality` | 0.15 | `efficiencyPercentile`, `volumePercentile`, `shareScore` |
| `reliability` | 0.10 | `consistencyScore`, `durabilityScore` |

*Known reconciliation trap:* the composite uses `effectiveReliability` (×0.90 when `isTdReliant`),
not the `reliability.value` the object exposes — so `value × weight` does not sum to the score for
TD-reliant players. Any design that shows a "these add up to the score" bar chart must handle this.

`signals` — **partly rendered** (the badge rail and the `HORIZON` pill read a few); most are dark
[data-checked, `dynastyScore.js:1033`]:

```
isBreakout  isBounceBack  isProspect  draftCapital  seasonsOfData
ageCurveFactor  peakSeason  peakAge  yearsFromPeak  isLateCareer
injurySeasonCount  durabilityScore  consistencyScore
tdDependency  isTdReliant
momentum  momentumLabel
ktcInfluenced
carryShare  targetShare  teamOffenseRank
depthOrder  depthMultiplier
shareTrendLabel  shareVolatility  currentShare  shareHistory (last 5)
```

`shareHistory` in particular is a five-season usage series sitting on every row, unrendered.

### 4.2 `seasonProjection` — the 73-key `factors` contract

The complete working of the projection, contract-enforced by `factorsSchema.test.js` (73 vet keys /
51 rookie). A few reach the pop-up as adjustment chips; the rest are invisible. Full key list
[data-checked]:

```
basePPG  pipelinePPG  ageDelta  momentumFactor  momentumLabel
trajectoryFactor  trajectoryNormalized  regressionFactor  regressionFactorRaw
consistencyScore  consistencyBand  consistencyScale
breakoutFactor  isBreakout  bounceBackFactor  isBounceBack
tdDependency  isTdReliant  tdRelianceFactor
efficiencyFactor  efficiencyIndex  efficiencyMetrics  completionPct  passerRating
snapShare  snapShareFactor
rzUsageRate  rzUsageCategory  rzUsageFactor
teamRzShare  teamRzShareCategory  teamRzShareFactor
shareTrend  shareTrendRaw  shareVolatilityLabel  shareVolatilityScale
teamFactor  qbQualityFactor  qbQualityScore
depthFactor  depthStale  isTeamChange  newTeam  prevTeam
durabilityFactor  injurySeasons  absenceShape  absenceShapeFactor
combinedNewFactor  combinedNewFactorRaw
compPPG  compCount  compBlendWeight  compConfidence  compAvgSimilarity
adot  adotDelta  adotSampleSize  positionMultiplicityRatio
ktcPct  ktcMult  ktcHist* (12 keys — see §2.7)
collegeBase  collegeContribution  collegeMult  finalYearDominator
productionTrend  productionTrendAdjust  finalYearAdjust  breakoutAge  breakoutAgeFactor
nflDraftPick  nflDraftRound  nflDraftTier  nflDraftMultiplier  nflDraftMatchSource
rookieAgeAtDraft  rookieMultiplierProduct
primaryCategory  primaryCategoryPoints  secondaryCategoryPoints
```

**Capture-only keys must not be presented as drivers:** `ktcHist*`, `positionMultiplicity*`, `adot*`
(all paths) and the rookie `breakoutAgeFactor` are diagnostic — they are recorded and provably do
not move `projectedPPG`. A "show the full working" panel must visually separate *what moved the
number* from *what was merely observed*, or it misrepresents the model.

### 4.3 Orphaned computations — **COMPUTED-DARK**

Still derived every session, no renderer since Slice viii deleted their only consumer:

| Computation | Shape | Natural home |
|---|---|---|
| `depthChart` (`buildTeamDepthChart`) | `{ QB[], RB[], WR[], TE[] }`, each entry `{ player_id, full_name, age, depthOrder, dynastyLabel, dynastyScore, dynastyConf, ktcValue, currentSeasonPPG }` | Teams surface; pop-up Environment section |
| `shareHistory` / `usageShare` (`usePlayerProfile`) | per-season share series | pop-up Usage section |
| `roleRank` (`computeRoleRanks`, in the pipeline) | positional role rank | Market column / pop-up role badge |
| `computeConsistency` full object | pooled mean, population SD, CV, self-relative boom-bust, last 3 qualifying seasons | pop-up Distribution section — currently only the `sd` scalar is shown |
| `computeCeilingFloor` / `buildSeasonPositionRanks` | best/worst single-season positional finish + per-rank points reference | RENDERED in Market; the *points reference* half is not |

---

## 5. Coverage matrix — the honesty table

Single reference for the encoding asked for in brief §6.2. Sorted by how much history exists.

| Signal | First season / date | Notes |
|---|---|---|
| NFL schedule + lines | **1999** | deepest thing in the system |
| Draft capital | **2010** | permanent historical record |
| Fantasy scoring, per-season team | **2012** | canonical outcome store |
| Receiving/rushing/passing volume + air yards | **2012** | |
| Per-game EPA / CPOE / RACR / shares | **2012** | 86–95% non-null at the relevant position |
| Team context (PROE, pace, EPA, RZ, defence-faced) | **2012** | |
| Red-zone usage | **2012** | thin in 2012, full 2013+ |
| nflverse roster (team/status) | **2016** | 2012–2015 documented-absent |
| College production | **2017** | pre-2017 not ingested |
| **Snap share** | **2020** | numerator structurally absent before |
| **KTC value history** | **2026-05-18** | ~12 weeks, weekly since 06-23, no backfill possible ever |
| **Weekly player state** | **2026-07-18** | 4 captures, no backfill possible ever |
| **OL composition** | **2026** | one season, no trend yet |
| Coaching | **2026** | 95 entries, one year — no change detection |
| Scheme / injuries / notes | — | **empty** |

---

## 6. Placement map — data to surface

Condensed answer to "where should each thing go", cross-referencing brief §5.

| Data | Status today | Proposed home |
|---|---|---|
| Per-game stats + EPA/CPOE (§2.2) | LOADER-DARK | Pop-up **Game log** + **Distribution** + **Usage & efficiency**; Market **EFFICIENCY** set |
| Team context (§3.1) | LOADER-DARK | **Teams surface**; pop-up **Environment**; Market filter group |
| Schedule (§3.2) | LOADER-DARK | Game-log row context only |
| Advstats (§2.3) | LOADED-DARK | Consolidate with §2.2 or retire |
| KTC history (§2.7) | COMPUTED-DARK | **TREND** everywhere; Portfolio value-over-time; Changes movers |
| Players-state (§2.8) | STORE-ONLY | **Changes** surface; pop-up **Availability & role** timeline |
| Coaching (§3.4) | LOADED-DARK | Teams surface; pop-up Environment — **needs a 2nd season first** |
| College (§2.4) | dark on display | **Rookies** surface |
| Draft capital (§2.5) | model-only | Rookies surface; pop-up identity meta |
| `depthChart` (§4.3) | COMPUTED-DARK | Teams surface; pop-up Environment |
| `shareHistory` (§4.1/§4.3) | COMPUTED-DARK | Pop-up Usage trajectory |
| 73 `factors` keys (§4.2) | model-only | Pop-up **"why next season" → full working** |
| Unused season-total keys (§2.1) | ingested, unused | Market EFFICIENCY set; pop-up Usage (target-depth buckets, drops, broken tackles, YAC) |
| `TEAM_*` team stat keys (§2.1) | ingested, unused | Teams surface (RZ conversion, goal-to-go, 3rd/4th down, yards per play) |
| Projection snapshots + grading | banked in data repo | **Model track record** surface (phase 3) |
| OL composition (§3.3) | STORE-ONLY | Reserve; revisit 2027 |
