# App-side ask: line anchors in the cross-repo registry's app-side triggers

**Type:** measured ask, not an instruction. Written by the data repo (`anchor-policy.md`,
2026-08-31) into this repo's tracked `.claude/tasks/` — the data repo gitignores `.claude/`
entirely, so this is the only durable place the ask can live.

**This is not asking for a spec amendment.** The entry-format definition in
`docs/cross-repo-registry.md` already requires triggers to be "concrete paths, exported
symbols, constant names or served JSON paths — never a category." Nothing here proposes
changing that text. The app repo owns the format definition and gets to decide whether line
anchors are worth keeping on its own side — this file hands over evidence for that decision,
not a directive.

---

## 1. What the data repo just did to its own (near) side

Under the registry's own rule — *"the near side of `‖` is a maintained cache… the reviewer
re-verifies it against live source on every review"* — the data repo stripped every `:NNN`
line-number anchor from its own `Data side` fields and the data half of `Triggers` across all
21 entries, replacing each with the symbol/constant name alone (or, where no symbol existed,
re-deriving one from what the entry actually describes — never by following the stale
number, which routinely pointed at closing braces or unrelated functions).

**Result:** 105 data-side cache-field line anchors → 0. A new recurrence-guard test
(`test/registry.test.mjs`, data repo) now asserts every named symbol resolves — as a whole
word — in the file its entry claims, file-scoped (not a tree-wide grep), so it reds on a
rename/move/delete and stays green through insertion or reordering. 11 contract-text anchors
(inside `Mirror`/`Invariant` prose, a different kind of edit) were left untouched by design.

## 2. What that audit measured on the app side

Using the same parser, before touching anything: **136 app-side cache-field anchor
occurrences**, of which only **33 (24%)** carry an adjacent symbol/constant name (verifiable
by grep) and **103 (76%)** are bare `:NNN`, comma lists (`:87,93,148,157`), or ranges
(`src/utils/gameLog.js:130-160`) with no locator at all.

That split is worse than the data side's own starting point (57/107, 53%). The data repo
could not convert this side — 103 of 136 need `src/` read against live source to re-derive a
symbol, which is exactly the read this repo's reviewer does and the data repo's cannot.

## 3. The field-block parser, if useful here

`lib/registry.mjs` (data repo) is a small, dependency-free module: it extracts the mirrored
region, walks it entry-by-entry accumulating each `- **<Field>:**` line **plus its indented
continuation lines** into one block (required for CR-19, the only entry whose fields wrap —
a line-scoped reader either misses its wrapped anchors or, if naively extended to "also read
continuations," eats the six *frozen* app-side anchors sharing that same wrap), and splits
`Triggers` at the **first** `‖` in the whole block, not the first line. The anchor regex
accepts every live form: `symbol:NNN`, `file.ext:NNN`, bare `:NNN`, ranges, comma lists.

It is plain ESM, no repo-specific I/O beyond `fs.readFileSync` at the call site — portable if
this repo wants to run the same audit (or write its own app-side recurrence guard) against
`docs/cross-repo-registry.md`.

## 4. The two rules the data repo applied, if this repo converts its own side

- **Rule A — an adjacent symbol exists → drop the number, keep the symbol.**
  `` `MIN_SCHEDULE_GAMES:45` `` → `` `MIN_SCHEDULE_GAMES` ``.
- **Rule B — no symbol → re-derive one from what the entry *describes*, never from the
  number.** A stale anchor that still resolves to *some* line is worse than a dangling one —
  it reads as confirmation while pointing at the wrong code. (Live example the data repo hit:
  six occurrences of `scripts/update-nfl.mjs:93` all claimed "the writer"; the real writer,
  `writeJsonStable`, was 65 lines away at `:158`. All six now name `updateNfl`'s
  `writeJsonStable` call by symbol, not line.) A bare filename with nothing else is not an
  acceptable result of Rule B — the spec calls that a category.

## 5. Why the data repo isn't proposing this land here directly

Two reasons, not one:

1. **It isn't the data repo's call.** `README.md` (data repo) states plainly that the app
   repo owns the format definition; the data repo mirrors it exactly. Extending an existing
   entry stays in-repo per the workflow convention, but *authoring normative prose in a
   file the other repo owns* isn't "extending an entry" — it's a different kind of edit, and
   the ownership question doesn't have a clean answer from this side of the mirror.
2. **103 anchors need `src/` to convert, and only this repo's reviewer reads `src/`.** A
   partial conversion (33 of 136) would leave the other 103 exactly as stale as today, just
   fewer of them — not obviously worth a change that touches every entry's `Triggers` line.

## 6. What this repo might decide

Any of these are legitimate outcomes — this is not a request that funnels toward one:

- **Do nothing.** Line anchors stay, on the reasoning that this repo's reviewer *can*
  re-verify them against live `src/` on every review (the registry's own re-verification
  duty already covers it), so the precision is worth the maintenance cost here even though
  it wasn't worth it on the data side.
- **Convert the 33 symbol-carrying anchors** (Rule A only) — mechanical, low-risk, closes
  part of the gap without touching the 103 that need re-derivation.
- **Convert all 136**, re-deriving symbols for the 103 bare ones against live `src/` (the
  data repo's own effort here took a full slice — CR-19's wrap alone has defeated three
  prior line-oriented attempts, `rate-keys-lng`'s `grep -m1` and `test-determinism`'s review
  among them; budget for it accordingly).
- **Write an app-side recurrence guard** analogous to `test/registry.test.mjs`, independent
  of whether anchors are stripped — it would catch symbol rename/move/delete regardless.

If this repo does convert its side, land it as its own change — this task file does not ask
for it to ride along with anything else, and the data repo's `anchor-policy.md` commit
already stands alone.

---

## Provenance

- Data repo commit implementing the near-side conversion: see `anchor-policy.md`'s own
  commit message for the exact before/after counts (105→0 data-side, 136→136 app-side,
  verified equal before and after with the same parser).
- Full audit and reasoning: `anchor-policy.md` (data repo, gitignored — this summary is the
  durable record on this side).
