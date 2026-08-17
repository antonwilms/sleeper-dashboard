# Appendix C — What is missing, and what it costs

Ranked by **value ÷ cost**, not by value alone. Each entry states what is missing, what it unlocks,
what it would take, and a verdict.

Read alongside [`01-data-inventory.md`](01-data-inventory.md), which covers the opposite case —
things that already exist and are simply not rendered. **Most of what this app needs is in that
file, not this one.** The ranked list below is short on purpose.

**Verdict vocabulary:** `DO` — clear win, low cost · `DO NEXT` — clear win, real cost ·
`INVESTIGATE` — value clear, feasibility not · `PARK` — real but not now ·
`DO NOT` — actively decided against.

---

> **Two verdicts below were revised on 2026-08-17** after the independent Cowork pass settled their
> feasibility ([`04-reconciliation.md`](04-reconciliation.md) §4): **traded picks move to rank 1**
> (KTC pick values turn out to be already ingested, so only ownership has to be reconstructed), and
> **routes run / YPRR moves from `INVESTIGATE` to `DO NOT`** (there is no free source, and the free
> approximation is a different statistic). Both entries are marked in place.

## Rank 1 — Per-manager positional strength · **DO** · derivation only, zero ingest

*(Co-ranked 1 with traded picks below — they are the two halves of the same unlock, and the League
map needs both.)*

**Missing:** a per-manager, per-position measure of surplus/deficit above replacement, and the
league-wide value distribution to normalise it against.

**Unlocks:** the League map's supply-and-need matrix, the "who would want this asset" list, and
any future trade-fit logic. It is the only thing standing between the app and a genuinely new
surface (brief §5.8).

**Cost:** **none in data terms.** Every input is already on `playerRowsWithProj` — each row carries
`ownerTeamName`, `position`, `dynastyScore.score` and `ktcValue`, for every rostered player in the
league. "Above replacement" needs one decision (replacement = the Nth-best startable player at that
position across the league, given league settings) and one memo.

**Note the correction:** the previous design handoff closed by listing this as data that *"does not
exist in the current app"*, alongside inbound trade offers, and concluded that `2b`'s matrix
therefore depended on new ingest. That was wrong for this half. It is a derivation.

---

## Rank 1 (revised, was 2) — Traded / future rookie draft picks · **DO** · one Sleeper endpoint

> **Promoted to rank 1.** The Cowork pass established that this is cheaper than assessed here and
> that its absence is a *correctness* problem, not a gap: **KTC pick values are already ingested**
> (36 rows per snapshot — see Appendix A §2.7), the endpoint shape is confirmed
> (`{ season, round, roster_id, previous_owner_id, owner_id }`, where `roster_id` is the *original*
> owner and only traded picks are returned, so untraded ones are implicit), and the plumbing
> precedent exists — `src/api/sleeper.js` already exports `getLeagueDrafts` and `getDraftPicks` for
> the league-scoped draft fetch. Estimated at one unauthenticated `GET` plus ~40 lines of
> reconstruction: seed every roster with its own pick per round per season, then overlay each
> `traded_picks` row.

**Missing:** any representation of draft picks as assets. The app never loads Sleeper's traded-picks
data, so a roster's future 1sts and 2nds — often a large fraction of a rebuilding team's value —
simply do not exist in the model.

**Unlocks:**
- Portfolio's "· N rookie picks" subline, which was cut for exactly this gap.
- **Correct roster value and concentration.** Both tiles currently measure only the player half of
  a portfolio, which understates rebuilding teams and overstates contenders. This is not a missing
  nicety; it is a systematic bias in two headline numbers.
- The League map's `PICKS` column.
- KTC already values rookie picks (they appear in snapshots with a null position), so the valuation
  side is solved the moment the pick inventory exists.

**Cost:** one endpoint (`/v1/league/<id>/traded_picks`, plus the league's own draft order),
a `rosterTeams`-shaped derivation to turn "traded away / acquired" into "who holds which pick", and
a matching rule against KTC's pick naming. **Verify the endpoint shape before planning** — this
package did not test it live.

**Caveat worth designing around:** pick value depends on projected draft slot, which depends on the
holder's record. Early-round-pick-of-a-bad-team is worth much more than the same nominal pick from
a contender. A v1 that treats "2027 1st" as one value is a defensible simplification but should be
labelled as one.

---

## Rank 3 — A players-state app loader · **DO** · the data is already banked

**Missing:** not the data — the loader. `nfl/players-state/<date>.json` is captured weekly in the
data repo and **no app module reads it** (Appendix A §2.8).

**Unlocks:** the Changes surface (role changes, injury-designation changes, practice participation,
team changes) and the pop-up's availability/role timeline. This is the app's only possible source
for any of it: Sleeper serves current state only, so the banked captures are the entire historical
record and always will be.

**Cost:** one loader in `src/api/` following the established `dataStore.js` pattern, plus a diffing
derivation (compare consecutive captures, emit changes). The family is date-keyed rather than
season-keyed, which is a new enumeration pattern for the app — the closest precedent is
`ktcHistory.js`'s manifest scan, which can be followed.

**Constraint:** 4 captures exist (2026-07-18 → 08-08). Real depth arrives one week per week.

---

## Rank 4 — Coaching history, ≥2 seasons · **DO** · ~1 hour of hand-authoring

**Missing:** `enrichment/coaching.json` has 95 entries, **all for 2026** — a snapshot, not a
history. `scheme.json`, `injuries.json` and `notes.json` are empty scaffolds.

**Unlocks:** a **coaching-change flag** — the research's second-biggest disruptor of multi-year
outlook (Appendix B §1.4) and one of the two gaps the app's own research evaluation ranks highest.
A single additional season (2025 HC/OC/DC per team = 96 entries) makes year-over-year change
detectable. Three seasons makes it a trend.

**Cost:** the CLI already exists (`bin/enrich.mjs coaching add --year --team --role --name`) with
validation. 32 teams × 3 roles × N seasons of typing, or a scrape. The repo's own audit notes the
manual path *"demonstrably doesn't fill"* these files — so the honest framing is that this is cheap
per-entry and has repeatedly not happened, which is an argument for scripting it rather than
resolving to try harder.

**Note:** a coaching *change* flag is a display signal here, not a projection input. Wiring it into
`projectedPPG` requires contemporaneous capture and joint-model grading, per the repo's standing
discipline.

---

## Rank 5 — Expected fantasy points (xFP) · **DO NEXT** · a modelling project

**Missing:** a historical value-per-opportunity model — the average fantasy value of a target at a
given air-yards depth and field position, and of a carry at a given yard line.

**Unlocks:** the cleanest possible "opportunity vs outcome" comparison, and with it the honest
version of a regression signal: *this player scored 14 TDs on 9 red-zone targets* becomes visible
as a gap rather than asserted as a verdict. It is the analytics-industry standard for this job
(Fantasy Points, Sharp Football, ESPN, Establish The Run all publish it) and it fits this app's
thesis exactly — it compares two measured quantities rather than predicting one.

**Cost:** real. Needs per-play or at minimum per-target depth data to fit the buckets. The app has
target-depth buckets at season grain (`rec_0_4` … `rec_40p`), air yards per game, and red-zone
targets/carries — enough for a **coarse** bucketed model, not a play-level one. The data repo
already ingests play-by-play for the team-context pack (derive-and-discard), so a per-play fit is
reachable without new sourcing.

**Verdict:** not phase 1 — it is a model, and the repo's discipline routes new models through the
grading harness. But it is the highest-value *derived* metric the app is missing.

---

## Rank 6 — Routes run → YPRR · **DO NOT** · settled: no free source exists

> **Revised from `INVESTIGATE` to `DO NOT`.** This entry said it was worth "one afternoon of
> feasibility work" and would "jump to rank 2" if nflverse had it. The Cowork pass did that
> afternoon. It does not:
> - **PFF sells routes run**; PlayerProfiler licenses it (their glossary carries Route
>   Participation, Target Rate = targets/routes, Route Separation, Slot Rate). No free feed.
> - **nflverse FTN charting** (2022+, CC-BY-SA) is play-level and carries **no player identifiers** —
>   29 columns of play context. Useless as a per-player denominator.
> - **nflverse participation data** (2023+, post-season only, no in-season refresh) *does* carry
>   `offense_players` as gsis IDs per play and *would* join via the existing crosswalk — but
>   counting pass plays a player was on the field for yields **pass snaps, not routes**. It cannot
>   distinguish a route from pass protection or a chip release.
>
> **The honest derivable metric is yards per pass snap, 2023+, refreshed once a year.** That is a
> weaker and different statistic from the r≈0.55 one the research rates, and shipping it labelled
> "YPRR" would be a fabrication. The substitute that needs no new source: **`receivingEpa` per
> target from gamelogs, 100% coverage back to 2012.**

**Missing:** a routes-run denominator. Without it, receiving efficiency uses yards per target /
yards per reception, which are not the same thing.

**Unlocks:** YPRR (YoY r ≈ 0.51–0.60; **expected** YPRR is stickier still at 0.67) and target rate
(targets per route run), which is how PlayerProfiler and PFF separate "gets targets because he's
on the field a lot" from "earns targets".

**Cost:** unknown, and that is the point of the rank. PFF gates routes run commercially. Whether
nflverse exposes a usable routes-run column at player-season grain, joinable via the existing
`gsis_id ↔ sleeper_id` crosswalk, is a **data-repo sourcing question this package did not answer**.
The repo's own evaluation flags `nflfastr` as the lead to check.

**Verdict:** worth one afternoon of feasibility work before it is ranked properly. If nflverse has
it, this jumps to rank 2.

---

## Rank 7 — Structured injury history · **PARK**

**Missing:** `enrichment/injuries.json` is empty. The app infers injury seasons from
game-availability shape (`classifyInjurySeason`), which is a decent proxy and correctly
distinguishes "hurt" from "benched" using absence shape.

**Unlocks:** injury *type* and body part, which is what actually determines recurrence risk — a
soft-tissue hamstring history is a different asset than one ACL at 22.

**Cost:** hand-authoring at a scale that has already been tried and abandoned. The weekly
players-state capture (rank 3) now records `injuryBodyPart`, `injuryStartDate` and
`practiceParticipation` **going forward**, which fills this gap prospectively without hand-work.

**Verdict:** park the retrospective backfill; let rank 3 accumulate it forward.

---

## Rank 8 — Rookie ADP / dynasty startup ADP · **PARK**

**Missing:** any market price for incoming rookies beyond KTC's own pick values, and any startup
ADP to anchor "what is this player worth in a vacuum".

**Unlocks:** a market column on the Rookies surface; a second market opinion to diverge from
(currently KTC is the only market the app knows).

**Cost:** a new source (Sleeper exposes league draft data, not consensus ADP; FantasyPros and
Underdog publish ADP with varying access terms).

**Verdict:** only relevant once the Rookies surface exists.

---

## Rank 9 — OL composition history, pre-2026 · **PARK**

**Missing:** `nflverse/oline` has **2026 only**. Pre-2025 exists upstream in an incompatible legacy
schema and is deliberately unparsed.

**Unlocks:** the third instability axis (OL change), completing the QB-change / OC-change /
OL-change triad the research names.

**Cost:** a parser for the legacy schema, which the data repo consciously declined to write.

**Verdict:** reconstructable at any time, so no clock is running. Revisit when there are ≥2 seasons
in the current schema and the instability flag is actually being built.

---

## Rank 10 — College stats pre-2017 · **PARK**

**Missing:** CFBD coverage starts 2017. Any player whose college career predates it has no
dominator rating.

**Unlocks:** a college-production section that is not empty for every veteran. Irrelevant for the
Rookies surface, which only ever looks at recent classes.

**Cost:** backfillable via the CFBD API with an existing subcommand — bounded, mechanical.

**Verdict:** low value for a dynasty tool whose decisions are about the future. Park.

---

## Rank 11 — Inbound trade offers · **DO NOT** (blocked, not declined)

**Missing:** pending trade offers made to you.

**Would unlock:** `2a`'s `HOLD` decision card, the one archetype that genuinely requires it.

**Cost:** **Settled — unavailable.** The Cowork pass read the complete official API reference. The
entire documented surface is: user · avatars · leagues (league, rosters, users, matchups, brackets,
transactions, traded_picks, state) · drafts · players. It is read-only, unauthenticated, and
documents itself as containing "only league information". `/transactions/<round>` carries
`status: "complete"` — completed events. A pending offer is private to two managers and has no
public resource. Not "unless someone demonstrates otherwise" — checked.

**Verdict:** design around its absence. This is one of three independent reasons `2a` is deferred
(brief §5.9).

---

## Rank 12 — Snap counts before 2020 · **DO NOT** (structurally impossible)

`off_snp` — the snap-share numerator — has **zero finite rows 2012–2019**. The denominator goes
back to 2012, so the limiter is the numerator and no amount of re-ingest fixes it. Any snap-share
chart must simply start in 2020 and say so.

---

## Rank 13 — Combine / athleticism data · **DO NOT** (decided against on the merits)

RAS, speed score, three-cone, vertical, agility composites.

The research is unusually unanimous: individual combine drills explain **<2%** of career outcome
variance; ML on combine data predicts NFL matriculation at 83% and career success not at all. The
app ingests **none** of it, which is a deliberate and correct choice that puts it ahead of most
competitors.

**Recorded here so nobody adds it later thinking it was an oversight.** The only position-specific
exceptions in the literature (RB 40-time and three-cone; WR vertical and height) are weak enough
that surfacing them would imply more than the evidence supports.

---

## Rank 14 — Anything requiring a backend · **DO NOT** (architectural)

Accounts, push notifications, cross-device sync, server-side real-time news ingest, and a live
"reach out when something changes" channel.

The repo's product doc includes several of these in its *ideal* framework, correctly noting they
need infrastructure the app lacks. The app is a static SPA over a CDN data repo with IndexedDB
caching, and `localStorage` is the entire persistence layer. Every surface in this brief is designed
to work inside that constraint.

**Worth stating explicitly for the designer:** "notify me when X" is not designable here. The
closest honest equivalent is the Changes surface (brief §5.6) — a diff you *pull* when you visit,
not a signal that *pushes* to you.

---

## Summary table

Revised 2026-08-17.

| # | Gap | Verdict | Cost | Unlocks |
|---|---|---|---|---|
| 1 | Traded / future rookie picks | **DO** | one endpoint + ~40 lines; values already ingested | **Correct** roster value and concentration; picks as assets; the map's PICKS column |
| 1= | Per-manager positional strength | **DO** | derivation only | League map, trade fit |
| 2 | *Wiring the three uncalled loaders* (gamelogs, teamcontext, schedule) — **not a gap; listed because it is rank 1 by value and costs nothing to acquire** | **DO** | a call site each | The whole thesis |
| 3 | Players-state app loader | **DO** | one loader + diff | Changes surface; role/injury timeline |
| 4 | KTC 30-day delta | **DO** | un-delete one function (`3f55245^`, `ktcHistory.js:338`) | Trend everywhere |
| 5 | Coaching history ≥2 seasons | **DO** | ~1h authoring or a scrape | Coaching-change flag |
| 6 | Expected fantasy points | **DO NEXT** | a fitted model | Opportunity vs outcome |
| 7 | Structured injury history | **PARK** | accrues via #3 | Injury type / recurrence |
| 8 | Rookie / startup ADP | **PARK** | new source | Second market opinion |
| 9 | OL history pre-2026 | **PARK** | legacy parser | OL-change instability |
| 10 | College pre-2017 | **PARK** | mechanical backfill | Veteran college sections |
| 11 | Routes run → YPRR | **DO NOT** | no free source; the approximation is a different statistic | — (use `receivingEpa`/target instead) |
| 12 | Inbound trade offers | **DO NOT** | no public resource in Sleeper's API | `2a` HOLD card |
| 13 | Snap counts pre-2020 | **DO NOT** | impossible | — |
| 14 | Combine / athleticism | **DO NOT** | decided on merits | — |
| 15 | Anything needing a backend | **DO NOT** | architectural | — |
