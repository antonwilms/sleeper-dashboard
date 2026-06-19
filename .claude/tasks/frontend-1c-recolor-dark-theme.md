# Slice 1c — Color-Token Audit + Recolor (+ 1d: Flip to Dark Default + Theme Toggle)

**Status:** implementation-ready task file (handoff artifact). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; stop and ask if anything contradicts live code. Per the **model-routing table**,
this is a high-volume but mechanical presentation refactor (token mapping + class swaps) — sonnet
work from this spec.

**Governing plan:** [.claude/tasks/frontend-overhaul.md](frontend-overhaul.md). 1a landed the token
seed (`src/index.css @theme`: six neutrals + market up/down + confidence + phase + radii; dark values
defined, inert). 1b extracted/routed every surface into `shell/ league/ roster/ board/ trade/`; theme
still light; every existing component still uses **hardcoded Tailwind color classes**.

> **Note on source state:** the overhaul is planned-but-not-yet-implemented, so the audited colors
> currently live in `src/App.jsx` (inline components) + `src/components/*.jsx`. After 1b they are the
> *same colors* relocated into `shell/ league/ roster/ …`. This plan audits current source and writes
> the recolor targets against the **post-1b directory layout** (1c runs after 1b).

---

## 0. RECOMMENDED SPLIT — 1c (recolor) + 1d (flip + toggle)

The audit (§1) found **~11 hue families across ~10 shades, ~15 components, plus inline-style and
SVG-hex cases**. The recolor is large but provably safe (a light-mode no-op). The flip's *code* is
small, but its *validation* — a comprehensive dark smoke across every surface and every interactive/
edge state, plus tuning dark token values — is a substantial, separate effort and the only place the
dark palette is actually earned.

**Therefore: execute as two sessions, same risk-isolation logic the master plan used for 1a/1b.**
- **1c — token expansion + recolor.** Every component → tokens. **Theme stays light** (tokens' light
  values == current hexes; no `.dark` applied). Validated by a *light-mode no-op* smoke + build/test.
- **1d — flip + toggle + dark smoke.** Apply `.dark` by default, add the persisted toggle, run the
  full dark smoke, tune dark token values.

This file specs both; **the recolor spec (§2–§4) is unchanged by the split.** §5 is 1c steps; §6 is
1d. If a single session is mandated, do §2–§5 then §6 — but the recommendation is to land 1c first.

---

## 1. Color audit (the crux)

### 1.1 Raw inventory (every distinct hardcoded color in use)

Full enumeration from `src/App.jsx` + `src/components/*.jsx` (counts are usage frequency):

- **Neutrals (dominant):** `gray-{50,100,200,300,400,500,600,700,800,900}` across `text-/bg-/border-/
  divide-`; `white` (`bg-white`×9, `text-white`×7); `slate-{100,600,700}`; black overlays
  `bg-black/20`,`bg-black/40`,`rgba(0,0,0,0.30)`. Hex neutrals in SVG/inline: `#111827`(900),
  `#6b7280`(500), `#9ca3af`(400), `#d1d5db`(300), `#e5e7eb`(200), `#f3f4f6`(100), `#f9fafb`(50),
  `#94a3b8`(slate-400).
- **Indigo (primary/accent):** `{50,100,200,400,500,600,700,800,900}` (`bg-/text-/border-/accent-`);
  hex `#6366f1`(500), `#a5b4fc`(300), `#c7d2fe`(200).
- **Blue (secondary interactive):** `{50,100,500,600,700,800}`; hex `#60a5fa`(400), `#93c5fd`(300).
- **Green (positive):** `{50,100,500,600,700,800}`; hex `#86efac`(300), `#22c55e`(500).
- **Red (negative):** `{50,100,500,600,700,800}`.
- **Yellow (warning):** `{50,100,400,600,700,800}`.
- **Orange (caution):** `{50,100,200,500,700,800}`; hex `#f97316`(500).
- **Amber (warning banner):** `{50,100,200,700,800}`.
- **Purple / violet (prospect):** `purple-{50,100,600,700,800}`; violet hex `#f5f3ff`(50),`#c4b5fd`(300).
- **Emerald (compare-2 / positive-alt):** `emerald-{50,700}`; hex `#10b981`(500).
- **Teal:** `teal-{100,700}`.

### 1.2 Semantic roles (from the conditional-color logic)

- **`dynastyLabelColor`** (`PlayersTab.jsx:73`): green=Elite/Ascending/Peak/Breakout; blue=Developing/
  Rising/Solid Floor/Bounce-back; yellow=Plateau; **slate=Veteran Producer**; orange=Managed Decline;
  red=Sell Now/Fading; purple=prospect; gray=default/Limited Data. **The badge always renders the
  label text** → never-color-alone holds (color is redundant emphasis).
- **`PosRankBadge`** (`:41`): green=top tier, yellow=mid, gray=low. The `{POS}{rank}` text is always
  shown; the rank number carries ordinal quality → color is redundant.
- **Chart fills** (`CareerBarChart` `:103`, etc.): recent=`#6366f1`(indigo-500), above-avg=`#86efac`
  (green-300), below=`#d1d5db`(gray-300), grid=`#f3f4f6`(gray-100), avg-line=`#94a3b8`(slate-400),
  label=`#9ca3af`(gray-400). Sparkline fill `#60a5fa`(blue-400). Compare series: 1=`#6366f1`,
  2=`#10b981`.
- **`AvailabilityHistory.STATUS_COLOR`** (`:5`): P=`bg-green-500`, D=`bg-red-500`, B=`bg-gray-300`,
  X=transparent+`border-gray-200`. Meaning carried by a **per-cell tooltip** (`W{n}: Played/DNP/…`).
- **`Tooltip.jsx`** (`:48`): inline style `background:'#111827'`, `color:'#f9fafb'`,
  `boxShadow:rgba(0,0,0,0.30)` — **not Tailwind classes**.

### 1.3 Pre-existing inconsistencies found (preserve faithfully in 1c; do NOT unify)

1. **Two confidence encodings.** Dynasty-score confidence dot uses **green/yellow/gray** (`high:
   bg-green-500, moderate: bg-yellow-400, else bg-gray-300` — `:842`,`:1077`); projection-confidence
   badge uses **indigo/blue/gray/purple** (`:1113`), which is what 1a's `--color-confidence-*` tokens
   match. 1c keeps both visually identical (map each to its own tokens). Harmonizing them is a future
   concern (slice 2/3 when chip confidence standardizes) — **out of scope here** (unifying = a visible
   change).
2. **Blue vs indigo dual-primary.** Both are used as "primary/interactive" (indigo buttons/links/
   selected; blue submit button, row hover, links, starter badge). 1c preserves both as distinct
   tokens (no-op). Harmonization is out of scope.
3. **`gray-300` overloaded** as background (`bg-gray-300`) *and* faint foreground (`text-gray-300`
   dashes, ×23). These need **role-split** tokens (a single inverting primitive would make dark
   dashes invisible). See §2.1.

### 1.4 Never-color-alone status (the audience-critical check)

- **Market up/down** (1a) and **dynasty labels / rank badges** already pair color with a glyph/sign or
  an always-visible text label → compliant.
- **`AvailabilityHistory` P/D cells** (green/red micro-squares) and **`PosRankBadge` tier** rely on
  color + tooltip / ordinal number, with no always-visible glyph. This is a **pre-existing borderline
  case**. 1c is a recolor: keep the green/red colorblind-distinguishable (the chromatic ramp does) and
  **do not** redesign the cells to add glyphs (that's a content/layout change → out of scope). Flag a
  future a11y improvement (add a shape/letter cue to availability cells) for a later slice.

---

## 2. Token system after expansion

Two-tier system (the standard for theming): **chromatic primitives** (mechanical, faithful) +
**neutral/semantic tokens** (role-based, flip correctly). All added in `src/index.css @theme`
(extending 1a). Dark values live under the `.dark` override block (1a's `@custom-variant dark` and
`@theme inline` prohibition still apply — tokens must stay `var()`-overridable).

### 2.1 Neutral & surface tokens — role-based (light = current hex; dark = designed)

Neutrals are foreground/background-overloaded, so they are mapped **by role**, not by shade. Light
values equal the exact current hexes (no-op); dark is a designed cool-dark ramp (Linear/Vercel-style).

| Token | Role / consumers | Light | Dark |
|---|---|---|---|
| `--color-surface` | page bg (`bg-white`) | `#ffffff` | `#0a0a0b` |
| `--color-surface-2` | raised/inset (`bg-gray-50`) | `#f9fafb` | `#141517` |
| `--color-surface-3` | neutral badges/hover (`bg-gray-100`) | `#f3f4f6` | `#1c1e22` |
| `--color-surface-4` | stronger fill (`bg-gray-200/300`) | `#e5e7eb` | `#26282e` |
| `--color-border` | default border/divide (`*-gray-200`) | `#e5e7eb` | `#2a2d34` |
| `--color-border-strong` | emphasis border (`*-gray-300/400`) | `#d1d5db` | `#3a3d45` |
| `--color-text` | primary text (`gray-900`) | `#111827` | `#f4f5f7` |
| `--color-text-secondary` | emphasis body (`gray-700`) | `#374151` | `#d4d6db` |
| `--color-text-muted` | labels (`gray-500/600`) | `#6b7280` | `#9aa0aa` |
| `--color-text-faint` | faint (`gray-400`) | `#9ca3af` | `#6b7079` |
| `--color-text-faintest` | dashes/placeholder (`text-gray-300`) | `#d1d5db` | `#52555c` |
| `--color-on-accent` | text on solid accent (`text-white`) | `#ffffff` | `#ffffff` |
| `--color-scrim` | modal/panel backdrop (`bg-black/20–40`) | `rgb(0 0 0 / 0.30)` | `rgb(0 0 0 / 0.55)` |
| `--color-tooltip-bg` | `Tooltip` inline bg (`#111827`) | `#111827` | `#26282e` |
| `--color-tooltip-fg` | `Tooltip` inline text (`#f9fafb`) | `#f9fafb` | `#f4f5f7` |

`gray-600` and `gray-700` both appear as text; map `gray-600`→`--color-text-muted`,
`gray-700`→`--color-text-secondary` (their light values differ slightly — keep distinct to stay a
no-op). `slate-{100,600,700}` and `#94a3b8` map to the nearest neutral token (`surface-3`/
`text-muted`/`text-secondary`/`text-faint`) **except** the Veteran-Producer badge — see §2.3.

### 2.2 Chromatic primitives — per-shade ramps (light = Tailwind hex; dark = Tailwind flip)

Define one primitive per **(hue, shade) actually used**, named `--c-{hue}-{shade}`. **Light value =
Tailwind's `{hue}-{shade}` hex exactly** → the recolor (`green-700` → `var(--c-green-700)`) is a
guaranteed light no-op. **Dark value = Tailwind's `{hue}-{flipped}` hex**, per this role-aware flip
(Tailwind v4 ships `-950` for every hue, so dark values are read straight off Tailwind's own
perceptually-tuned ramp — no arbitrary hand-picking):

| Light shade (role) | Dark shade |
|---|---|
| `50` (subtle bg) | `950` |
| `100` (subtle bg / soft badge) | `900` |
| `200` (border / soft) | `800` |
| `300` (chart fill / soft) | `700` |
| `400` (solid-ish / accent dot) | `500` |
| `500` (solid fill / dot) | `500` (keep; nudge to `400` only if it fails contrast in the 1d smoke) |
| `600` (solid button / link) | `500` |
| `700` (text) | `300` |
| `800` (text) | `200` |
| `900` (text) | `200` |

Shades to define per hue (from §1.1):

| Hue (`--c-…`) | Shades used | Primary consumers |
|---|---|---|
| `indigo` | 50,100,200,300,400,500,600,700,800,900 | accent: buttons, links, selected rows, signal badges, score bars, chart-recent, compare-1, confidence-high |
| `blue` | 50,100,300,400,500,600,700,800 | submit button, row hover, links, starter badge, "Developing/…" dynasty label, sparkline, confidence-medium |
| `green` | 50,100,300,500,600,700,800 | undervalued, top-rank tier, Elite/Ascending labels, played status, above-avg chart, FA badge, "returned" check |
| `red` | 50,100,500,600,700,800 | overvalued, Sell/Fading labels, DNP status, error text |
| `yellow` | 50,100,400,600,700,800 | mid-rank tier, Plateau label, dynasty-confidence "moderate" dot, no-stats banner |
| `orange` | 50,100,200,500,700,800 | Managed-Decline label, down-movement arrow |
| `amber` | 50,100,200,700,800 | onboarding "season hasn't started"/auto-load warning banners |
| `purple` | 50,100,600,700,800 | prospect dynasty/confidence, rookie projection |
| `violet` | 50,300 | CompSparkline prospect fills (`#f5f3ff`,`#c4b5fd`) |
| `emerald` | 50,500,700 | compare-2 series, college/positive-alt badges |
| `teal` | 100,700 | misc badge (college/positive-alt) |
| `slate` | 100,400,600,700 | Veteran-Producer badge (§2.3), chart avg-line |

### 2.3 Tier-2 semantic aliases (reference the primitives; for new chrome + clarity)

These let new components (and 1a's chip) use semantic names, and give charts readable names. Each is
`var(--c-…)`; they exist in both themes automatically because the primitives flip.

- **Accent:** `--color-accent: var(--c-indigo-600)`, `--color-accent-hover: var(--c-indigo-700)`,
  `--color-accent-subtle-bg: var(--c-indigo-50)`, `--color-accent-border: var(--c-indigo-200)`,
  `--color-accent-text: var(--c-indigo-700)`.
- **Status:** `--color-positive*` → green; `--color-negative*` → red; `--color-warning*` → yellow;
  `--color-caution*` → orange (each with `-subtle-bg` = `-50/-100`, `-solid` = `-500`, `-text` =
  `-700/-800`).
- **Market (1a, keep):** `--color-market-up: var(--c-green-600)`,
  `--color-market-down: var(--c-red-600)` (+ existing `-bg` from 1a). Re-point 1a's literals to the
  primitives so they flip with the ramp.
- **Confidence (two encodings, both preserved):**
  - projection badge (1a): `--color-confidence-high: var(--c-indigo-…)`, `-medium: var(--c-blue-…)`,
    `-low: var(--c-gray/neutral)`, `-rookie: var(--c-purple-…)`.
  - dynasty-score dot: `--color-conf-dot-high: var(--c-green-500)`,
    `--color-conf-dot-moderate: var(--c-yellow-400)`, `--color-conf-dot-default: var(--c-neutral…)`.
- **Data-viz:** `--color-chart-recent: var(--c-indigo-500)`,
  `--color-chart-above: var(--c-green-300)`, `--color-chart-below: var(--color-border-strong)`,
  `--color-chart-grid` (light `#f3f4f6` / dark `rgb(255 255 255 / 0.06)`),
  `--color-chart-axis: var(--c-slate-400)`, `--color-chart-label: var(--color-text-faint)`,
  `--color-compare-1: var(--c-indigo-500)`, `--color-compare-2: var(--c-emerald-500)`,
  `--color-sparkline: var(--c-blue-400)`.
- **Phase (1a, still unused):** keep as-is.
- **Dynasty label families:** the recolor maps `dynastyLabelColor`'s class pairs directly to chromatic
  primitives (`bg-green-100 text-green-800` → `bg-[var(--c-green-100)] text-[var(--c-green-800)]`), so
  no per-label alias is required; the Veteran-Producer `slate` pair uses `--c-slate-{100,600}`.

---

## 3. Audited color → token mapping (mechanical)

| Hardcoded | Token utility |
|---|---|
| `bg-white` | `bg-[var(--color-surface)]` |
| `bg-gray-50` | `bg-[var(--color-surface-2)]` |
| `bg-gray-100` | `bg-[var(--color-surface-3)]` |
| `bg-gray-200`, `bg-gray-300` | `bg-[var(--color-surface-4)]` |
| `border-gray-100/200`, `divide-gray-200` | `border-[var(--color-border)]` / `divide-[var(--color-border)]` |
| `border-gray-300/400` | `border-[var(--color-border-strong)]` |
| `text-gray-900` | `text-[var(--color-text)]` |
| `text-gray-800/700` | `text-[var(--color-text-secondary)]` |
| `text-gray-600/500` | `text-[var(--color-text-muted)]` |
| `text-gray-400` | `text-[var(--color-text-faint)]` |
| `text-gray-300`, `text-gray-200` | `text-[var(--color-text-faintest)]` |
| `text-white` (on accent) | `text-[var(--color-on-accent)]` |
| `bg-black/20`,`/40`, `rgba(0,0,0,0.30)` | `bg-[var(--color-scrim)]` / inline `var(--color-scrim)` |
| `slate-100` (non-veteran) | `--color-surface-3`; (veteran badge) `--c-slate-100` |
| any `{hue}-{n}` class (indigo/blue/green/red/yellow/orange/amber/purple/emerald/teal) | `…-[var(--c-{hue}-{n})]` |
| SVG `fill="#6366f1"` etc. (hex) | `fill="var(--c-…)"` via the §2.3 chart aliases |
| `Tooltip` inline `#111827`/`#f9fafb` | inline `var(--color-tooltip-bg)` / `var(--color-tooltip-fg)` |

> **Tailwind v4 arbitrary-value syntax** `bg-[var(--token)]` is the mechanism (no `tailwind.config`).
> Where the same role recurs heavily, the implementer may instead define a Tier-2 alias utility and
> use it — but the table above is the canonical, mechanical mapping. Every light value is identical to
> today ⇒ **light is a pixel no-op**.

---

## 4. Per-directory recolor spec (post-1b layout)

Apply §3 mechanically; under light the result is unchanged. Group the work for checkpointing (§5):

- **`src/components/ui/`** — `ValueChip` already token-driven (1a); no change. (`AdvancedStatsPanel`,
  `Tooltip`, `AvailabilityHistory` live in `components/` today — recolor in place; `Tooltip`'s inline
  hexes → `var(--color-tooltip-*)`; `AvailabilityHistory.STATUS_COLOR` → positive/negative/neutral
  primitives.)
- **`src/components/shell/`** — `TopBar`, `NavRail`, `BottomTabBar`, `AppShell` (new chrome may already
  use tokens from 1b — verify), `CareerLoadProgressBar` (`bg-gray-900` bar → `--color-surface`-inverse
  or a dedicated `--color-toast-bg`; the blue progress fill → `--c-blue-400`), `ClearCacheButton`/
  `ExportDataButton` (gray text/underline → neutral tokens).
- **`src/components/league/`** — `StandingsTable`, `ScheduleGrid` (won/lost cells `bg-green-100/red-100`
  → green/red primitives; the cell meaning is the score number → never-color-alone OK), `RostersTab`,
  `SlotBadge` (Starter `bg-blue-100 text-blue-700`, Bench gray, IR `bg-red-100 text-red-600` → tokens).
- **`src/components/roster/`** — `MyTeamView`, `PlayerCard` (starter/IR accents, confidence badge
  `confColor` map → confidence tokens), `Sparkline` (`#60a5fa` → `--color-sparkline`).
- **`src/components/board/`, `src/components/trade/`** — placeholders (token-driven from 1b); verify.
- **`src/components/PlayersTab.jsx`** (the largest) — Explorer table (header, row hover `hover:bg-blue-50`
  → accent/blue subtle, PPG/Proj confidence styling, KTC/owner/FA badges), `PosRankBadge`,
  `dynastyLabelColor`, `CareerSparkline`/`CareerBarChart`/`WeeklyBarChart`/`CompSparkline` (hex fills →
  chart aliases), `FilterSidebar` (`accent-indigo-500` inputs, chips, range sliders), `PlayerProfile`
  + all tabs (header chips, score-chip confidence **dot** green/yellow/gray → `--color-conf-dot-*`,
  projection confidence **badge** → `--color-confidence-*`, signal badges, market-divergence chips,
  breakout chips, Dynasty/Team tab, `SpiderChart` overlay), `ComparisonTray` (label badges, compare
  colors).
- **`src/components/SpiderChart.jsx`** — **slated for retirement (master plan §3, slice 8).** Recolor
  **minimally** for dark-correctness only: grid/axis grays → neutral chart tokens; the two overlay
  colors (`#6366f1`/`#10b981`) → `--color-compare-1/2`. Flag "pending retirement; do not invest."
- **`src/App.jsx`** (inline onboarding/boot/league-loading/error JSX that stays per 1b) — username
  form, league cards (`border-blue-600 bg-blue-50` selected → accent/blue subtle), warning banners
  (`bg-amber-50 border-amber-200 text-amber-800` → amber primitives), error text (`text-red-600` →
  `--color-negative-text`), the submit button (`bg-blue-600 text-white` → blue + on-accent).

No layout, spacing, typography, structure, prop, or behavior changes anywhere — **color utilities and
inline color values only.**

---

## 5. Step sequence — 1c (each step a LIGHT no-op; build+test green before next)

The light no-op is the safety net: after every step the running app must look **pixel-identical** in
light (tokens' light values == prior hexes). Checkpoint = `npm run build` clean + `npm run dev` visual
diff against current.

1. **Expand tokens.** Add all §2 primitives + neutral/semantic + chart aliases to `index.css` `@theme`
   (light values) and the `.dark` override block (dark values). No component touched yet → app
   unchanged. Build green.
2. **Shared primitives first:** `Tooltip` (inline-hex → tokens) and `AvailabilityHistory`. Checkpoint:
   tooltips and the availability sparkline look identical in light.
3. **Shell + League + Roster** (`shell/ league/ roster/`, plus `App.jsx` onboarding/boot/error JSX).
   Checkpoint: every league surface, My Team, onboarding, loading, error look identical.
4. **PlayersTab — non-profile:** Explorer table, `PosRankBadge`, `dynastyLabelColor`, the four chart
   helpers, `FilterSidebar`, `ComparisonTray`. Checkpoint: Explorer + filters + tray identical.
5. **PlayersTab — PlayerProfile** (header, all tabs, both confidence encodings, divergence chips,
   `SpiderChart` minimal). Checkpoint: open a profile; every tab identical in light.
6. **Sweep + verify no-op:** grep that **no raw Tailwind color class or color hex remains** in the
   recolored files (see §8 verification); `npm test`, `npm run lint`, `npm run build` all green.
   Theme is still light (no `.dark` applied). **1c done.**

---

## 6. 1d — Flip to dark default + theme toggle

### 6.1 Mechanism + state (App owns all state; no context, no state lib)

- **Theme helpers** — `src/theme.js` (pure, mirrors App's existing `loadStoredUser`/`saveStoredUser`
  localStorage-helper pattern; this is *not* state, it's load/persist/apply utilities):
  ```js
  const LS_THEME = 'theme'
  export function loadStoredTheme() { try { return localStorage.getItem(LS_THEME) || 'dark' } catch { return 'dark' } }
  export function persistTheme(t)   { try { localStorage.setItem(LS_THEME, t) } catch {} }
  export function applyThemeClass(t){ document.documentElement.classList.toggle('dark', t === 'dark') }
  ```
- **State in `App.jsx`:** `const [theme, setTheme] = useState(loadStoredTheme)` (alongside
  `tooltipsEnabled`). A toggle handler `handleToggleTheme` flips `'dark'⇄'light'`. An effect applies +
  persists: `useEffect(() => { applyThemeClass(theme); persistTheme(theme) }, [theme])`.
- **Anti-FOUC pre-paint** — add a tiny inline script to `index.html` `<head>` (before the module
  script) so the `.dark` class is set before first paint (default dark, stored pref wins):
  ```html
  <script>try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}</script>
  ```
- **Toggle UI:** a button in `shell/TopBar` next to the Tooltips toggle; `App` passes `theme` +
  `onToggleTheme` as props (same pattern as `tooltipsEnabled`/`onToggleTooltips`). Token-driven; a
  sun/moon glyph + visible label so it is not icon-only.

### 6.2 `prefers-color-scheme` decision (justified)

**Default to dark regardless of OS; a stored user choice always wins; do not read
`prefers-color-scheme`.** The design doc makes dark the product's *identity* ("dark-first default,
light offered"), not a mirror of OS state — a serious instrument shouldn't flip to light at midday
because the OS is light, contradicting its own stated default. Simpler, fewer states, on-brand. (The
alternative — first-visit follows OS, else dark — was rejected: it makes the default non-deterministic
and undercuts the explicit "dark-first" directive. Easy to add later if desired.)

### 6.3 Dark smoke protocol (where the dark palette is earned)

With `.dark` default-on, walk **every surface in every state** and fix dark issues (adjusting `.dark`
token values only — never light values, never light-mode appearance):
- **Surfaces:** Board/Trade placeholders, Roster/My Team, Players/Explorer, League (Standings/Schedule/
  Rosters), onboarding, boot-loading, league-loading, error banners, `CareerLoadProgressBar`.
- **Interactive/edge states:** nav active + hover (rail + bottom bar), Explorer row hover, sort
  headers, `FilterSidebar` open (chips, range sliders, multiselects), comparison tray active +
  side-by-side, **PlayerProfile open** (backdrop scrim, all three tabs, both confidence encodings,
  divergence chips, charts/sparklines, SpiderChart), tooltips, won/lost schedule cells, dynasty-label
  badges across all families, availability P/D/B/X cells.
- **Checks:** WCAG AA text contrast on all data text in dark (AAA on primary numbers where feasible);
  market up/down still colorblind-distinguishable; charts (grid/axis/fills) legible on dark; scrim
  separates the profile panel; no element invisible (esp. `text-faintest` dashes, transparent X
  cells).
- **Then toggle to light and re-verify** the full no-op (1c's light appearance is preserved).

### 6.4 If 1d is folded into 1c

Do §5 fully (light no-op, green) → §6.1 flip + toggle → §6.3 smoke. Do **not** interleave the flip
with the recolor — the light no-op checkpoint is the safety net and must hold before `.dark` is ever
applied.

---

## 7. Docs updates

Per the **Self-maintenance** rule.

### 7.1 `README.md`
- New **Theming** subsection: "Dark-first — the app defaults to a dark theme; a light/dark toggle in
  the header persists to `localStorage['theme']` (default dark; stored choice wins; OS preference is
  not read). All components are token-driven (`src/index.css @theme`); never add hardcoded Tailwind
  color classes — map to a token."
- Tech stack: note "design tokens + dark/light theming via Tailwind v4 `@theme` (no CSS-in-JS, no
  theme provider)."

### 7.2 `CLAUDE.md`
- **State table** (the "Key useState in App()" list, ~line 204–212) — add a row:
  > `| `theme` | `'dark'` \| `'light'` — persisted in `localStorage['theme']`; applied via `.dark` class on `<html>` (default dark) |`
- **Navigation map src/ table** — add: `| `theme.js` | Theme load/persist/apply helpers (`loadStoredTheme` default-dark, `persistTheme`, `applyThemeClass`); localStorage-helper pattern, not state |`.
- Add a one-line **token taxonomy** note near the structure: "Color is tokenized in `src/index.css`
  `@theme`: neutral/surface role tokens + chromatic primitives `--c-{hue}-{shade}` + semantic aliases
  (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark
  values. Components consume tokens (`bg-[var(--…)]`), never raw palette classes."
- Note `index.css` is no longer bare (cross-references the 1a entry).

### 7.3 `docs/ui.md`
- **Persistent session** section (the tooltips-toggle paragraph, ~lines 9–11) — add: "A **light/dark
  theme toggle** sits beside the tooltips toggle in the header; default dark, persisted to
  `localStorage['theme']`."
- Add a short **Theming & tokens** note pointing to `src/index.css @theme` as the color source of
  truth, instructing later slices to consume tokens (not hardcoded colors) and to add a `.dark` value
  for any new token.

### 7.4 `docs/architecture.md`
- Add `theme` to any state inventory and a one-line "Theming" note (token-driven, `.dark` on `<html>`,
  default dark, no provider).

---

## 8. Tests to add

The **recolor (1c) is validated by build + dual-theme manual smoke, not unit tests** — it's a visual
no-op; assert it by grep + eyeball. Add a **verification grep** to the 1c done-check: no raw color
class/hex remains in recolored files —
`grep -rE '\b(bg|text|border|ring|fill|stroke|from|to|via|divide|accent)-(white|black|gray|slate|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-[0-9]{1,3})?\b|#[0-9a-fA-F]{3,8}' src/App.jsx src/components`
should return only intentional exceptions (e.g. a documented token definition). (Tailwind opacity
shorthands on tokens like `bg-[var(--color-scrim)]` are fine.)

**1d — theme toggle tests** (`src/theme.test.js`, node env — pure-ish; DOM bits use jsdom):
- `loadStoredTheme()`: empty localStorage → `'dark'` (default-dark); `'light'` stored → `'light'`;
  `'dark'` stored → `'dark'`; throwing localStorage → `'dark'` (catch path).
- `persistTheme('light')` then `loadStoredTheme()` → `'light'` (round-trip / restore-on-load).
- `applyThemeClass` (jsdom — `// @vitest-environment jsdom` for these cases): `'dark'` adds `.dark` to
  `document.documentElement`; `'light'` removes it; idempotent on repeat.
- **TopBar toggle** (`shell/TopBar.test.jsx`, jsdom, MemoryRouter, mirror `AdvancedStatsPanel.test.jsx`
  setup): renders a theme toggle reflecting the `theme` prop (shows both label states), and clicking it
  calls `onToggleTheme` once. Edge: renders without `user` (onboarding state) still shows the toggle.

No tests for the chromatic/neutral token values themselves (design values, smoke-validated). Per the
**Done-definition**, `npm test`/`lint`/`build` green; no contract tests apply (no `seasonProjection.js`
/ stat-key changes).

---

## 9. Cross-repo impact

**None.** Color tokens, recolor, the theme flip, and the toggle are pure app-side presentation. No
data shape, manifest field, snapshot, pipeline, cache, or `sleeper-dashboard-data` contract is touched.

---

## 10. Done-definition checklists

**1c (recolor):**
- [ ] All §2 tokens (primitives + neutral/semantic + chart aliases) added to `index.css` with light +
      dark values; `@theme` stays plain (no `inline`); `.dark` overrides present but **not applied**.
- [ ] Every component in §4 recolored per §3; `Tooltip` inline hexes and all SVG hexes → `var()`;
      `SpiderChart` minimally recolored (flagged pending-retirement).
- [ ] §8 verification grep clean (no stray palette classes/hexes).
- [ ] App still **light**; pixel-identical to pre-1c in every surface/state (manual smoke per §5).
- [ ] No layout/behavior/state/routing/pipeline change; no new deps.
- [ ] `npm test` / `npm run lint` / `npm run build` green. Docs §7.1–§7.3 (toggle text deferred to 1d).

**1d (flip + toggle):**
- [ ] `src/theme.js` helpers; `theme` `useState` in App; apply+persist effect; `index.html` anti-FOUC
      script; toggle in `shell/TopBar` (props from App; no context/state lib).
- [ ] Default **dark**, stored pref wins, OS not read (§6.2).
- [ ] Full dark smoke (§6.3) passed; dark token values tuned; WCAG AA in dark; never-color-alone holds;
      light re-verified via toggle.
- [ ] `src/theme.test.js` + `shell/TopBar.test.jsx` added and green; `npm test`/`lint`/`build` green.
- [ ] Docs §7 completed (README Theming, CLAUDE.md state row + `theme.js` + taxonomy, ui.md toggle).
