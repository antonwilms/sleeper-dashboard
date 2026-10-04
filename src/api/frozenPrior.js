// in-season-evidence-2b-1-constants-snapshot.md §4 — the frozen in-season prior (Q7 FREEZE), read back
// from the latest daily snapshot captured before kickoff (CR-26). Never rejects: every failure degrades
// to a status the caller turns into "live prior, flagged". Mechanism only: whether a frozen prior
// exists for a season is decided by the gates in ../utils/inSeasonScoring.js, not here.
import { getCache, setCache } from '../utils/cache'
import { isDataStoreReady, listManifestPaths, tryDataStore, isValidProjectionSnapshot } from './dataStore'
import { selectFrozenPriorCandidate, checkFrozenSnapshot, trimFrozenSnapshot } from '../utils/inSeasonScoring'

export const FROZEN_PRIOR_TIMEOUT_MS = 30_000
const TTL_MINUTES = 999999   // snapshots are immutable (data Invariant 5)

const UNAVAILABLE = { status: 'unavailable', reason: 'unavailable' }

// Steps 3–4: cache, fetch, gates. Bounded by the caller's race (tryDataStore's 15 s timer clears when
// the headers arrive, so a stalled body read has no limit of its own).
async function readAndGate(dateKey, gateArgs) {
  const cacheKey = `frozen-prior/${dateKey}`
  let trim = await getCache(cacheKey)
  if (trim == null) {
    const raw = await tryDataStore(`snapshots/${dateKey}.json`, { validate: isValidProjectionSnapshot })
    if (raw == null) return { status: 'unavailable', reason: 'unavailable', dateKey }
    trim = trimFrozenSnapshot(raw)
    await setCache(cacheKey, trim, TTL_MINUTES)
  }
  const reason = checkFrozenSnapshot(trim.env, gateArgs)
  if (reason) return { status: 'refused', reason, dateKey }
  return { status: 'ok', dateKey, players: trim.players, starterPPG: trim.starterPPG ?? {} }
}

export async function loadFrozenPrior({ liveSeason, kickoffDate, leagueId, projectionBasis }) {
  try {
    if (!(await isDataStoreReady())) return { ...UNAVAILABLE }
    const cand = selectFrozenPriorCandidate({
      manifestPaths: await listManifestPaths('snapshots/'),
      kickoffDate,
    })
    if (cand.reason === 'no-snapshot' || cand.reason === 'no-kickoff') return { status: 'none', reason: cand.reason }
    if (cand.reason === 'model-changed') return { status: 'refused', reason: cand.reason, dateKey: cand.dateKey }

    let timer
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({ status: 'unavailable', reason: 'timeout' }), FROZEN_PRIOR_TIMEOUT_MS)
    })
    const work = readAndGate(cand.dateKey, { leagueId, liveSeason, projectionBasis })
    work.catch(() => {})   // an abandoned (timed-out) read must not surface as an unhandled rejection
    try {
      return await Promise.race([work, timeout])
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.warn('[frozenPrior] load failed:', err?.message ?? err)
    return { ...UNAVAILABLE }
  }
}
