import { useState } from 'react'
import { clearCache } from '../../utils/cache'
import { invalidateManifest } from '../../api/dataStore'

export function ClearCacheButton() {
  const [pending, setPending] = useState(null)

  async function run(key, fn) {
    if (pending === key) {
      await fn()
      setPending(null)
    } else {
      setPending(key)
    }
  }

  const btn = (key, label, fn) => (
    <button
      key={key}
      onClick={() => run(key, fn)}
      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
    >
      {pending === key ? 'Are you sure?' : label}
    </button>
  )

  return (
    <div className="flex gap-4 flex-wrap">
      {btn('ktc',       'Clear KTC cache',        () => clearCache('ktc-values'))}
      {btn('career',    'Clear season totals',     () => clearCache('season-totals/'))}
      {btn('weekly',    'Clear weekly stats',      () => clearCache('stats/'))}
      {btn('all',       'Clear all cache',         () => clearCache())}
      {btn('datastore', 'Clear data store cache',  async () => { await clearCache('data-store/'); invalidateManifest() })}
    </div>
  )
}
