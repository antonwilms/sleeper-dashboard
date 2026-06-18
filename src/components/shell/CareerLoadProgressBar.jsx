export function CareerLoadProgressBar({ progress }) {
  if (!progress?.active) return null
  const pct = progress.totalSeasons > 0
    ? Math.min(100, Math.round((progress.seasonsComplete / progress.totalSeasons) * 100))
    : 0

  if (progress.done) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white px-6 py-3 z-50">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex-1 bg-gray-700 rounded h-1"><div className="bg-blue-400 h-1 rounded w-full" /></div>
          <span className="text-green-400 text-sm font-medium whitespace-nowrap">Career history ready ✓</span>
        </div>
      </div>
    )
  }

  const seasonDisplay = Math.min(progress.seasonsComplete + 1, progress.totalSeasons)
  const weekLine = progress.cached ? 'Cached ✓' : progress.currentWeek > 0 ? `Week ${progress.currentWeek} of 18` : 'Starting…'

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white px-6 py-3 z-50">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between mb-2 text-xs">
          <span>
            Loading career history —{' '}
            <span className="text-white font-medium">{progress.currentSeason}</span>
            <span className="text-gray-400"> (season {seasonDisplay} of {progress.totalSeasons})</span>
          </span>
          <span className={progress.cached ? 'text-green-400' : 'text-gray-400'}>{weekLine}</span>
        </div>
        <div className="w-full bg-gray-700 rounded h-1">
          <div className="bg-blue-400 h-1 rounded transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
