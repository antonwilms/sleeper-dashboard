import { getCache, setCacheWithMeta } from '../utils/cache';

const BASE_URL = import.meta.env.VITE_DATA_STORE_URL;
const ENABLED = import.meta.env.VITE_DATA_STORE_ENABLED !== 'false';
// Phase 5: nfl/season-totals files now ship at schemaVersion 2 (weeklyStatus + availability).
// v1 files still load — isValidSeasonTotals only requires the original fields — so the app
// degrades gracefully if some files are still on v1.
const MAX_SUPPORTED_SCHEMA = 2;
const MANIFEST_TTL = 60;

let manifestPromise = null;
let sessionDisabled = false;
const loggedKeys = new Set();

function logOnce(key, ...args) {
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  console.warn('[dataStore]', ...args);
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

async function loadManifest() {
  if (!BASE_URL || BASE_URL.includes('<user>')) {
    logOnce('placeholder-url', '[perf][dataStore] VITE_DATA_STORE_URL is a placeholder — data store will be disabled');
    sessionDisabled = true;
    return null;
  }

  const cached = await getCache('data-store/manifest');
  if (cached !== null) return cached;

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/manifest.json`, 5000);
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    const manifest = await res.json();
    if (!manifest || typeof manifest.files !== 'object') {
      throw new Error('manifest missing required keys');
    }
    await setCacheWithMeta('data-store/manifest', manifest, MANIFEST_TTL, {});
    console.info('[perf][dataStore] manifest OK from', BASE_URL);
    return manifest;
  } catch (err) {
    logOnce('manifest-fail', 'manifest fetch failed — data store disabled for this session:', err.message, '— URL was', BASE_URL);
    sessionDisabled = true;
    return null;
  }
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

export async function tryDataStore(relativePath, { validate = null } = {}) {
  if (!ENABLED || sessionDisabled) return null;
  if (!manifestPromise) manifestPromise = loadManifest();
  const manifest = await manifestPromise;
  if (!manifest) return null;

  const entry = manifest.files?.[relativePath];
  if (!entry) return null;
  if (entry.inProgress) return null;
  if (entry.schemaVersion > MAX_SUPPORTED_SCHEMA) {
    logOnce(`schema-too-new:${relativePath}`, `schema too new for ${relativePath} (v${entry.schemaVersion}) — falling back`);
    return null;
  }

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/${relativePath}`, 15000);
    if (!res.ok) return null;
    const json = await res.json();
    if (validate && !validate(json)) {
      logOnce(`shape-mismatch:${relativePath}`, `shape mismatch for ${relativePath} — falling back`);
      return null;
    }
    return json;
  } catch (err) {
    logOnce(`fetch-fail:${relativePath}`, `timeout — falling back (${relativePath}):`, err.message);
    return null;
  }
}

export function isValidSeasonTotals(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const sample = Object.values(parsed)[0];
  return sample != null && 'gamesPlayed' in sample && 'fantasyPoints' in sample && 'dnpWeeks' in sample;
}

export function isValidCFBDRows(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  const sample = parsed[0];
  return sample != null && 'playerId' in sample && 'statType' in sample && 'stat' in sample;
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
