import { getCache, setCache, getCacheRecord, setCacheWithMeta } from '../utils/cache';
import { calculateFantasyPoints, scoreSeasonStats, seasonEmitsFirstDownBonus } from '../utils/fantasyPoints';
import { tryDataStore, getManifestEntry, isValidSeasonTotals } from './dataStore';

export const STATS_BASE_URL = "https://api.sleeper.com";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// The stats/projections endpoints return a LIST of { player_id, stats, ... } objects,
// not the { player_id: stats } map we want. Normalize before caching so all callers
// get a consistent shape. Also handles old list-format cache entries transparently.
function normalizeStatsResponse(data) {
  if (!Array.isArray(data)) return data;
  const map = {};
  for (const entry of data) {
    if (entry.player_id && entry.stats) map[entry.player_id] = entry.stats;
  }
  return map;
}

async function fetchStats(url, cacheKey, ttl) {
  const cached = await getCache(cacheKey);
  if (cached !== null) return normalizeStatsResponse(cached);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper stats API error: ${res.status}`);
  const data = normalizeStatsResponse(await res.json());
  await setCache(cacheKey, data, ttl);
  return data;
}

function statsTTL(week, currentNflWeek) {
  return (currentNflWeek === 0 || week < currentNflWeek) ? 10080 : 60;
}

// Mirrors lib/sleeper.mjs in sleeper-dashboard-data so the live and stored shapes agree.
// Treats weeks bracketed by the player's firstWeek..lastWeek as the active season window.
function computeAvailability(weeklyStatus) {
  let firstWeek = null;
  let lastWeek = null;
  for (let i = 0; i < weeklyStatus.length; i++) {
    if (weeklyStatus[i] === 'P') {
      if (firstWeek === null) firstWeek = i + 1;
      lastWeek = i + 1;
    }
  }

  if (firstWeek === null) {
    return {
      longestAbsence: 0,
      absenceSegments: [],
      firstWeek: null,
      lastWeek: null,
      returnedFromAbsence: false,
      absenceCause: 'unknown',
    };
  }

  const segments = [];
  let runStart = null;
  for (let week = firstWeek; week <= lastWeek; week++) {
    const code = weeklyStatus[week - 1];
    if (code === 'D') {
      if (runStart === null) runStart = week;
    } else if (runStart !== null) {
      segments.push({ start: runStart, end: week - 1, length: week - runStart });
      runStart = null;
    }
  }
  if (runStart !== null) {
    segments.push({ start: runStart, end: lastWeek, length: lastWeek - runStart + 1 });
  }

  return {
    longestAbsence: segments.reduce((m, s) => Math.max(m, s.length), 0),
    absenceSegments: segments,
    firstWeek,
    lastWeek,
    returnedFromAbsence: segments.some(s => s.end < lastWeek),
    absenceCause: 'unknown',
  };
}

export function getWeeklyStats(season, week, currentNflWeek) {
  const url = `${STATS_BASE_URL}/stats/nfl/${season}/${week}?season_type=regular`;
  return fetchStats(url, `stats/${season}/${week}`, statsTTL(week, currentNflWeek));
}

export function getWeeklyProjections(season, week, currentNflWeek) {
  const url = `${STATS_BASE_URL}/projections/nfl/${season}/${week}?season_type=regular`;
  return fetchStats(url, `projections/${season}/${week}`, statsTTL(week, currentNflWeek));
}

// weekly-decision-1-lineup.md §1 — a meta-preserving sibling to normalizeStatsResponse/fetchStats.
// normalizeStatsResponse (above) reduces each row to its bare `stats` object, discarding `team`,
// `opponent`, `game_id` — fine for getSeasonTotals, whose `Object.entries(stats)` sum loop (below,
// :201-203) would start summing non-stat keys if that shape ever carried them. `/week` needs
// exactly those discarded fields: the upcoming opponent (only present in the projections payload)
// and the per-week `team` a traded player actually played for (weeklyUsage.js's accumulateUsage
// resolves team per week from this, never from a fixed playerMap lookup).
//
// Both `getWeeklyStatRows`/`getWeeklyProjectionRows` return { [player_id]: { stats, team,
// opponent, gameId } }. `team`/`opponent` are the SLEEPER domain (LAR, not LA) — same domain as
// `TEAM_<abbr>` aggregate rows and `playerMap[id].team`, so joins against those need no CR-16 era
// remap; the join against `fpaTable` (era-accurate) still does, at that one site (weeklyLineup.js).
//
// This does NOT route through fetchStats: fetchStats calls normalizeStatsResponse on the
// cache-hit path as well as the network path, so a flag on it would still strip this metadata on
// the second load — the worst failure shape, since it would only surface after the cache warms.
// fetchStatsRows below repeats fetchStats' two-path shape deliberately rather than parameterising
// it. Cache keys (`stat-rows/<s>/<w>`, `projection-rows/<s>/<w>`) are distinct from
// `stats/<s>/<w>`/`projections/<s>/<w>` (the bare-stats-map cache) — same URL, different shape,
// must not collide. No wasted fetch in practice: getSeasonTotals populates `stats/*` only for
// seasons before the current one (its `s < currentSeason` loop in loadCareerHistory), while
// `/week` reads only the in-progress season, so `stat-rows/*` and `stats/*` never cover the same
// week — do not "dedupe" them later, that would reintroduce the stripped-metadata bug.
function normalizeStatsRowsResponse(data) {
  if (!Array.isArray(data)) return data;
  const map = {};
  for (const entry of data) {
    if (entry.player_id && entry.stats) {
      map[entry.player_id] = {
        stats: entry.stats,
        team: entry.team ?? null,
        opponent: entry.opponent ?? null,
        gameId: entry.game_id ?? null,
      };
    }
  }
  return map;
}

async function fetchStatsRows(url, cacheKey, ttl) {
  const cached = await getCache(cacheKey);
  if (cached !== null) return normalizeStatsRowsResponse(cached);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper stats API error: ${res.status}`);
  const data = normalizeStatsRowsResponse(await res.json());
  await setCache(cacheKey, data, ttl);
  return data;
}

// A row with `opponent == null` means that team is on bye — `TEAM_*` rows appear in the STATS
// payload (32/week) but not in the projections payload (a bye team has no projections row at
// all). Both are normal, neither is an error.
export function getWeeklyStatRows(season, week, currentNflWeek) {
  const url = `${STATS_BASE_URL}/stats/nfl/${season}/${week}?season_type=regular`;
  return fetchStatsRows(url, `stat-rows/${season}/${week}`, statsTTL(week, currentNflWeek));
}

export function getWeeklyProjectionRows(season, week, currentNflWeek) {
  const url = `${STATS_BASE_URL}/projections/nfl/${season}/${week}?season_type=regular`;
  return fetchStatsRows(url, `projection-rows/${season}/${week}`, statsTTL(week, currentNflWeek));
}

// Aggregate all 18 weeks of a season into per-player totals.
// Uses the gp field from the stats response as the authoritative participation signal:
//   gp === 1  → player played that week
//   gp === 0  → present in response but did not play (DNP or bye)
//   absent    → not in the response
// Bye vs DNP is disambiguated by checking if any player on the same team has gp === 1.
async function getSeasonTotals(season, activePlayerIds, scoringSettings, playersMap, onWeekProgress, onPath) {
  const t0 = performance.now();
  const cacheKey = `season-totals/${season}`;

  // (1) Cache check — use getCacheRecord to access metadata
  const record = await getCacheRecord(cacheKey);
  if (record && record.data && Object.keys(record.data).length > 0) {
    // Stale detection: pre-phase-5 entries lack the weeklyStatus field. Re-fetch so
    // we pick up the new fields rather than serving a v1-shaped payload from cache.
    const sample = Object.values(record.data)[0];
    if (sample.weeklyStatus !== undefined) {
      if (record.sourceLastModified) {
        // Data-store-sourced entry: check if manifest has a newer version
        const entry = await getManifestEntry(`nfl/season-totals/${season}.json`);
        if (entry && new Date(entry.lastModified).getTime() > new Date(record.sourceLastModified).getTime()) {
          console.log(`[career] ${season}: cache stale vs manifest — refreshing from data store`);
        } else {
          console.info('[perf][career]', season, 'cache-hit', Math.round(performance.now() - t0) + 'ms');
          onPath?.('cache-hit');
          onWeekProgress?.(18, true);
          return record.data;
        }
      } else {
        // Live-API-sourced entry (no sourceLastModified): serve from cache unless the data
        // store has a usable entry to migrate to, so the 18-week loop is not re-run needlessly.
        const dsEntry = await getManifestEntry(`nfl/season-totals/${season}.json`);
        if (!dsEntry || dsEntry.inProgress || !dsEntry.lastModified) {
          // No usable data-store entry — serve cache
          console.info('[perf][career]', season, 'cache-hit', Math.round(performance.now() - t0) + 'ms');
          onPath?.('cache-hit');
          onWeekProgress?.(18, true);
          return record.data;
        }
        // Data store has a usable entry — fall through to migrate from live-API to data-store source
        console.log(`[career] ${season}: live-API cache present but data store has a usable entry — migrating`);
      }
    } else {
      console.log(`[career] ${season}: stale cache (pre-phase-5 / no weeklyStatus) — re-fetching.`);
    }
  } else if (record) {
    console.warn(`[career] ${season}: stale empty cache entry — re-fetching.`);
  }

  // (2) Data store
  const dsPath = `nfl/season-totals/${season}.json`;
  const dsResult = await tryDataStore(dsPath, { validate: isValidSeasonTotals });
  if (dsResult !== null) {
    const entry = await getManifestEntry(dsPath);
    await setCacheWithMeta(cacheKey, dsResult, 999999, {
      sourceLastModified: entry?.lastModified ?? null,
      sourceSchemaVersion: entry?.schemaVersion ?? null,
    });
    console.info('[perf][career]', season, 'data-store', Math.round(performance.now() - t0) + 'ms');
    onPath?.('data-store');
    onWeekProgress?.(18, true);
    console.log(`[career] ${season}: loaded from data store (${Object.keys(dsResult).length} players)`);
    return dsResult;
  }

  // (3) Live API — existing 18-week loop
  console.log(`[career] ${season}: fetching 18 weeks for ${activePlayerIds.size} players`);
  const totals = {};

  for (let week = 1; week <= 18; week++) {
    onWeekProgress?.(week, false);
    const weekCacheKey = `stats/${season}/${week}`;
    let weekFromCache = false;
    try {
      const weekUrl = `${STATS_BASE_URL}/stats/nfl/${season}/${week}?season_type=regular`;
      weekFromCache = (await getCache(weekCacheKey)) !== null;
      const weekStats = await fetchStats(weekUrl, weekCacheKey, 10080);

      // Build the set of NFL teams that have at least one player with gp === 1 this week.
      // Used to distinguish bye weeks (team not playing) from DNPs (team played, player didn't).
      const teamsPlaying = new Set();
      for (const [playerId, stats] of Object.entries(weekStats)) {
        if (stats.gp === 1) {
          const team = playersMap?.[playerId]?.team;
          if (team) teamsPlaying.add(team);
        }
      }

      for (const [playerId, stats] of Object.entries(weekStats)) {
        if (!activePlayerIds.has(playerId)) continue;

        if (!totals[playerId]) {
          totals[playerId] = {
            stats: {}, gamesPlayed: 0, gamesStarted: 0,
            byeWeeks: 0, dnpWeeks: 0, weeklyPoints: {},
            weeklyStatus: Array(18).fill('X'),
          };
        }

        if (stats.gp === 1) {
          totals[playerId].gamesPlayed++;
          if (stats.gs === 1) totals[playerId].gamesStarted++;
          // Sum weekly points per game (not from season totals) to avoid rate-stat inflation
          totals[playerId].weeklyPoints[week] = calculateFantasyPoints(stats, scoringSettings);
          totals[playerId].weeklyStatus[week - 1] = 'P';
          for (const [key, val] of Object.entries(stats)) {
            if (val != null) totals[playerId].stats[key] = (totals[playerId].stats[key] ?? 0) + val;
          }
        } else {
          // gp === 0: player was in the response but did not play
          const playerTeam = playersMap?.[playerId]?.team ?? null;
          if (playerTeam && !teamsPlaying.has(playerTeam)) {
            totals[playerId].byeWeeks++;
            totals[playerId].weeklyStatus[week - 1] = 'B';
          } else {
            totals[playerId].dnpWeeks++;
            totals[playerId].weeklyStatus[week - 1] = 'D';
          }
        }
      }
    } catch (err) {
      console.warn(`[career] ${season} W${week} failed — skipping:`, err.message);
    }
    // Delay only after an actual network fetch — bypassed when week was already cached
    if (week < 18 && !weekFromCache) await delay(200);
  }

  for (const data of Object.values(totals)) {
    data.fantasyPoints = Math.round(
      Object.values(data.weeklyPoints).reduce((a, b) => a + b, 0) * 100
    ) / 100;
    data.availability = computeAvailability(data.weeklyStatus);
  }

  console.log(`[career] ${season}: storing ${Object.keys(totals).length} player totals`);
  await setCache(cacheKey, totals, 999999);
  console.info('[perf][career]', season, 'live-api', Math.round(performance.now() - t0) + 'ms');
  onPath?.('live-api');
  return totals;
}

// The one season-rescoring seam (season-rescore.md). Served season rows carry Sleeper's half-PPR
// `fantasyPoints`; this scores every row's `stats` with the league's `scoringSettings` instead.
// Contract: rescore ON READ, after the cache — never cache the result, never write a derived key
// into `row.stats` (stats is carried by reference). Valid because every Sleeper scoring key is a
// per-game count, so scoring summed stats equals summing weekly scores (season-rescore.md §1.2).
// Seasons where Sleeper emitted no bonus_fd_* key (2012–2021) get it reconstructed from
// pass_fd + rec_fd + rush_fd under the player's current position (§2.1). Rescored rows carry
// scoringBasis 'league' plus sourceFantasyPoints/sourceScoringBasis; a row that already has
// sourceFantasyPoints is passed through, so a second pass is a no-op.
// PROVISIONAL(heuristic): weeklyPoints scaled by the season's league/half-PPR ratio · the store has no per-week stats (median error 4.6%, p90 19%) · per-week scoring keys in season-totals (D-47)
export function rescoreSeasonTotals(rows, scoringSettings, playersMap) {
  if (rows == null || typeof rows !== 'object') return rows
  if (scoringSettings == null || Object.keys(scoringSettings).length === 0) return rows

  const deriveFirstDowns = !seasonEmitsFirstDownBonus(rows)
  const out = {}
  for (const [id, row] of Object.entries(rows)) {
    if (row == null || typeof row !== 'object' || row.sourceFantasyPoints !== undefined) {
      out[id] = row
      continue
    }
    const position = playersMap?.[id]?.position ?? null
    const scored = scoreSeasonStats(row.stats ?? {}, scoringSettings, { position, deriveFirstDowns })
    const source = row.fantasyPoints
    let ratio = null
    if (Number.isFinite(source) && source > 0) ratio = scored / source
    else if (source === 0 && scored === 0) ratio = 1

    const scale = (v) => (ratio != null && Number.isFinite(v) ? Math.round(v * ratio * 100) / 100 : null)
    let weeklyPoints = row.weeklyPoints
    if (weeklyPoints != null) {
      if (Array.isArray(weeklyPoints)) {
        weeklyPoints = weeklyPoints.map(scale)
      } else {
        const scaled = {}
        for (const [k, v] of Object.entries(weeklyPoints)) scaled[k] = scale(v)
        weeklyPoints = scaled
      }
    }

    out[id] = {
      ...row,
      fantasyPoints: scored,
      weeklyPoints,
      scoringBasis: 'league',
      sourceFantasyPoints: Number.isFinite(source) ? source : null,
      sourceScoringBasis: typeof row.scoringBasis === 'string' ? row.scoringBasis : null,
    }
  }
  return out
}

// Loads the LIVE (in-progress) season's partial season-totals — in-season-app-read.md §2. Follows
// nflRoster.js:55-101 step for step: manifest check -> lastModified-aware cache check -> data-store
// fetch (allowInProgress, scoped to this one call only) -> cache with a PERMANENT TTL plus the
// lastModified compare layered inside the cached payload (not a short TTL — nflRoster.js's pattern
// is layered, not alternatives).
//
// Uses a cache key DISTINCT from getSeasonTotals' `season-totals/<season>` (which stores a bare
// players map) — this stores a `{ players, lastModified }` wrapper, and a collided key would make
// getSeasonTotals' own weeklyStatus staleness sniff (:112) read the wrapper's first key and force a
// re-fetch forever once this season later enters careerStats.
//
// A `null` manifest entry means one of three things (dataStore.js:65-70): file missing, store
// disabled, or manifest fetch failed. This loader does not distinguish them — it returns the same
// graceful empty shape for all three, and callers must not word copy as "isn't available yet" (true
// only for the first case) without checking which applies.
//
// Rows are rescored on read (rescoreSeasonTotals) with the league's settings; the cache keeps the raw rows.
const CURRENT_SEASON_TOTALS_CACHE_PREFIX = 'season-totals-live'

export async function loadCurrentSeasonTotals(season, scoringSettings = null, playersMap = null) {
  const emptyResult = { players: {}, season, complete: false }
  const dsPath = `nfl/season-totals/${season}.json`
  const cacheKey = `${CURRENT_SEASON_TOTALS_CACHE_PREFIX}/${season}`

  const entry = await getManifestEntry(dsPath)
  if (!entry) return emptyResult

  const record = await getCacheRecord(cacheKey)
  if (record?.data?.players && record.data.lastModified === entry.lastModified) {
    return { players: rescoreSeasonTotals(record.data.players, scoringSettings, playersMap), season, complete: true }
  }

  const dsResult = await tryDataStore(dsPath, { validate: isValidSeasonTotals, allowInProgress: true })
  if (dsResult == null) return emptyResult

  await setCacheWithMeta(cacheKey, { players: dsResult, lastModified: entry.lastModified }, 999999)
  return { players: rescoreSeasonTotals(dsResult, scoringSettings, playersMap), season, complete: true }
}

export async function loadCareerHistory(currentSeason, scoringSettings, activePlayerIds, playersMap, onProgress, onSeasonPath) {
  const t0 = performance.now();
  const seasons = [];
  for (let s = 2012; s < currentSeason; s++) seasons.push(s);
  const totalSeasons = seasons.length;
  const result = {};
  const pathCounts = {};

  console.log(`[career] Loading seasons 2012–${currentSeason - 1} (${totalSeasons} seasons)`);

  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    onProgress?.({ active: true, currentSeason: season, currentWeek: 0, totalSeasons, seasonsComplete: i, cached: false });

    result[season] = rescoreSeasonTotals(await getSeasonTotals(
      season,
      activePlayerIds,
      scoringSettings,
      playersMap,
      (currentWeek, cached) => {
        onProgress?.({ active: true, currentSeason: season, currentWeek, totalSeasons, seasonsComplete: i, cached });
      },
      (path) => {
        pathCounts[path] = (pathCounts[path] ?? 0) + 1;
        onSeasonPath?.(season, path);
      }
    ), scoringSettings, playersMap);

    onProgress?.({ active: true, currentSeason: season, currentWeek: 18, totalSeasons, seasonsComplete: i + 1, cached: false });
  }
  console.info('[perf][career] total', Math.round(performance.now() - t0) + 'ms', pathCounts);

  return result;
}
