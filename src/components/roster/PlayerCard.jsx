import { Sparkline } from './Sparkline'

export function PlayerCard({ player, noStats }) {
  const isStarter = player.slot === 'Starter'
  const isIR = player.slot === 'IR'
  const confColor = ({
    high:   'bg-indigo-100 text-indigo-700',
    medium: 'bg-blue-50 text-blue-700',
    low:    'bg-gray-100 text-gray-500',
    rookie: 'bg-purple-50 text-purple-700',
  })[player.projectionConfidence] ?? 'bg-gray-100 text-gray-400'
  return (
    <div className={`py-2 px-3 rounded text-sm ${isStarter ? 'border-l-4 border-green-400 bg-green-50' : isIR ? 'bg-gray-50 opacity-70' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="w-44 min-w-0">
          <div className="font-medium truncate">
            {player.full_name ?? player.id}
            {isIR && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">IR</span>}
          </div>
          <div className="text-xs text-gray-400">{player.team ?? 'FA'}{player.age != null && ` · Age ${player.age}`}</div>
        </div>
        <div className="text-right w-14">
          <div className="font-medium">{player.projected.toFixed(1)}</div>
          <div className="text-xs text-gray-400">proj</div>
        </div>
        {!noStats && (
          <>
            <div className="text-right w-14">
              <div className="font-medium">{player.lastWeekPts != null ? player.lastWeekPts.toFixed(1) : '—'}</div>
              <div className="text-xs text-gray-400">last wk</div>
            </div>
            <div className="text-right w-14">
              <div className="font-medium">{player.avg != null ? player.avg.toFixed(1) : '—'}</div>
              <div className="text-xs text-gray-400">4wk avg</div>
            </div>
            <Sparkline values={player.last4} />
          </>
        )}
      </div>
      {player.projectedPPG != null && (
        <div className="flex items-center gap-2 mt-1 ml-0 pl-0 text-xs text-gray-500">
          <span>Next season: <span className="font-medium text-gray-700 tabular-nums">~{player.projectedPPG.toFixed(1)} PPG</span> · <span className="tabular-nums">~{Math.round(player.projectedTotalPts ?? 0)} pts</span></span>
          {player.projectionConfidence && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${confColor}`}>
              {player.projectionConfidence}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
