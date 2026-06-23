import { useCallback, useEffect, useMemo, useState } from 'react'
import Tooltip from './Tooltip'
import SpiderChart from './SpiderChart'
import { ProfileDataContext, useProfileData } from '../context/ProfileDataContext'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
import AvailabilityHistory from './AvailabilityHistory'
import { AdvancedStatsPanel } from './AdvancedStatsPanel'
import { buildSeasonPositionRanks, computeCeilingFloor } from '../utils/seasonRanks'
import { computeKtcRecentDelta } from '../utils/ktcHistory'

// ---------------------------------------------------------------------------
// Inline sparkline for the explorer table
// ---------------------------------------------------------------------------
function CareerSparkline({ values }) {
  const BAR_W = 6, GAP = 2, H = 22
  const max = Math.max(...values.filter(v => v > 0), 1)
  const width = values.length * (BAR_W + GAP) - GAP
  const lastVal = values[values.length - 1]
  let lastColor = 'var(--color-chart-axis)'
  if (lastVal > 0) {
    const sorted = [...values].sort((a, b) => b - a)
    const rank = sorted.indexOf(lastVal) + 1
    if (rank <= 2) lastColor = 'var(--c-green-500)'
    else if (rank >= values.length - 1) lastColor = 'var(--c-orange-500)'
  }
  return (
    <svg width={width} height={H}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1
        const barH = v > 0 ? Math.max(3, Math.round((v / max) * H)) : 3
        return (
          <rect key={i} x={i * (BAR_W + GAP)} y={H - barH} width={BAR_W} height={barH} rx={1}
            fill={v > 0 ? (isLast ? lastColor : 'var(--c-blue-300)') : 'var(--color-border)'} />
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Tier-colored positional rank badge: "QB5"
// ---------------------------------------------------------------------------
function PosRankBadge({ position, rank }) {
  const tiers = { QB: [12, 24], RB: [24, 48], WR: [24, 48], TE: [12, 24] }
  const [top, mid] = tiers[position] ?? [12, 24]
  const color = rank <= top ? 'bg-[var(--c-green-100)] text-[var(--c-green-800)]'
    : rank <= mid ? 'bg-[var(--c-yellow-100)] text-[var(--c-yellow-800)]'
    : 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${color}`}>
      {position}{rank}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Compact stacked Ceiling/Floor cell
// ---------------------------------------------------------------------------
// `data` = decorated season from computeCeilingFloor.
function CeilingFloorCell({ position, data }) {
  if (!data) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  const { season, rank, points, delta, refAvg } = data
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1 whitespace-nowrap">
        <PosRankBadge position={position} rank={rank} />
        <span className="text-[10px] text-[var(--color-text-faint)] tabular-nums">{season}</span>
      </div>
      <div className="text-xs tabular-nums whitespace-nowrap">
        <span className="text-[var(--color-text-secondary)]">{Math.round(points)}</span>
        {delta != null && delta !== 0 && (
          <Tooltip content={`vs ${position}${rank} avg (${Math.round(refAvg)} pts)`} position="top">
            <span className={`ml-1 ${delta > 0
              ? 'text-[var(--color-positive-text)]'
              : 'text-[var(--color-negative-text)]'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------
export function SortTh({ label, col, sortKey, sortAsc, onSort, className = '', tooltip }) {
  const active = sortKey === col
  const inner  = <>{label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}</>
  return (
    <th onClick={() => onSort(col)}
      className={`py-2 px-3 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-[var(--color-text-strong)] ${className}`}>
      {tooltip
        ? <Tooltip content={tooltip} position="bottom">{inner}</Tooltip>
        : inner}
    </th>
  )
}

// ---------------------------------------------------------------------------
// Dynasty label color helper
// ---------------------------------------------------------------------------
function dynastyLabelColor(label, confidence) {
  if (confidence === 'prospect') return 'bg-[var(--c-purple-100)] text-[var(--c-purple-800)]'
  switch (label) {
    case 'Elite':
    case 'Ascending Star':
    case 'Peak Window':
    case 'Breakout':
      return 'bg-[var(--c-green-100)] text-[var(--c-green-800)]'
    case 'Developing':
    case 'Rising':
    case 'Solid Floor':
    case 'Bounce-back':
      return 'bg-[var(--c-blue-100)] text-[var(--c-blue-800)]'
    case 'Plateau':
      return 'bg-[var(--c-yellow-100)] text-[var(--c-yellow-800)]'
    case 'Veteran Producer':
      return 'bg-[var(--c-slate-100)] text-[var(--c-slate-700)]'
    case 'Managed Decline':
      return 'bg-[var(--c-orange-100)] text-[var(--c-orange-800)]'
    case 'Sell Now':
    case 'Fading':
      return 'bg-[var(--c-red-100)] text-[var(--c-red-800)]'
    default:
      return 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]'
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function projectionConfidenceClass(confidence) {
  return confidence === 'high'   ? 'font-bold text-[var(--color-text)]'
       : confidence === 'medium' ? 'text-[var(--color-text-strong)]'
       : confidence === 'low'    ? 'text-[var(--color-text-muted)]'
       : confidence === 'rookie' ? 'italic text-[var(--c-purple-700)] opacity-70'
       :                           'text-[var(--color-text-muted)]'
}

// ---------------------------------------------------------------------------
// Full-width SVG bar chart for career PPG by season
// ---------------------------------------------------------------------------
function CareerBarChart({ seasonRows, careerAvgPPG }) {
  if (seasonRows.length === 0) return null
  const VW = 640, VH = 220
  const PL = 38, PR = 36, PT = 14, PB = 30
  const cW = VW - PL - PR
  const cH = VH - PT - PB

  const maxPPG = Math.max(...seasonRows.map(d => d.ppg), careerAvgPPG) * 1.18
  const n = seasonRows.length
  const gap = n > 10 ? 3 : 5
  const barW = (cW - (n - 1) * gap) / n

  // Thin year labels when many seasons (show every other year past 10)
  const labelEvery = n > 10 ? 2 : 1

  const toY = v => PT + cH - (v / maxPPG) * cH
  const avgY = toY(careerAvgPPG)

  const yTicks = [0, Math.round(maxPPG * 0.5), Math.round(maxPPG * 0.9)]

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} className="overflow-visible" preserveAspectRatio="none">
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PL} y1={toY(v)} x2={PL + cW} y2={toY(v)} stroke="var(--color-chart-grid)" strokeWidth={1} />
          <text x={PL - 4} y={toY(v) + 4} fontSize={10} fill="var(--color-chart-label)" textAnchor="end">{v}</text>
        </g>
      ))}
      <line x1={PL} y1={avgY} x2={PL + cW} y2={avgY}
        stroke="var(--color-chart-axis)" strokeWidth={1} strokeDasharray="4 3" />
      <text x={PL + cW + 3} y={avgY + 3} fontSize={9} fill="var(--color-chart-axis)" textAnchor="start">avg</text>
      {seasonRows.map(({ season, ppg, isMostRecent }, i) => {
        const x = PL + i * (barW + gap)
        const bH = Math.max(2, (ppg / maxPPG) * cH)
        const y = PT + cH - bH
        const fill = isMostRecent ? 'var(--color-chart-recent)' : ppg >= careerAvgPPG ? 'var(--color-chart-above)' : 'var(--color-chart-below)'
        // Show label if it's the first, last, or matches labelEvery cadence (counting from the end)
        const showLabel = i === 0 || i === n - 1 || (n - 1 - i) % labelEvery === 0
        return (
          <g key={season}>
            <rect x={x} y={y} width={barW} height={bH} rx={2} fill={fill} />
            {showLabel && (
              <text x={x + barW / 2} y={VH - 8} fontSize={9} fill="var(--color-chart-label)" textAnchor="middle">
                '{String(season).slice(2)}
              </text>
            )}
          </g>
        )
      })}
      <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="var(--color-border)" />
      <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="var(--color-border)" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Compact SVG bar chart for weekly points
// ---------------------------------------------------------------------------
function WeeklyBarChart({ weeklyPoints }) {
  const VW = 420, VH = 95
  const PL = 6, PR = 6, PT = 8, PB = 18
  const cW = VW - PL - PR
  const cH = VH - PT - PB

  const allPts = Object.values(weeklyPoints).filter(v => v > 0)
  const maxPts = Math.max(...allPts, 1)
  const gap = 2
  const barW = (cW - 17 * gap) / 18

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}>
      {Array.from({ length: 18 }, (_, i) => {
        const week = i + 1
        const pts = weeklyPoints[week]
        const hasData = pts != null && pts > 0
        const x = PL + i * (barW + gap)
        const bH = hasData ? Math.max(3, (pts / maxPts) * cH) : 3
        const y = PT + cH - bH
        return (
          <g key={week}>
            <rect x={x} y={y} width={barW} height={bH} rx={1}
              fill={hasData ? 'var(--c-blue-400)' : 'var(--color-border)'} />
            {!hasData && (
              <text x={x + barW / 2} y={PT + cH - 8} fontSize={6} fill="var(--color-text-faintest)" textAnchor="middle">—</text>
            )}
            <text x={x + barW / 2} y={VH - 2} fontSize={7} fill="var(--color-chart-label)" textAnchor="middle">{week}</text>
          </g>
        )
      })}
      <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="var(--color-chart-grid)" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Comp sparkline — dual-line SVG for career arc comparisons
// ---------------------------------------------------------------------------
function CompSparkline({ targetArc, compArc }) {
  const VW = 260, VH = 48
  const PL = 2, PR = 2, PT = 4, PB = 4
  const cW = VW - PL - PR
  const cH = VH - PT - PB

  const overlapLen = targetArc.length
  const totalLen   = Math.max(compArc.length, overlapLen)
  if (totalLen < 2) return null

  const maxVal = Math.max(...targetArc, ...compArc, 0.1)
  const toX = i  => PL + (totalLen === 1 ? cW / 2 : (i / (totalLen - 1)) * cW)
  const toY = v  => PT + cH - Math.min(v / maxVal, 1) * cH

  const pts = arr => arr.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')

  const compOverlap    = compArc.slice(0, overlapLen)
  const compProjection = compArc.slice(Math.max(0, overlapLen - 1))
  const projOffset     = Math.max(0, overlapLen - 1)
  const dividerX       = overlapLen < totalLen ? toX(overlapLen - 1) : null

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} className="overflow-visible">
      {dividerX != null && (
        <rect x={dividerX} y={PT} width={cW - (dividerX - PL)} height={cH} fill="var(--c-violet-50)" />
      )}
      {dividerX != null && (
        <line x1={dividerX} y1={PT} x2={dividerX} y2={PT + cH}
          stroke="var(--c-violet-300)" strokeWidth={1} strokeDasharray="2 2" />
      )}
      {compOverlap.length >= 2 && (
        <polyline points={pts(compOverlap)} fill="none"
          stroke="var(--c-indigo-300)" strokeWidth={1.5} strokeDasharray="3 2" strokeLinejoin="round" />
      )}
      {compProjection.length >= 2 && (
        <polyline
          points={compProjection.map((v, i) => `${toX(projOffset + i)},${toY(v)}`).join(' ')}
          fill="none" stroke="var(--c-indigo-200)" strokeWidth={1.5}
          strokeDasharray="3 2" strokeLinejoin="round" />
      )}
      {targetArc.length >= 2 && (
        <polyline points={pts(targetArc)} fill="none"
          stroke="var(--color-compare-1)" strokeWidth={2} strokeLinejoin="round" />
      )}
      {targetArc.map((v, i) => (
        <circle key={i} cx={toX(i)} cy={toY(v)} r={2.5} fill="var(--color-compare-1)" />
      ))}
      <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="var(--color-chart-grid)" strokeWidth={1} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Player profile panel
// ---------------------------------------------------------------------------
export function PlayerProfile({ playerId, onClose, onSelectPlayer, comparisonList = [], addToComparison, removeFromComparison }) {
  const {
    player,
    dynastyScore,
    ownership,
    ktcValue,
    divergenceSignal,
    dynRank,
    ktcRank,
    recentRank,
    peakRank,
    consistencyRank,
    dynastyRank,
    movementLabel,
    careerHistory,
    careerAvgPPG,
    careerTotalPts,
    careerTotalGP,
    historicalRanks,
    comps,
    projectedPPG,
    positionPeers,
    availableSeasons,
    mostRecentSeason,
    getSeasonData,
    positionPeakPPG,
    roleRank,
    shareHistory,
    collegeMetrics,
    teamDepthChart,
    projection,
    nextSeasonRank,
    advStatsRow,
    advStatsSeason,
    snapShare,
    usageShare,
  } = usePlayerProfile(playerId)

  const [weeklyOpen,    setWeeklyOpen]    = useState(true)
  const [focusSeason,   setFocusSeason]   = useState(mostRecentSeason)
  const [activeTab,     setActiveTab]     = useState('stats')  // 'stats' | 'dynasty' | 'team'
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const { playerRows: allPlayerRows, careerStats, enrichmentMap } = useProfileData()

  const focusSeasonData = getSeasonData(focusSeason)
  const { weeklyPoints, rawStats } = focusSeasonData
  const hasWeeklyData = Object.keys(weeklyPoints).length > 0

  // Escape key to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent background scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const DynastyScoreSection = dynastyScore?.components ? (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Dynasty Score</h3>
        <span className="text-xs text-[var(--color-text-faint)]">
          {dynastyScore.signals?.peakSeason && `Peak ${dynastyScore.signals.peakSeason.season} · ${dynastyScore.signals.peakSeason.ppg} PPG`}
        </span>
      </div>
      <div className="space-y-1.5">
        {[
          { label: 'Age-adjusted',        value: dynastyScore.components.ageAdjusted.value,       weight: '28%', tooltip: "How the player's current PPG compares to what the empirical age curve predicts for someone their age and position." },
          { label: 'Trajectory',          value: dynastyScore.components.trajectory.value,         weight: '25%', tooltip: "Slope of a recency-weighted regression through all career seasons. Positive = improving over career, negative = declining." },
          { label: 'Current level',       value: dynastyScore.components.currentLevel.value,       weight: '22%', tooltip: "Percentile rank vs all active players at their position using weighted recent PPG." },
          { label: 'Opportunity Quality', value: dynastyScore.components.opportunityQuality.value, weight: '15%', tooltip: "Combines efficiency (yards per attempt/carry/reception), volume (touches/targets per game), and market share (carry share for RBs, target share for WRs/TEs) when available." },
          { label: 'Reliability',         value: dynastyScore.components.reliability.value,        weight: '10%', tooltip: "Composite of PPG consistency (week-to-week variance) and durability (average games played, penalised for recurring injury seasons)." },
        ].map(({ label, value, weight, tooltip }) => {
          const isReliability        = label === 'Reliability'
          const isOpportunityQuality = label === 'Opportunity Quality'
          const rel = dynastyScore.components.reliability
          const oq  = dynastyScore.components.opportunityQuality
          return (
            <div key={label}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 text-[var(--color-text-muted)] flex-shrink-0">
                  <Tooltip content={tooltip} position="right">{label}</Tooltip>
                </span>
                <div className="flex-1 bg-[var(--color-surface-3)] rounded h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded bg-[var(--c-indigo-400)] transition-all" style={{ width: `${value}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-[var(--color-text-secondary)] font-medium">{value}</span>
                <span className="w-6 text-right text-[var(--color-text-faintest)]">{weight}</span>
                {isReliability && (dynastyScore.signals?.injurySeasonCount ?? 0) >= 2 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-amber-100)] text-[var(--c-amber-700)] whitespace-nowrap">
                    ⚠ {dynastyScore.signals.injurySeasonCount} injury seasons
                  </span>
                )}
              </div>
              {isReliability && (
                <div className="text-xs text-[var(--color-text-faint)] ml-[calc(7rem+0.5rem)] mt-0.5">
                  Durability: {rel.durabilityScore} · Consistency: {rel.consistencyScore}
                </div>
              )}
              {isOpportunityQuality && (
                <div className="text-xs text-[var(--color-text-faint)] ml-[calc(7rem+0.5rem)] mt-0.5 space-y-0.5">
                  <div>Efficiency: {oq.efficiencyPercentile} · Volume: {oq.volumePercentile}
                    {oq.shareScore != null && ` · Share: ${oq.shareScore}`}
                  </div>
                  {(() => {
                    const sig = dynastyScore.signals
                    const isRB = player.position === 'RB'
                    const shareLabel = isRB ? 'Carry share' : 'Target share'
                    // Use historical share trend if available, fall back to current-season signal
                    const sharePct = sig?.currentShare != null
                      ? Math.round(sig.currentShare * 100)
                      : sig?.carryShare != null ? Math.round(sig.carryShare * 100)
                      : sig?.targetShare != null ? Math.round(sig.targetShare * 100)
                      : null
                    const trendLabel = sig?.shareTrendLabel
                    const trendArrow = trendLabel === 'growing' || trendLabel === 'expanding' ? '↑'
                      : trendLabel === 'shrinking' || trendLabel === 'declining' ? '↓'
                      : trendLabel === 'stable' ? '→' : null
                    const volatility = sig?.shareVolatility
                    const volatilityDisplay = volatility === 'entrenched' ? 'Entrenched role'
                      : volatility === 'moderate' ? 'Moderate volatility'
                      : volatility === 'volatile' ? 'Volatile role'
                      : null
                    if (sharePct == null) return null
                    return (
                      <Tooltip
                        content={`${shareLabel} over recent seasons. Trend = change vs prior weighted average. Volatility = standard deviation of share across seasons.`}
                        position="right"
                      >
                        <span className="cursor-help">
                          {shareLabel}: {sharePct}%
                          {trendArrow && trendLabel && ` (${trendArrow} ${trendLabel})`}
                          {volatilityDisplay && ` · ${volatilityDisplay}`}
                        </span>
                      </Tooltip>
                    )
                  })()}
                  {dynastyScore.signals?.teamOffenseRank != null && (
                    <Tooltip content="Team's offensive rank by total fantasy points scored this season. Rank 1 = highest-scoring offense." position="right">
                      <span className="cursor-help">
                        Team offense: Ranked {dynastyScore.signals.teamOffenseRank} of 32
                      </span>
                    </Tooltip>
                  )}
                  {dynastyScore.signals?.qbQualityScore != null && (
                    <Tooltip
                      content="Quarterback quality affects pass-catcher opportunity ceilings. Elite QBs elevate WR/TE scores; poor QBs compress them. RBs on run-heavy teams benefit slightly from poor passing offenses."
                      position="right"
                    >
                      <span className="cursor-help">
                        {player.position === 'RB'
                          ? `QB quality: ${dynastyScore.signals.qbQualityScore}/100 (run-game boost: +${Math.abs(dynastyScore.signals.qbModifierApplied)}%)`
                          : `QB quality: ${dynastyScore.signals.qbQualityScore}/100 (${dynastyScore.signals.qbModifierApplied >= 0 ? '+' : ''}${dynastyScore.signals.qbModifierApplied}% modifier)`
                        }
                      </span>
                    </Tooltip>
                  )}
                  {dynastyScore.signals?.depthOrder != null && (
                    <Tooltip
                      content="Depth chart position on their NFL team (from Sleeper). Starter = 1st on depth chart, gets a 15% OQ boost. Backup (2nd) = 10% OQ reduction. Depth pieces (3rd+) = 30% OQ reduction and label capped at Solid Floor."
                      position="right"
                    >
                      <span className="cursor-help">
                        {`Depth: ${
                          dynastyScore.signals.depthOrder === 1 ? 'Starter'
                          : dynastyScore.signals.depthOrder === 2 ? 'Backup (2nd)'
                          : `Depth piece (${dynastyScore.signals.depthOrder}rd+)`
                        } · ${dynastyScore.signals.depthMultiplier > 1 ? '+' : ''}${Math.round((dynastyScore.signals.depthMultiplier - 1) * 100)}% OQ`}
                      </span>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  ) : null

  const CareerSection = careerHistory.length > 0 ? (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Career PPG</h3>
        <span className="text-xs text-[var(--color-text-faint)]">{careerAvgPPG.toFixed(1)} career avg</span>
      </div>
      <CareerBarChart seasonRows={careerHistory} careerAvgPPG={careerAvgPPG} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--color-text-faint)] border-b">
              <th className="pb-1.5 text-left font-medium">Season</th>
              <th className="pb-1.5 text-center font-medium">GP</th>
              <th className="pb-1.5 text-right font-medium">Total Pts</th>
              <th className="pb-1.5 text-right font-medium">PPG</th>
              <th className="pb-1.5 text-right font-medium">Pos Rank</th>
            </tr>
          </thead>
          <tbody>
            {[...careerHistory].reverse().map(row => {
              const rank = historicalRanks[row.season]
              return (
                <tr key={row.season} className={`border-b transition-colors ${row.isMostRecent ? 'bg-[var(--c-indigo-50)]/50 hover:bg-[var(--c-indigo-100)]/50' : 'hover:bg-[var(--color-surface-2)]'}`}>
                  <td className="py-1.5 text-left text-[var(--color-text-secondary)] font-medium">
                    {row.season}
                    {row.isMostRecent && <span className="ml-1 text-[var(--c-indigo-400)]">●</span>}
                  </td>
                  <td className="py-1.5 text-center text-[var(--color-text-muted)]">
                    {row.gamesStarted != null ? (
                      <Tooltip
                        content={`Played: ${row.gamesPlayed} · Started: ${row.gamesStarted} · DNP: ${row.dnpWeeks ?? 0} · Bye: ${row.byeWeeks ?? 0}`}
                        position="top"
                      >
                        <span className="cursor-help">{row.gamesPlayed}</span>
                      </Tooltip>
                    ) : row.gamesPlayed}
                  </td>
                  <td className="py-1.5 text-right text-[var(--color-text-secondary)] tabular-nums">{row.fantasyPoints.toFixed(1)}</td>
                  <td className="py-1.5 text-right text-[var(--color-text-secondary)] tabular-nums font-medium">{row.ppg.toFixed(1)}</td>
                  <td className="py-1.5 text-right">
                    {rank != null
                      ? <PosRankBadge position={player.position ?? '?'} rank={rank} />
                      : <span className="text-[var(--color-text-faintest)]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {careerHistory.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-2)]">
                <td className="py-1.5 text-left text-[var(--color-text-muted)] font-medium">Career</td>
                <td className="py-1.5 text-center text-[var(--color-text-muted)] tabular-nums">{careerTotalGP}</td>
                <td className="py-1.5 text-right text-[var(--color-text-secondary)] tabular-nums font-medium">{careerTotalPts.toLocaleString()}</td>
                <td className="py-1.5 text-right text-[var(--color-text-muted)] tabular-nums">{careerAvgPPG.toFixed(1)}</td>
                <td className="py-1.5 text-right text-[var(--color-text-faintest)]">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {shareHistory && shareHistory.length >= 2 && (() => {
        const isRB = player.position === 'RB'
        const colLabel = isRB ? 'Carry Share' : 'Target Share'
        return (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Role History</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--color-text-faint)] border-b">
                  <th className="pb-1.5 text-left font-medium">Season</th>
                  <th className="pb-1.5 text-right font-medium">{colLabel}</th>
                  <th className="pb-1.5 text-right font-medium">vs Prior</th>
                </tr>
              </thead>
              <tbody>
                {[...shareHistory].reverse().map((entry, i, arr) => {
                  const prior = arr[i + 1]
                  let delta = null
                  if (prior) {
                    delta = entry.share - prior.share
                  }
                  return (
                    <tr key={entry.season} className="border-b hover:bg-[var(--color-surface-2)]">
                      <td className="py-1.5 text-[var(--color-text-secondary)] font-medium">{entry.season}</td>
                      <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                        {Math.round(entry.share * 100)}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {delta == null ? <span className="text-[var(--color-text-faintest)]">—</span>
                          : delta > 0.01 ? <span className="text-[var(--c-green-600)]">↑ +{Math.round(delta * 100)}%</span>
                          : delta < -0.01 ? <span className="text-[var(--c-orange-500)]">↓ {Math.round(delta * 100)}%</span>
                          : <span className="text-[var(--color-text-faint)]">→</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}
      <AvailabilityHistory careerStats={careerStats} playerId={playerId} enrichmentMap={enrichmentMap} />
    </section>
  ) : (
    <p className="text-sm text-[var(--color-text-faint)]">No career data available for this player.</p>
  )

  // ── College production section ───────────────────────────────────────────
  const CollegeSection = collegeMetrics ? (() => {
    const { seasons, breakoutAge, peakDominator, productionTrend } = collegeMetrics
    const college = player.college ?? null

    // Breakout age chip
    let breakoutLabel = 'No breakout detected'
    let breakoutColor = 'bg-[var(--color-surface-3)] text-[var(--color-text-faint)]'
    if (breakoutAge != null) {
      if (breakoutAge <= 20) {
        breakoutLabel = `Early breakout · Age ${breakoutAge}`
        breakoutColor = 'bg-[var(--c-green-50)] text-[var(--c-green-700)] border border-[var(--c-green-200)]'
      } else if (breakoutAge <= 22) {
        breakoutLabel = `Breakout · Age ${breakoutAge}`
        breakoutColor = 'bg-[var(--c-blue-50)] text-[var(--c-blue-700)] border border-[var(--c-blue-200)]'
      } else {
        breakoutLabel = `Late breakout · Age ${breakoutAge}`
        breakoutColor = 'bg-[var(--c-yellow-50)] text-[var(--c-yellow-700)] border border-[var(--c-yellow-200)]'
      }
    }

    // Production trend label
    const trendText = {
      improving:      '↑ Improving',
      'peak-final':   '→ Peak-final',
      declining:      '↓ Declining',
      'single-season': null,
    }[productionTrend]

    return (
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
          College Production
          {college && <span className="ml-2 text-xs font-normal text-[var(--color-text-faint)]">{college}</span>}
        </h3>

        {/* Chips row */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${breakoutColor}`}>
            {breakoutLabel}
          </span>
          {peakDominator != null && (
            <Tooltip
              content={
                player.position === 'QB'
                  ? 'Best single-season passing quality score — efficiency (YPA) blended with volume (attempts). Conference-adjusted.'
                  : 'Best single-season share of team production. >25% WR/TE or >35% RB = clear feature role.'
              }
              position="bottom"
            >
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] font-medium cursor-default">
                Peak: {peakDominator.toFixed(1)}{player.position === 'QB' ? ' score' : '%'}
              </span>
            </Tooltip>
          )}
          {trendText && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              productionTrend === 'improving'
                ? 'bg-[var(--c-emerald-50)] text-[var(--c-emerald-700)]'
                : productionTrend === 'declining'
                  ? 'bg-[var(--c-orange-50)] text-[var(--c-orange-700)]'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]'
            }`}>
              {trendText}
            </span>
          )}
        </div>

        {/* Per-season table */}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--color-text-faint)] border-b">
              <th className="pb-1.5 text-left font-medium">Year</th>
              <th className="pb-1.5 text-right font-medium">{player.position === 'QB' ? 'Score' : 'Dom%'}</th>
              <th className="pb-1.5 text-left font-medium pl-4">Key stats</th>
            </tr>
          </thead>
          <tbody>
            {[...seasons].reverse().map(s => {
              const isQBdisp = player.position === 'QB'
              const isRB     = player.position === 'RB'
              const rec  = s.receiving
              const rush = s.rushing
              const pass = s.passing
              // Key stats line
              let statLine = '—'
              if (isQBdisp && pass) {
                const parts = []
                if (pass.YDS != null) parts.push(`${Math.round(pass.YDS).toLocaleString()} pass yds`)
                if (pass.TD  != null) parts.push(`${pass.TD} TD`)
                if (pass.INT != null) parts.push(`${pass.INT} INT`)
                // Confirmed CFBD field: PCT exists; COMPLETIONS is the completions key
                const pct = pass.PCT ?? (pass.COMPLETIONS != null && pass.ATT > 0
                  ? (pass.COMPLETIONS / pass.ATT) * 100
                  : null)
                if (pct != null) parts.push(`${pct.toFixed(1)}%`)
                statLine = parts.join(' · ') || '—'
              } else if (isRB && rush) {
                const parts = []
                if (rush.YDS != null) parts.push(`${Math.round(rush.YDS).toLocaleString()} rush yds`)
                if (rush.TD  != null) parts.push(`${rush.TD} TD`)
                if (rush.CAR != null) parts.push(`${rush.CAR} car`)
                statLine = parts.join(' · ') || '—'
              } else if (rec) {
                const parts = []
                if (rec.YDS != null) parts.push(`${Math.round(rec.YDS).toLocaleString()} rec yds`)
                if (rec.TD  != null) parts.push(`${rec.TD} TD`)
                if (rec.REC != null) parts.push(`${rec.REC} rec`)
                statLine = parts.join(' · ') || '—'
              }
              const scoreVal = isQBdisp ? s.qbScore : s.domRating
              return (
                <tr key={s.year} className="border-b hover:bg-[var(--color-surface-2)]">
                  <td className="py-1.5 text-[var(--color-text-secondary)] font-medium tabular-nums">{s.year}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {scoreVal != null ? `${scoreVal.toFixed(1)}${isQBdisp ? '' : '%'}` : '—'}
                  </td>
                  <td className="py-1.5 pl-4 text-[var(--color-text-muted)]">{statLine}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    )
  })() : null

  const AdvancedStatsSection = (
    <AdvancedStatsPanel
      position={player.position}
      advStats={advStatsRow}
      advStatsSeason={advStatsSeason}
      snapShare={snapShare}
      usageShare={usageShare}
    />
  )

  const PositionContextSection = positionPeers.length > 0 ? (
    <section className="rounded-lg bg-[var(--color-surface-2)] px-4 py-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
        How {player.position ?? 'they'} rank this season
      </h3>
      <div className="space-y-1">
        {positionPeers.map((row) =>
          row == null
            ? <div key="ellipsis" className="text-xs text-[var(--color-text-faintest)] px-2 py-0.5">· · ·</div>
            : (
              <div key={row.player_id}
                className={`flex items-center gap-3 px-2 py-1.5 rounded text-sm transition-colors ${
                  row.player_id === playerId ? 'bg-[var(--c-indigo-50)] border border-[var(--c-indigo-200)]' : 'hover:bg-[var(--color-surface-2)]'
                }`}>
                <PosRankBadge position={row.position} rank={row.positionRank} />
                <span className={`flex-1 font-medium truncate ${row.player_id === playerId ? 'text-[var(--c-indigo-800)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {row.full_name}
                </span>
                <span className={`tabular-nums text-sm font-medium ${row.player_id === playerId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-faint)]'}`}>
                  {row.currentSeasonPPG.toFixed(1)}
                </span>
              </div>
            )
        )}
      </div>
    </section>
  ) : null

  const CompsSection = (comps !== null && comps.length > 0) ? (
    <section>
      <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">Career Comparables</h3>
      {(
        <div className="space-y-4">
          {comps.map(comp => (
            <div key={comp.player_id}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">{comp.full_name}</span>
                <span className="text-xs text-[var(--c-indigo-500)] font-medium tabular-nums">{comp.similarity}% match</span>
              </div>
              <CompSparkline targetArc={comp.targetVector} compArc={comp.candidateVector} />
              {comp.theirSubsequentSeasons.length > 0 && (
                <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                  Went on to avg{' '}
                  <span className="font-medium text-[var(--color-text-semi-muted)]">
                    {(comp.theirSubsequentSeasons.slice(0, 2).reduce((a, b) => a + b, 0) /
                      Math.min(comp.theirSubsequentSeasons.length, 2) *
                      (positionPeakPPG?.[player.position] ?? 20)
                    ).toFixed(1)} PPG
                  </span>
                  {' '}over next {Math.min(comp.theirSubsequentSeasons.length, 2)} season
                  {Math.min(comp.theirSubsequentSeasons.length, 2) !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}
          {projectedPPG != null && (
            <p className="text-xs text-[var(--color-text-muted)] pt-1 border-t">
              Players with similar trajectories at this career stage averaged{' '}
              <span className="font-semibold text-[var(--color-text-secondary)]">{projectedPPG} PPG</span> over their next 2 seasons.
            </p>
          )}
        </div>
      )}
    </section>
  ) : null

  // ── Dynasty tab ──────────────────────────────────────────────────────────
  const DynastySection = (() => {
    if (!dynastyScore) return (
      <div className="px-6 py-8 text-sm text-[var(--color-text-faint)] italic">
        No dynasty data available.
      </div>
    )

    const cmp = dynastyScore.components
    const sig = dynastyScore.signals ?? {}

    // ── Spider chart players (1 or 2 for comparison) ─────────────────────
    let spiderPlayers = null
    let compName = null
    if (cmp) {
      spiderPlayers = [{
        label:  player.full_name ?? playerId,
        color:  'var(--color-compare-1)',
        values: {
          ageAdjusted:  cmp.ageAdjusted?.value     ?? 0,
          trajectory:   cmp.trajectory?.value      ?? 0,
          currentLevel: cmp.currentLevel?.value    ?? 0,
          opportunity:  cmp.opportunityQuality?.value ?? 0,
          reliability:  cmp.reliability?.value     ?? 0,
        },
      }]
      // Comparison overlay: other player in comparisonList
      if (comparisonList?.length >= 2 && comparisonList.includes(playerId)) {
        const otherId = comparisonList.find(id => id !== playerId)
        const otherRow = allPlayerRows?.find(r => r.player_id === otherId)
        const oc = otherRow?.dynastyScore?.components
        if (oc) {
          compName = otherRow.full_name
          spiderPlayers.push({
            label: otherRow.full_name,
            color: 'var(--color-compare-2)',
            values: {
              ageAdjusted:  oc.ageAdjusted?.value     ?? 0,
              trajectory:   oc.trajectory?.value      ?? 0,
              currentLevel: oc.currentLevel?.value    ?? 0,
              opportunity:  oc.opportunityQuality?.value ?? 0,
              reliability:  oc.reliability?.value     ?? 0,
            },
          })
        }
      }
    }

    // ── Plain English summary (template combinations) ────────────────────
    let summary = null
    if (dynastyScore.confidence === 'prospect') {
      summary = 'Prospect projection — score based on age, position prior, draft capital, and KTC market value. Full component analysis becomes available after the player has qualifying seasons.'
    } else if (dynastyScore.confidence === 'none') {
      summary = 'Limited NFL data — score reflects market value where available. Component analysis unavailable until qualifying seasons exist.'
    } else if (cmp) {
      const hi = v => v >= 65, lo = v => v < 35
      const age = cmp.ageAdjusted.value
      const traj = cmp.trajectory.value
      const lvl  = cmp.currentLevel.value
      const opp  = cmp.opportunityQuality.value
      const rel  = cmp.reliability.value
      if      (hi(age) && lo(traj))      summary = 'Performing well relative to age expectations but career trajectory is declining — late-career production may not last.'
      else if (hi(opp) && lo(rel))       summary = 'Entrenched starting role with strong volume, but injury history creates floor risk.'
      else if (hi(traj) && hi(age))      summary = 'Young and ascending — beating age curve expectations and trending upward.'
      else if (hi(lvl) && hi(rel))       summary = 'Consistent high-end producer — strong current level paired with reliable durability and consistency.'
      else if (lo(lvl) && lo(opp))       summary = 'Limited current production and constrained opportunity — score reflects depth-piece role.'
      else if (hi(rel) && lo(traj))      summary = 'Reliable but plateauing — durability is a strength but career arc is flattening.'
      else                                summary = 'Mixed signals across components — see the breakdown below for the full picture.'
    }

    // ── Active signal badges ─────────────────────────────────────────────
    const badges = []
    if (sig.isBreakout)   badges.push({ key:'breakout',  label:'⚡ Breakout',  color:'bg-[var(--c-green-100)] text-[var(--c-green-700)]',
      tooltip:'Performing 30%+ above age-curve expectation — outperforming peers at this age' })
    if (sig.isBounceBack) badges.push({ key:'bounceback', label:'↩ Bounce-back', color:'bg-[var(--c-blue-100)] text-[var(--c-blue-700)]',
      tooltip:'Strong return after injury-shortened season' })
    if (sig.momentumLabel === 'accelerating') badges.push({ key:'accel', label:'↑↑ Accelerating', color:'bg-[var(--c-teal-100)] text-[var(--c-teal-700)]',
      tooltip:'Production significantly higher in last 2 seasons vs prior 2' })
    if (sig.momentumLabel === 'decelerating') badges.push({ key:'decel', label:'↓↓ Decelerating', color:'bg-[var(--c-orange-100)] text-[var(--c-orange-700)]',
      tooltip:'Production significantly lower in last 2 seasons vs prior 2' })
    if (sig.isTdReliant)  badges.push({ key:'td', label:'⚠ TD-reliant', color:'bg-[var(--c-yellow-100)] text-[var(--c-yellow-800)]',
      tooltip:`${Math.round((sig.tdDependency ?? 0) * 100)}% of points from touchdowns — production may be volatile if red zone usage changes` })
    if ((sig.injurySeasonCount ?? 0) >= 2) badges.push({ key:'injury', label:'⚠ Injury risk', color:'bg-[var(--c-amber-100)] text-[var(--c-amber-700)]',
      tooltip:`${sig.injurySeasonCount} seasons with fewer than 10 games played — durability concern` })
    if (sig.ageCurveFactor != null) {
      const above = sig.ageCurveFactor >= 1
      badges.push({ key:'agecurve', label:`Age curve ×${sig.ageCurveFactor}`, color:'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]',
        tooltip:`Performing ${above ? 'above' : 'below'} expected level for a ${player.position ?? '?'} aged ${player.age ?? '?'}` })
    }

    // ── Confidence dot + label ───────────────────────────────────────────
    const conf = dynastyScore.confidence
    const confDot = ({ high:'bg-[var(--color-conf-dot-high)]', moderate:'bg-[var(--color-conf-dot-moderate)]' })[conf] ?? 'bg-[var(--color-conf-dot-default)]'
    const confText = ({
      high:     'High confidence · 5+ seasons',
      moderate: 'Moderate confidence · 3–4 seasons',
      low:      'Low confidence · 1–2 seasons',
      prospect: 'Rookie projection',
      none:     'Limited data',
    })[conf] ?? conf

    return (
      <div className="px-6 py-5 space-y-6">
        {/* ── 1. Spider chart + score summary ───────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex-shrink-0">
              {spiderPlayers ? (
                <SpiderChart players={spiderPlayers} size={260} />
              ) : (
                <div className="w-[260px] h-[260px] flex items-center justify-center text-xs text-[var(--color-text-faint)] italic border border-dashed border-[var(--color-border)] rounded">
                  Component breakdown not available
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-[var(--color-accent)] tabular-nums leading-none">
                  {dynastyScore.score ?? '—'}
                </span>
                <span className="text-sm text-[var(--color-text-faint)]">/100</span>
              </div>
              {dynastyScore.label !== 'N/A' && (
                <span className={`inline-block text-xs px-2 py-0.5 rounded font-semibold ${dynastyLabelColor(dynastyScore.label, dynastyScore.confidence)}`}>
                  {dynastyScore.label}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span className={`w-1.5 h-1.5 rounded-full ${confDot}`} />
                <span>{confText}</span>
              </div>
              {summary && <p className="text-xs text-[var(--color-text-semi-muted)] leading-relaxed mt-2">{summary}</p>}
              {compName && (
                <p className="text-xs text-[var(--c-emerald-700)] italic mt-2">
                  Comparing with {compName}. Select comparison view to see full side-by-side.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. Signal badges ──────────────────────────────────────────── */}
        {badges.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">Signals</h3>
            <div className="flex flex-wrap gap-2">
              {badges.map(b => (
                <Tooltip key={b.key} content={b.tooltip} position="top">
                  <span className={`text-xs px-2 py-0.5 rounded ${b.color} cursor-help`}>{b.label}</span>
                </Tooltip>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Collapsible score breakdown ───────────────────────────── */}
        {cmp && (
          <section>
            <button
              onClick={() => setBreakdownOpen(o => !o)}
              className="text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] flex items-center gap-1.5"
            >
              <span className="text-[var(--color-text-faint)] text-xs">{breakdownOpen ? '▼' : '▸'}</span>
              {breakdownOpen ? 'Hide' : 'Show'} score breakdown
            </button>
            {breakdownOpen && (
              <div className="mt-3">
                <p className="text-xs text-[var(--color-text-muted)] italic mb-3">
                  How the dynasty score is calculated — weights show each component's contribution to the overall score.
                </p>
                {DynastyScoreSection}
              </div>
            )}
          </section>
        )}

        {/* ── 4. Market analysis ───────────────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">Market Comparison</h3>
          {ktcValue == null ? (
            <p className="text-xs text-[var(--color-text-faint)] italic">No KTC market data available for this player.</p>
          ) : (dynRank == null || ktcRank == null) ? (
            <p className="text-xs text-[var(--color-text-faint)] italic">Rank data still loading…</p>
          ) : divergenceSignal ? (
            <div>
              <div className="flex items-center justify-around bg-[var(--color-surface-2)] rounded-lg py-4 px-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--color-accent-text)] tabular-nums">{player.position}{dynRank}</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1">Our rank</div>
                </div>
                <div className="text-2xl text-[var(--color-text-faintest)]">vs</div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--c-slate-700)] tabular-nums">{player.position}{ktcRank}</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1">KTC rank</div>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-semi-muted)] leading-relaxed mt-3">
                {divergenceSignal === 'undervalued'
                  ? <>📈 Our analysis ranks this player significantly higher than KTC market consensus. This could indicate a <span className="font-semibold text-[var(--c-green-700)]">trade target</span> — the market may not be fully pricing in recent performance.</>
                  : <>📉 KTC market consensus ranks this player significantly higher than our analysis suggests. The market may be pricing in factors (name value, injury recovery optimism) our model doesn't capture.</>}
              </p>
            </div>
          ) : (
            <div className="text-xs text-[var(--color-text-semi-muted)]">
              <span className="font-medium text-[var(--color-text-secondary)]">Our rank:</span> {player.position}{dynRank}
              <span className="text-[var(--color-text-faintest)] mx-2">·</span>
              <span className="font-medium text-[var(--color-text-secondary)]">KTC rank:</span> {player.position}{ktcRank}
              <p className="mt-1 italic text-[var(--color-text-muted)]">Our analysis and market consensus are broadly aligned.</p>
            </div>
          )}
        </section>
      </div>
    )
  })()

  // ── Team depth chart section ─────────────────────────────────────────────
  const POS_COLORS = { QB: 'text-[var(--c-red-500)]', RB: 'text-[var(--c-green-600)]', WR: 'text-[var(--c-blue-500)]', TE: 'text-[var(--c-yellow-600)]' }
  const POSITIONS_ORDER = ['QB', 'RB', 'WR', 'TE']

  const TeamSection = (() => {
    if (!player.team) {
      return (
        <div className="px-6 py-8 text-sm text-[var(--color-text-faint)] italic">
          Player is not currently on an NFL roster.
        </div>
      )
    }
    if (!teamDepthChart) return null

    const hasAnyPlayers = POSITIONS_ORDER.some(p => teamDepthChart[p]?.length > 0)
    if (!hasAnyPlayers) {
      return (
        <div className="px-6 py-8 text-sm text-[var(--color-text-faint)] italic">
          No depth chart data available for {player.team}.
        </div>
      )
    }

    return (
      <div className="px-6 py-5 space-y-5">
        {POSITIONS_ORDER.map(pos => {
          const group = teamDepthChart[pos]
          if (!group || group.length === 0) return null
          return (
            <div key={pos} className="flex gap-4">
              {/* Position label */}
              <div className="w-8 flex-shrink-0 pt-1">
                <span className={`text-xs font-bold uppercase tracking-wide ${POS_COLORS[pos]}`}>{pos}</span>
              </div>
              {/* Player list */}
              <div className="flex-1 space-y-1">
                {group.map(p => {
                  const isProfiled = p.player_id === playerId
                  const depthBadge = p.depthOrder === 1
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-green-100)] text-[var(--c-green-700)] font-bold flex-shrink-0">STR</span>
                    : p.depthOrder === 2
                      ? <span className="text-[10px] w-5 h-5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-muted)] font-medium flex items-center justify-center flex-shrink-0">2</span>
                      : p.depthOrder <= 98
                        ? <span className="text-[10px] w-5 h-5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-faint)] font-medium flex items-center justify-center flex-shrink-0">3+</span>
                        : <span className="w-5 flex-shrink-0" />

                  return (
                    <button
                      key={p.player_id}
                      onClick={() => !isProfiled && onSelectPlayer?.(p.player_id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                        isProfiled
                          ? 'bg-[var(--c-indigo-50)] border border-[var(--c-indigo-200)] cursor-default'
                          : 'hover:bg-[var(--color-surface-2)] cursor-pointer'
                      }`}
                    >
                      {depthBadge}
                      <span className={`flex-1 text-sm truncate ${isProfiled ? 'font-semibold text-[var(--c-indigo-900)]' : 'font-medium text-[var(--color-text-secondary)]'}`}>
                        {p.full_name}
                      </span>
                      {p.age != null && (
                        <span className="text-xs text-[var(--color-text-faint)] flex-shrink-0">{p.age}</span>
                      )}
                      {p.dynastyLabel && p.dynastyConf !== 'none' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${dynastyLabelColor(p.dynastyLabel, p.dynastyConf)}`}>
                          {p.dynastyLabel}
                        </span>
                      )}
                      {p.ktcValue != null && (
                        <span className="text-[10px] tabular-nums text-[var(--color-text-faint)] flex-shrink-0 font-mono">
                          {p.ktcValue.toLocaleString()}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  })()

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[580px] xl:w-[720px] bg-[var(--color-surface)] shadow-2xl z-50 flex flex-col">

      {/* Header — 4 rows */}
      {(() => {
        // ── Compare button ─────────────────────────────────────────────────
        const isSelected = comparisonList.includes(playerId)
        const listFull   = comparisonList.length >= 4
        const CompareBtn = isSelected ? (
          <button onClick={() => removeFromComparison(playerId)}
            className="text-xs px-2 py-1 rounded bg-[var(--c-blue-100)] text-[var(--c-blue-700)] hover:bg-[var(--c-red-50)] hover:text-[var(--c-red-600)] transition-colors">
            ✓ In comparison
          </button>
        ) : listFull ? (
          <Tooltip content="Remove a player first" position="bottom">
            <button disabled className="text-xs px-2 py-1 rounded bg-[var(--color-surface-2)] text-[var(--color-text-faintest)] cursor-not-allowed">
              + Compare
            </button>
          </Tooltip>
        ) : (
          <button onClick={() => addToComparison(playerId)}
            className="text-xs px-2 py-1 rounded bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:bg-[var(--c-blue-50)] hover:text-[var(--c-blue-600)] transition-colors">
            + Compare
          </button>
        )

        // ── Score chip confidence dot ──────────────────────────────────────
        const confDotColor = ({
          high: 'bg-[var(--color-conf-dot-high)]', moderate: 'bg-[var(--color-conf-dot-moderate)]',
        })[dynastyScore?.confidence] ?? 'bg-[var(--color-conf-dot-default)]'

        // ── Rank narrative line ────────────────────────────────────────────
        let narrative = null
        if (recentRank != null && dynastyRank != null) {
          const gap = dynastyRank - recentRank
          if (gap >= 5) {
            narrative = 'Performing above long-term projection — potential sell window while value is high'
          } else if (gap <= -5) {
            narrative = 'Long-term projection stronger than current output — potential buy-low target'
          }
        }

        // ── Rankings legend tooltip content ────────────────────────────────
        const rankingsLegend =
          'Recent: PPG rank this season vs all active players at position\n' +
          'Peak: Best single-season rank in career — ceiling\n' +
          'Consist: Weighted avg rank across last 3 seasons — reliability (50/30/20%)\n' +
          'Outlook: Forward-looking rank by dynasty score\n' +
          'Role: Rank by multi-season carry/target share\n' +
          'Next Szn: Projected rank by next season PPG'

        // ── Projection factor chips ────────────────────────────────────────
        const projFactors = projection?.confidence === 'rookie'
          ? (() => {
              const out = []
              if (projection.factors?.ktcPct != null) out.push(`KTC ${Math.round(projection.factors.ktcPct)}th pct`)
              if (collegeMetrics?.peakDominator != null) out.push(player.position === 'QB'
                ? `College ${collegeMetrics.peakDominator.toFixed(0)} pass score`
                : `College ${collegeMetrics.peakDominator.toFixed(0)}% dom`)
              return out.slice(0, 3)
            })()
          : (projection?.adjustmentSummary?.slice(0, 3) ?? [])

        const projConfBadge = ({
          high:   { color: 'bg-[var(--c-indigo-100)] text-[var(--c-indigo-700)]', label: 'High' },
          medium: { color: 'bg-[var(--c-blue-50)] text-[var(--c-blue-700)]',      label: 'Medium' },
          low:    { color: 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]', label: 'Low' },
          rookie: { color: 'bg-[var(--c-purple-50)] text-[var(--c-purple-700)]',  label: 'Rookie' },
        })[projection?.confidence]

        return (
          <div className="flex-shrink-0 border-b bg-[var(--color-surface-2)] divide-y divide-[var(--color-border)]">
            {/* ROW 1 — Identity */}
            <div className="px-6 pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-[var(--color-text)] truncate flex-1 min-w-0">{player.full_name ?? playerId}</h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {CompareBtn}
                  <button onClick={onClose} aria-label="Close"
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] text-2xl leading-none font-light">×</button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-[var(--color-text-muted)]">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--color-surface-4)] text-[var(--color-text-secondary)]">{player.position ?? '?'}</span>
                <span>{player.team ?? 'FA'}</span>
                {player.age != null && <><span className="text-[var(--color-text-faintest)]">·</span><span>Age {player.age}</span></>}
                {player.years_exp != null && <><span className="text-[var(--color-text-faintest)]">·</span><span>Year {player.years_exp + 1}</span></>}
                {careerTotalPts > 0 && (
                  <>
                    <span className="text-[var(--color-text-faintest)]">·</span>
                    <Tooltip content="Total fantasy points across all seasons in career history, calculated using your league's scoring settings." position="bottom">
                      <span className="cursor-help">Career: {careerTotalPts.toLocaleString()} pts</span>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>

            {/* ROW 2 — Status */}
            <div className="px-6 py-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap items-center gap-2">
                  {dynastyScore && dynastyScore.label !== 'N/A' && (
                    <Tooltip content="Forward-looking dynasty outlook label based on age curve, trajectory, opportunity, and reliability." position="bottom">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${dynastyLabelColor(dynastyScore.label, dynastyScore.confidence)}`}>
                        {dynastyScore.label}
                      </span>
                    </Tooltip>
                  )}
                  {dynastyScore?.score != null && dynastyScore.confidence !== 'prospect' && dynastyScore.confidence !== 'none' && (
                    <Tooltip content="Dynasty score out of 100. Dot shows data confidence — green means 5+ seasons of data, yellow is moderate, grey is limited." position="bottom">
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] font-mono tabular-nums inline-flex items-center gap-1.5 cursor-help">
                        <span className={`w-1.5 h-1.5 rounded-full ${confDotColor}`} />
                        {dynastyScore.score}/100
                      </span>
                    </Tooltip>
                  )}
                  {ownership
                    ? <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)]">{ownership}</span>
                    : <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-green-50)] text-[var(--c-green-700)] border border-[var(--c-green-200)]">Free Agent</span>}
                </div>
                <div className="flex items-center gap-2">
                  {ktcValue != null && (
                    <Tooltip content="KeepTradeCut dynasty value — crowd-sourced from dynasty managers. Scale 0–10000." position="bottom">
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-slate-100)] text-[var(--c-slate-700)] font-mono tabular-nums">
                        KTC {ktcValue.toLocaleString()}
                      </span>
                    </Tooltip>
                  )}
                  {divergenceSignal === 'undervalued' && dynRank != null && ktcRank != null && (
                    <Tooltip content={`Our dynasty score ranks this player ${player.position}${dynRank} at their position. KTC market consensus ranks them ${player.position}${ktcRank}. A gap this large suggests the market may be undervaluing what our stats show.`} position="bottom">
                      <span className="text-xs px-2 py-1 rounded bg-[var(--c-green-50)] text-[var(--c-green-700)] border border-[var(--c-green-200)] font-medium">
                        📈 Stats ahead · Our {player.position}{dynRank} · KTC {player.position}{ktcRank}
                      </span>
                    </Tooltip>
                  )}
                  {divergenceSignal === 'overvalued' && dynRank != null && ktcRank != null && (
                    <Tooltip content={`KTC market consensus ranks this player ${player.position}${ktcRank} at their position. Our dynasty score ranks them ${player.position}${dynRank}. A gap this large suggests the market may be pricing in factors our stats don't capture.`} position="bottom">
                      <span className="text-xs px-2 py-1 rounded bg-[var(--c-orange-50)] text-[var(--c-orange-700)] border border-[var(--c-orange-200)] font-medium">
                        📉 Market ahead · Our {player.position}{dynRank} · KTC {player.position}{ktcRank}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              {dynastyScore?.confidence === 'prospect' && (dynastyScore.signals?.draftCapital || dynastyScore.signals?.ktcInfluenced) && (
                <p className="text-xs text-[var(--c-purple-700)] mt-1">
                  {dynastyScore.signals?.draftCapital
                    ? `Dynasty rookie pick: R${dynastyScore.signals.draftCapital.round} P${dynastyScore.signals.draftCapital.pick}`
                    : 'Prospect score based on KTC dynasty value + age/position prior'}
                </p>
              )}
            </div>

            {/* ROW 3 — Rankings */}
            {(recentRank != null || dynastyRank != null) && (
              <div className="px-6 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {[
                    { label: 'Recent',  value: recentRank,    color:
                        movementLabel === 'up' ? 'text-[var(--c-green-600)]'
                        : movementLabel === 'down' ? 'text-[var(--c-orange-500)]'
                        : 'text-[var(--color-text-secondary)]',
                      suffix: movementLabel === 'up' ? '↑' : movementLabel === 'down' ? '↓' : '' },
                    { label: 'Peak',    value: peakRank,        color: 'text-[var(--color-text-secondary)]' },
                    { label: 'Consist', value: consistencyRank, color: 'text-[var(--color-text-secondary)]' },
                    { label: 'Outlook', value: dynastyRank,     color: 'text-[var(--color-text-secondary)]' },
                    { label: 'Role',    value: roleRank,
                      color: roleRank != null ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-faintest)]' },
                    { label: 'Next Szn', value: nextSeasonRank,
                      color: nextSeasonRank == null ? 'text-[var(--color-text-faintest)]'
                        : projection?.confidence === 'high' ? 'text-[var(--color-accent-text)]'
                        : projection?.confidence === 'medium' ? 'text-[var(--color-accent)]'
                        : projection?.confidence === 'rookie' ? 'text-[var(--c-purple-600)]'
                        : 'text-[var(--color-text-muted)]' },
                  ].map(({ label, value, color, suffix }) => (
                    <div key={label} className="flex flex-col items-center">
                      <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wide leading-none mb-0.5">{label}</span>
                      <span className={`text-sm font-semibold tabular-nums ${color}`}>
                        {value != null ? `${player.position}${value}${suffix ?? ''}` : '—'}
                      </span>
                    </div>
                  ))}
                  <Tooltip content={rankingsLegend} position="bottom">
                    <span className="text-[var(--color-text-faintest)] hover:text-[var(--color-text-muted)] cursor-help text-xs ml-1">ⓘ</span>
                  </Tooltip>
                </div>
                {narrative && (
                  <p className="text-xs italic text-[var(--color-text-muted)] mt-2">{narrative}</p>
                )}
              </div>
            )}

            {/* ROW 4 — Season Projection (compact inline) */}
            {projection && (
              <div className="px-6 py-2.5 bg-[var(--c-indigo-50)]/40">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs text-[var(--color-text-muted)]">Next season:</span>
                  <Tooltip content="Projected PPG based on weighted recent performance adjusted for age curve, role trend, team context, and historical durability. Not a guarantee — wider range for low-confidence players." position="bottom">
                    <span className="text-sm font-semibold text-[var(--color-accent-text)] tabular-nums cursor-help">
                      ~{projection.projectedPPG.toFixed(1)} PPG
                    </span>
                  </Tooltip>
                  <span className="text-xs text-[var(--color-text-muted)] tabular-nums">·</span>
                  <span className="text-xs text-[var(--color-text-semi-muted)] tabular-nums">~{Math.round(projection.projectedTotalPts)} pts</span>
                  <span className="text-xs text-[var(--color-text-muted)] tabular-nums">·</span>
                  <span className="text-xs text-[var(--color-text-semi-muted)] tabular-nums">{projection.projectedGames} games</span>
                  {projConfBadge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${projConfBadge.color}`}>
                      {projConfBadge.label}
                    </span>
                  )}
                  {projFactors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 ml-1">
                      {projFactors.map((f, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-semi-muted)]">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tab nav */}
      <div className="flex-shrink-0 flex border-b bg-[var(--color-surface)] px-6">
        {[
          { id: 'stats',   label: 'Stats' },
          { id: 'dynasty', label: 'Dynasty' },
          { id: 'team',    label: `Team${player.team ? ` · ${player.team}` : ''}` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'team' ? TeamSection
         : activeTab === 'dynasty' ? DynastySection
         : (
        <>
        <div className="px-6 py-5 space-y-6 min-w-0">
          {CareerSection}
          {AdvancedStatsSection}
          {CollegeSection}
          {PositionContextSection}
          {CompsSection}
        </div>

        {availableSeasons.length > 0 && (
          <div className="border-t px-6 py-5">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setWeeklyOpen(o => !o)}
                className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                <span className="text-[var(--color-text-faint)] text-xs">{weeklyOpen ? '▼' : '▶'}</span>
                Season Detail
              </button>
              <select value={focusSeason} onChange={e => setFocusSeason(Number(e.target.value))}
                className="text-xs border border-[var(--color-border)] rounded px-2 py-0.5 text-[var(--color-text-semi-muted)] bg-[var(--color-surface)]">
                {[...availableSeasons].reverse().map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {focusSeasonData.gamesPlayed != null && (
                <span className="text-xs text-[var(--color-text-faint)] ml-auto">
                  {focusSeasonData.gamesPlayed} games · {focusSeasonData.fantasyPoints?.toFixed(1)} pts
                </span>
              )}
            </div>

            {weeklyOpen && (
              <div className="space-y-4">
                {hasWeeklyData && <WeeklyBarChart weeklyPoints={weeklyPoints} />}
                <div>
                  <div className="grid grid-cols-9 gap-1 text-center">
                    {Array.from({ length: 18 }, (_, i) => {
                      const week = i + 1
                      const pts  = weeklyPoints[week]
                      return (
                        <div key={week} className={`rounded py-1 px-0.5 ${pts != null ? 'bg-[var(--c-blue-50)]' : 'bg-[var(--color-surface-2)]'}`}>
                          <div className="text-[var(--color-text-faint)] text-xs leading-none mb-0.5">W{week}</div>
                          <div className={`font-medium tabular-nums text-xs leading-none ${pts != null ? 'text-[var(--color-text)]' : 'text-[var(--color-text-faintest)]'}`}>
                            {pts != null ? pts.toFixed(1) : '—'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-right text-xs text-[var(--color-text-faint)] mt-1">
                    {Object.keys(weeklyPoints).length} weeks with data
                    {focusSeasonData.fantasyPoints != null && (
                      <> · sum <span className="font-semibold text-[var(--color-text-semi-muted)]">{focusSeasonData.fantasyPoints.toFixed(1)}</span></>
                    )}
                  </div>
                </div>
                {rawStats.length > 0 && (
                  <details>
                    <summary className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] cursor-pointer select-none">
                      Raw stat totals ({focusSeason}) — {rawStats.length} non-zero keys
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs font-mono bg-[var(--color-surface-2)] rounded p-3 max-h-52 overflow-y-auto">
                      {rawStats.map(([key, val]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <span className="text-[var(--color-text-muted)] truncate">{key}</span>
                          <span className="font-semibold text-[var(--color-text-secondary)] flex-shrink-0">
                            {typeof val === 'number'
                              ? Number.isInteger(val) ? val : val.toFixed(3).replace(/\.?0+$/, '')
                              : val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comparison tray
// ---------------------------------------------------------------------------
function ComparisonTray({ comparisonList, playerRows, playerMap, onRemove, onClear }) {
  const [showModal, setShowModal] = useState(false)
  const canCompare = comparisonList.length >= 2

  function getPlayerInfo(playerId) {
    const row = playerRows?.find(r => r.player_id === playerId)
    if (row) return { name: row.full_name, position: row.position, dynastyLabel: row.dynastyScore?.label ?? null, confidence: row.dynastyScore?.confidence ?? null }
    const p = playerMap?.[playerId]
    return { name: p?.full_name ?? playerId, position: p?.position ?? '?', dynastyLabel: null, confidence: null }
  }

  return (
    <>
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-lg">
        <div className="max-w-5xl mx-auto px-8 py-3 flex items-center gap-4">
          <span className="text-sm font-semibold text-[var(--color-text-semi-muted)] flex-shrink-0">Compare</span>
          <div className="flex gap-2 flex-1 min-w-0 overflow-x-auto">
            {comparisonList.map(playerId => {
              const info = getPlayerInfo(playerId)
              return (
                <div key={playerId}
                  className="flex items-center gap-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs min-w-0 flex-shrink-0 max-w-52">
                  <span className="font-semibold text-[var(--color-text-muted)] flex-shrink-0">{info.position}</span>
                  <span className="font-medium text-[var(--color-text-secondary)] truncate">{info.name}</span>
                  {info.dynastyLabel && info.dynastyLabel !== 'N/A' && (
                    <span className={`px-1 py-0.5 rounded text-xs flex-shrink-0 ${dynastyLabelColor(info.dynastyLabel, info.confidence)}`}>
                      {info.dynastyLabel}
                    </span>
                  )}
                  <button onClick={() => onRemove(playerId)} aria-label={`Remove ${info.name}`}
                    className="text-[var(--color-text-faintest)] hover:text-[var(--c-red-500)] transition-colors ml-0.5 flex-shrink-0 leading-none">
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={onClear}
              className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] underline underline-offset-2">
              Clear all
            </button>
            <button
              onClick={() => canCompare && setShowModal(true)}
              disabled={!canCompare}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                canCompare ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]' : 'bg-[var(--color-surface-3)] text-[var(--color-text-faint)] cursor-not-allowed'
              }`}>
              Compare players
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Player Comparison</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-5">Player comparison coming soon.</p>
            <button onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded text-sm font-medium hover:bg-[var(--color-accent-hover)]">
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Players explorer tab
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50

const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN',
  'DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA',
  'MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB',
  'TEN','WAS',
]

const DYNASTY_GROUP_MAP = {
  Prospects:   ['Elite Prospect', 'High Prospect', 'Prospect', 'Late Prospect', 'Unranked Prospect'],
  Rising:      ['Breakout', 'Ascending Star', 'Developing', 'Rising', 'Bounce-back'],
  Established: ['Elite', 'Peak Window', 'Solid Floor', 'Plateau', 'Veteran Producer'],
  Declining:   ['Managed Decline', 'Sell Now', 'Fading', 'Limited Data'],
}
const DYNASTY_GROUPS = Object.keys(DYNASTY_GROUP_MAP)

const DEFAULT_FILTER_STATE = {
  startersOnly:  false,
  rookiesOnly:   false,
  ageRange:      [18, 45],
  expRange:      [0, 20],
  availability:  'all',    // 'all' | 'myRoster' | 'available' | 'nflFreeAgent'
  nflTeams:      [],
  fantasyTeams:  [],
  dynastyGroups: [],
  marketSignal:  'all',    // 'all' | 'undervalued' | 'overvalued'
  ktcRange:      [0, 10000],
}

const LS_PRESETS = 'explorer-presets'
const LS_SORT    = 'explorer-sort'

function defaultSortForPosition(pos) {
  return pos === 'ALL'
    ? { column: 'currentSeasonPPG', direction: 'desc' }
    : { column: 'recentRank',       direction: 'asc'  }
}

function countActiveFilters(s) {
  let n = 0
  if (s.startersOnly)                                 n++
  if (s.rookiesOnly)                                  n++
  if (s.ageRange[0] !== 18 || s.ageRange[1] !== 45)   n++
  if (s.expRange[0] !== 0  || s.expRange[1] !== 20)   n++
  if (s.availability !== 'all')                       n++
  if (s.nflTeams.length > 0)                          n++
  if (s.fantasyTeams.length > 0)                      n++
  if (s.dynastyGroups.length > 0)                     n++
  if (s.marketSignal !== 'all')                       n++
  if (s.ktcRange[0] !== 0 || s.ktcRange[1] !== 10000) n++
  return n
}

const TREND_ORDER = { up: 0, flat: 1, down: 2, insufficient: 3 }

const OUTLOOK_ORDER = {
  'Breakout': 0, 'Elite Prospect': 1, 'Elite': 2, 'Ascending Star': 3,
  'High Prospect': 4, 'Peak Window': 5, 'Bounce-back': 6,
  'Prospect': 7, 'Developing': 8, 'Rising': 9, 'Solid Floor': 10,
  'Late Prospect': 11, 'Unranked Prospect': 12,
  'Plateau': 13, 'Veteran Producer': 14, 'Managed Decline': 15, 'Sell Now': 16, 'Fading': 17,
  'Limited Data': 18,
}

// ---------------------------------------------------------------------------
// Filter sidebar — collapsible sections, dual-handle ranges, multiselects
// ---------------------------------------------------------------------------

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--color-border)]">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide hover:bg-[var(--color-surface-2)]">
        <span>{title}</span>
        <span className="text-[var(--color-text-faint)] text-[10px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function RangeSlider({ label, min, max, value, onChange, unit = '' }) {
  const [lo, hi] = value
  const setLo = v => onChange([Math.min(Number(v), hi), hi])
  const setHi = v => onChange([lo, Math.max(Number(v), lo)])
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-[var(--color-text-semi-muted)] mb-1.5">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-[var(--color-text-secondary)]">{lo}–{hi}{unit && ` ${unit}`}</span>
      </div>
      <div className="flex gap-2">
        <input type="range" min={min} max={max} value={lo} onChange={e => setLo(e.target.value)}
          className="flex-1 accent-indigo-500" />
        <input type="range" min={min} max={max} value={hi} onChange={e => setHi(e.target.value)}
          className="flex-1 accent-indigo-500" />
      </div>
    </div>
  )
}

function MultiSelect({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const toggle = opt => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div className="text-xs">
      <div className="text-[var(--color-text-semi-muted)] mb-1">{label}</div>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left border border-[var(--color-border)] rounded px-2 py-1.5 bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] flex items-center justify-between">
        <span className="text-[var(--color-text-muted)] truncate">
          {value.length === 0 ? placeholder : `${value.length} selected`}
        </span>
        <span className="text-[var(--color-text-faint)] text-[10px] flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {value.map(v => (
            <button key={v} onClick={() => toggle(v)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent-text)] hover:bg-[var(--c-red-50)] hover:text-[var(--c-red-600)] transition-colors">
              {v} ✕
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] max-h-44 overflow-y-auto">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full px-2 py-1.5 border-b border-[var(--color-border)] text-xs focus:outline-none" />
          <div className="py-1">
            {filtered.length === 0 && <div className="px-2 py-1 text-[var(--color-text-faint)] text-[11px]">No matches</div>}
            {filtered.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-surface-2)] cursor-pointer">
                <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
                  className="accent-indigo-500" />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSidebar({ filterState, setFilterState, onClose, onReset, fantasyTeamNames, ktcLoaded, presets, onSavePreset, onApplyPreset, onDeletePreset }) {
  const update = patch => setFilterState(s => ({ ...s, ...patch }))
  const [newPresetName, setNewPresetName] = useState('')
  const [showPresetInput, setShowPresetInput] = useState(false)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed inset-y-0 left-0 w-[280px] bg-[var(--color-surface)] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--color-text-secondary)]">Filters</span>
          <div className="flex items-center gap-3">
            <button onClick={onReset} className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-text)]">Reset all</button>
            <button onClick={onClose} aria-label="Close" className="text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] text-xl leading-none">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <CollapsibleSection title="Player">
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
              <input type="checkbox" checked={filterState.startersOnly}
                onChange={e => update({ startersOnly: e.target.checked })} className="accent-indigo-500" />
              Starters only
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
              <input type="checkbox" checked={filterState.rookiesOnly}
                onChange={e => update({ rookiesOnly: e.target.checked })} className="accent-indigo-500" />
              Rookies only
            </label>
            <RangeSlider label="Age" min={18} max={45} value={filterState.ageRange}
              onChange={v => update({ ageRange: v })} />
            <RangeSlider label="Experience" min={0} max={20} value={filterState.expRange}
              onChange={v => update({ expRange: v })} unit="yrs" />
          </CollapsibleSection>

          <CollapsibleSection title="Availability">
            {[
              { v: 'all',          label: 'All Players' },
              { v: 'myRoster',     label: 'My Roster' },
              { v: 'available',    label: 'Available' },
              { v: 'nflFreeAgent', label: 'NFL Free Agents' },
            ].map(opt => (
              <label key={opt.v} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
                <input type="radio" name="availability" value={opt.v}
                  checked={filterState.availability === opt.v}
                  onChange={() => update({ availability: opt.v })} className="accent-indigo-500" />
                {opt.label}
              </label>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Team">
            <MultiSelect label="NFL Team" placeholder="All NFL teams" options={NFL_TEAMS}
              value={filterState.nflTeams} onChange={v => update({ nflTeams: v })} />
            <MultiSelect label="Fantasy Team" placeholder="All fantasy teams" options={fantasyTeamNames ?? []}
              value={filterState.fantasyTeams} onChange={v => update({ fantasyTeams: v })} />
          </CollapsibleSection>

          <CollapsibleSection title="Dynasty">
            <div className="flex flex-wrap gap-1">
              {DYNASTY_GROUPS.map(g => {
                const selected = filterState.dynastyGroups.includes(g)
                return (
                  <button key={g} type="button"
                    onClick={() => update({
                      dynastyGroups: selected
                        ? filterState.dynastyGroups.filter(x => x !== g)
                        : [...filterState.dynastyGroups, g],
                    })}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      selected ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
                    }`}>
                    {g}
                  </button>
                )
              })}
            </div>

            <div>
              <div className="text-xs text-[var(--color-text-semi-muted)] mb-1.5">Market signal</div>
              {[
                { v: 'all',         label: 'All' },
                { v: 'undervalued', label: '📈 Undervalued' },
                { v: 'overvalued',  label: '📉 Overvalued' },
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
                  <input type="radio" name="marketSignal" value={opt.v}
                    checked={filterState.marketSignal === opt.v}
                    onChange={() => update({ marketSignal: opt.v })} className="accent-indigo-500" />
                  {opt.label}
                </label>
              ))}
            </div>

            {ktcLoaded && (
              <RangeSlider label="KTC" min={0} max={10000} value={filterState.ktcRange}
                onChange={v => update({ ktcRange: v })} />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Presets">
            {presets.length === 0 && (
              <p className="text-[11px] text-[var(--color-text-faint)] italic">No saved presets yet.</p>
            )}
            {presets.map(p => (
              <div key={p.name} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-[var(--color-text-secondary)]">{p.name}</span>
                <button onClick={() => onApplyPreset(p)}
                  className="text-[var(--color-accent)] hover:text-[var(--color-accent-text)]">Apply</button>
                <button onClick={() => onDeletePreset(p.name)} aria-label="Delete"
                  className="text-[var(--color-text-faint)] hover:text-[var(--c-red-600)]">✕</button>
              </div>
            ))}

            {showPresetInput ? (
              <div className="flex gap-1 mt-2">
                <input type="text" value={newPresetName} onChange={e => setNewPresetName(e.target.value)}
                  placeholder="Preset name" autoFocus
                  className="flex-1 border border-[var(--color-border)] rounded px-2 py-1 text-xs" />
                <button onClick={() => {
                    if (newPresetName.trim()) {
                      onSavePreset(newPresetName.trim())
                      setNewPresetName('')
                      setShowPresetInput(false)
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]">Save</button>
                <button onClick={() => { setShowPresetInput(false); setNewPresetName('') }}
                  className="text-xs px-1.5 py-1 text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)]">✕</button>
              </div>
            ) : (
              <button onClick={() => setShowPresetInput(true)}
                disabled={presets.length >= 5}
                className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-text)] disabled:text-[var(--color-text-faintest)] disabled:cursor-not-allowed mt-1">
                + Save current filters
              </button>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </>
  )
}

export function PlayersTab({ playerRows, loaded, careerStats, playerMap, positionPeakPPG, ktcMap,
                             historicalShares, collegeStats, seasonProjections, ktcHistory, enrichmentMap,
                             advStats,
                             myTeamName, fantasyTeamNames,
                             comparisonList, addToComparison, removeFromComparison, clearComparison }) {
  const [posFilter, setPosFilter] = useState('ALL')
  const [filterState, setFilterState] = useState(DEFAULT_FILTER_STATE)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sortState, setSortStateRaw] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LS_SORT))
      if (v && typeof v.column === 'string' && (v.direction === 'asc' || v.direction === 'desc')) return v
    } catch { /* fall through */ }
    return { column: 'currentSeasonPPG', direction: 'desc' }
  })
  const setSortState = useCallback(next => {
    setSortStateRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      localStorage.setItem(LS_SORT, JSON.stringify(value))
      return value
    })
  }, [])
  const sortKey = sortState.column
  const sortAsc = sortState.direction === 'asc'
  const [page, setPage] = useState(1)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const handleClosePanel = useCallback(() => setSelectedPlayerId(null), [])

  // Reset to page 1 whenever filters change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate reset; derived-state alternative viable if PlayersTab is reworked
  useEffect(() => { setPage(1) }, [filterState, posFilter, search])

  // ── Presets (localStorage-backed) ─────────────────────────────────────────
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_PRESETS)) ?? [] }
    catch { return [] }
  })
  const persistPresets = useCallback(next => {
    setPresets(next)
    localStorage.setItem(LS_PRESETS, JSON.stringify(next))
  }, [])
  const handleSavePreset = useCallback(name => {
    const next = [...presets.filter(p => p.name !== name), { name, state: filterState }].slice(-5)
    persistPresets(next)
  }, [presets, filterState, persistPresets])
  const handleApplyPreset = useCallback(p => {
    setFilterState({ ...DEFAULT_FILTER_STATE, ...p.state })
  }, [])
  const handleDeletePreset = useCallback(name => {
    persistPresets(presets.filter(p => p.name !== name))
  }, [presets, persistPresets])
  const handleResetFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTER_STATE)
    setSortState(defaultSortForPosition(posFilter))
  }, [posFilter, setSortState])

  const activeFilterCount = countActiveFilters(filterState)

  function handleSort(col) {
    setSortState(prev => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      // First-click defaults for new column
      const ascByDefault = col === 'full_name' || col === 'ownerTeamName' || col === 'dynastyScore'
        || col === 'recentRank' || col === 'dynastyRank' || col === 'peakRank' || col === 'consistencyRank'
        || col === 'roleRank' || col === 'ceilingRank' || col === 'floorRank'
      return { column: col, direction: ascByDefault ? 'asc' : 'desc' }
    })
    setPage(1)
  }

  function handlePosFilter(pos) {
    setPosFilter(pos)
    // Reset sort to the position default
    setSortState(defaultSortForPosition(pos))
    setPage(1)
  }

  const seasonRanks = useMemo(
    () => buildSeasonPositionRanks(careerStats, playerMap),
    [careerStats, playerMap]
  )   // { ranksByPlayer, refByPosRank }; careerStats may be null early → guarded in util

  const enrichedRows = useMemo(() => {
    const { ranksByPlayer, refByPosRank } = seasonRanks
    return playerRows.map(r => {
      const cf = computeCeilingFloor(ranksByPlayer.get(r.player_id), r.position, refByPosRank)
      return { ...r,
        _ceiling: cf?.ceiling ?? null, _floor: cf?.floor ?? null,
        ceilingRank: cf?.ceiling?.rank ?? null, floorRank: cf?.floor?.rank ?? null }
    })
  }, [playerRows, seasonRanks])

  const ktcDeltaById = useMemo(() => {
    const m = new Map()
    if (ktcHistory?.series) {
      for (const [id, s] of Object.entries(ktcHistory.series)) m.set(id, computeKtcRecentDelta(s))
    }
    return m
  }, [ktcHistory])

  const displayRows = useMemo(() => {
    let rows = enrichedRows
    const f = filterState

    // Position tabs (kept above the table)
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)

    // PLAYER section
    if (f.startersOnly) rows = rows.filter(r => playerMap?.[r.player_id]?.depth_chart_order === 1)
    if (f.rookiesOnly)  rows = rows.filter(r => r.years_exp === 0)
    if (f.ageRange[0] !== 18 || f.ageRange[1] !== 45) {
      rows = rows.filter(r => r.age != null && r.age >= f.ageRange[0] && r.age <= f.ageRange[1])
    }
    if (f.expRange[0] !== 0 || f.expRange[1] !== 20) {
      rows = rows.filter(r => r.years_exp != null && r.years_exp >= f.expRange[0] && r.years_exp <= f.expRange[1])
    }

    // AVAILABILITY section
    if (f.availability === 'myRoster') {
      rows = rows.filter(r => r.ownerTeamName != null && r.ownerTeamName === myTeamName)
    } else if (f.availability === 'available') {
      rows = rows.filter(r => r.ownerTeamName == null && r.nfl_team && r.nfl_team !== 'FA')
    } else if (f.availability === 'nflFreeAgent') {
      rows = rows.filter(r => !r.nfl_team || r.nfl_team === 'FA')
    }

    // TEAM section
    if (f.nflTeams.length > 0)     rows = rows.filter(r => f.nflTeams.includes(r.nfl_team))
    if (f.fantasyTeams.length > 0) rows = rows.filter(r => r.ownerTeamName && f.fantasyTeams.includes(r.ownerTeamName))

    // DYNASTY section
    if (f.dynastyGroups.length > 0) {
      const allowedLabels = new Set(f.dynastyGroups.flatMap(g => DYNASTY_GROUP_MAP[g] ?? []))
      rows = rows.filter(r => allowedLabels.has(r.dynastyScore?.label))
    }
    if (f.marketSignal === 'undervalued') rows = rows.filter(r => r.divergenceSignal === 'undervalued')
    if (f.marketSignal === 'overvalued')  rows = rows.filter(r => r.divergenceSignal === 'overvalued')
    if (f.ktcRange[0] !== 0 || f.ktcRange[1] !== 10000) {
      rows = rows.filter(r => r.ktcValue != null && r.ktcValue >= f.ktcRange[0] && r.ktcValue <= f.ktcRange[1])
    }

    // Search (always available above the table)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(r => r.full_name.toLowerCase().includes(q))
    }

    const dir = sortAsc ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'trend')
        return dir * ((TREND_ORDER[a.trend] ?? 3) - (TREND_ORDER[b.trend] ?? 3))
      if (sortKey === 'dynastyScore')
        return dir * ((OUTLOOK_ORDER[a.dynastyScore?.label] ?? 99) - (OUTLOOK_ORDER[b.dynastyScore?.label] ?? 99))
      const va = a[sortKey], vb = b[sortKey]
      if (va == null && vb == null) return 0
      if (va == null) return dir
      if (vb == null) return -dir
      if (typeof va === 'string') return dir * va.localeCompare(vb)
      return dir * (va - vb)
    })
  }, [enrichedRows, playerMap, posFilter, filterState, search, sortKey, sortAsc, myTeamName])

  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(safePage * PAGE_SIZE, totalCount)
  const sortProps = { sortKey, sortAsc, onSort: handleSort }

  return (
    <div className={comparisonList.length > 0 ? 'pb-28 md:pb-24' : ''}>
      {/* Controls — position tabs + filters button + search */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex gap-1">
          {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
            <button key={pos} onClick={() => handlePosFilter(pos)}
              className={`px-3 py-1 text-sm rounded transition-colors ${posFilter === pos ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'}`}>
              {pos}
            </button>
          ))}
        </div>
        <button onClick={() => setSidebarOpen(true)}
          className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1.5 ${
            activeFilterCount > 0
              ? 'bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent-text)] hover:bg-[var(--c-indigo-100)]'
              : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
          }`}>
          <span>⚙ Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-[var(--color-accent)] text-[var(--color-on-accent)] text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
        <input type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          className="border border-[var(--color-border)] rounded px-3 py-1 text-sm flex-1 min-w-36 max-w-xs" />
      </div>

      {!loaded && (
        <p className="text-sm text-[var(--color-text-faint)] mb-3 italic">Player data loading in background…</p>
      )}

      {sidebarOpen && (
        <FilterSidebar
          filterState={filterState}
          setFilterState={setFilterState}
          onClose={() => setSidebarOpen(false)}
          onReset={handleResetFilters}
          fantasyTeamNames={fantasyTeamNames}
          ktcLoaded={!!ktcMap?.size}
          presets={presets}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
        />
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: '32px'  }} />
            <col style={{ width: '72px'  }} />
            <col style={{ minWidth: '200px' }} />
            <col style={{ width: '64px'  }} />
            <col style={{ width: '72px'  }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '72px'  }} />
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead>
            <tr className="border-b bg-[var(--color-surface-2)]">
              <th className="py-2 px-2" />
              <SortTh label="Recent" col="recentRank" {...sortProps}
                tooltip="PPG rank vs all active players at this position. ↑/↓ shows movement of 3+ positions vs prior season." />
              <SortTh label="Player" col="full_name" {...sortProps} />
              <SortTh label="PPG" col="currentSeasonPPG" {...sortProps}
                tooltip="Fantasy points per game this season, calculated using your league's scoring settings." />
              <SortTh label="Proj" col="projectedPPG" {...sortProps}
                tooltip="Projected PPG next season based on recent performance, age curve, role trend, and team context. Styled by confidence (bold = high, italic = rookie)." />
              <th className="py-2 px-3 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide whitespace-nowrap">
                <Tooltip content="Last 5 seasons of PPG, oldest to newest. Bar height is relative to that player's own peak." position="bottom">
                  Career
                </Tooltip>
              </th>
              <SortTh label="Ceiling" col="ceilingRank" {...sortProps}
                tooltip="Best career positional finish (by PPG). Shows rank · season · that season's total points and the gap vs the average points for that finish (green = above, red = below — flags injury-shortened seasons)." />
              <SortTh label="Floor" col="floorRank" {...sortProps}
                tooltip="Worst career positional finish (by PPG). Same stacked format as Ceiling." />
              <SortTh label="Dynasty" col="dynastyScore" {...sortProps}
                tooltip="Forward-looking outlook label from the dynasty score (age curve, trajectory, opportunity quality, reliability)." />
              <SortTh label="KTC" col="ktcValue" {...sortProps}
                tooltip="KeepTradeCut dynasty value — crowd-sourced from dynasty managers. Scale 0–10000." />
              <SortTh label="Owner" col="ownerTeamName" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => {
              const isSelected = comparisonList.includes(row.player_id)
              const listFull   = comparisonList.length >= 4
              const ownerShort = row.ownerTeamName && row.ownerTeamName.length > 12
                ? row.ownerTeamName.slice(0, 12) + '…'
                : row.ownerTeamName
              return (
              <tr key={row.player_id}
                className="border-b hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors"
                onClick={() => setSelectedPlayerId(row.player_id)}>
                {/* + (compare) */}
                <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                  {isSelected ? (
                    <button onClick={() => removeFromComparison(row.player_id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[var(--c-blue-500)] hover:bg-[var(--c-red-50)] hover:text-[var(--c-red-500)] transition-colors text-sm font-medium"
                      aria-label="Remove from comparison">✓</button>
                  ) : listFull ? (
                    <Tooltip content="Remove a player to add another" position="right">
                      <button disabled
                        className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-disabled)] cursor-not-allowed text-sm font-medium"
                        aria-label="Comparison list full">+</button>
                    </Tooltip>
                  ) : (
                    <button onClick={() => addToComparison(row.player_id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-faintest)] hover:text-[var(--c-blue-500)] hover:bg-[var(--c-blue-50)] transition-colors text-sm font-medium"
                      aria-label="Add to comparison">+</button>
                  )}
                </td>

                {/* Recent */}
                <td className="py-2 px-3 whitespace-nowrap">
                  {row.recentRank != null ? (
                    <span className="inline-flex items-center gap-0.5">
                      <PosRankBadge position={row.position} rank={row.recentRank} />
                      {row.movementLabel === 'up'   && <Tooltip content="Moved up 3+ positions vs prior season" position="top"><sup className="text-[var(--c-green-600)] text-[10px] font-bold leading-none">↑</sup></Tooltip>}
                      {row.movementLabel === 'down' && <Tooltip content="Dropped 3+ positions vs prior season" position="top"><sup className="text-[var(--c-orange-500)] text-[10px] font-bold leading-none">↓</sup></Tooltip>}
                    </span>
                  ) : <span className="text-[var(--color-text-faintest)] text-xs">—</span>}
                </td>

                {/* Player (expanded) */}
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

                {/* PPG */}
                <td className="py-2 px-3 font-medium tabular-nums">
                  {row.currentSeasonPPG > 0 ? row.currentSeasonPPG.toFixed(1) : '—'}
                </td>

                {/* Projected PPG */}
                <td className="py-2 px-3 tabular-nums">
                  {row.projectedPPG != null ? (
                    <span className={projectionConfidenceClass(row.projectionConfidence)}>
                      {row.projectedPPG.toFixed(1)}
                    </span>
                  ) : <span className="text-[var(--color-text-faintest)]">—</span>}
                </td>

                {/* Career sparkline */}
                <td className="py-2 px-3"><CareerSparkline values={row.careerSparkline} /></td>

                {/* Ceiling */}
                <td className="py-2 px-3"><CeilingFloorCell position={row.position} data={row._ceiling} /></td>

                {/* Floor */}
                <td className="py-2 px-3"><CeilingFloorCell position={row.position} data={row._floor} /></td>

                {/* Dynasty label */}
                <td className="py-2 px-3">
                  {row.dynastyScore?.label && row.dynastyScore.label !== 'N/A' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap inline-block max-w-full truncate ${dynastyLabelColor(row.dynastyScore.label, row.dynastyScore.confidence)}`}>
                      {row.dynastyScore.label}
                    </span>
                  )}
                </td>

                {/* KTC */}
                <td className="py-2 px-3 tabular-nums text-[var(--color-text-semi-muted)] text-sm">
                  {row.ktcValue != null ? row.ktcValue.toLocaleString() : ''}
                  {(() => {
                    const kd = ktcDeltaById.get(row.player_id)
                    if (!kd || kd.delta == null || kd.delta === 0) return null
                    return (
                      <Tooltip content={`KTC change over ${kd.spanDays}d`} position="left">
                        <span className={`block text-[10px] ${kd.delta > 0
                          ? 'text-[var(--color-positive-text)]' : 'text-[var(--color-negative-text)]'}`}>
                          {kd.delta > 0 ? '+' : ''}{kd.delta.toLocaleString()}
                        </span>
                      </Tooltip>
                    )
                  })()}
                </td>

                {/* Owner */}
                <td className="py-2 px-3">
                  {row.ownerTeamName ? (
                    <Tooltip content={row.ownerTeamName} position="left">
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] inline-block truncate max-w-full">
                        {ownerShort}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-green-50)] text-[var(--c-green-700)] border border-[var(--c-green-200)]">Free Agent</span>
                  )}
                </td>
              </tr>
            )})}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-[var(--color-text-faint)]">
                  {loaded ? 'No players match your filters.' : 'Loading player data…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
          <span>Showing {start}–{end} of {totalCount} players</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={safePage === 1}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Prev</button>
            <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Next</button>
          </div>
        </div>
      )}

      {/* Comparison tray */}
      {comparisonList.length > 0 && (
        <ComparisonTray
          comparisonList={comparisonList}
          playerRows={playerRows}
          playerMap={playerMap}
          onRemove={removeFromComparison}
          onClear={clearComparison}
        />
      )}

      {/* Profile panel + backdrop */}
      {selectedPlayerId && careerStats && (
        <ProfileDataContext.Provider value={{ careerStats, playersMap: playerMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats }}>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={handleClosePanel} />
          <PlayerProfile
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            onClose={handleClosePanel}
            onSelectPlayer={setSelectedPlayerId}
            comparisonList={comparisonList}
            addToComparison={addToComparison}
            removeFromComparison={removeFromComparison}
          />
        </ProfileDataContext.Provider>
      )}
    </div>
  )
}
