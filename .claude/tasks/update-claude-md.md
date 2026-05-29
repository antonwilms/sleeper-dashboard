# Proposed CLAUDE.md addition: Model selection and session splitting

This is a proposal only. Do not modify CLAUDE.md until reviewed.

Insert the section below after the existing **"What not to do"** section and before **"Before editing"** in `CLAUDE.md`.

---

## Model selection and session splitting

This project uses a two-session workflow for non-trivial features: an **opus planning session** writes a task file, and a **sonnet implementation session** reads that file and produces the code. The goal is to spend the expensive model on understanding and design, and the fast model on disciplined execution.

### Which model for which task

| Task type | Model | Why |
|---|---|---|
| Designing a new feature that touches the playerRows pipeline | **opus** | Pipeline order and component interactions are tightly coupled — needs deep reasoning |
| Anything touching `dynastyScore.js` (950 lines, coupled signals/labels) | **opus** | High blast radius; requires holding the full label-gate logic in mind |
| Designing a new scoring/projection algorithm (e.g. `seasonProjection.js`) | **opus** | Factor selection and weighting need careful trade-off analysis |
| Cross-file refactors spanning App.jsx + utils + components | **opus** | Needs to keep the whole data flow in working memory |
| Architectural review / debugging an "off-by-rank" bug across multiple files | **opus** | Symptoms are downstream of the cause; needs broad code reading |
| Implementing a fully-specified task file from `.claude/tasks/` | **sonnet** | Decisions already made — execution only |
| Adding a column to the Explorer table from a spec | **sonnet** | Pattern is well-established in `PlayersTab.jsx` |
| Writing a new component matching an existing pattern (e.g. another chart) | **sonnet** | Reference implementation already exists |
| README / CLAUDE.md updates after a feature lands | **sonnet** | Mechanical documentation work |
| Single-file bug fix with a clear repro | **sonnet** | Localised, low blast radius |
| Renames, lint cleanup, dead-code removal | **sonnet** | Mechanical |

If a session starts as sonnet and uncovers a design question that the task file didn't anticipate, stop and ask. Do not improvise architecture in a sonnet implementation session — switch to opus and update the task file instead.

### The two-session pattern

**Session 1 — Planning (opus):**
1. Read the relevant existing code in full (utils, App.jsx pipeline, related components).
2. Decide function signatures, data shapes, file paths, and acceptance criteria.
3. Write a task file at `.claude/tasks/<feature-name>.md` (kebab-case).
4. **Do not edit any source files.** No `Edit`, no `Write` to `src/`. Planning sessions produce a task file and nothing else.
5. End the session.

**Session 2 — Implementation (sonnet):**
1. Read `.claude/tasks/<feature-name>.md` in full before doing anything else.
2. Read each file the task touches before editing it.
3. Implement exactly what the task file specifies. If something is ambiguous or missing, stop and ask — do not guess.
4. Run `npm run build` after the changes to confirm the build still passes.
5. Update README.md if the task file lists it under "Documentation" — otherwise leave it.

If the implementation reveals that the task file was wrong (impossible signature, missing dep, contradicts existing code), stop and report back. Do not silently diverge.

### What belongs in a task file

A task file should be self-contained enough that a fresh sonnet session can execute it without reading the original conversation. Required sections:

| Section | Contents |
|---|---|
| **Goal** | 1–3 sentence summary of what this feature does and why |
| **Files to create** | Absolute paths + 1-line purpose for each |
| **Files to modify** | Absolute paths + which functions/sections change |
| **Function signatures** | Exact signatures with parameter types described (no TypeScript, but document expected shapes in JSDoc-style comments or prose) |
| **Data shapes** | Input and output shapes for every new function — use `{ field: type/description }` blocks |
| **Algorithm** | Step-by-step description of any non-trivial logic. Tables for multipliers/thresholds. |
| **Integration points** | Where in the playerRows pipeline this slots in; what context it reads from; what props it receives |
| **Acceptance criteria** | Checklist of observable outcomes — "Column X appears in Explorer between Y and Z", "Sorting by X persists across filter changes", "Build passes with no warnings" |
| **Out of scope** | Explicit list of things that look related but should not be touched in this task |
| **Documentation** | List of README.md sections to update (or "none") |

Optional sections: **Open questions** (must be resolved before sonnet starts), **Reference implementations** (point to similar existing code), **Test plan** (manual verification steps).

### The rule: planning sessions do not edit source

A planning session that edits a source file has corrupted its own output — the task file is no longer the source of truth, the working tree is. This breaks the handoff to the implementation session and erodes the discipline that makes the two-session pattern work.

The only files an opus planning session writes are:
- `.claude/tasks/<feature-name>.md`
- Optionally, `.claude/tasks/<feature-name>-notes.md` for scratch work that didn't make the cut

If the planning session feels the urge to "just make this one small fix while I'm in here," that's the signal that the task file is ready and the session should end.

---

## Acceptance criteria for this CLAUDE.md change

- [ ] New section "Model selection and session splitting" inserted between "What not to do" and "Before editing" in `CLAUDE.md`
- [ ] `.claude/tasks/` directory exists (or is created by this change) and is listed in `.gitignore` if scratch task files shouldn't be committed (decide with user)
- [ ] No other sections of CLAUDE.md modified
- [ ] No source files modified by this change

## Open questions for the user

1. Should `.claude/tasks/` be committed to git or ignored? (Recommend: committed — task files become useful history)
2. Should the table of "which model for which task" be authoritative, or treated as guidance? (Recommend: guidance — final call belongs to whoever starts the session)
3. Any task types missing from the table that come up regularly in this project?
