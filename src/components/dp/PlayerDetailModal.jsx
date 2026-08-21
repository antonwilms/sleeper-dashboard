import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayerProfile } from '../../hooks/usePlayerProfile'
import { useProfileData } from '../../context/ProfileDataContext'
import { computeConsistency } from '../../utils/outlookConsistency'
import { computeDynastySignalBadges } from '../../utils/dynastySignalBadges'
import { SectionIndex } from './SectionIndex'
import { GameLogSection } from './GameLogSection'
import { DistributionSection } from './DistributionSection'
import { UsageEfficiencySection } from './UsageEfficiencySection'
import { AvailabilityRoleSection } from './AvailabilityRoleSection'

// Module-level: ids and labels only — these are static. The section wrappers read this const
// directly; the index reads the decorated `indexSections` memo below (per-player counts can't
// live in a module-level const). Neither hard-codes an id string, so an id typo can't produce an
// index entry that scrolls nowhere.
//
// SECTIONS does not control visual order — it drives the index and the scroll-spy's
// [...SECTIONS].reverse().find(...); the rendered order is the literal JSX order in the scroll
// column below. Both are kept in this same order (dp-v2 Slice 4b task file §2): Overview → Game
// log → Distribution → Usage & efficiency → Availability & role → Score drivers → Why next season.
const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'game-log', label: 'Game log' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'usage', label: 'Usage & efficiency' },
  { id: 'availability', label: 'Availability & role' },
  { id: 'drivers', label: 'Score drivers' },
  { id: 'why-next', label: 'Why next season' },
]

// dynastyScore.js's driver-panel copy, originally mirrored verbatim from the Explorer's tooltip
// strings (not new copy) — `PlayersTab.jsx` was deleted with that surface in 1b Slice viii, so
// this is now the copy's only home.
const DRIVER_NOTES = {
  ageAdjusted: "How the player's current PPG compares to what the empirical age curve predicts for someone their age and position.",
  trajectory: 'Slope of a recency-weighted regression through all career seasons. Positive = improving over career, negative = declining.',
  currentLevel: 'Percentile rank vs all active players at their position using weighted recent PPG.',
  opportunityQuality: 'Combines efficiency (yards per attempt/carry/reception), volume (touches/targets per game), and market share (carry share for RBs, target share for WRs/TEs) when available.',
  reliability: 'Composite of PPG consistency (week-to-week variance) and durability (average games played, penalised for recurring injury seasons).',
}

const TONE_DOT = {
  positive: 'bg-dp-up',
  caution: 'bg-dp-down',
  neutral: 'bg-dp-muted',
}

// Body-only since 1b Slice v — the scrim, panel, close ×, Escape handling and tab strip now
// live in the shell, src/components/dp/PlayerDetailTabs.jsx, which renders this component for
// whichever tab is active. onClose is gone from this signature: nothing in the body called it
// once both close buttons moved to the shell. onCompare is new — it opens the shell's
// "+ Add player to compare" dropdown from the identity row's Compare button.
export function PlayerDetailModal({ playerId, myTeamName, onCompare = () => {} }) {
  const {
    player,
    dynastyScore,
    ownership,
    ktcValue,
    divergenceSignal,
    careerHistory,
    careerAvgPPG,
    comps,
    positionPeers,
    projection,
    mostRecentSeason,
    positionPeakPPG,
    teamDepthChart,
  } = usePlayerProfile(playerId)
  const { careerStats, playersMap, playerRows, gameLogsByYear, nflScheduleByYear } = useProfileData()

  // Lock background scroll while the full-viewport overlay is open.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const consistency = useMemo(() => computeConsistency(careerStats, playerId), [careerStats, playerId])
  const floorRiskSd = consistency?.sd ?? null

  // Game log / Distribution (dp-v2 Slice 4a) — dataSeason-keyed loader results, no season
  // selector (§2.1): a player whose last season predates dataSeason has no entry here and
  // degrades rather than showing an older season.
  const gameLogsResult = gameLogsByYear?.[mostRecentSeason]
  const nflScheduleResult = nflScheduleByYear?.[mostRecentSeason]

  // Shared season axis for Usage & efficiency and Availability & role (dp-v2 Slice 4b §3.2a) —
  // the last 5 seasons this player actually has a careerStats entry for (not 5 consecutive
  // calendar years), so a player whose recent seasons predate 2020 still shows real seasons in
  // the window rather than being padded with years he never played. Built once here so every
  // metric row and the games-played grid share the exact same x-axis.
  const axisSeasons = useMemo(
    () => careerHistory.slice(-5).map(h => h.season),
    [careerHistory]
  )

  // "Current season PPG" for the Next-season delta — the most recent season already returned by
  // the hook's own careerHistory, not a new field. null (not 0) when the player has no games
  // played in the most recent season, so the delta is omitted rather than inflated.
  const currentSeasonPPG = useMemo(
    () => careerHistory.find(h => h.isMostRecent)?.ppg ?? null,
    [careerHistory]
  )
  const nextSeasonDelta = (projection?.projectedPPG != null && currentSeasonPPG != null)
    ? projection.projectedPPG - currentSeasonPPG
    : null

  const badges = useMemo(
    () => computeDynastySignalBadges(dynastyScore?.signals ?? null, player),
    [dynastyScore, player]
  )

  // POSITION IN PORTFOLIO — ktcValue ÷ Σ ktcValue over rows the user owns. Skips rows with a
  // null ktcValue in both numerator and denominator; "—" when the player isn't the user's.
  const isMine = myTeamName != null && ownership === myTeamName
  const portfolioShare = useMemo(() => {
    if (!isMine || ktcValue == null || !playerRows) return null
    const total = playerRows.reduce((sum, r) => (
      r.ownerTeamName === myTeamName && r.ktcValue != null ? sum + r.ktcValue : sum
    ), 0)
    return total > 0 ? (ktcValue / total) * 100 : null
  }, [isMine, ktcValue, playerRows, myTeamName])

  const chartBars = useMemo(() => {
    const bars = careerHistory.slice(-5).map(h => ({
      key: `s${h.season}`,
      label: String(h.season),
      value: h.ppg,
      kind: h.isMostRecent ? 'latest' : 'historical',
    }))
    // Omit the projection bar entirely when there's no projection — never a zero-height bar.
    if (projection?.projectedPPG != null) {
      const projSeason = mostRecentSeason != null ? mostRecentSeason + 1 : null
      bars.push({
        key: 'proj',
        label: projSeason != null ? `'${String(projSeason).slice(-2)} proj` : 'proj',
        value: projection.projectedPPG,
        kind: 'projection',
      })
    }
    return bars
  }, [careerHistory, projection, mostRecentSeason])
  const maxBarValue = Math.max(1, ...chartBars.map(b => b.value))

  // seasonsOfData is already rendered inside Overview as the DYNASTY SCORE tile's note (below) —
  // reused here rather than deriving a fourth "seasons of data" definition for the index (§3.1).
  // Computed with optional chaining (not after the dynastyScore null-check) because both this and
  // indexSections must exist unconditionally — hooks can't follow the early return below.
  const seasonsOfData = dynastyScore?.signals?.seasonsOfData ?? null

  // Coverage is per-player, so it can't live in the SECTIONS const. Only Overview gets pips —
  // dynastyScore's other components are model output, not measured coverage (§3.1).
  const indexSections = useMemo(
    () => SECTIONS.map(sec =>
      sec.id === 'overview' && seasonsOfData != null
        ? { ...sec, count: seasonsOfData, span: `${seasonsOfData}y` }
        : sec),
    [seasonsOfData]
  )

  const [activeSectionId, setActiveSectionId] = useState('overview')
  const sectionRefs = useRef({})
  const intersectingRef = useRef({})
  const scrollColRef = useRef(null)

  // Active-section highlight via IntersectionObserver, observed against the scroll column as
  // root. rootMargin shrinks the observed area to a thin band at the top of the scroll column —
  // without it, a section as tall as Overview (identity + tiles + chart) stays "intersecting"
  // long after the user has scrolled past it into Drivers/Why-next, since some sliver of it
  // remains on screen. With the band, a section counts only once it reaches the read line near
  // the top; the deepest (last, in SECTIONS order) section that has reached it is active. Runs
  // once per mount — this component remounts per playerId (keyed by activeTab in
  // PlayerDetailTabs), and the three sections are always present together once dynastyScore is
  // truthy, so a mount-time subscription is sufficient. No-ops harmlessly when dynastyScore is
  // null (no sections render, so nothing is observed).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.dataset.sectionId
        if (id) intersectingRef.current[id] = entry.isIntersecting
      }
      const current = [...SECTIONS].reverse().find(s => intersectingRef.current[s.id])
      if (current) setActiveSectionId(current.id)
    }, { root: scrollColRef.current, rootMargin: '0px 0px -70% 0px', threshold: 0 })

    for (const el of Object.values(sectionRefs.current)) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  function selectSection(id) {
    setActiveSectionId(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // One stable ref callback shared by all three sections (rather than a per-id factory called
  // during render, which the react-hooks/refs lint rule flags) — the section's own
  // data-section-id attribute says which slot to fill.
  function setSectionRef(el) {
    if (el?.dataset.sectionId) sectionRefs.current[el.dataset.sectionId] = el
  }

  // ── Whole-modal empty state: id absent from playerRows entirely ──────────────────────────
  // Never dereference dynastyScore.score/.components/.signals below this point without it.
  // Body-only since Slice v — keeps its position before any dynastyScore deref; the scrim,
  // panel and close button it used to carry now live in the shell (PlayerDetailTabs.jsx).
  if (!dynastyScore) {
    return (
      <div className="px-6 pt-4 pb-8 flex items-start gap-4">
        <div className="w-[52px] h-[52px] rounded-[10px] bg-dp-chip flex items-center justify-center font-dp-mono text-xs text-dp-text-4 shrink-0">
          {player.position ?? '—'}
        </div>
        <div>
          <div className="text-2xl font-bold tracking-[-0.02em] text-dp-text">{player.full_name ?? playerId}</div>
          <p className="text-dp-muted text-sm mt-3">No dynasty data available for this player.</p>
        </div>
      </div>
    )
  }

  const metaParts = []
  if (player.age != null) metaParts.push(`${player.age}`)
  metaParts.push(player.team ?? 'FA')
  if (player.years_exp != null) metaParts.push(`Year ${player.years_exp + 1}`)
  metaParts.push(
    ownership == null ? 'Unowned'
      : ownership === myTeamName ? 'Owned by you'
      : `Owned by ${ownership}`
  )

  const tiles = [
    {
      key: 'dynasty',
      label: 'DYNASTY SCORE',
      value: dynastyScore.score ?? '—',
      delta: dynastyScore.label && dynastyScore.label !== 'N/A' ? dynastyScore.label : null,
      deltaClass: 'text-dp-text-3',
      // riskLabel (Low/Med/High) intentionally dropped from this note — thresholds are Slice
      // iv's open question (master-plan §5.4). Only real seasons-of-data ships.
      note: seasonsOfData != null ? `${seasonsOfData} season${seasonsOfData === 1 ? '' : 's'}` : null,
    },
    {
      key: 'market',
      label: 'MARKET VALUE',
      value: ktcValue != null ? ktcValue.toLocaleString() : '—',
      // PROVISIONAL(no-data): the 30-day KTC Δ (mk30/mk30dir in the mock) is omitted — the
      // ktcHist snapshot series is sparse pending a Tier-0 roadmap fix (master-plan §2.2/§2.4).
      // Slice iii's Portfolio 30D column shows the same gap; this is the first ship site.
      delta: null,
      deltaClass: '',
      note: divergenceSignal === 'undervalued' ? 'Model ranks above market'
          : divergenceSignal === 'overvalued'  ? 'Model ranks below market'
          : null,
    },
    {
      key: 'next',
      label: 'NEXT SEASON',
      value: projection?.projectedPPG != null ? projection.projectedPPG.toFixed(1) : '—',
      delta: nextSeasonDelta,
      deltaClass: nextSeasonDelta == null ? '' : nextSeasonDelta >= 0 ? 'text-dp-up-text' : 'text-dp-down-text',
      note: projection ? `PPG · ${projection.projectedGames} games projected` : null,
    },
    {
      key: 'floor',
      label: 'FLOOR RISK',
      value: floorRiskSd != null ? `±${floorRiskSd.toFixed(1)}` : '—',
      delta: null,
      deltaClass: '',
      // riskLabel (Low/Med/High) intentionally dropped — see master-plan §5.4.
      note: 'SD of per-game points',
    },
  ]

  const driverRows = dynastyScore.components ? [
    { key: 'age',   label: 'Age-adjusted',  value: dynastyScore.components.ageAdjusted.value,       weight: dynastyScore.components.ageAdjusted.weight,       note: DRIVER_NOTES.ageAdjusted },
    { key: 'traj',  label: 'Trajectory',    value: dynastyScore.components.trajectory.value,         weight: dynastyScore.components.trajectory.weight,         note: DRIVER_NOTES.trajectory },
    { key: 'level', label: 'Current level', value: dynastyScore.components.currentLevel.value,       weight: dynastyScore.components.currentLevel.weight,       note: DRIVER_NOTES.currentLevel },
    { key: 'opp',   label: 'Opportunity',   value: dynastyScore.components.opportunityQuality.value, weight: dynastyScore.components.opportunityQuality.weight, note: DRIVER_NOTES.opportunityQuality },
    { key: 'rel',   label: 'Reliability',   value: dynastyScore.components.reliability.value,        weight: dynastyScore.components.reliability.weight,        note: DRIVER_NOTES.reliability },
  ] : []

  const hasAdjustmentChips = projection?.adjustmentSummary?.length > 0
  // comps is null (not just []) when careerStats/positionPeakPPG aren't ready or the player is
  // a prospect (usePlayerProfile.js) — guard both shapes, not just the empty-array case.
  const hasComps = (comps?.length ?? 0) > 0

  return (
    // Body row: index column + a single scrolling column. Does NOT scroll itself — the panel
    // above (PlayerDetailTabs.jsx) is `flex-col overflow-hidden`, so without min-h-0 this flex-1
    // row would grow to full content height and the inner overflow-y-auto column below would
    // never have anything to overflow (see task file §1).
    <div className="flex-1 min-w-0 flex min-h-0">
      <SectionIndex sections={indexSections} activeId={activeSectionId} onSelect={selectSection} />

      <div ref={scrollColRef} className="flex-1 min-w-0 overflow-y-auto min-h-0">
        {/* ── §overview: identity/tiles/chart + right rail ────────────────── */}
        <section id="overview" data-section-id="overview" ref={setSectionRef} className="scroll-mt-4 flex flex-col dpwide:flex-row">
          <div className="flex-1 min-w-0 px-7 pb-6 flex flex-col gap-5">
            {/* Identity row */}
            <div className="flex items-start gap-4">
              <div className="w-[52px] h-[52px] rounded-[10px] bg-dp-chip flex items-center justify-center font-dp-mono text-xs text-dp-text-4 shrink-0">
                {player.position ?? '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-bold tracking-[-0.02em] text-dp-text truncate">{player.full_name ?? playerId}</div>
                <div className="text-[13px] text-dp-muted mt-1">{metaParts.join(' · ')}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={onCompare} className="text-xs px-3.5 py-2 rounded-lg border border-dp-border text-dp-text-4">
                  Compare
                </button>
                {/* PROVISIONAL(no-data): no trade surface exists yet — /trade is a gated
                    placeholder. Disabled rather than wired to a dead end (master-plan §2.3). */}
                <button
                  disabled
                  title="Trade desk isn't built yet"
                  className="text-xs px-3.5 py-2 rounded-lg bg-dp-up text-dp-canvas font-semibold opacity-40 cursor-not-allowed"
                >
                  Shop this asset
                </button>
              </div>
            </div>

            {/* Four tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {tiles.map(t => (
                <div key={t.key} data-testid={`tile-${t.key}`} className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3">
                  <div className="text-[11px] font-dp-mono tracking-[0.08em] text-dp-muted uppercase">{t.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-1.5">
                    <span className="font-dp-mono text-[21px] font-semibold text-dp-text">{t.value}</span>
                    {t.delta != null && (
                      <span className={`text-xs font-semibold ${t.deltaClass}`}>
                        {typeof t.delta === 'number' ? `${t.delta >= 0 ? '+' : ''}${t.delta.toFixed(1)}` : t.delta}
                      </span>
                    )}
                  </div>
                  {t.note && <div className="text-[11px] text-dp-muted mt-1">{t.note}</div>}
                </div>
              ))}
            </div>

            {/* Career PPG chart */}
            <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
              <div className="flex justify-between items-baseline mb-4">
                <span className="text-[13px] font-semibold text-dp-text">Career PPG · projection band</span>
                {/* PROVISIONAL(mock-copy): reworded from the mock's "next season 22.1 ±3.4" —
                    that phrasing reads as a projection interval, which this app doesn't
                    compute. ±sd here is the historical per-game SD (Floor-risk tile). */}
                <span className="text-xs text-dp-muted">
                  career avg {careerAvgPPG.toFixed(1)} · next season {projection?.projectedPPG != null ? projection.projectedPPG.toFixed(1) : '—'} · ±{floorRiskSd != null ? floorRiskSd.toFixed(1) : '—'} per-game SD
                </span>
              </div>
              {chartBars.length === 0 ? (
                <p className="text-xs text-dp-muted italic">No season history available.</p>
              ) : (
                <div className="flex items-end gap-2.5 h-[200px]">
                  {chartBars.map(b => (
                    <div key={b.key} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="font-dp-mono text-[11px] text-dp-text-4">{b.value.toFixed(1)}</span>
                      <div
                        className={`w-full rounded-t-[5px] rounded-b-[2px] ${
                          b.kind === 'projection' ? 'bg-dp-proj' : b.kind === 'latest' ? 'bg-dp-up' : 'bg-dp-slate'
                        }`}
                        style={{ height: `${Math.max(4, Math.round((b.value / maxBarValue) * 150))}px` }}
                      />
                      <span className="text-[11px] text-dp-muted">{b.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right rail — scoped to §overview, scrolls away with it. Its overflow-y-auto is
              dropped: once it sits inside the scrolling band its height is content-driven, so
              that property could never fire and would only invite a nested scrollbar. ────── */}
          <div className="w-full dpwide:w-[300px] shrink-0 dpwide:border-l border-dp-border bg-dp-chrome px-5 py-[22px] flex flex-col gap-[18px]">
            <div>
              <div className="font-dp-mono text-[10px] tracking-[0.1em] text-dp-muted-2">POSITION IN PORTFOLIO</div>
              <div className="flex items-baseline gap-2 mt-2.5">
                <span className="font-dp-mono text-[26px] font-semibold text-dp-text">
                  {portfolioShare != null ? `${portfolioShare.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="text-xs text-dp-muted leading-relaxed mt-1.5">
                {portfolioShare != null
                  ? "Share of your roster's total market value."
                  : isMine ? 'Market value unavailable.' : 'Not on your roster.'}
              </div>
            </div>

            {badges.length > 0 && (
              <>
                <div className="h-px bg-dp-border" />
                <div>
                  <div className="font-dp-mono text-[10px] tracking-[0.1em] text-dp-muted-2 mb-2.5">SIGNALS</div>
                  <div className="flex flex-col gap-2">
                    {badges.map(b => (
                      <div key={b.key} className="flex gap-2.5 items-start">
                        <span className={`w-[5px] h-[5px] rounded-full mt-1.5 shrink-0 ${TONE_DOT[b.tone]}`} />
                        <div>
                          <div className="text-xs font-semibold text-dp-text-strong">{b.label}</div>
                          <div className="text-[11px] text-dp-muted leading-relaxed">{b.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="h-px bg-dp-border" />
            <div>
              <div className="font-dp-mono text-[10px] tracking-[0.1em] text-dp-muted-2 mb-2.5">RANK THIS SEASON</div>
              <div className="flex flex-col gap-1.5">
                {positionPeers.map((p, i) => (
                  p === null ? (
                    <div key={`ellipsis-${i}`} className="text-center text-dp-muted text-xs">···</div>
                  ) : (
                    <div
                      key={p.player_id}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${p.player_id === playerId ? 'bg-dp-up-bg' : ''}`}
                    >
                      <span className="font-dp-mono text-[11px] text-dp-muted w-[30px]">{p.positionRank}</span>
                      <span className={`flex-1 text-xs truncate ${p.player_id === playerId ? 'text-dp-up-text' : 'text-dp-text-2'}`}>
                        {p.full_name}
                      </span>
                      <span className={`font-dp-mono text-xs ${p.player_id === playerId ? 'text-dp-up-text' : 'text-dp-text-2'}`}>
                        {p.currentSeasonPPG != null ? p.currentSeasonPPG.toFixed(1) : '—'}
                      </span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── §game-log: per-position production, one row per game (dp-v2 Slice 4a) ────────── */}
        <section id="game-log" data-section-id="game-log" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-3.5">Game log</div>
            <GameLogSection
              careerStats={careerStats}
              gameLogsResult={gameLogsResult}
              scheduleResult={nflScheduleResult}
              playerId={playerId}
              position={player.position}
              season={mostRecentSeason}
              playerName={player.full_name}
              isRookie={dynastyScore.isRookie ?? false}
            />
          </div>
        </section>

        {/* ── §distribution: pooled per-game histogram (dp-v2 Slice 4a) ───────────────────── */}
        <section id="distribution" data-section-id="distribution" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-3.5">Distribution</div>
            <DistributionSection careerStats={careerStats} playerId={playerId} consistency={consistency} />
          </div>
        </section>

        {/* ── §usage: per-position usage & efficiency, existing derivations only (Slice 4b) ── */}
        <section id="usage" data-section-id="usage" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-3.5">Usage &amp; efficiency</div>
            <UsageEfficiencySection
              careerStats={careerStats}
              playersMap={playersMap}
              playerId={playerId}
              position={player.position}
              axisSeasons={axisSeasons}
            />
          </div>
        </section>

        {/* ── §availability: games-played grid + depth chart (Slice 4b) ───────────────────── */}
        <section id="availability" data-section-id="availability" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-3.5">Availability &amp; role</div>
            <AvailabilityRoleSection
              careerStats={careerStats}
              playerId={playerId}
              axisSeasons={axisSeasons}
              teamDepthChart={teamDepthChart}
              position={player.position}
            />
          </div>
        </section>

        {/* ── §drivers: What drives the score (card title carries the heading — §2.0) ──────── */}
        <section id="drivers" data-section-id="drivers" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-1">What drives the score</div>
            <p className="text-[11px] text-dp-muted mb-3.5">Relative contribution — bars don't sum to the score.</p>
            {driverRows.length === 0 ? (
              dynastyScore.signals?.isProspect ? (
                // Prospect path: components are deliberately null, not missing — the score
                // comes from draft capital x age x market value (computeProspectScore), not
                // the five weighted veteran components. Every other components:null path below
                // keeps the generic "not available" copy, which is honest for those — they are
                // genuine data gaps (unproven vet / stale data / non-finite / non-skill
                // position), not a modelling choice.
                //
                // draftCapital is THIS LEAGUE'S rookie-draft pick (App.jsx builds it from
                // getDraftPicks(rookieDraft.draft_id)), NOT the NFL draft slot — see CLAUDE.md's
                // "Intentional divergence" invariant. It must stay labelled as such: a bare
                // "Drafted Round 1, Pick 3" reads as an NFL draft position and can contradict it.
                <p className="text-xs text-dp-muted italic">
                  Scored on the prospect path — draft capital and market value, not the weighted components below.
                  {dynastyScore.signals?.draftCapital != null && (
                    <> League rookie draft: Round {dynastyScore.signals.draftCapital.round}, Pick {dynastyScore.signals.draftCapital.pick}.</>
                  )}
                </p>
              ) : (
                <p className="text-xs text-dp-muted italic">Component breakdown not available for this player.</p>
              )
            ) : (
              <div className="flex flex-col gap-2.5">
                {driverRows.map(d => (
                  <div key={d.key}>
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="w-[104px] text-dp-muted shrink-0">{d.label}</span>
                      <div className="flex-1 bg-dp-border-row rounded-[3px] h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }} />
                      </div>
                      <span className="font-dp-mono w-[26px] text-right text-dp-text">{d.value}</span>
                      <span className="font-dp-mono w-[30px] text-right text-dp-muted-2 text-[11px]">{Math.round(d.weight * 100)}%</span>
                    </div>
                    <div className="text-[11px] text-dp-muted ml-[114px] mt-0.5">{d.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── §why-next: Why next season, including the career-comps block ───────────────── */}
        <section id="why-next" data-section-id="why-next" ref={setSectionRef} className="scroll-mt-4 px-7 pb-6">
          <div className="bg-dp-card border border-dp-border rounded-[10px] px-5 py-[18px]">
            <div className="text-[13px] font-semibold text-dp-text mb-3.5">Why next season</div>
            {!hasAdjustmentChips && !hasComps ? (
              <p className="text-xs text-dp-muted italic">No projection detail available yet.</p>
            ) : (
              <>
                {hasAdjustmentChips && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {projection.adjustmentSummary.map((text, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-[7px] bg-dp-chip text-dp-text-2 border border-dp-border">
                        {text}
                      </span>
                    ))}
                  </div>
                )}
                {hasComps && (
                  <>
                    <div className="text-[13px] font-semibold text-dp-text mt-5 mb-3">Closest career comps</div>
                    <div className="flex flex-col gap-2.5">
                      {comps.map(c => {
                        const n = Math.min(c.theirSubsequentSeasons.length, 2)
                        const avgPPG = n > 0
                          ? (c.theirSubsequentSeasons.slice(0, 2).reduce((a, b) => a + b, 0) / n) * (positionPeakPPG?.[player.position] ?? 20)
                          : null
                        return (
                          <div key={c.player_id} className="flex items-center gap-3">
                            <span className="text-xs w-[130px] text-dp-text-2 truncate">{c.full_name}</span>
                            <div className="flex-1 h-[5px] rounded-[3px] bg-dp-border-row overflow-hidden">
                              <div className="h-[5px] rounded-[3px] bg-dp-up" style={{ width: `${c.similarity}%` }} />
                            </div>
                            <span className="font-dp-mono text-[11px] text-dp-muted w-[34px] text-right">{c.similarity}%</span>
                            <span className="text-[11px] text-dp-muted w-[96px] text-right">
                              {avgPPG != null ? `${avgPPG.toFixed(1)} PPG next ${n}` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
