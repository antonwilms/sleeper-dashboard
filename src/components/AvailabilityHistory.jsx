import { useMemo } from 'react'
import Tooltip from './Tooltip'
import { findInjuryForWeek } from '../utils/enrichmentLookup'

const STATUS_COLOR = {
  P: 'bg-green-500',
  D: 'bg-red-500',
  B: 'bg-gray-300',
  X: 'bg-transparent border border-gray-200',
}
const STATUS_LABEL = {
  P: 'Played',
  D: 'DNP',
  B: 'Bye',
  X: 'Absent',
}

export default function AvailabilityHistory({ careerStats, playerId, enrichmentMap }) {
  // Pre-2021 NFL had 17 regular-season weeks. For seasons where every player shows
  // 'X' at week 18, hide that cell from the sparkline. Computed once per careerStats.
  const seasonsHidingW18 = useMemo(() => {
    const result = {}
    if (!careerStats) return result
    for (const [season, seasonData] of Object.entries(careerStats)) {
      let hide = true
      for (const p of Object.values(seasonData)) {
        if (Array.isArray(p.weeklyStatus) && p.weeklyStatus.length >= 18 && p.weeklyStatus[17] !== 'X') {
          hide = false
          break
        }
      }
      result[season] = hide
    }
    return result
  }, [careerStats])

  if (!careerStats) return null

  const rows = Object.keys(careerStats)
    .map(Number)
    .sort((a, b) => b - a)
    .map(season => {
      const data = careerStats[season]?.[playerId]
      if (!data) return null
      return { season, data }
    })
    .filter(Boolean)

  if (rows.length === 0) return null

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Availability History</h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b">
            <th className="pb-1.5 text-left font-medium">Season</th>
            <th className="pb-1.5 text-right font-medium">GP</th>
            <th className="pb-1.5 text-right font-medium">DNP</th>
            <th className="pb-1.5 text-right font-medium">Longest</th>
            <th className="pb-1.5 text-right font-medium">Returned?</th>
            <th className="pb-1.5 text-left font-medium pl-3">Week-by-week</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ season, data }) => {
            const weeklyStatus = Array.isArray(data.weeklyStatus) ? data.weeklyStatus : null
            const hideW18 = seasonsHidingW18[season] ?? false
            const visibleStatus = weeklyStatus
              ? (hideW18 ? weeklyStatus.slice(0, 17) : weeklyStatus)
              : null
            const longest = data.availability?.longestAbsence ?? null
            const returned = data.availability?.returnedFromAbsence ?? null
            return (
              <tr key={season} className="border-b hover:bg-gray-50">
                <td className="py-1.5 text-gray-700 font-medium">{season}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-700">{data.gamesPlayed ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-700">{data.dnpWeeks ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-700">
                  {longest != null ? longest : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-1.5 text-right">
                  {returned == null
                    ? <span className="text-gray-300">—</span>
                    : returned
                      ? <span className="text-green-600">✓</span>
                      : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-1.5 pl-3">
                  {visibleStatus
                    ? <Sparkline
                        weeklyStatus={visibleStatus}
                        playerId={playerId}
                        season={season}
                        enrichmentMap={enrichmentMap}
                      />
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Sparkline({ weeklyStatus, playerId, season, enrichmentMap }) {
  return (
    <div className="inline-flex gap-0.5">
      {weeklyStatus.map((code, i) => {
        const week = i + 1
        let tooltipText

        if (code === 'D') {
          const hit = findInjuryForWeek(enrichmentMap?.injuries, playerId, season, week)
          if (hit) {
            const typ = hit.type ?? 'injury'
            const sev = hit.severity ? ` (${hit.severity})` : ''
            tooltipText = `W${week}: DNP — ${typ}${sev}`
          } else {
            tooltipText = `W${week}: DNP`
          }
        } else {
          tooltipText = `W${week}: ${STATUS_LABEL[code] ?? code}`
        }

        return (
          <Tooltip key={i} content={tooltipText} position="top">
            <span className={`inline-block w-2 h-3 rounded-sm ${STATUS_COLOR[code] ?? STATUS_COLOR.X}`} />
          </Tooltip>
        )
      })}
    </div>
  )
}

