# Slice ii — Player detail pop-up, minimal

**Status:** implementation-ready task file (handoff artifact), written 2026-08-12 against live
source at working-tree state after Slice i landed, then revised after a `plan-reviewer` pass that
raised **16 flags — all verified against source and all fixed** (see §11, which is worth reading
first: two of the first draft's claims were outright wrong and four were live bugs). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written — **except** the `dynastyScore.js` edit in §2, which CLAUDE.md's model-routing
table gates to opus; see §2.4 for how to handle that. If anything is ambiguous or contradicts live
code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — read §2 (data contract),
§2.4 (the `PROVISIONAL` convention), §3 (reuse inventory) and §5 before implementing.
**Predecessor:** [dynasty-portfolio-1b-i-foundation.md](dynasty-portfolio-1b-i-foundation.md) —
§1.1's dark-only background rule is load-bearing here.

**This slice:** hoist a player-detail overlay above the router so it is mountable from any surface,
backed by the existing `usePlayerProfile` hook and `ProfileDataContext`, rendered in the 1b visual
language (identity row, four tiles, career-PPG/projection chart, two lower panels, right rail).
Additive: expose the five dynasty-score component weights (§2). **End state: the pop-up exists,
is fully rendered and unit-tested, and opens via an App-level callback — but nothing calls that
callback yet, because Portfolio/Market are still placeholders. Read §1.4 before starting; it is
the one thing about this slice that will feel wrong if you don't.**

**Explicitly NOT this slice (deferred, with owning slice):**
- **Tab strip / multi-open / compare matrix / "+ Add player to compare" dropdown → Slice v.**
  Single player at a time. `comparisonList`, `addToComparison`, `removeFromComparison`,
  `clearComparison` and `ComparisonTray` are **untouched** — do not repurpose them here.
- **Any change to `/players`** (`PlayersSurface`, `PlayersTab`, `OutlookTab`, `NflStatsTab`,
  `PlayersDataTable`) → Slice iv. The Explorer keeps its existing inline `PlayerProfile` in its
  existing skin. See §3.
- **Portfolio/Market screen content → Slices iii/iv.** No rows, no tables, no click targets.
- **Chrome recolor → unscheduled.** `TopBar`/`NavRail`/`BottomTabBar` untouched, as in Slice i.
- **Retiring `SpiderChart.jsx`** → Slice v (it still has a consumer: `PlayersTab`'s profile).

---

## 0. Confirmed against live source

Line numbers are from the post-Slice-i working tree.

- `src/context/ProfileDataContext.jsx` (11 lines) — exports `ProfileDataContext` and
  `useProfileData`. No provider of its own; consumers supply the value.
- **Two provider sites exist today**, both inside the `/players` subtree, both passing a **ten-key**
  value object: `src/components/PlayersTab.jsx:2243` and
  `src/components/players/PlayersDataTable.jsx:72` (its comment at `:71` says "10-key value object"
  explicitly). The ten keys: `careerStats`, `playersMap`, `playerRows`, `positionPeakPPG`,
  `ktcMap`, `historicalShares`, `collegeStats`, `seasonProjections`, `enrichmentMap`, `advStats`.
  **Note `playersMap` is the context key but `playerMap` is the App.jsx prop name** — `PlayersTab`
  renames it in the provider value (`playersMap: playerMap`). Do not propagate the typo-looking
  mismatch by accident; match the context's key names.
- `src/components/players/PlayersDataTable.jsx:70-84` — the existing mount pattern: a guard
  (`selectedPlayerId && profileContextValue?.careerStats`), then `ProfileDataContext.Provider` >
  backdrop `<div className="fixed inset-0 bg-black/20 z-40" onClick={onCloseProfile} />` >
  `<PlayerProfile key={selectedPlayerId} … />`. This is the shape to hoist.
- `src/components/PlayersTab.jsx:298` — `PlayerProfile({ playerId, onClose, onSelectPlayer,
  comparisonList = [], addToComparison, removeFromComparison })`, exported. It destructures ~34
  fields from `usePlayerProfile(playerId)` (`:299-334`) and owns four pieces of local UI state
  (`weeklyOpen`, `focusSeason`, `activeTab` — `'stats'|'dynasty'|'team'` — and `breakdownOpen`,
  `:336-339`). It also reads `useProfileData()` directly at `:340`.
- `src/hooks/usePlayerProfile.js` (248 lines) — returns everything the pop-up body needs:
  `player`, `dynastyScore`, `ownership`, `ktcValue`, `divergenceSignal`, `careerHistory`,
  `careerAvgPPG`, `comps`, `projectedPPG`, `positionPeers`, `projection`, `nextSeasonRank`,
  `positionPeakPPG`, plus ranks and college/depth/advstats extras. **`ownership` is
  `playerRow?.ownerTeamName ?? null` (`:161`)** — a team *name*, not a boolean. Rendering the
  mock's "owned by you" therefore needs `myTeamName` as well; see §1.3.
- `src/App.jsx:963-995` — the route table (post-Slice-i). `:970-989` shows the `PlayersSurface`
  call site, which already has **every one of the ten context values in scope** at that point in
  the tree — so hoisting the provider requires no new state, only relocation.
- `src/App.jsx:52` `LS_COMPARISON = 'comparison-list'`; `:123-147` `comparisonList` state and its
  three mutators; `:868` `clearComparison()` in the league-reset path. **All untouched this slice.**
- `src/utils/dynastyScore.js` — the composite statement opens at `:921`, with the five weight terms
  at **`:922-926`**: `ageAdjScore*0.28 + trajectoryScore*0.25 + currentLevelScore*0.22 +
  effectiveReliability*0.10 + opportunityScore*0.15`. `effectiveReliability` is computed at
  **`:916-918`** (`isTdReliant ? round(reliabilityScore * 0.90) : reliabilityScore`). The returned
  `components` object is at `:1024-1028` and carries `{ value, … }` per component —
  **`reliability.value` is `reliabilityScore`, the pre-penalty number, not `effectiveReliability`.**
  No `weight` key exists on any component today.
- **`components` is `null` on SIX return paths**, not two: `:631` (non-skill position — this one
  also returns `signals: null`), `:695` (prospect), `:721` (unproven vet), `:751` (stale data),
  `:784` (data gap), `:952` (non-finite composite). **The "Limited Data" paths (`:751`, `:784`) and
  the non-finite path (`:952`) are the ones a real roster hits most often** — this is not a
  rookies-only edge case. See §4's empty-state requirements.
- `src/hooks/usePlayerProfile.js` further nulls the modal must survive:
  **`dynastyScore` itself is `null`** for any id absent from `playerRows` (`:106`), and
  **`projection` is `null`** whenever `seasonProjections` has not loaded or has no entry for the
  player (`:151`) — that one feeds the Next-season tile, the projection bar *and* the "Why next
  season" chips. `advStatsRow`/`advStatsSeason` are also null-guarded reads (`:172-173`).
- `src/utils/outlookConsistency.js:59` — `computeConsistency(careerStats, playerId)`, returns
  `null` when there is no qualifying season (`:71`). View-only, safe to call from the pop-up.
  **It also returns a non-null object whose `sd` is `null`** when pooled games fall below
  `MIN_POOLED_GAMES` (`:83`) — so a null-object check alone does not protect the Floor-risk tile.
- `src/components/PlayersTab.jsx:369-373` — the live Explorer profile **already renders all five
  component weights as hard-coded display strings** (`weight: '28%' … '10%'`), in the mock's row
  order with correct labels. Relevant to §2.1.
- `eslint.config.js:12` — extends `js.configs.recommended` with only a `no-empty` override
  (`:20-22`), so **`no-unused-vars` is active as an error**; an unused destructured prop fails lint.
- **Overlay z-index convention:** backdrop `z-40` / panel `z-50` (`PlayersTab.jsx:1622`/`:1625`,
  `:2244`, `PlayersDataTable.jsx:73`). `BottomTabBar` is a fixed **`z-40`**
  (`BottomTabBar.jsx:13`), so an unlayered overlay renders *under* the mobile tab bar.
- **Design source:** `docs/design_handoff_dynasty_portfolio/README.md` → *Screen: Player detail
  (pop-up)*, and `Sleeper Dashboard.dc.html` **lines 1020–1200** — `:1020` is the scrim, `:1021`
  the panel, `:1081-1082` the two actions, `:1101` the career chart, `:1117` "What drives the
  score", `:1135` "Why next season", `:1160` "POSITION IN PORTFOLIO", `:1183` "RANK THIS SEASON".
  Read for layout/hex/copy only.

---

## 1. Architecture

### 1.1 Hoist the provider

Wrap the `<Routes>` block in `src/App.jsx` (`:963-995`) in a `ProfileDataContext.Provider`, using a
`useMemo`'d ten-key value identical in shape to `PlayersTab.jsx:2243`. Every value is already in
scope at that point.

**Use `playerRowsWithProj` (`App.jsx:544`) for the `playerRows` key — not the base `playerRows`
(`:283`).** This is not interchangeable: `playerRowsWithProj` is the end of the pipeline and is
what `PlayersSurface` is handed (`:971`), and `usePlayerProfile` reads `dynastyRank`,
`nextSeasonRank`, `divergenceSignal` and `rankMovement` off that row. Passing the base `playerRows`
**silently empties every rank in the modal with no error** — it will look like a data bug, not a
wiring bug. Match `PlayersSurface`'s prop exactly.

**Leave both existing providers exactly where they are.** Nested providers are harmless — the inner
one wins for its subtree — and `/players` stays live until Slice iv absorbs it. Removing them is
Slice iv/v's job, not this one.

**Do not gate the provider on `careerStats`.** An earlier draft of this file said "render nothing
unless `careerStats` is loaded", copying the existing mount's guard
(`PlayersDataTable.jsx:70`). That guard is correct *for the modal* and wrong *for the provider*:
the provider wraps `<Routes>`, which today renders as soon as `leagueData` exists (`App.jsx:954`,
the `!leagueData` branch), while `careerStats` takes minutes to load and `PlayersSurface` is
explicitly handed `loaded={!!careerStats}` so it can render its own loading state. Gating the
provider would blank **every route** — Portfolio, Market, League, Board, Trade — for the whole
career load.

**Correct shape:** provider wraps `<Routes>` unconditionally; the **modal** carries the
`detailPlayerId && careerStats` guard.

### 1.2 Pop-up state lives in `App.jsx`

Add to `App.jsx`:

```js
const [detailPlayerId, setDetailPlayerId] = useState(null)
const openPlayerDetail  = useCallback(id => setDetailPlayerId(id), [])
const closePlayerDetail = useCallback(() => setDetailPlayerId(null), [])
```

**This is the correct home and the task file is stating it so no one re-derives it.** CLAUDE.md's
*App.jsx owns all state* invariant allows view-local table UI state to live in `usePlayersTable`,
one instance per tab — but this is cross-surface state (the pop-up outlives any one table and must
be openable from Portfolio, Market and later the Explorer), so it belongs in `App.jsx`. **Do not
introduce Redux/Zustand/Jotai, and do not add a new context just for the open/close pair.**

Clear `detailPlayerId` in the league-reset path alongside the existing `clearComparison()` call
(`App.jsx:868`) — a stale player id must not survive a league switch.

Name the state `detailPlayerId` (singular) now. Slice v widens it to `tabs[]`/`activeTab`;
`detailPlayerId` is the honest name for what this slice actually holds, and renaming later is
cheaper than shipping a plural that holds one element.

### 1.3 Props the pop-up needs beyond the hook

- `playerId` / `onClose` — from §1.2.
- `myTeamName` — `App.jsx:983` already computes it
  (`leagueData.rosterTeams.find(t => t.ownerId === user?.user_id)?.teamName ?? null`). The pop-up
  compares it against the hook's `ownership` to render "owned by you" vs the owner's team name vs
  "unowned". **Lift that expression to a `useMemo` in `App.jsx`** rather than duplicating it — it
  now has two consumers (`PlayersSurface` and the pop-up).

Nothing else. Everything else comes from `usePlayerProfile` + `ProfileDataContext`.

### 1.4 Read this before you start: nothing opens the pop-up in this slice

Portfolio and Market are placeholders with no rows, and `/players` is explicitly out of scope
(§3). So after this slice: **the pop-up is fully built, mounted and tested, and there is no way to
open it in the running app.** That is expected, not a bug, and it is the direct consequence of
master-plan §6 sequencing ii before iii so that Slice iii has a real click target.

Consequences to accept deliberately:
- **Verification for this slice is tests, not eyes.** The usual "hand back for the user's manual
  visual smoke" step cannot cover the pop-up. Render it in tests against fixture context data
  (§7). The user's visual acceptance of the pop-up happens in **Slice iii**, when Portfolio's
  holdings rows first open it.
- **Do NOT thread `openPlayerDetail` into the Portfolio/Market placeholders.** An earlier draft
  said to pass it as an accept-and-ignore prop so Slice iii would have less to wire. That fails
  lint: `eslint.config.js:12` extends `js.configs.recommended` with no `no-unused-vars` override
  (§0), so an unused destructured prop is an **error**, contradicting this slice's own "lint 0
  problems" gate. `openPlayerDetail` is defined in `App.jsx` and consumed by the modal only;
  **Slice iii adds the prop and the call site together**, which is one edit either way.
- Do **not** invent a temporary button, a debug affordance, or a fake row to make the modal
  reachable. Shipping a fabricated trigger so a slice feels finished is exactly what master-plan
  §2.4 exists to prevent.

**If the user would rather see it working, the alternative is to merge Slice ii into Slice iii and
build Portfolio's holdings table in the same change.** That is a legitimate call — it trades a
bigger single slice for a visually verifiable one. This file assumes the split; flag it and stop if
the user prefers the merge.

---

## 2. `dynastyScore.js` — expose the component weights (additive)

### 2.1 Why it lands here — and what it actually is

Slice i's "Explicitly NOT this slice" note deferred weight exposure to Slice iii, reasoning that
Slice iii is when weighted-component bars first render. Master-plan §6 puts the **"What drives the
score"** panel in *this* slice, so the exposure lands here.

**But this is a de-duplication, not a new capability.** The live Explorer profile already renders
all five weights — as **hard-coded display strings** at `PlayersTab.jsx:369-373`
(`weight: '28%'`, `'25%'`, `'22%'`, `'15%'`, `'10%'`). So the weights currently live in **two**
places with nothing binding them: the formula (`dynastyScore.js:922-926`) and that JSX literal.
Adding them to the object without a plan makes it **three**.

**Therefore this slice must also schedule the convergence:**
- The new modal reads `components[*].weight` — never a literal.
- `PlayersTab.jsx:369-373` **stays as-is this slice** (§3 keeps `/players` unmodified), but add a
  one-line comment there pointing at the object as the new source of truth, and record in
  master-plan §6's Slice iv entry that those literals get replaced when the Explorer is absorbed.
- The §7 unit test (weights present, summing to 1.00) is what actually binds formula↔object.

### 2.1a Correction: there is no design-vs-live weight conflict

Earlier drafts of this file — and master-plan §2.1 before it — claimed the mock's weights
contradicted the live formula and that the mock "transposed" reliability and opportunity.
**Verified false.** The mock labels Opportunity **15%** and Reliability **10%**
(`Sleeper Dashboard.dc.html:1447-1448`, `:1784-1785`), identical to the formula. Only the **row
order** differs — the mock lists Opportunity before Reliability — and `PlayersTab.jsx:369-373`
already ships that same order with correct labels.

So there is nothing to reconcile: use the live weights, and follow the design's row order
(Opportunity above Reliability) because it matches both the mock and the existing Explorer.

### 2.2 The change

In the `components` object at `src/utils/dynastyScore.js:1024-1028`, add a `weight` key to each of
the five sub-objects. **Additive only** — do not rename, remove, or reorder existing keys, and do
not touch the composite formula at `:921-927`.

| Component key | `weight` | Formula source |
|---|---|---|
| `ageAdjusted` | `0.28` | `:922` |
| `trajectory` | `0.25` | `:923` |
| `currentLevel` | `0.22` | `:924` |
| `reliability` | `0.10` | `:925` |
| `opportunityQuality` | `0.15` | `:926` |

These match both the live formula and the design (§2.1a) — there is no conflict to resolve.
**Display order** in the panel follows the design: Age-adjusted, Trajectory, Current level,
Opportunity, Reliability.

### 2.3 `reliability` — say which number the bar shows

`reliability.value` is `reliabilityScore` (pre-penalty). The composite uses `effectiveReliability`
(`×0.90` when `isTdReliant`, `:916-918`). These differ for TD-reliant players, so
`value × weight` will not reconcile against the total score for them.

**Decision for this slice: display `reliability.value` (pre-penalty) and do not imply the bars sum
to the score.** Rationale: the panel's job is "what drives the score," not an audit trail, and the
alternative — exposing `effectiveReliability` as a sixth field — widens the contract for a
cosmetic gain. Label the panel so it reads as *relative contribution*, not a reconciliation.

Add a short comment at the `reliability` line noting that the composite applies a TD-reliance
penalty the exposed `value` does not reflect, so the next reader doesn't file it as a bug.

### 2.4 Model-routing gate

CLAUDE.md routes *anything touching `dynastyScore.js`* to **opus**. This change is deliberately the
smallest possible additive edit (five literal keys, no logic), fully specified above.

**If this slice is being implemented by a sonnet session:** implement §2.2/§2.3 exactly as written
— it is spelled out to the key — but **stop and report** if adding the keys appears to affect
anything beyond the returned object.

Line numbers in §0/§2 were verified 2026-08-12 against the post-Slice-i working tree. Treat a
small offset as ordinary drift (locate the construct by name and continue); **stop only if the
construct itself is not there** or does not match the quoted code.

### 2.5 Test impact — five inline snapshots will break, by design

Verified 2026-08-12, so this is not a "check whether" but a "here is what happens":

- **`src/utils/dynastyScore.test.js` has five `toMatchInlineSnapshot` assertions** — the calls are
  at `:84`, `:173`, `:267`, `:359`, `:450`, each snapshot opening `"components": {` on the line two
  below (`:86`, `:175`, `:269`, `:361`, `:452`) and containing the **entire `components` object**.
  These are the only inline snapshots in the repo. Adding `weight` breaks all five. **Regenerate them
  deliberately and read the diff** — the only change in each should be five added `"weight": N`
  lines. If anything else moves, the edit did more than §2.2 specifies: stop and report. Do **not**
  bulk-update snapshots without reading the diff; that is how a real regression gets rubber-stamped.
- **`src/utils/teamContext.test.js` is unaffected.** Its assertions build their own component
  fixtures and read single sub-keys (`:538`, `:543-544`, `:552`) rather than deep-equalling the
  real output.
- **`applyQBQualityModifier` preserves the new key** — it spreads (`teamContext.js:132`:
  `opportunityQuality: { ...oq, value: newOq }`), so `weight` survives the QB-quality path. No
  change needed there; noted so you don't go looking.
- **`src/__tests__/attributionHold.test.js`** imports `computeDynastyScore` but makes **no
  `components` assertions** (verified) — unaffected.

This is **not** the `factors` contract — `factorsSchema.test.js` covers `seasonProjection.js` and is
unaffected — but run it and `statKeysContract.test.js` anyway per the done-definition, since a
scoring module changed.

---

## 3. A new component, not a re-skin of `PlayerProfile`

Create `src/components/dp/PlayerDetailModal.jsx` (new `dp/` directory for 1b content components).

**Do not re-skin `PlayersTab.jsx`'s `PlayerProfile` in place.** It is still rendered by the live
`/players` Explorer (`PlayersTab.jsx:2245`, `PlayersDataTable.jsx:74`) in the old light/dark
adaptive palette. Re-skinning it would recolor `/players` mid-flight — precisely the half-migrated
seam Slice i went out of its way to avoid. The two coexist until Slice iv retires the Explorer's
copy.

**What this duplicates, and why that's acceptable:** both components call `usePlayerProfile` and
render overlapping data. The *derivation* is shared (the hook), only the presentation forks — which
is the intended shape. Do not extract a shared presentational base "to avoid duplication"; the two
skins are deliberately different and will not converge until Slice iv/v deletes one.

`PlayerDetailModal` owns only its own view-local state (which right-rail section is expanded, if
any). It does **not** re-implement `PlayerProfile`'s `activeTab`/`weeklyOpen`/`focusSeason` — the
1b design has no stats/dynasty/team tab strip in the pop-up body.

---

## 4. Layout — build from the design, not from `PlayerProfile`

Follow `README.md` → *Screen: Player detail (pop-up)* and `.dc.html:1020-1200`. Structure:

1. **Shell** — fixed overlay `inset-0`, scrim `rgba(6,7,9,0.74)`, `padding: 26px`. Panel
   `max-width: 1320px`, `bg-dp-chrome`, `1px border-dp-border-raised`, `rounded-[14px]`,
   `shadow-[0_30px_90px_rgba(0,0,0,0.65)]`, flex column, `overflow-hidden`.
   **Per Slice i §1.1 the panel must paint its own ground (`bg-dp-chrome`) — it does above; do not
   remove it.** Close on scrim click and on `Escape`.
   **z-index (required):** scrim `z-40`, panel `z-50`, matching the repo convention
   (`PlayersTab.jsx:1622`/`:1625`, `PlayersDataTable.jsx:73`). Without this the panel renders
   **under** the mobile `BottomTabBar`, which is a fixed `z-40` (`BottomTabBar.jsx:13`).
2. **Body** — flex: main column + 300px right rail, `overflow: auto`.
3. **Main** (`padding: 24px 28px`, `gap: 20px`):
   - Identity row — 52px `bg-dp-chip` rounded square with mono position, name 24/700, meta
     (`age · team · season N · ownership`), then the two actions (§5).
   - Four tiles — see §4.1, which specifies each one's value, delta and note. Mono 21px values.
   - Career PPG chart — historical seasons `bg-dp-slate`, latest `bg-dp-up`, projection
     `bg-dp-proj` labelled `'NN proj`. Header copy: see §5. **Omit the projection bar entirely when
     `projection` is null** — do not draw a zero-height bar.
   - Two-up row — "What drives the score" (§2) and "Why next season" (adjustment chips +
     `comps`/`compsProjectedPPG` rows).
4. **Right rail** — see §4.2.

### 4.1 The four tiles — exact sourcing

The mock's tile row (`.dc.html:1479-1484`) leans on two fields the app cannot honestly supply.
Specified explicitly so nobody improvises:

| Tile | Value | Delta | Note |
|---|---|---|---|
| Dynasty score | `dynastyScore.score` | `dynastyScore.label` | seasons of experience **only** — the mock's note is `` `${riskLabel} risk · ${exp} seasons` `` and `riskLabel` does not exist (see below); drop that clause |
| Market value | `ktcValue`, `—` when null | **omitted** — see §5 site 3 | `divergenceSignal` phrasing |
| Next season | `projection.projectedPPG`, `—` when `projection` is null | `projectedPPG − currentSeasonPPG` (omit when either side is null) | `` `PPG · ${projectedGames} games projected` `` |
| Floor risk | `±sd` from `computeConsistency` | — | `SD of per-game points` |

**Floor risk does NOT get the mock's Low/Med/High word.** `.dc.html:1483` renders `p.riskLabel` as
the tile's *value*, but `riskLabel` is hand-authored mock data whose Low/Med/High thresholds are an
**open master-plan question owned by Slice iv** (§5.4). Ship the real `±sd` number as the value and
leave the word out until those thresholds are decided — do not derive one here. Same for the
Dynasty-score tile's note, which uses the same field. Add a source comment pointing at master-plan
§5.4 so Slice iv knows where to come back to. (No `PROVISIONAL` tag: nothing fake ships, the tile
just shows less than the mock.)

### 4.2 Right rail — the two unspecified derivations

`bg-dp-chrome`, left border, `padding: 22px 20px`, mono 10px `text-dp-muted-2` section heads.

- **POSITION IN PORTFOLIO** — mono 26px. Derivation (the mock's, made explicit):
  `ktcValue ÷ Σ ktcValue over rows where ownerTeamName === myTeamName`, rendered as a percentage.
  Skip rows with null `ktcValue` in both numerator and denominator. When the player is **not**
  yours, render `—` with a note saying so — do not compute a hypothetical share.
- **SIGNALS** — `dynastyScore.signals` is a flat flag object, not a list of `{title, body}`. The
  mapping already exists: `PlayersTab.jsx:864-881` derives seven badges from exactly this object
  (`isBreakout`, `isBounceBack`, `momentumLabel` accelerating/decelerating, `isTdReliant`,
  `injurySeasonCount ≥ 2`, `ageCurveFactor`), each with a label and an explanatory tooltip.
  **Extract that predicate-and-copy block into a new pure leaf module**
  `src/utils/dynastySignalBadges.js` returning `[{ key, label, body, tone }]`, where `tone` is
  semantic (`'positive' | 'caution' | 'neutral'`) rather than Tailwind classes, and consume it from
  the rail — mapping `tone` to `dp` tokens locally. **Do not author new signal copy**, and **do not
  edit `PlayersTab.jsx` to use the helper this slice** (§3 keeps `/players` unmodified); note in
  master-plan §6's Slice iv entry that the Explorer's inline copy converges on the helper then.
  Render nothing when `signals` is null (`dynastyScore.js:631`).
- **RANK THIS SEASON** — `positionPeers`; the current player's row gets `bg-dp-up-bg` /
  `text-dp-up-text`.

### 4.3 Empty states — required, and not edge cases

`components` is null on **six** paths (§0), two of which ("Limited Data") are common on a real
roster. Each of these must render, not crash:

| Null | Where it bites | Required behaviour |
|---|---|---|
| `dynastyScore` (`usePlayerProfile.js:106`) | whole modal — id absent from `playerRows` | render the identity row from `player` and a short "no dynasty data" body; never dereference `.score`/`.components`/`.signals` |
| `dynastyScore.components` (6 paths) | drivers panel | one explanatory line, not five zero-width bars |
| `dynastyScore.signals` (`:631`) | SIGNALS rail | omit the section |
| `projection` (`usePlayerProfile.js:151`) | Next-season tile, projection bar, "Why next season" chips | `—` in the tile, no projection bar, omit the chips block |
| `ktcValue` | Market value tile | `—` |
| `computeConsistency(...) === null` | Floor risk | `—` |
| `computeConsistency(...).sd === null` (`outlookConsistency.js:83`, pooled games < `MIN_POOLED_GAMES`) | Floor risk | `—` — **a null-object check alone does not cover this** |
| `comps` empty | "Why next season" | omit the comps block, don't render an empty list |

Prefer the short-form `dp` utilities (`bg-dp-card`, `text-dp-up-text`) over
`bg-[var(--color-dp-…)]` bracket syntax. Radii/shadows from the handoff are one-off arbitrary
values at point of use, per Slice i §1.

---

## 5. `PROVISIONAL(...)` sites — the first slice with any

Per master-plan §2.4, tag both in source with
`// PROVISIONAL(<category>): <what is fake> · <why> · <what would make it real>`.

1. **"Shop this asset"** (`.dc.html:1082`) — `PROVISIONAL(no-data)`. There is no trade surface to
   route to; `/trade` is a gated placeholder. **Ship the button disabled**, with the gating reason
   as its `title`, keeping "Compare" (`:1081`) as the live secondary action. Do not wire it to
   `/trade` — landing the user on a gated placeholder is a worse answer than a disabled control.
2. **Career chart header "next season 22.1 ±3.4"** (`.dc.html:1101`, README) —
   `PROVISIONAL(mock-copy)`. The `±` is the *historical* per-game SD (the mock's own Floor-risk
   tile labels it "SD of per-game points"), but placed in a projection header it reads as a
   projection interval, which this app does not compute. **Reword** to something true —
   e.g. `career avg N · next season N · ±N per-game SD` — rather than shipping the implication.
3. **Market-value tile's delta** (`.dc.html:1481`: `delta: p.mk30`, coloured by `p.mk30dir`) —
   `PROVISIONAL(no-data)`. That is the **30-day KTC Δ**, which master-plan §2.2/§2.4 already
   records as the redesign's one real upstream data gap (the `ktcHist` series is sparse pending a
   Tier-0 roadmap fix). **Omit the delta** and keep the tile's value and note. Do **not** substitute
   a different delta to fill the slot. Tag it at the tile so the site is greppable and so Slice iii
   — which shows the same figure in Portfolio's 30D column — finds the precedent.

After implementing, `grep -rn "PROVISIONAL(" src/` must return **exactly these three sites**.
(An earlier draft said two; it had missed the Market-tile delta, which the design carries and this
app cannot yet populate.)

---

## 6. Step sequence

1. `dynastyScore.js` — add the five `weight` keys + the `reliability` comment (§2). Run
   `npm test` immediately; regenerate the five inline snapshots and **read each diff** (§2.5)
   before going further.
2. Extract `src/utils/dynastySignalBadges.js` from `PlayersTab.jsx:864-881` — pure, returns
   `[{ key, label, body, tone }]` (§4.2). **Copy it out; do not modify `PlayersTab.jsx`** beyond
   the one-line source-of-truth comment at `:369-373` (§2.1).
3. Create `src/components/dp/PlayerDetailModal.jsx` (§3, §4, §4.1, §4.2, §4.3, §5).
4. `App.jsx` — add `detailPlayerId` state + the two callbacks (§1.2); lift `myTeamName` to a memo
   (§1.3); wrap `<Routes>` **unconditionally** in the hoisted provider using `playerRowsWithProj`
   for the `playerRows` key (§1.1); mount the modal just inside the provider, after `</Routes>`,
   carrying the `detailPlayerId && careerStats` guard; clear `detailPlayerId` on league reset
   (`:868`).
   **No prop is added to the Portfolio/Market placeholders** (§1.4 — it would fail lint).
5. Tests (§7).
6. Docs (§8), including the CR-07 trigger-list correction (§9).
7. `npm test` green · `npm run lint` 0 problems · `npm run build` clean ·
   `grep -rn "PROVISIONAL(" src/` returns exactly the three §5 sites.
8. Hand back. **State plainly that the pop-up is not reachable in the running app yet** and that
   visual acceptance lands with Slice iii (§1.4) — do not ask for a visual smoke that cannot be
   performed.

---

## 7. Tests to add / update

- **New `src/components/dp/PlayerDetailModal.test.jsx`** — render inside a
  `ProfileDataContext.Provider` with fixture data (follow the mocking pattern already used by
  `src/components/players/OutlookTab.test.jsx:16` / `PlayersDataTable.test.jsx:14`). Cover:
  identity row renders name/position/meta; the four tiles; `onClose` fires on scrim click and on
  `Escape`; **all eight empty states in §4.3** — including the two that a null-object check misses
  (null `dynastyScore` entirely, and a non-null consistency object whose `sd` is null). These are
  what will actually break in production, and two of the six `components: null` paths are common,
  not exotic.
- **New `src/utils/dynastySignalBadges.test.js`** — the extracted helper (§4.2) is pure and
  predicate-driven, so cover each flag firing and the null-`signals` case. It carries user-visible
  copy, so it gets real coverage rather than riding on the modal's tests.
- **`dynastyScore` weights** — a unit assertion that each of the five components carries the
  expected `weight` and that they sum to `1.00`. This is the only thing binding the formula to the
  exposed object (and, later, to the Explorer's literals — §2.1), so it is load-bearing, not
  ceremonial.
- **Regenerate the five inline snapshots** (§2.5) — assert the new correct shape; do not loosen a
  matcher to dodge a failure.
- **`App.jsx` wiring** — if there is an existing App-level render test, assert the modal is absent
  when `detailPlayerId` is null. If there isn't one, don't build App-level test infrastructure for
  this slice; the component tests plus the routing suite carry it. **Worth one assertion either
  way:** that routes still render while `careerStats` is null, which is the regression §1.1's
  provider-guard correction exists to prevent.

## 8. Docs updates

- **`CLAUDE.md`** — `src/components/` table: add `dp/PlayerDetailModal.jsx` (App-level player
  detail overlay, dark-only `--color-dp-*`, mountable from any surface, single-player until Slice
  v). Note that `ProfileDataContext` now also has an App-level provider wrapping the router, in
  addition to the two `/players` ones. Under *Component data access*, the two-pattern description
  needs the provider's new location.
- **`docs/architecture.md`** — *State management*: add `detailPlayerId` to the `useState`
  inventory.
- **`docs/dynasty-scoring.md`** (check it exists and covers the components object) — record that
  `components[*].weight` is now exposed, with the caveat from §2.3 that `reliability.value` is
  pre-penalty while the composite uses `effectiveReliability`.
- **`docs/signal-registry.md`** — **do not edit.** Settled, not left conditional: exposing an
  already-computed weight on an in-memory object adds no signal, no source, no `factors` entry, no
  ephemeral capture, and changes no historical coverage or reconstructable-vs-ephemeral status.
  It is therefore not a signal reclassification and triggers nothing. (An earlier draft left this
  as a "check and skip if so", which contradicted §9 — see there.)
- **`docs/cross-repo-registry.md`** — one small maintenance edit; see §9.

## 9. Cross-repo impact

**None — no `CR-NN` entry's served contract is touched, so there is no `Mirror` text to emit.**
This slice is client-side rendering plus one additive field on an in-memory object; it reads no new
served data and changes no served shape.

Two points that had to be settled rather than left open, because a conditional edit is
indistinguishable from an untriggered one:

- **CR-18 (`docs/signal-registry.md`) is NOT triggered.** §8 previously left a signal-registry edit
  conditional while §9 declared "none" — a contradiction, since that file is CR-18's app-side
  trigger. Resolved in §8: the weight exposure is not a signal reclassification, the file is not
  edited, and CR-18 does not fire.
- **CR-07 (nflverse advstats, view-only) — its app-side `Triggers` list is stale and should be
  corrected in this change.** It names `AdvancedStatsPanel.jsx` but omits
  `src/hooks/usePlayerProfile.js:172-173`, which reads the same served shape
  (`advStats?.byId?.[playerId]`, `advStats?.year`). This slice widens that surface by hoisting
  `advStats` into an App-level provider, so **add `src/hooks/usePlayerProfile.js` to CR-07's
  app-side trigger list** in `docs/cross-repo-registry.md`. This is *extending an existing entry*,
  which CLAUDE.md keeps in-repo — it is **not** a new coupling and does not route to the Claude.ai
  project, and it changes no served contract (so still no `Mirror`).

## 10. Done-definition checklist (this slice)

- [ ] `dynastyScore.js` `components[*]` carries `weight` — 0.28/0.25/0.22/**0.10**/**0.15**,
      additive only, composite formula untouched
- [ ] `reliability`'s pre-penalty caveat commented in source and recorded in docs
- [ ] `PlayersTab.jsx:369-373` carries a one-line comment naming the object as the weights' source
      of truth; master-plan §6's Slice iv entry records that those literals retire then
- [ ] `ProfileDataContext.Provider` wraps `<Routes>` **unconditionally** (not gated on
      `careerStats`) with the same ten keys as `PlayersTab.jsx:2243`, and its `playerRows` key is
      **`playerRowsWithProj`**; both existing providers left in place
- [ ] Routes still render while `careerStats` is loading — asserted, not assumed
- [ ] `detailPlayerId` + open/close callbacks in `App.jsx`; the `careerStats` guard is on the
      **modal**; cleared on league reset; no new state library, no new context for the open/close pair
- [ ] `myTeamName` lifted to a memo, consumed by both `PlayersSurface` and the modal
- [ ] `PlayerDetailModal.jsx` is a new component; `dynastySignalBadges.js` extracted as a pure
      helper — `PlayersTab`'s `PlayerProfile` and the whole `/players` subtree are otherwise
      **unmodified**
- [ ] Modal panel paints `bg-dp-chrome`; scrim `z-40` / panel `z-50` (above `BottomTabBar`);
      closes on scrim click and `Escape`
- [ ] All eight empty states (§4.3) render without crashing — including null `dynastyScore` and
      non-null-consistency-with-null-`sd`
- [ ] Floor-risk tile shows `±sd` only — **no Low/Med/High word**; Dynasty-score tile's note drops
      the `riskLabel` clause (§4.1)
- [ ] POSITION IN PORTFOLIO and the SIGNALS mapping follow §4.2's derivations — no improvised
      product logic, no new signal copy
- [ ] Exactly **three** `PROVISIONAL(...)` sites, matching §5
- [ ] **No prop threaded to the Portfolio/Market placeholders**, and **no fabricated trigger**
      anywhere
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `factorsSchema.test.js` + `statKeysContract.test.js` run (per done-definition, since a
      scoring module changed)
- [ ] The five `dynastyScore.test.js` inline snapshots regenerated **and their diffs read** — five
      added `"weight"` lines each, nothing else moved (§2.5)
- [ ] CLAUDE.md + `docs/architecture.md` updated in the same change; `docs/signal-registry.md`
      **not** touched (§8); CR-07's app-side trigger list corrected in
      `docs/cross-repo-registry.md` (§9)
- [ ] Hand-back states explicitly that the pop-up has no entry point until Slice iii

---

## 11. Revision note (post plan-review, 2026-08-12)

Reviewed by the `plan-reviewer` subagent against live source; it raised **16 flags, all verified
accurate and all fixed above**. Grouped by what they changed:

**Two claims in the first draft were simply wrong.**
1. **There is no design-vs-live weight conflict** (§2.1a). The draft — inheriting the error from
   master-plan §2.1 — said the mock transposed reliability and opportunity and that its labels
   contradicted the formula. The mock labels Opportunity 15% / Reliability 10%, matching the
   formula exactly; only row order differs. The "ship correct weights despite the design" framing
   and the §7 test rationale about "nobody fixing it back to 15/10" both described a conflict that
   does not exist.
2. **Slice ii is not the weights' first consumer** (§2.1). `PlayersTab.jsx:369-373` already renders
   all five as hard-coded strings, so the exposure is a de-duplication — and without scheduling the
   literals' retirement it would put the weights in three unbound places.

**Four were live bugs in the plan.**
3. Gating the hoisted **provider** on `careerStats` would have blanked every route for the entire
   multi-minute career load (§1.1) — the guard belongs on the modal.
4. Threading an accept-and-ignore prop into the placeholders **fails `no-unused-vars`** (§1.4),
   contradicting the slice's own lint gate.
5. No z-index meant the panel would render **under** the mobile `BottomTabBar` (§4).
6. `playerRows` vs `playerRowsWithProj` was unspecified (§1.1); the wrong pick silently empties
   every rank in the modal.

**Three were under-specified derivations** the workflow forbids a sonnet from improvising:
POSITION IN PORTFOLIO's share formula, the `signals`→rail mapping (resolved by extracting the
existing badge block rather than authoring new copy), and the Floor-risk Low/Med/High label —
whose thresholds are still Slice iv's open question, so the word is dropped and only `±sd` ships
(§4.1, §4.2).

**Four widened the null-handling surface:** `components` is null on **six** paths, not two — two of
them common — plus null `dynastyScore`, null `projection`, null `signals`, and a non-null
consistency object with a null `sd` (§0, §4.3).

**Two were mechanical drift:** every `dynastyScore.js` and snapshot line citation was off by +1
(§0, §2.2, §2.5). §2.4's "stop and report on a line mismatch" was also softened, since it would
have turned that drift into a spurious halt.

**One resolved a self-contradiction:** §8 left a `docs/signal-registry.md` edit conditional while
§9 declared no cross-repo impact — but that file is CR-18's app-side trigger. Settled as
not-triggered, with CR-07's stale trigger list corrected in the same change (§9).
