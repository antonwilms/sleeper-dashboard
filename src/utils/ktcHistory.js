// ---------------------------------------------------------------------------
// Historical KTC snapshot loader and signal extractor (Projection C2)
//
// Coupling note: loadKtcHistory reads the 'data-store/manifest' IndexedDB key
// directly, because dataStore.js exposes no manifest-enumeration export and
// may not be modified. If dataStore.js ever renames its manifest cache key,
// update MANIFEST_CACHE_KEY accordingly.
// ---------------------------------------------------------------------------

import { isDataStoreReady, tryDataStore } from '../api/dataStore'
import { matchKTCToSleeper } from './ktcMatch'
import { getCache, setCacheWithMeta } from './cache'

const WINDOW_SIZE      = 8
const MIN_SPACING_DAYS = 5
const CACHE_KEY        = 'ktc-history/v1'
const CACHE_TTL        = 1440   // 1 day — backstop; real invalidation is the signature check
const SNAPSHOT_RE      = /^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/

// ---------------------------------------------------------------------------
// Shape validator
// ---------------------------------------------------------------------------

// True when `parsed` looks like a KTC snapshot: a non-empty array whose first
// element has a string `name` and a numeric `value`.
export function isValidKtcSnapshot(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return false
  const sample = parsed[0]
  return sample != null && typeof sample.name === 'string' && typeof sample.value === 'number'
}

// ---------------------------------------------------------------------------
// Pure stat helpers (module-private)
// ---------------------------------------------------------------------------

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdev(nums) {
  const m = mean(nums)
  return Math.sqrt(nums.reduce((a, x) => a + (x - m) ** 2, 0) / nums.length)
}

function median(nums) {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// OLS slope of ys against x = 0,1,...,n-1. Returns null for n < 2 or zero x-variance.
function olsSlope(ys) {
  const n = ys.length
  if (n < 2) return null
  const xMean = (n - 1) / 2
  const yMean = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean)
    den += (i - xMean) ** 2
  }
  return den === 0 ? null : num / den
}

// ---------------------------------------------------------------------------
// loadKtcHistory — async loader (called from App.jsx)
// ---------------------------------------------------------------------------

/**
 * Fetches the recent KTC snapshot window from the data store, matches each
 * snapshot to Sleeper IDs, and assembles per-player value time-series plus
 * per-snapshot position medians.
 *
 * @param {Object} args
 * @param {Object} args.playersMap  Sleeper player map { [player_id]: player }
 * @param {number} [args.window]    Snapshot count (default WINDOW_SIZE = 8)
 * @returns {Promise<KtcHistory|null>}  null when the data store is unavailable
 *                                      and no cache exists.
 */
export async function loadKtcHistory({ playersMap, window = WINDOW_SIZE }) {
  if (!playersMap) return null

  if (!(await isDataStoreReady())) return getCache(CACHE_KEY)

  // isDataStoreReady() triggers loadManifest(), which caches the manifest
  // under 'data-store/manifest'. Read it back here for enumeration.
  const manifest = await getCache('data-store/manifest')
  if (!manifest) return getCache(CACHE_KEY)

  // ── 1. Enumerate ktc/snapshot-YYYY-MM-DD.json entries ───────────────────
  const candidates = []
  for (const path of Object.keys(manifest.files)) {
    const m = SNAPSHOT_RE.exec(path)
    if (!m) continue
    candidates.push({ path, date: m[1] })
  }

  // ── 2. Select: sort descending, pick with ≥5-day spacing ────────────────
  candidates.sort((a, b) => b.date.localeCompare(a.date))
  const selected = []
  let lastDate = null
  for (const c of candidates) {
    if (selected.length >= window) break
    if (lastDate === null) {
      selected.push(c)
      lastDate = c.date
    } else {
      const daysDiff = Math.round(
        (new Date(lastDate) - new Date(c.date)) / 86400000
      )
      if (daysDiff >= MIN_SPACING_DAYS) {
        selected.push(c)
        lastDate = c.date
      }
    }
  }

  // ── 3. Cache check ───────────────────────────────────────────────────────
  const newestSelected = selected[0] ?? null
  const latestSnapshotLastModified = newestSelected
    ? (manifest.files[newestSelected.path]?.lastModified ?? null)
    : null
  const selectedDatesAsc = selected.map(s => s.date).reverse()

  const cached = await getCache(CACHE_KEY)
  if (
    cached &&
    Array.isArray(cached.snapshotDates) &&
    cached.snapshotDates.length === selectedDatesAsc.length &&
    selectedDatesAsc.every((d, i) => d === cached.snapshotDates[i]) &&
    cached.latestSnapshotLastModified === latestSnapshotLastModified
  ) {
    return cached
  }

  // ── 4. Fetch selected snapshots in parallel ──────────────────────────────
  const fetched = await Promise.all(
    selected.map(s =>
      tryDataStore(s.path, { validate: isValidKtcSnapshot })
        .then(data => ({ date: s.date, data }))
    )
  )
  const usable = fetched.filter(f => f.data != null)

  // ── 5. Empty-structure shortcut ──────────────────────────────────────────
  if (usable.length === 0) {
    const history = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      window,
      snapshotDates: [],
      latestSnapshotLastModified,
      series: {},
      positionMedians: {},
    }
    await setCacheWithMeta(CACHE_KEY, history, CACHE_TTL, { sourceLastModified: latestSnapshotLastModified })
    return history
  }

  // ── 6. Per-snapshot processing (oldest → newest) ─────────────────────────
  usable.sort((a, b) => a.date.localeCompare(b.date))

  const series = {}
  const positionMedians = {}
  const POSITIONS = ['QB', 'RB', 'WR', 'TE']

  for (const { date, data: players } of usable) {
    const ktcMap = matchKTCToSleeper(players, playersMap)

    // Bucket matched entries by position
    const buckets = { QB: [], RB: [], WR: [], TE: [] }
    for (const [sleeperId, { value }] of ktcMap) {
      const pos = playersMap[sleeperId]?.position
      if (buckets[pos]) buckets[pos].push({ sleeperId, value })
    }

    // Compute per-position medians and 1-based ranks
    const posMedian = {}
    const rankInfo = new Map()
    for (const pos of POSITIONS) {
      const bucket = buckets[pos]
      if (bucket.length === 0) {
        posMedian[pos] = null
        continue
      }
      posMedian[pos] = median(bucket.map(e => e.value))
      bucket.sort((a, b) => b.value - a.value)
      const med = posMedian[pos]
      bucket.forEach(({ sleeperId, value }, idx) => {
        rankInfo.set(sleeperId, {
          positionRank: idx + 1,
          valueVsPosMedian: value / Math.max(med, 1),
        })
      })
    }

    positionMedians[date] = {
      QB: posMedian.QB ?? null,
      RB: posMedian.RB ?? null,
      WR: posMedian.WR ?? null,
      TE: posMedian.TE ?? null,
    }

    // Append to each player's series
    for (const [sleeperId, { value }] of ktcMap) {
      const info = rankInfo.get(sleeperId)
      if (!info) continue
      if (!series[sleeperId]) series[sleeperId] = []
      series[sleeperId].push({
        date,
        value,
        positionRank: info.positionRank,
        valueVsPosMedian: info.valueVsPosMedian,
      })
    }
  }

  // ── 7. Assemble, cache, and return ───────────────────────────────────────
  const history = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    window,
    snapshotDates: usable.map(u => u.date),  // ascending (processed oldest→newest)
    latestSnapshotLastModified,
    series,
    positionMedians,
  }

  await setCacheWithMeta(CACHE_KEY, history, CACHE_TTL, { sourceLastModified: latestSnapshotLastModified })
  return history
}

// ---------------------------------------------------------------------------
// computeKtcSignals — pure extractor (called from seasonProjection.js)
// ---------------------------------------------------------------------------

/**
 * Derives the four historical KTC signals from one player's value series.
 * Pure — no IO. Safe to call for every player on every projection re-run.
 *
 * @param {Array|null} series  Ascending-by-date array of
 *                             { date, value, positionRank, valueVsPosMedian },
 *                             or null/undefined when the player matched no snapshot.
 * @returns {KtcSignals}  Always returns all 13 keys; null sentinels when the
 *                        series has fewer than 2 points.
 */
export function computeKtcSignals(series) {
  const n = series?.length ?? 0
  const ktcHistSampleSize = n

  if (n < 2) {
    return {
      ktcHistDelta:               null,
      ktcHistDeltaPct:            null,
      ktcHistVolatility:          null,
      ktcHistVolatilityPct:       null,
      ktcHistTrajectorySlope:     null,
      ktcHistTrajectoryNormalized: null,
      ktcHistTrajectoryLabel:     null,
      ktcHistRankVsMedianTrend:   null,
      ktcHistRankVsMedianLabel:   null,
      ktcHistValueVsPosMedian:    null,
      ktcHistSampleSize,
      ktcHistWindowSpanDays:      null,
      ktcHistConfidence:          'none',
    }
  }

  const values = series.map(p => p.value)
  const m = mean(values)

  const ktcHistWindowSpanDays = Math.round(
    (new Date(series[n - 1].date) - new Date(series[0].date)) / 86400000
  )
  const ktcHistConfidence = n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low'

  // Signal 1 — KTC delta
  const ktcHistDelta    = values[n - 1] - values[0]
  const ktcHistDeltaPct = Math.round((ktcHistDelta / Math.max(values[0], 1)) * 1000) / 1000

  // Signal 2 — KTC volatility
  const sd = stdev(values)
  const ktcHistVolatility    = Math.round(sd * 10) / 10
  const ktcHistVolatilityPct = Math.round((sd / Math.max(m, 1)) * 1000) / 1000

  // Signal 3 — KTC trajectory
  const slope = olsSlope(values)
  const ktcHistTrajectorySlope      = slope !== null ? Math.round(slope * 10) / 10 : null
  const normSlope                   = slope !== null ? slope / Math.max(m, 1) : null
  const ktcHistTrajectoryNormalized = normSlope !== null ? Math.round(normSlope * 10000) / 10000 : null
  const ktcHistTrajectoryLabel      = normSlope === null ? null
    : normSlope > 0.01  ? 'rising'
    : normSlope < -0.01 ? 'falling'
    : 'flat'

  // Signal 4 — KTC rank vs position-median trend
  const vvpm = series.map(p => p.valueVsPosMedian)
  const rvmSlope = olsSlope(vvpm)
  const ktcHistRankVsMedianTrend = rvmSlope !== null ? Math.round(rvmSlope * 10000) / 10000 : null
  const ktcHistRankVsMedianLabel = rvmSlope === null ? null
    : rvmSlope > 0.01  ? 'gaining'
    : rvmSlope < -0.01 ? 'losing'
    : 'flat'
  const ktcHistValueVsPosMedian  = Math.round(series[n - 1].valueVsPosMedian * 1000) / 1000

  return {
    ktcHistDelta,
    ktcHistDeltaPct,
    ktcHistVolatility,
    ktcHistVolatilityPct,
    ktcHistTrajectorySlope,
    ktcHistTrajectoryNormalized,
    ktcHistTrajectoryLabel,
    ktcHistRankVsMedianTrend,
    ktcHistRankVsMedianLabel,
    ktcHistValueVsPosMedian,
    ktcHistSampleSize,
    ktcHistWindowSpanDays,
    ktcHistConfidence,
  }
}
