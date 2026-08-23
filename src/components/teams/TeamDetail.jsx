import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { PlayerCell } from '../dp/cells'
import { SeriesBars } from '../dp/SeriesBars'
import { DegradedBlock } from '../dp/DegradedBlock'
import { getTeamSeasonRows } from '../../api/teamContext'
import { eraTeam } from '../../utils/playerTeam'
import { normalizeTeamForSchedule, denormalizeTeamForSchedule } from '../../utils/nflStats'
import { getCoaching } from '../../utils/enrichmentLookup'
import { compareNullsLast } from '../../utils/sortUtils'
import { computeTeamSeasonMetrics, computeLeagueStanding, deriveDataSeason, ordinal } from '../../utils/environment'
import { buildExposure } from '../../utils/teamExposure'

// Team detail (dp-v2 Slice 6b) — `/teams/:abbr`. Completes Slice 6: four 14-season metric cards,
// team holdings, coaching, and the row navigation 6a deliberately left off. App.jsx is
// route-unaware (no useLocation/useNavigate anywhere in it) — this surface reads :abbr itself via
// useParams, the same pattern LeagueView.jsx already establishes for /league/:view.
//
// The route param is a CURRENT (era-accurate-for-today) code, matching what 6a's index links —
// historical codes (e.g. /teams/STL) are NOT accepted and render the unknown-team degraded state;
// supporting both domains in the URL would double the surface's identity for no benefit.

const CARD_METRICS = ['proe', 'pace', 'successRate', 'epaPerPlay']

const CARD_META = {
  proe: {
    label: 'PROE', mode: 'signed', directionLabel: 'VOLUME SIGNAL · NOT A QUALITY READ',
    format: v => (v != null ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—'),
    field: '(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)',
  },
  pace: {
    label: 'PACE', mode: 'scaled', directionLabel: 'LOWER IS BETTER',
    format: v => (v != null ? `${v.toFixed(1)}s` : '—'),
    field: 'Σ off.neutralSeconds ÷ Σ off.neutralGaps · never the stored per-game rate',
  },
  successRate: {
    label: 'SUCCESS RATE', mode: 'scaled', domain: [0, 1], directionLabel: 'HIGHER IS BETTER',
    format: v => (v != null ? `${(v * 100).toFixed(1)}%` : '—'),
    field: 'off.successes ÷ off.successPlays',
  },
  epaPerPlay: {
    label: 'OFF EPA / PLAY', mode: 'signed', directionLabel: 'HIGHER IS BETTER',
    format: v => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '—'),
    field: 'off.epaSum ÷ off.epaPlays',
  },
}

function axisLabelFor(metricId, seriesValues) {
  const meta = CARD_META[metricId]
  if (meta.mode === 'signed') return 'ZERO BASELINE'
  if (meta.domain) {
    const [lo, hi] = meta.domain
    return metricId === 'successRate' ? `AXIS ${Math.round(lo * 100)}–${Math.round(hi * 100)}%` : `AXIS ${lo}–${hi}`
  }
  const finite = seriesValues.filter(Number.isFinite)
  if (finite.length === 0) return 'AXIS —'
  const lo = Math.min(...finite), hi = Math.max(...finite)
  return `AXIS ${lo.toFixed(1)}–${hi.toFixed(1)}s`
}

function MetricCard({ metricId, currentValue, median, rank, n, seriesValues }) {
  const meta = CARD_META[metricId]
  // A percentile position derived from real rank/n (never fabricated p10/p90 — computeLeagueStanding
  // returns only {median, rank, n}). rank=1 (best) -> ~100th; rank=n (worst) -> ~0th.
  const percentile = (rank != null && n > 1) ? Math.round(((n - rank) / (n - 1)) * 100) : null

  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] p-[16px_18px] flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-dp-mono text-[11px] tracking-[0.08em] uppercase text-dp-muted">{meta.label}</span>
        <span className="text-[9.5px] tracking-[0.06em] text-dp-muted-2 text-right">{meta.directionLabel}</span>
      </div>
      <div className="font-dp-mono text-2xl font-semibold text-dp-text">{meta.format(currentValue)}</div>
      <div className="text-[11px] text-dp-muted">
        League median {meta.format(median)} · {rank != null ? `${ordinal(rank)} of ${n}` : '—'}
      </div>
      {percentile != null && (
        <div className="h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden" data-testid={`percentile-${metricId}`}>
          <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${percentile}%` }} />
        </div>
      )}
      <div data-testid={`chart-${metricId}`}>
        <SeriesBars
          values={seriesValues}
          mode={meta.mode}
          domain={meta.domain}
          colour={meta.mode === 'signed' ? 'neutral' : undefined}
          height={40}
          barWidth={10}
          gap={3}
        />
      </div>
      <div className="text-[10px] text-dp-muted-2">{axisLabelFor(metricId, seriesValues)}</div>
      <div className="font-dp-mono text-[10px] text-dp-muted-3" style={{ wordBreak: 'break-all' }}>{meta.field}</div>
    </div>
  )
}

function holdingMeta(row, myTeamName, myRosterValueDenom) {
  if (myTeamName != null && row.ownerTeamName === myTeamName) {
    const pct = (row.ktcValue != null && myRosterValueDenom > 0)
      ? Math.round((row.ktcValue / myRosterValueDenom) * 100)
      : null
    return { text: pct != null ? `${pct}% of roster` : 'yours', cls: 'text-dp-up-text' }
  }
  if (row.ownerTeamName != null) return { text: `owned by ${row.ownerTeamName}`, cls: 'text-dp-muted' }
  return { text: 'not owned', cls: 'text-dp-muted' }
}

function resolveCoachingYear(coaching, team) {
  const entries = coaching?.entries ?? []
  const teamYears = entries.filter(e => e.team === team).map(e => e.year)
  if (teamYears.length) return Math.max(...teamYears)
  const allYears = entries.map(e => e.year)
  return allYears.length ? Math.max(...allYears) : null
}

export function TeamDetail({
  playerRows = [], loaded = false, careerStats, teamContextByYear, myTeamName = null,
  coaching = null, onNeedTeamHistory,
}) {
  const { abbr } = useParams()

  // Request the 14-season window once on mount — App.jsx's eager effect only carries the
  // 5-season ENV_SEASONS window; this page is the one place that needs the full history.
  useEffect(() => {
    onNeedTeamHistory?.()
  }, [onNeedTeamHistory])

  const dataSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])
  const currentSeasonLoaded = teamContextByYear?.[dataSeason]
  const resolvedCurrentTeam = useMemo(
    () => (dataSeason != null ? eraTeam(abbr, dataSeason) : null),
    [abbr, dataSeason]
  )
  const isKnownTeam = !!(
    currentSeasonLoaded?.complete && resolvedCurrentTeam != null &&
    currentSeasonLoaded.teams?.[resolvedCurrentTeam] != null
  )

  const allSeasons = useMemo(() => Object.keys(careerStats ?? {}).map(Number).sort(), [careerStats])

  // The 14-season lookup MUST resolve through eraTeam per season — teamcontext is keyed
  // era-accurately, so e.g. /teams/LA finds nothing pre-2016 under a fixed 'LA' lookup (real key
  // is STL through 2015). Render what's loaded while the rest of the on-demand window arrives —
  // never gate the whole card behind a complete window.
  const metricsPerSeason = useMemo(() => {
    if (!isKnownTeam) return []
    return allSeasons.map(season => {
      const team = eraTeam(abbr, season)
      const loadedSeason = teamContextByYear?.[season]
      if (!loadedSeason?.complete) return null
      const games = getTeamSeasonRows(loadedSeason, team)
      if (!games) return null
      return computeTeamSeasonMetrics(games)
    })
  }, [isKnownTeam, allSeasons, abbr, teamContextByYear])

  const currentMetrics = useMemo(() => {
    if (!isKnownTeam) return null
    const games = getTeamSeasonRows(currentSeasonLoaded, resolvedCurrentTeam)
    return games ? computeTeamSeasonMetrics(games) : null
  }, [isKnownTeam, currentSeasonLoaded, resolvedCurrentTeam])

  const standingByMetric = useMemo(() => {
    const result = {}
    for (const id of CARD_METRICS) {
      result[id] = isKnownTeam
        ? computeLeagueStanding(currentSeasonLoaded, id, resolvedCurrentTeam)
        : { median: null, rank: null, n: 0 }
    }
    return result
  }, [isKnownTeam, currentSeasonLoaded, resolvedCurrentTeam])

  // Holdings (§4) — playerRows is RELEVANCE-GATED (isRelevantPlayer drops un-rostered non-rookies
  // with no play in the last two seasons and no KTC row), so this is "rostered & tracked", never
  // "every skill player on this team." Filter on normalizeTeamForSchedule(nfl_team) === abbr — the
  // same domain hop 6a's exposure column established, since the route param is a current code.
  const holdings = useMemo(() => {
    const rows = (playerRows ?? []).filter(r => normalizeTeamForSchedule(r.nfl_team) === abbr)
    return [...rows].sort((a, b) => compareNullsLast(a.ktcValue, b.ktcValue, -1))
  }, [playerRows, abbr])

  const exposureData = useMemo(() => buildExposure(playerRows, myTeamName), [playerRows, myTeamName])

  // Coaching (§5) — two silent traps. (1) enrichment/coaching.json keys the SLEEPER domain (LAR),
  // the route param is era-accurate (LA); denormalizeTeamForSchedule is the additive reverse of
  // 6a's own normalizeTeamForSchedule hop. (2) every coaching entry is year 2026 while dataSeason
  // is 2025 — querying dataSeason would silently return {HC:null,OC:null,DC:null} for every team,
  // so this resolves the enrichment's OWN year (max year for this team, falling back to the max
  // across all entries) rather than the charted season, and labels the block with it.
  const coachingTeam = useMemo(() => denormalizeTeamForSchedule(abbr), [abbr])
  const coachingYear = useMemo(() => resolveCoachingYear(coaching, coachingTeam), [coaching, coachingTeam])
  const coachingResult = useMemo(
    () => (coachingYear != null ? getCoaching(coaching, coachingTeam, coachingYear) : { HC: null, OC: null, DC: null }),
    [coaching, coachingTeam, coachingYear]
  )
  const coachingEmpty = coachingResult.HC == null && coachingResult.OC == null && coachingResult.DC == null

  if (!loaded) {
    return (
      <div className="bg-dp-canvas flex flex-col gap-4">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">{abbr}</h1>
        <p className="text-sm text-dp-muted italic">Player data loading in background…</p>
      </div>
    )
  }

  // loaded===true but the current season's teamContext hasn't landed yet — matches Teams.jsx's
  // own degraded-vs-loading gate exactly: without this, EVERY abbr reads as unknown for the brief
  // window before the eager 5-season effect resolves, flashing a valid team as degraded.
  if (!currentSeasonLoaded?.complete) {
    return (
      <div className="bg-dp-canvas flex flex-col gap-4">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">{abbr}</h1>
        <DegradedBlock kind="not-yet-accruing">
          No team-context data loaded for the {dataSeason ?? 'current'} season yet.
        </DegradedBlock>
      </div>
    )
  }

  if (!isKnownTeam) {
    return (
      <div className="bg-dp-canvas flex flex-col gap-4">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">{abbr}</h1>
        <DegradedBlock kind="never-available">
          &ldquo;{abbr}&rdquo; is not a recognised current NFL team code.
        </DegradedBlock>
      </div>
    )
  }

  return (
    <div className="bg-dp-canvas flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">{abbr}</h1>
        <p className="text-[13px] text-dp-muted mt-1">{dataSeason} season · 14-season history</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[14px]">
        {CARD_METRICS.map(id => (
          <MetricCard
            key={id}
            metricId={id}
            currentValue={currentMetrics?.[id] ?? null}
            median={standingByMetric[id].median}
            rank={standingByMetric[id].rank}
            n={standingByMetric[id].n}
            seriesValues={metricsPerSeason.map(m => (m ? m[id] ?? null : null))}
          />
        ))}
      </div>

      <div className="bg-dp-card border border-dp-border rounded-[10px] p-[16px_18px]">
        <div className="text-[13px] font-semibold text-dp-text">Rostered & tracked</div>
        <p className="text-[11px] text-dp-muted mt-0.5">
          Skill players this app currently tracks for {abbr} — not a full depth chart.
        </p>
        {holdings.length === 0 ? (
          <p className="text-sm text-dp-muted italic mt-3">No tracked players on {abbr} right now.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {holdings.map(row => {
              const meta = holdingMeta(row, myTeamName, exposureData?.denom ?? 0)
              return (
                <div key={row.player_id} data-testid={`holding-${row.player_id}`} className="flex items-center justify-between gap-3 py-1.5 border-t border-dp-border-row first:border-t-0">
                  <PlayerCell row={row} />
                  <div className="text-right shrink-0">
                    <div className="font-dp-mono text-[13px] text-dp-text">
                      {row.ktcValue != null ? row.ktcValue.toLocaleString() : <span className="text-dp-muted text-xs">—</span>}
                    </div>
                    <div className={`text-[11px] ${meta.cls}`}>{meta.text}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-dp-card border border-dp-border rounded-[10px] p-[16px_18px]">
        <div className="text-[13px] font-semibold text-dp-text">
          Coaching{coachingYear != null && <span className="text-dp-muted font-normal"> · {coachingYear}</span>}
        </div>
        {coachingEmpty ? (
          <DegradedBlock kind="no-baseline">
            No coaching entries for {abbr}{coachingYear != null ? ` in ${coachingYear}` : ''}.
          </DegradedBlock>
        ) : (
          <div className="grid grid-cols-3 gap-3 mt-3">
            {['HC', 'OC', 'DC'].map(role => (
              <div key={role}>
                <div className="text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted">{role}</div>
                <div className="text-[13px] text-dp-text mt-0.5">{coachingResult[role]?.name ?? '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
