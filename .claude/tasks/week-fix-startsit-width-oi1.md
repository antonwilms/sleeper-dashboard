# W-fix — start/sit line width + OI-1 null matchup_id pairing

Repo: sleeper-dashboard (app). Planned at `39ccb21` (= origin/main, W2b-3 signed off and pushed);
every line anchor below was read there. Session 2: **sonnet**, effort medium.

Review depth: light — view-only UI class change plus a pure extraction of the League schedule's
`weeklyScores` grouping; no projection/scoring/factors input, no cross-repo site, no state moved,
no hook or dependency added, no `playerRows` step, no TTL or snapshot change.

Source: Anton's brief of 2026-11-20 (W-fix). OI-1 originates in
`week-w-matchup-flags-visuals.md` → Open items (l.641–647) and is re-stated in
`week-w2b-1-colour-scale.md` l.580.

## Product outcome

1. On This week at full desktop width, a start/sit flag no longer pushes the player column wide; the
   flag wraps onto extra lines inside the column instead, so Usage & form (including the 2026 WEEKS
   strip) fits on screen. Every number in the flag stays visible.
2. From playoff week 15, League → Schedule stops showing the two first-round bye teams as having
   played each other (with an invented win/loss); a bye week shows `—` for them.

## Measured (session check, 2026-11-20, `39ccb21`, browser pane 1440×900, `/week`, Usage & form lens)

- Today: `col-player` td = **476px**; `[data-testid="frozen-scroll"]` clientWidth 1135 / scrollWidth
  **1268** (overflow 133px). Flag text: "PROJ · Josh Downs 7.6 on bench > 5.1 · OURS 8.7 vs 3.1 ·
  PROJ and OURS agree", one line.
- Flag hidden: td = **330px**, scrollWidth = clientWidth = 1135 (no overflow). Widest unflagged text
  content across all 28 player cells = 254px (text column = 330 − 20 padding − 40 photo − 10 gap = 260).
- Proposed mechanism applied in-page (below): td = **330px**, no overflow, flag 260px wide, **2 lines
  (28px)**, flagged row **81px** vs unflagged **61px**.

## Fixed decisions

- **D1 Mechanism: the footer contributes zero intrinsic width.** Replace `md:whitespace-nowrap` on the
  start/sit footer with `w-0 min-w-full` (unprefixed — every width). `width: 0` makes the footer add
  nothing to the table column's min/max-content, so the column is sized by photo + name line +
  sub-line alone; `min-width: 100%` then stretches it to the text column's laid-out width, where it
  wraps normally. This is "a max-width equal to the unflagged text column" computed by the browser
  rather than a hard-coded px (a fixed `max-w-[…]` would either still widen a narrow-name league or
  wrap needlessly in a wide one). No `truncate`, `line-clamp`, `overflow-hidden` or ellipsis.
- **D2 Resulting height.** Text column width is whatever the unflagged content sets (260px in the
  measured league). At 10.5px / 14px line-height a ~400px flag (single-move + OURS) is **2 lines,
  28px → flagged row ≈ 81px** (unflagged 61px; previously one line ≈ 75px). The longest form
  (two-moves `via` text + OURS, ~600px) is **3 lines, 42px → ≈ 95px**. A league with shorter names
  gets a narrower column and possibly one more line — accepted (taller, never wider).
- **D3 PlayerCell untouched.** `src/components/dp/cells.jsx` (`PlayerCell`, l.92–130) is not edited;
  the LineupTable `className="max-w-[168px] md:max-w-none"` (`LineupTable.jsx:280`) is not edited.
- **D4 OI-1: extract, then guard.** The grouping loop moves out of App.jsx's async effect into a pure
  exported helper in `src/utils/weeklyMatchup.js` (the module that already owns the "a `null`
  matchup_id never pairs" rule for `pairMatchup`), so it is unit-testable and the two rules agree.
  Behaviour for non-null pairs is byte-identical (same `pair.length !== 2` skip, same
  `aWon = a.points > b.points`, ties unchanged — out of scope).
- **D5 Standings unaffected.** `standings` (App.jsx l.1014–1028) come from `roster.settings`
  (wins/losses/ties/fpts), not from `weeklyScores`. `weeklyScores`' only consumer is
  `league/ScheduleGrid.jsx` (via `LeagueView.jsx:42`), which renders `—` for a week with no entry
  (ScheduleGrid.jsx l.29–30). `starterWeeks` (App.jsx l.1042, and the prior-season loader l.1276)
  calls `startersFromMatchups`, which ignores `matchup_id` — not touched.

## Changes

### 1. `src/components/week/LineupTable.jsx`

l.306, the `startsit-flag` footer div:

```diff
-                className="text-[10.5px] text-dp-down-text md:whitespace-nowrap"
+                className="text-[10.5px] text-dp-down-text w-0 min-w-full"
```

Add a JSX comment as the div's first child, on the line before `{flagText(flag)}` (l.308):
`{/* w-0 min-w-full: the flag never sets the column width — it wraps to the width photo + name +
sub-line set (W-fix D1); never truncate, a flag always shows its numbers. */}`. Do not wrap the div
in a fragment.

Nothing else in LineupTable.jsx changes.

### 2. `src/utils/weeklyMatchup.js`

Add, after `pairMatchup` (l.16–23):

```js
// Completed-week League schedule entries (App.jsx → leagueData.weeklyScores). rows: one week's
// Sleeper matchups array. -> { [roster_id]: { week, points, opponentRosterId, won } } for every
// roster in a matchup_id group of exactly two. A null/undefined matchup_id (playoff bye,
// eliminated, median-only row) never forms a group — same rule as pairMatchup (OI-1).
export function weekScoresFromMatchups(week, rows) {
  const groups = {}
  for (const m of Array.isArray(rows) ? rows : []) {
    if (m?.matchup_id == null) continue
    ;(groups[m.matchup_id] ??= []).push(m)
  }
  const out = {}
  for (const pair of Object.values(groups)) {
    if (pair.length !== 2) continue
    const [a, b] = pair
    const aWon = a.points > b.points
    out[a.roster_id] = { week, points: a.points, opponentRosterId: b.roster_id, won: aWon }
    out[b.roster_id] = { week, points: b.points, opponentRosterId: a.roster_id, won: !aWon }
  }
  return out
}
```

Header comment l.5–7: replace the "intentionally differs … The two rules coexist until that fix."
paragraph with one line: `pairMatchup` and `weekScoresFromMatchups` share one rule: a `null`
matchup_id never pairs.

### 3. `src/App.jsx`

- Import `weekScoresFromMatchups` from `'./utils/weeklyMatchup'` (new import line beside l.30–32).
- l.1043–1054 (`const groups = {}` through the closing `}` of the `for (const pair …)` loop) becomes:

```js
          for (const [rid, entry] of Object.entries(weekScoresFromMatchups(week, allMatchups[i]))) {
            ;(weeklyScores[rid] ??= []).push(entry)
          }
```

  l.1040–1042 (`const week`, `weeks.push`, `starterWeeks.push`) unchanged. Object keys were already
  strings (`weeklyScores[a.roster_id]`), so the map's key type is unchanged; per-roster arrays stay
  in week order (outer loop order).

### 4. Docs (same change)

- `docs/nav/utils.md` l.78 (`weeklyMatchup.js` row): drop "Differs deliberately from App.jsx's
  completed-weeks `weeklyScores` grouping …" and add `weekScoresFromMatchups(week, rows)` — the
  League schedule's per-week entries; a `null`/`undefined` matchup_id never pairs (same rule as
  `pairMatchup`).
- `docs/architecture.md` l.98: append to the `weeklyScores` comment: `— a roster whose matchup_id is
  null that week (bye) has no entry (weeklyMatchup.js weekScoresFromMatchups)`.
- `week-w-matchup-flags-visuals.md` OI-1 is history — do not edit it.

## Tests to add / change

### `src/components/week/LineupTable.test.jsx`

- **T11 (l.619–641) — update.** Replace the two class assertions (l.637–639,
  `toContain('md:whitespace-nowrap')` / `not.toContain('whitespace-nowrap')`) with the W-fix
  assertions below, so T11 does not pin the old behaviour. Rest of T11 unchanged.
- **New `W-fix F1 a long start/sit flag wraps and never sets the column width`.** Fixture: the T11
  row, flag with `via: { moveId: 'm', moveName: 'Max High', moveProj: 12.0, fromSlot: 'FLEX',
  fromSlotIndex: 1, toSlot: 'WR' }`, `ours: 'agree'`, `bench.name: 'Chase White'`. **Fixture fact:**
  first assert `flag.textContent.length >= 74` (the 406px string measured in the app is 74 chars at
  10.5px — this guarantees the fixture is at least as long as the real overflow case, so the test
  is about a flag that *would* widen the column). Then assert on the footer's
  `className.split(/\s+/)`: contains `w-0` and `min-w-full`; **no token matches
  `/(^|:)whitespace-nowrap$/`** (no nowrap at any breakpoint); no token matches
  `/^(truncate|line-clamp-|overflow-hidden|text-ellipsis)/`. Asserts the bound; fails if
  `md:whitespace-nowrap` (or bare `whitespace-nowrap`) is restored, or if `w-0`/`min-w-full` is
  dropped. **Red step:** restore `md:whitespace-nowrap` and remove `w-0 min-w-full` → red; restore.
- **New `W-fix F2 the shared PlayerCell's width classes are unchanged`.** Same flagged fixture.
  Asserts `player-cell` root `className` contains `min-w-0`, `max-w-[168px]`, `md:max-w-none`, and
  that the footer's parent (the text column, `player-cell-name`'s parentElement) className contains
  `min-w-0` and `flex-1`, and contains no `max-w-` / `w-[` token. Fails if the fix is done by capping
  the cell or text column instead (the tempting wrong fix that would also narrow unflagged rows).
  **Fixture fact:** a flag is present, so the footer is rendered inside that text column (assert
  `textColumn.contains(flag)`). **Red step:** temporarily change LineupTable l.280 to
  `className="max-w-[168px] md:max-w-[260px]"` → red; restore.

### `src/utils/weeklyMatchup.test.js`

New `describe('weekScoresFromMatchups')`:

- **O1 null-id rosters are not paired.** Rows: `{roster_id:1, matchup_id:null, points:0}`,
  `{roster_id:2, matchup_id:null, points:0}`, `{roster_id:3, matchup_id:4, points:110.5}`,
  `{roster_id:4, matchup_id:4, points:98.2}`. Asserts `Object.keys(result).sort()` equals
  `['3','4']`, and `result[3]` equals `{ week: 15, points: 110.5, opponentRosterId: 4, won: true }`,
  `result[4]` `{ week: 15, points: 98.2, opponentRosterId: 3, won: false }`. **Fixture fact:**
  exactly two null-id rows — the case that formed a fake length-2 group. Fails if the
  `matchup_id == null` guard is removed (rosters 1 and 2 get entries). **Red step:** delete the
  `if (m?.matchup_id == null) continue` line → red; restore.
- **O2 undefined matchup_id is treated like null.** Two rows with no `matchup_id` key plus the real
  pair → only `'3','4'`. Fails if the guard is narrowed to `=== null`. Red step: change the guard to
  `m?.matchup_id === null` → red; restore.
- **O3 a real pair is unchanged by array order and a lone row is skipped.** Rows in order
  `[pairB, lone(matchup_id 7), pairA]` → entries for the pair only, each with the other's
  `roster_id` as opponent, and no key for the lone row. Pins the existing `length !== 2` skip.
  **Red step:** remove `if (pair.length !== 2) continue` → the lone group's `b` is undefined and
  `b.roster_id` throws → red; restore.

App.jsx has no unit test for the load effect; the wiring is three lines and is checked by the smoke
step below.

## Smoke (Session 2, done-definition step 6)

Start the `sleeper-dashboard` preview from `.claude/launch.json`; `resize_window` width 1440,
height 900; `/week`, wait for OURS to resolve, pick the **Usage & form** lens. Report: `col-player`
td width (expect ≈ the unflagged width, 330px in the measured league), the flagged row's height and
the flag's line count, and `frozen-scroll` clientWidth vs scrollWidth (expect equal). If any
overflow remains, state its size and which column causes it — do not fix it here (out of scope).
Then League → Schedule: weeks 1–10 render as before (no week has null ids yet, so no visible
change is expected). Reset the viewport to `desktop` and stop the preview.

## Done-definition notes

- Contract tests: none apply (`seasonProjection.js` and stat keys untouched).
- `grep -rn "PROVISIONAL(" src/` output pasted into the hand-back (no tag added or removed).
- No data-repo backlog line expected. If anything here turns out to touch scoring, snapshots or a
  cross-repo index entry, **stop and report** — that is outside this slice.

## Touch list

- `src/components/week/LineupTable.jsx` (l.306 + one comment)
- `src/components/week/LineupTable.test.jsx` (T11 l.637–639; F1, F2)
- `src/utils/weeklyMatchup.js` (header l.5–7; new export)
- `src/utils/weeklyMatchup.test.js` (O1–O3)
- `src/App.jsx` (one import; l.1043–1054)
- `docs/nav/utils.md` l.78, `docs/architecture.md` l.98

## Out of scope

Any other layout, the strip, colours, the tie rule in `weeklyScores`, data/scoring/snapshot/cross-repo.

## Must ship by

Before week 15's scores appear in League → Schedule (~2026-12-22).

## Verification

Verified 2026-11-20 by Session 1 (opus) on `39ccb21..5f82d7b` (one commit, `5f82d7b`, unpushed).

- **Review:** implementation-reviewer, depth light, 1 round — "No blocking issues found." No fix pass;
  no fix-pass re-review needed.
- **Diff read by Session 1:** matches §Changes 1–4 line for line; no file outside the touch list;
  App.jsx `starterWeeks` (l.1043) and the prior-season loader untouched; `standings` still from
  `roster.settings`.
- **Checks (re-run by Session 1 at `5f82d7b`):** `npm test` 190 files / 3648 tests passed · `npm run
  lint` 0 problems · `npm run build` clean apart from the pre-existing chunk-size notice.
- **Tests:** T11 (updated), F1, F2, O1, O2, O3 — each reported red by Session 2 with the task file's
  named red step, then restored.
- **Smoke (Session 2, 1440×900, Usage & form):** `col-player` 274px (set by unflagged content in that
  data state; 330px at planning), flag 204px wide on 2 lines (28px), flagged row 96.6px vs 69px,
  `frozen-scroll` clientWidth = scrollWidth = 1135 (no overflow). League → Schedule weeks 1–10
  unchanged.
- **Deviations:** none. PROVISIONAL inventory: 45 before and after. No scoring / snapshot /
  cross-repo index touch; no backlog line.

Signed off by Anton 2026-11-20
