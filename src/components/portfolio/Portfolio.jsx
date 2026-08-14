import { useEffect, useMemo } from 'react'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { SortTh, PlayerCell, ClickableRow, CareerBars, DeltaCell } from '../dp/cells'
import { compareNullsLast } from '../../utils/sortUtils'

// Portfolio (1b Slice iv) — the thinned Portfolio screen: header, four metric tiles, a
// value-by-age-band chart, and a holdings table whose rows open the Slice ii pop-up. Everything
// on this screen is scoped to rows the user owns (ownerTeamName === myTeamName), derived once
// (§1) and shared by every section below — do not re-filter per section.
//
// Five design elements are cut outright, per master-plan §4a.2 (omit rather than approximate):
// the "needs a decision" alert cards, the Holdings CALL column, the three tile deltas, the
// 30 days/Season/All time segmented control, and the header's "contending window open" clause.
// A sixth — the "· N rookie picks" subline clause — is cut for a data gap, not a §4a.2 call: the
// app never loads Sleeper's traded-picks endpoint, so there is no representation of unused
// future picks as tradeable assets. See the task file §0/"Explicitly NOT this slice".

const DEFAULT_SORT = { column: 'ktcValue', direction: 'desc' }
const SORTABLE_KEYS = new Set(['full_name', 'ktcValue', 'projDelta', 'yearsFromPeak'])

// HORIZON's ± year-from-peak display boundary — the only judgment call in an otherwise fully
// pipeline-computed quantity (§5.1). One named constant so it's trivial to tune.
const HORIZON_THRESHOLD_YEARS = 2

const AGE_BANDS = [
  // Lower-open first band: a 21-and-under rookie must land somewhere, or it vanishes from the
  // chart while still counting in the Roster value tile — the bars would stop summing to the tile.
  { key: 'b1', label: '≤23',  min: -Infinity, max: 23,       colorClass: 'bg-dp-up' },
  { key: 'b2', label: '24–25', min: 24,        max: 25,       colorClass: 'bg-dp-up' },
  { key: 'b3', label: '26–28', min: 26,        max: 28,       colorClass: 'bg-dp-neutral' },
  { key: 'b4', label: '29–30', min: 29,        max: 30,       colorClass: 'bg-dp-down' },
  { key: 'b5', label: '31+',   min: 31,        max: Infinity, colorClass: 'bg-dp-down' },
]

function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// HORIZON pill — read row.dynastyScore.signals.yearsFromPeak, never re-derived (§5.1). The
// pipeline already computes this from the same per-position empirical peak-age map the chart's
// fixed bands intentionally do NOT use — see the chart-vs-pill note below §4's markup. signals is
// null on the non-scored path (dynastyScore.js), and yearsFromPeak is itself null when peakAge or
// age is missing; both collapse to "—" here.
function horizonInfo(yfp) {
  if (yfp == null) return null
  if (yfp <= -HORIZON_THRESHOLD_YEARS) return { label: 'Appreciating', cls: 'border-dp-up-border text-dp-up-text' }
  if (yfp >= HORIZON_THRESHOLD_YEARS) return { label: 'Depreciating', cls: 'border-dp-down-border text-dp-down-text' }
  return { label: 'Peak', cls: 'border-dp-slate-2 text-dp-text-3' }
}

export function Portfolio({
  playerRows = [], loaded = false, rosterTeams = [], seasonProjections = null,
  myTeamName = null, onOpenPlayerDetail = () => {},
}) {
  // §1 — ownership is the whole screen's filter, derived once.
  const ownedRows = useMemo(
    () => (myTeamName == null ? [] : (playerRows ?? []).filter(r => r.ownerTeamName === myTeamName)),
    [playerRows, myTeamName]
  )

  // ── §3.1 / §3.2 — league-wide per-team aggregates (all playerRows, not just owned) ──────
  const { M, teamValueTotals, leagueMedianWeightedAge } = useMemo(() => {
    const teamNames = new Set()
    for (const r of (playerRows ?? [])) { if (r.ownerTeamName != null) teamNames.add(r.ownerTeamName) }

    const valueTotals = new Map()
    for (const name of teamNames) valueTotals.set(name, 0)
    const ageSums = new Map()   // name -> { sum, denom }
    for (const r of (playerRows ?? [])) {
      if (r.ownerTeamName == null || r.ktcValue == null) continue
      valueTotals.set(r.ownerTeamName, (valueTotals.get(r.ownerTeamName) ?? 0) + r.ktcValue)
      if (r.age != null) {
        const cur = ageSums.get(r.ownerTeamName) ?? { sum: 0, denom: 0 }
        cur.sum += r.age * r.ktcValue
        cur.denom += r.ktcValue
        ageSums.set(r.ownerTeamName, cur)
      }
    }
    const perTeamAges = []
    for (const { sum, denom } of ageSums.values()) {
      if (denom > 0) perTeamAges.push(sum / denom)
    }

    return { M: teamNames.size, teamValueTotals: valueTotals, leagueMedianWeightedAge: median(perTeamAges) }
  }, [playerRows])

  // ── §3 — the four tiles, values only, no deltas (§4a.2 cut) ──────────────────────────────
  const tiles = useMemo(() => {
    const valuedOwnedRows = ownedRows.filter(r => r.ktcValue != null)

    // 3.1 Roster value
    const rosterValue = valuedOwnedRows.reduce((s, r) => s + r.ktcValue, 0)
    const rosterValueRank = (() => {
      if (myTeamName == null || !teamValueTotals.has(myTeamName)) return null
      const sorted = [...teamValueTotals.entries()].sort((a, b) => b[1] - a[1])
      const idx = sorted.findIndex(([name]) => name === myTeamName)
      return idx === -1 ? null : idx + 1
    })()

    // 3.2 Weighted age
    const ageValuedRows = ownedRows.filter(r => r.age != null && r.ktcValue != null)
    const ageDenom = ageValuedRows.reduce((s, r) => s + r.ktcValue, 0)
    const weightedAge = ageDenom > 0
      ? ageValuedRows.reduce((s, r) => s + r.age * r.ktcValue, 0) / ageDenom
      : null

    // 3.3 Concentration — top 4 owned assets by ktcValue
    const byValueDesc = [...valuedOwnedRows].sort((a, b) => b.ktcValue - a.ktcValue)
    const top4Sum = byValueDesc.slice(0, 4).reduce((s, r) => s + r.ktcValue, 0)
    const concentrationPct = byValueDesc.length >= 4 && rosterValue > 0
      ? Math.round((top4Sum / rosterValue) * 100)
      : null

    // 3.4 Projected points — starters only, joined on starter.id (NOT starter.player_id —
    // enrichPlayer's enriched shape has no player_id; that mismatch is the single most likely
    // way to ship a silently-wrong 0.0 here). Three degenerate cases all render "—", tracked
    // explicitly rather than inferred from the sum, since a genuine zero and an empty join are
    // otherwise indistinguishable. Never falls back to summing the whole roster.
    const myRosterTeam = rosterTeams.find(t => t.teamName === myTeamName)
    const starters = myRosterTeam?.starters ?? []
    let projectedPoints = null
    if (starters.length > 0 && seasonProjections != null) {
      let sum = 0
      let contributing = 0
      for (const s of starters) {
        const proj = seasonProjections[s.id]
        if (proj?.projectedTotalPts != null) {
          sum += proj.projectedTotalPts
          contributing++
        }
      }
      if (contributing > 0) projectedPoints = Math.round(sum)
    }

    return [
      {
        key: 'value', label: 'ROSTER VALUE',
        value: valuedOwnedRows.length > 0 ? rosterValue.toLocaleString() : '—',
        note: rosterValueRank != null ? `${ordinal(rosterValueRank)} of ${M}` : null,
      },
      {
        key: 'age', label: 'WEIGHTED AGE',
        value: weightedAge != null ? weightedAge.toFixed(1) : '—',
        note: leagueMedianWeightedAge != null ? `League median ${leagueMedianWeightedAge.toFixed(1)}` : null,
      },
      {
        key: 'conc', label: 'CONCENTRATION',
        value: concentrationPct != null ? `${concentrationPct}%` : '—',
        note: `Top 4 of ${valuedOwnedRows.length} assets by value`,
      },
      {
        key: 'proj', label: 'PROJ. POINTS',
        value: projectedPoints != null ? projectedPoints.toLocaleString() : '—',
        note: 'Next season, starters only',
      },
    ]
  }, [ownedRows, myTeamName, teamValueTotals, M, leagueMedianWeightedAge, rosterTeams, seasonProjections])

  // ── §4 — value by age band ────────────────────────────────────────────────────────────────
  const ageBandValues = useMemo(() => {
    const totals = AGE_BANDS.map(() => 0)
    for (const r of ownedRows) {
      // Null-age rows are excluded from every band, not bucketed into 31+.
      if (r.age == null || r.ktcValue == null) continue
      const idx = AGE_BANDS.findIndex(b => r.age >= b.min && r.age <= b.max)
      if (idx !== -1) totals[idx] += r.ktcValue
    }
    return totals
  }, [ownedRows])
  const maxBandValue = Math.max(1, ...ageBandValues)

  // ── §5 — holdings table: materialize the two derived sort keys ──────────────────────────
  const holdingsRows = useMemo(() => ownedRows.map(r => ({
    ...r,
    // currentSeasonPPG is 0, never null — guard with > 0, not a null check, or a player with no
    // prior season renders projectedPPG - 0: a fabricated full-projection gain (§5).
    projDelta: (r.currentSeasonPPG > 0 && r.projectedPPG != null) ? r.projectedPPG - r.currentSeasonPPG : null,
    yearsFromPeak: r.dynastyScore?.signals?.yearsFromPeak ?? null,
  })), [ownedRows])

  const { sortState, sortProps, setSortState } = usePlayersTable({ storageKey: 'portfolio-sort', defaultSort: DEFAULT_SORT })

  // Restored-key validation (Market.jsx's pattern) — Portfolio has one column set, so the
  // set-switch machinery doesn't apply, but a stale/foreign market-sort-shaped value still needs
  // a fallback rather than sorting by a key this table has no column for.
  useEffect(() => {
    if (!SORTABLE_KEYS.has(sortState.column)) {
      setSortState(DEFAULT_SORT)
    }
  }, [sortState.column, setSortState])

  const displayRows = useMemo(() => {
    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...holdingsRows].sort((a, b) => compareNullsLast(a[sortState.column], b[sortState.column], dir))
  }, [holdingsRows, sortState])

  const maxOwnedKtc = Math.max(1, ...ownedRows.map(r => r.ktcValue ?? 0))

  if (myTeamName == null) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <h1 className="text-xl font-semibold text-dp-text mb-3">Portfolio</h1>
        <p className="text-dp-muted text-sm max-w-sm mx-auto">
          No roster found for your account in this league.
        </p>
      </div>
    )
  }

  return (
    // bg-dp-canvas is required, not decorative — Slice i §1.1.
    <div className="bg-dp-canvas flex flex-col gap-[22px]">
      {/* Header — the posture clause and rookie-pick clause are both cut; nothing occupies the
          header's right side in v1 (the horizon segmented control is cut too). */}
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Portfolio</h1>
        {/* playerRows holds only QB/RB/WR/TE, so this count never matches a full Sleeper
            roster (K/DEF etc. are absent) — worded as "skill players", not "assets". */}
        <p className="text-[13px] text-dp-muted mt-1">{ownedRows.length} skill players</p>
      </div>

      {/* Four metric tiles — values only, no deltas (§4a.2 cut) */}
      <div className="grid grid-cols-4 gap-[14px]">
        {tiles.map(t => (
          <div key={t.key} data-testid={`tile-${t.key}`} className="bg-dp-card rounded-[10px] p-[14px_16px]">
            <div className="font-dp-mono text-[11px] uppercase text-dp-muted">{t.label}</div>
            <div className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-text mt-1">{t.value}</div>
            {t.note && <div className="text-xs text-dp-muted mt-1">{t.note}</div>}
          </div>
        ))}
      </div>

      {/* Value by age band */}
      <div className="bg-dp-card rounded-[10px] p-[16px_18px]">
        <div className="text-[13px] font-semibold text-dp-text">Value by age band</div>
        <p className="text-xs text-dp-muted mt-0.5">where your capital sits on the age curve</p>
        <div className="flex items-end gap-[14px] h-[190px] mt-4">
          {AGE_BANDS.map((band, i) => {
            const v = ageBandValues[i]
            const h = v > 0 ? Math.max(4, Math.round((v / maxBandValue) * 190)) : 0
            return (
              <div key={band.key} data-testid={`ageband-${band.key}`} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="font-dp-mono text-[11px] text-dp-text-4">{v.toLocaleString()}</span>
                <div className={`w-full rounded-t-[5px] rounded-b-[2px] ${band.colorClass}`} style={{ height: h }} />
                <span className="text-[11px] text-dp-muted">{band.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-4">
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-up" /> Appreciating (≤25)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-neutral" /> Peak (26–28)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-down" /> Depreciating (29+)
          </span>
        </div>
      </div>

      {/* Holdings table — no 30D (same broken ktcHist series Market cut), no CALL (§4a.2 cut) */}
      <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="px-[18px] py-[14px] text-[13px] font-semibold text-dp-text">Holdings</div>
        {!loaded && (
          <p className="text-sm text-dp-muted italic px-[18px] pb-3">Player data loading in background…</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-dp-row-head">
                <SortTh label="Asset" col="full_name" {...sortProps} />
                <SortTh label="Value" col="ktcValue" {...sortProps} align="right" />
                <th className="px-3 py-[9px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-left text-dp-muted whitespace-nowrap">
                  5-YR PPG
                </th>
                <SortTh label="Proj Δ" col="projDelta" {...sortProps} align="right" />
                <SortTh label="Horizon" col="yearsFromPeak" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => (
                <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
                  <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
                  <td className="px-3 py-3 w-[190px]">
                    {row.ktcValue != null ? (
                      <div className="flex items-center gap-2.5 justify-end">
                        <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
                          <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${Math.max(0, Math.min(100, (row.ktcValue / maxOwnedKtc) * 100))}%` }} />
                        </div>
                        <span className="font-dp-mono text-xs text-dp-text w-[46px] text-right">{row.ktcValue.toLocaleString()}</span>
                      </div>
                    ) : <span className="text-dp-muted text-xs block text-right">—</span>}
                  </td>
                  <td className="px-3 py-3"><CareerBars values={row.careerSparkline} /></td>
                  <td data-testid={`projdelta-${row.player_id}`} className="px-3 py-3 text-right"><DeltaCell delta={row.projDelta} /></td>
                  <td data-testid={`horizon-${row.player_id}`} className="px-3 py-3">
                    {(() => {
                      const h = horizonInfo(row.yearsFromPeak)
                      return h ? (
                        <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${h.cls}`}>{h.label}</span>
                      ) : <span className="text-dp-muted text-xs">—</span>
                    })()}
                  </td>
                </ClickableRow>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-dp-muted">
                    {loaded ? 'No holdings to show.' : 'Loading player data…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
