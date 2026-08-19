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
| `<html>` carries **no class** today | `index.html:2` — `<html lang="en">` |
| The dark branch is class-activated | `src/index.css:4` — `@custom-variant dark (&:where(.dark, .dark *));` and the `.dark {` block at `:240` |
| `App.jsx` theme surface is 6 lines | `:44` import · `:99` state · `:101-103` `handleToggleTheme` · `:106-108` effect · `:909-910` props |
| `AppShell` takes `theme`/`onToggleTheme` and forwards both to `TopBar` only | `AppShell.jsx:9-10, 23-24` |
| `AppShell` has **one** render site | `App.jsx:905` |
| `TopBar` uses theme in 4 places | `:42` props · `:45` `isDark` · `:179-184` the button |
| `TopBar.test.jsx` has a 4-test `describe('TopBar theme toggle')` block, and passes `theme`/`onToggleTheme` at **7** call sites | `:18-55`, plus `:71` and `:159` |
| `AppShell.test.jsx` does **not** reference theme | `grep -rn "theme" src --include="*.test.js*"` |
| Tests reading source files as text are established practice | `src/__tests__/advStatsViewOnly.test.js:1,33` |
| `DEFAULT_ROUTE`'s "temporary" note | `navItems.js:1-3` |

**Token inventory** (dp-v2 §2.1, verified in `src/index.css`): 69 `--c-*` primitives all carry
`.dark` overrides; 29 semantic `--color-*` tokens carry them (ground/chrome/text family); **35
deliberately do not** and were verified AA on both grounds in 1b Slice 1e.

---

## 1. What this slice does, and what it must not do

**Does:** makes `.dark` unconditional, deletes the toggle and the theme module, and settles the
`DEFAULT_ROUTE` note.

**Must NOT do — each of these is a separate concern and out of scope:**
- **No CSS changes at all.** `src/index.css` is not edited. Not the `@custom-variant` line, not the
  `.dark` block, not one token. The 29 adaptive tokens simply always resolve to their dark branch.
- **No token-family merge.** `--color-dp-*` (39 tokens, dark-only) stays exactly as it is, and stays
  distinct from the adaptive `--color-*` family. Merging them is a cosmetic refactor with real
  regression risk and no user-visible benefit (dp-v2 §2.1).
- **No recoloring, no component restyling.** Nothing in `League`/`Board`/`Trade` is touched.
- **No `CeilingFloorCell` badge restoration.** This slice *unlocks* it; Slice 5 may take it.
- Do not delete `applyThemeClass`'s *behaviour* by leaving a dead call — see §3.

**The visual bar: the app must look identical to today's default-dark state, with one fewer control
in the header.** That is the whole acceptance criterion.

---

## 2. `index.html` — force the class in markup, not in JS

```diff
-<html lang="en">
+<html lang="en" class="dark">
```

**Why markup and not `main.jsx`.** The class is then present before the first paint and before React
mounts, so there is no flash of the light branch on load. A JS call in `main.jsx` would paint light
for one frame. This is also why `theme.js` can go entirely (§3) — nothing needs to apply the class at
runtime.

---

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
| `:106-108` | the `useEffect` calling `applyThemeClass(theme)` + `persistTheme(theme)` |
| `:909-910` | `theme={theme}` and `onToggleTheme={handleToggleTheme}` on `<AppShell>` |

The effect at `:106-108` is the whole effect body — check whether it does anything besides those two
calls before deleting the `useEffect` wrapper. If it is theme-only, the wrapper goes too; if it has
been extended since `afc7239`, remove only the theme lines and **report the drift**.

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

4. **Update the comment at `:7-8`**, which explains the search dropdown's token choice in terms of
   `TopBar` wrapping "League/Board/Trade in both themes". There is now one theme. Reword to say the
   dropdown stays on the adaptive `--color-*` family because that is what `TopBar` itself uses — the
   conclusion is unchanged, only its justification. **Do not change the dropdown's tokens.**

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

`docs/ui.md`'s "Theming & tokens" section (`:192-196`) should also lose its light-mode description of
the canvas/surface scale. **Keep the surface-elevation model itself** — it still governs; only the
light half is now unreachable.

---

## 10. Step sequence

1. `index.html` — add `class="dark"`. Confirm the app still renders dark in a build.
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

- [ ] `index.html` `<html>` carries `class="dark"`
- [ ] `src/theme.js` and `src/theme.test.js` deleted; no importer remains
- [ ] `App.jsx` has no `theme` state, handler, effect, import, or prop
- [ ] `AppShell` and `TopBar` prop lists narrowed; no dead `isDark`
- [ ] The toggle button is gone from the DOM
- [ ] `navItems.js` comment settled; `DEFAULT_ROUTE` value **unchanged** (`/market`)
- [ ] `src/index.css` **untouched** — verify with `git diff --stat`
- [ ] `TopBar.test.jsx`: 3 tests deleted, 1 rewritten to its real subject, all 7 prop sites cleaned
- [ ] `src/__tests__/darkThemeForced.test.js` added and passing
- [ ] Docs in §9 updated, including the `ui.md:224` factual fix
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean, no warnings
- [ ] `grep -rn "PROVISIONAL(" src/` output pasted into the hand-back (expect Slice ii's three,
      unchanged — this slice adds none)
- [ ] Test count reported. A drop of ~9 (5 theme + 3 toggle, +1 new guard) is expected; anything
      larger is a signal
- [ ] Hand back for visual smoke. **Do not run the dev server** (CLAUDE.md: visual verification is
      the user's job)

---

## 13. What to report in the hand-back

- Confirmation that `src/index.css` has zero diff.
- The rewritten null-user test's new assertion, quoted — so the reviewer can see coverage was
  preserved rather than dropped.
- Whether `App.jsx:106-108`'s effect was theme-only (wrapper deleted) or had grown (theme lines only).
- Anything in §0 that had drifted from `afc7239`.
