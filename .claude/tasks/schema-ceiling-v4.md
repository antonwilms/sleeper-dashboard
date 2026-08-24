# Raise `MAX_SUPPORTED_SCHEMA` to 4 (F-24 prerequisite)

Third item in the post-dp-v2 batch (D-4 → data `02cf41d`; D-3 → app `c72e170` / data `f3f10c8`).

F-24 bumps `nfl/season-totals` to **schemaVersion 4**. The app hard-gates on
`MAX_SUPPORTED_SCHEMA = 3` and skips any file above it, so **this must ship and be deployed before
the first v4 file is published.** Small change, but it inverts a test and touches a contract.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `MAX_SUPPORTED_SCHEMA = 3` | `src/api/dataStore.js:8` |
| The gate lives **inside `tryDataStore`** and therefore applies to **every family**, not just season-totals | `src/api/dataStore.js:81` |
| **season-totals is the only family above v1.** Every other served family is v1; snapshots are v1–2 and are not read through `tryDataStore` | `manifest.json`, 187 entries |
| **`T5b` explicitly asserts schemaVersion 4 is REJECTED** — the bump inverts it; it is not an incidental edit | `src/api/dataStore.test.js:357` |
| `T5a` asserts v3 is accepted and fetched | `:340` |
| Missing a file to the gate is **not** a hard failure — `tryDataStore` returns `null` and the caller falls through to live Sleeper | `:81-84`, `src/api/sleeperStats.js:146-158` |
| **`docs/integrations.md:213` is stale** — claims season-totals "ship at `schemaVersion: 2`" and the app "advertises `MAX_SUPPORTED_SCHEMA = 2`". Both were true two bumps ago | measured |
| **`docs/cross-repo-registry.md:53` repeats the wrong scoping claim** — "independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals only)" | measured |
| The data repo's **Invariant 4** carries the same wrong claim — "which gates only season-totals files" | `sleeper-dashboard-data/CLAUDE.md:223` |
| `MAX_SUPPORTED_SCHEMA` is a named **CR-02** app-side entry *and* a named CR-02 Trigger | `docs/cross-repo-registry.md:56,60` |

---

## 2. The change

**`src/api/dataStore.js:8` — `3` → `4`.** Update the comment above it too: it currently explains v3
as "adds an additive per-season `team`", which stops being the newest version.

**Do not make the gate per-family.** Considered and rejected, recorded here so it is not re-opened:

- The gate has been family-blind since it was written. Raising the ceiling does not make it newly
  blind — it widens an existing blindness by one version.
- Every other family is at **v1**. For the wider gate to bite, a family would have to jump v1→v4 in a
  single change, which would require app-side work anyway and is not a realistic silent failure.
- Reshaping a shared loader path immediately before F-24 adds risk to the one code path every family
  depends on, in exchange for guarding a hypothetical.

**The correct fix for the mismatch is to make the docs describe the code**, not to reshape the code to
match a doc that was always wrong. Three places say the gate is season-totals-scoped; all three are
false and all three get corrected (§4).

---

## 3. Tests

- **`T5a`** — retarget to **schemaVersion 4** accepted and fetched.
- **`T5b`** — retarget to **schemaVersion 5** rejected without fetching the file. Keep the test's
  intent exactly: *one above the ceiling short-circuits*. Do not delete it, and do not weaken it into
  "some high number is rejected."
- **Add a v3 regression case** — v3 files must still load after the bump (older seasons stay v3 until
  F-24 rewrites them, and F-24 may land forward-only for a while). Neither existing test covers
  "below the ceiling still works" once the ceiling moves.

---

## 4. Docs

| File | Edit |
|---|---|
| `src/api/dataStore.js:5-7` | Comment: v4 is the ceiling; say what v4 is (F-24's field prune) and that older files still load |
| `docs/integrations.md:213` | **Stale, pre-existing** — says v2 / `MAX_SUPPORTED_SCHEMA = 2`. Correct to v4, and note the gate applies to every family |
| `docs/integrations.md:177` | Row is correct; confirm it still reads true |
| `docs/cross-repo-registry.md:53` | Drop the "(season-totals only)" parenthetical — the snapshot-vs-`MAX_SUPPORTED_SCHEMA` independence claim is right, the scoping is wrong |
| `CLAUDE.md` | If it states the ceiling anywhere, update; otherwise no change |
| **data repo** `CLAUDE.md:223` | Invariant 4: "which gates only season-totals files" → the gate applies to **every** family read through `tryDataStore`; season-totals is simply the only one above v1 |

---

## 5. Cross-repo impact

**CR-02 · season-totals schemaVersion & row composition** fires — `MAX_SUPPORTED_SCHEMA` is both a
named app-side entry and a named Trigger.

> **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app
> since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via
> `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks;
> ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections
> **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate.
> Renaming the `TEAM_` pseudo-id scheme is breaking.

**This change does not touch `aggregateWeeks` or per-season `team`** — it only widens what the app
will accept. The Mirror is emitted because the entry is touched, not because a scoring risk is
present here; that risk belongs to F-24's rewrite pass, which is where the `team`-field diff gate is
required.

**Update CR-02's app side** to read `MAX_SUPPORTED_SCHEMA = 4`, in **both** repos' mirrored regions in
the same change. The region is byte-identical as of data repo `0b5294d` — re-run the documented drift
check afterwards and confirm it still reports nothing:

```sh
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
```

---

## 6. Ordering — the whole point of doing this now

**Ship and deploy this before F-24 publishes any v4 file.** If a v4 file lands first, `tryDataStore`
returns `null` for it and the app falls back to the live 18-week Sleeper loop — which does **not**
hard-fail, but recomputes `weeklyPoints` from league scoring instead of the store's `pts_half_ppr`
and **caches that at TTL 999999 with no `sourceLastModified`** (`src/api/sleeperStats.js:203`). A
long-lived wrong-basis cache that will not self-heal is a worse failure than an error would be.

Raising the ceiling early is safe: no v4 file exists yet, so the change is inert until F-24 lands.

---

## 7. Done-definition

- [ ] `MAX_SUPPORTED_SCHEMA = 4`; comment rewritten
- [ ] `T5a` accepts v4; `T5b` rejects v5; new case proves v3 still loads
- [ ] All three "season-totals only" claims corrected (§4), including the data repo's Invariant 4
- [ ] `docs/integrations.md:213`'s two-bumps-stale numbers fixed
- [ ] CR-02 app side updated in **both** repos; drift check reports nothing
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] No smoke needed — nothing user-visible changes until a v4 file exists. Say so in the hand-back
      rather than claiming a smoke was done
