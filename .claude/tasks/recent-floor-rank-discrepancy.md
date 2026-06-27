# Recent vs Floor positional-rank discrepancy

**Status:** Session-1 plan (opus). Planning only — no source edited. Sonnet implements.
**Type:** Display-only disambiguation (recommended) — Explorer + Player Profile.
**Constraints honored:** both columns are display-only; no projection/dynasty changes; recommended path makes **zero** algorithm changes, so every consumer of `computePositionalRanks` and `seasonRanks.js` is preserved byte-for-byte (equivalence trivially holds).

---

## 1. The observation

Explorer shows, for Alvin Kamara (RB), two positional ranks that both read as "his 2025 season" yet disagree:

- **Recent** column → `RB 49` (no season shown; reads as "current / 2025")
- **Floor** column → `RB 46 · 2025`

Presented side by side they look like two different ranks for one player-season, which undermines the transparency principle.

---

## 2. Diagnosis — there are TWO rank families, each internally consistent

The two columns are produced by two independent subsystems that rank over **different populations**, with **different games-played qualifiers**, and one is **mixed-season** while the other is **single-season**. They are not the same quantity and were never meant to be equal.

### Family A — "current-form, active-pool" rank → `computePositionalRanks`
- **Def:** `src/utils/dynastyScore.js` → `computePositionalRanks(playerRows, careerStats, currentSeason)` (def at `dynastyScore.js:238`; Recent block `dynastyScore.js:252-271`; last-season/movement block `273-282`; assemble `336-354`).
- **Pool:** the rows passed in = `playerRowsFinal` — the **relevant/active player pool only** (post-`isRelevantPlayer`; built in `App.jsx` `playerRows` memo, filtered at `App.jsx:392-401`), grouped by position.
- **Metric (`recentPPG`, per player):** `row.currentSeasonPPG` if `careerStats[currentSeason][id].gamesPlayed >= 6`; **else** the most-recent prior season with `gamesPlayed >= 8`, capped at 3 seasons back, PPG = `fantasyPoints/gamesPlayed`; else `null`.
- **Mixed-season:** different players are measured in **different seasons** (some on the current season, some on a fallback prior season). A player's rank = (# active peers with a higher `recentPPG`) + 1; `null`-PPG players sink to the bottom and do not inflate anyone's rank number.
- **Consumers (all must stay unchanged):**
  - Explorer **Recent** column cell (`PlayersTab.jsx:2097-2106`) + header tooltip (`PlayersTab.jsx:2044-2045`).
  - Explorer default sort `recentRank` asc (`PlayersTab.jsx:1539-1540`).
  - `rankMovement` / `movementLabel` (`dynastyScore.js:340-345`) → Recent-cell ↑/↓ (`PlayersTab.jsx:2102-2103`).
  - Player Profile **Rankings row** "Recent" chip + ↑/↓ (`PlayersTab.jsx:1247-1252`), the rankings legend tooltip (`PlayersTab.jsx:1132-1138`), and the buy/sell narrative (`PlayersTab.jsx:1120-1129`).
  - `recentRank`/`peakRank`/`consistencyRank`/`dynastyRank`/`rankMovement` surfaced via `usePlayerProfile.js:133-138,199-203`.

### Family B — "single-season, full-field finish" rank → `seasonRanks.js`
- **Def:** `src/utils/seasonRanks.js` → `rankPositionSeason` (`seasonRanks.js:4-12`), `buildSeasonPositionRanks` (`17-44`), `computeCeilingFloor` (`51-64`).
- **Pool:** `rankPositionSeason(seasonData, playersMap, position)` ranks **every** player at the position with `gamesPlayed > 0` in **that one season** — the **full season field**, including retired/inactive players who never enter the active pool.
- **Metric:** that season's PPG (`fantasyPoints/gamesPlayed`), descending; qualifier is `gamesPlayed > 0` (not `>= 6`).
- **Single-season:** `buildSeasonPositionRanks` runs the per-season ranking for every season; `computeCeilingFloor` then picks the player's **best** (Ceiling = min rank) and **worst** (Floor = max rank) season.
- **Consumers (all must stay unchanged):**
  - Explorer **Ceiling/Floor** cells (`buildSeasonPositionRanks`+`computeCeilingFloor` memo at `PlayersTab.jsx:1882-1895`; cells `2140`/`2143`; `CeilingFloorCell` `60-83`; headers `2056-2059`).
  - Player Profile **per-season "Pos Rank"** column — `usePlayerProfile.js:75-83` calls the **same** `rankPositionSeason`. So Floor for season S **equals** the Profile's Pos Rank for season S; the two are already consistent *with each other*.

### Why Kamara is 49 (Recent) but 46 (Floor), both "2025"
- **Same numerator.** `currentSeasonPPG = careerStats[mostRecentSeason].fantasyPoints/gamesPlayed` (`App.jsx:320-323`), and `mostRecentSeason` == the `currentSeason` passed to `computePositionalRanks` (`App.jsx:474-476`) == 2025. Kamara has `gp >= 6` in 2025, so Recent uses his 2025 PPG. 2025 is also his worst-rank career season, so Floor = 2025. **Both rank his 2025 PPG** (modulo a 2-dp rounding on `currentSeasonPPG`).
- **Different denominators.**
  - *Recent pool:* active RBs, several of whom are measured on a **stronger prior season** via the `gp<6` fallback. Those leap above Kamara → his Recent rank is **worse** (49).
  - *Floor pool:* the **full 2025 RB field** (gp>0). Injured-in-2025 vets appear here only on their weak partial-2025 PPG (below Kamara), and the field has more low scorers beneath him → his rank is **better** (46).
- Net: `Recent (49) >= Floor (46)`. A ~3-rank gap is well inside the noise the differing populations create.

**This is a legitimate by-design divergence, not a bug.** The two answer different questions: *"where does this player's current form rank among active players"* vs *"what was this player's worst single-season finish among everyone who played that season."*

> **Adjacent note (secondary, optional):** the same two-family split exists on the "best" side. The Profile Rankings row's **Peak** chip is Family A (active-pool best PPG), while the Explorer **Ceiling** column is Family B (full-field single-season best). They can disagree for the same reason. Out of scope for the reported bug, but the same labeling fix should be mirrored on Peak to avoid creating a fresh confusion (see §6, optional edit).

---

## 3. Real-data verification (honest scope + limitation)

**What I could not do:** the authoritative `careerStats` is **league-scored** and lives **only in the browser's IndexedDB**. It cannot be read from this session, and CLAUDE.md forbids starting the dev server. So the exact `46`/`49` cannot be reproduced here.

**What I did:** reconstructed the pipeline offline by aggregating **live Sleeper weekly stats** for 2023–2025 (the same source `loadCareerHistory` aggregates — `sleeperStats.js:162-217`), using a half-PPR proxy for league scoring, and recomputed both ranking bases for player `4034` (Kamara).

**Findings:**
- The **live public dataset does not match the user's cached values** — it ranks Kamara **RB1** in 2025 (gp=17, 21.5 half-PPR PPG), not RB46/49. The absolute numbers therefore depend on the user's exact league scoring **and** relevant-pool membership, both of which live only in IndexedDB. (At RB1, both families agree, so this dataset can't exhibit Kamara's mid-field divergence — which is itself consistent with the diagnosis: divergence only bites mid-field where pool composition matters.)
- **Structural facts that are scoring-independent and confirm the mechanism in real data:**
  - Kamara: 2025 `gp = 17` (≥6) → Recent uses the 2025 season, not a fallback. Consistent with "both reference 2025."
  - Kamara: 2024 `gp = 4` (an injury season) → exactly the fallback-eligible shape that drives divergence for *other* RBs.
  - In the real 2025 RB universe: **Floor pool (gp≥1) = 154 RBs**; **49 RBs are ranked in Recent on a *fallback prior season*** (32 of them entirely absent from the 2025 field), **plus 38 RBs with `1≤gp2025<6`** measured differently by the two families. A ~3-rank mid-field gap is well within the swing these ~49+38 differently-measured players create.

**Conclusion:** mechanism confirmed; by-design divergence, not a bug. The implementer (Session 2, app running) should still eyeball the live `46`/`49` against IndexedDB once, to confirm no league-specific surprise.

---

## 4. Decision — recommend (b) Disambiguation

**Recommendation: (b) disambiguate the two columns via precise labeling/scope wording. Do not change either algorithm.**

Why (b), not (a):
1. **The "equivalence required" constraint can only be satisfied by (b).** Reconciliation (a) means making Recent share Floor's basis, which by definition **changes `recentRank`** — and therefore the Explorer default sort order, `rankMovement`, the Profile "Recent" chip, and the buy/sell narrative. You cannot "reconcile Recent to Floor" *and* "preserve every consumer of `computePositionalRanks` with equivalence." (b) changes no logic, so equivalence is automatic.
2. **Both families are correct and each has dependents.** Family A feeds sort/movement/Profile chips and the future split-Recent feature; Family B feeds the career-finish narrative *and* the Profile per-season Pos Rank. Collapsing them degrades at least one:
   - *Recent → full-field single-season:* loses "current form among active players," drops injured-current-season vets to the bottom (worse "recent" UX), and shifts sort/movement/Profile.
   - *Ceiling/Floor → active-pool:* nonsensical for historical seasons (today's active pool ≠ the 2019 field) and would break the Profile per-season Pos Rank, which must stay full-field.
3. **Lowest blast radius, highest transparency.** The contradiction is *presentational* — two correct numbers that look like one. Fixing the words fixes the contradiction.

### Alternative (a) — reconciliation (documented, not recommended)
If the user nonetheless wants one number:
- The only coherent single basis is **full-field single-season for the current season** (= `rankPositionSeason(careerStats[currentSeason], …)` = the Profile per-season Pos Rank for the current season = Floor when floor==currentSeason).
- Implementing it **without** mutating `recentRank` (to respect the equivalence constraint) means adding a *new* field for display only and showing it in the Recent column — but then the column would **display** a different number than it **sorts by** (`recentRank`), which is its own confusion. Mutating `recentRank` instead violates the equivalence constraint.
- Either way (a) is strictly worse than (b). If chosen, it needs its own follow-up plan (new field name, sort decision, movement redefinition, Profile chip decision) — not specified here.

---

## 5. Dependency callout — "split Recent into columns" (future feature)

Whatever is decided here **defines the canonical "Recent rank" semantics** the later *split-Recent-into-columns* feature builds on.

- **(b) keeps Recent's semantics unchanged and now precisely documents them:** *"rank within the active/relevant pool by most-recent qualifying PPG (this season if ≥6 GP, else the latest of the last ≤3 seasons with ≥8 GP); mixed-season; not a single-season finish."* The split feature can then safely split this into, e.g., *current-season finish* vs *carry-over (fallback) form*, or *rank + Δ-vs-last-season* (`rankMovement` is already `lastSeasonRank − recentRank`, both active-pool — a ready building block).
- **(a) would redefine Recent** (and shift `rankMovement`), forcing the split feature to inherit the changed basis. Another reason to prefer (b).

Action: when the split-Recent task is planned, reference this file's §2 Family-A definition as the locked semantics.

---

## 6. Edits — grouped by file (recommended path b)

All edits are display copy. **No `.js` logic changes. No data-shape changes.**

### File: `src/components/PlayersTab.jsx`

**Edit 1 — Recent column header tooltip** (`SortTh label="Recent"`, currently `PlayersTab.jsx:2044-2045`).
- Before:
  ```
  <SortTh label="Recent" col="recentRank" {...sortProps}
    tooltip="PPG rank vs all active players at this position. ↑/↓ shows movement of 3+ positions vs prior season." />
  ```
- After:
  ```
  <SortTh label="Recent" col="recentRank" {...sortProps}
    tooltip="Current-form rank among ACTIVE players at this position, by each player's most-recent qualifying PPG (this season if ≥6 games, else the latest of the last 3 seasons with ≥8 games). A mixed-season current-form rank — NOT a single-season finish (see Ceiling/Floor). ↑/↓ = moved 3+ positions vs prior season." />
  ```

**Edit 2 — Ceiling column header tooltip** (`PlayersTab.jsx:2056-2057`).
- Before:
  ```
  tooltip="Best career positional finish (by PPG). Shows rank · season · that season's total points and the gap vs the average points for that finish (green = above, red = below — flags injury-shortened seasons)." />
  ```
- After:
  ```
  tooltip="Best SINGLE-SEASON positional finish (by PPG), ranked among ALL players who played that season — the full field, same basis as the Profile per-season Pos Rank (not the active-player Recent pool). Shows rank · season · that season's total points and the gap vs the average points for that finish (green = above, red = below — flags injury-shortened seasons)." />
  ```

**Edit 3 — Floor column header tooltip** (`PlayersTab.jsx:2058-2059`).
- Before:
  ```
  tooltip="Worst career positional finish (by PPG). Same stacked format as Ceiling." />
  ```
- After:
  ```
  tooltip="Worst SINGLE-SEASON positional finish (by PPG), ranked among ALL players who played that season — the full field (not the active-player Recent pool). Same stacked format as Ceiling." />
  ```

**Edit 4 — Profile Rankings legend, "Recent" line** (inside `rankingsLegend`, `PlayersTab.jsx:1132-1138`).
- Before (line `1133`):
  ```
  'Recent: PPG rank this season vs all active players at position\n' +
  ```
- After:
  ```
  'Recent: current-form rank vs ACTIVE players, by most-recent qualifying PPG (this season ≥6 GP, else last ≤3 seasons ≥8 GP) — mixed-season, not a single-season finish\n' +
  ```

**Edit 5 (OPTIONAL — secondary, see §2 Adjacent note) — Profile Rankings legend, "Peak" line** (`PlayersTab.jsx:1134`).
- Before:
  ```
  'Peak: Best single-season rank in career — ceiling\n' +
  ```
- After:
  ```
  'Peak: best-season rank within the active-player pool (differs from the Explorer Ceiling column, which uses the full-field single-season finish)\n' +
  ```
- Apply only if the user wants the Peak/Ceiling collision addressed in the same pass; otherwise omit. No other consumer touched.

> Note for implementer: tooltips render via `Tooltip` (newlines `\n` already supported in the legend; header tooltips are single strings). Keep the existing `position`/`{...sortProps}` attributes; change only the `tooltip` string. The `↑/↓` glyphs in Edit 1 are plain characters already used elsewhere in this file.

### File: `src/utils/dynastyScore.js` — **no change** (Family A algorithm preserved).
### File: `src/utils/seasonRanks.js` — **no change** (Family B algorithm preserved).
### File: `src/App.jsx` — **no change** (pipeline preserved).
### File: `src/hooks/usePlayerProfile.js` — **no change** (rank reads/`rankPositionSeason` preserved).

---

## 7. Docs updates

### `docs/ui.md`
**(a) Columns table — Recent row** (currently line `63`):
- Before: `| **Recent** | Position rank by recent PPG |`
- After: `| **Recent** | Current-form rank vs **active** players by most-recent qualifying PPG (this season if ≥6 GP, else the latest of the last ≤3 seasons with ≥8 GP) — a mixed-season "current form" rank, **not** a single-season finish |`

**(b) Columns table — Ceiling row** (line `68`):
- Before: `| **Ceiling** | Best career positional finish (by PPG): rank · season + that season's total pts and signed delta vs the per-rank average |`
- After: `| **Ceiling** | Best **single-season** positional finish (by PPG) **among all players that season (full field)**: rank · season + that season's total pts and signed delta vs the per-rank average |`

**(c) Columns table — Floor row** (line `69`):
- Before: `| **Floor** | Worst career positional finish (by PPG): same stacked format |`
- After: `| **Floor** | Worst **single-season** positional finish (by PPG), **full-field**: same stacked format |`

**(d) "Ceiling & Floor seasons" paragraph** (line `76`): append, immediately after the sentence ending `…(`src/utils/seasonRanks.js`, shared with `usePlayerProfile`).`:
- Add: `This **full-field, single-season** basis is deliberately different from the **Recent** column, which ranks within the **active-player pool** by each player's most-recent *qualifying* PPG (a mixed-season "current form" rank). The two can legitimately show different ranks for the same player and season — e.g. a player whose Recent rank counts active peers measured on a *stronger prior season*, while the same player's Floor counts the full field of that one season. Both are correct for their respective scopes; neither is "the" 2025 rank.`

**(e) (OPTIONAL, recommended) new mini-subsection** right after the Ceiling & Floor paragraph (before `### Filter sidebar`):
```
**Recent vs Ceiling/Floor — two different scopes.** *Recent* (and the Profile Rankings-row chips) rank within the **active/relevant player pool** by a **mixed-season** "most-recent qualifying PPG" (`computePositionalRanks`). *Ceiling/Floor* (and the Profile per-season "Pos Rank") rank within a **single season's full field** of everyone who played (`seasonRanks.js`). Same player, same year can therefore carry two different positional ranks — by design.
```

### `docs/architecture.md`
**Positional ranks section** (the `## Positional ranks (computePositionalRanks)` block, lines `178-187`). After the four-row method table (after line `187`), add a paragraph:
- Add: `All four ranks are computed over the **relevant/active player pool** (`playerRowsFinal`), **not** the full-season field. In particular **Recent** is a *mixed-season* rank — different players are measured in different seasons depending on their most-recent qualifying season — so it is **not** comparable to the single-season, full-field finishes produced by `src/utils/seasonRanks.js` (the Explorer Ceiling/Floor cells and the Player Profile per-season "Pos Rank"). A player can hold a different Recent rank and Ceiling/Floor rank for the same season; both are correct for their scope. See docs/ui.md → "Ceiling & Floor seasons".`

### `CLAUDE.md` — **no change required.**
Reason: CLAUDE.md is the thin nav/rules layer; it already classifies `seasonRanks.js` (line `123`) and the Ceiling/Floor cells (line `80`) correctly, and the positional-rank detail is delegated to `docs/architecture.md`. This change adds no module, command, invariant, data shape, or factor — so per the self-maintenance rule there is nothing to update here.

### `README.md` — **no change required.**
Reason: README's only references (lines `153`, `159`) are the `src/utils/` one-line file descriptions, which stay accurate; README carries no per-column UI copy.

---

## 8. Tests to add

**None required.** Per CLAUDE.md done-definition, purely non-behavioural changes (display copy + docs) need no tests, and these edits change **only** tooltip/label strings and Markdown — no logic, no data shape. Verified: **no existing test asserts any of the changed strings** (`grep` for `active players` / `positional finish` / `PPG rank` / `Recent:` / `Worst career` / `Best career` across `src/**/*.test.*` → 0 hits), so nothing goes stale.

Optional (not recommended — disproportionate): there is no `PlayersTab.test.jsx` harness today; adding a render test purely to assert tooltip copy would require standing up context/props for a 2000-line component for a copy change. Skip.

**Regression gate for Session 2 (must stay green, unchanged):** `src/utils/seasonRanks.test.js` (Family B) and the full `npm test` suite — they assert the algorithms are untouched, which is the whole point of path (b).

---

## 9. Cross-repo impact

**None.** No data-store shape, manifest field, snapshot schema, scoring path, or `factors` key is touched. Display copy + docs only. Nothing for `sleeper-dashboard-data` to mirror.

---

## 10. Implementer checklist (Session 2)

1. Apply Edits 1–4 in `PlayersTab.jsx` (Edit 5 only if the user opted into the Peak/Ceiling clarification).
2. Apply the `docs/ui.md` and `docs/architecture.md` edits in §7. Leave CLAUDE.md and README.md untouched.
3. `npm test` (green — no test should change), `npm run lint` (0), `npm run build` (clean).
4. Hand back for the user's manual smoke (hover the Recent/Ceiling/Floor headers and the Profile Rankings legend; confirm the wording reads clearly in light and dark).
5. (Optional) With the app running, eyeball Kamara's live Recent vs Floor against IndexedDB to confirm the by-design gap — no code action expected.
