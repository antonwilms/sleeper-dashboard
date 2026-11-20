# Brief W2b-1q — Questionable chip amber (split from W2b-1)

**Status:** planning artifact (Session 1, opus). This session edited no source or doc files.
**Review depth: light — one shared presentational chip and two-to-four `@theme` tokens; no state, data, scoring, pipeline or cross-repo change.**
**Session 2:** sonnet, effort medium. Visual check from `.claude/launch.json` (`sleeper-dashboard`), `/week` lineup.
Planned against live source at app HEAD `5fa8479`. Split out of `.claude/tasks/week-w2b-1-colour-scale.md`
(Revision 2) on plan-reviewer round 2's advice: it shares no code or data with the percentile scale
and carries the only open decision. Independent of W2b-1 — either may land first.

**Design source:** the 2026-11-19 handoff brief restating `ux-briefs-week-and-myteam.md` §6 (not on
disk): "Questionable chip → amber token (no longer sharing red with missed weeks). D/Out/IR stay red."

---

## Decisions recorded

**D1 — Questionable = outlined amber.** Text `#fcd34d` (13.2:1 on `dp-card` `#0e1014`), border
`#7a5c12`. Outline-vs-fill stays the second channel (W1 D3: severity readable without hue).

**D2 — Severe chip colour (D/Out/IR/PUP/SUS/other): OPEN — Anton decides before Session 2 starts.**
The brief's "stay red" assumes today's severe chip is red; it is `dp-down`, which is **orange**
(`#fdba74` on `#24170d`, index.css:224–231), one hue step from amber.
- **(a) unchanged** — severe keeps `bg-dp-down-bg text-dp-down-text`.
- **(b) red (Session 1's recommendation)** — severe = `bg-dp-severe-bg text-dp-severe-text`, new tokens
  `--color-dp-severe-text: #f4a3a2`, `--color-dp-severe-bg: #2a1010` (9.0:1; the family of W2b-1's
  missed-week red `#E24B4A`). Red then means "not playing" on chip and grid cell alike.

**Severe chip:** (b) red — Anton, 2026-11-19

**Session 2 does not start while that line reads `pending`** — it stops and asks. Every place below
marked *(per D2)* follows the recorded option.

---

## Touch list

| File | Change |
|---|---|
| `src/index.css` | `@theme` tokens (§1) |
| `src/components/dp/cells.jsx` | `StatusChip` classes + header comment (§2) |
| `src/components/dp/cells.test.jsx` | extend (§3) |
| `docs/nav/components.md`, `docs/nav/utils.md` | any StatusChip colour wording *(per D2)* (§4) |

Only consumer today: `LineupTable.jsx:303`. Its test `LineupTable.test.jsx:391–392` asserts
`data-severity` only — unchanged, stays green. No copied definitions.

## §1 `src/index.css`

Inside `@theme`, after the `--color-dp-accent*` block (single values; do not touch `.dark`):

```css
  /* W2b-1q — StatusChip. Questionable = outlined amber, distinct from the severe fill. */
  --color-dp-caution-text:   #fcd34d;
  --color-dp-caution-border: #7a5c12;
```

Option (b) only, directly below:

```css
  /* Doubtful/Out/IR… — red family of the missed-week cell. No trailing comments on token lines (T3/T4 parse them). */
  --color-dp-severe-text: #f4a3a2;
  --color-dp-severe-bg:   #2a1010;
```

## §2 `src/components/dp/cells.jsx` `StatusChip` (line 13)

Keep `data-testid`, `data-severity`, `title`, label logic and the shared size/shape classes. Move the
text colour out of the shared prefix into each branch:
- caution → `border border-dp-caution-border text-dp-caution-text`
- severe → (a) `bg-dp-down-bg text-dp-down-text` · (b) `bg-dp-severe-bg text-dp-severe-text` *(per D2)*

Header comment (lines 11–12) → "Questionable is outlined amber; everything else filled
<dp-down orange | red> *(per D2)* — severity readable from the label and the fill, not hue alone (W1 D3)."

## §3 Tests — `src/components/dp/cells.test.jsx` (extend; add `StatusChip` to the import)

- **T1 Questionable amber** — `render(<StatusChip status="Questionable" />)`: className contains
  `text-dp-caution-text` and `border-dp-caution-border`, and contains neither `text-dp-down-text` nor
  `text-dp-severe-text`. Fails if Q still shares the severe text colour. Red: restore the shared
  `text-dp-down-text` prefix.
- **T2 Out severe** — `status="Out"`: className contains the severe pair *(per D2: (a)
  `bg-dp-down-bg`/`text-dp-down-text`, (b) `bg-dp-severe-bg`/`text-dp-severe-text`)* and neither
  `text-dp-caution-text` nor `border-dp-caution-border`. Fails if the branches are swapped. Red: swap the two branches' class strings.
- **T3 (option b only) severe tokens readable** — read `src/index.css`, extract
  `--color-dp-severe-text`/`-bg`, compute WCAG contrast inline (no import from W2b-1's
  `percentileColour.js`, which may not exist yet), assert ≥ 4.5. Red: set the text token to `#3a1a1a`.
- **T4 amber readable** — same parse for `--color-dp-caution-text` against `--color-dp-card` (`#0e1014`),
  assert ≥ 4.5 (planning measured 13.2). Fails if the amber is too dark for the card. Red: set it to `#3a2a05`.

## §4 Docs (same change)

`docs/nav/components.md` and `docs/nav/utils.md` both mention `StatusChip`; update any colour wording
to "Questionable outlined amber; others filled <dp-down | red> *(per D2)*". `docs/ui.md` colour
section: one line naming the caution (and, for b, severe) tokens.

## §5 Smoke

`/week` lineup with a Questionable and an Out/Doubtful player (any league week has some; if none,
say so): Q outlined amber, severe filled *(per D2)*, labels unchanged, no layout shift. Screenshot
1440×900. Anton judges the colours.

## Done-definition notes for Session 2

Full done-definition. No PROVISIONAL tags added. Commit before hand-back; do not push.

---

## Verification

Session 1 (opus), 2026-11-20. Read the diff, not only the hand-back.

- **Implementation:** `5587cb3` (Session 2, sonnet), option (b) red per D2.
- **implementation-reviewer, light** on `5587cb3`: no flags. Touch list respected (`docs/nav/utils.md` has no colour wording, correctly untouched); option (b) threaded through classes, header comment, tokens and docs; index.css token lines bare (T3/T4 parse them); T1–T4 reds bite; light depth confirmed. Noted, not flagged: the new token block sits inside the accent group in `@theme` — cosmetic, accepted.
- **Fix pass:** none needed.
- **Checks (Session 1, at `5587cb3`):** `npm test` 189 files / 3616 passed · `npm run lint` 0 problems · `npm run build` passes with the pre-existing >500 kB chunk notice.
- **Smoke (Session 2, 1440×900, /week):** before — all chips orange text `rgb(253,186,116)`; after — Q outlined amber (`rgb(252,211,77)`, border `rgb(122,92,18)`), IR/OUT filled red (`rgb(244,163,162)` on `rgb(42,16,16)`); chip widths unchanged (no layout shift).
- **Deviations:** none.
- **Outcome:** clean. Awaiting Anton's sign-off.

Signed off by Anton 2026-11-20
