// All filesystem / network I/O for the verification harness. Read-only against the data repo; the only
// writes are the cache dir and (via the CLI) <data>/verification/.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

export function readDataJson(dataDir, relPath) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, relPath), 'utf8'))
}

// Highest-dated file in dataDir/dir whose name matches `re` (capture group 1 = the date). Returns the
// bare file name, or null when nothing matches.
export function newestDated(dataDir, dir, re) {
  const names = fs.readdirSync(path.join(dataDir, dir))
  let best = null
  let bestDate = ''
  for (const name of names) {
    const m = re.exec(name)
    if (m && m[1] > bestDate) { best = name; bestDate = m[1] }
  }
  return best
}

// Throws unless `out` resolves to exactly <data>/verification — the harness writes nowhere else.
export function assertOutPath(outDir, dataDir) {
  const want = path.resolve(dataDir, 'verification')
  if (path.resolve(outDir) !== want) {
    throw new Error(`--out must be ${want} (got ${path.resolve(outDir)})`)
  }
  return want
}

// Fetch JSON with an on-disk cache keyed by URL. `fetches` (optional array) gets one entry per URL
// first seen this run: { url, fetchedAt, cached }. noFetch → a cache miss throws.
export async function cachedFetchJson(url, cacheDir, { noFetch = false, fetches = null, delayMs = 0 } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const key = crypto.createHash('sha1').update(url).digest('hex')
  const file = path.join(cacheDir, `${key}.json`)
  if (fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (fetches && !fetches.some(f => f.url === url)) fetches.push({ url, fetchedAt: rec.fetchedAt, cached: true })
    return { data: rec.data, fetchedAt: rec.fetchedAt, cached: true }
  }
  if (noFetch) throw new Error(`--no-fetch: cache miss for ${url}`)
  if (delayMs) await new Promise(r => setTimeout(r, delayMs))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const data = await res.json()
  const fetchedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify({ url, fetchedAt, data }))
  if (fetches) fetches.push({ url, fetchedAt, cached: false })
  return { data, fetchedAt, cached: false }
}

// Read-only git facts for the report header. Untracked files count as dirty, so callers pass an inclusion
// `pathspec` of the paths that are inputs; anything outside it (the harness's own outputs, task files) is ignored.
export function gitInfo(repoDir, pathspec = ['.']) {
  const run = (...args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
  return { head: run('rev-parse', 'HEAD'), clean: run('status', '--porcelain', '--', ...pathspec) === '' }
}
