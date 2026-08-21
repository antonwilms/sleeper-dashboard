# Slice 4c — Pop-up: Environment, and the red-zone share row

**Program:** [dp-v2.md](dp-v2.md). Follows
[dp-v2-4b-usage-availability.md](dp-v2-4b-usage-availability.md) (landed `eab9fe7`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `eab9fe7` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

**This is the last piece of Slice 4** and the only one that touches data plumbing: a multi-season
`teamContext` load and one new `ProfileDataContext` key. Both were deferred here on purpose — 4b was
kept `App.jsx`-free precisely so this slice could own them.

---

## 0. Confirmed against live source (`eab9fe7`)

| Fact | Site |
|---|---|
| Seven sections today: `overview`, `game-log`, `distribution`, `usage`, `availability`, `drivers`, `why-next` — in both `SECTIONS` and the JSX | `dp/PlayerDetailModal.jsx:22-28` |
| Slice 2's `teamContext` effect loads **`dataSeason` only**, into year-keyed state with a merging setter. **Its span is `App.jsx:882-891`** — `:895` is inside the *gamelogs* effect, which this slice must not touch | `App.jsx:882-891` |
| **4b's shared axis is the PLAYER's last five seasons with data** — `careerHistory.slice(-5)`, explicitly "not 5 consecutive calendar years" | `PlayerDetailModal.jsx:86-93` |
| `UsageEfficiencySection` is **props-only with a fixed list** `{ careerStats, playersMap, playerId, position, axisSeasons }`, and `PlayerDetailModal.jsx:69` destructures a fixed context set | `dp/UsageEfficiencySection.jsx:16`; `PlayerDetailModal.jsx:69` |
| **TWO identical strict section-id assertions exist**, byte-for-byte | `PlayerDetailModal.gameLogDistribution.test.jsx:158` and `PlayerDetailModal.usageAvailability.test.jsx:128` |
| `getTeamSeasonRows(loaded, team)` → `games[]`; takes the **whole loader result**, not `.teams` | `api/teamContext.js:121` |
| `getTeamWeekRow(loaded, team, week)` → one row or `null` | `api/teamContext.js:131` |
| Team-week rows carry `off` and `def` blocks with **components and rates both stored** — rates are never summable | `api/teamContext.js:26-34`; CR-10 |
| **`games[]` is continuous REG→POST** and every row carries `seasonType` | `api/teamContext.js:26-30` |
| **No app code reads any `off.*`/`def.*` teamcontext field today**, and there is no teamcontext fixture — this slice is the family's first shape consumer, so the field names below cannot be checked against `src/` | grep over `src/` |
| `computeHistoricalTeamTotals(careerStats, playerMap)` → **`{ [season]: { [team]: { rushAtt, rec, recTgt, rushRz, recRz } } }`** — per season, RZ included | `utils/teamContext.js:242-256` |
| It is an `App.jsx` memo and is **not** on `ProfileDataContext` | `App.jsx:192-195`; `context/ProfileDataContext.jsx` |
| `ProfileDataContext` currently provides **thirteen** keys | `context/ProfileDataContext.jsx`; `CLAUDE.md` |
| `resolvePlayerTeam(..., season)` returns **era-accurate** codes, and `teamContext` is keyed in the **same** era-accurate domain — they match directly, **no remap needed** (unlike gamelogs) | `utils/playerTeam.js:65`; `data-catalog.md` teamcontext row |
| `teamcontext` is **1.0 MB/season**, 2012–2025, permanently cached per year | measured `fb8c2dd` |
| Slice 1 primitives: `SeriesBars` (`signed`/`scaled`, `domain`), `CoveragePips`, `DegradedBlock`, `DefinitionPopover` | `src/components/dp/` |
| 4b established the **shared season axis** pattern — metrics projected onto one axis with `null` for gaps | `dp/UsageEfficiencySection.jsx` |

---

## 1. Scope

1. Extend Slice 2's `teamContext` effect to load a **five-season window** (§2).
2. Thread `historicalTeamTotals` onto `ProfileDataContext` — thirteen keys → **fourteen** (§3).
3. New **Environment** section, between `availability` and `drivers` (§4).
4. Add the **red-zone share** row to 4b's existing Usage & efficiency section (§5).

### 1.1 Must NOT do
- **Do not build `EPA per opportunity`.** Cut permanently in `fb8c2dd` on measurement: gamelogs is
  8.2 MB/season, so a five-season series costs ~33 MB to draw five bars, and `advStats` — the only
  cheap season-aggregated alternative — carries no EPA. If it is wanted, the route is a data-repo ask
  to add EPA to the advstats pack, not a client fetch.
- **Do not extend the gamelogs or schedule loads.** Only `teamContext` widens here.
- **Do not touch `computeHistoricalTeamTotals`.** It is projection-side and correct; this slice only
  *reads* it. (See §5 for why the read is safe.)
- **Nothing here may reach projection or scoring.** `teamContext` is under a view-only guard with a
  test; keep it that way.

---

## 2. The multi-season load

**Extend the existing effect (`App.jsx:882-891`); do not add a second one.** Slice 2 built the state
year-keyed with a merging functional setter specifically so this would be additive.

```js
const ENV_SEASONS = 5
// …replacing the effect body's single-season load:
const seasons = allSeasons.slice(-ENV_SEASONS)
Promise.allSettled(seasons.map(y => loadTeamContext(y).then(r => [y, r])))
  .then(results => {
    if (cancelled) return
    const pairs = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    if (pairs.length) setTeamContextByYear(prev => ({ ...prev, ...Object.fromEntries(pairs) }))
  })
```

Four things the first draft got wrong, all of which the implementer would otherwise inherit:

- **`Promise.allSettled`, not `Promise.all`.** The draft claimed "a missing season degrades to one
  absent key rather than failing the batch". That is false for `Promise.all`. `loadTeamContext`
  returns its graceful `EMPTY` for manifest-absent / fetch-fail / shape-mismatch / below-floor
  (`api/teamContext.js:82,93,98`), but it does **not** wrap `getCacheRecord` / `setCacheWithMeta` — an
  IndexedDB rejection propagates, and under `Promise.all` one rejection means **no season is written
  at all**. That is a strict regression from today's one-season-loses-one behaviour.
- **`dataSeason` becomes unused** once the single-season call goes. It is bound at `:886` and used
  only by that call and its setter key. Leaving it is a `no-unused-vars` **error**
  (`js.configs.recommended`, `eslint.config.js:16`), and §10 requires zero lint problems. Remove it,
  or keep it only if something else in the effect still needs it.
- **Do not name the variable `window`.** It shadows the browser global inside `App.jsx`.
- One merged write, not five — five sequential setter calls would re-render the tree five times.

The `cancelled` flag still guards the setter; the Strict-Mode invariant is unchanged.

**Eager, not lazy — a deliberate call.** 5 MB on first visit, permanently cached, matching how every
other side-load in the file behaves (the app already pulls 8.2 MB of gamelogs the same way). A lazy
path keyed on the pop-up opening would need a loading state the design has no treatment for. **Record
for Slice 6:** Teams detail wants fourteen seasons (~14 MB), which is where lazy starts to earn its
complexity — reconsider there, not here.

## 3. `historicalTeamTotals` onto the context

Add it to the provider value in `App.jsx`. Thirteen keys → fourteen.

**Why this and not a view-only equivalent.** 4b cut red-zone share because the view-only
`buildTeamShareTotals` has no RZ denominator, and extending it would inherit its `playerMap`
membership gate — which drops directory-absent (retired) ids, so older seasons lose proportionally
more denominator and shares read systematically **high** in exactly the seasons the delta is measured
against. `computeHistoricalTeamTotals` keeps those ids. That divergence is deliberate and documented
in both functions' headers; for a share whose whole point is a multi-season trend, the unbiased
denominator is the correct one.

Update the key count in `CLAUDE.md` (the `src/context/` table **and** Patterns §2) and in
`ProfileDataContext.jsx`'s own header comment — the two real sites, per Slice 2's §6.

---

## 4. Environment section

New section id `environment`, label `Environment`, inserted between `availability` and `drivers` **in
both `SECTIONS` and the JSX** — 4b and 4a both established that these are two separate edits that must
agree.

### 4.1 Four metrics, each a five-season series
Per metric: label → `SeriesBars` over the season window → current value → league median → league rank
→ a one-line note → the field expression in a `DefinitionPopover`.

**Use these expressions exactly.** They were corrected in design round 6 after three of them were
found to be wrong, and the wrong ones are plausible enough to re-derive by accident:

| Metric | Expression | Mode |
|---|---|---|
| **PROE** | `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)` | `signed` |
| **Pace** | `Σ off.neutralSeconds ÷ Σ off.neutralGaps` | `scaled`, **lower is better** |
| **Success rate** | `off.successes ÷ off.successPlays` | `scaled` |
| **Red-zone TD rate** | `off.rzTdTrips ÷ off.rzTrips` | `scaled` |

Traps, each of which produces a confident wrong number rather than an error:
- **PROE is a difference, not a ratio.** `proeXpassSum ÷ proePlays` alone is the *expected* pass rate
  (~0.57), not PROE.
- **The denominator is `proePlays`, NOT `proePassPlays` — and the app's own comment says otherwise.**
  Both fields exist on the row. Verified arithmetically against `teamcontext/2025.json` (ARI, week 1:
  `plays 61`, `passPlays 37`, `passRate 0.607`, `proePlays 61`, `proePassPlays 37`,
  `proeXpassSum 36.561`, stored `proe 0.007`):
  - `37/61 − 36.561/61 = +0.0072` → **matches the stored `proe`**
  - `37/61 − 36.561/37 = −0.3816` → nonsense
  `src/api/teamContext.js:34` pairs them wrongly — *"the rows ship the counting components
  (epaSum/epaPlays, **proeXpassSum/proePassPlays**, neutralSeconds/neutralGaps, …)"*. **Fix that
  comment in this slice.** It is the only in-repo record of these field pairings, it is the first
  thing an implementer or reviewer will check, and it points at the −0.38 error.
- **`successPlays` is the denominator field.** `successPlays ÷ plays` returns ≈1.0 for every team in
  every season.
- **There is no `off.epa` field** — it is `epaSum` / `epaPlays`.
- **Never sum a stored rate across weeks.** Sum the components, then divide. This is the data repo's
  standing rule and the reason both components and rates are stored.

### 4.2 League median and rank — same file, no extra fetch
Each season's `teamContext` file holds **all 32 teams**, so the median and rank for a metric come from
aggregating that same loaded object across `teams`. No additional load, and the distribution is
always the same season as the value.

**Filter to `seasonType === 'REG'` before aggregating anything** — here and in §4.4. `games[]` is
continuous REG→POST, so a Super Bowl team contributes ~20 rows against a non-playoff team's 17.
Unfiltered, plays-per-game and points-per-game are diluted for exactly the best teams, and the league
median and rank inherit that. 4a set this precedent explicitly (`utils/gameLog.js:163`); follow it.

Rank must state its direction alongside the number (`6th of 32`), and for **pace** — where lower is
better — the rank must be computed accordingly. A silently inverted rank is the most likely defect
here.

### 4.3 The series is the PLAYER's environment, not one team's
Resolve the team **per season** via `resolvePlayerTeam(..., season)`. A player who changed teams has
bars from different franchises, which is correct — it is his environment history — but it **must be
labelled**, or a reader takes "PROE" for one team's trend. Put the per-season team on the axis or in
the row's meta.

**Environment uses its OWN axis — the loaded league window — not 4b's player axis.** This is a
deliberate divergence and the draft's "reuse 4b's alignment pattern" was ambiguous about it. 4b's
`axisSeasons` is `careerHistory.slice(-5)`, the player's last five seasons **with data**, explicitly
not five consecutive years (`PlayerDetailModal.jsx:86-93`). §2 loads the last five **league** seasons.
For a player whose five played seasons predate the window those sets are disjoint, and every
Environment bar would be a void slot.

So: axis = the loaded seasons, newest last. Per season, resolve his team; a season he did not play is
a void slot with no team. That also makes the chart mean something coherent — "the environment over
the last five seasons, and where he was in it" — rather than mixing two different time bases in one
pop-up.

Reuse 4b's *alignment mechanics* (project onto a shared axis, `null` for gaps); do not reuse its
*axis*.

### 4.3a Whole-section degraded path
Per-season void slots are not enough. If the player played **none** of the loaded seasons, or no
season's team resolves, the section renders a `DegradedBlock` rather than five voids above four empty
splits. 4b set this precedent (`UsageEfficiencySection.jsx:38-44` returns
`<DegradedBlock kind="not-yet-accruing">` on an empty axis) — match its shape, with copy naming the
loaded window so the reader knows why.

### 4.4 Splits block
Four rows beneath: `OFF EPA/PLAY` (with its pass/rush split), `PLAYS / GAME`, `POINTS / GAME`,
`OWN DEF · EPA ALLOWED`. Current season only — these are context, not trends.

- `off.epaSum ÷ off.epaPlays`, and the split from `passEpaSum ÷ passEpaPlays` / `rushEpaSum ÷ rushEpaPlays`
- `Σ off.plays ÷ games`, `Σ off.pointsScored ÷ games`
- `def.epaSum ÷ def.epaPlays` — **note the polarity**: negative defensive EPA allowed is *good* for the
  defence, which is *bad* for the player's own pass volume. Label the direction; do not colour it by
  the same rule as the offensive rows.

### 4.5 `DISPLAY ONLY`
Same badge as 4b's usage section, same reason: `teamContext` is guarded view-only by
`teamContextViewOnly.test.js` and must never reach a projection or a score.

---

## 5. Red-zone share — the row 4b cut

Add to **4b's existing Usage & efficiency section**, on its shared season axis:

- **WR / TE:** `rec_rz_tgt` ÷ `historicalTeamTotals[season][team].recRz`
- **RB:** `rush_rz_att` ÷ `historicalTeamTotals[season][team].rushRz`

Team per season from `resolvePlayerTeam(..., season)`, the same resolution the rest of the section
uses. A zero or absent denominator renders `—`, never `0`.

**Two plumbing edits the draft left implicit.** `UsageEfficiencySection` is props-only with a fixed
list — `{ careerStats, playersMap, playerId, position, axisSeasons }` (`:16`) — and
`PlayerDetailModal.jsx:69` destructures a fixed context set. Both need `historicalTeamTotals` added:
destructure it from `useProfileData()` in the modal, pass it as a new prop. Keep the prop list
explicit; do not switch either component to a spread.

**QB gets no red-zone share row** — `pass_rz_att` exists, but a QB's share of his own team's red-zone
pass attempts is ≈1.0 and carries no information, the same reasoning that gates QB out of snap share.

**Do not compute this as an average of per-game shares.** Player-season total ÷ team-season total, the
way every other share in that section works.

---

## 6. Tests

- **PROE** — assert against a hand-built team-week fixture that the value is the *difference*, and
  that feeding `proeXpassSum ÷ proePlays` alone would give a different (wrong) answer.
- **Success rate** — assert it is not ≈1.0; that is the signature of the `successPlays ÷ plays` error.
- **Rate aggregation** — a two-week fixture where summing the stored rates and dividing gives a
  different answer from summing components; assert the component path.
- **Pace rank direction** — lower value ranks better.
- **League median/rank** — computed across all teams in the loaded season, not across the window.
- **Traded player** — bars come from different teams per season, and the per-season team is rendered.
- **Missing season** — an absent or `complete === false` season is a void slot on the shared axis, not
  a zero and not a collapsed bar.
- **RZ share** — player-total ÷ team-total, not a per-game average; zero denominator renders `—`; QB
  has no row.
- **Def EPA polarity** — the direction label is correct for a negative value.
- **TWO strict section-id assertions must be extended, not one** —
  `PlayerDetailModal.gameLogDistribution.test.jsx:158` **and**
  `PlayerDetailModal.usageAvailability.test.jsx:128`. Both are byte-identical `toEqual`s on the full
  seven-id array, so both fail once `environment` is inserted. These are required edits preserving a
  strict-order intent, not tests weakened to pass. Everything else should pass unedited.
- **REG filtering** — a fixture with POST rows gives a different plays-per-game than the REG-only
  path; assert the REG-only answer.
- **Whole-section degraded** — a player with no seasons inside the loaded window renders a
  `DegradedBlock`, not five void slots.

---

## 7. Smoke

- A player on a **high-PROE** team and one on a run-heavy team — the values differ in the expected
  direction and the rank matches.
- A **traded** player — bars span teams and the per-season team is visible.
- **Pace** — confirm the rank reads correctly for a fast team (lower seconds should rank *better*).
- A season with **no `teamContext`** — void slot, not a zero.
- The index now lists **eight** entries and still scrolls rather than swaps.
- Console shows the five `[teamContext] … year=…` lines, one per season in the window.
- No console errors.

---

## 8. Docs

| File | Edit |
|---|---|
| `docs/ui.md` → *Player detail pop-up* | The Environment section, the per-season-team framing, the RZ share row, and the eight-section list |
| `CLAUDE.md` `src/context/` table + Patterns §2 | Thirteen keys → **fourteen** |
| `ProfileDataContext.jsx` header | Same |
| `CLAUDE.md` `src/api/` table | `teamContext.js` row — now loaded across a five-season window, and **rendered** |
| `docs/signal-registry.md` | `teamContext`'s Current-use is the **last** row still reading "no rendering component yet" (verified `855aded`). This slice closes it — **CR-18 fires** |

---

## 9. Cross-repo impact

**Three entries fire.** All three `Mirror` texts below, as Session-1 deliverables.

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — Mirror:**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a *new*
> one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side
> against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
> removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
> make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
> family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
> when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
> snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later.
> The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**CR-11 · Snap & red-zone usage stat keys — Mirror:**

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they
> are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the
> projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators
> go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and the data repo's
> own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this
> registry entry is the only thing recording it.

**CR-10 · nflverse teamcontext (view-only) — Mirror:**

> Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is
> `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week
> rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored
> rates. View-only on both sides. Team-key domain is CR-16.

**Why CR-10 fires:** this slice is the family's **first rendering consumer** and the first code
outside `src/api/teamContext.js` to read the served `off.*` / `def.*` shape. CR-10's Mirror is also the
authority for §4.1's own never-sum-a-rate rule.

**Why CR-11 fires:** §5 adds a new app-side reader of `rec_rz_tgt` / `rush_rz_att` — the RZ share
numerator, read from `careerStats` in a new component.

**Direction is `data→app` for CR-11 and CR-18** — the draft said "app→data-nothing" for both, which
contradicts their own `Direction` fields (`cross-repo-registry.md:131` and `:187`). Check CR-10's
field rather than assuming.

**Two `[registry-stale]` findings to fix in this change**, since it edits the registry anyway:
- **CR-10's app-side `Triggers`** name only `src/api/teamContext.js`, `dataStore.js`'s validator and
  `playerTeam.js` — omitting the `loadTeamContext` call site (`App.jsx:887`) and the provider key
  (`App.jsx:578`), both of which the entry's own prose records. Its prose is also factually stale:
  *"Still no rendering consumer — reserved for dp-v2 Slice 4b's team-joined sections"* — 4b consumed
  nothing App-level, and this slice is the consumer.
- **CR-11's app-side `Triggers` are already one slice behind.** 4b added three readers that were never
  recorded: `utils/usageEfficiency.js:74`, `dp/UsageEfficiencySection.jsx:31,119`, and
  `hooks/usePlayerProfile.js:176`. Add them alongside this slice's own.

---

## 10. Done-definition

- [ ] The **existing** effect (`:882-891`) widened; **no second effect**; one merged write
- [ ] **`Promise.allSettled`**, not `Promise.all` — one rejection must not lose every season
- [ ] `dataSeason` removed if now unused (lint is an **error**, not a warning); no variable named `window`
- [ ] `cancelled` flag still checked before the setter
- [ ] Context at **fourteen** keys, updated in all three doc sites
- [ ] `computeHistoricalTeamTotals` **unchanged** — read only
- [ ] PROE is a **difference** and uses **`proePlays`**; `api/teamContext.js:34`'s wrong pairing fixed
- [ ] Success rate is **not** ≈1.0; no `off.epa` reference anywhere
- [ ] **REG-only filtering** before every aggregation, median and rank
- [ ] No stored rate summed across weeks — components summed, then divided
- [ ] Pace rank direction correct (lower is better)
- [ ] Median/rank computed within each season, across all 32 teams
- [ ] Per-season team resolved and **labelled**; traded players read correctly
- [ ] Environment uses the **loaded league window** as its axis, not 4b's player axis
- [ ] Missing seasons are void slots; **no seasons in window → whole-section `DegradedBlock`**
- [ ] `historicalTeamTotals` threaded through both the modal and `UsageEfficiencySection`'s prop list
- [ ] RZ share: player-total ÷ team-total; QB has no row; zero denominator → `—`
- [ ] `DISPLAY ONLY` badge; `teamContextViewOnly.test.js` still green
- [ ] **Both** section-id order assertions extended (§6)
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect the standing three
- [ ] Smoked per §7
- [ ] Hand-back quotes **all three** — CR-10, CR-11, CR-18 — with correct `Direction` fields
- [ ] Both `[registry-stale]` trigger-list gaps fixed (§9)

---

## 11. Hand-back should report

- The five console lines, with row counts per season.
- The traded player you checked and which teams his bars span.
- The PROE value for one team, worked through by hand, proving the difference form.
- Whether the pace rank reads correctly for a fast team.
- Confirmation that `computeHistoricalTeamTotals` has a zero diff.
- Anything in §0 that had drifted from `eab9fe7`.

---

## 12. Plan-review record (2026-08-21)

Twelve flags. **Eleven applied; one rejected with proof, and rejecting it prevented a real bug.**

**The rejected flag — and the defect it did surface.** Review flagged §4.1's PROE denominator
`off.proePlays` as contradicting `src/api/teamContext.js:34`, which pairs `proeXpassSum` with
`proePassPlays`. Both fields exist on the row, so this was settleable only against real data. Worked
through ARI week 1 of `teamcontext/2025.json`: `37/61 − 36.561/61 = +0.0072`, which **matches the
stored `proe` of 0.007**; `37/61 − 36.561/37 = −0.3816`, which is nonsense. **The task file was
right and the app's comment is wrong** — and since that comment is the only in-repo record of these
pairings, it is precisely what would send an implementer to the −0.38 answer. Fixing it is now part of
this slice.

**The rest were real, and four were structural.** `Promise.all` does not give the graceful-degradation
guarantee the draft claimed — `loadTeamContext` doesn't wrap its IndexedDB calls, so one rejection
loses *every* season, a regression from today's behaviour; `allSettled` is the shape the promise
needs. The proposed rewrite leaves `dataSeason` unused, which is a lint **error** against a
zero-problems done-definition, and named a variable `window`. **The axis was genuinely ambiguous**:
§2 loads the last five *league* seasons while 4b's axis is the player's last five seasons *with data*
— disjoint for older players, so every Environment bar would have been void. Environment now declares
its own axis. And REG-vs-POST was unspecified for aggregation, which would dilute plays- and
points-per-game for exactly the playoff teams and carry that into the median and rank the section
calls its most likely defect.

Smaller but load-bearing: there are **two** identical strict section-id assertions, not one; the RZ
row needed threading through two fixed prop lists the draft left implicit; and there is no
whole-section degraded path, only per-season voids.

**Cross-repo was wrong twice.** Three entries fire, not two — **CR-10** was missed entirely, and this
slice is that family's first rendering consumer. And `Direction` is **`data→app`** for CR-11 and
CR-18, not the `app→data-nothing` the draft asserted for both. Two `[registry-stale]` trigger-list
gaps are folded in, including three readers 4b added and never recorded.

**Method note worth keeping:** this review was asked not to predict test outcomes without running
them, after two earlier reviews did exactly that and were wrong. It complied — quoting the assertion
lines and stating it could not run them — and its test-related flags were correct this time.

