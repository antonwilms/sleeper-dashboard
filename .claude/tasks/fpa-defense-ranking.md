# Fantasy points allowed by position — blended, ranked

New app-side surface. Origin: F-24's research (idea tracker), where Anton's note reframed "team
defensive strength" as **fantasy points a defense has allowed to each position group, ranked** —
which is both the right metric and one the store already serves.

**No data-repo work. No new ingest.** Everything needed is on disk today.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `fan_pts_allow_{qb,rb,wr,te}` (+ `_k`, `_def`, and the total `fan_pts_allow`) sit on the **32 bare-abbr DEF rows** of every season-totals file, populated 32/32 | measured, 2025 |
| They are **season totals**, not per-game — PHI 2025: `fan_pts_allow_wr` 455.2 over `gamesPlayed` 17 = **26.8/g** | measured |
| Spread across 32 defenses (2025 totals): QB 197.0–402.6, RB 289.5–483.0, WR 401.2–666.3, TE 130.7–355.0 — a real, wide signal | measured |
| **`scoringBasis` on DEF rows is `half_ppr`** — Sleeper's basis, not necessarily the league's | measured |
| **The store path returns the parsed file whole and unfiltered** (`return dsResult`), so `careerStats[season]['PHI']` exists with all 63 DEF stats | `src/api/sleeperStats.js:144-159` |
| **Zero app consumers of `fan_pts_allow*` today** | grep, excluding fixtures |
| **F-24 deliberately preserved these rows** — the prune removed 0 stat-keys from DEF rows | data `2b06c5b`; verified post-migration |
| **2026 season-totals does not exist yet** — so "current season" is genuinely absent right now, which is exactly the preseason case | `manifest.json` |
| **The fixture carries NO DEF rows and no `TEAM_` rows** (0 of each) — tests cannot exercise this without extending it | `src/__fixtures__/season-totals-2025.json` |
| The repo's own research already placed this feature: opponent quality is a **1-week predictor**, *"points-allowed-by-position is wanted during the season"*, and it is **out of scope for `projectedPPG`** | `docs/prediction-research-eval.md:175-186` |
| `/teams` already renders a sortable 32-row table with an inverted lower-is-better column (`DEF EPA ALL`, ascending-first via `usePlayersTable`'s `ascByDefault`) | `components/teams/Teams.jsx` |

---

## 2. The blend — shrinkage, not a switch

Anton's requirement: preseason uses last full season; once the season starts the current one takes
over **slowly**, because this year's defense is what matters.

That is a shrinkage problem, and shrinkage expresses it in one expression with no week-number
branching and no discontinuity:

```
fpaPerGame = (gCur · rateCur + K · ratePrior) / (gCur + K)
```

where `rateX = fan_pts_allow_<pos> ÷ gamesPlayed` for that season, and `K` is the prior's weight in
**pseudo-games**.

- **`gCur = 0` (preseason, today): the expression is exactly `ratePrior`** — the user's stated
  preseason behaviour falls out, it is not a special case.
- Weight shifts continuously as real games accumulate; no cliff at any week.
- At `gCur = K` the two are equal; beyond that the current season dominates.

**`K = 6`, as a named exported constant.** Rationale to state in the code: a defense's identity does
carry across a season boundary, but roster and scheme turnover is real, so the prior should be
outweighed around the quarter-to-third mark — `K = 6` puts the crossover at week 6–7 and leaves the
current season at ~65% by week 12. **This is a judgment call, not a backtested one.** There is no
in-repo backtest for defensive FPA stability; say so at the constant and in the definition popover
rather than implying it was fitted.

**Do not tag it `PROVISIONAL`.** Every input is real measured data — the *weighting* is a choice, not
a fabricated value, and the `PROVISIONAL` convention is for values not backed by real data. A named
constant plus an honest popover line is the right disclosure. *(If review disagrees, defer to it.)*

**Degradation, both directions:**
- No prior season → use the current season alone (`gCur > 0`), and mark coverage low.
- No current season **and** no prior → render `—`. Never substitute a league average.
- A team with `gamesPlayed = 0` in the current season contributes nothing; it is `gCur = 0`, which is
  already the preseason case.

---

## 3. Which seasons

- **Prior** = the most recent season with data, via `environment.js`'s existing `deriveDataSeason(careerStats)`
  — do not add a fourth local copy of that derivation.
- **Current** = `nflState.season` when a season-totals file exists for it, else absent.

**These are deliberately different sources**, and that is the whole point of this feature: `dataSeason`
is "newest season with data" (2025 today) while `nflState.season` is the live NFL season (2026). The
app's own loader convention keys view-only families on `dataSeason` precisely because they diverge —
here we need **both**, and conflating them would make the blend either never update or update
against a file that does not exist. State this in the code.

---

## 4. Surface — Teams index columns

Add four sortable columns to `/teams`: **`FPA QB`, `FPA RB`, `FPA WR`, `FPA TE`** — blended per-game
points allowed, one decimal.

- **Rank 1 = toughest defense** (lowest points allowed), the conventional direction. Show the rank
  alongside or via the popover; the cell's primary value is the per-game number.
- **Lower is better for the defense, so first click sorts ascending** — add the four keys to
  `usePlayersTable`'s `ascByDefault` set, exactly as `defEpaPerPlay` did in Slice 6a.
- **Do not colour by value.** These are neither good nor bad without knowing whose side you are on —
  a soft defence is good for your starter and bad for your own DST. Follow the precedent
  `EnvironmentSection` set for own-defense EPA: state polarity in text, never in colour.
- **A `DefinitionPopover` per column** carrying: the field expression, the blend formula with the
  live weights for the current week, and the basis caveat (§6).

**Explicitly not in this slice:** the per-player "your starter faces the 3rd-softest WR defence this
week" surface. That is the actual start/sit payoff and it is a bigger piece — it needs the current
week, the schedule join (`nflScheduleByYear` is loaded and rendered since Slice 4a, so it is
feasible), and a decision about where it lives (Market gutter? the pop-up? a new Start/Sit surface?).
Ship the ranking first; that follow-on is worth its own slice and its own design pass.

---

## 5. Where the derivation lives

New pure util `src/utils/opponentStrength.js`:

- `FPA_POSITIONS = ['qb','rb','wr','te']` — deliberately excludes `_k` and `_def`; the app is
  QB/RB/WR/TE structurally (`SKILL_POSITIONS`).
- `PRIOR_WEIGHT_GAMES = 6` (§2).
- `computeFpaPerGame(careerStats, season, team, pos)` → per-game rate or `null`.
- `buildFpaTable(careerStats, { priorSeason, currentSeason })` → `{ [team]: { qb, rb, wr, te } }`
  blended, **one pass over the 32 DEF rows per season**, not one pass per team per metric — the
  mistake `computeLeagueStanding` makes and `buildLeagueRankTable`/`buildTeamMetricsTable` were
  written to avoid.
- `rankFpaTable(table)` → per-position 1–32 ranks, ascending (1 = toughest).

Pure, no React, no I/O. **View-only** — must never be imported by projection or scoring, guarded by a
new test in the style of `teamContextViewOnly.test.js`. The research doc's placement (§1) makes this
non-negotiable: opponent strength is out of scope for `projectedPPG`.

**Identifying DEF rows:** they are the bare 2–3-letter uppercase keys, distinct from `TEAM_<abbr>`
aggregates and numeric player ids. `isTeamAggregateId` matches `TEAM_*` only, so it does **not**
identify these — do not reuse it. Add an explicit predicate and note the three-way row taxonomy
(player / `TEAM_*` / bare-abbr DEF) that F-24 documented.

---

## 6. The basis caveat — state it, do not hide it

`fan_pts_allow_*` is a **pre-summed season total in Sleeper's `half_ppr` basis**, not the league's own
scoring settings. The app's standing invariant — *"Fantasy points computed weekly … never sum
pre-stored season totals"* — is about computing a **player's** points and does not forbid reading a
served defensive aggregate, but the distinction must be visible:

- For a **ranking**, basis barely matters — relative order across 32 defenses is robust to scoring
  tweaks.
- For the **displayed number**, it does. The popover must say the figure is half-PPR, not league-scored.

**The in-basis alternative is real but out of scope here:** deriving points-allowed-per-position from
the app's own league-scored `weeklyPoints` joined to the schedule. It needs no new data either.
Record it as the upgrade path; do not build it in this slice.

---

## 7. Tests

- **Preseason** — with no current-season file, the blend returns exactly the prior rate. This is the
  behaviour Anton specified; assert it directly.
- **Mid-season shift** — at `gCur = K` the result is the midpoint of the two rates; at `gCur = 3K` it
  is within a stated tolerance of the current rate. Proves "slowly adjusting" is real, not asserted.
- **No prior** — current season alone; **neither** → `null`, never a league average.
- **Rank direction** — lowest per-game allowed ranks 1.
- **Row taxonomy** — `TEAM_*` and numeric player rows are excluded from the DEF table; only bare
  abbrs are read.
- **View-only guard** — no projection/scoring module imports `opponentStrength.js`.
- **The fixture must gain DEF rows.** It currently has none, so every test above needs them. Add a
  representative subset (all 32 teams' `fan_pts_allow_*` + `gamesPlayed`) rather than one team —
  ranking cannot be tested with a single row.

---

## 8. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/utils/` | New `opponentStrength.js` row |
| `CLAUDE.md` routing table | `/teams` row gains the four FPA columns |
| `docs/ui.md` | The columns, the blend, the basis caveat |
| `docs/signal-registry.md` | `fan_pts_allow_*` goes from **served-but-unrendered** to rendered — this is exactly the reclassification CR-18 exists for |

---

## 9. Cross-repo impact

**CR-18 · Signal registry rows** fires — `fan_pts_allow_*` changes classification from unrendered to
a rendered view-only signal. Emit its `Mirror` verbatim **from the live registry region**, not from an
older task file.

**No other entry fires and no data-repo change is needed.** These keys live on DEF rows, which F-24
deliberately left whole; nothing about the ingest, schema or validators changes. **Consider whether
`fan_pts_allow_*` now warrants its own key-preservation entry** in the CR-11/12/13/19 family — it
would be the first rendered consumer of a DEF-row key, and the same silent-degradation argument
applies. Decide during implementation; if yes, it lands in both repos.

---

## 10. Done-definition

- [ ] Preseason (no current-season file) returns exactly the prior season's rate — verified against
      today's real state, where 2026 does not exist
- [ ] `PRIOR_WEIGHT_GAMES` is a named export with its rationale and its untested status stated
- [ ] One pass per season over the 32 DEF rows; no per-team-per-metric recomputation
- [ ] Rank 1 = toughest; the four keys added to `ascByDefault`; **no colour on the cells**
- [ ] Popover states the blend, the live weights, and the **half-PPR basis**
- [ ] Fixture gains DEF rows for all 32 teams; view-only guard test added
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked: `/teams` sorts by each FPA column; a soft and a tough defence read plausibly against
      the 2025 spreads in §1
- [ ] CR-18 mirror carried out; signal-registry row updated
