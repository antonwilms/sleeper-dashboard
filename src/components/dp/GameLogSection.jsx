import { useMemo, useCallback } from 'react'
import { DegradedBlock } from './DegradedBlock'
import { resolvePlayerTeam } from '../../utils/playerTeam'
import { buildGameLogRows, GAME_LOG_COLUMNS } from '../../utils/gameLog'

// dp-v2 Slice 4a. Byes/DNPs come from careerStats[...].weeklyStatus, already classified at load
// time — never a schedule scan (task file §3.4: that derivation is circular, since the week-grain
// team join reads gamelogs, which is exactly the row absent on a bye).
export function GameLogSection({ careerStats, gameLogsResult, scheduleResult, playerId, position, season, playerName, isRookie }) {
  const familyReady = gameLogsResult?.complete === true && scheduleResult?.complete === true
  const gameLogPlayers = gameLogsResult?.players
  const playerGames = useMemo(() => gameLogPlayers?.[playerId]?.games ?? [], [gameLogPlayers, playerId])
  const hasPlayerGames = playerGames.length > 0

  const gamesByWeek = useMemo(() => new Map(playerGames.map(g => [g.week, g])), [playerGames])

  // Week grain first (era-remapped from the gamelogs row's own team field — correct even across
  // a mid-season trade); falls back to the season-grain (already era-accurate) team for weeks
  // with no gamelogs row, e.g. a did-not-play week.
  const resolveTeam = useCallback((week) => (
    resolvePlayerTeam({ careerStats, gameLogPlayers }, playerId, season, week)
      ?? resolvePlayerTeam({ careerStats }, playerId, season)
  ), [careerStats, gameLogPlayers, playerId, season])

  const seasonData = careerStats?.[season]?.[playerId]

  const rows = useMemo(() => {
    if (!familyReady || !hasPlayerGames) return []
    return buildGameLogRows({
      position,
      weeklyStatus: seasonData?.weeklyStatus,
      weeklyPoints: seasonData?.weeklyPoints,
      gamesByWeek,
      scheduleGames: scheduleResult?.games ?? [],
      resolveTeam,
    })
  }, [familyReady, hasPlayerGames, position, seasonData, gamesByWeek, scheduleResult, resolveTeam])

  if (!familyReady) {
    // Some rows already landed (rowCount > 0) but the family didn't clear its sparsity floor —
    // a season still accruing week by week. Nothing landed at all — a gap the family doesn't
    // cover (e.g. the known 2019 nflverse absence), or the store is unavailable.
    const kind = ((gameLogsResult?.rowCount ?? 0) > 0 || (scheduleResult?.rowCount ?? 0) > 0)
      ? 'not-yet-accruing' : 'not-measured-then'
    return (
      <DegradedBlock kind={kind}>
        Game log for {season ?? 'this season'} isn&apos;t available{playerName ? ` for ${playerName}` : ''}.
      </DegradedBlock>
    )
  }

  if (!hasPlayerGames) {
    return (
      <DegradedBlock kind={isRookie ? 'not-yet-accruing' : 'not-measured-then'}>
        No recorded games for {playerName ?? 'this player'} in {season}.
      </DegradedBlock>
    )
  }

  const cols = GAME_LOG_COLUMNS[position] ?? GAME_LOG_COLUMNS.WR
  const totalCols = 7 + cols.length + 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-dp-mono border-collapse">
        <thead>
          <tr className="text-dp-muted text-left">
            <th className="pr-2 py-1 font-normal">WK</th>
            <th className="pr-2 py-1 font-normal">OPP</th>
            <th className="pr-2 py-1 font-normal">RESULT</th>
            <th className="pr-2 py-1 font-normal">SPREAD</th>
            <th className="pr-2 py-1 font-normal">TOTAL</th>
            <th className="pr-2 py-1 font-normal">ROOF</th>
            <th className="pr-3 py-1 font-normal border-r border-dp-border">WEATHER</th>
            {cols.map(c => <th key={c.id} className="pr-2 py-1 font-normal text-right">{c.label}</th>)}
            <th className="pl-3 py-1 font-normal text-right">PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => r.kind === 'bye' ? (
            <tr key={`REG-${r.week}`} className="border-t border-dp-border">
              <td colSpan={totalCols} className="py-1.5 text-dp-muted-2 text-center">
                WK {r.week} · BYE — no row exists in the source. Not a zero.
              </td>
            </tr>
          ) : (
            <tr key={`${r.seasonType}-${r.week}`} className="border-t border-dp-border text-dp-text-2">
              <td className="pr-2 py-1">{r.seasonType === 'POST' ? (r.roundLabel ?? 'POST') : r.week}</td>
              <td className="pr-2 py-1">{r.opponent ?? '—'}</td>
              <td className="pr-2 py-1">{r.resultText}</td>
              <td className="pr-2 py-1">{r.spread != null ? r.spread.toFixed(1) : '—'}</td>
              <td className="pr-2 py-1">{r.total != null ? r.total.toFixed(1) : '—'}</td>
              <td className="pr-2 py-1">{r.roof ?? '—'}</td>
              <td className="pr-3 py-1 border-r border-dp-border">{r.weather}</td>
              {r.production.map((v, i) => <td key={i} className="pr-2 py-1 text-right">{v}</td>)}
              <td className="pl-3 py-1 text-right font-semibold text-dp-text">{r.pts != null ? r.pts.toFixed(1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
