# Slice 0 — Retire the light theme

**Program:** [dp-v2.md](dp-v2.md) (v2 master plan). This is its first slice.
**Decision it implements:** dp-v2 §2.1 — *"i dont mind if the app only supports dark theme for now"*
(Anton, 2026-08-18).
**Model:** sonnet. Small, fully specified, no architecture to decide.
**Baseline:** app `afc7239`.

**Why this is first.** Every later v2 slice would otherwise keep making a "which token family, and
does this token need a `.dark` value" decision that stops having a reason to exist once the toggle is
gone. It is also the only v2 slice whose acceptance is purely visual, so it must not be batched with
Slice 1 (whose acceptance is unit tests) — a visual regression would be hard to attribute.

---

## 0. Confirmed against live source (`afc7239`)

Every claim below was read, not assumed. If any has drifted, **stop and report** rather than adapting.

| Fact | Site |
|---|---|
| `loadStoredTheme` is **already default-dark** | `src/theme.js:4` — `localStorage.getItem('theme') \|\| 'dark'` |
| `theme.js` exports exactly three functions, and **`App.jsx:44` is its only importer** | `src/theme.js`; `grep -rn "from './theme'" src` |
| `<html>` has no `class` attribute, **but `.dark` is already applied pre-paint** by an inline script that reads `localStorage['theme']` | `index.html:2` (tag) and **`index.html:8`** (the script — see §2) |
| The dark branch is class-activated | `src/index.css:4` — `@custom-variant dark (&:where(.dark, .dark *));` and the `.dark {` block at `:240` |
| `App.jsx` theme surface | `:44` import · `:99` state · `:101-103` `handleToggleTheme` · **`:105-108` effect** (the `useEffect(` line is `:105`) · `:909-910` props |
| `AppShell` takes `theme`/`onToggleTheme` and forwards both to `TopBar` only | `AppShell.jsx:9-10, 23-24` |
| `AppShell` has **one** render site | `App.jsx:905` |
| `TopBar` uses theme in 4 places | `:42` props · `:45` `isDark` · **`:178-185`** the button · **`:5-9`** the stale justification comment |
| `TopBar.test.jsx` has a 4-test `describe('TopBar theme toggle')` block at `:18-56`, and passes `theme`/`onToggleTheme` at **6** call sites | `:22`, `:31`, `:41`, `:51`, `:71`, `:159` |
| `AppShell.test.jsx` does **not** reference theme | `grep -rn "theme" src --include="*.test.js*"` |
| `src/theme.test.js` holds **9** tests across 3 `describe`s | `src/theme.test.js` |
| Tests reading source files as text are established practice (root-relative paths) | `src/__tests__/advStatsViewOnly.test.js:1,33` |
| `DEFAULT_ROUTE`'s "temporary" note | `navItems.js:1-3` |

**Token inventory** (dp-v2 §2.1, verified in `src/index.css`): 69 `--c-*` primitives all carry
`.dark` overrides; 29 semantic `--color-*` tokens carry them (ground/chrome/text family); **35
deliberately do not** and were verified AA on both grounds in 1b Slice 1e.

---

## 1. What this slice does, and what it must not do

**Does:** makes `.dark` unconditional, deletes the toggle and the theme module, and settles the
`DEFAULT_ROUTE` note.

**Must NOT do — each of these is a separate concern and out of scope:**
- **No CSS token or variant changes.** In `src/index.css`, no token declaration and no
  `@custom-variant` line may change — the 29 adaptive tokens simply always resolve to their dark
  branch. **Comment-only edits are the one permitted exception**, because two comments become
  actively false: `:3` ("activated in 1d by adding .dark to `<html>`") and, worse, `:239`
  ("Dark token overrides — **INERT** until 1d adds .dark"), which now describes the *only* live
  branch. The fence exists to stop recoloring and token churn, not to preserve a comment that
  misdescribes reality. §12's check is written to enforce exactly that line.
- **No token-family merge.** `--color-dp-*` (39 tokens, dark-only) stays exactly as it is, and stays
  distinct from the adaptive `--color-*` family. Merging them is a cosmetic refactor with real
  regression risk and no user-visible benefit (dp-v2 §2.1).
- **No recoloring, no component restyling.** Nothing in `League`/`Board`/`Trade` is touched.
- **No `CeilingFloorCell` badge restoration.** This slice *unlocks* it; Slice 5 may take it.
- Do not delete `applyThemeClass`'s *behaviour* by leaving a dead call — see §3.

**The visual bar: the app must look identical to today's default-dark state, with one fewer control
in the header.** That is the whole acceptance criterion.

---

## 2. `index.html` — delete the inline theme script, hard-code the class

**This section was rewritten after plan-review, which found the premise wrong.** `.dark` is
**already applied pre-paint today**, by an inline script at `index.html:8`:

```js
try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}
```

So the no-flash property this slice wanted is not new — it already exists, and the original
rationale ("a JS call in `main.jsx` would paint light for one frame") argued for something already
true. The real reason to move to markup is different and stronger: **that script is a live reader of
the key this slice retires.**

**The bug this prevents.** Delete `theme.js` and the toggle but leave the script, and any user with
`theme: 'light'` already in `localStorage` — from any point before this slice — gets `.dark` withheld
on every future load, rendering the entire app on the light branch, **with no toggle left to fix
it.** Unreachable state, no recovery path in the UI. This is the one way this slice could ship a
real regression, and it is invisible to every automated check.

Two edits, both required, neither sufficient alone:

```diff
-<html lang="en">
+<html lang="en" class="dark">
```

```diff
-    <script>try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}</script>
```

After this, `.dark` is unconditional and present in the served markup — nothing reads
`localStorage['theme']` and nothing applies the class at runtime, which is what lets `theme.js` go
entirely (§3).

**The orphaned key is left in place, deliberately.** Any existing `localStorage['theme']` value
becomes inert once nothing reads it. Clearing it would require code that runs once on load —
reintroducing exactly the thing being deleted, to tidy a value with no effect. So: **do not write a
migration.** Word the docs as "no longer read" rather than "no `localStorage['theme']`", since the
key may still exist in a returning user's browser (§9).

## 3. Delete `src/theme.js` and `src/theme.test.js`

With the class in markup, all three exports are unreachable. Delete both files.

This is a module deletion, so its tests go with it — the same reasoning as 1b Slice viii, where 114
tests were deleted alongside their surfaces ("expected, not lost coverage"). **But one invariant those
tests were indirectly protecting still needs a guard**, so §8 adds a replacement assertion. Do not
simply delete and move on.

Do **not** keep a reduced `applyDarkTheme()` shim. Nothing would call it.

---

## 4. `src/App.jsx`

Remove, in order:

| Line | Remove |
|---|---|
| `:44` | `import { loadStoredTheme, persistTheme, applyThemeClass } from './theme'` |
| `:99` | `const [theme, setTheme] = useState(loadStoredTheme)` |
| `:101-103` | `function handleToggleTheme() { … }` |
| `:105-108` | the `useEffect` calling `applyThemeClass(theme)` + `persistTheme(theme)` — the `useEffect(` line is `:105` |
| `:909-910` | `theme={theme}` and `onToggleTheme={handleToggleTheme}` on `<AppShell>` |

The effect spans `:105-108` inclusive of the `useEffect(() => {` line — at `afc7239` its body is
exactly those two calls, so the whole wrapper goes. If it has been extended since, remove only the
theme lines and **report the drift**.

`setTheme` is only reachable through `handleToggleTheme`, so both go together and no `no-unused-vars`
suppression is needed anywhere. `npm run lint` is the check.

---

## 5. `src/components/shell/AppShell.jsx`

Remove `theme` and `onToggleTheme` from the destructured prop list (`:9-10`) and from the `<TopBar>`
call (`:23-24`). Nothing else in `AppShell` reads them.

Note for the implementer: `AppShell`'s **fixed explicit prop list** is deliberate (it does not forward
arbitrary props — CLAUDE.md). Narrowing it is exactly the right change here; do not switch it to a
spread.

---

## 6. `src/components/shell/TopBar.jsx`

1. Remove `theme, onToggleTheme` from the props (`:42`).
2. Remove `const isDark = theme === 'dark'` (`:45`).
3. Delete the whole toggle `<button>` (`:178-185`) — the element with
   `title="Toggle light/dark theme"`, its `☀`/`☾` span and its `Light`/`Dark` label.

**Layout check:** the button sits inside
`<div className="flex items-center gap-3 text-sm shrink-0">` alongside the freshness indicator and
the user block. Removing one child of a `gap-3` flex row is safe, but confirm visually that the
right-hand cluster still reads correctly with both a user present and absent — that row is the only
place this slice can produce a visible change beyond the missing control.

4. **Update the comment at `:5-9`** (not just `:7-8` — the stale justification runs from "same as
   the rest of TopBar/NavRail/BottomTabBar, since it wraps League/Board/Trade in both themes" through
   "would render as a black panel under a light bar." on `:9`; rewording a sub-range leaves a dangling
   fragment). There is now one theme. Reword to say the dropdown stays on the adaptive `--color-*`
   family because that is what `TopBar` itself uses — the conclusion is unchanged, only its
   justification. **Do not change the dropdown's tokens.**

---

## 7. `src/components/shell/navItems.js`

`DEFAULT_ROUTE` stays `/market` (dp-v2 §2.2 — decided, no code change). Replace the two-line
"temporary … re-evaluate" comment at `:1-2` with a settled one, e.g.:

```js
// '/market' is the landing surface (settled 2026-08-18, dp-v2 §2.2). Market is the app's
// data-display centre of gravity; Portfolio is one click away in the rail.
```

The point is to stop a future reader re-opening a closed question. Keep it to two lines.

---

## 8. Tests to add / update

**Add — one new guard.** The `.dark` class is now load-bearing and lives in markup, where nothing
would catch its removal. Add a static assertion following the `advStatsViewOnly.test.js` pattern
(`readFileSync`, no DOM):

- new file `src/__tests__/darkThemeForced.test.js`
- asserts `index.html`'s `<html>` tag carries `dark` in a `class` attribute
- asserts `index.html` contains **no** `localStorage` read (the §2 script must not come back — its
  return would silently restore the light branch for any user with a stale stored value)
- asserts `src/theme.js` **does not exist** (the module was deleted deliberately; a reintroduced
  theme module means the decision is being reversed without a plan)
- one sentence at the top of the file saying why it exists: dp-v2 §2.1, dark-only, class in markup so
  there is no light flash on first paint

**Update — `TopBar.test.jsx`.** Three of the four tests in `describe('TopBar theme toggle')` test
deleted behaviour and go with it. **The fourth must be rewritten, not deleted:**

| Test | Action |
|---|---|
| `shows "Light" label when theme is dark` | delete |
| `shows "Dark" label when theme is light` | delete |
| `calls onToggleTheme once when toggle button is clicked` | delete |
| **`renders toggle even without a user (onboarding state)`** | **rewrite** |

That fourth test's *subject* is the null-user onboarding state; the toggle was merely what it happened
to assert. Deleting it silently drops null-user coverage of `TopBar`. Rewrite it to assert something
that survives — with `user: null` and a `currentWeek` supplied, the freshness indicator renders
(`Data current · Week N`, `TopBar.jsx:172-177`) and no `Switch` link is present. Rename the test to
match its real subject, e.g. `renders without a user (onboarding state)`.

Then remove `theme="dark"` / `onToggleTheme={() => {}}` from the remaining call sites — `:71` and
`:159` per §0, plus any inside the rewritten test. `baseProps` (`:11-16`) does **not** carry them, so
it needs no change.

**No new behavioural tests beyond the guard.** Nothing else in this slice changes behaviour a test
can observe; the rest is deletion.

---

## 9. Docs updates (same change, per CLAUDE.md self-maintenance)

| File | Edit |
|---|---|
| `CLAUDE.md:63` | `theme.js` row — **delete it**; the module is gone |
| `CLAUDE.md:67` | dp-token note — drop "the shared chrome keeps the light/dark-adaptive family … in both themes" framing and the "because the page `body` still follows the theme toggle" clause. **Keep the paint-your-own-ground rule** — it is still correct practice and still enforced elsewhere; only its stated reason changes |
| `CLAUDE.md:90` | `TopBar` row — remove "theme toggle" from the feature list; drop "light/dark-adaptive" phrasing |
| `CLAUDE.md:93` | `Market.jsx` row — the `CeilingFloorCell` badge parenthetical explains the drop via the toggle. Note the toggle is gone and restoration is possible (dp-v2 §2.1), without implying it was done |
| `docs/ui.md:10` | Replace the theme-toggle sentence with: the app is dark-only, `.dark` is set in `index.html`, no toggle, no `localStorage['theme']` |
| `docs/ui.md:116` | Same rewording as `CLAUDE.md:67` — justification changes, conclusion does not |
| `docs/ui.md:122` | Same as `CLAUDE.md:93` |
| **`docs/ui.md:224`** | **Fix a factual error found while planning:** it claims the `.dark` block "contains dark-mode overrides for every token." It does not — 29 semantic tokens have overrides and **35 deliberately do not** (dp-v2 §2.1). Correct the claim and keep the `@custom-variant` explanation, updating "adding class `dark` to `<html>` enables dark mode" to note it is now always present |

| **`CLAUDE.md:65`** and **`docs/ui.md:195`** | **Amend the standing rule** "Every new token must include a `.dark` override value." With one theme, a new token takes a **single** value. Both the existing `.dark` block and the 29 overrides in it stay (the CSS is not retokenised) — but the block is **not to be extended**. Leaving this rule as-is would have later v2 slices obeying the exact per-token decision this slice exists to retire (plan-review `[strategy]`) |
| `CLAUDE.md:42` | routing table — drop "temporary — see below" from the `DEFAULT_ROUTE` cell |
| `CLAUDE.md:55` | nav-chrome paragraph — replace "**`DEFAULT_ROUTE=/market`, temporarily**, since 1b Slice iii — Portfolio is still a placeholder … re-evaluate when the Portfolio slice ships real content" with the settled wording. **Its premise is independently stale**: Portfolio stopped being a placeholder in 1b Slice iv, which `:43` already says |
| `docs/architecture.md:45` | Theming paragraph — rewrite: dark-only, `.dark` hard-coded in `index.html`, no `theme.js`, no stored key read. **CLAUDE.md:290 names this file as the non-duplicated authority for the state inventory**, so it cannot be skipped |
| `docs/architecture.md:38` | `leagueData`/state shape table — remove the `theme` row |
| `docs/architecture.md:51` | `useState` inventory — remove the `theme` row |
| `README.md:20` | remove the toggle + `localStorage['theme']` sentence; state dark-only |
| `README.md:9` | "design tokens + dark/light theming" → dark-only |

`docs/ui.md`'s "Theming & tokens" section (`:192-196`) should also lose its light-mode description of
the canvas/surface scale. **Keep the surface-elevation model itself** — it still governs; only the
light half is now unreachable.

**Wording rule for every site above:** say the stored key is **no longer read**, not that it is gone
(§2 — it may still sit inert in a returning user's browser).

---

## 10. Step sequence

1. `index.html` — add `class="dark"` **and delete the inline theme script** (§2). Both, together.
   Sanity-check the failure mode the script caused: set `localStorage['theme'] = 'light'`, reload, and
   confirm the app is still dark.
2. Delete `src/theme.js`, `src/theme.test.js`.
3. `App.jsx` — remove the six sites in §4.
4. `AppShell.jsx` — narrow the prop list.
5. `TopBar.jsx` — remove props, `isDark`, the button; reword the `:7-8` comment.
6. `navItems.js` — settle the `DEFAULT_ROUTE` comment.
7. `TopBar.test.jsx` — delete three tests, rewrite the fourth, strip the props from all call sites.
8. Add `src/__tests__/darkThemeForced.test.js`.
9. Docs (§9).
10. `npm test` → `npm run lint` → `npm run build`. Hand back for Anton's visual smoke.

Steps 1–2 first is deliberate: if the class were added last, every intermediate state would render
the light branch and any manual check in between would be misleading.

---

## 11. Cross-repo impact

**None.** No served data, no manifest field, no shape. No entry in `docs/cross-repo-registry.md` is
touched. State this explicitly in the hand-back anyway, per the registry rule.

---

## 12. Done-definition checklist

- [ ] `index.html` `<html>` carries `class="dark"` **and the inline theme script is deleted**
- [ ] With `localStorage['theme'] = 'light'` set, the app still renders dark (§2's regression)
- [ ] `src/theme.js` and `src/theme.test.js` deleted; no importer remains
- [ ] `App.jsx` has no `theme` state, handler, effect, import, or prop
- [ ] `AppShell` and `TopBar` prop lists narrowed; no dead `isDark`
- [ ] The toggle button is gone from the DOM
- [ ] `navItems.js` comment settled; `DEFAULT_ROUTE` value **unchanged** (`/market`)
- [ ] `src/index.css`: `git diff src/index.css` shows **comment-line changes only** — no token
      declaration and no `@custom-variant` line altered (§1)
- [ ] `TopBar.test.jsx`: 3 tests deleted, 1 rewritten to its real subject, all **6** prop sites cleaned
- [ ] `src/__tests__/darkThemeForced.test.js` added and passing
- [ ] Docs in §9 updated, including the `ui.md:224` factual fix
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean, no warnings
- [ ] `grep -rn "PROVISIONAL(" src/` output pasted into the hand-back (expect Slice ii's three,
      unchanged — this slice adds none)
- [ ] Test count reported. Expected net **−11**: `theme.test.js` holds **9** tests, 3 toggle tests
      are deleted (the 4th is rewritten, not removed), +1 new guard. A different number is a signal
- [ ] Hand back for visual smoke. **Do not run the dev server** (CLAUDE.md: visual verification is
      the user's job)

---

## 13. What to report in the hand-back

- Confirmation that `src/index.css` has zero diff.
- The rewritten null-user test's new assertion, quoted — so the reviewer can see coverage was
  preserved rather than dropped.
- Whether `App.jsx:106-108`'s effect was theme-only (wrapper deleted) or had grown (theme lines only).
- Anything in §0 that had drifted from `afc7239`.

---

## 14. Plan-review record (2026-08-18)

The reviewer raised **ten flags; all ten verified correct and all ten are applied above.** Anton
delegated the fix decisions, so this section records what changed rather than leaving flags for a
human to triage.

| Flag | Call |
|---|---|
| `index.html:8` inline script already applies `.dark` from `localStorage['theme']`; plan's rationale wrong and the script never deleted | **§2 rewritten.** The genuinely important one — leaving that script would strand any user with `theme:'light'` stored on the light branch with no toggle to recover. A shipped regression no test would catch |
| Theme effect starts `:105`, not `:106` | Anchors corrected in §0 and §4 |
| 6 prop call sites in `TopBar.test.jsx`, not 7 | §0 enumerates all six; §12 corrected |
| `theme.test.js` holds 9 tests, not 5 | §12's expected delta corrected to net **−11** |
| Stale `TopBar` comment spans `:5-9`, not `:7-8` | §6.4 corrected — rewording a sub-range would leave a dangling fragment |
| §9 omits `docs/architecture.md:38,45,51` and `README.md:9,20` | All five added. `architecture.md` is CLAUDE.md's named authority for the state inventory, so skipping it would have gone silently wrong |
| §9 leaves `CLAUDE.md:42,55` calling `DEFAULT_ROUTE` temporary | Both added — §7 settled it in code, and the doc has to agree or the closed question reopens. `:55` also carries an independently stale premise |
| `[strategy]` "Every new token must include a `.dark` override" survives in two places | Both amended. This was the sharpest non-mechanical flag: the rule *is* the per-token decision the slice exists to retire |
| `[edge-case]` `index.css:3,239` comments become false; §1's total fence blocks fixing them | **Fence narrowed** to token-and-variant-only, with comment edits permitted and §12's check rewritten to enforce that line precisely |
| §0 anchored the button `:179-184` while §6.3 said `:178-185` | §0 corrected to `:178-185` |

No `MIRROR` block: **no cross-repo impact**, independently confirmed — no `CR-NN` entry lists
`index.html`, `src/theme.js`, `src/components/shell/*` or `navItems.js` on its app side, and the
change reads or writes no served shape or stat key, so the standing app-side re-verification found
nothing stale either.

The reviewer separately confirmed clean: `theme.js:4` default-dark · `App.jsx:44` sole importer ·
`:99` · `:909-910` · the single `AppShell` render site at `:905` · `AppShell.jsx:9-10,23-26` and
nothing else in it reading theme · `TopBar.jsx:42,45` · the freshness indicator at `:172-177` · the
`gap-3 shrink-0` sibling row · `baseProps` carrying neither prop · `AppShell.test.jsx` never
referencing theme · `navItems.js:1-3` · `index.css:4` and `.dark {` at `:240` · the token inventory
(69 `--c-*` all overridden; of 103 `--color-*`, 39 dp leaving 64 semantic, 29 overridden, 35 not) ·
`docs/ui.md:10,116,122,224` · `CLAUDE.md:63,67,90,93` · and the root-relative `readFileSync` pattern
the new guard copies.

