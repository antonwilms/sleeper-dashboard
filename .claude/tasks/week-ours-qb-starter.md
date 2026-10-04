# /week OURS — a QB starting this week is valued at his starter rate (P10)

Source: `future_plans/in-season-notes-plan.md` (parent folder) → *Sign-off 2026-10-04* → **P10**. Planned
2026-10-04 against app `981b98a`. Session 1 (opus) wrote this; Session 2 (sonnet) implements it exactly.

## 0. Goal and fixed decisions — do not reopen

**Bug.** OURS = the displayed `seasonProjections[id].projectedPPG` × the Vegas factor. Since P6b a QB on the
start chain has a *share-weighted* `projectedPPG` — starter rate × expected share of the remaining team
games. That is a rest-of-season average, not a this-week number. Live 2026-10-04: Marcus Mariota (WAS,
starting week 4 with Jayden Daniels `Out`) showed OURS 5.1 (= 14.3 × 34% × Vegas) against Sleeper PROJ 17.0.

**Fix.** For a QB row only, decide his role **this week** from the Sleeper depth chart and injury
designations, then:
- **starter this week** → base OURS on his *share-free* starter rate (§2.2), × Vegas as before;
- **backup this week** → no number (`—`, new reason `'qb-backup'`);
- **role undeterminable** → no number (`—`, new reason `'qb-no-role'`).

Non-QB rows are byte-for-byte unchanged. A QB whose displayed projection carries no share (a normal
incumbent) and who starts this week gets exactly the pre-P10 value.

Decisions (Session 1, 2026-10-04):
- **D1 — starter base is the share-free version of the number already displayed, not always the raw
  preseason `factors.qbStarterPPG`.** When the scored projection carries `inSeason.start`, the base is
  `inSeason.start.starterValue` — the in-season starter-rate posterior, i.e. the same rate the displayed
  ROS already multiplies by `start.fraction` (its prior *is* `factors.qbStarterPPG`, or the frozen
  `starterPPG`, updated by his starts so far). Only when there is no in-season record and the preseason
  projection is share-weighted (`factors.qbTakeoverBasis === 'chain'`) is the base `factors.qbStarterPPG`.
  Why: using the preseason factor on an in-season row would silently discard his starts evidence and make
  OURS disagree with the ROS the rest of the app shows. Anton may override to "always
  `factors.qbStarterPPG`" — a one-line change in §2.2.
- **D2 — backups show `—`, not the share-weighted value.** The sign-off left this open. The share-weighted
  number is the exact mis-specified quantity this item removes; for a QB2 behind a healthy starter the
  honest one-week value is near zero, and "omit rather than approximate" is the standing directive.
- **D3 — "this week's starter" = the team's QB with the lowest finite Sleeper `depth_chart_order` whose
  `injury_status` is not in `OUT_STATUSES`; ties → the smaller player id (string compare, as
  `buildPreseasonQbShares`).** This covers both cases in the note (order 1; order 1 is OUT and he is next)
  and also two OUT QBs. `Questionable`/`Doubtful` starters stay the starter (consistent with OURS valuing
  Q/D players normally). A team with no QB carrying a finite order outside `OUT_STATUSES` has no starter.
- **D4 — view-only and `PROVISIONAL(heuristic)`.** Nothing here reaches `projectedPPG`, `playerRows`, the
  dynasty score, a snapshot, a `factors` entry or the QB chain. No new import in `weeklyOwnProjection.js`
  (the guard pins it to `./nflStats`). No change to `qbTakeover.js`/`inSeasonScoring.js` (not a CR-27
  change: this rule is a display rule and is not fed to the chain).
- **D5 — the BACKUP chip yields to the OURS role for a QB starter (plan gate flag 3).** `weeklyLineup.js`
  sets `backup` for any `depth_chart_order >= 2`, so a QB2 promoted because QB1 is Out would read
  "BACKUP" and "Starting QB this week" in one row. `LineupTable` hides the chip when
  `ownByPlayer[id]?.qbRole === 'starter'` (§3.4). `weeklyLineup.js` is not touched (it may not import
  `weeklyOwnProjection.js` — guarded).

## 1. Findings against live source (`981b98a`)

- `src/utils/weeklyOwnProjection.js:85-112` `buildOwnProjections` — base = `proj.projectedPPG`, `baseKind`
  `'ros'` iff `proj.inSeason`; reasons in order `bye`, `out`, `no-base`, `no-line`, `no-baseline`.
  `OUT_STATUSES` exported at `:30`. Status is read from `playerMap[id].injury_status`.
- `src/hooks/useWeeklyDecision.js:325-331` already passes `playerMap` (the full Sleeper `/players/nfl`
  map) and the scored `seasonProjections`. **No hook change is needed.**
- `seasonProjection.js:444-450` (rookie) and `:950-957` (vet): `qbStarterPPG` = the unshared PPG for every
  QB; `qbStartShare` non-null only when `qbTakeoverBasis === 'chain'`; `projectedPPG` = starter × share
  then. Factors are rounded: `qbStarterPPG` 3 dp, `qbStartShare` 4 dp (`:544-546`, `:1083-1085`).
- `inSeasonScoring.js` `buildScoringPosteriors`: a QB with a live chain state (`kind` `'backup'`/`'starter'`)
  gets `ros.value = starterValue_unrounded × fraction` and a `start` record `{ kind, fraction (r4),
  starterValue (r2), … }`. A QB without `start` (live `original`, or no live states) gets a ROS posterior
  on an **unshared** prior (`nonStartPrior` = `starterPrior` for a chain-basis row, `projPrior` otherwise);
  a chain-basis QB with no live state gets no record at all. `applyInSeasonProjection` spreads `proj`, so
  `factors` survives on the scored copy and `inSeason` = the record.
- Therefore the share-free base is fully determined by: `inSeason.start` present → `start.starterValue`;
  `inSeason` present without `start` → `projectedPPG` (already unshared); no `inSeason` and
  `factors.qbTakeoverBasis === 'chain'` → `factors.qbStarterPPG`; else → `projectedPPG`.
- `LineupTable.jsx:123-139` `ownTitle`, `:141-166` `OwnCell` (renders `OUT` for `'out'`, else `—` when
  `value == null`), header tooltip `:316-321`, footer paragraph `:361-368`.
- `weeklyDecisionViewOnly.test.js:127-135` — pins `weeklyOwnProjection.js` imports to `['./nflStats']` and
  forbids `projectedPPG:` / `.projectedPPG =`. The new code must not use an object key named
  `projectedPPG` (it does not need one).

## 2. `src/utils/weeklyOwnProjection.js`

### 2.1 New export `buildQbStartersByTeam(playerMap)`

```
// -> Map<sleeperTeam:string, starterId:string>
```
One pass over `playerMap` entries with `position === 'QB'`, `team` a non-empty string and not `'FA'`,
`Number.isFinite(depth_chart_order)`, and `injury_status` not in `OUT_STATUSES`. Per team keep the lowest
order; tie → the smaller id by `<` string compare. Teams with no qualifying QB are absent. Pure; never
mutates. Put the PROVISIONAL tag directly above it:

```js
// PROVISIONAL(heuristic): QB starter this week · lowest Sleeper depth_chart_order not listed Out/IR/PUP/Sus/DNR, no game-day confirmation · a confirmed weekly-starter source would make it real
```

Header comment above the function (2–4 lines): the D3 rule, that `Doubtful`/`Questionable` still start,
and that this is a display rule, not the QB chain's (CR-27 `buildPreseasonQbShares` uses order 1 only and
no injury input — do not unify).

### 2.2 New internal (non-exported) `qbStarterBase(proj)`

```
// -> { base: number|null, share: number|null }
```
- `proj?.inSeason?.start` present → `base = start.starterValue` (if finite, else null),
  `share = start.fraction` (if finite, else null).
- else if `proj?.inSeason` → `base = projectedPPG` (finite or null), `share = null`.
- else if `proj?.factors?.qbTakeoverBasis === 'chain'` → `base = factors.qbStarterPPG` (finite or null),
  `share = factors.qbStartShare` (finite or null).
- else → `base = projectedPPG` (finite or null), `share = null`.

(D1 override, if Anton asks: return `factors.qbStarterPPG` in the first branch.)

### 2.3 `buildOwnProjections` changes

Signature unchanged. At the top, `const qbStarters = buildQbStartersByTeam(playerMap)` (once per call).

Per row, after the `bye` early-continue and the `status`/`proj` reads:
- `const isQB = playerMap?.[id]?.position === 'QB'`.
- If `isQB` and `qbTeam = playerMap[id].team` is a non-empty string other than `'FA'`: `qbRole` =
  `'starter'` if `qbStarters.get(qbTeam) === id`, else `'backup'` if `qbStarters.has(qbTeam)`, else
  `'unknown'`. Non-QB, or a QB with null/`'FA'` team: `qbRole = null` (a teamless QB keeps today's path and
  lands on `'no-line'`, not `'qb-no-role'` — plan gate flag 5).
- Base: QB with `qbRole === 'starter'` → `{ base, share } = qbStarterBase(proj)`; every other row (incl.
  QB backup/unknown) → `base` exactly as today (`projectedPPG` finite or null), `share = null`.
- `baseKind` unchanged: `base == null ? null : (proj.inSeason ? 'ros' : 'season')`.
- Reason order becomes: `bye` → `out` → `qb-backup` (`qbRole === 'backup'`) → `qb-no-role`
  (`qbRole === 'unknown'`) → `no-base` → `no-line` → `no-baseline`.
- Output object gains two fields on **every** entry (including `bye`): `qbRole` (`'starter'|'backup'|
  'unknown'|null`) and `share` (number|null — the share the displayed projection carries, set only on a QB
  starter row whose base was unshared from it; `null` otherwise). The bye entry carries
  `qbRole: null, share: null`. `vegas` is still computed for the new reasons (the sub-line keeps showing the
  implied total, as it does for `'out'`).

Update the function's header comment: the `Own` shape line gains `qbRole`/`share` and the two reasons; add
one sentence: "A QB's OURS is his this-week role's number (P10, week-ours-qb-starter.md): a starter is
valued at his share-free starter rate, a backup or an unknown role is blank." Also amend the module
header's `base = …` line to say "(for a QB starting this week, the share-free starter rate — §P10)". Keep
the existing PROVISIONAL tag on `buildOwnProjections` as is.

## 3. `src/components/week/LineupTable.jsx`

### 3.1 `ownTitle(own, season)`
- `reason === null` and `own.share != null` (a QB starter whose base was unshared): prefix the existing
  text's first sentence with the role. Exact first sentence:
  `` `Starting QB this week: ${kind} starter rate ${own.base.toFixed(1)} PPG (the season projection assumes he starts ${Math.round(own.share * 100)}% of remaining games) × ${v.factor.toFixed(2)} = ${own.value.toFixed(1)}.` ``
  followed by the unchanged "The factor is half …" sentences. `kind` here is lower-case: `'rest-of-season'`
  for `baseKind === 'ros'`, `'season'` otherwise.
- `reason === null` and `own.share == null`: unchanged (a starter with no share reads exactly as today).
- New: `'qb-backup'` → `'Not his team’s starting QB this week (Sleeper depth chart and injury list) — no number.'`
- New: `'qb-no-role'` → `'No Sleeper depth chart for his team’s QBs — can’t tell who starts, no number.'`

### 3.2 `OwnCell`
No logic change — both new reasons fall into the existing `—` branch, and the `imp` sub-line renders when
`implied` is finite.

### 3.3 Header tooltip and footer
- Header `title` (`:318`): append ` A QB is valued only if he starts this week.`
- Footer OURS paragraph: after "…more accurate." insert: "A quarterback counts only if he is his
  team&rsquo;s starter this week &mdash; the top QB on Sleeper&rsquo;s depth chart not listed out &mdash;
  and is then valued at his starter rate rather than his rest-of-season average, which assumes he may not
  start every game. Other QBs are blank." Keep "Blank when any input is missing; OUT when Sleeper lists him
  out." as the last sentence.

Keep the existing PROVISIONAL tag on `OwnCell`.

### 3.4 BACKUP chip (D5)
In `LineupRow` (`:195`), render the chip only when
`r.backup && ownByPlayer?.[r.player_id]?.qbRole !== 'starter'`. Footer BACKUP sentence (`:357-359`):
after "…listed second or lower on his NFL depth chart" insert " (for a QB, unless the one above him is
listed out, so he starts this week)". Nothing else in the chip changes.

## 4. Tests

`src/utils/weeklyOwnProjection.test.js` — new `describe('buildQbStartersByTeam')` and new cases in
`describe('buildOwnProjections')`. Use a `playerMap` fixture with team `KC` QBs; the existing `indexFor()`
gives factor `1.0625` at week 3.

`buildQbStartersByTeam`:
1. order 1 healthy → that id; order 1 `Out` and order 2 healthy → the order-2 id; orders 1 and 2 `IR`/`Out`,
   order 3 healthy → order 3; order 1 `Doubtful` → still order 1.
2. tie on order → the smaller id; a QB with null `depth_chart_order` is never chosen; `team: 'FA'`/null
   ignored; non-QB positions ignored; a team whose only QBs are out or unlisted is absent from the Map.

`buildOwnProjections`:
3. **The Mariota case.** p1 QB KC order 2, p2 QB KC order 1 `Out`; `seasonProjections.p1 =
   { projectedPPG: 4.9, inSeason: { start: { starterValue: 14.3, fraction: 0.34 } }, factors: {
   qbStarterPPG: 13.0, qbTakeoverBasis: 'chain', qbStartShare: 0.16 } }` → `qbRole 'starter'`,
   `base 14.3`, `share 0.34`, `baseKind 'ros'`, `value ≈ 14.3 × 1.0625`. (13.0 present and not used —
   asserts D1.)
4. Preseason chain row, no `inSeason`: `{ projectedPPG: 2.1, factors: { qbStarterPPG: 13.0,
   qbTakeoverBasis: 'chain', qbStartShare: 0.1558 } }`, he is the starter → `base 13.0`, `share 0.1558`,
   `baseKind 'season'`.
5. `inSeason` without `start` (live `original`): `base` = `projectedPPG`, `share null`.
6. Normal incumbent starter (no `inSeason`, `qbTakeoverBasis: 'incumbent'`) → value identical to the
   pre-P10 formula, `share null`, `qbRole 'starter'`.
7. A healthy order-1 teammate exists → p1 (order 2) gets `reason 'qb-backup'`, `value null`, `vegas.implied`
   still set. A team with no listed QBs → `'qb-no-role'`.
8. Precedence: a QB backup on bye → `'bye'`; a QB listed `Out` → `'out'` (not `'qb-backup'`); a QB starter
   whose starter base is null (chain row, `qbStarterPPG: null`) → `'no-base'`.
9. A non-QB row is unchanged and carries `qbRole null`, `share null`; update the existing first test's
   expectations only by adding those two fields if it uses `toEqual` (it uses `toMatchObject`/`toBe` — no
   edit needed). Frozen inputs: extend the existing immutability test's `playerMap` with a frozen QB pair.

`src/components/week/LineupTable.test.jsx`, in the OURS describe:
10. A starter with `share: 0.34, baseKind: 'ros'` → title starts
    `Starting QB this week: rest-of-season starter rate 14.3 PPG (the season projection assumes he starts 34% of remaining games) × `.
11. `'qb-backup'` renders `—` plus the `imp` sub-line, with the exact §3.1 title; `'qb-no-role'` likewise.
12. A valued row with `share: null` keeps the existing title (the current tests already cover it — leave
    them untouched; they must still pass).
13. BACKUP chip: a QB row with `backup: true` and `ownByPlayer` `qbRole: 'starter'` renders no
    `[data-testid="backup-flag"]`; the same row with `qbRole: 'backup'` (or no own entry) still renders it.

Also in `weeklyOwnProjection.test.js`:
14. A QB with `team: 'FA'` (and one with `team: null`) → `qbRole null`, `reason 'no-line'`.

`src/__tests__/weeklyDecisionViewOnly.test.js`: no change; it must still pass (imports still exactly
`./nflStats`; no `projectedPPG:` key).

## 5. Docs (same commit)

- `docs/nav/utils.md` `weeklyOwnProjection.js` row: add `buildQbStartersByTeam(playerMap)` (D3 rule, one
  clause) and, in the `buildOwnProjections` sentence, the QB rule (starter → share-free base per §2.2; backup
  → `'qb-backup'`; no starter → `'qb-no-role'`), the reason order, and the `qbRole`/`share` fields.
- `docs/nav/components.md` `week/LineupTable.jsx` row, OURS clause: add "a QB is valued only as this
  week's starter (at his starter rate), else `—`".
- `docs/signal-registry.md`:
  - row "QB start share (`qbStartShare`, `qbTakeoverBasis`, `qbStarterPPG`)" (`:95`), Current use: append
    "; also read view-only by `/week`'s OURS (`weeklyOwnProjection.js`, P10) to value a QB starting this
    week at his share-free rate when he has no in-season record — never `projectedPPG`".
  - row "QB live start chain (`inSeason.start`; `buildQbLiveStates`)" (`:96`), Current use: append
    "; `start.starterValue`/`fraction` are also read view-only by `/week`'s OURS (P10) to value a QB starting
    this week at his starter rate" (plan gate flag 6).
  - row "Injury designation" (`:70`), Current use: append "; OURS also reads teammates' designations to
    pick each team's starting QB this week (P10)".
  - row "Depth-chart order (`depthChartOrder`) …" (`:134`), Current use: append "; Sleeper
    `depth_chart_order` is read live, view-only, by `/week`'s OURS to pick each team's starting QB this week
    (`buildQbStartersByTeam`, P10)". If that row has no Current-use cell wording to append to, append the
    clause to its last cell — do not restructure the row.
- `docs/navigation.md` `/week` routing row (`:22`), the OURS parenthetical: after "…against the team's own
  earlier average" insert "; a QB counts only as his team's starter this week, valued at his starter rate"
  (plan gate flag 7).
- `CLAUDE.md`: no change.

## 6. Touch list, done-definition, commit

Touch exactly: `src/utils/weeklyOwnProjection.js`, `src/utils/weeklyOwnProjection.test.js`,
`src/components/week/LineupTable.jsx`, `src/components/week/LineupTable.test.jsx`, `docs/nav/utils.md`,
`docs/nav/components.md`, `docs/navigation.md`, `docs/signal-registry.md`, `.claude/tasks/data-repo-backlog.md` (the D-58 bullet
below), and this task file (commit it). **Not** `src/hooks/useWeeklyDecision.js`, `src/App.jsx`,
`src/utils/qbTakeover.js`, `src/utils/inSeasonScoring.js`, `docs/cross-repo-registry.md`.

Done-definition (CLAUDE.md): `npm test`, `npm run lint` (0), `npm run build` (no warnings — the Vite
chunk-size notice predates P4). Paste `grep -rn "PROVISIONAL(" src/` into the hand-back (one new line).

Smoke (the `.claude/launch.json` preview, Anton's league per `docs/architecture.md` → *Smoke-testing*): on
This Week, for every QB row on the lineup and bench report name, team, Sleeper depth order and injury
status, `qbRole`, base, share, implied, factor, OURS, and PROJ. Expected: Mariota (if Daniels is still
`Out`) shows a number near his starter rate × factor — no longer ≈ 5 — and a tooltip starting "Starting QB
this week"; any QB2 behind a healthy starter shows `—` with the `qb-backup` tooltip; a normal incumbent
QB's OURS is unchanged from before (compare against `981b98a` by reading the tooltip arithmetic). Check one
non-QB row is unchanged. Console free of new errors.

Commit: one code commit, message `/week OURS: a QB starting this week is valued at his starter rate; QB2s blank (P10)`,
with the attribution trailer. Push only after verification is clean.

## Cross-repo impact

Touched contracts: **CR-01** (trigger wording only) and **CR-18** (signal-registry Current-use cells, app
side only). Not CR-27 (no chain input, definition or constant changes — §0 D4). Not CR-08/CR-16 (no change
to the Vegas/schedule reads). **No registry text edit in this slice** — it joins the queued D-58 batch.

Session 2 appends one bullet to D-58 in `.claude/tasks/data-repo-backlog.md`:

> - Also pending from P10 (week-ours-qb-starter.md, `<sha>`): CR-01 Triggers — the `buildOwnProjections`
>   parenthetical "(reads `projectedPPG` and the presence of `inSeason`)" becomes "(reads `projectedPPG`,
>   the presence of `inSeason`, `inSeason.start.starterValue`/`fraction`, and `factors.qbStarterPPG`/
>   `qbStartShare`/`qbTakeoverBasis` for a QB starting this week)". Data side: no action beyond the
>   byte-sync.

- **CR-01** (projection snapshot envelope) — a wider read of the scored copy by an existing view-only
  consumer. No envelope change, no `schemaVersion` bump, no snapshot write, no data action. Mirror, quoted
  in full: "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump,
  `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot
  section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** —
  `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or
  renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since
  in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back),
  so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise
  that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player
  `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys
  need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not**
  bump the version. **qb-takeover-wiring:** additive keys, no version bump. A grader must not score a
  `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total
  points or segment it (`grading/anchor-policy.md` boundary 5); the same holds for an `inSeason.ros` that
  carries `start`." — **Answer: envelope unchanged, no bump.** P10 reads `inSeason.start` for display only;
  the boundary-5 grading rule is unaffected (OURS is never captured or graded).
- **CR-18** (signal registry rows) — direction data→app; this slice edits only Current-use cells
  (`docs/signal-registry.md:70,95,96,134`) — no field, source, coverage or ephemeral status changes. Mirror,
  quoted in full: "This entry's data side is the one genuinely open set in the registry — a brand-new ingest
  adds a script the list above cannot already name. The listed sites are every one that exists today; a
  *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own
  side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
  removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
  reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make
  (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's
  `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this
  drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture
  and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot
  edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable." — **Answer: no ingest
  change; `data-catalog.md` untouched; data side no action.**

## 7. Risks Session 2 should not "fix"

- Do not reuse `buildPreseasonQbShares` or `buildQbLiveStates` to pick the starter — the first ignores
  injuries (the bug's cause), the second is last-game-based and lives behind the inSeason firewall. D3 is a
  separate display rule on purpose.
- Do not round `base` — `starterValue` is already r2; the cell formats.
- Do not change `baseKind` semantics or the existing reasons' wording.
- Sleeper's depth chart can lag game-day decisions; a wrong role shows as a blank or a starter number for
  one week. That is the accepted PROVISIONAL cost. Same for a real starter whose Sleeper
  `depth_chart_order` is null while a teammate's is finite: D3 picks the teammate (test 2 locks that in
  deliberately — never guess an order).

## 8. Findings for Anton (reported, not acted on)

- The P10 calibration question (rookie QB "starter level", e.g. Mendoza 23.2) is untouched here; this slice
  makes OURS *use* that starter level for any rookie starting this week, so the calibration matters more
  once it ships.
- **Latent seam defect, not P10's (plan gate flag 4).** `buildScoringPosteriors` takes `projPrior` from a
  frozen snapshot's `projectedPPG` but decides "chain row" from the *live* `factors.qbTakeoverBasis`
  (`inSeasonScoring.js:190-196,239-241`). A QB frozen as `chain` (share-weighted) who is now live
  `original`/`incumbent` would get the share-weighted frozen value as his unshared prior — the Mariota
  symptom again, in the ROS everywhere, and in OURS via §2.2's second branch. **Unreachable in 2026:** a
  frozen prior needs a pre-kickoff snapshot dated ≥ `PRIOR_MODEL_FROM` (2026-10-05), so every 2026 read is
  `model-changed`. It becomes live from the 2027 kickoff. Fix belongs in the seam (use the frozen
  `starterPPG` when the frozen row was share-weighted) — a separate item before 2027, not this slice.

## Review record — plan gate round 1 (2026-10-04)

plan-reviewer: 7 flags. All verified against source; Session 1 decisions:
1. CR-01 Mirror quoted short → **applied**, quoted in full with an answer.
2. CR-18 Mirror not quoted → **applied**.
3. BACKUP chip contradicts "Starting QB" on a promoted QB2 (`weeklyLineup.js:93-99`) → **applied** as D5 /
   §3.4, in `LineupTable` (the lineup util may not import OURS).
4. Frozen-prior chain→original path breaks "inSeason without start = unshared" → **recorded** in §8;
   unreachable this season (PRIOR_MODEL_FROM gate), the defect is in the seam.
5. Teamless QB would read `'qb-no-role'` → **applied** (role null for null/`'FA'` team, test 14). Null-order
   real starter → **accepted** as a stated risk (§7).
6. Signal-registry row `:96` owns `inSeason.start` → **applied** (§5).
7. `docs/navigation.md:22` OURS description → **applied** (§5, touch list).

## Verification record (Session 1, 2026-10-04, `981b98a..0e9306e`)

Session 2: `b8a1e5b` (code), `0e9306e` (SHA fill into the D-58 bullet — declared deviation, accepted: the
bullet needs the SHA). Session 1 re-ran the full suite on `0e9306e`: 142 files / 2815 tests green; `npm run
lint` clean. Smoke (Session 2): Mariota OURS 15.0 (= 14.3 × 1.05; was ≈5.1), PROJ 17.0, tooltip "Starting
QB this week…", no BACKUP chip; Daniels `OUT`. QB2-behind-healthy-starter and unchanged-incumbent paths are
unit-tested only (no such QB on the roster).

implementation-reviewer: no blocking issues; 4 flags. Decisions:
1. Chip render site (`LineupTable.jsx:202`) now renders the heuristic `qbRole` untagged → **fix** (1.1).
   Plan-level gap, not Session 2's.
2. Frozen-input test skips the D1 `inSeason.start` branch → **fix** (1.2).
3. Test 2 doesn't prove a finite-order teammate beats a null-order QB, which §7 claims is locked in → **fix** (1.3).
4. Commit messages carry no CR-01/CR-18 Mirror answers → **no action**: both answers are recorded in this
   file's `## Cross-repo impact`, which is committed; the actionable CR-01 part is in the D-58 bullet.
Minor (reviewer, unflagged): `docs/nav/utils.md:66` opens with "`value = projectedPPG × factor`" → **fix** (1.4).

## Fix pass 1

Touch exactly: `src/components/week/LineupTable.jsx`, `src/utils/weeklyOwnProjection.test.js`,
`docs/nav/utils.md`. No behaviour change. One commit:
`Fix pass 1: P10 — PROVISIONAL tag on the BACKUP-chip role read; frozen D1 and null-order tests; utils.md wording`.
Done-definition: `npm test`, `npm run lint`, `npm run build`; paste `grep -rn "PROVISIONAL(" src/` (29 lines,
one new). No smoke needed.

1.1 `src/components/week/LineupTable.jsx` — on the line directly above
`{r.backup && ownByPlayer?.[r.player_id]?.qbRole !== 'starter' && (` (`:202`), add a JSX comment carrying the tag:
`{/* PROVISIONAL(heuristic): BACKUP chip hidden for a QB starting this week · reads OURS's qbRole (lowest Sleeper depth order not listed out), no game-day confirmation · a confirmed weekly-starter source would make it real */}`
It must stay a single line, matching `grep -rn "PROVISIONAL("`.

1.2 `src/utils/weeklyOwnProjection.test.js`, the `'never mutates frozen QB inputs'` case (`:229-233`): add a
second assertion block in the same `it` with a deep-frozen scored projection carrying the D1 branch —
`{ projectedPPG: 4.9, inSeason: Object.freeze({ start: Object.freeze({ starterValue: 14.3, fraction: 0.34 }) }), factors: Object.freeze({ ...chain }) }`
for `p1` with the same frozen `pm` — and assert `toMatchObject({ qbRole: 'starter', base: 14.3, share: 0.34, reason: null })`
and that `sp.p1.inSeason.start.starterValue` is still `14.3`. Leave the existing assertion in place.

1.3 Same file, `describe('buildQbStartersByTeam')`, in the "ties go to the smaller id; null order…" case
(`:154`): add
`expect(buildQbStartersByTeam({ a: qb('KC', null), b: qb('KC', 2) }).get('KC')).toBe('b')`
with a one-line comment: `// §7: a null-order QB never starts, even over a finite-order teammate`.

1.4 `docs/nav/utils.md:66`, the `buildOwnProjections` clause: replace "`value = projectedPPG × factor`" with
"`value = base × factor` (`base` = `projectedPPG`, or for a QB starting this week his share-free starter rate)".
Nothing else in the row changes.

**Fix pass 1 result.** Applied as `7702dbd` (the three named files only). Session 1 re-ran on `7702dbd`: 142 files /
2815 tests green, lint clean, build clean bar the pre-existing chunk-size notice, `PROVISIONAL(` count 29.
implementation-reviewer re-run (once) on `0e9306e..7702dbd`: clean, no flags. Awaiting Anton's sign-off, then push.
