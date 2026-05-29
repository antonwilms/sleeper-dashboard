import { getCache, setCache } from '../utils/cache';

export const BASE_URL = "https://api.sleeper.app/v1";

async function fetchWithCache(path, ttl) {
  const cached = await getCache(path);
  if (cached !== null) return cached;

  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  const data = await res.json();
  await setCache(path, data, ttl);
  return data;
}

export function getNFLState() {
  return fetchWithCache('/state/nfl');
}

export function getUserByUsername(username) {
  return fetchWithCache(`/user/${username}`);
}

export function getLeaguesForUser(userId, season) {
  return fetchWithCache(`/user/${userId}/leagues/nfl/${season}`);
}

export function getLeagueUsers(leagueId) {
  return fetchWithCache(`/league/${leagueId}/users`);
}

export function getLeagueRosters(leagueId) {
  return fetchWithCache(`/league/${leagueId}/rosters`);
}

export function getMatchups(leagueId, week, currentNflWeek) {
  // Completed weeks never change — cache for 1 week instead of 60 min.
  // currentNflWeek === 0 means offseason; all historical weeks are complete.
  const completed = currentNflWeek === 0 || week < currentNflWeek;
  return fetchWithCache(`/league/${leagueId}/matchups/${week}`, completed ? 10080 : 60);
}

export function getAllPlayers() {
  // ~5MB response — cache for 24 hours. Key contains "players" so auto-TTL
  // would also pick 1440, but we pass it explicitly to make intent clear.
  return fetchWithCache('/players/nfl', 1440);
}

export function getLeague(leagueId) {
  return fetchWithCache(`/league/${leagueId}`, 60);
}

export function getLeagueDrafts(leagueId) {
  return fetchWithCache(`/league/${leagueId}/drafts`, 60);
}

export function getDraftPicks(draftId) {
  // Rookie draft picks are permanent once the draft ends — cache for 1 week.
  return fetchWithCache(`/draft/${draftId}/picks`, 10080);
}
