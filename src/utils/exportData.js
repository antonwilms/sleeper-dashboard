import JSZip from 'jszip'
import { openDB } from 'idb'

const DB_NAME = 'sleeper-dashboard'
const STORE   = 'cache'
const PERMANENT_SENTINEL = 999999 * 60 * 1000  // anything far enough in the future

// Map a cache key to its ZIP path and a human-readable record-count label.
// Returns { zipPath, label } or null to skip.
function classifyKey(key) {
  // season-totals/<year>  →  nfl/season-totals/<year>.json
  const seasonMatch = key.match(/^season-totals\/(\d+)$/)
  if (seasonMatch) {
    return { zipPath: `nfl/season-totals/${seasonMatch[1]}.json` }
  }

  // cfbd-players/<year>/<category>  →  college/<category>/<year>.json
  const cfbdMatch = key.match(/^cfbd-players\/(\d+)\/(\w+)$/)
  if (cfbdMatch) {
    return { zipPath: `college/${cfbdMatch[2]}/${cfbdMatch[1]}.json` }
  }

  // ktc-values  →  ktc/snapshot-<YYYY-MM-DD>.json
  if (key === 'ktc-values') {
    const date = new Date().toISOString().slice(0, 10)
    return { zipPath: `ktc/snapshot-${date}.json` }
  }

  // projection-snapshots/<date>  →  snapshots/<date>.json
  const snapMatch = key.match(/^projection-snapshots\/(\d{4}-\d{2}-\d{2})$/)
  if (snapMatch) {
    return { zipPath: `snapshots/${snapMatch[1]}.json` }
  }

  // Everything else → raw/<key-with-slashes-replaced>.json
  const safeName = key.replace(/\//g, '-')
  return { zipPath: `raw/${safeName}.json` }
}

function isLive(record) {
  // Permanent cache entries use TTL 999999 minutes → expiresAt is far in the future.
  // Treat anything expiring more than 10 years out as permanent.
  const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000
  if (record.expiresAt > Date.now() + TEN_YEARS) return true
  return record.expiresAt > Date.now()
}

/**
 * Read all live IndexedDB cache entries, organise them into the ZIP structure,
 * trigger a browser download, and return { totalFiles, totalBytes }.
 */
export async function exportAllData() {
  const db = await openDB(DB_NAME, 1)
  const allRecords = await db.getAll(STORE)

  const live = allRecords.filter(isLive)

  const zip      = new JSZip()
  const manifest = {
    exportedAt: new Date().toISOString(),
    source:     'indexeddb',
    files:      {},
  }

  for (const record of live) {
    const classified = classifyKey(record.key)
    if (!classified) continue

    const { zipPath } = classified
    const json = JSON.stringify(record.data, null, 2)

    zip.file(zipPath, json)

    const recordCount = Array.isArray(record.data)
      ? record.data.length
      : typeof record.data === 'object' && record.data !== null
        ? Object.keys(record.data).length
        : 1

    manifest.files[zipPath] = {
      originalKey:  record.key,
      recordCount,
    }
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const blob        = await zip.generateAsync({ type: 'blob' })
  const date        = new Date().toISOString().slice(0, 10)
  const filename    = `sleeper-dashboard-export-${date}.zip`

  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const totalFiles = Object.keys(manifest.files).length
  const totalBytes = blob.size

  return { totalFiles, totalBytes }
}
