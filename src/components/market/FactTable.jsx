// View-only. The descriptor-driven table for Market's fact views (Overview / Stats / Usage). No TREND
// gutter, no per-view branches — every column, label, value and sort key comes from factViews.js.
// Window stats and ranks arrive as props; this file builds none of them.
import { useCallback, useMemo } from 'react'
import { MarketTable } from '../dp/MarketTable'
import { SortTh, PlayerCell, ClickableRow } from '../dp/cells'
import { compareNullsLast } from '../../utils/sortUtils'
import { factColumns, factCellValue, factCellRank } from './factViews'

const MUTED_TOOLTIP = 'Market and model reference — not a window stat'

export function FactTable({
  view, posFilter, onPosFilter, loaded, rows, page, onPageChange, sortState, onSortChange, windowKind,
  statsMode, windowStats, ranks, prevRanks, prevSeason, myTeamName, onOpenPlayerDetail, filterBar,
}) {
  const columns = useMemo(
    () => factColumns(view, posFilter, { windowKind, statsMode }),
    [view, posFilter, windowKind, statsMode]
  )
  const ctx = useCallback(row => ({
    ws: windowStats?.get(row.player_id) ?? null,
    ext: { prevRank: prevRanks?.[row.player_id]?.fpPerG ?? null },
  }), [windowStats, prevRanks])

  const sorted = useMemo(() => {
    const dir = sortState.direction === 'asc' ? 1 : -1
    const key = sortState.column
    if (key === 'full_name') return [...rows].sort((a, b) => compareNullsLast(a.full_name, b.full_name, dir))
    const col = columns.find(c => c.id === key)
    if (!col) return rows
    const val = row => {
      const { ws, ext } = ctx(row)
      return factCellValue(col, row, ws, ext)
    }
    return [...rows].sort((a, b) => compareNullsLast(val(a), val(b), dir))
  }, [rows, columns, sortState, ctx])

  const handleSort = id => {
    const def = id === 'full_name' ? 'asc' : (columns.find(c => c.id === id)?.defaultSortDir ?? 'desc')
    onSortChange(prev => prev.column === id
      ? { column: id, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { column: id, direction: def })
    onPageChange(1)
  }
  const sortProps = { sortKey: sortState.column, sortAsc: sortState.direction === 'asc', onSort: handleSort }

  const tooltipFor = c => {
    if (c.id === 'prevFpPerGRank') {
      return prevSeason != null ? `FP/G position rank in ${prevSeason}` : 'FP/G position rank in the prior season'
    }
    return c.muted ? MUTED_TOOLTIP : undefined
  }

  const header = (
    <>
      <SortTh label="Player" col="full_name" {...sortProps} />
      {columns.map(c => (
        <SortTh key={c.id} label={c.label} col={c.id} align={c.align} tooltip={tooltipFor(c)} {...sortProps} />
      ))}
    </>
  )

  const renderRow = row => {
    const { ws, ext } = ctx(row)
    return (
      <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
        <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
        {columns.map(c => {
          if (c.cell === 'owner') {
            return (
              <td key={c.id} className="px-[18px] py-3 text-[12px]">
                <span className={row.ownerTeamName != null && row.ownerTeamName === myTeamName ? 'text-dp-up-text' : 'text-dp-text-2'}>
                  {row.ownerTeamName ?? 'Unowned'}
                </span>
              </td>
            )
          }
          const v = factCellValue(c, row, ws, ext)
          const rank = v == null ? null : factCellRank(c, ws, ranks)
          const cls = `px-3 py-3 whitespace-nowrap font-dp-mono text-[13px] ${c.align === 'left' ? '' : 'text-right'} ${c.muted ? 'text-dp-muted' : 'text-dp-text'}`
          return (
            <td key={c.id} className={cls}>
              {v == null ? <span className="text-dp-muted text-xs">—</span> : (
                <>
                  {c.metric ? c.metric.format(v) : c.format(v)}
                  {rank && (
                    <span className="ml-1 text-[11px] text-dp-muted" title={`#${rank.rank} of ${rank.of} ${ws.position}s`}>#{rank.rank}</span>
                  )}
                </>
              )}
            </td>
          )
        })}
      </ClickableRow>
    )
  }

  const label = sortState.column === 'full_name' ? 'player'
    : (columns.find(c => c.id === sortState.column)?.label.toLowerCase() ?? sortState.column)

  return (
    <MarketTable
      posFilter={posFilter} onPosFilter={onPosFilter} loaded={loaded} header={header}
      colSpan={1 + columns.length} displayRows={sorted} page={page} onPageChange={onPageChange}
      renderRow={renderRow} activeColumnLabel={label} filterBar={filterBar}
    />
  )
}
