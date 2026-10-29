// Dynasty-score golden generator CLI (CR-32). Never imported by src/ or by any test.
//   node_modules/.bin/vite-node scripts/verify/dynasty-golden.mjs -- --data ../sleeper-dashboard-data
// Reads <data>/test/fixtures/dynasty-mirror-parity/inputs-*.json; writes expected-<S>.json beside them.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { buildDynastyGolden } from './lib/dynastyGolden.mjs'

function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--data')
  const data = i >= 0 ? argv[i + 1] : null
  if (!data) throw new Error('usage: --data <data repo>')
  const dir = path.join(data, 'test', 'fixtures', 'dynasty-mirror-parity')
  const sourceRev = execSync('git rev-parse --short HEAD', { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..') }).toString().trim()
  const files = fs.readdirSync(dir).filter(f => /^inputs-\d{4}\.json$/.test(f)).sort()
  if (files.length === 0) throw new Error(`no inputs-*.json in ${dir}`)
  for (const f of files) {
    const inputs = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    const golden = { sourceRev, ...buildDynastyGolden(inputs) }
    const out = path.join(dir, `expected-${inputs.S}.json`)
    fs.writeFileSync(out, JSON.stringify(golden) + '\n')
    console.log(`wrote ${out} (sourceRev ${sourceRev})`)
  }
}

main()
