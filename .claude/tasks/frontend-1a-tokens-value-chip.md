# Slice 1a — Token/Typography Foundation + Value Chip

**Status:** implementation-ready task file (handoff artifact). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask. Per the
**model-routing table**, this is sonnet work (new component matching an existing pattern + a
scoped foundation), not architecture.

**Governing plan:** [.claude/tasks/frontend-overhaul.md](frontend-overhaul.md). This is the re-split
first slice **1a** (token layer + value chip, zero churn). The router, nav shell, App.jsx render
extraction, the dark-default flip, and component recolor are **1b — explicitly NOT this slice.**

**Scope in:** (1) the design-token + typography foundation, (2) the `ValueChip` pure presentational
component validated in isolation on real-shaped rows. **No visual regression to the existing app.**

**Scope out (1b):** §4.3 nav shell, §4.4 router, §6.1.A component extraction, flipping the default
theme to dark, recoloring carried-forward surfaces. Do none of it here. Adding the router/Radix/
Vaul/cmdk deps is also 1b.

---

## 0. Confirmed against live source (do not re-litigate)

These were verified for this slice; the chip contract below depends on them:

- **`computeMarketDivergence`** (`src/utils/dynastyScore.js:405`): for each player with **both**
  `dynastyScore.score != null` **and** `ktcValue != null`, within its position group it sets
  `dynRank`, `ktcRank`, `positionDepth`, `divergence = ktcRank − dynRank`,
  `divergencePct = (divergence / positionDepth) × 100`, and
  `divergenceSignal = 'undervalued'` when `divergencePct > 25`, `'overvalued'` when
  `divergencePct < −25`, else `null`. **Rows missing either input are returned unchanged** → their
  `divergenceSignal`/`divergencePct`/`dynRank`/`ktcRank` are **`undefined`** (not `null`). Sign
  semantics: undervalued ⇒ our model ranks the player better than the market ⇒ positive `pct` ⇒
  **up/positive edge**; overvalued ⇒ negative `pct` ⇒ **down**.
- **`dynastyScore.confidence`** ∈ `{ 'high', 'moderate', 'low', 'prospect', 'none' }`
  (`dynastyScore.js`: low/moderate/high at ~932–934; prospect/none on edge paths).
- **`projectionConfidence`** (the row field, sourced from `seasonProjection.js` `.confidence`) ∈
  `{ 'high', 'medium', 'low', 'rookie' }` or absent/`null` on rows with no projection
  (`seasonProjection.js:601` + `:197`; merged in App.jsx `playerRowsWithProj`).
- Every `playerRowsWithProj` row carries: `dynastyScore{score,confidence,…}`, `divergenceSignal`,
  `divergencePct`, `dynRank`, `ktcRank`, `ktcValue`, `projectionConfidence`, `position` (master plan
  §1.1, confirmed in `src/App.jsx`). **The chip computes none of this — it is a pure consumer**
  (master plan §1.2; mirrors the *Advstats are display-only* discipline).
- **`src/index.css`** is bare today: `@import "tailwindcss";` + one `tooltip-fade-in` keyframe (101
  bytes). No `font-family` / `@fontsource` anywhere in `src/` or `package.json`. Tailwind **v4**
  (config-less; theme via CSS `@theme`).
- **Component-test setup** (mirror `src/components/AdvancedStatsPanel.test.jsx`): vitest env is
  `node` by default (`vitest.config.js`), so the test file opts into jsdom via the first-line magic
  comment `// @vitest-environment jsdom`; imports `* as jestDomMatchers from
  '@testing-library/jest-dom/matchers'` + `expect.extend(jestDomMatchers)`; uses `render, screen,
  cleanup` from `@testing-library/react`; `afterEach(cleanup)` (because `globals: false`). No global
  setup file.

---

## Part 1 — Token + Typography Foundation

### 1.1 Typeface (the only new dependency this slice)

- **`package.json`** — add to **`dependencies`** (runtime, bundled): `@fontsource-variable/inter`.
  Do **not** add the router, Radix, Vaul, or cmdk (those are 1b/peek).
- **`src/main.jsx`** — add `import '@fontsource-variable/inter'` **above** `import './index.css'`
  so the font `@font-face` rules load before app styles. (Current main.jsx imports `./index.css`
  then `./App.jsx`; insert the font import as the first import.)
- The CSS family name exposed by that package is **`'Inter Variable'`** — verify against the
  installed package's emitted `@font-face` (its README states the family) and use that exact string
  in `--font-sans` below.

### 1.2 `@theme` token set (in `src/index.css`)

Add an `@theme { … }` block. **Use plain `@theme`, NOT `@theme inline`** — plain `@theme` emits the
tokens as `var(--…)` references so a later `.dark { --… }` override actually re-flows; `@theme
inline` bakes values into utilities and would make 1b's dark flip impossible. This is the load-
bearing detail of the whole foundation.

Light values are the **defaults** (the app stays light this slice). Dark values are **defined now**
(§1.3) but not activated. Light neutrals are chosen to match the app's current grays so the chip
looks native today and flips automatically in 1b.

| Token | Group | Light (default) | Dark (1b) | Consumed by |
|---|---|---|---|---|
| `--font-sans` | type | `'Inter Variable', system-ui, sans-serif` | (same) | global body font |
| `--color-surface` | neutral | `#ffffff` | `#0b0d10` | chip/card bg |
| `--color-surface-2` | neutral | `#f9fafb` | `#16181d` | raised/inset bg |
| `--color-border` | neutral | `#e5e7eb` | `#2a2d34` | chip border/divider |
| `--color-text` | neutral | `#111827` | `#f3f4f6` | primary value text |
| `--color-text-muted` | neutral | `#6b7280` | `#9ca3af` | labels |
| `--color-text-faint` | neutral | `#9ca3af` | `#6b7280` | dashes/empty |
| `--color-market-up` | market | `#16a34a` | `#4ade80` | undervalued glyph/text |
| `--color-market-up-bg` | market | `#f0fdf4` | `#0f2a17` | undervalued pill bg |
| `--color-market-down` | market | `#dc2626` | `#f87171` | overvalued glyph/text |
| `--color-market-down-bg` | market | `#fef2f2` | `#3a1414` | overvalued pill bg |
| `--color-market-neutral` | market | `#9ca3af` | `#6b7280` | aligned indicator |
| `--color-confidence-high` | confidence | `#4f46e5` | `#818cf8` | high dot |
| `--color-confidence-medium` | confidence | `#2563eb` | `#60a5fa` | medium dot |
| `--color-confidence-low` | confidence | `#6b7280` | `#9ca3af` | low dot |
| `--color-confidence-rookie` | confidence | `#7c3aed` | `#a78bfa` | rookie dot |
| `--color-phase-contending` | phase | `#c2410c` | `#fb923c` | (gated — no consumer in 1a) |
| `--color-phase-transitional` | phase | `#6b7280` | `#9ca3af` | (gated) |
| `--color-phase-rebuilding` | phase | `#0d9488` | `#2dd4bf` | (gated) |
| `--radius-chip` | shape | `0.375rem` (6px) | (same) | chip corners |
| `--radius-pill` | shape | `9999px` | (same) | delta/confidence pills |

Notes:
- The **confidence** hues deliberately echo the existing `PlayerCard` confidence palette
  (indigo/blue/gray/violet) for visual continuity — no recolor of existing components needed.
- The **phase** group has **no consumer in 1a**; it is defined now so the gated phase chip slots in
  later without a token migration (master plan §4.1). Values are placeholders to refine when phase
  ships.
- Spacing uses Tailwind v4's **default** spacing scale (no custom spacing tokens this slice). Only
  the two radii above are added.
- Tailwind v4 auto-generates utilities from these (`text-market-up`, `bg-market-up-bg`,
  `text-confidence-high`, `rounded-chip`, `rounded-pill`, `font-sans`). The chip uses these
  utilities; **no existing component references them**, so existing rendering is untouched.

### 1.3 Dark mechanism — defined, NOT activated

Add (outside `@theme`, normal CSS in `index.css`):

```css
/* Make the dark: variant class-driven (not OS prefers-color-scheme) so 1b can toggle it. */
@custom-variant dark (&:where(.dark, .dark *));

/* Dark token overrides — INERT until 1b adds `.dark` to <html>. */
.dark {
  --color-surface: #0b0d10;        /* …all dark values from the table… */
  /* …etc for every --color-* with a Dark column… */
}
```

**Do not** add `.dark` to `<html>`/`<body>` or anywhere this slice. With no `.dark` ancestor, the
`:root`/`@theme` light defaults render — the app is visually identical to today. Activating dark +
recoloring carried-forward surfaces is 1b.

### 1.4 Tabular figures — global rule

The UX doc wants tabular figures on all numerics. Add a base rule so it is systematic rather than
ad-hoc (existing `tabular-nums` utility usages become redundant but harmless):

```css
@layer base {
  body {
    font-family: var(--font-sans);          /* Inter, applied globally via the body */
    font-variant-numeric: tabular-nums;      /* inherits to all descendants */
  }
}
```

`font-variant-numeric` inherits, so every number in the app aligns. This changes glyph widths
slightly (an alignment improvement) but **restyles no layout** — confirm in the visual smoke check
(§3). (In Tailwind v4 the body font can alternatively flow through `--default-font-family`; setting
it on `body` explicitly is the most legible and is fine.)

### 1.5 Resulting `src/index.css` structure (annotated skeleton — implementer fills values)

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: 'Inter Variable', system-ui, sans-serif;
  /* neutral, market, confidence, phase color tokens + radii (light defaults) */
}

.dark {
  /* dark overrides for every --color-* token */
}

@layer base {
  body { font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
}

@keyframes tooltip-fade-in { from { opacity: 0; } to { opacity: 1; } }  /* keep existing */
```

---

## Part 2 — `ValueChip`

`src/components/ui/ValueChip.jsx` *(new)*. **Pure presentational**: no context reads, no fetching,
no state ownership (mirrors `AdvancedStatsPanel`'s discipline; honors *App.jsx owns all state*).
Props in, render out. Computes nothing from the data layer — only formats/normalizes the props it
is handed.

### 2.1 Signature

```jsx
export function ValueChip({
  value,        // Number | null  — headline model value. v1 source: row.dynastyScore.score (0–100).
  marketDelta,  // { signal, pct, dynRank, ktcRank } | null  — the edge (see 2.4 states)
  confidence,   // string | null  — raw value from EITHER vocabulary; normalized internally (2.3)
  ktcValue,     // Number | null  — market price; optional secondary display
  position,     // String         — e.g. 'WR'; used only for rank-context labels
  size = 'sm',  // 'sm' = table-cell single line | 'md' = card/peek stacked
}) { /* … */ }

// Exported for direct unit testing:
export function normalizeConfidence(c) { /* 2.3 */ }
```

`marketDelta` shape: `{ signal: 'undervalued' | 'overvalued' | null, pct: Number | null,
dynRank: Number | null, ktcRank: Number | null }`.

### 2.2 Row-field → prop mapping (confirmed against live rows; caller-side, documented for slice 3)

The chip does not read rows; callers map. Document this mapping in the component's header comment so
slice 3 (Explorer) and slice 2 (peek) wire it consistently. Use `?? null` everywhere because the
divergence fields are **`undefined`** on rows without KTC (§0):

```js
<ValueChip
  value={row.dynastyScore?.score ?? null}
  marketDelta={{
    signal:  row.divergenceSignal ?? null,
    pct:     row.divergencePct   ?? null,
    dynRank: row.dynRank         ?? null,
    ktcRank: row.ktcRank         ?? null,
  }}
  confidence={row.dynastyScore?.confidence ?? null}  /* default source — see note */
  ktcValue={row.ktcValue ?? null}
  position={row.position}
/>
```

**Confidence source note (resolves master plan §5.1 vs §6.1.B):** the chip is source-agnostic — the
normalizer maps **both** vocabularies into one canonical set, so callers pass whichever fits the
context. Because this chip's headline `value` is the **dynasty score**, the **default** source is
`row.dynastyScore.confidence`. When a surface pairs the chip with the **projection** number
(`projectedPPG`, e.g. the peek), it passes `row.projectionConfidence` instead. Either way the chip
renders one of `{high, medium, low, rookie}` or nothing.

### 2.3 Confidence normalizer

Unifies both vocabularies into the canonical set `{ 'high', 'medium', 'low', 'rookie' } | null`:

```js
export function normalizeConfidence(c) {
  switch (c) {
    case 'high':     return 'high'
    case 'medium':   return 'medium'
    case 'moderate': return 'medium'   // dynastyScore vocab → canonical
    case 'low':      return 'low'
    case 'rookie':   return 'rookie'
    case 'prospect': return 'rookie'   // dynastyScore vocab → canonical
    case 'none':     return null
    default:         return null       // null / undefined / unknown → null
  }
}
```

### 2.4 Rendering rules

**Value.** Render `Math.round(value)` (dynasty score is a 0–100 scale; integer display, no
decimals) with tabular figures, `--color-text`. If `value == null` → render an em-dash in
`--color-text-faint`; never `NaN`/`null`/`undefined`.

**Market delta — three states (from §0), never color alone:**

| State | Condition | Render |
|---|---|---|
| **Undervalued** | `signal === 'undervalued'` | up glyph (`▲`) + signed `+{Math.round(pct)}%` + `--color-market-up` (+ `-up-bg` pill). Direction is carried by the **glyph and the `+` sign**, not hue. `aria-label`/title may add rank context (`{position}{dynRank} vs market {position}{ktcRank}`). |
| **Overvalued** | `signal === 'overvalued'` | down glyph (`▼`) + signed `{Math.round(pct)}%` (pct already negative → shows `−N%`) + `--color-market-down` (+ `-down-bg` pill). Glyph + sign carry direction. |
| **Aligned** | `signal === null` **and** `pct != null` | neutral indicator (`≈` or `–`) in `--color-market-neutral`, **no** up/down color; short label "aligned". (This is the "computed but within ±25%" case — distinct from "not computed".) |
| **No market** | `signal == null` **and** `pct == null` (or `marketDelta == null`) | render **no** delta element at all. |

The never-color-alone guarantee is structural: any element carrying `--color-market-up`/`-down`
**always** also contains a direction glyph **and** a signed number (and a text/`aria` label). The
test asserts this (§Tests).

**Confidence.** Render a small dot colored by tier token (`--color-confidence-{high|medium|low|
rookie}`) **plus** a short text label (`High` / `Med` / `Low` / `Rookie`). Never the dot alone — the
text label is always present. When normalized confidence is `null` → omit the confidence cluster.

**KTC value.** When `ktcValue != null`, optionally show a faint secondary `KTC {value.
toLocaleString()}` in `--color-text-muted`; when `null`, omit.

**Sizes.** `'sm'` = single-line, compact, for table cells (value · delta · confidence inline).
`'md'` = stacked: value prominent on top, delta + confidence beneath; for cards/peek headers.

**Motion / a11y.** No animation beyond a CSS hover state; nothing that needs `prefers-reduced-
motion` handling this slice. Tabular figures on every number (inherited from base + an explicit
`tabular-nums` on the value for safety). Use semantic markup so the delta/confidence have
text or `aria-label` equivalents.

### 2.5 File + export surface

- `src/components/ui/ValueChip.jsx` — exports `ValueChip` (default usage) and `normalizeConfidence`
  (named, for the test). New `src/components/ui/` directory is the home for shared presentational
  primitives (per master plan §6.1).

---

## 3. Step sequence

1. **Tokens + font first.** Add the dep (`package.json`), the font import (`main.jsx`), and the full
   `index.css` (@theme + `@custom-variant` + `.dark` overrides + base tabular/font rule). Run
   `npm install`; `npm run build` clean; `npm run dev` and **visually smoke the existing app**:
   surfaces must look unchanged (still light, same colors), text now Inter, numbers tabular-aligned,
   **no layout breakage**. No `.dark` on `<html>`. No component recolor.
2. **ValueChip second.** Build the component + `normalizeConfidence` per Part 2. No wiring into any
   surface yet.
3. **Validation last.** Write and pass the component test (§Tests) — the isolation proof on
   real-shaped fixture rows. *(Optional manual check, if desired: temporarily render `<ValueChip>`
   in one Explorer cell with a real row to eyeball it in the running app, then **revert that edit
   before commit** — slice 3 owns the permanent Explorer migration; 1a must not change Explorer
   column rendering.)*

---

## 4. Tests to add

**File:** `src/components/ui/ValueChip.test.jsx`.

**Setup — mirror `AdvancedStatsPanel.test.jsx` exactly:** first line `// @vitest-environment jsdom`;
`import * as jestDomMatchers from '@testing-library/jest-dom/matchers'` + `expect.extend(
jestDomMatchers)`; `render, screen, cleanup` from `@testing-library/react`; `afterEach(cleanup)`.

**Real-shaped fixture rows** (values consistent with §0 semantics):

```js
const UNDERVALUED_WR = { value: 78, marketDelta: { signal: 'undervalued', pct: 42.9, dynRank: 3, ktcRank: 9 }, confidence: 'high',     ktcValue: 6200, position: 'WR' }
const OVERVALUED_RB  = { value: 61, marketDelta: { signal: 'overvalued',  pct: -37.5, dynRank: 12, ktcRank: 4 }, confidence: 'moderate', ktcValue: 5100, position: 'RB' }
const ALIGNED_WR     = { value: 70, marketDelta: { signal: null, pct: 8.0, dynRank: 5, ktcRank: 6 },             confidence: 'low',      ktcValue: 4000, position: 'WR' }
const NO_KTC_TE      = { value: 55, marketDelta: { signal: null, pct: null, dynRank: null, ktcRank: null },      confidence: 'prospect', ktcValue: null, position: 'TE' }
```

**Cases & assertions:**

1. **Undervalued** — an up glyph (`screen.getByText` matching `/▲|↑/`) is present; the signed delta
   `+43%` (rounded) is present; an element with the market-up color class exists. **Never-color-alone:**
   assert that the up-colored delta element's text contains both a direction glyph (`/▲|↑/`) **and**
   a `+` sign (and has a non-empty `aria-label`/title). Confidence: a dot element with the
   `confidence-high` token class **and** the visible label `High`.
2. **Overvalued** — down glyph (`/▼|↓/`); signed `−38%` (accept `−`/`-`); market-down color present
   with co-located glyph + sign (never-color-alone). Confidence label `Med` (asserts
   `moderate → medium`).
3. **Aligned** — no up/down market color class in the document; a neutral "aligned" indicator
   present; value `70` present; confidence label `Low`.
4. **No-KTC** — **no** delta element rendered: `screen.queryByText(/▲|▼|↑|↓|%/)` is `null`; value
   `55` present; confidence label `Rookie` (asserts `prospect → rookie`); no `KTC` text (ktcValue
   omitted).
5. **`normalizeConfidence` unit cases** (direct calls, no render): `high→high`, `medium→medium`,
   `moderate→medium`, `low→low`, `rookie→rookie`, `prospect→rookie`, `none→null`, `null→null`,
   `undefined→null`, `'garbage'→null`.
6. **Null/hygiene** — `<ValueChip value={null} marketDelta={null} confidence={null} ktcValue={null}
   position="WR" />` renders an em-dash for value and `container.textContent` does **not** match
   `/NaN|null|undefined/i` (mirrors the AdvancedStatsPanel hygiene assertion).
7. **Size smoke** — both `size='sm'` and `size='md'` render the value (`78`) without error.

Per the **Done-definition**, these cover the new behavior; `npm test`, `npm run lint`, and
`npm run build` must all be green before done. No contract tests apply (no `seasonProjection.js`/
stat-key changes).

---

## 5. Docs updates

Per the **Self-maintenance** rule (CLAUDE.md), apply in the same change:

### 5.1 `README.md` — Project structure

Under the `components/` block (after the `Tooltip.jsx` line ~93), add the new `ui/` subtree:

> *insert:*
> ```
>     ui/
>       ValueChip.jsx     # Pure presentational value chip { value · market delta · confidence }; tokens-driven, no data coupling
> ```

Optionally (recommended), extend the **Tech stack** list with one bullet:
> `- **Inter (variable)** — self-hosted via @fontsource-variable/inter; tabular figures enabled globally for aligned numerics`

### 5.2 `CLAUDE.md` — Navigation map (`src/components/` table)

Add a row to the components table:

> *insert row:*
> ```
> | `ui/ValueChip.jsx` | Pure presentational value chip — `{ value · market-delta · confidence }`; reads design tokens, consumes existing row fields, computes nothing (display-only, like `AdvancedStatsPanel`) |
> ```

(No new invariant; the *App.jsx owns all state* and *display-only* disciplines already cover it.
Do not edit the master-plan doc or its filename references — that is the overhaul's docs-index task,
not 1a.)

---

## 6. Cross-repo impact

**None.** The chip and the token/typography foundation are pure app-side presentation. No data
shape, no manifest field, no `sleeper-dashboard-data` contract is touched; the chip consumes
existing `playerRowsWithProj` fields read-only and computes nothing. (Confirmed against §0 — the
divergence/confidence fields already exist on the row; this slice adds no producer-side change.)

---

## 7. Done-definition checklist (this slice)

- [ ] `@fontsource-variable/inter` added to `dependencies`; imported first in `main.jsx`.
- [ ] `index.css`: plain `@theme` token set (light defaults), `@custom-variant dark`, inert `.dark`
      overrides, base font + global `tabular-nums`. **No `.dark` applied anywhere.**
- [ ] Existing app visually unchanged (light, same colors, no layout break) — manual smoke confirmed.
- [ ] `ValueChip.jsx` pure presentational; `normalizeConfidence` exported; row-mapping documented in
      header comment; never-color-alone enforced structurally.
- [ ] No Explorer column rendering changed (any manual check reverted).
- [ ] `ValueChip.test.jsx` covers all 7 case groups; `npm test` green.
- [ ] `npm run lint` 0 problems; `npm run build` clean.
- [ ] README + CLAUDE.md updated per §5.
- [ ] No router/Radix/Vaul/cmdk added; no source under `src/utils/`, the pipeline, cache, or the
      data repo touched.
