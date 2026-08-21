# Slice 5a — Market: VOLUME rename, the TREND gutter, and ACT removal

**Program:** [dp-v2.md](dp-v2.md). Follows [dp-v2-4c-environment.md](dp-v2-4c-environment.md)
(landed `0d0207d`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `468cae0` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

---

## 0. Slice 5 splits, on the seam that has worked three times

| | Scope | New data threading |
|---|---|---|
| **5a — this file** | `PRODUCTION` → `VOLUME`, the two-group set control, the persistent **TREND gutter**, the `TrendCell` name collision, **ACT removed from nav** | `ktcHistory` only |
| **5b — next** | The **Efficiency** column set (per-position) and the four **environment filters** | `gameLogsByYear` + `teamContextByYear` into Market |

5b's two halves share one plumbing change, so they belong together; 5a is everything that does not
need it.

**Note on the fourth set.** After 5a the set control shows **three** members in two groups —
`MODEL & MARKET [VALUE][OUTLOOK]` · `ON FIELD [VOLUME]`. `EFFICIENCY` joins the right-hand group in
5b. A group with one member is a legitimate intermediate state; the grouping is what 5a delivers.

---

## 1. Confirmed against live source (`468cae0`)

| Fact | Site |
|---|---|
| `COLUMN_SETS = ['value', 'outlook', 'production']`, persisted to `localStorage['market-column-set']` and validated on read — **an unrecognised value silently falls back to `'value'`** | `market/Market.jsx:26,84-86` |
| Market's props are exactly `playerRows, loaded, careerStats, playerMap, seasonProjections, myTeamName, onOpenPlayerDetail` — **no `ktcHistory`, no Slice 2/4c data** | `Market.jsx:235-238` |
| **A module-local `function TrendCell({ trend })` already exists** — the Outlook set's Snap/Opp trend cell, rendering latest-vs-prior share with an arrow and a % delta | `Market.jsx:182`, used `:563-564` |
| `dp/TrendCell.jsx` (Slice 1) is the primitive: series → signed delta with glyph → window label, three scales, sorts on delta | `dp/TrendCell.jsx` |
| `loadKtcHistory` returns **`series[sleeperId]`** — an ascending-by-date array of value points — alongside the window metadata | `utils/ktcHistory.js:161,171,216-233` |
| `computeKtcSignals(series)` returns `ktcHistDelta`, `ktcHistDeltaPct`, `ktcHistConfidence`, `ktcHistWindowSpanDays` (and more) | `ktcHistory.js:254-300` |
| `ktcHistory` is already App.jsx state and already flows into the projection | `App.jsx:139,525` |
| `computeKtcRecentDelta` remains deleted — **and is not needed**; `computeKtcSignals` supersedes it | `grep` → absent |
| **`NAV_GROUPS` references `PRIMARY_NAV` by ARRAY INDEX** (`PRIMARY_NAV[2]`, `[3]`) — the two lists are positionally coupled | `shell/navItems.js:22-26` |
| `PRIMARY_NAV` is the flat list `BottomTabBar` consumes, capped at 5 | `navItems.js:5-11` |
| `/board` and `/trade` are gated placeholders with live routes | `CLAUDE.md` routing table |

---

## 2. `PRODUCTION` → `VOLUME`, and the migration the rename requires

The design renames the set because `VOLUME` is shorter and sharpens the contrast against
`EFFICIENCY` (5b). Rename the **key**, not just the label — `'production'` → `'volume'` — so the
persisted value and the code agree.

**This needs a one-time localStorage migration, and without it the bug is silent.**
`market-column-set` holds `'production'` for every user who has ever selected that set. The validated
read (`Market.jsx:84-86`) returns `'value'` for anything not in `COLUMN_SETS` — so after the rename
those users silently land on Value with no error and no indication their choice was dropped.

Map `'production'` → `'volume'` on read, once, and write the migrated value back. Do the same check for
**`market-production-season`**, the Production-set-only season selector key
(`CLAUDE.md` → `market/Market.jsx` row): decide whether to rename it to match or leave it, and say
which — but do not leave a key named for a set that no longer exists without a comment saying why.

**Also check `market-sort`.** Sort state is validated per active set against a `SORTABLE_KEYS`
allow-list, with a fallback to that set's default. Confirm a sort persisted under the old set name
still resolves — if the stored payload carries the set key, it needs the same migration.

---

## 3. The two-group set control

```
MODEL & MARKET          ON FIELD
[ VALUE ][ OUTLOOK ]    [ VOLUME ]
```

Two labelled groups rather than four peers. The grouping is the point: it says the left pair is what
the model and the market think, and the right pair is what happened on the field. Mono micro-label
above each group, in the established uppercase style.

Adding a fifth set later should extend the right-hand group without touching the left.

---

## 4. The TREND gutter

**A gutter, not a set member.** It sits immediately right of `PLAYER`, inside its own hairline, and
**persists across every column set** — market movement is context for every other reading. Left of the
name it would compete with scanning; right of it, it reads as part of the identity.

### 4.1 Data — already available, needs threading
Everything comes from `ktcHistory`:
- **series** — `ktcHistory.series[playerId]`, ascending by date, for the sparkline.
- **delta, window, band** — `computeKtcSignals(series)` → `ktcHistDeltaPct` (the signed delta),
  `ktcHistWindowSpanDays` (the window label), `ktcHistConfidence` (the band, which gates rendering per
  `dp/TrendCell`'s contract: `low` suppresses the series, `none` renders `—`).

**Thread `ktcHistory` into Market as a prop.** Market is props-only by design (CLAUDE.md's two
data-access patterns) — do **not** switch it to `ProfileDataContext`. Add one explicit prop; keep the
list explicit.

**Compute the per-player signals once, in a memo keyed on `ktcHistory`** — not per row per render.
~600 rows × a signals computation on every sort or filter change is the obvious performance trap.

### 4.2 Use the Slice 1 primitive at `cell` scale
`dp/TrendCell` at `scale="cell"` (h14, bar 3px, gap 1px). Pass `values`, `delta`, `window` and `band`;
it owns the ordering and the band gating. **Do not** re-implement the encoding locally.

### 4.3 It sorts on delta
Add a sort key for the gutter to **every** set's `SORTABLE_KEYS` — it is persistent, so it must be
sortable from all of them. Sort on the **delta**, never on shape. Null deltas sink via the existing
`compareNullsLast`.

### 4.4 Resolving the `TrendCell` collision
`Market.jsx:182` defines a module-local `TrendCell` for the Outlook set's Snap/Opp cells. Importing
`dp/TrendCell` into the same module is a redeclaration.

**Rename the local to `UsageTrendCell`.** Slice 1's task file offered "rename or — more likely correct
— delete it, since a snap-share trend *is* series + delta + window", but deleting means re-expressing
those two Outlook columns through the primitive, which changes what they look like and is not this
slice's scope. Rename now; converging them is a later, deliberate choice.

---

## 5. Remove the ACT group

The design: *"`ACT` is removed until it has a member. A rail with a dead third undermines the rest of
it."* Both members are gated placeholders — one third of the navigation currently leads nowhere.

- Remove the `act` group from `NAV_GROUPS`.
- Remove `trade` and `board` from `PRIMARY_NAV`, so they leave the mobile tab bar too.
- **Keep both routes.** `/trade` and `/board` still resolve and still render their gated placeholders;
  they simply are not linked. Do not add redirects — these are not retired routes like `/roster`, they
  are unbuilt ones.

**Fix the positional coupling while you are here.** `NAV_GROUPS` references `PRIMARY_NAV[2]` and
`[3]` by index, so removing entries from `PRIMARY_NAV` silently re-points the groups at whatever
shifts into those slots. Reference by `key` (a small lookup), not by index. This is the kind of
coupling that produces a wrong nav rather than an error.

Check `navRouting.test.jsx` and `AppShell.test.jsx` — both assert nav structure and will need updating
to the new outcome (not merely edited to pass).

---

## 6. Tests

- **Migration** — a stored `'production'` resolves to `'volume'` and is written back; an unrecognised
  value still falls back to `'value'`.
- **Gutter persistence** — the TREND column renders under all three sets, and is sortable from each.
- **Gutter encoding** — `low` band suppresses the series but keeps delta + window; `none` renders `—`;
  a null series renders `—` rather than an empty sparkline.
- **Sort** — sorting by TREND orders on delta with nulls last.
- **`UsageTrendCell`** — the Outlook Snap/Opp cells render exactly as before the rename (a rename
  should be behaviour-preserving; assert it).
- **Nav** — `NAV_GROUPS` has no `act`; `PRIMARY_NAV` excludes trade/board; `/trade` and `/board` still
  route to their placeholders.
- Existing Market tests pass unedited except where they assert the old set key or the old nav — those
  are required updates, and should assert the correct new outcome.

---

## 7. Smoke

Per `CLAUDE.md` → Workflow convention:
- the set control shows two labelled groups; switching sets keeps the TREND column in place;
- a player with a healthy KTC series shows a sparkline + signed delta + window; one with a short
  series shows delta + window and no sparkline; one with none shows `—`;
- sorting by TREND puts the biggest risers together;
- the rail has no ACT group, and navigating directly to `/trade` still shows its placeholder;
- reload with a previously-selected Production set and confirm you land on **Volume**, not Value;
- no console errors.

---

## 8. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` routing table + nav-chrome paragraph | ACT removed; `/board` and `/trade` are route-only |
| `CLAUDE.md` `market/Market.jsx` row | The set rename, the migration, the TREND gutter, the `ktcHistory` prop |
| `docs/ui.md` → *Market* | Same, plus the two-group control and the `UsageTrendCell` rename |
| `.claude/tasks/data-repo-backlog.md` | Only if this slice surfaces a new data-repo ask (done-definition step 7) |

---

## 9. Cross-repo impact

**Expected none** — no served shape, no stat key, no coverage claim. But **`docs/signal-registry.md`
carries a KTC-history row**, and rendering `ktcHist*` in Market for the first time may change its
Current-use cell. **Resolve that in planning, not at implementation time** — CLAUDE.md makes the
`Mirror` text a Session-1 deliverable, and this program has now had CR-18 fire on three slices that
each expected "none".

---

## 10. Done-definition

- [ ] `'production'` → `'volume'` everywhere, **with the localStorage migration** and the
      `market-production-season` decision stated
- [ ] Two-group set control
- [ ] TREND gutter right of `PLAYER`, present under **every** set, sortable from each, using
      `dp/TrendCell` at `cell` scale
- [ ] Per-player KTC signals computed in **one memo**, not per row
- [ ] `ktcHistory` threaded as an explicit prop; Market still props-only (no context)
- [ ] Local `TrendCell` renamed `UsageTrendCell`; Outlook cells behaviourally unchanged
- [ ] `ACT` gone from rail and tab bar; `/trade` and `/board` still route
- [ ] `NAV_GROUPS` references `PRIMARY_NAV` by key, not index
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect the standing three
- [ ] Smoked per §7

---

## 11. Hand-back should report

- What you did with `market-production-season`, and why.
- Confirmation that the Outlook Snap/Opp columns are visually unchanged by the rename.
- The three TREND states you saw in the smoke (full / delta-only / `—`) and on whom.
- The `signal-registry.md` / CR-18 determination.
- Anything in §1 that had drifted from `468cae0`.
