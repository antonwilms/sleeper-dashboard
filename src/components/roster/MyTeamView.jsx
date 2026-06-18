import { useState } from 'react'
import { PlayerCard } from './PlayerCard'
import { POSITION_ORDER } from '../../constants'

export function MyTeamView({ data, loading, error, projections }) {
  const [sortMode, setSortMode] = useState('thisWeek')  // 'thisWeek' | 'nextSeason'

  if (loading) return <p className="text-gray-500">Loading your team...</p>
  if (error)   return <p className="text-red-600">Error: {error}</p>
  if (!data)   return <p className="text-gray-400 text-sm">Select a league to see your team.</p>
  if (data.noRoster) return <p className="text-gray-400 text-sm">Your account isn't in this league.</p>

  const { team, players, noStatsYet } = data
  // Enrich each player with their projection data
  const enriched = players.map(p => {
    const proj = projections?.[p.id] ?? null
    return {
      ...p,
      projectedPPG:        proj?.projectedPPG ?? null,
      projectedTotalPts:   proj?.projectedTotalPts ?? null,
      projectionConfidence: proj?.confidence ?? null,
    }
  })

  const rosterProjectedTotal = enriched.reduce((sum, p) => sum + (p.projectedTotalPts ?? 0), 0)

  const grouped = Object.fromEntries(POSITION_ORDER.map(p => [p, []]))
  const other = []
  for (const p of enriched) {
    if (grouped[p.position]) grouped[p.position].push(p)
    else other.push(p)
  }
  const sortFn = sortMode === 'nextSeason'
    ? (a, b) => (b.projectedPPG ?? 0) - (a.projectedPPG ?? 0)
    : (a, b) => b.projected - a.projected
  for (const grp of Object.values(grouped)) grp.sort(sortFn)
  other.sort(sortFn)

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-lg">{team.teamName}</div>
          <div className="text-sm text-gray-500">{team.managerName}</div>
        </div>
        {rosterProjectedTotal > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Roster Projected Next Season</div>
            <div className="text-lg font-semibold text-indigo-700 tabular-nums">
              ~{Math.round(rosterProjectedTotal).toLocaleString()} pts
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-gray-400">Sort by:</span>
        {[
          { v: 'thisWeek',   label: 'This week proj' },
          { v: 'nextSeason', label: 'Next season proj' },
        ].map(o => (
          <button key={o.v} onClick={() => setSortMode(o.v)}
            className={`px-2 py-1 rounded transition-colors ${
              sortMode === o.v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      {noStatsYet && (
        <p className="text-sm text-amber-600 mb-4 bg-amber-50 px-3 py-2 rounded">
          Season hasn't started yet — historical stats unavailable.
        </p>
      )}
      {!noStatsYet && (
        <div className="flex gap-4 text-xs text-gray-400 mb-2 px-3">
          <span className="w-44">Player</span>
          <span className="w-14 text-right">Proj</span>
          <span className="w-14 text-right">Last Wk</span>
          <span className="w-14 text-right">4Wk Avg</span>
          <span>Trend</span>
        </div>
      )}
      <div className="space-y-6">
        {[...POSITION_ORDER.map(pos => ({ pos, players: grouped[pos] })), { pos: 'Other', players: other }]
          .filter(({ players: grp }) => grp.length > 0)
          .map(({ pos, players: grp }) => (
            <div key={pos}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{pos}</div>
              <div className="space-y-1">
                {grp.map(p => <PlayerCard key={p.id} player={p} noStats={noStatsYet} />)}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
