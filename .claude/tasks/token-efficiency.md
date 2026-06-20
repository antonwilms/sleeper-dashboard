# Token-efficiency — quiet the Stop-hook output (A) + trim CLAUDE.md to thin (B)

**Status:** planning artifact (opus). PLANNING ONLY — this session edited no source, config, hook,
or doc file. Handoff to a **sonnet** implementation session (per
[CLAUDE.md → Workflow convention](../../CLAUDE.md#workflow-convention)): read this file, apply the
edits, run `npm test` + `npm run build`, hand back to the user for the manual checks below.

**Model routing.** Both parts are mechanical config/docs edits → **sonnet** work
([routing table](../../CLAUDE.md#which-model-for-which-task)). Planned by opus only because Part A
hinges on the hook's pass/fail mechanism (a correctness risk) and Part B must not nick an invariant
or cross-repo contract — the analysis is the hard part; the edits are find/replace.

**Goal.** Cut the per-turn / per-session Claude Code token tax in Session 2 two independent ways:
- **Part A** — make the Stop-hook's `npm test` + `npm run build` emit compact output on success while
  preserving full detail on failure.
- **Part B** — remove CLAUDE.md bloat that duplicates `docs/` (CLAUDE.md is auto-loaded every
  session; every byte is a tax).

Parts A and B touch disjoint files (`package.json` vs `CLAUDE.md`) and can be applied in either order,
independently.

**Hard constraints honored** (see [CLAUDE.md → Invariants](../../CLAUDE.md#invariants) and
[Cross-repo contracts](../../CLAUDE.md#cross-repo-contracts-with-sleeper-dashboard-data)): no invariant
or cross-repo-contract entry is removed, weakened, or reworded; the done-definition stays
`npm test` + `npm run build` and still blocks on red.

---

## Part A — Quiet the Stop-hook test/build output

### A.0 CRITICAL finding first — how the hook decides pass vs fail (resolves the ordering risk)

**The hook is EXIT-CODE-based, not output-string-matching.** In
[`.claude/hooks/verify-on-stop.sh`](../../.claude/hooks/verify-on-stop.sh) lines 16–24:

```bash
output=$(npm test 2>&1 && npm run build 2>&1)
status=$?                       # exit code of the `npm test && npm run build` chain
if [ "$status" -ne 0 ]; then    # ← branch is purely on the exit code
  ... ; exit 2                   # blocks the stop
fi
exit 0
```

`status=$?` captures the exit status of the `&&` chain (vitest/vite exit non-zero on failure
regardless of reporter or log level), and the gate branches only on `-ne 0`. The captured `output` is
used **only** for the `tail -n 40` failure message, never to decide pass/fail.

**Therefore: the reporter/log-level swap is SAFE — Case "exit-code-based."** A quieter reporter cannot
turn a red run green. **No change to the hook's detection is required, and the hook file does not need
to be edited at all.** (This is the safe case the task flagged; the alternative "switch detection to
exit-code-based first" branch does not apply.)

### A.1 Where to set the quiet reporters — `package.json` scripts (least-invasive, fully-covering)

The reporter / log level is **not currently set anywhere** (vitest uses its default reporter; vite
uses default `logLevel: 'info'`). Set them on the two `package.json` scripts the agent actually runs.

**Why `package.json` scripts and not the hook or the configs:**
- The agent pays for these commands **twice** per turn in Session 2 — once running them *manually* for
  the [Done-definition](../../CLAUDE.md#done-definition-for-code-tasks) (steps 2 & 5) and again via the
  Stop hook. Quieting at the **script** level covers *both* invocations; quieting only inside the hook
  would still leave the manual done-definition runs verbose.
- It leaves the interactive/human surfaces untouched: `dev`, `preview`, `test:watch` (`vitest`), and
  `test:ui` (`vitest --ui`) keep their default rich output — only `test` and `build` change.
- Setting `logLevel` in `vite.config.js` would wrongly quiet the **dev server** too (shared config);
  setting `reporters` in `vitest.config.js` would also change `test:watch`/`test:ui`. The script-level
  flags are strictly narrower.
- The done-definition commands remain literally `npm test` and `npm run build` (constraint satisfied).

**Flags — confirmed against installed versions (vitest `2.1.9`, vite `8.0.12`):**
- `vitest run --reporter=dot` — `dot` is a built-in reporter in 2.1.9 (registered name `dot`;
  `DotReporter` extends `BaseReporter`, which **still prints full failure detail** — error, code-frame,
  diff, and the `Tests: N failed` summary — at the end). One char per test on success ⇒ far fewer
  output lines than the default per-file tree.
- `vite build --logLevel warn` — `warn` suppresses the info-level chunk/size table and the "built in
  Xms" line, **but keeps warnings and errors.** `warn` (not `error`/`silent`) is deliberate: the
  done-definition requires "clean with **no warnings**," so build warnings must stay visible. Build
  failures print to stderr and exit non-zero regardless of level.

### A.2 Edit — `package.json` (`scripts`, lines 8 & 11)

| Anchor | Before | After |
|---|---|---|
| `package.json` `scripts.build` (line 8) | `"build": "vite build",` | `"build": "vite build --logLevel warn",` |
| `package.json` `scripts.test` (line 11) | `"test": "vitest run",` | `"test": "vitest run --reporter=dot",` |

Leave `dev`, `lint`, `preview`, `test:watch`, `test:ui` unchanged.

**Do NOT edit** `.claude/hooks/verify-on-stop.sh` (detection already exit-code-based; it inherits the
quieter scripts automatically), `vitest.config.js`, or `vite.config.js`.

*(Optional, not required — micro-trim of the npm wrapper's own 2 header lines per command: the hook
could call `npm test --silent` / `npm run build --silent`. Tiny gain, and it would mean editing the
hook; recommend skipping to keep the change to one file. Noted only for completeness.)*

### A.3 Part A sequence

1. Apply the two `package.json` script edits (A.2).
2. `npm test` — confirm it runs the full suite, exits 0, and now prints dot output.
3. `npm run build` — confirm it's clean and the per-chunk size table is gone (warnings, if any, still
   print).
4. Hand to the user for the A-side manual checks (blocking-on-red + quiet-on-green) in *Tests to add*.

No hook edit, no config edit, no done-definition text change.

---

## Part B — Trim CLAUDE.md back to "thin"

**Method.** Remove only content that (a) is deep behaviour duplicating a `docs/` file whose canonical
home is named and verified below, and is (b) **not** an invariant, **not** a cross-repo contract, and
**not** pointed-to by an invariant. Everything proposed is a removal or a condensation with exact
before/after — no rewriting of accurate sections. Net effect ≈ −30 lines from a 284-line file, all
duplicative.

**Explicitly OUT of scope (audited, deliberately KEPT):**
- The whole **Invariants** block (CLAUDE.md §Invariants) and **Cross-repo contracts** block — untouched
  per the hard constraint.
- **`### playerRows pipeline` (lines 258–269)** — duplicates `docs/architecture.md` §playerRows
  pipeline, **but RETAINED**: the load-bearing invariant *"playerRows pipeline order is load-bearing.
  Trace the full pipeline **(section below)**…"* (line 153) points at this exact section. Removing or
  condensing it would orphan/weaken the invariant's pointer, and rewording the invariant is forbidden.
- **`### Component data access` (lines 282–284)**, the **Routing / IA** table, and the
  `src/api` / `src/components` / `src/context` / `src/hooks` tables — concise file→responsibility
  navigation, appropriate for CLAUDE.md; left as-is.
- `src/utils` cells that carry a *don't-unify / intentional-divergence* caveat (e.g.
  `regressionSignals.js`, line 121) — left as-is; the caveat is a load-bearing warning.

### Edits grouped by file — all in `CLAUDE.md`

#### B.1 — `## State and data flow`: drop the duplicated state inventory + shape (lines 229–256)

Canonical home (verified): [`docs/architecture.md`](../../docs/architecture.md) → **§ State management**
(the `useState` inventory, incl. `leagueData`/`careerStats`/`ktcMap`, lines ~24–60) and **§ leagueData
assembly** (the full `leagueData` object shape, lines ~61–77). architecture.md's line 1 declares it the
"Deep reference for the App.jsx state model…". The CLAUDE.md copies are shorter and purely duplicative;
neither subsection is referenced by any invariant pointer.

**Remove** the `### Key useState in App()` subsection **and** the `### leagueData shape` subsection —
i.e. everything from line 229 through the closing ``` ``` of the shape block at line 256 — and replace
with a single pointer. Keep the `## State and data flow` header (227) and the untouched
`### playerRows pipeline` subsection (258 onward).

> **Replace lines 229–256 with:**
> ```
> > **App state & `leagueData` shape:** App.jsx owns all React state (see the *App.jsx owns all state* invariant); children get props or read `ProfileDataContext`. The `useState` inventory and the `leagueData` object shape live in [docs/architecture.md](docs/architecture.md) → *State management* and *leagueData assembly* — kept there to avoid drift, not duplicated here.
> ```

(The `### playerRows pipeline` subsection immediately below stays verbatim — it is invariant-anchored.)

#### B.2 — `### Caching`: drop the two bullets that duplicate integrations.md (lines 279–280)

Canonical home (verified): [`docs/integrations.md`](../../docs/integrations.md) — per-function cache
TTLs (the tables at lines ~255/270/278/281/285/294), **stale-cache invalidation** (the `weeklyStatus`
sentinel, line ~211), and the **nflverse-via-data-store / CORS** explanation (data-store flow lines
~128–138). The nflverse bullet is *additionally* duplicated by CLAUDE.md's own `src/api` table
(`nflRoster.js`/`nflDraft.js` rows) and the **nflverse roster/draft** Cross-repo contract.

Keep the first three bullets (the `cache.js` API + TTL defaults — genuine thin nav). **Remove these two:**

> **Remove (line 279):**
> ```
> - Stale cache detection: check a field that old entries lack (e.g. `sample.dnpWeeks !== undefined` in `sleeperStats.js`)
> ```
> **Remove (line 280):**
> ```
> - **nflverse data is loaded via the data store** (`nflRoster.js`, `nflDraft.js`). Direct nflverse release URLs are CORS-blocked in the browser; `sleeper-dashboard-data` ingests them server-side and publishes JSON via jsDelivr.
> ```

Optionally append a pointer clause to the surviving bullet at line 278 (keeps the breadcrumb without
the detail):

> **Change (line 278):**
> ```
> - Pass TTL explicitly to make intent clear (see `sleeper.js` for examples)
> ```
> **to:**
> ```
> - Pass TTL explicitly to make intent clear (see `sleeper.js`). Per-function TTLs, stale-cache invalidation, and the nflverse-via-data-store path: [docs/integrations.md](docs/integrations.md).
> ```

#### B.3 — `src/utils` table: condense the over-detailed `durabilitySignals.js` cell (line 115)

Canonical home (verified): the contributor-evidence thresholds + adjacent-season rescue are documented
in [`docs/projection.md`](../../docs/projection.md) **Step 6** (line ~28: "contributor evidence (snap
share `off_snp/tm_off_snp ≥ 0.40`, or high start rate, or per-game volume…)") and
[`docs/signal-registry.md`](../../docs/signal-registry.md) **Durability** row (line ~78, incl. the
`≥ 0.40` snap test and pre-2020 fallback). The CLAUDE.md cell restates the algorithm; condense it to
nav + pointer.

> **Before (line 115):**
> ```
> | `durabilitySignals.js` | `wasContributorSeason`, `classifyInjurySeason` — shared helpers imported by `dynastyScore.js` (iterates `allSeasons`), `seasonProjection.js` (iterates `qualifying`), and `projectionSignals.js` (bounce-back). Contributor evidence: snap share `off_snp/tm_off_snp ≥ 0.40`, or start rate ≥ 0.50 with ≥ 4 starts, or per-game volume above position floor. Adjacent-season rescue (±1 year) prevents full-IR seasons from going uncounted for established starters. Backup seasons with no contributor evidence are excluded. |
> ```
> **After:**
> ```
> | `durabilitySignals.js` | `wasContributorSeason`, `classifyInjurySeason` — shared durability helpers imported by `dynastyScore.js`, `seasonProjection.js`, and `projectionSignals.js`. Contributor-evidence thresholds + adjacent-season rescue: see docs/projection.md (Step 6) and docs/signal-registry.md (Durability). |
> ```

### B.4 — Implementer verification before each Part B edit

For B.1–B.3, open the named `docs/` anchor and confirm the content is present **before** deleting from
CLAUDE.md (read narrowly — the line numbers above point you straight there). If any anchor does *not*
contain the detail (it should — verified this session), stop and report rather than delete; do not move
text into `docs/` as part of this task (the homes already hold it).

---

## Docs updates

Every concrete edit and the file/section/line anchor for it is enumerated above. Summary:

| File | Section / anchor | Change |
|---|---|---|
| `package.json` | `scripts.build` (L8), `scripts.test` (L11) | add `--logLevel warn` / `--reporter=dot` (Part A) |
| `CLAUDE.md` | `## State and data flow` → `### Key useState in App()` + `### leagueData shape` (L229–256) | replace with one pointer to docs/architecture.md (B.1) |
| `CLAUDE.md` | `### Caching` bullets (L279, L280; opt. L278) | remove 2 duplicated bullets; opt. pointer clause (B.2) |
| `CLAUDE.md` | `src/utils` `durabilitySignals.js` cell (L115) | condense to nav + docs pointer (B.3) |

- **`docs/*.md`:** **no edits.** B.1–B.3 only *remove* content whose canonical copy already lives in
  `architecture.md` / `integrations.md` / `projection.md` / `signal-registry.md`. Nothing is added or
  changed in `docs/`.
- **`README.md`:** **no edits.** README's Documentation index points at `docs/`; it does not reference
  the trimmed CLAUDE.md subsections.
- **CLAUDE.md Commands / Done-definition text (Part A):** **no edits.** The commands stay `npm test` /
  `npm run build`; their comments ("must be clean before done") remain accurate. Deliberately do **not**
  add explanatory comments about the quiet reporters — that would re-add bytes, against Part B's intent.
- **CLAUDE.md Self-maintenance rule:** no trigger — no `src/` module/command/invariant/data-shape/signal
  is added, renamed, or removed.

---

## Tests to add

**No Vitest additions.** Part A changes reporter/log-level only (no behaviour, no code paths); Part B is
docs/config text. Per the [Done-definition](../../CLAUDE.md#done-definition-for-code-tasks),
non-behavioural changes need no tests. The implementer should still run `npm test` (full suite, must
stay green) and `npm run build` (clean) as the regression guard — and must **not** create failing tests
or start any server.

### Manual post-implementation checks — for the USER to run (not the implementer)

1. **Hook still blocks on red (the load-bearing property).** In a throwaway working state: make one
   tracked change so the tree is dirty, then temporarily break a single assertion in any existing test
   (e.g. flip an `expect`). End a turn (or run the hook's body manually). **Confirm:** the Stop hook
   blocks (exit 2 / "Done-definition failed…") and the **failing test's detail still appears** in the
   last-40-lines feedback under the `dot` reporter. Then revert the broken assertion.
2. **Green run is now quiet.** With a clean, passing tree + one trivial tracked edit: run `npm test` and
   confirm compact **dot** output (no per-file pass tree); run `npm run build` and confirm the per-chunk
   **size/info table and "built in Xms" line are gone** while any real warning would still print. Revert
   the trivial edit.

No dev server, no `npm run preview`, no browser smoke — none are needed for either check.

---

## Cross-repo impact

**None.** Part A touches only local `package.json` scripts and the local Stop hook's inputs. Part B
removes app-internal duplication from CLAUDE.md; the **Invariants** and **Cross-repo contracts** blocks
(the only sections mirrored in `sleeper-dashboard-data`) are untouched. No snapshot shape, manifest
field, schema, or other contract changes. `sleeper-dashboard-data` needs no mirroring.

---

## Full step sequence (both parts)

1. **(A)** Edit `package.json` `scripts.test` + `scripts.build` (A.2). *(Hook/config: no edit — A.0.)*
2. **(B.1)** Replace CLAUDE.md L229–256 with the architecture.md pointer; leave `### playerRows
   pipeline` intact.
3. **(B.2)** Remove CLAUDE.md Caching bullets L279–280 (optional pointer clause on L278).
4. **(B.3)** Condense the `durabilitySignals.js` cell (L115) — verifying the projection.md/
   signal-registry.md anchors first (B.4).
5. `npm test` (green, now dot) + `npm run build` (clean, now `warn`) as the regression guard.
6. Hand back to the user for the two manual checks above. Do not start any server.
