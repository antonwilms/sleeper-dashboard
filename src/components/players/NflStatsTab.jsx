import { useCallback, useMemo, useState, useEffect } from 'react'
import { SortTh } from '../PlayersTab'
import { ExpandableTableRow, ExpandChevron } from '../ui/ExpandableTableRow'
import { loadNflSchedule } from '../../api/nflSchedule'
import { computeSeasonAverages, buildGameLog, computeHighLow } from '../../utils/nflStats'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { PlayersDataTable } from './PlayersDataTable'

// Column descriptor: key = computeSeasonAverages field, fmt ∈ perGame|int|pct|ratio
const COLUMNS = {
  QB: [
    { key: 'compPct',    label: 'Cmp%',      fmt: 'pct'     },
    { key: 'passYdPerG', label: 'Pass Yd/G',  fmt: 'perGame' },
    { key: 'passTd',     label: 'Pass TD',    fmt: 'int'     },
    { key: 'passInt',    label: 'INT',        fmt: 'int'     },
    { key: 'rushYdPerG', label: 'Rush Yd/G',  fmt: 'perGame' },
    { key: 'rushTd',     label: 'Rush TD',    fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  RB: [
    { key: 'rushAtt',    label: 'Rush Att',   fmt: 'int'     },
    { key: 'rushYdPerG', label: 'Rush Yd/G',  fmt: 'perGame' },
    { key: 'rushTd',     label: 'Rush TD',    fmt: 'int'     },
    { key: 'tgt',        label: 'Tgt',        fmt: 'int'     },
    { key: 'rec',        label: 'Rec',        fmt: 'int'     },
    { key: 'recYdPerG',  label: 'Rec Yd/G',   fmt: 'perGame' },
    { key: 'recTd',      label: 'Rec TD',     fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  WR: [
    { key: 'tgt',        label: 'Tgt',        fmt: 'int'     },
    { key: 'rec',        label: 'Rec',        fmt: 'int'     },
    { key: 'catchPct',   label: 'Catch%',     fmt: 'pct'     },
    { key: 'recYdPerG',  label: 'Rec Yd/G',   fmt: 'perGame' },
    { key: 'ypr',        label: 'Y/R',        fmt: 'ratio'   },
    { key: 'recTd',      label: 'Rec TD',     fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  ALL: [
    { key: 'totalYdPerG', label: 'Yds/G', fmt: 'perGame' },
    { key: 'totalTd',     label: 'TD',    fmt: 'int'     },
    { key: 'fpPerG',      label: 'FP/G',  fmt: 'perGame' },
  ],
}
COLUMNS.TE = COLUMNS.WR

const fmtCell = (v, kind) =>
  v == null ? '—'
  : kind === 'pct'     ? `${Math.round(v)}%`
  : kind === 'int'     ? `${v}`
  : v.toFixed(1)  // perGame | ratio

// ---------------------------------------------------------------------------
// GameLogPanel — in-file sub-component
// ---------------------------------------------------------------------------
function GameLogPanel({ playerId, playerTeam, availableSeasons, season, onSeasonChange, careerStats, scheduleEntry, onNeedSeason }) {
  useEffect(() => {
    onNeedSeason(season)
  }, [season, onNeedSeason])

  const sd = careerStats?.[season]?.[playerId]
  const noGames = !sd || sd.gamesPlayed === 0

  const { rows, scheduleLoaded, teamConsistent } = noGames
    ? { rows: [], scheduleLoaded: false, teamConsistent: true }
    : buildGameLog({
        playerTeam,
        season,
        weeklyPoints: sd.weeklyPoints,
        weeklyStatus: sd.weeklyStatus,
        scheduleGames: scheduleEntry?.loaded ? scheduleEntry.games : [],
      })

  const hl = noGames ? null : computeHighLow(rows)

  // Note priority: loading > unavailable > team-change
  let note = null
  if (!noGames) {
    if (scheduleEntry?.loading) {
      note = 'Loading schedule…'
    } else if (!scheduleLoaded) {
      note = `Schedule unavailable for ${season} — matchup details hidden.`
    } else if (scheduleLoaded && !teamConsistent) {
      note = `Couldn't verify ${playerTeam}'s ${season} schedule — matchup details hidden (possible team change).`
    }
  }

  function oppDisplay(row) {
    if (row.status === 'B') return 'BYE'
    if (!row.opponent) return '—'
    return row.homeAway === 'away' ? `@${row.opponent}` : `vs ${row.opponent}`
  }

  function resultDisplay(row) {
    if (!row.result) return <span className="text-[var(--color-text-faintest)]">—</span>
    const cls = row.result === 'W'
      ? 'text-[var(--color-positive-text)]'
      : row.result === 'L' ? 'text-[var(--color-negative-text)]' : ''
    return (
      <>
        <span className={cls}>{row.result}</span>
        {row.score && <span className="text-[var(--color-text-faintest)] ml-1">{row.score}</span>}
      </>
    )
  }

  function fpDisplay(row) {
    if (row.status === 'B') return '—'
    if (row.status === 'D') return <span className="text-[var(--color-text-faintest)]">DNP</span>
    return row.fantasyPoints != null ? row.fantasyPoints.toFixed(1) : '—'
  }

  // For High/Low display, find homeAway from the rows for the vs/@ prefix
  const highRow = hl ? rows.find(r => r.week === hl.high.week) : null
  const lowRow  = hl ? rows.find(r => r.week === hl.low.week)  : null
  const fmtHLOpp = (row, h) => h.opponent
    ? (row?.homeAway === 'away' ? `@${h.opponent}` : `vs ${h.opponent}`)
    : '—'

  return (
    <div className="text-xs">
      {/* Season select / label + note */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {availableSeasons.length > 1 ? (
          <select
            value={season}
            onChange={e => onSeasonChange(playerId, Number(e.target.value))}
            className="bg-[var(--color-surface-3)] text-[var(--color-text)] border border-[var(--color-border)] rounded px-2 py-0.5"
          >
            {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className="text-[var(--color-text-muted)] font-medium">{season}</span>
        )}
        {note && <span className="text-[var(--color-text-faint)] italic">{note}</span>}
      </div>

      {noGames ? (
        <p className="text-[var(--color-text-faint)]">No games played in {season}.</p>
      ) : (
        <>
          {/* High / Low summary */}
          {hl && (
            <div className="mb-2 flex gap-2 flex-wrap text-xs">
              <span className="text-[var(--color-positive-text)]">
                High {hl.high.fantasyPoints.toFixed(1)} (W{hl.high.week} {fmtHLOpp(highRow, hl.high)})
              </span>
              <span className="text-[var(--color-text-faintest)]">·</span>
              <span className="text-[var(--color-negative-text)]">
                Low {hl.low.fantasyPoints.toFixed(1)} (W{hl.low.week} {fmtHLOpp(lowRow, hl.low)})
              </span>
            </div>
          )}

          {/* Game-log table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--color-text-faint)] border-b">
                <th className="pb-1 text-left font-medium">Wk</th>
                <th className="pb-1 text-left font-medium">Opp</th>
                <th className="pb-1 text-left font-medium">Result</th>
                <th className="pb-1 text-right font-medium tabular-nums">FP</th>
                <th className="pb-1 text-right font-medium tabular-nums">Spread</th>
                <th className="pb-1 text-right font-medium tabular-nums">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.week}
                    className={`border-b ${row.status === 'B' ? 'text-[var(--color-text-faintest)]' : 'hover:bg-[var(--color-surface-3)]'}`}>
                  <td className="py-1 tabular-nums">{row.week}</td>
                  <td className="py-1">{oppDisplay(row)}</td>
                  <td className="py-1">{resultDisplay(row)}</td>
                  <td className="py-1 text-right tabular-nums">{fpDisplay(row)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {row.spread == null ? '—' : row.spread.toFixed(1)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{row.total ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

const DEFAULT_SORT = { column: 'fpPerG', direction: 'desc' }

// ---------------------------------------------------------------------------
// NflStatsTab
// ---------------------------------------------------------------------------
export function NflStatsTab({
  playerRows, loaded, careerStats, playerMap,
  positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
  enrichmentMap, advStats, comparisonList, addToComparison, removeFromComparison,
}) {
  const { posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
          handlePosFilter, toggleExpanded, setPage, setSelectedPlayerId } =
    usePlayersTable({ storageKey: 'nflstats-sort', defaultSort: DEFAULT_SORT })

  // Table-level season: init from localStorage (validated against allSeasons below)
  const [tableSeason, setTableSeasonRaw] = useState(() => {
    try {
      const v = Number(localStorage.getItem('nflstats-season'))
      if (Number.isInteger(v) && v > 1990) return v
    } catch { /* fall through */ }
    return null
  })
  const setTableSeason = useCallback(v => {
    setTableSeasonRaw(v)
    localStorage.setItem('nflstats-season', String(v))
    setPage(1)
  }, [setPage])

  const [logSeasonById, setLogSeasonById] = useState({})
  const [scheduleByYear, setScheduleByYear] = useState({})

  // Seasons derived from careerStats
  const latestSeason = useMemo(() => {
    const k = Object.keys(careerStats ?? {}).map(Number)
    return k.length ? Math.max(...k) : null
  }, [careerStats])

  const allSeasons = useMemo(() =>
    Object.keys(careerStats ?? {}).map(Number).sort((a, b) => b - a),
    [careerStats]
  )

  // Effective season: stored value if still in allSeasons, else latestSeason
  const activeSeason = (tableSeason != null && allSeasons.includes(tableSeason))
    ? tableSeason
    : latestSeason

  // Enrich each row with season averages for the selected season
  const enrichedRows = useMemo(() =>
    (playerRows ?? []).map(r => ({
      ...r,
      _avg: computeSeasonAverages(careerStats?.[activeSeason]?.[r.player_id], r.position),
    })),
    [playerRows, careerStats, activeSeason]
  )

  // Filter → sort (nulls always sink)
  const displayRows = useMemo(() => {
    let rows = enrichedRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)
    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const key = sortState.column
      if (key === 'full_name') {
        const va = a.full_name ?? ''
        const vb = b.full_name ?? ''
        return dir * va.localeCompare(vb)
      }
      const va = a._avg[key] ?? null
      const vb = b._avg[key] ?? null
      if (va == null && vb == null) return 0
      if (va == null) return 1   // null sinks regardless of direction
      if (vb == null) return -1
      return dir * (va - vb)
    })
  }, [enrichedRows, posFilter, sortState])

  // Lazy schedule loader (StrictMode-safe: cancelled flag prevents double state-write)
  const ensureSchedule = useCallback((year) => {
    if (year == null) return
    setScheduleByYear(prev =>
      prev[year] ? prev : { ...prev, [year]: { games: [], loaded: false, loading: true } }
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    const pending = Object.entries(scheduleByYear).filter(([, v]) => v.loading && !v.loaded)
    if (!pending.length) return
    for (const [year] of pending) {
      loadNflSchedule(Number(year)).then(res => {
        if (cancelled) return
        setScheduleByYear(prev => ({
          ...prev,
          [year]: { games: res.games ?? [], loaded: true, loading: false },
        }))
      })
    }
    return () => { cancelled = true }
  }, [scheduleByYear])

  const cols = COLUMNS[posFilter] ?? COLUMNS.ALL
  const colSpan = 3 + cols.length

  return (
    <PlayersDataTable
      posFilter={posFilter}
      onPosFilter={handlePosFilter}
      pillRowClassName="flex flex-wrap gap-1 mb-4 items-center"
      toolbar={
        allSeasons.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            Season averages:
            <select
              value={activeSeason ?? ''}
              onChange={e => setTableSeason(Number(e.target.value))}
              className="bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border)] rounded px-2 py-0.5 text-sm"
            >
              {allSeasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )
      }
      loaded={loaded}
      tableClassName="table-auto"
      colSpan={colSpan}
      header={<>
        <th className="py-2 px-2" />
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="G" col="games" {...sortProps} />
        {cols.map(c => (
          <SortTh key={c.key} label={c.label} col={c.key} tooltip={c.tooltip} {...sortProps} />
        ))}
      </>}
      displayRows={displayRows}
      page={page}
      onPageChange={setPage}
      renderRow={row => {
        const id = row.player_id
        const playerSeasons = allSeasons.filter(yr =>
          (careerStats?.[yr]?.[id]?.gamesPlayed ?? 0) > 0
        )
        const defaultLogSeason = playerSeasons.includes(activeSeason)
          ? activeSeason
          : (playerSeasons[0] ?? activeSeason)
        const logSeason = logSeasonById[id] ?? defaultLogSeason

        return (
          <ExpandableTableRow
            key={id}
            expanded={expanded.has(id)}
            colSpan={colSpan}
            onRowClick={() => setSelectedPlayerId(id)}
            detail={
              <GameLogPanel
                playerId={id}
                playerTeam={row.nfl_team}
                position={row.position}
                availableSeasons={playerSeasons}
                season={logSeason}
                onSeasonChange={(pid, s) => setLogSeasonById(prev => ({ ...prev, [pid]: s }))}
                careerStats={careerStats}
                scheduleEntry={scheduleByYear[logSeason]}
                onNeedSeason={ensureSchedule}
              />
            }
          >
            {/* Chevron — stop-propagation so it doesn't open the profile */}
            <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
              <ExpandChevron
                expanded={expanded.has(id)}
                onClick={() => toggleExpanded(id)}
              />
            </td>

            {/* Player */}
            <td className="py-2 px-3 min-w-0">
              <div className="font-medium truncate">{row.full_name}</div>
              <div className="text-xs text-[var(--color-text-faint)] truncate">
                <span className="font-medium text-[var(--color-text-muted)]">{row.position}</span>
                {row.age != null && <> · {row.age}</>}
                {' · '}
                {row.nfl_team && row.nfl_team !== 'FA'
                  ? <span>{row.nfl_team}</span>
                  : <span className="text-[var(--color-text-faint)]">FA</span>}
                {row.years_exp != null && <> · {row.years_exp}yr</>}
              </div>
            </td>

            {/* G */}
            <td className="py-2 px-3 text-right tabular-nums">
              {row._avg.games > 0
                ? row._avg.games
                : <span className="text-[var(--color-text-faintest)]">—</span>}
            </td>

            {/* Per-position stat columns */}
            {cols.map(c => (
              <td key={c.key} className="py-2 px-3 text-right whitespace-nowrap tabular-nums">
                {fmtCell(row._avg[c.key], c.fmt)}
              </td>
            ))}
          </ExpandableTableRow>
        )
      }}
      selectedPlayerId={selectedPlayerId}
      onCloseProfile={() => setSelectedPlayerId(null)}
      onSelectPlayer={setSelectedPlayerId}
      profileContextValue={{
        careerStats, playersMap: playerMap, playerRows,
        positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
        enrichmentMap, advStats,
      }}
      comparisonList={comparisonList}
      addToComparison={addToComparison}
      removeFromComparison={removeFromComparison}
    />
  )
}
