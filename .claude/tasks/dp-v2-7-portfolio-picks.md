# dp-v2 Slice 7 — Portfolio extensions + picks as holdings

The last slice. The only one needing a new external source, and the only one that changes a shipped
headline number. Also carries one small carry-over fix from 6b (§8).

Everything in §1 was verified against the **live league and live data** during planning, not inferred.
Four of the master plan's own statements about this slice turned out to be **wrong or stale**; each is
corrected in place below with the evidence.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| KTC prices **36 pick rows** = 3 years × 3 tiers × 4 rounds, format `<YYYY> <Early\|Mid\|Late> <1st\|2nd\|3rd\|4th>` | `ktc/snapshot-2026-08-10.json`, counted |
| Pick rows carry `position: null`, `team: "FA"`, integer `value` | same |
| **The league is `in_season` for season 2026** — the master plan says `pre_draft`; that is **stale** | live `GET /league/1312015497465716736` |
| **The 2026 rookie draft is `complete`** — 60 picks, 5 rounds, 12 teams | live `GET /draft/…/picks` |
| `traded_picks` returns **23 rows**, seasons **`"2026"` (15) and `"2027"` (8) only** — no 2028 | live `GET /league/…/traded_picks` |
| `season` is a **string**; `round` is a number | same |
| **`owner_id` / `previous_owner_id` in `traded_picks` are `roster_id`s (small ints), NOT user ids** — the field name collides with `rosters[].owner_id`, which IS a user id string | same; `roster_id` 1–12 vs `owner_id` `"471393290583797760"` |
| **League drafts 5 rounds** (`settings.draft_rounds = 5`); **KTC prices only rounds 1–4** | live league + KTC snapshot |
| **Portfolio's props are exactly `playerRows / loaded / rosterTeams / seasonProjections / myTeamName / onOpenPlayerDetail`** — it does **not** receive `standings`, and does **not** receive `ktcHistory` | `App.jsx:1075-1082` |
| **`rosterTeams` carries `{rosterId, teamName}`** and its `teamName` is the exact string `ownerTeamName` is built from — so `rosterTeams`, **not `standings`**, is the roster_id → name join this slice needs | `App.jsx:294-296` |
| **Portfolio's tiles have NO deltas at all** — "values only, no deltas (§4a.2 cut)". This slice *adds* them; it is not scoping existing ones | `Portfolio.jsx:101,236` |
| `sleeper.js` already exposes `getLeagueDrafts` / `getDraftPicks` — the official-v1 boundary this repo owns | `api/sleeper.js:53,57` |
| **App.jsx already fetches the league's `drafts` list** in the same `Promise.all` as users/rosters/playerMap | `App.jsx:696` |
| **Raw KTC rows (`ktcPlayers`) are a local inside a `getKTCValues().then()` callback — not state** | `App.jsx:240-246` |
| **`goToTeam` is a module-level function in `Teams.jsx`**, so `useNavigate()` is not a drop-in | `teams/Teams.jsx:56-58` |
| **`matchKTCToSleeper` does NOT skip picks at the position guard.** `if (position && !SKILL_POSITIONS.has(position)) continue` — a pick's `position` is `null`, so the guard never fires. Picks fall through to Strategy 2 (name+team) and are dropped there as unmatched | `ktcMatch.js:99-115` |
| **`loadKtcHistory` calls `matchKTCToSleeper` per snapshot**, so the history `series` drops picks the same way | `ktcHistory.js:175` |
| **The KTC history window is `WINDOW_SIZE = 8` snapshots (~7 weeks: 2026-06-23 → 2026-08-10)** — the master plan's "13-week baseline" is **wrong**; 13 is the count of `computeKtcSignals` keys, not weeks | `ktcHistory.js:15,252`; 12 snapshots on disk |
| **Pick prices are near-static:** median absolute move **1.3%** over that window; **0 of 36** rows moved >10% | computed over the 8-snapshot window |
| `DefinitionPopover({ term, scope, gloss, percentiles, band, span, field, children })`; `percentiles` is `{p10,p50,p90,subject}` | `DefinitionPopover.jsx:7,39` |
| `leagueData.rookieDraftPicks` is `{[player_id]: {round, pick}}` — **already-drafted players**, unrelated to this slice despite the name | `App.jsx:772-789` |
| Portfolio: `ownedRows` → `valuedOwnedRows` (`ktcValue != null`) → `rosterValue`, concentration (top-4), `weightedAge`, `projectedPoints`; `holdingsRows` maps `ownedRows` | `Portfolio.jsx:70,103-146,187` |

---

## 2. Which pick seasons are live — derive it, never hard-code

**This is the trap that would silently corrupt the headline number.** `traded_picks` still returns 15
rows for season **2026**, a draft that has already been held. Pricing those against KTC's `2026 …`
rows would value picks that no longer exist — and double-count, because the players taken with them
are already on rosters and already counted.

**Rule:** a pick season is live only if its rookie draft has not happened.

- Derive the first live season from the league: if the current season's draft is `complete`,
  first-live = `Number(league.season) + 1`; otherwise first-live = `Number(league.season)`.
- **Read the draft's `status`/`season` directly. Do NOT reuse App.jsx's existing rookie-draft
  selector** (`App.jsx:775`, `.filter(d => d.type === 'rookie')`). Sleeper's `type` is the draft
  *format* — this league's returns `"linear"` — so that filter matches nothing. Reusing it would
  yield "no complete draft" → first-live **2026** → pricing the dead 2026 picks, which is precisely
  the double-count this section exists to prevent. *(That filter is a separate pre-existing bug and
  is **not** in scope here — do not fix it in this slice.)*
- **Reuse the `drafts` list App.jsx already fetches** (`App.jsx:696`); do not add a second request.
- Live seasons = KTC-priced years **≥ first-live**. Today: KTC prices 2026/2027/2028, first-live is
  **2027**, so live = **{2027, 2028}** and every 2026 row is discarded.
- Do **not** hard-code `2027`. Do **not** take the season set from `traded_picks` (it carries dead
  seasons) or from KTC alone (it prices dead ones too). The intersection is the answer.

**On seasons KTC does not price:** defining live seasons as the *intersection* means such a season is
never enumerated, so it cannot render as unpriced — the two statements in the draft contradicted each
other. Resolve it in favour of the intersection: **the live-season set is league-derived, and a live
season KTC does not price contributes unpriced rows for all of its rounds.** Concretely: enumerate
live seasons from the league (first-live, plus the following two — matching KTC's three-year horizon),
then price each `(season, round)` independently. A season absent from KTC prices every one of its
rounds as unpriced rather than vanishing. Today that set is `{2027, 2028}` and both are priced, so the
unpriced count comes entirely from **round 5** — but the season dimension must still be reachable.

---

## 3. Reconstructing ownership

Every roster starts holding its own pick in each round × live season; each `traded_picks` row
reassigns one.

```
key   = (season, round, originalRosterId)
owner = traded_picks row matching that key → row.owner_id   (a roster_id)
        else originalRosterId
```

**`roster_id` is the ORIGINAL owner**, `owner_id` is the current one. Both are roster_ids — map to a
display name through **`rosterTeams`'** `rosterId → teamName` — **not `standings`**, which Portfolio
never receives — and never through `rosters[].owner_id` (a user id). Verified: 0 rows in the live league have `roster_id === owner_id`.

Rounds to enumerate: `1 … league.settings.draft_rounds` (**5** here), not 1–4. Rounds beyond KTC's
1–4 are real assets that are simply unpriced.

**Ground truth for the smoke test** (computed live during planning, roster_id 2 =
`Colts_420_Reloaded`): the team owns **9 picks** — all five 2028 rounds, and 2027 rounds 2/3/4/5.
Its **2027 1st is owned by roster 11** (`{round:1, season:"2027", roster_id:2, owner_id:11,
previous_owner_id:2}` — planning first wrote "roster 1", misreading a `(season, round)` tuple; the
counts below were always right). Of the nine, **7 are priced and 2 are unpriced** (the two
5th-rounders). Anything else on screen is a bug.

---

## 4. Pricing, the headline total, and unpriced assets

Per master plan §2.3 (settled): **an untraded pick prices at `Mid`**; the Early–Late spread is
disclosed adjacent, never folded into the scalar.

- Priced value = KTC `<season> Mid <round-ordinal>` for rounds 1–4.
- Round 5+ and any season KTC does not price → **unpriced**. Render a dashed `—`, **never `0`** —
  zero is a price. Count them into an inline `+ N UNPRICED ASSETS`.
- `PROVISIONAL(no-data)` at the unpriced render site, with the third slot written plainly:
  `· nothing will — KTC prices rounds 1–4 only` (master plan §2.4).

**Roster value becomes `players X + picks Y`, stated inline**, with `+ N UNPRICED ASSETS` beside it —
not a footnote, not a tooltip.

**The league rank must be recomputed pick-inclusive.** `rosterValueRank` is `Nth of M` across teams;
`traded_picks` gives every roster's picks, so compute all 12 teams' pick value the same way. A total
that includes picks ranked against totals that don't is simply wrong.

**Concentration** (top 4 by value) now sees picks and may change — correct and intended; a 1st-rounder
belongs in a concentration measure.

**Weighted age excludes picks** (they have no age) — its existing `age != null` filter already does
this, but say so in the tile note, since roster value and weighted age now cover different asset sets.

---

## 5. Tiles and the `NO BASELINE` state

The master plan's premise here was **wrong twice** and the resolution changes:

1. The window is **8 snapshots (~7 weeks)**, not 13 weeks.
2. **The history series has no picks in it** — `loadKtcHistory` runs the same
   `matchKTCToSleeper` that drops them. So once the total includes picks, a delta computed from that
   series no longer covers the same asset set.

**Third, and bigger than either: Portfolio has no tile deltas at all.** 1b Slice iv cut all three
(`Portfolio.jsx:101,236` — "values only, no deltas"), and Portfolio does not receive a `ktcHistory`
prop; only Market does. So this slice **adds** the two deltas rather than scoping existing ones, which
is real new work the draft glossed over:

- Thread `ktcHistory` into Portfolio as an **explicit prop** from App.jsx (it already flows to Market —
  `App.jsx:1091`), keeping Portfolio props-only with a fixed list.
- Derive a roster-value series: for each of the window's snapshot dates, sum **today's** holdings'
  values at that date from `series[id]`, then delta first → last. Concentration likewise (top-4 share
  recomputed per date).
- **This is a constant-portfolio measure by design** — it holds the holding set fixed at today's and
  varies only price, so it reports market movement rather than the effect of trades. That is the right
  question for the tile ("is what I hold gaining value"). Say so in a comment; it is otherwise the kind
  of thing a later reader "fixes" into something worse.
- A player with no entry at a given date is **omitted from that date's sum**, never zeroed. If the
  first and last dates cover different holding subsets, prefer the intersection over a mismatched pair.

**Decision: the delta is scoped to players and labelled `players only`.** Justified, not assumed —
pick prices moved a median of **1.3%** across the whole window and not one of the 36 rows moved >10%,
so the omitted component is near-static and the delta still answers "is my roster gaining value."

Do **not** widen `loadKtcHistory` to carry pick prices in this slice: it is a shared, cached loader
and re-shaping it in the program's last slice buys ~1% of accuracy. Keep the §6 parser pure and
free-standing so a later slice can feed it snapshots cheaply.

Do **not** back-fill history by holding today's pick price constant across the window — that
fabricates data the repo's own rules forbid.

Tiles:

| Tile | Delta |
|---|---|
| Roster value | real, **scoped to players**, labelled |
| Concentration | real, **scoped to players**, labelled |
| Weighted age | `NO BASELINE` — no historical age aggregate is stored |
| Proj. points | `NO BASELINE` — no historical projections are stored |

`NO BASELINE` is `DegradedBlock`'s existing kind. **It is a storage fact, not a design choice** —
that framing is the point, and the copy should carry it.

---

## 6. `src/utils/ktcPicks.js` — new pure util

A **second, parallel parse path**. Do **not** widen `matchKTCToSleeper`: it exists to resolve players,
and a pick is not one.

- `parseKtcPickRows(ktcRows)` → a price table keyed `(season, tier, round)`, built by matching
  `/^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/` against `name`. Anything not matching that exact
  shape is ignored, not guessed at.
- `pickPrice(table, season, round, tier = 'Mid')` → number or `null`. `null` for an unpriced round —
  never a fallback number, never a nearest-round substitute.
- Pure, no React, no I/O. Ignore `team`/`position` entirely rather than asserting on them.

**Where it runs:** the raw rows are `ktcPlayers`, a **local inside the `getKTCValues().then()`
callback** (`App.jsx:240-246`) — not state. Build the pick table from those same rows in that same
callback (one parse, no second fetch) and store it in its own state. That means a second `setState` in
that callback, which **must sit behind the same `cancelled` guard** as the existing one — the
Strict-Mode double-fire invariant in CLAUDE.md.

---

## 7. The Early–Late range in the pop-over

Show all three prices with the scalar's tier named, e.g.
`Early 3,690 · Mid 2,980 · Late 2,410 — priced at Mid`.

**Do not pass these as `percentiles`.** That prop is `{p10,p50,p90,subject}` and means a league
percentile distribution; Early/Mid/Late are three tier prices for one asset. Mapping one onto the
other would assert a false equivalence, and `DefinitionPopover` would render a subject marker that
means nothing. Carry the range in `gloss`, the derivation in `field`.

---

## 8. Carry-over fix from 6b — routing

`teams/Teams.jsx:57` navigates with `window.location.hash = \`/teams/${team}\`` rather than
`useNavigate()`, to keep `Teams.test.jsx`'s 14 un-wrapped `render()` calls working. That is backwards
— tests should follow production shape, not set it — and it is inconsistent with `TeamDetail.jsx:122`,
which uses `useParams` idiomatically one file over. A raw hash write is also invisible to the router,
so future route guards or navigation instrumentation would not see it.

- Switch `Teams.jsx` to `useNavigate()`. **Not a drop-in:** `goToTeam` is a module-level function
  (`:56-58`), and hooks cannot be called there — it has to become a component-scoped callback.
- Wrap the 14 `render(<Teams …>)` calls in `Teams.test.jsx` in `MemoryRouter` — mechanical, no
  assertion changes.
- Behaviour must be identical: row click and `Enter`/`Space` both land on `/teams/:abbr`.

---

## 9. Tests

- **Live-season derivation** — a complete current-season draft yields `season+1` as first-live; an
  incomplete one yields the current season. A 2026 `traded_picks` row is **excluded** once 2026's
  draft is complete. This is the double-count guard; assert it directly.
- **Ownership reconstruction** — an untraded pick belongs to its original roster; a traded one to
  `owner_id`; `roster_id`/`owner_id` are read as roster_ids and resolved through `standings`, not as
  user ids. Include a fixture where the two id spaces would give different answers.
- **`parseKtcPickRows`** — the 36-row shape parses to 36 entries; a malformed or player row is
  ignored; `pickPrice` returns `null` for round 5, never a number.
- **Unpriced rendering** — a round-5 pick renders `—`, is counted in `+ N UNPRICED ASSETS`, and
  contributes **0** to no total (it is absent, not zero).
- **Rank integrity** — every team's total is pick-inclusive when any is.
- **Tile baselines** — roster value and concentration deltas carry the `players only` label;
  weighted age and proj. points render `NO BASELINE`.
- **6b routing** — `Teams.jsx` navigates via the router; existing Teams assertions unchanged.

---

## 10. Smoke

Per CLAUDE.md's recipe (`Colts_420_Reloaded` / **Dynasty 040**). Check against §3's ground truth:

- Portfolio holdings show **9 picks**: 2028 rounds 1–5, 2027 rounds 2–5. **No 2027 1st** (traded), and
  **no 2026 picks at all**.
- Roster value reads `players X + picks Y` with **`+ 2 UNPRICED ASSETS`**.
- The two 5th-rounders render `—`, not `0`.
- Weighted age and Proj. points show `NO BASELINE`; roster value and concentration show a labelled
  delta.
- `/teams` rows still navigate after the §8 change.

---

## 11. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` | `src/api/sleeper.js` gains `getTradedPicks`; new `src/utils/ktcPicks.js` row; Portfolio's row gains picks, the changed headline, and its new `ktcHistory` prop; the `leagueData` key list grows |
| `docs/architecture.md` | `App.jsx` state inventory (master plan §4 flags Slice 7 as growing it) |
| `docs/ui.md` | Portfolio: pick holdings, the inline incompleteness statement, `NO BASELINE` tiles |
| `docs/signal-registry.md` | KTC family — pick rows go from dropped to parsed and rendered |
| `docs/cross-repo-registry.md` | **CR-17 extension — see §12** (plus one staleness fix: `src/utils/coverageBand.js` mirrors `computeKtcSignals`' confidence-band thresholds and is not named in CR-17's app side) |
| `.claude/tasks/data-repo-backlog.md` | **D-4**, see §12 |

---

## 12. Cross-repo impact — CR-17 extension (**not** a new coupling)

**Planning's first draft was wrong here.** It proposed a new `CR-19` and said this routes to the
Claude.ai project. It does not: **`docs/cross-repo-registry.md:175-181` already carries CR-17 · KTC
value snapshots**, and every site the draft named as CR-19's data side — `lib/ktc.mjs`'s verbatim
`name` scrape, its null `position` derivation, `scrapeKtc`'s `${name}|${team}` dedup key, and
`validateKtc` in `lib/validate.mjs` — **is already enumerated inside CR-17**. Its app side already
names `matchKTCToSleeper` and the `{name, team, value, position}` record shape this slice parses.

So this is an **extension of an existing entry, which CLAUDE.md keeps in-repo** ("Extending an
existing entry is *not* this case and stays in-repo"). No Claude.ai round trip. The draft also had
CR-19's direction as `data→app`; **CR-17's is `both`**, because the app runs its own scraper
(`src/api/ktc.js`) emitting the identical record — two independent implementations of one shape.

**Extend CR-17 in both repos, in the same change:**
- **App side** — add `src/utils/ktcPicks.js` (`parseKtcPickRows`, `pickPrice`) and its `App.jsx`
  call site as the first consumer of the pick rows, which `matchKTCToSleeper` has always discarded.
- **Invariant** — add: the 36 pick rows are distinguished **only** by `name` (`position` is `null`,
  `team` is `"FA"`); the app parses that name against
  `^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$`. **The format originates upstream at
  keeptradecut.com — neither repo produces it** — so a change to the scrape's name derivation, its
  dedup key, or any filtering that drops rows silently unprices every pick while every existing
  validator still passes. The app must fail **visibly** (render unpriced), never substitute a number:
  an unparsed row is `null`, never `0`.
- **Staleness fix found in review:** `src/utils/coverageBand.js` mirrors `computeKtcSignals`'
  confidence-band thresholds — a live coupling to a CR-17 trigger — and is not named in its app side.

**CR-17's existing Mirror, emitted verbatim as required:**

> Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope
> every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades
> to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here
> said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone,
> making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*`
> was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer
> of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the
> failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in
> `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on
> Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) —
> something a user watching the app would actually notice, not just something a diagnostic dump would
> show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex
> over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming
> `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record
> shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into
> the same four fields for the live path; the two scrapers are independent implementations of one
> shape, so a KTC markup change can break them separately. Flipping the manifest entry to
> `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so
> the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must
> stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file
> enters the app's 8-snapshot window as if it were good data.

**D-4 for the backlog** (not blocking, batched with D-1/D-2/D-3 after this slice):
`validateKtc` asserts total count 250–600, ≥5 each for QB/RB/WR/TE, non-empty names, and value range —
**nothing about pick rows**. If KTC's DOM changed and all 36 vanished, the scrape would still pass
(500 → 464, still ≥250) and the app would silently show zero priced picks. Ask: add a pick-row floor
(expect 36, or at minimum ≥1 per round 1–4).

---

## 13. Done-definition

- [ ] Live pick seasons **derived**, never hard-coded; 2026 rows excluded while its draft is complete
- [ ] `traded_picks`' `owner_id`/`previous_owner_id` read as **roster_ids**, resolved via `standings`
- [ ] Rounds enumerated to `league.settings.draft_rounds` (5), not 4
- [ ] `ktcPicks.js` is a separate parse path; `matchKTCToSleeper` **unedited**
- [ ] Unpriced renders `—`, counted inline, `PROVISIONAL(no-data)` tagged; never `0`
- [ ] Roster value states `players X + picks Y` + `+ N UNPRICED ASSETS` inline; rank pick-inclusive
- [ ] `getTradedPicks` added to `src/api/sleeper.js` (**not** a new `api/tradedPicks.js`); `ktcHistory` threaded to Portfolio; the second `setState` sits behind the existing `cancelled` guard
- [ ] Tile deltas labelled `players only`; weighted age + proj. points `NO BASELINE`
- [ ] Early/Mid/Late in `gloss`, **not** `percentiles`
- [ ] §8 routing fix landed; Teams tests wrapped, assertions unchanged
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked per §10 against the 9-pick ground truth
- [ ] **CR-17 extended** in both repos (not a new entry); `coverageBand.js` staleness fixed; D-4 appended

---

## 14. Hand-back should report

- The pick list actually rendered, against §3's ground truth (9 picks, 7 priced, 2 unpriced).
- Roster value before and after picks — this is the shipped number that changes.
- Whether concentration's top 4 changed once picks entered it.
- `grep -rn "PROVISIONAL(" src/` output (3 sites at HEAD).
- Anything in §1 that had drifted — the league is live and moves.
