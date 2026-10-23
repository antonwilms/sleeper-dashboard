import { getCache, setCacheWithMeta } from '../utils/cache';

const BASE_URL = import.meta.env.VITE_DATA_STORE_URL;
const ENABLED = import.meta.env.VITE_DATA_STORE_ENABLED !== 'false';
// nfl/season-totals files now ship at schemaVersion 4 (F-24's stat-key prune). This ceiling
// applies to every family read through tryDataStore, not just season-totals — season-totals is
// simply the only family currently above v1. Older files still load — isValidSeasonTotals only
// requires the original fields — so the app degrades gracefully against v1/v2/v3 files too.
const MAX_SUPPORTED_SCHEMA = 4;
const MANIFEST_TTL = 60;

let manifestPromise = null;
let sessionDisabled = false;
const loggedKeys = new Set();

function logOnce(key, ...args) {
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  console.warn('[dataStore]', ...args);
}
// no-cache: revalidate each fetch (ETag → 304) — jsDelivr sends max-age=604800 (integrations.md → HTTP caching).
function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal, cache: 'no-cache' }).finally(() => clearTimeout(id));
}

// CR-29 — data-store transport. jsDelivr's branch cache serves a stale `@main/manifest.json` for hours
// and cannot be purged reliably (in-season-notes 2026-10-13 18:30), so the manifest is read from raw
// GitHub first (max-age=300, still no-cache here) and from `${BASE_URL}/manifest.json` only if that
// fails. Family files read from `${BASE_URL}/<path>` (15 s) first and, for a jsDelivr base only, from
// raw GitHub (10 s) on HTTP error/timeout/parse error/network error; a host that fails is skipped for
// the rest of the page session (unless it is the only host, or both have failed).
const JSDELIVR_BASE_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/@]+)\/([^/@]+)@([^/]+)$/;

export function rawBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return null;
  const m = JSDELIVR_BASE_RE.exec(baseUrl.trim().replace(/\/$/, ''));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : null;
}

export function rawManifestUrl(baseUrl) {
  const raw = rawBaseUrl(baseUrl);
  return raw ? `${raw}/manifest.json` : null;
}

// Declared after JSDELIVR_BASE_RE: it is a const, so evaluating this above it throws at module load.
const RAW_BASE_URL = rawBaseUrl(BASE_URL);
const failedHosts = new Set(); // 'primary' | 'raw' — a host that failed once this page session

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function loadManifest() {
  if (!BASE_URL || BASE_URL.includes('<user>')) {
    logOnce('placeholder-url', '[perf][dataStore] VITE_DATA_STORE_URL is a placeholder — data store will be disabled');
    sessionDisabled = true;
    return null;
  }

  const cached = await getCache('data-store/manifest');
  if (cached !== null) return cached;

  const rawUrl = rawManifestUrl(BASE_URL);
  const candidates = [
    rawUrl && { url: rawUrl, ms: 4000 },
    { url: `${BASE_URL}/manifest.json`, ms: 5000 },
  ].filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const { url, ms } = candidates[i];
    const isLast = i === candidates.length - 1;
    try {
      const res = await fetchWithTimeout(url, ms);
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      const manifest = await res.json();
      if (!manifest || typeof manifest.files !== 'object') {
        throw new Error('manifest missing required keys');
      }
      await setCacheWithMeta('data-store/manifest', manifest, MANIFEST_TTL, {});
      console.info('[perf][dataStore] manifest OK from', url);
      return manifest;
    } catch (err) {
      if (!isLast) {
        logOnce('manifest-raw-fail', 'manifest fetch failed — trying next source:', err.message, '— URL was', url);
        continue;
      }
      logOnce('manifest-fail', 'manifest fetch failed — data store disabled for this session:', err.message, '— URL was', url);
      sessionDisabled = true;
      return null;
    }
  }
  return null;
}

export function invalidateManifest() {
  manifestPromise = null;
}

export async function isDataStoreReady() {
  if (!ENABLED || sessionDisabled) return false;
  if (!manifestPromise) manifestPromise = loadManifest();
  const m = await manifestPromise;
  return m !== null;
}

export async function getManifestEntry(relativePath) {
  if (!ENABLED || sessionDisabled) return null;
  if (!manifestPromise) manifestPromise = loadManifest();
  const manifest = await manifestPromise;
  return manifest?.files?.[relativePath] ?? null;
}

// CR-04/CR-26 — enumerate served paths through the accessor (ktc.js/ktcHistory.js read the cached
// manifest object directly; this is the accessor form for new readers).
export async function listManifestPaths(prefix) {
  if (!ENABLED || sessionDisabled) return [];
  if (!manifestPromise) manifestPromise = loadManifest();
  const manifest = await manifestPromise;
  if (!manifest?.files) return [];
  return Object.keys(manifest.files).filter(p => p.startsWith(prefix));
}

// R4 (manifest-raw-source A1b) — the raw manifest can list a new `lastModified` before jsDelivr serves
// the new family bytes. A body that disagrees with its entry is used for the session but never
// persisted (persisting loaders check wasServedStale). Data writes `generatedAt` 0–73 ms BEFORE the
// entry's `lastModified`, so only a body more than GENERATED_AT_SKEW_MS older than the entry is stale.
const GENERATED_AT_SKEW_MS = 60_000;
const staleServed = new Set();

// Mirrors how each writer computes `recordCount` (CR-29). Unknown prefix / non-derivable → null.
const ROW_COUNT_FAMILIES = ['advstats', 'depth', 'gamelogs', 'oline', 'roster', 'rosterweekly', 'schedule', 'snaps', 'teamcontext'];
export function expectedRecordCount(relativePath, json) {
  let n = null;
  if (!json || typeof json !== 'object') return null;
  if (relativePath.startsWith('college/')) n = json.playerCount;
  else if (relativePath.startsWith('nfl/season-totals/')) n = Object.keys(json).length;
  else if (ROW_COUNT_FAMILIES.some(f => relativePath.startsWith(`nflverse/${f}/`))) n = json.rowCount;
  else if (relativePath.startsWith('enrichment/')) n = json.entries?.length;
  else if (relativePath.startsWith('ktc/snapshot-')) n = Array.isArray(json) ? json.length : undefined;
  else if (relativePath.startsWith('snapshots/')) n = json.players && typeof json.players === 'object' ? Object.keys(json.players).length : undefined;
  return typeof n === 'number' ? n : null;
}

export function bodyMatchesEntry(relativePath, json, entry) {
  const expected = expectedRecordCount(relativePath, json);
  if (expected !== null && expected !== entry?.recordCount) return false;
  if (json && typeof json.generatedAt === 'string') {
    const skew = Date.parse(entry?.lastModified) - Date.parse(json.generatedAt);
    if (Number.isFinite(skew) && skew > GENERATED_AT_SKEW_MS) return false;
  }
  return true;
}

export function wasServedStale(relativePath) {
  return staleServed.has(relativePath);
}

export async function tryDataStore(relativePath, { validate = null, allowInProgress = false } = {}) {
  if (!ENABLED || sessionDisabled) return null;
  if (!manifestPromise) manifestPromise = loadManifest();
  const manifest = await manifestPromise;
  if (!manifest) return null;

  const entry = manifest.files?.[relativePath];
  if (!entry) return null;
  if (entry.inProgress && !allowInProgress) return null;
  if (entry.schemaVersion > MAX_SUPPORTED_SCHEMA) {
    logOnce(`schema-too-new:${relativePath}`, `schema too new for ${relativePath} (v${entry.schemaVersion}) — falling back`);
    return null;
  }

  const all = [{ host: 'primary', url: `${BASE_URL}/${relativePath}`, ms: 15_000 }];
  if (RAW_BASE_URL) all.push({ host: 'raw', url: `${RAW_BASE_URL}/${relativePath}`, ms: 10_000 });

  let candidates;
  if (all.length === 1) {
    candidates = all; // Guard 1: a single-host base never skips
  } else if (all.every(c => failedHosts.has(c.host))) {
    candidates = [all[0]]; // Guard 2: both hosts have failed — use the primary per path
  } else {
    candidates = all.filter(c => !failedHosts.has(c.host));
    for (const c of all) {
      if (failedHosts.has(c.host)) {
        logOnce(`host-skipped:${c.host}`, `host ${hostnameOf(c.url)} skipped for the rest of this session after an earlier failed fetch`);
      }
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const { host, url, ms } = candidates[i];
    let json;
    let reason = null;
    try {
      const res = await fetchWithTimeout(url, ms);
      if (!res.ok) reason = `HTTP ${res.status}`;
      else json = await res.json();
    } catch (err) {
      reason = err?.name === 'AbortError' ? 'timeout'
        : err instanceof SyntaxError ? 'parse-error'
        : 'network';
    }

    if (reason) {
      if (all.length > 1) failedHosts.add(host);
      const next = i < candidates.length - 1 ? 'trying raw' : 'no more hosts';
      logOnce(`fetch-fail:${host}:${relativePath}`, `fetch failed host=${hostnameOf(url)} path=${relativePath} status=${reason} — ${next}`);
      continue;
    }

    let shapeOk;
    try { shapeOk = !validate || !!validate(json); } catch { shapeOk = false; }
    if (!shapeOk) {
      logOnce(`shape-mismatch:${relativePath}`, `shape mismatch for ${relativePath} — falling back`);
      return null;
    }
    if (bodyMatchesEntry(relativePath, json, entry)) {
      staleServed.delete(relativePath);
    } else {
      staleServed.add(relativePath);
      logOnce(
        `stale-body:${relativePath}`,
        `stale-body:${relativePath} — body disagrees with manifest entry (recordCount expected ${entry.recordCount}, body ${expectedRecordCount(relativePath, json)}; generatedAt ${json.generatedAt}, lastModified ${entry.lastModified}) — used this session, not cached`,
      );
    }
    return json;
  }
  return null;
}

// Projection snapshots (snapshots/<date>.json, CR-26): structure-only — the frozen-prior reader needs
// the players block and the envelope fields checkFrozenSnapshot compares.
export function isValidProjectionSnapshot(p) {
  return !!p && typeof p === 'object' && typeof p.players === 'object' && p.players !== null
    && typeof p.leagueId === 'string' && Number.isFinite(p.targetSeason);
}

export function isValidSeasonTotals(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const sample = Object.values(parsed)[0];
  return sample != null && 'gamesPlayed' in sample && 'fantasyPoints' in sample && 'dnpWeeks' in sample;
}

// Accepts either shape (college-pivot.md §2.1/§3.1): today's long-form row array, or the
// future pivoted envelope (players object + numeric rowCount). Strict about both — no
// loosening to typeof === 'object', which would readmit the silent-fallback failure mode
// this validator exists to prevent.
export function isValidCFBDRows(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return false;
    const sample = parsed[0];
    return sample != null && 'playerId' in sample && 'statType' in sample && 'stat' in sample;
  }
  if (parsed && typeof parsed === 'object') {
    return typeof parsed.players === 'object' && parsed.players !== null
      && Object.keys(parsed.players).length > 0
      && typeof parsed.rowCount === 'number';
  }
  return false;
}

export function isValidRoster(p) {
  return p && typeof p === 'object' && typeof p.players === 'object'
    && p.players !== null && typeof p.rowCount === 'number';
}

export function isValidDraft(p) {
  return p && typeof p === 'object' && p.picksByYear && typeof p.picksByYear === 'object';
}

export function isValidAdvStats(p) {
  return p && typeof p === 'object' && typeof p.players === 'object'
    && p.players !== null && typeof p.rowCount === 'number';
}

// Shared cross-repo sparsity floor for nflverse/schedule/<year>.json. Both repos
// change together. Enforced here (validator) and re-asserted in nflSchedule.js
// (loader, on the declared rowCount).
export const MIN_SCHEDULE_GAMES = 200

// Structure-only validator. Deliberately ignores score/result/temp/wind, so null
// scores, null temp/wind, and result === 0 (a tie) all pass. Samples games[0] for
// the three required identity fields, like isValidCFBDRows samples parsed[0].
export function isValidSchedule(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (!Array.isArray(p.games) || p.games.length < MIN_SCHEDULE_GAMES) return false
  const g = p.games[0]
  return g != null && 'gameId' in g && 'homeTeam' in g && 'awayTeam' in g
}

// Shared cross-repo sparsity floor for nflverse/gamelogs/<year>.json. Must equal the data
// repo's write-gate value exactly; both repos change together. Enforced here (validator) and
// re-asserted in nflGameLogs.js (loader, on the declared rowCount).
export const MIN_PLAYERGAME_ROWS = 3000

// Structure + floor validator. players is keyed by sleeper_id → { gsisId, name, position,
// games[] }; there is no flat top-level array, so the floor is checked on the declared rowCount
// (no array length to check, unlike isValidSchedule). schemaVersion is NOT re-checked here — the
// MAX_SUPPORTED_SCHEMA ceiling is enforced against the manifest entry in tryDataStore (and a hard
// version pin would self-break on a benign additive bump, per the season-totals precedent).
export function isValidGameLogs(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (typeof p.players !== 'object' || p.players === null) return false
  if (typeof p.rowCount !== 'number' || p.rowCount < MIN_PLAYERGAME_ROWS) return false
  const sample = Object.values(p.players)[0]
  return sample != null && Array.isArray(sample.games) && 'position' in sample
}

// Shared cross-repo sparsity floor for nflverse/teamcontext/<year>.json. Must equal the data
// repo's write-gate value exactly (lib/nflverse.mjs MIN_TEAMCONTEXT_ROWS); both repos change
// together. Enforced here (validator) and re-asserted in src/api/teamContext.js (loader, on the
// declared rowCount).
export const MIN_TEAMCONTEXT_ROWS = 60

// Structure + floor validator for the FIRST TEAM-keyed family. teams is keyed by era-accurate
// team abbr → { games[] }; rows are identified by (team, week), not sleeper_id. No flat
// top-level array, so the floor is checked on the declared rowCount (like isValidGameLogs).
// schemaVersion is NOT re-checked here — the MAX_SUPPORTED_SCHEMA ceiling is enforced against
// the manifest entry in tryDataStore, per the gamelogs precedent (dataStore.js:149-151).
export function isValidTeamContext(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (typeof p.teams !== 'object' || p.teams === null) return false
  if (typeof p.rowCount !== 'number' || p.rowCount < MIN_TEAMCONTEXT_ROWS) return false
  const sample = Object.values(p.teams)[0]
  if (sample == null || !Array.isArray(sample.games) || sample.games.length === 0) return false
  const g = sample.games[0]
  return g != null && 'week' in g && 'opponent' in g && 'off' in g && 'def' in g
}
