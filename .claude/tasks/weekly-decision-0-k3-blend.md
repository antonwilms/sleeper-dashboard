# W0 — points-allowed blend: k = 3 app-wide, prior dropped at 9 games

Parent: `.claude/tasks/weekly-decision-surface.md`. Read its §0 (provenance gap), §2 (the decision
and its reasoning) and §3 (the blend table) before starting. **This slice ships no new surface** —
it changes a shipped number and the copy that explains it.

Prerequisite for W1. Nothing in W1/W2 may be started before this lands.

---

## §1 Why

`opponentStrength.js` blends per-game fantasy points allowed with `PRIOR_WEIGHT_GAMES = 6`. The
Weekly Decision design specifies `k = 3` for the same quantity. Anton's call (2026-09-20): 3 wins
app-wide, so one defence reads one number everywhere. The existing 6 is self-documented in code as
"a judgment call, not a backtested one"; 3 has a measurement behind it — with the provenance caveat
in parent §0, which constrains the replacement copy.

---

## §2 `src/utils/opponentStrength.js`

**2.1 — `PRIOR_WEIGHT_GAMES: 6 → 3.** Keep the exported name; two components render copy from it.
Rewrite the constant's block comment. The current one derives a crossover at `gCur = 6` and a 74%
ceiling from the old value; both numbers are wrong at k=3 and must be recomputed in the comment:
crossover (equal weight) now at `gCur = 3`, and with the drop rule in 2.2 the current season reaches
100% at 9 games rather than asymptotically approaching 85%. Do not carry "a judgment call, not a
backtested one" forward unchanged — but do not replace it with an r-value or a sample size either
(parent §0). "Derived from measured year-over-year stability of points-allowed; the study is not
reproduced in-repo" is the honest form.

**2.2 — new export `FPA_PRIOR_DROP_GAMES = 9`.** Once a defence has played 9 or more current-season
games, `blendFpaPerGame` ignores `priorRate` entirely and returns `current.rate`.

```js
function blendFpaPerGame(current, priorRate) {
  const gCur = current?.gp ?? 0
  if (gCur >= FPA_PRIOR_DROP_GAMES) return current.rate      // new branch, before the blend
  if (gCur > 0 && priorRate != null) { /* unchanged */ }
  // … remaining branches unchanged
}
```

The new branch goes **first**. `gCur >= FPA_PRIOR_DROP_GAMES` implies `gCur > 0`, so
`current.rate` is safe there — the existing `gp <= 0` guard in `computeFpaPerGame` still does its
job for every other path, and the `0 * Infinity === NaN` hazard its comment describes is untouched.

**The displayed threshold must match the enforced one.** W1's weight panel prints an "all wk N"
column per signal family. For the points-allowed family that label is derived from this constant and
**must be expressed in games, not weeks** — "all 9 gm", not "all wk 10". A defence with an early bye
has played 8 games in week 10, so a week label is simply wrong for it. Export the constant as the
single source for both the enforcement and the label; W1 §2 carries the matching test.

**Deviation from the brief, stated for the reviewer:** the brief says "prior dropped at **week 10**".
`buildFpaTable` takes row maps and has no week parameter; no caller outside `/week` has a week to
give it, so threading one would re-open exactly the two-numbers-for-one-defence split this slice
exists to close. `gCur` is the axis the data already carries. A team entering week 10 has played 8
or 9 games depending on its bye; 9 is chosen so the prior survives until the defence genuinely has
nine games behind it. Record this in the constant's comment, not only here.

**2.3 — do not add a `priorWeightGames` option parameter.** It was considered and rejected: with k=3
adopted app-wide there is no second caller wanting a different k, and an unused knob invites the
divergence the decision closes. W1 passes nothing.

**2.4 — `buildFpaTable`'s per-cell `weights[pos]` stays `gCur` (a game count), unchanged.** W1's
weight bar converts it to a percentage at the render site. Do not change it to a fraction here —
`Teams.jsx:77` already does that conversion and `strengthOfSchedule.js` treats `weights` as an inert
sibling key.

---

## §3 Call-site copy — `src/components/teams/Teams.jsx`

`Teams.jsx:64-81` builds the FPA gloss. Three things change:

- The `weightPct` arithmetic at :77 is `gCur / (gCur + PRIOR_WEIGHT_GAMES)` and stays correct by
  construction — **but it is wrong once the prior is dropped**. At `gCur >= 9` the true weight is
  100%, and that formula yields 75%. Add the drop branch: `gCur >= FPA_PRIOR_DROP_GAMES ? 100 : …`.
- The prose at :80-81 says "shrinking toward `<priorSeason>` at a `6`-game rate (a judgment call,
  not backtested)". Rewrite for k=3 under the §2.1 wording constraint, and make the pseudo-games
  sentence at :81 tell the truth in the dropped case — `"{gCur} of {gCur + K} pseudo-games"` reads
  as a blend that is no longer happening.
- The gloss must still name Sleeper's half-PPR basis wherever it does today. Do not drop that
  disclosure while editing around it.

## §4 Call-site copy — `src/components/portfolio/TeamOffences.jsx`

`:65` carries the same "`6`-game rate" sentence for the schedule-strength ladder. Same rewrite. This
file imports `PRIOR_WEIGHT_GAMES` for copy only — it does not call `buildFpaTable` — so there is no
arithmetic to fix here, only wording.

`src/components/portfolio/Portfolio.jsx:370,377` calls `buildFpaTable`/`rankFpaTable` and needs **no
change**: it passes no k and picks the new default up automatically. Confirm by reading it; do not
edit it.

---

## §5 Tests

**5.1 `src/utils/opponentStrength.test.js`** — existing, must change:
- `:31` `expect(PRIOR_WEIGHT_GAMES).toBe(6)` → `3`.
- `:96` the mid-season fixture comments describe "K = PRIOR_WEIGHT_GAMES = 6"; the cases at `:104`
  and `:110` are written in terms of the constant and should still pass, but `:110` uses
  `3 * PRIOR_WEIGHT_GAMES` = 9 games, which now **crosses the drop threshold** and must assert the
  prior is gone (expected 10.0, not a blend). Do not merely re-baseline the expected number — the
  case is now testing a different branch and its name must say so.

**5.2 New cases in the same file** — the drop rule, asserted on behaviour not on the constant:
- `gCur = 8`, prior 20.0, current 10.0 → blended `(8·10 + 3·20)/11`, prior still present.
- `gCur = 9` → exactly `10.0`; changing `priorRows` to any other value does not move it.
- `gCur = 9` with `priorRows: null` → still `10.0` (the drop branch must not depend on a prior
  existing).
- `weights.qb` still reports the raw `gCur` (9), not 100 or 1 — the sibling-key contract.

**5.3 `src/components/teams/Teams.test.jsx:304`** — the expected value
`((3 * 10) + (PRIOR_WEIGHT_GAMES * (273.8 / 17))) / (3 + PRIOR_WEIGHT_GAMES)` is written in terms of
the constant and will re-baseline itself. **Read the surrounding case before assuming that is
correct**: at `gCur = 3` and k=3 the blend is now 50/50 where it was 33/67, so any assertion about
*ordering* or *rank* in that file may flip even though the arithmetic expression is unchanged. Run
the file and inspect, do not assume.

**5.4** Add a case asserting the `Teams.jsx` weight-percent copy reads 100% at `gCur >= 9` — whatever
form that file's existing gloss tests take. If it has none, a single render assertion is enough;
this is the one place the drop becomes visible to a user.

**5.5** `src/__tests__/opponentStrengthViewOnly.test.js:34` is unaffected (it greps for symbol names)
but must still be green — the new export must not appear in any pipeline module.

---

## §6 Cross-repo impact

Two registry entries name the edited symbols and call sites as Triggers. **No data-repo file,
schema, floor, cadence or manifest family changes** — the obligation is emission, not a data-side
edit. Both Mirror texts follow verbatim.

**CR-20 · `fan_pts_allow_*` DEF-row key preservation.** Triggered by: `FPA_POSITIONS` and the
`fan_pts_allow_${pos}` read in `src/utils/opponentStrength.js`'s `computeFpaPerGame`, `isDefenseRowId`
in the same file, `teams/Teams.jsx:151,157,294-297`, and `portfolio/Portfolio.jsx:370,375,377`. This
slice edits the first file and the `Teams.jsx` render.

> **Mirror:** Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total),
> and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit
> DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns
> degrade silently to `—` across all 32 teams** if either the keys or the rows vanish — no error, no
> test failure, indistinguishable from the API-only-mode degraded state already shown for an unrelated
> reason (§6 of the task file). This is the exact silent-degradation shape CR-11/12/13/19 exist to
> record, for a *row*, not merely a key.

**CR-21 · In-progress season-totals reads.** Triggered by: "`buildFpaTable`'s `currentRows` parameter
in `src/utils/opponentStrength.js`". This slice changes how `currentRows` is weighted against the
prior, which is the behaviour that parameter exists to carry.

> **Mirror:** If the weekly job stops running, starts writing partial weeks under a different marking,
> or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a
> half-season's rates as though they were a season's, with no error and no test failure. The floor in
> `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season
> validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by
> games played alone**, and the app-side consumer must not assume it does. Any change to the job's
> cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why
> this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to
> propagate" line — its `inProgress` flag is accurate, not a mislabel.

**Do not edit `docs/cross-repo-registry.md` in this change.** CR-20's and CR-21's `Triggers` lists
need no new entries (the symbols are already named). `FPA_PRIOR_DROP_GAMES` *does* belong in CR-21's
**App side** list — the amount of current-season evidence at which the prior is discarded is
precisely a statement about how an in-progress file is read — **but that text sits inside the
mirrored region (lines ~19-270), which must be byte-identical in both repos and is CI-enforced from
the data side by CR-24's daily `registry-mirror.yml`.** A repo-scoped Session 2 cannot write the
sibling, so editing it here schedules a red rather than a sync.

Instead, append the exact proposed entry text to `.claude/tasks/data-repo-backlog.md` with this
slice's commit SHA, marked **non-blocking**, for the two-session route (app emits → data applies →
data syncs with an anchored diff). Done-definition item 7 already requires the backlog append; this
names what to write.

---

## §7 Docs

- `docs/signal-registry.md` — the `fan_pts_allow_*` row. If it states the 6-game weight, update it;
  if it does not, add nothing. Check, do not assume.
- `docs/nav/utils.md` — the `opponentStrength.js` row, if it names the constant's value.
- CLAUDE.md needs no change: it does not name `PRIOR_WEIGHT_GAMES`. Verify with grep before
  concluding that.

## §8 Done-definition

Standard (CLAUDE.md §Done-definition). Specific to this slice:
- `npm test` green, with `opponentStrength.test.js` and `Teams.test.jsx` inspected rather than
  re-baselined — §5.3 is the trap.
- Smoke `/teams`: the four FPA columns still render 32 rows, the gloss reads "3-game" and no
  longer claims "not backtested", and no cell shows `NaN`. Report the numbers you saw for one
  named defence.
- Smoke `/portfolio`: the schedule-strength ladder renders and its gloss copy matches.
- No `PROVISIONAL(...)` site is added or removed by this slice; paste the grep anyway.
