# Player headshots and team logos (in-season notes P7)

Session 1 (opus) task file, 2026-10-03. Source: `../future_plans/in-season-notes-plan.md` → **P7 ·
Pictures (app, small)** — "Sleeper CDN headshots (`sleepercdn.com/content/nfl/players/<id>.jpg`) and
team logos, with a graceful fallback. Coaches are parked." Planned against app `d2c350d`
(`main` = `origin/main`).

Scope Anton set for this session: headshots and team logos across **This Week**, **My Team**,
**Market** and the **player pop-up**, with a graceful fallback when an image is missing.

View-layer only. Nothing here feeds `playerRows`, projections, the dynasty score, or any `factors`
entry. No data-store read, no cache entry, no new fetch code — the browser loads `<img>` URLs.

---

## 1. Live facts this plan rests on (verified 2026-10-03)

**CDN endpoints (probed with curl):**

| URL | Result |
|---|---|
| `https://sleepercdn.com/content/nfl/players/thumb/4046.jpg` | 200 `image/jpeg`, 350×254 landscape, white background, `cache-control: public, max-age=2678400` (31 days) |
| `https://sleepercdn.com/content/nfl/players/4046.jpg` | 200, byte-identical to the thumb (20 870 B) |
| `…/players/thumb/99999999.jpg` (unknown id) | **403** `text/html` → fires `<img onerror>` |
| `…/players/thumb/KC.jpg` (a DEF "player" id) | **403** |
| `https://sleepercdn.com/images/team_logos/nfl/<code>.png` | 200 `image/png` 150×150 for **all 32 Sleeper-domain codes, lower-cased** (`ari … was`, incl. `lar`, `lac`, `lv`, `jax`, `was`) |
| `…/team_logos/nfl/fa.png`, `wsh.png`, `stl.png` | **404** |
| `…/team_logos/nfl/la.png`, `sd.png`, `oak.png` | 200, but `la.png` is a **different file** from `lar.png` (md5 differs) — an era/legacy asset, not the current Rams logo |

No `access-control-allow-origin` header on either path — so **never set `crossOrigin`** on these
`<img>` tags (a CORS-mode image request without ACAO fails and would fire `onError` for every image).

**Sleeper player ids** are numeric strings (`'4046'`); DEF entries use the team code as their id
(`'KC'`). Test fixtures across the repo use ids like `'p1'`.

**Team-code domains at each call site (CR-16 — the Rams are `LAR` on Sleeper, `LA` era-accurate):**

| Site | Field | Domain |
|---|---|---|
| `LineupTable.jsx` team chip | `r.team` ← `weeklyLineup.js:116` `enriched.team` ← `App.jsx:948` `enrichPlayer` → `playerMap[id].team` | **Sleeper** (`null` for no team) |
| `LineupTable.jsx` VS cell | `r.opponent` ← `resolveTeamWeek` → `denormalizeTeamForSchedule(entry.opponentEra)` (`weeklySchedule.js:44`), or `projRow.opponent` fallback | **Sleeper** |
| `DefencesFaced.jsx` VS cell | `r.opponent` (header comment `:10-11`: "`opponent` (Sleeper domain, `LAR`) is display only") | **Sleeper** |
| `PlayerCell` (`dp/cells.jsx:23`) | `row.nfl_team` | **Sleeper**, literal `'FA'` for a free agent |
| `PlayerDetailModal.jsx:241` meta | `player.team` ← `usePlayerProfile.js:23` `playersMap[playerId]` | **Sleeper** |
| `TeamOffences.jsx:148` | `r.team` ← `Portfolio.jsx:605` `normalizeTeamForSchedule(r.nfl_team)` | **era-accurate** (`LA`) — needs a Sleeper-domain companion field, §5.6 |
| `OffencesOwned.jsx:100` | renders `r.eraTeam`; `r.team` is Sleeper | — out of scope, §8 |

**Security posture — what the docs and code say (Anton asked for this check):**
- No Content-Security-Policy anywhere: `index.html` has no CSP `<meta>`, `vite.config.js` sets no
  headers, the app is run locally (`README.md` → `localhost:5173`; no deploy config in the repo).
- No doc in `docs/`, `CLAUDE.md`, `README.md`, the data repo's `CLAUDE.md`, or the parent folder's
  notes sets a rule on external images or third-party hosts. The nearest rules are about *data*:
  "Sleeper REST API (no auth, read-only)" (CLAUDE.md) and the data repo's served-path token rule
  (`adv`/`ads`/`tracking` paths get ad-blocked — irrelevant to `content/nfl/players` and
  `images/team_logos`).
- **Precedent:** `src/components/shell/TopBar.jsx:179` already renders
  `<img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt="" …>` — the same host,
  unvalidated interpolation, no `referrerPolicy`, no fallback.
- **Conclusion:** no constraint blocks this. The plan still adds four hardening rules (§3) so the new
  images are stricter than the precedent: URLs are built only from validated tokens, no referrer is
  sent, no CORS mode, decorative `alt=""`. If a CSP is ever introduced, `img-src` must allow
  `https://sleepercdn.com` — §6 records that in `docs/integrations.md`.

---

## 2. Decisions

- **D1 — one pure URL module, one component module.** `src/utils/sleeperImages.js` (pure, no React)
  builds URLs; `src/components/dp/SleeperImages.jsx` renders them with the fallback. Every surface
  imports the components; no surface builds a `sleepercdn.com` URL itself.
- **D2 — the logo helper accepts the Sleeper domain only and performs no domain hop.** Its
  allowlist is `marketFilters.js`'s existing `NFL_TEAMS` (the 32 Sleeper codes, `LAR` not `LA`),
  imported — never a second hand-written list. It does **not** import
  `normalizeTeamForSchedule`/`denormalizeTeamForSchedule`: a new call site of those would be a new
  CR-16 trigger site and owe a registry edit plus a data-repo sync for a decoration feature. Every
  call site in §5 already holds a Sleeper-domain field (table in §1). An era code (`LA`, `STL`, `SD`,
  `OAK`) or `'FA'` returns `null` → no logo. This is deliberate: passing `'LA'` must not silently
  load the legacy `la.png`.
- **D3 — `/thumb/` path.** Sleeper's own clients use it; it is byte-identical today and is the
  path Sleeper would shrink first.
- **D4 — fallbacks.** A missing headshot (non-numeric id, `null`, or `onError`) renders a same-size
  neutral placeholder so row alignment never shifts; the pop-up passes its existing position chip as
  the fallback, so a player without a photo looks exactly as today. A missing logo renders
  **nothing** — every logo sits beside the team code text, which stays.
- **D5 — `PlayerCell` gets the headshot and the inline logo once, for every consumer.** Its
  consumers are Market (5 column-set branches), My Team (Starting ten, Bench), `teams/TeamDetail.jsx`
  roster and the `PlayerDetailTabs.jsx` compare dropdown. The last two are outside Anton's list but
  share the cell; one consistent player cell beats a prop that forks it. No `PlayerCell` call site
  changes.
- **D6 — no PROVISIONAL tags.** The images are real Sleeper assets and the fallback fabricates
  nothing (it is an empty placeholder, or the existing position chip).
- **D7 — no app-side cache.** The CDN sends a 31-day `max-age`; the browser HTTP cache handles it.
  Do not touch `src/utils/cache.js` or any TTL.

---

## 3. `src/utils/sleeperImages.js` (new, pure)

```js
// Sleeper image CDN URL builders (in-season notes P7 — sleeper-images.md). Pure, no React, no I/O.
// URLs are built only from validated tokens: a numeric player id, or one of the 32 Sleeper-domain
// team codes. Everything else returns null and the caller renders its fallback. Team codes are the
// SLEEPER domain only (`LAR`, never era-accurate `LA` — CR-16); this module performs no domain hop.

import { NFL_TEAMS } from './marketFilters'

const CDN = 'https://sleepercdn.com'

// Derived from marketFilters.js's NFL_TEAMS (the Sleeper-domain 32), not a second literal — a
// franchise move is edited in one place.
export const SLEEPER_LOGO_TEAMS = new Set(NFL_TEAMS)

// '4046' → …/content/nfl/players/thumb/4046.jpg; anything not all-digits (null, 'KC', 'p1') → null.
export function playerHeadshotUrl(playerId) { … }

// 'KC' → …/images/team_logos/nfl/kc.png; null / 'FA' / era codes / lower-case input → null.
export function teamLogoUrl(team) { … }
```

- `playerHeadshotUrl`: accept a string or number; `String(id)` must match `/^\d+$/`; else `null`.
- `teamLogoUrl`: `typeof team === 'string' && SLEEPER_LOGO_TEAMS.has(team)` else `null`; URL uses
  `team.toLowerCase()`. **Strict case** — Sleeper codes are upper-case; do not upper-case the input.
- Copy the comment block above verbatim as the header. Function bodies are Session 2's.

## 4. `src/components/dp/SleeperImages.jsx` (new, presentational)

Header comment: what the two components are, the fallback rule (D4), and the four `<img>` rules
below with one clause each on why (referrer, no CORS, decorative alt, lazy).

```jsx
export function PlayerHeadshot({ playerId, size = 28, shapeClass = 'rounded-full', fallback, badge })
export function TeamLogo({ team, size = 16, className = '' })
```

Both:
- Compute `src` from §3. Track a failure with `const [failedSrc, setFailedSrc] = useState(null)`
  and treat the image as failed only when `failedSrc === src` — so a re-render with a different
  player/team (pop-up tab switch, table re-sort reusing a row) retries rather than staying on the
  fallback. Do **not** use a boolean `failed` state.
- `<img>` attributes, all required: `src`, `alt=""`, `width={size}`, `height={size}`,
  `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, `draggable={false}`,
  `onError={() => setFailedSrc(src)}`, and an inline `style={{ width: size, height: size }}`.
  **No `crossOrigin`** (§1: no ACAO header).
- Class strings are literal (no interpolated arbitrary Tailwind values — v4 scans literals only; the
  numeric `size` goes in `style`, never into a class name).

`PlayerHeadshot`:
- `<img data-testid="headshot" className={`${shapeClass} object-cover bg-dp-chip shrink-0`} …>`.
  `object-cover` centre-crops the 350×254 landscape image to the square/circle; the face is centred.
- `badge` (optional node): when given **and the img path renders**, wrap as
  `<span className="relative inline-block shrink-0">{img}{badge}</span>`; the caller's badge is
  absolutely positioned. Never rendered on the fallback path. Without `badge`, the img renders bare.
- Fallback when `src` is null or failed: `fallback` if the prop is provided (`fallback !== undefined`),
  else `<span aria-hidden="true" data-testid="headshot-fallback"
  className={`${shapeClass} bg-dp-chip shrink-0 inline-block`} style={{ width: size, height: size }} />`.

`TeamLogo`:
- `<img data-testid="team-logo" className={`object-contain shrink-0 ${className}`} …>`.
- Fallback when `src` is null or failed: `null`.

`shapeClass` and `className` are passed by callers as complete literal class strings
(`'rounded-full'`, `'rounded-[10px]'`, `'inline-block align-[-2px]'`).

## 5. Surface edits

Text content of every existing cell must stay byte-identical (images carry `alt=""`, so they add no
text). Existing tests that assert `textContent` must pass unmodified — if one fails, that is a
signal the markup changed more than specified; stop and report rather than editing the test.

### 5.1 `dp/cells.jsx` — `PlayerCell` (Market, My Team Starting ten + Bench, and D5's two extras)

```jsx
<div className="flex items-center gap-2.5">
  <PlayerHeadshot playerId={row.player_id} size={28} />
  <span …position chip, unchanged…>{row.position}</span>
  <div className="min-w-0">
    <div …name, unchanged…>{row.full_name}</div>
    <div className="text-[11px] text-dp-muted truncate">
      {row.age != null && <>{row.age} · </>}
      <TeamLogo team={row.nfl_team} size={12} className="inline-block align-[-2px] mr-1" />
      {row.nfl_team && row.nfl_team !== 'FA' ? row.nfl_team : 'FA'}
      {row.years_exp != null && <> · {row.years_exp}yr</>}
    </div>
  </div>
</div>
```

`'FA'` and `null` produce no logo by §3. Import from `./SleeperImages`. Update the file's header
comment with one sentence: `PlayerCell` renders the headshot and team logo (sleeper-images.md).

### 5.2 `week/LineupTable.jsx` — This Week lineup

- Add `PlayerHeadshot, TeamLogo` via a new import line from `'../dp/SleeperImages'`.
- Player cell (`:128-152`): first child of the `flex items-start gap-1.5` div becomes
  `<PlayerHeadshot playerId={r.player_id} size={28} />`. The team chip (`:129-133`) gains
  `inline-flex items-center gap-1` in its class list and renders
  `<TeamLogo team={r.team} size={12} />{r.team}` inside. Empty-slot rows (`player_id == null`) are
  untouched — no headshot, no placeholder.
- VS cell (`:161`): the game branch becomes
  `<div className="font-dp-mono text-[11.5px] text-dp-text-2 flex items-center gap-1.5"><TeamLogo team={r.opponent} size={14} />{r.opponent ?? '—'}</div>`.
  Keep the `PROVISIONAL(no-data)` comment at `:162-163` exactly where it is. `BYE` and empty branches
  unchanged.
- Header comment: add one clause — rows carry a headshot and team logos (sleeper-images.md).

### 5.3 `week/DefencesFaced.jsx` — This Week defences

- VS cell (the `<td>` at `:113-115`): add `data-testid="defences-vs"` to the `<td>` (no other
  attribute change). Inside, when `!r.bye && r.opponent`, render
  `<span className="inline-flex items-center gap-1.5"><TeamLogo team={r.opponent} size={14} />{r.opponent}</span>`;
  otherwise the existing `'BYE'` / `'—'` text. Cell `textContent` stays `'BYE'` / `'DEN'` / `'—'`.
- No headshot on this panel (its DEF column names the starter only as a row label; the lineup table
  directly above carries the photo).

### 5.4 `portfolio/TeamOffences.jsx` — My Team offences table

- Team cell (`:147-150`): prefix `<TeamLogo team={r.sleeperTeam} size={16} className="inline-block align-[-3px] mr-1.5" />`
  before the `r.team` span. `r.sleeperTeam` is new (§5.6); a row without it renders no logo.
- Add the import. Update the props/row-shape sentence in its header if it lists row fields (it does
  not today — then add none).

### 5.5 `dp/PlayerDetailModal.jsx` — the pop-up

- One new import line: `import { PlayerHeadshot, TeamLogo } from './SleeperImages'`.
- Identity row (chip `div` at `:322-324`) and the no-dynasty-data branch (chip `div` at `:228-230`;
  `:227` is the wrapper's opening tag and stays): replace each 52px position chip `div` with
  ```jsx
  <PlayerHeadshot playerId={playerId} size={52} shapeClass="rounded-[10px]"
    badge={<span data-testid="headshot-position" className="absolute -bottom-1 -right-1 font-dp-mono text-[10px] leading-none px-1 py-0.5 rounded bg-dp-chip text-dp-text-3 border border-dp-border">{player.position ?? '—'}</span>}
    fallback={<div className="…the existing chip classes, verbatim…">{player.position ?? '—'}</div>} />
  ```
  The chip is the pop-up's only position label (`metaParts` is age · team · Year · ownership), so
  the position must stay visible when the photo shows: `badge` (§4) overlays it on the photo's
  corner; a player without a photo renders today's chip unchanged (and no badge). Use the `playerId`
  prop, not `player.player_id` (the empty-state branch can have an empty `player` object).
- Meta line (`:327`): the logo sits **beside the team segment**, not at the start of the line.
  Before `metaParts.push(player.team ?? 'FA')` (`:241`) record `const teamPartIdx = metaParts.length`;
  render
  `metaParts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{i === teamPartIdx && <TeamLogo team={player.team} size={14} className="inline-block align-[-2px] mr-1" />}{part}</Fragment>)`
  inside the existing `div` (classes unchanged). Its `textContent` is byte-identical to today's
  `metaParts.join(' · ')`. Import `Fragment` from `react` on the existing `:1` import line.
- Nothing else in this file changes. Its registry anchors move — §7.

### 5.6 `portfolio/Portfolio.jsx` — one in-line field

Line `:625` (`        team,` inside `offenceRows`' `rows.push({`) becomes
`        team, sleeperTeam: members[0].nfl_team,`. **Same line, no line added or removed** — the file
is anchored by CR-01/CR-02/CR-10/CR-16 (registry `:274,300,304,350,606,851,975`; the live CR-16
`normalizeTeamForSchedule` sites are `:605,850,975` — `606,851` are already stale, §7) and no line
may move.
`members` is non-empty by construction and every member of a bucket shares one Sleeper code
(`normalizeTeamForSchedule` is injective), so `members[0].nfl_team` is the bucket's Sleeper code —
`'LAR'` for the `LA` row. No import, no other edit to this file.

## 6. Docs (same change — Self-maintenance)

- `docs/nav/utils.md`: a row for `sleeperImages.js` (exports, the Sleeper-domain-only rule, null on
  anything unvalidated).
- `docs/nav/components.md`: a row for `dp/SleeperImages.jsx` (two components, fallback rule, the
  `failedSrc === src` retry rule); amend the `dp/cells.jsx` row (`PlayerCell` renders headshot +
  logo), and append a short clause to the `week/LineupTable.jsx`, `week/DefencesFaced.jsx`,
  `portfolio/TeamOffences.jsx` and `dp/PlayerDetailModal.jsx` rows naming what image they show.
- `docs/integrations.md`, under `## API layer`, a new `### Sleeper image CDN (`https://sleepercdn.com`)`
  subsection: the two URL patterns, built by `src/utils/sleeperImages.js` only; loaded by the browser
  as `<img>` (no fetch, no app cache — the CDN's own cache headers apply); no referrer, no CORS mode;
  if a Content-Security-Policy is ever added, `img-src` must include `https://sleepercdn.com` (the
  `TopBar` avatar already depends on it too). Describe the fallback with exactly this kind of
  wording: "a non-numeric id, a DEF team-code id, an unlisted team code, or a CDN 403/404 renders the
  fallback". **Do not write** "does not exist", "doesn't exist", "not yet available", "will exist" or
  any phrasing about whether an image is on the CDN today — `docsAvailabilityClaims.test.js:107-131`
  scans this file and those phrases fail it.
- `docs/ui.md`: one sentence each where Market (`:158`), the pop-up identity row (`:292`) and the
  compare dropdown (`:429`) are described — rows/identity carry the Sleeper headshot (fallback: a
  neutral placeholder, or in the pop-up the position chip; with a photo the position shows as a
  corner badge) and team logos beside team codes. Same availability-wording rule.
- `src/components/shell/TopBar.jsx:7-9` header comment: it says the search rows are "local markup
  matching its layout"; replace "matching its layout" with wording that stays true (e.g. "local
  markup in PlayerCell's spirit — no headshot or logo"). Comment-only, **same line count**; no code
  change in TopBar.
- `README.md` file tree: add `SleeperImages.jsx` under `dp/` and `sleeperImages.js` under
  `utils/` **if** that directory's files are enumerated there (dp/ is; check utils/).
- `CLAUDE.md`: no change. `docs/signal-registry.md`: no change — an image is not a signal (nothing
  feeds, could feed, or is scored from it); state this in the hand-back.

## 7. Cross-repo impact

**No contract changes.** No served shape, loader, stat key, team-code hop or registry-listed
function is added or changed. `sleeperImages.js` deliberately does not call the CR-16 helpers (D2).
`docs/cross-repo-registry.md` is **not edited** in this slice.

**CR-16 · Era-accurate team-code remap — touched in prose, no mapping change; data side: no
action.** §5.6 adds a field to the `offenceRows` memo whose bucket key is the CR-16 call site
`Portfolio.jsx:605`, and its correctness (`members[0].nfl_team` is the bucket's Sleeper code) relies
on `SCHEDULE_TEAM_ALIAS` never mapping two Sleeper codes onto one era code. The entry's Mirror,
quoted: *"A future franchise move (or any change to an existing mapping) updates **both repos in the
same change** — and there are **two** mirrored constants here, not one: the era remap *and* the
schedule-domain alias … A one-sided edit to either produces silently empty joins rather than an
error — the team key simply never matches."* This slice changes neither constant, so the data repo
owes nothing. A future alias edit that merged two Sleeper codes would also need §5.6's field
revisited — noted here so that change's planner sees it.

**Anchor drift owed at the next registry sync (non-blocking, no Mirror text change of substance).**
`PlayerDetailModal.jsx` is the one anchored file this slice must reshape. Its anchors in
`docs/cross-repo-registry.md` — CR-01 Triggers `PlayerDetailModal.jsx:120-121,148-154,277,280-282,303,371,584`
and CR-10 App side / Triggers `:76,516` — will shift. Session 2 reports, in the hand-back, the
old → new line number for each, matched by content. The content at each anchor as of `d2c350d`:

| Old | Content |
|---|---|
| 76 | `const { careerStats, playersMap, playerRows, … } = useProfileData()` |
| 120-121 | `const nextSeasonDelta = (projection?.projectedPPG != null && …` / `? projection.projectedPPG - currentSeasonPPG` |
| 148 / 154 | `if (projection?.projectedPPG != null) {` / `kind: 'projection',` |
| 277 | `value: projection?.projectedPPG != null ? projection.projectedPPG.toFixed(1) : '—',` |
| 280-282 | `note: projection?.inSeason` … `: projection ? \`PPG · ${projection.projectedGames} games projected\` : null,` |
| 303 | `const hasAdjustmentChips = projection?.adjustmentSummary?.length > 0` |
| 371 | `career avg {careerAvgPPG.toFixed(1)} · {projection?.inSeason ? …` |
| 516 | already stale before this slice: the CR-10 pass-through is the `<EnvironmentSection` call, live at `:518`, with `teamContextByYear={teamContextByYear}` at `:520` — report where **those two** land |
| 584 | `{projection.adjustmentSummary.map((text, i) => (` |

Pre-existing stale anchors to fix at the same sync (found by this plan's review, not caused by it):
CR-16 `portfolio/Portfolio.jsx:606,851` → live `:605,850`.

Every other anchored file must keep its line numbers: `Portfolio.jsx` (one same-line edit, §5.6),
`OffencesOwned.jsx` (not touched, §8), `PlayerDetailTabs.jsx`, `TeamDetail.jsx`, `Market.jsx`,
`weeklyLineup.js`, `useWeeklyDecision.js`, `App.jsx` (none touched). Session 2 verifies with
`git diff --stat` and reports any anchored file whose line count changed.

## 8. Out of scope (deliberate)

- `week/OffencesOwned.jsx` team logos. Its import block sits above CR-10/CR-16 anchors
  `:24,49,52,55`; a logo there moves four more anchors for a small panel whose teams already show
  in the lineup table above. Easy follow-up at the next registry sync if Anton wants it.
- `TopBar.jsx`'s avatar (no fallback, no `referrerPolicy`) — pre-existing, not on Anton's list. Not
  touched.
- League ladders, Weakest slots, My Team header tiles, `/teams` index, coaches (parked by P7).
- Any DEF-as-player headshot (DEF ids are team codes → 403; they get the placeholder).

## 9. Tests to add

`src/utils/sleeperImages.test.js` (node env):
- `playerHeadshotUrl('4046')` and `(4046)` → `https://sleepercdn.com/content/nfl/players/thumb/4046.jpg`.
- `null`, `undefined`, `''`, `'KC'`, `'p1'`, `'12a'`, `'../4046'`, `'4046.jpg'` → `null`.
- `SLEEPER_LOGO_TEAMS.size === 32`; for every member, `teamLogoUrl(t)` ends `/${t.toLowerCase()}.png`.
- `teamLogoUrl('LAR')` → `…/team_logos/nfl/lar.png`; `teamLogoUrl('LA')` → `null` (CR-16: era code is
  not accepted — asserts D2); `'FA'`, `null`, `'STL'`, `'SD'`, `'OAK'`, `'kc'`, `'WSH'` → `null`.

`src/components/dp/SleeperImages.test.jsx` (jsdom):
- `PlayerHeadshot playerId="4046"` renders `[data-testid="headshot"]` with that `src`,
  `referrerpolicy="no-referrer"`, `loading="lazy"`, `alt=""`, and **no** `crossorigin` attribute.
- `fireEvent.error(img)` → the img is gone and `[data-testid="headshot-fallback"]` is present.
- A custom `fallback` node renders instead of the default placeholder (both for `playerId="p1"` and
  after an error).
- Retry: render `4046`, fire error, `rerender` with `playerId="9999"` → an img with the new `src` is
  back (proves the `failedSrc === src` rule; a boolean flag would fail this).
- `TeamLogo team="KC"` → `[data-testid="team-logo"]` with `kc.png`; `team="FA"` and `team={null}` →
  container empty; after `fireEvent.error` → nothing rendered.

Surface tests (extend existing files; do not change existing assertions):
- `LineupTable.test.jsx`: a row with `player_id: '4046', team: 'KC', opponent: 'DEN'` → the row holds
  a headshot with `4046.jpg`, a team logo `kc.png` in the player cell, and a team logo `den.png` in
  the VS cell; a row with `player_id: 'p1'` holds `headshot-fallback`; an empty slot holds neither.
  **Rams case (new test):** `team: 'LAR', opponent: 'LAR', opponentEra: 'LA'` → every logo `src`
  ends `/lar.png` and none ends `/la.png`.
- `DefencesFaced.test.jsx` (new tests; leave the existing LAR join test at `:50-67` untouched):
  `[data-testid="defences-vs"]` holds a logo for the fixture opponent and its `textContent` is still
  the bare code; a bye row's VS cell reads `BYE` and holds no logo; `opponent: 'LAR', opponentEra:
  'LA'` → the logo ends `/lar.png`, never `/la.png`.
- `TeamOffences.test.jsx`: a row with `team: 'LA', sleeperTeam: 'LAR'` renders `lar.png`; the
  existing `baseRow` (no `sleeperTeam`) renders no logo.
- `Portfolio.test.jsx` (the existing team-offences describe, whose fixture already has an `LA` team):
  `offence-LA` contains a team logo ending `/lar.png` — the integration check that §5.6 carries the
  Sleeper code through the era bucket (the CR-16 Rams hazard). If no owned fixture player has
  `nfl_team: 'LAR'`, add one to that describe's fixture rather than changing existing rows.
- `PlayerDetailModal.test.jsx`: **do not edit the module-level `playersMap`/`playerRows`** (`:88-174`
  — shared by every test; a new row shifts position peers, comps and portfolio share). Inside the
  new test only, add a numeric-id player via
  `renderModal('4046', { contextOverrides: { playersMap: { ...playersMap, '4046': {…} }, playerRows: [...playerRows, {…}] } })`
  (`renderModal` at `:208-214`). The added `playerRows` entry must carry a real dynasty score or the
  modal returns its no-dynasty-data branch (`PlayerDetailModal.jsx:225`, which has no meta line):
  shape it like the `p6` row (`:143-149`) —
  `{ player_id: '4046', position: 'WR', full_name: 'Headshot Player', dynastyScore: richDynastyScore(), ownerTeamName: null, ktcValue: null, divergenceSignal: null, dynRank: null, ktcRank: null, positionRank: 3, currentSeasonPPG: null }`
  — and the `playersMap['4046']` entry carries a Sleeper-domain `team` (e.g. `'DAL'`) plus `age` and
  `years_exp`. Add `fireEvent` to the `@testing-library/react` import at `:4`. Assert: the identity row holds a headshot with `4046.jpg` and
  `[data-testid="headshot-position"]` reading the position; after `fireEvent.error` the badge is
  gone and the chip shows the position text; the meta line holds a team logo, positioned immediately
  before the team text (e.g. the logo's `nextSibling`/parent text starts with the team code), and
  the meta `textContent` still matches `/26.*DAL.*Year 6.*Owned by you/`-style for p1. For an
  existing `p<n>` player the chip renders as before and there is no badge.
- `SleeperImages.test.jsx` additionally: `badge` renders over a loaded img and is absent on the
  fallback path.
- `cells.test.jsx`: `PlayerCell` with `{ player_id: '4046', nfl_team: 'KC', … }` → headshot + logo;
  with `nfl_team: 'FA'` → no logo and the text still reads `FA`.

## 10. Done-definition notes

Standard CLAUDE.md done-definition. Specifically:
- `npm test`, `npm run lint`, `npm run build` clean. No contract test is affected.
- **Smoke** (user-visible): start the `.claude/launch.json` preview, load Anton's league (recipe in
  `docs/architecture.md` → *Smoke-testing the running app*), and look at `/week`, `/portfolio`,
  Market and one pop-up. Check: headshots and logos render; a Rams player shows the current Rams
  logo; the network panel shows `sleepercdn.com` image requests with no CORS errors in the console;
  break one image (DevTools or a deliberately missing id is not available live — instead confirm the
  fallback via the unit test and note it) and confirm no layout shift at 375px width on `/week` and
  Market. Report what you saw; a screenshot is not sign-off.
- Commit (one commit is fine). **Do not push** — P7 waits for Anton's sign-off like P2/P3.
- Hand-back: SHA, files touched, deviations, what each new test asserts, the §7 anchor old → new
  table for `PlayerDetailModal.jsx`, `git diff --stat` for the anchored files, and the
  `grep -rn "PROVISIONAL(" src/` count before and after (expected unchanged).

---

## Review record — plan gate round 1 (2026-10-03)

plan-reviewer raised 11 flags. Each verified against live source at `d2c350d`; all applied.

| # | Flag | Verified | Decision |
|---|---|---|---|
| 1 | §5.5 empty-state chip anchor `:227-229` is one high | yes — `:227` is the wrapper div | `:228-230` |
| 2 | §5.3 VS anchor `:114-116` is one low | yes — VS td is `:113-115` | fixed |
| 3 | CR-16 `Portfolio.jsx:606,851` stale (live `:605,850`) | yes | §5.6 uses live lines; stale pair recorded in §7 for next sync |
| 4 | CR-10 `PlayerDetailModal.jsx:516` stale (live `:518,520`) | yes | §7 table names the live lines |
| 5 | second hand-written 32-code list | yes — `marketFilters.js:11-16` `NFL_TEAMS`, same 32 Sleeper codes | `new Set(NFL_TEAMS)` |
| 6 | headshot removes the pop-up's only position label; logo not beside team | yes — `metaParts` `:239-247` has no position | `badge` prop overlays position on the photo; logo rendered at the team segment, textContent unchanged |
| 7 | numeric fixture player would perturb shared pop-up fixture | yes — module-level `playersMap`/`playerRows` | add via `contextOverrides` inside the new test only |
| 8 | DefencesFaced VS td has no testid; no Rams logo test at either VS site | yes | `data-testid="defences-vs"` + LAR tests in both files |
| 9 | §7 should quote CR-16 since §5.6 relies on the alias shape | accepted | CR-16 quoted, "no mapping change; data side no action" |
| 10 | `TopBar.jsx:7-9` comment and `docs/ui.md` go stale | yes | comment reworded (same line count); ui.md sentences added to §6 |
| 11 | natural 403 wording trips `docsAvailabilityClaims` | yes — `'does not exist'` at `:108` | wording prescribed in §6 |

**Round 2** (deltas only): 1 flag. The new pop-up test's `{…}` row would lack `dynastyScore`, hitting
the no-dynasty-data branch (no meta line); the `playersMap` entry needed a `team`; `fireEvent` was not
imported. Verified (`usePlayerProfile.js:24-27`, `PlayerDetailModal.jsx:225`, test `:4`, `:143-149`).
Applied in §9. All other round-1 deltas confirmed against live source. Gate closed — no third round.

---

## Verification — implementation review of `b92b9ea` (2026-10-03)

Session 1 re-ran the done-definition at `b92b9ea`: `npm test` 134 files / 2559 green, `npm run lint`
0 problems, `npm run build` only the pre-existing >500 kB chunk notice. implementation-reviewer: one
flag; every other check passed (anchor table verified against the file at `b92b9ea`; Portfolio.jsx
one same-line edit; TopBar comment-only; PROVISIONAL 22 → 22; the retry test would fail with a
boolean; the Portfolio `offence-LA` test exercises `members[0].nfl_team` via fixture `wl1`; no
existing assertion weakened; all 22 changed paths on the touch list).

| Flag | Verified | Decision |
|---|---|---|
| [cross-repo] §7's anchor drift and the CR-16 "no mapping change" statement live only in this task file; nothing in `data-repo-backlog.md` records them, so the next registry sync may miss them | yes — the backlog has no entry; P3 set the same task-file-only precedent | Fix pass 1: a backlog entry (D-58). No source change. The commit message is not amended. |

## Fix pass 1

**Scope: one file, `.claude/tasks/data-repo-backlog.md`. Touch nothing else.**

Append, after the D-57 entry (end of file), an entry in the same format as D-57's header lines:

```
### D-58 · Registry anchor refresh — sleeper images (P7), app-side first
**Found:** sleeper-images.md · **Found by:** `b92b9ea` · **Blocking:** no (no contract change; the CR-24 mirror stays green until the app edits the registry) · **Size:** small — two-session route, take it with the next registry sync

No contract change. CR-16 · Era-accurate team-code remap: no mapping change, data side no action beyond the byte-sync. The app's next registry batch updates these anchors in `docs/cross-repo-registry.md`, then the data repo byte-copies the span (`REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`).

- CR-01 Triggers, `src/components/dp/PlayerDetailModal.jsx`: `:120-121` → `:121-122`, `:148-154` → `:149-155`, `:277` → `:289`, `:280-282` → `:292-294`, `:303` → `:315`, `:371` → `:401`, `:584` → `:614`.
- CR-10 App side and Triggers, the same file: `:76` → `:77`; `:516` (already stale — the `<EnvironmentSection` call) → `:548`, with its `teamContextByYear={teamContextByYear}` prop at `:550`.
- CR-16 App side, `portfolio/Portfolio.jsx:606,851,975` → `:605,850,975` (stale before P7, found by its plan gate; P7 changed no line count in this file).
- Also pending from P3: the CR-02 `weeklyRanks.js` trigger addition and the stale CR-01/02/10 anchors listed in `week-lineup-cleanup.md` → `## Cross-repo impact` (its "Registry items for the next sync" bullet). Take both batches in one sync.
```

Do not edit `docs/cross-repo-registry.md`, any source, or any test. Done-definition: `npm test`
green (the docs tests read this file's neighbours, not this file, but run it anyway). Commit as
`Fix pass 1: sleeper images — D-58 registry anchor refresh owed` with the
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` trailer, and also commit this task
file's appended verification/fix-pass sections in the same commit. Do not push.
