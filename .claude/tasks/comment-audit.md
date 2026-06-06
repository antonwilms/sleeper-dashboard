# Comment-hygiene audit — sleeper-dashboard

**Type:** comment-only cleanup (non-behavioural). No code edits, renames, reformatting, reflowing, or moving.
**Model for implementation:** sonnet — apply the DELETE/CORRECT list below mechanically.
**Scope audited:** all of `src/` except `*.test.js`, `src/__tests__/`, `src/__fixtures__/` — 37 files, ~9.9k lines.

---

## Headline

This codebase is **exceptionally well-curated**. It has been through many opus-planned batches with strong comment discipline, and the overwhelming majority of comments are load-bearing: rationale ("why"), calibration/data-quality caveats, confirmed-external-format notes (KTC DOM structure, CFBD `statType` names, nflverse columns), capture-only markers, intentional-divergence notes, and section-navigation headers in long files. **All of those are KEEP.**

The genuine dead-comment yield is therefore **small and honest: 2 DELETE, 0 CORRECT.** I verified each candidate against its surrounding code (and rejected two that looked stale but weren't — see "Verified-and-kept"). Per the "when uncertain, KEEP" rule I deliberately preserved a large class of borderline section-marker and diagnostic-label comments; the notable ones are listed under "Borderline — deliberately kept" so a future session doesn't re-litigate them.

---

## DELETE / CORRECT list (per file)

### `src/utils/fantasyPoints.js`
- **Anchor:** function `testFantasyPoints()`, the comment line immediately above `const expected = 24.00;` (currently the 2nd of two comment lines, just below `// 300 * 0.04 = 12.00  +  3 * 4 = 12.00  →  24.00`).
  **Verbatim:** `// (the prompt said ~39, but the arithmetic shown works out to 24)`
  **Verdict:** `DELETE`
  **Reason:** Development-artifact noise — references "the prompt" (an authoring-session spec that no longer exists for any reader) and a discrepancy with it; says nothing about the code. The line above it (`// 300 * 0.04 … → 24.00`) already justifies `expected = 24.00` and stays. Delete only this one line.

### `src/utils/exportData.js`
- **Anchor:** the ZIP export/download function (the one containing `await zip.generateAsync({ type: 'blob' })`), the comment immediately above `const url = URL.createObjectURL(blob)`.
  **Verbatim:** `// Trigger download`
  **Verdict:** `DELETE`
  **Reason:** Pure restatement of the canonical browser-download idiom directly below it (`createObjectURL` → `<a download>` → `click()` → `removeChild` → `revokeObjectURL`). Adds no rationale. Low-stakes but it is the clearest pure-restatement comment in the audited tree. (If you prefer maximal conservatism, this is the one entry safe to skip — flagged honestly.)

That is the complete DELETE/CORRECT set. Everything else in `src/` is KEEP by default.

---

## Verified-and-kept (looked removable, confirmed NOT)

Recorded so Session 2 doesn't second-guess these:

- **`fantasyPoints.js` ~line 80** — `// --- sanity check (runs once at module load during development) ---`. Looked like a stale claim, but `testFantasyPoints()` **is** invoked at the bottom of the module (the call line `testFantasyPoints();`). The comment is accurate → **KEEP**. (The adjacent `// 300 * 0.04 … → 24.00` derivation is also KEEP — it explains the `expected` magic number.)
- **`dynastyScore.js`** `// ── Verification logging (remove after confirming) ──` (above the injury-season `console.log` block) — a temporary-diagnostic marker, not stale and not restatement; it encodes "this logging is removable." **KEEP** (uncertain → keep). Same logic for the `[age curve]` "Always log so we can see when the cap is active" rationale.
- **`App.jsx`** `// ── DIAGNOSTIC: retired/empty player entries ──` / `// ── END DIAGNOSTIC ──` (around the Brady/Ryan + no-data-player `console.log` block). The bracket comments delimit a live, removable diagnostic block; deleting only the comments would orphan the block and lose the "this is diagnostic/removable" signal. **KEEP.** (The *code* block is a plausible future dead-code-removal target, but that is out of scope for a comment-only audit — not acted on here.)
- All trailing inline comments sampled across `dynastyScore.js`, `seasonProjection.js`, `App.jsx`, `cache.js`, `teamContext.js` (e.g. `// cancels in rawRatio`, `// helper returns null when scoringSettings is falsy; inline used 0`, `// 'thisWeek' | 'nextSeason'`, `// don't reach back more than 3 seasons`) — all carry rationale or enum/sentinel meaning. **KEEP.**

---

## Borderline — deliberately kept (per "when uncertain, KEEP")

A large, consistent class of comments was considered and intentionally preserved. Listing the categories so the decision is on record and Session 2 does **not** remove them:

- **Section/navigation headers** (`// ───── X ─────` banners and `// ── Step 5h: … ──` step markers) throughout `dynastyScore.js`, `seasonProjection.js`, `App.jsx`, `PlayersTab.jsx`, `usePlayerProfile.js`, `Tooltip.jsx`, `SpiderChart.jsx`, `ktcHistory.js`, `careerComps.js`, etc. These are wayfinding in long files, not restatement of an adjacent code line. KEEP.
- **Return-object field-group labels** in `usePlayerProfile.js` (`// Identity`, `// Positional ranks`, `// Career data`, `// Comparables`, …) — group dozens of fields in one large object literal; navigation, not single-line restatement. KEEP.
- **Brief block-intent labels** like `App.jsx` `// Owner map`, `// Sparkline: last 5 seasons…`, `PlayersTab.jsx` `// Escape key to close`, `// Reset to page 1 whenever filters change`, `cfbd.js`/`sleeperStats.js`/`nflDraft.js` `// (1) Cache check` / `// (2) Data store` / `// (3) Live API` — they label multi-line blocks and aid scanning; not the `// increment week` single-line-restatement pattern. KEEP.
- **Dev-diagnostic labels** (`App.jsx` `// Verification logs`, `// Verification: log CeeDee Lamb if present`) — accurately describe live diagnostic logging; not stale, not code-line restatement. KEEP.
- **`Tooltip.jsx`** `// Arrow: a small rotated square clipped to a triangle … but simpler: just a rotated square …` — verbose but accurately describes the chosen CSS technique (does not contradict the code), so neither DELETE nor CORRECT. KEEP.

If the user wants a more aggressive sweep, the strongest *additional* candidates would come from the "Brief block-intent labels" and "field-group labels" categories — but removing them trades scannability for terseness and risks the over-deletion this audit is meant to avoid. Recommend leaving them.

---

## Promote to CLAUDE.md/docs

**None required.** Neither DELETE entry is invariant-bearing. Every load-bearing invariant comment encountered is already mirrored in CLAUDE.md or `docs/`:
- trajectory floored-vs-unfloored divergence — `dynastyScore.js` inline note + docs/dynasty-scoring.md + docs/projection.md;
- capture-only "does not move projectedPPG" (`ktcHist*`, `positionMultiplicity*`, aDOT) — CLAUDE.md invariant + seasonProjection.js inline;
- Strict Mode `cancelled`-flag — CLAUDE.md + docs/architecture.md;
- dynastyScore-vs-seasonProjection draft-slot divergence — CLAUDE.md invariant;
- `pass_rtg`/`cmp_pct` are per-week, don't use directly (C4 trap) — `efficiencyMetrics.js` WARNING + projection-c4 task doc;
- `combinedNewFactor` envelope calibration — seasonProjection.js inline + the D3 task file.

*Optional (low priority, not blocking):* `ktcHistory.js`'s "Coupling note" — `loadKtcHistory` reads the `'data-store/manifest'` IndexedDB key directly and warns "if `dataStore.js` renames its manifest cache key, update `MANIFEST_CACHE_KEY`." This is a real cross-module coupling currently captured only inline. It is well-placed where it is; promote to CLAUDE.md only if you want cross-module couplings centralized. **Not** a deletion target either way.

---

## Docs updates

**None.** A comment-only change alters no behaviour, signature, data shape, factors key, or module inventory, so no `docs/` or CLAUDE.md navigation/invariant text needs to change. (Confirmed: neither DELETE touches a documented contract.)

---

## Tests to add

**None.** This is a non-behavioural change; CLAUDE.md's done-definition point 1 explicitly exempts comment/dead-code removal from the "new behaviour needs a test" rule. No test asserts comment text. Session-2 done-definition is simply: `npm test` green + `npm run build` clean (sanity that nothing was accidentally edited beyond the two comment lines).

---

## Cross-repo impact

**None.** Neither comment relates to a `sleeper-dashboard-data` contract. Note `exportData.js` *does* host the cross-repo snapshot-routing logic (`classifyKey`), but the deleted `// Trigger download` line is in the unrelated browser-download function, not in `classifyKey` or any path-routing comment (those routing comments — `// season-totals/<year> → nfl/season-totals/<year>.json`, etc. — are KEEP, as they document the routing contract). No data-repo coordination required.

---

## Notes for Session 2
- Apply exactly the two DELETE entries above — delete the whole comment line in each case, nothing else. Do not touch adjacent comment lines, code, or whitespace beyond removing the single line.
- Use the function-name + adjacent-code anchors (not line numbers) to locate each, since the first deletion shifts subsequent line numbers in unrelated files not at all, but within a file always re-find by anchor.
- If either comment no longer matches the verbatim text (codebase drift since this audit), **stop and report** rather than guessing — do not delete a comment that doesn't match.
