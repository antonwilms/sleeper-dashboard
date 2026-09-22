// weekly-decision-2-panels.md §4 — team-context, week grain, for every team the user owns a
// player on. Reuses `buildTeamMetricsTable` (the same call Portfolio's `TeamOffences.jsx` makes)
// for five of the six columns — never exports, calls or edits `sumRegOff`/`sumRegDef`/
// `OFF_SUM_FIELDS` (CR-23). Presentational except its own memo, which does the CR-16 team-code hop
// and the single-week MARGIN lookup.

import { useMemo } from 'react'
import { buildTeamMetricsTable } from '../../utils/environment'
import { getTeamSeasonRows, getTeamWeekRow } from '../../api/teamContext'
import { normalizeTeamForSchedule } from '../../utils/nflStats'

const MINUS = '−'
const signed = (v, digits) => `${v >= 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}`
const fmtPct = v => `${v >= 0 ? '+' : MINUS}${Math.abs(v * 100).toFixed(1)}%`

function Num({ value, format }) {
  if (value == null) return <span className="text-dp-muted">—</span>
  return <span className="font-dp-mono text-dp-text">{format(value)}</span>
}

// The latest REG week at or before `currentWeek - 1` for which `eraTeam` has a teamcontext row —
// per team, because byes differ.
function latestKnownWeek(loaded, eraTeam, currentWeek) {
  const games = getTeamSeasonRows(loaded, eraTeam) ?? []
  let latest = null
  for (const g of games) {
    if (g.seasonType !== 'REG') continue
    if (g.week > currentWeek - 1) continue
    if (latest == null || g.week > latest) latest = g.week
  }
  return latest
}

export function OffencesOwned({ starters = [], bench = [], liveTeamContext = null, currentWeek = 0 }) {
  const teams = useMemo(() => {
    const seen = new Set()
    const order = []
    for (const r of [...starters, ...bench]) {
      if (!r.team || r.team === 'FA') continue
      if (seen.has(r.team)) continue
      seen.add(r.team)
      order.push(r.team)
    }
    return order
  }, [starters, bench])

  const rows = useMemo(() => {
    if (!liveTeamContext?.complete) return []
    const metricsTable = buildTeamMetricsTable(liveTeamContext)
    return teams.map(team => {
      // Roster teams are the Sleeper domain (LAR); teamcontext is keyed era-accurate (LA) — CR-16.
      const eraTeam = normalizeTeamForSchedule(team)
      const m = metricsTable[eraTeam] ?? null
      const n = latestKnownWeek(liveTeamContext, eraTeam, currentWeek)
      const weekRow = n != null ? getTeamWeekRow(liveTeamContext, eraTeam, n) : null
      const pointsScored = weekRow?.off?.pointsScored
      const pointsAllowed = weekRow?.def?.pointsAllowed
      const margin = pointsScored != null && pointsAllowed != null ? pointsScored - pointsAllowed : null
      return {
        team, eraTeam, n, margin,
        proe: m?.proe ?? null,
        pace: m?.pace ?? null,
        epaPerPlay: m?.epaPerPlay ?? null,
        playsPerGame: m?.playsPerGame ?? null,
        rzTripsPerGame: m?.rzTripsPerGame ?? null,
      }
    })
  }, [teams, liveTeamContext, currentWeek])

  return (
    <div data-testid="offences-owned" className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
      <div className="flex items-baseline gap-2.5 px-[18px] py-3 border-b border-dp-border-row flex-wrap">
        <span className="text-[13px] font-semibold text-dp-text-strong">Offences you own</span>
      </div>

      {!liveTeamContext?.complete ? (
        // PROVISIONAL(no-data): team-context figures · a null manifest entry covers three distinct
        // causes (file missing, store disabled, or manifest fetch failed) that loadTeamContext does
        // not distinguish · a served, above-floor nflverse/teamcontext/<liveSeason>.json would fill this
        <div className="px-[18px] py-8 text-center text-dp-muted text-[12.5px]">
          Team-context figures aren&rsquo;t available for this data source right now.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-dp-card-quiet">
                <th className="text-left px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted">TEAM</th>
                <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">PROE</th>
                <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">PACE</th>
                <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">OFF EPA</th>
                <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">PLAYS/G</th>
                <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">RZ TRIPS</th>
                <th className="text-right px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">WEEK MARGIN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.team} data-testid={`offences-owned-${r.team}`} className="border-t border-dp-border-row">
                  <td className="px-[18px] py-2.5 font-dp-mono font-semibold text-dp-text">{r.eraTeam}</td>
                  <td className="px-2.5 py-2.5 text-right"><Num value={r.proe} format={fmtPct} /></td>
                  <td className="px-2.5 py-2.5 text-right"><Num value={r.pace} format={v => v.toFixed(1)} /></td>
                  <td className="px-2.5 py-2.5 text-right"><Num value={r.epaPerPlay} format={v => signed(v, 3)} /></td>
                  <td className="px-2.5 py-2.5 text-right"><Num value={r.playsPerGame} format={v => v.toFixed(1)} /></td>
                  <td className="px-2.5 py-2.5 text-right"><Num value={r.rzTripsPerGame} format={v => v.toFixed(2)} /></td>
                  <td className="px-[18px] py-2.5 text-right">
                    {r.n == null
                      ? <span className="text-dp-muted">—</span>
                      : (
                        <span className="font-dp-mono text-dp-text">
                          <span className="text-dp-muted text-[10px] mr-1">WK {r.n}</span>
                          <Num value={r.margin} format={v => signed(v, 1)} />
                        </span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed">
        Single-season values, not yet blended against a prior season the way ALLOWS is — the design's
        cited pace/PROE year-over-year stability (r .62 / .45) is the design's own claim, not a figure
        reproduced from anything in this repo. WEEK MARGIN is one game (points scored minus points
        allowed that week), the closest available proxy for time spent leading or trailing, which no
        field here carries directly.
      </div>
    </div>
  )
}
