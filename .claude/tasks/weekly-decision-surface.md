# Weekly Decision Surface — parent

Route `/week`, "This week": a view-only weekly start/sit surface for the user's own rostered
players. Source design: `future_plans/weekly_decision_design.zip` → `Weekly Decision Surface.dc.html`
(artboards 9a week 2, 9b week 9, 9c week 1 next season). Handoff brief: the chat brief dated
2026-09-20 ("Weekly Decision Surface — Claude Code handoff brief").

**This file is the index and the shared context. It is not a Session 2 task file** — the three
slice files below are. Read this one first, then only the slice being implemented.

---

## §0 Provenance gap — read before trusting the k values

The brief cites a companion, `claude/weekly-decision-surface-pre-design.md` (the 2012–2025
stability study behind every `k`). **That file does not exist in either repo or anywhere under
`~/Claude Projects/` — verified 2026-09-20.** The `k` values below are therefore carried on the
brief's authority alone; no in-repo artifact reproduces the measurement.

This matters because W0 changes a shipped number on the strength of it. Where the code today says
the 6-game weight is "a judgment call, not a backtested one", the replacement copy must not
overclaim in the other direction: say the value comes from a measured year-over-year stability
study, and do **not** cite an r-value, a season range, or a sample size that no in-repo document
supports. The design's own footnote quotes r .62 / .45 for pace and PROE — that copy belongs to
panel 4 (W2) and is reproduced there as the *design's* claim, not as a repo-verified one.

---

## §1 Data verification — done 2026-09-20, do not re-litigate

All three of the brief's corrections were checked against live sources before planning. Session 2
does not need to repeat these; they are recorded so a reviewer can see what was and was not
verified.

**1. `off_snp` is live, weekly, and sound — the SNAP column is built, not dark.**
Against `https://api.sleeper.com/stats/nfl/2026/1?season_type=regular`:
- 380 QB/RB/WR/TE rows carry both `off_snp` and `tm_off_snp`.
- No row has `off_snp / tm_off_snp > 1.0`.
- `tm_off_snp` is identical across every player on a given team — 0 teams disagree.
- Every-down QBs read exactly 1.00 (Stroud 79/79, Goff 77/77, Mahomes 69/69, Jackson 68/68).
  Stafford's 51/61 = 0.84 is a genuine partial game, not a data defect.

**Null semantics, discovered in the same pass and load-bearing for W1 §3:** Sleeper omits a zero
rather than storing it. 36 week-1 skill rows have `gp === 1` and `tm_off_snp` present but **no**
`off_snp` key — these are special-teamers (they carry `st_snp`) who took zero offensive snaps. That
is a real **0%**, not a missing observation. A further 235 rows have neither key and no `gp` — those
are genuinely absent. See W1 §3 for the exact rule; getting this wrong renders `—` where the truth
is `0%`, which is the opposite reading for a start/sit decision.

**2. Usage denominators come from Sleeper's `TEAM_*` rows, and the join needs no era remap.**
`TEAM_CHI` week 1 → `pass_att` 29, `rush_att` 39; 32 `TEAM_*` rows per week. Critically, on the
**live API** a player row's `team` is the Sleeper domain (`421` → `LAR`) and the aggregate row is
keyed `TEAM_LAR` — same domain, direct join. The *stored* `nfl/season-totals/2026.json` re-keys
player `team` to the era-accurate domain (`421` → `LA`), so the same join against the store **would**
need `denormalizeTeamForSchedule`. Reading live avoids the CR-16 hop entirely. This is a reason to
read live, not merely a convenience — record it in the module header.

**3. `nflverse/teamcontext/2026.json` does not exist.** The data store holds teamcontext 2021–2025
only, and the manifest has no 2026 entry. Panel 4 ships an empty state (W2 §4).

**4. Two shapes the brief did not mention, both of which change the plan:**
- `normalizeStatsResponse` in `src/api/sleeperStats.js:14` reduces every row to `{ player_id: stats }`
  and **discards `team`, `opponent`, `game_id` and `player`**. The upcoming week's opponent is
  therefore not reachable through `getWeeklyStats`/`getWeeklyProjections` as they stand. W1 adds one
  meta-preserving fetch rather than widening the existing shape — widening it would corrupt
  `getSeasonTotals`, whose `Object.entries(stats)` sum loop would start summing non-stat keys.
- The **projections** payload carries `team` and `opponent` per row (`421` week 3 → `LAR` vs `DEN`)
  *and* full stat components (`pass_yd`, `rush_att`, `rec`, …), not just `pts_half_ppr`. So the
  upcoming opponent comes free with the PROJ fetch — no `nflSchedule` join, no era remap — and PROJ
  can be scored in **this league's** settings via `calculateFantasyPoints`, honouring the
  "Fantasy points computed weekly" invariant rather than shipping Sleeper's half-PPR number.
  A team on bye simply has no row for that week; that is the bye signal.

**5. The current week's league matchup opponent has no source in `leagueData`.** `weeklyScores` is
built from completed weeks only (`App.jsx:790-805`) and neither `rosterTeams` nor `standings` carries
a schedule. Artboard 9a's header reads "Colts_420_Reloaded vs Gridiron_Gang"; **v1 drops the `vs
{opponent}` clause** rather than adding a Sleeper matchups fetch for a line of chrome (Anton,
2026-09-21). The header keeps week, season, league format. Revisit as its own change if wanted.

**Live state at planning time:** `nflState` = season 2026, week 2, `season_type` regular. Artboard
9a is literally today.

---

## §2 Decisions taken, with the reasoning

**k = 3 applies app-wide, not just to `/week`** *(Anton, 2026-09-20)*. `opponentStrength.js` today
blends points-allowed at `PRIOR_WEIGHT_GAMES = 6` and that blend is rendered on `/teams` and on My
Team's schedule-strength ladder. Shipping the brief's `k = 3` on `/week` alone would show two
different blended figures for the same defence on two screens with no visible reason. The existing
6 is self-documented in code as "a judgment call, not a backtested one"; the 3 has a measurement
behind it (§0 caveats that measurement's provenance). This is W0, and it is deliberately a separate
slice: it changes shipped numbers and is independently revertable.

**`/week` joins the MANAGE rail; `DEFAULT_ROUTE` is unchanged** *(Anton, 2026-09-20)*. **First** entry
in `PRIMARY_NAV` and first in the MANAGE group — ahead of My Team, because it is the surface to open
weekly during the season. Four items, within `BottomTabBar`'s cap of 5. `/market` stays the landing
surface (settled dp-v2 §2.2). *(An earlier draft of this file said "fourth"; W1 §7 is authoritative
and says first.)*

**"Prior dropped at week 10" is implemented as games played, not as a week number.** `buildFpaTable`
has no week parameter and no caller outside `/week` has a week to give it, so threading one would
re-create the divergence the k=3 decision exists to close. The drop fires on the defence's own
`gCur`, which is the axis the row already carries. Constant `FPA_PRIOR_DROP_GAMES = 9`: a team
entering week 10 has played 8 or 9 games depending on its bye, and 9 is chosen so the prior survives
until a defence genuinely has nine games behind it. **This is a deviation from the brief's literal
wording** and is called out again in W0 §2 for the reviewer.

**PROJ is Sleeper's weekly projection, scored in league settings.** Not the app's own projection
pipeline — that engine is a dynasty/season model walled off from live-season data, and wiring it in
here would breach the wall in the wrong direction. Scoring Sleeper's projected *components* through
`calculateFantasyPoints` is not a breach: it is the same league-scoring dot product the app applies
to every other weekly stat line.

---

## §3 Blending policy (shared by W0, W1, W2)

`w_current = n / (n + k)`, residual shrinking toward **league average**, prior term dropped entirely
once the signal has enough current-season evidence. The weight is displayed, never hidden.

| Signal family | k | prior dropped at |
|---|---|---|
| Points allowed by position | 3 | **9 games played** (the brief's "week 10", in the axis the blender enforces on) |
| Offensive / defensive EPA | 5 | week 12 |
| Pass rate, PROE, RZ rate | 7 | week 14 |
| Pace | 8 | week 14 |

Only the first row is *enforced* in code today — it is the only family whose blend `/week` computes
(W0/W1) — and it is therefore the only row whose threshold is expressed in **games**, because that
is the axis `buildFpaTable` has (W0 §2.2). A defence with an early bye has played 8 games in week 10,
so labelling that family by week would be wrong for it; W1 §2 carries `dropGames` for this row and
`dropWeek` for the other three, and the panel renders whichever the row carries.

Rows 2–4 are **displayed** by the weight panel (W1 §2) and describe how panel 4's
teamcontext figures would blend once `teamcontext/2026.json` exists; until then panel 4 renders a
single season's values with no blend at all, and must not imply otherwise (W2 §4).

---

## §4 Invariants every slice must honour

- **View-only.** No module added by any slice may be imported by a projection, scoring or grading
  module. W1 adds the guard test; W2 extends its module list. Modelled on
  `src/__tests__/currentSeasonTotalsIsolation.test.js` and `opponentStrengthViewOnly.test.js`.
- **`fan_pts_allow_*` is Sleeper's half-PPR basis, not this league's scoring.** Disclose it on the
  panel, as the design does. Do not attempt to rescore it — the per-position breakdown is not
  reconstructable from league settings.
- **`null` is not `0`.** Both directions bite here: a missing usage observation is `null` and renders
  `—`; an `off_snp` omitted beside a present `tm_off_snp` and `gp === 1` is a measured **0**. Never
  pad a series and never substitute 0 for a missing observation — nor `—` for a real zero.
- **Never sum a stored rate** (teamcontext, W2 §4). Aggregate `*Sum`/`*Plays` components, then divide.
- **Prefer coarse bands over false precision.** Season-long reliability of points-allowed is ~0.2.
  Do not let the weight bars get value-engineered out; they are the feature's credibility.
- **Every `PROVISIONAL(...)` site gets its tag** and the grep output goes in the hand-back.

---

## §5 Slice map

| Slice | File | What it delivers | Depends on |
|---|---|---|---|
| W0 | `.claude/tasks/weekly-decision-0-k3-blend.md` | `k` parameterised and set to 3 app-wide; prior-drop at 9 games; `/teams` + `/portfolio` copy and tests updated | — |
| W1 | `.claude/tasks/weekly-decision-1-lineup.md` | Route, nav, weight panel, the lineup table, the meta-preserving projections fetch, all pure utils, the view-only guard | W0 |
| W2a | `.claude/tasks/weekly-decision-2a-lineup-truth.md` | The lineup as set in Sleeper (not the projection-optimal one) + the bench; byes from the schedule; store-lag notice. Amendments A1–A3 from the 2026-09-21 live review | W1 |
| W2 | `.claude/tasks/weekly-decision-2-panels.md` | Prior-season SNAP sub-line, defences-you-face, offences-you-own (empty state), the season grid over starters/bench/IR (A4) | W2a |

W2a before W2: W2a corrects what W1 shipped (the user-visible fix) and provides the row shape and schedule util W2 builds on. W0 first: W1's weight panel renders the same `k` the blender uses, and shipping W1 against a k=6
blender would put a panel reading "k 3" above numbers blended at 6.

Each slice is its own Session 2 and its own done-definition. W1 is the slice with a user-visible
surface to smoke-test; W0 has one only insofar as `/teams` numbers move, and W2 is additive panels.

---

## §6 Cross-repo impact

**The brief states "None". That was correct for its original scope and is no longer correct**, because
the k=3 decision brings `src/utils/opponentStrength.js` and both `buildFpaTable` call sites into the
change — and those are named Triggers on two registry entries. No data-repo file, schema, floor,
cadence or manifest family changes; the obligation here is the Mirror-emission rule, not a data-side
edit. CLAUDE.md: "Any change touching a listed contract **must emit that entry's `Mirror` text as
Session 1 output** … Naming the contract in prose is not enough."

**All three slices touch a listed contract.** An earlier draft of this file claimed W1 and W2 were
clean; the plan gate found otherwise (2026-09-21) and both were wrong:

| Slice | Entries triggered | Emitted in |
|---|---|---|
| W0 | CR-20 (`opponentStrength.js` symbols + the `Teams.jsx` render), CR-21 (`buildFpaTable`'s `currentRows`) | W0 §6 |
| W1 | CR-21 — §5.3 passes `currentSeasonTotals.players` as `currentRows` and §5.4 reads the DEF rows' own `gamesPlayed` as the partial-season signal; both are named Triggers | W1 §9 |
| W2a | CR-08 (new schedule reader), CR-21 (per-team store-lag check + proposed Mirror amendment), CR-20 (moved call sites; re-derive D-23), CR-16 (new team-code hops), CR-02 (DEF rows put to a new use), CR-18 | W2a §9 |
| W2 | CR-10, CR-20 + CR-21 (§2's `computeFpaPerGame` over both row maps), CR-11 (§1a's stored snap-key reads), CR-16, CR-18 | W2 §6 |

W1 additionally records one adjacency that is *not* a Mirror obligation: a new **live-API** consumer
of the same `TEAM_*` and `fan_pts_allow_*` shapes CR-20 protects in the **store**.

**No slice may edit `docs/cross-repo-registry.md` itself.** Lines ~19-270 are a mirrored region that
must be byte-identical in both repos, CI-enforced from the data side by CR-24's daily
`registry-mirror.yml`. A repo-scoped Session 2 cannot write the sibling, so an app-side-only edit to
that region schedules a red rather than a sync. Registry corrections these slices surface go to
`.claude/tasks/data-repo-backlog.md` and route through the two-session path — see W0 §6.

Deliberately out of scope for v1, each a separate decision:
- pbp-derived game-script (time leading/trailing) — two-repo change.
- lowering the gamelogs/teamcontext row floors — two-repo change (CR-09/CR-10).
- the advstats-season-keying fix — queued to follow this handoff.
