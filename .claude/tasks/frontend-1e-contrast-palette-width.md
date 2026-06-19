# Slice 1e — Dark contrast fixes + surface palette rework + full-width table

**Status:** planning artifact (opus). PLANNING ONLY — this file authorizes no source edits by
itself. It is the handoff to a **sonnet** implementation session (per
[CLAUDE.md → Workflow convention](../../CLAUDE.md#workflow-convention)). The implementer reads
this file, makes exactly the edits below, and runs `npm test` / `npm run lint` /
`npm run build`. **The implementer must NOT start the dev server or run any browser/visual/smoke
test — the user smokes manually** (this slice *adds* that rule to CLAUDE.md; see Docs updates).

**Model routing.** This is a presentation-only, token-values + container-width slice. It does
**not** touch the playerRows pipeline, `dynastyScore.js`, or any compute. It would normally be a
**sonnet** "implementing a fully-specified task file" job per the
[model-routing table](../../CLAUDE.md#which-model-for-which-task). It is planned by opus only
because the audit (token-flip math + figure/ground analysis) is the hard part; the implementation
is mechanical.

**Predecessors.** 1c tokenized all color in `src/index.css` (`@theme`: neutral/surface role
tokens + chromatic primitives `--c-{hue}-{shade}` + semantic aliases, each light+dark). 1d
flipped the default to dark and added the toggle. This slice tunes/extends **values** and one
container width — it keeps 1c's two-tier architecture intact (no re-architecture, no hardcoded
palette classes reintroduced).

**Invariants honored** (named, not restated — see
[CLAUDE.md → Invariants](../../CLAUDE.md#invariants)): **App.jsx owns all state** (untouched),
*playerRows pipeline order load-bearing* (untouched), *Advstats display-only* (untouched),
**never-color-alone** (all state encodings — market ▲/▼ glyph+sign, confidence dot+label,
movement ↑/↓ arrows — are preserved verbatim; this slice changes only neutral surface/contrast
values). No data/pipeline/state/routing/behavior change. The only structural change is the
AppShell content-container width; the only component edits are the named cells below.

---

## Source read (live, this session)

- `src/index.css` — the full `@theme` + `.dark` token blocks (surfaces, borders, text,
  primitives, semantic aliases, chart tokens).
- `src/components/PlayersTab.jsx` — `PosRankBadge` (L41), `dynastyLabelColor` (L73), the Explorer
  table rows (L1999–2102: Recent / Player / PPG / Proj / Career / Dynasty / KTC / Owner cells and
  the row hover L2007), the PlayerProfile header chips (L1149–1190), depth-chart/comp/signal chips.
- `src/components/shell/AppShell.jsx` — the `<main>` content container (L34–39).
- `src/components/shell/AppShell.test.jsx` — confirmed it asserts **no** width class (safe).
- `src/components/league/SlotBadge.jsx` — adjacent badge with the same bug class.
- `src/App.jsx` (L894–969 return) — onboarding/league-select are already inner-capped
  (`max-w-xs` / `max-w-lg`); the routed surfaces render as `children` of one shared `<main>`.
- `index.html`, `src/main.jsx` — confirmed **`index.css` is the only global stylesheet**, and the
  `.dark` class is set pre-paint by the inline `<head>` script.
- `docs/ui.md`, `README.md`, `CLAUDE.md` — theming notes / conventions.

### Key structural finding (drives Part 1)

**No page background is painted anywhere.** `index.css`'s `@layer base body` sets only
`font-family` + `font-variant-numeric`; the AppShell root `<div className="flex flex-col
min-h-screen">` has **no** `bg-*`; `TopBar` and each surface paint their own `bg-[var(--color-
surface)]`. So the page "ground" is the browser canvas, and `--color-surface` (white in light /
near-black in dark) doubles as both *page base* and *card/overlay surface*. That is precisely why
the light UI reads **flat/sterile** — page and cards are the same color, so cards have no
figure/ground separation — and it leaves the dark canvas unpainted behind transparent areas. The
fix (Part 1) introduces a distinct **`--color-canvas`** page-ground token and paints `body` with
it, so cards/surfaces lift off the page in both themes.

---

## The four requests → the fix, in one view

| # | Request | Root cause | Fix (Part) |
|---|---|---|---|
| 1 | Dark-on-dark in Recent/Dynasty/Owner + row hover | (a) one badge pairs `slate-100`/`slate-600` → mid-grey text on near-black (3.75:1, **AA fail**); (b) row hover uses `--c-blue-50` whose dark flip `#172554` is a saturated navy that muddies the surface-3 badge boxes into "dark-on-dark" | Part 2 |
| 2 | Table not full width | AppShell `<main>` caps content at `max-w-5xl` | Part 3 |
| 3 | Sterile/flat surfaces, no warmth/elevation | page==cards (both `--color-surface`); no canvas; cool flat greys (light) / closely-spaced near-blacks (dark) | Part 1 |
| 4 | General dark contrast sweep | a handful of small-text chart labels + one adjacent badge below AA | Parts 2 & 4 |

---

## Part 1 — Surface palette rework (both themes)

Goal: replace the flat pure-white light surfaces and the closely-spaced dark surfaces with a
coherent, **tinted, layered ramp** that has a distinct page ground (canvas) and visible elevation,
per the Linear/Vercel reference. Light = **subtly warm** soft off-white (NOT `#ffffff`); dark =
**cool-tinted near-black**. The whole warm/cool feel lives in this one small block, so the user can
re-tint in a single edit.

### 1.1 New token: `--color-canvas` (page ground)

`--color-canvas` is the page background; `--color-surface` becomes purely the *card/panel/overlay*
surface that sits **above** the canvas. This is the one new token (an architecture-consistent
extension — a new neutral role token with light+dark values, exactly like the existing surface
roles).

**Add to `@theme` (light) and `.dark` (dark), and consume it on `body`** (see 1.4).

### 1.2 Light ramp — warm, layered (replaces the flat white/gray-50/100/200/300 set)

In `src/index.css` `@theme`, replace these neutral values (every other `@theme` token stays):

| Token | Before (1c) | After (1e) | Role |
|---|---|---|---|
| `--color-canvas` | *(new)* | `#f6f4f0` | page ground — warm off-white, below all cards |
| `--color-surface` | `#ffffff` | `#fffefb` | cards / panels / drawers / TopBar — warm near-white, **lifts above canvas** |
| `--color-surface-2` | `#f9fafb` | `#f1eee7` | inset / table-header / filled sub-panel (recessed within a card) |
| `--color-surface-3` | `#f3f4f6` | `#e8e3da` | badge bg / stronger inset |
| `--color-surface-4` | `#e5e7eb` | `#dbd5ca` | hover-strong / pressed fill |
| `--color-surface-5` | `#d1d5db` | `#c9c2b5` | strongest fill / progress track |
| `--color-border-subtle` | `#f3f4f6` | `#efebe3` | hairline divider |
| `--color-border` | `#e5e7eb` | `#e3ded4` | default border |
| `--color-border-strong` | `#d1d5db` | `#d0cabd` | emphasized border |

**Elevation rationale (light):** `surface` (`#fffefb`) is *lighter* than `canvas` (`#f6f4f0`), so
white cards pop off the warm page — the figure/ground that was missing. Within a card, `surface-2…5`
are progressively *darker* warm-greys (the existing semantic: higher number = stronger fill /
deeper inset), each step ~5–8% luminance apart so they stay distinguishable. All channels carry a
warm bias (R ≳ G ≳ B); the off-white is intentionally not `#ffffff`. Dark text on `#fffefb`/`#f6f4f0`
is unchanged in contrast (≈16:1) — **no light text-token values change**.

### 1.3 Dark ramp — cool near-black, layered (replaces the closely-spaced set)

In the `.dark` block, replace:

| Token | Before (1c) | After (1e) | Role |
|---|---|---|---|
| `--color-canvas` | *(new)* | `#08090c` | page ground — deepest cool near-black |
| `--color-surface` | `#0a0a0b` | `#101216` | cards / panels / drawers / TopBar — **lifts above canvas** |
| `--color-surface-2` | `#141517` | `#171a20` | inset / table-header / row-hover target |
| `--color-surface-3` | `#1c1e22` | `#1f232b` | badge bg / raised |
| `--color-surface-4` | `#26282e` | `#2a2f39` | hover-strong / overlay |
| `--color-surface-5` | `#2e3038` | `#353b46` | highest |
| `--color-border-subtle` | `#212327` | `#1b1f26` | hairline divider |
| `--color-border` | `#2a2d34` | `#272c35` | default border |
| `--color-border-strong` | `#3a3d45` | `#373d48` | emphasized border |

**Elevation rationale (dark):** standard dark elevation = lighter-as-higher. `canvas` (`#08090c`)
is the deepest; `surface` (`#101216`) lifts cards off it; `surface-2…5` climb in even steps
(~Δ luminance per step) so the table header, badge boxes, hovers, and overlays each read as a
distinct layer instead of merging into one near-black mush. Every value carries a slight **cool**
tint (B > R by ~4–6) for the near-black Linear/Vercel feel.

### 1.4 Paint the page + native color-scheme

In `src/index.css`, extend the base layer so the page ground and native UI (scrollbars, form
controls, autofill) follow the theme:

```css
@layer base {
  :root { color-scheme: light; }
  .dark { color-scheme: dark; }   /* may instead live in the existing .dark { } block */

  body {
    font-family: var(--font-sans);
    font-variant-numeric: tabular-nums;
    background-color: var(--color-canvas);   /* NEW */
    color: var(--color-text);                /* NEW — sane default text color */
  }
}
```

This is what makes the layered ramp legible: cards (`--color-surface`) now visibly sit on the
canvas. It also closes the latent "unpainted canvas behind transparent areas in dark mode" gap.

### 1.5 Warm/cool swing (single-edit knob)

The warm/cool axis is fully contained in the canvas/surface/border values above. To swing the
**light** ramp cooler, drop R and raise B toward neutral per row (e.g. `#f6f4f0` → `#f1f3f6`); to
swing the **dark** ramp warmer, raise R and drop B per row (e.g. `#101216` → `#16130f`). Keep the
**step spacing** (the luminance deltas between rows) and only shift the hue — that preserves
elevation while re-tinting. No other file needs to change to re-tint.

> Note: this **intentionally changes 1c's light surface appearance** — that is the request, not a
> regression. All text/semantic tokens keep their 1c values and stay AA on the new surfaces
> (verified in Part 4).

---

## Part 2 — Dark contrast audit & fixes

### 2.1 How the badges flip (context for the audit)

Nearly every Explorer/profile badge pairs `bg --c-{hue}-100` with `text --c-{hue}-700` or
`--c-{hue}-800`. Under 1c's dark flip (`100→900`, `700→300`, `800→200`), that becomes **light text
on a dark hue bg** — e.g. green badge dark = `#bbf7d0` on `#14532d` (AA-pass). So the *convention*
is sound. The bugs are the **two cells that break the convention** plus the **row-hover token**.

### 2.2 Per-case audit — the named columns + hover

Target ratios: **4.5:1** normal text, **3:1** large/UI text & non-text. Ratios computed on the
**dark** values (light is unaffected).

| Case | Location | Offending pair (dark resolve) | Diagnosis | Fix | Ratio before → after |
|---|---|---|---|---|---|
| **Dynasty** "Veteran Producer" badge | `PlayersTab.jsx:89` (in `dynastyLabelColor`) | bg `--c-slate-100` `#0f172a` + text `--c-slate-600` `#64748b` | mid-grey text on near-black slate — the genuine dark-on-dark | text → **`--c-slate-700`** (`#cbd5e1`) | **3.75 → 12.0** ✅ |
| **Dynasty/KTC chip** (Profile header) | `PlayersTab.jsx:1173` | same `slate-100`/`slate-600` | same (the only other `slate-600` consumer) | text → **`--c-slate-700`** | **3.75 → 12.0** ✅ |
| **Row hover** (whole row) | `PlayersTab.jsx:2007` | `hover:bg-[var(--c-blue-50)]` → `#172554` (saturated navy) | navy hover sits *lighter* than the `surface-3`/`slate-100` badge boxes → the badges read as dark holes ("dark bg around the value"); also off-convention (every other table hover uses `surface-2`) | hover bg → **`--color-surface-2`** | neutral lift; badges stay legible on hover |
| **Recent** low-tier badge | `PlayersTab.jsx:46` (in `PosRankBadge`) | bg `--color-surface-3` + text `--color-text-muted` | self-contrast fine (~6.4:1); only *looked* muddy because the navy hover blended it | **no token change** — resolved by the hover repoint (above) + the surface rework | 6.4 (pass) → cleaner |
| **Recent** top/mid badges | `PlayersTab.jsx:44–45` | green-100/800, yellow-100/800 | light-on-dark, pass | none | pass |
| **Owner** "owned" badge | `PlayersTab.jsx:2094` | bg `--color-surface-3` + text `--color-text-secondary` | readable (~11:1); box blended on navy hover | resolved by hover repoint | pass |
| **Owner** "Free Agent" | `PlayersTab.jsx:2099` | green-50/green-700 (+green-200 border) | light-on-dark, pass | none | pass |

**Why Recent/Owner are in the complaint even though their text passes AA:** their badge
backgrounds are `--color-surface-3` (a dark grey box). On the old `--c-blue-50` navy hover
(`#172554`, *lighter* than `surface-3` `#1c1e22`), the grey box inverts into a "dark hole on a
brighter navy row" — the user reads the whole thing as dark-on-dark. Repointing the hover to a
neutral `surface-2` and widening the dark ramp (Part 1) removes the muddiness; the only **token**
fix those two columns need is none.

### 2.3 Sweep — other Explorer columns, badges, PlayerProfile chips, charts

Verified the full badge/chip set (`grep` of every `bg-[var(--c-…)]` + paired text across
`src/components/`). Findings:

- **All `-100`/`-700` and `-100`/`-800` badges pass** in dark (light text on dark hue bg):
  `PosRankBadge` green/yellow tiers; `dynastyLabelColor` green/blue/yellow/orange/red/purple cases;
  depth-chart `STR` (green-100/700); signal badges (green/blue/teal/orange/yellow/amber 100/700–800);
  injury/comp chips (amber-100/700); market chips (green-50/700, orange-50/700);
  `PlayerCard`/`MyTeamView` chips (`-50`/`-700`, `-100`/`-700`). No change.
- **Slate (`-100`/`-600`)** — the two cases in 2.2 (L89, L1173). **Fixed → `-700`.**
- **Rookie Proj value** `PlayersTab.jsx:2065` — `italic text-[var(--c-purple-700)] opacity-70`
  (`#d8b4fe` @ 70%). On the old navy hover this fell to ~4.7:1 (borderline). The hover repoint
  (2.2) lifts it back above AA. **Optional polish:** drop `opacity-70` (or → `opacity-80`) so the
  rookie tint isn't dimmed on any surface. Low priority; not required for AA after the hover fix.
- **Compare-cell icon hovers** `PlayersTab.jsx:2013` (`hover:bg-[var(--c-red-50)]`) and `:2023`
  (`hover:bg-[var(--c-blue-50)]`) — tiny ✓/+ glyph buttons; a colored glyph on a dark tint reads
  fine. **Leave as-is** (changing them is cosmetic-uniformity only, out of the reported problem).
- **Adjacent (League group, outside the Explorer): `SlotBadge` "IR"** `league/SlotBadge.jsx:2` —
  `bg-[var(--c-red-100)] text-[var(--c-red-600)]` → `#ef4444` on `#7f1d1d` ≈ **3.75:1 (AA fail)**,
  the same `-100`/`-600` bug class. **Recommended fix:** text → **`--c-red-700`** (`#fca5a5`),
  ≈ 7:1. Flagged as the same class; include it if touching contrast, but it is not one of the
  named Explorer cells, so it is optional this slice.
- **Chart small-text labels** (`CareerBarChart`, `WeeklyBarChart`, `SpiderChart` axes) — handled in
  Part 4 (dark overrides for `--color-chart-label` / `--color-chart-axis`).

---

## Part 3 — Full-width Explorer table

### Decision

**Widen the global AppShell content container** (the single sanctioned structural change) rather
than full-bleeding only the Explorer. Justification:

- The Explorer table (`table-fixed`, colgroup sums to ~862px) is the width-hungry surface; at
  `max-w-5xl` (1024px) it is visibly boxed. A generous capped width with gutters gives it
  near-full-width on laptops while staying **guttered, not edge-to-edge** (the explicit ask).
- **Onboarding and league-select don't over-stretch:** they are already inner-capped (`max-w-xs`
  input, `max-w-lg` cards in `App.jsx`), so a wider outer container leaves their reading width
  intact — no per-surface edits needed, which keeps this within "container width only."
- A capped value (vs `max-w-none`) avoids unreadable >1600px table rows on ultrawide monitors.

### Exact edit — `src/components/shell/AppShell.jsx` (L34–39)

```diff
-        <main
-          className="flex-1 max-w-5xl mx-auto w-full px-8 py-8"
-          style={showNav ? { paddingBottom: TAB_BAR_HEIGHT + 32 } : undefined}
-        >
+        <main
+          className="flex-1 w-full mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8"
+          style={showNav ? { paddingBottom: TAB_BAR_HEIGHT + 32 } : undefined}
+        >
```

(`max-w-5xl` → `max-w-[1600px]`; responsive gutters `px-4 sm:px-6 lg:px-8` replace the fixed
`px-8` so mobile gets comfortable edges. If you prefer to keep `px-8`, that is fine — only the
`max-w` change is load-bearing.)

> **Cosmetic note (no action this slice):** the Roster and League surfaces will gain horizontal
> room at 1600px. They are not broken by it; if a later slice wants them reading-width, give *those*
> components their own inner `max-w-*` then — out of scope here (would touch files beyond
> AppShell/PlayersTab).

### Alternative (documented, not recommended)

If the user wants **only** the Explorer truly full-bleed while everything else stays `max-w-5xl`:
keep AppShell unchanged and wrap the Explorer root (`PlayersTab.jsx:1913`) in a viewport break-out
(`mx-[calc(50%-50vw)] w-screen px-4 sm:px-6 lg:px-8`, plus `overflow-x-clip` on an ancestor to
avoid a scrollbar-induced horizontal scroll from `100vw`). This is fiddlier (the `100vw`/scrollbar
gotcha) for a marginal gain; prefer the container widen above.

### TopBar alignment (optional)

`TopBar.jsx:8` centers its inner bar at `max-w-5xl mx-auto px-8`. After widening `<main>`, the
header content will be narrower than the content area. If the user wants the header to align with
the wider content, mirror the same `max-w-[1600px] px-4 sm:px-6 lg:px-8` there. **Optional** — list
it for the user; not required for the table request.

---

## Part 4 — Dark AA verification on the new surfaces (token math, no run)

Spot-checked the load-bearing data text / badges / charts against the **new** dark canvas/surfaces.

| Element | Pair (dark) | Ratio | Verdict |
|---|---|---|---|
| Primary data text on page | `--color-text` `#f4f5f7` on `canvas` `#08090c` | ~18:1 | ✅ |
| Primary text on cards | `--color-text` on `surface` `#101216` | ~16:1 | ✅ |
| Muted text (PPG-low, KTC) on row-hover | `--color-text-muted` `#9aa0aa` on `surface-2` `#171a20` | ~7:1 | ✅ |
| Recent low badge | `--color-text-muted` on `surface-3` `#1f232b` | ~6:1 | ✅ |
| Owner owned badge | `--color-text-secondary` `#d4d6db` on `surface-3` | ~12:1 | ✅ |
| Dynasty slate badge (**fixed**) | `--c-slate-700` `#cbd5e1` on `--c-slate-100` `#0f172a` | ~12:1 | ✅ |
| Hue badges (green/blue/etc.) | `-700/-800` light text on `-100` dark hue bg | 7–13:1 | ✅ |

**Remaining adjustments — chart small text (9–10px) on the deeper canvas.** Add explicit dark
overrides in `.dark` (the light aliases stay; this mirrors how `--color-chart-grid` already gets a
dedicated dark value):

| Token | Before (dark alias resolves to) | After (dark override) | Why |
|---|---|---|---|
| `--color-chart-label` | `var(--color-text-faint)` = `#6b7079` (≈4.0:1, sub-AA for 9–10px text) | `#8b919b` (≈6.6:1) | axis season labels become AA |
| `--color-chart-axis` | `var(--c-slate-400)` = `#64748b` (≈3.4:1) | `#7c8696` (≈5.4:1) | dashed avg line + "avg" label legible |

Bar fills are fine as-is: `--color-chart-recent` indigo `#6366f1`, `--color-chart-above` green
`#15803d`, `--color-chart-below` grey (`border-strong` dark) remain distinguishable on the canvas.
*(Optional vibrance: `--color-chart-above` could move to a brighter green if the "above-avg" bars
read too muted — not required for legibility.)* `SpiderChart` consumes the same chart tokens, so it
benefits identically (it is slated for retirement in slice 8, but is fixed meanwhile).

**Color/contrast values are validated by the user's manual dark smoke, not by unit tests** (see
Tests to add).

---

## Step sequence (implement in this order; build after each)

1. **Palette + tokens first** (`src/index.css`): add `--color-canvas` (light @theme + dark `.dark`);
   replace the light surface/border values (1.2) and dark surface/border values (1.3); add the
   `chart-label`/`chart-axis` dark overrides (Part 4); paint `body` + add `color-scheme` (1.4).
   `npm run build`. *(Everything renders on the new ground/ramp before any cell edits.)*
2. **Contrast fixes** (`PlayersTab.jsx`): `dynastyLabelColor` Veteran-Producer text
   `slate-600 → slate-700` (L89); KTC chip text `slate-600 → slate-700` (L1173); row hover
   `--c-blue-50 → --color-surface-2` (L2007). *(Optional same-pass: `SlotBadge` IR `red-600 →
   red-700`; rookie-Proj `opacity-70` drop.)* `npm run build`.
3. **Width** (`AppShell.jsx`): `max-w-5xl` → `max-w-[1600px]` + responsive gutters (L35). *(Optional:
   mirror on `TopBar.jsx:8`.)* `npm run build`.
4. **Done-definition** (CLAUDE.md): `npm test` green, `npm run lint` 0 problems, `npm run build`
   clean. **Do not run the dev server or any browser/visual smoke — hand back to the user for the
   manual dark+light smoke.**

---

## Constraints recap (for the implementer)

- **Presentation only.** Token **values** + the AppShell container width + the named cells. No
  data/pipeline/state/routing/behavior change. Do not move state, do not touch `App.jsx` logic.
- **Keep 1c's architecture.** Tune/extend values; `--color-canvas` is the only new token (a neutral
  role token, light+dark). Do **not** reintroduce raw Tailwind color classes; everything stays
  `bg-[var(--token)]` / `text-[var(--token)]`.
- **Light text/semantic tokens keep their 1c values.** Only surface/border/canvas (both themes) and
  two `slate-600→slate-700` cell swaps + two chart dark overrides change. (Changing light *surface*
  values is the intended request; do not change light values of non-surface tokens.)
- **Preserve never-color-alone** — untouched (this slice changes neutrals/contrast, not the
  market/confidence/movement encodings).
- **Do NOT start the dev server or run smoke/visual/browser tests** — the user does that manually.

---

## Docs updates

### A. CLAUDE.md — new convention line (no dev server / no smoke) — REQUIRED

Add an explicit rule that Claude Code must not start the dev server or run browser/visual/smoke
tests. Put it in the **Workflow convention** section's sonnet bullet (≈ CLAUDE.md L~/"Sonnet
session:").

> **before:**
> ```
> - Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.
> ```
> **after:**
> ```
> - Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.
> - **Visual verification is the user's job.** Claude Code must NOT start the dev server (`npm run dev` / `npm run preview`) or run any browser/visual/smoke test. Validate with `npm test` / `npm run lint` / `npm run build` only, then hand back for the user's manual smoke. This is especially load-bearing for theming/palette work, whose acceptance is the user's eyes in light **and** dark.
> ```

### B. CLAUDE.md — color-token note — REQUIRED

Update the **Color tokens** blockquote under `### src/` to mention the page-ground token and the
elevation model.

> **before:**
> ```
> > **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values. Components consume tokens (`bg-[var(--…)]`), never raw palette classes. Every new token must include a `.dark` override value.
> ```
> **after:**
> ```
> > **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values. `--color-canvas` is the page ground (painted on `body`); `--color-surface…surface-5` are the cards/panels/fills that layer above it (light = warm, surface lifts above canvas; dark = cool near-black, lighter-as-higher). Components consume tokens (`bg-[var(--…)]`), never raw palette classes. Every new token must include a `.dark` override value.
> ```

### C. docs/ui.md — theming note — REQUIRED (palette philosophy shifted)

In the **## Theming & tokens** section, append a short paragraph (the philosophy changed from "flat
single-surface" to "canvas + layered elevation"):

> ```
> **Surfaces & elevation (1e).** The page is painted with `--color-canvas` (a distinct ground), and
> `--color-surface…--color-surface-5` are the cards/panels/fills that layer above it. Light mode is a
> subtly warm off-white (surface lifts *above* canvas; higher surface numbers are progressively
> deeper warm-grey fills); dark mode is a cool-tinted near-black with standard lighter-as-higher
> elevation. The warm/cool feel is fully contained in the canvas/surface/border block of
> `src/index.css` — re-tint there in one edit (shift hue, keep the step spacing). Text and semantic
> tokens are unchanged and remain AA on these surfaces.
> ```

(No SpiderChart/peek doc changes here — those belong to slices 6/8 per the master plan.)

### D. README.md — OPTIONAL

`README.md:20` already says the app is token-driven and dark-first — still accurate. Optional
one-line addition after it: *"Surfaces layer over a `--color-canvas` page ground (warm off-white in
light, cool near-black in dark); re-tint the warm/cool feel in the canvas/surface block of
`src/index.css`."* Not required.

---

## Tests to add

**None.** Rationale:

- **Palette/contrast values** are validated by the **user's manual light+dark smoke**, not unit
  tests (per the new CLAUDE.md convention in Docs A). There is no color-contrast assertion harness
  in this repo, and adding one is out of scope.
- The **two `slate-600→slate-700` swaps**, the **hover repoint**, and the **chart-token overrides**
  are className/value changes with no behavior — per the
  [Done-definition](../../CLAUDE.md#done-definition-for-code-tasks) (purely non-behavioural changes
  need no tests).
- The **width change** is a single className edit with **no logic** — nothing to assert.
  `src/components/shell/AppShell.test.jsx` was checked: it asserts nav labels + children only, **no
  width class**, so it neither breaks nor needs updating.

`npm test` must still pass green unchanged (regression guard), per the Done-definition.

---

## Cross-repo impact

**NONE.** Pure app-side: `src/index.css` (token values + `body` paint), `PlayersTab.jsx` (two text
tokens + one hover token), `AppShell.jsx` (one container width), optional `SlotBadge.jsx` /
`TopBar.jsx`. No pipeline output, snapshot shape, manifest field, season-totals schema, enrichment
schema, nflverse/advstats shape, or any other
[Cross-repo contract](../../CLAUDE.md#cross-repo-contracts-with-sleeper-dashboard-data) is touched.
`sleeper-dashboard-data` needs no change.

---

## File-by-file change list (the whole slice)

| File | Change | Required? |
|---|---|---|
| `src/index.css` | add `--color-canvas` (light+dark); replace light surface/border values (1.2); replace dark surface/border values (1.3); add `chart-label`/`chart-axis` dark overrides (Part 4); paint `body` background + `color`, add `color-scheme` (1.4) | ✅ |
| `src/components/PlayersTab.jsx` | L89 `slate-600`→`slate-700`; L1173 `slate-600`→`slate-700`; L2007 hover `--c-blue-50`→`--color-surface-2` | ✅ |
| `src/components/shell/AppShell.jsx` | L35 `max-w-5xl`→`max-w-[1600px]` (+ responsive gutters) | ✅ |
| `src/components/league/SlotBadge.jsx` | IR `red-600`→`red-700` (same bug class, adjacent) | ⬜ optional |
| `src/components/PlayersTab.jsx` | L2065 drop rookie-Proj `opacity-70` | ⬜ optional |
| `src/components/shell/TopBar.jsx` | L8 mirror `max-w-[1600px]` to align header | ⬜ optional |
| `CLAUDE.md` | Docs A (no-smoke convention) + Docs B (token note) | ✅ |
| `docs/ui.md` | Docs C (theming note) | ✅ |
| `README.md` | Docs D (one-liner) | ⬜ optional |
