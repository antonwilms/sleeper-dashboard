import { useMemo } from 'react'
import { SeriesBars } from './SeriesBars'
import { DefinitionPopover } from './DefinitionPopover'
import { DegradedBlock } from './DegradedBlock'
import { getTeamSeasonRows } from '../../api/teamContext'
import { resolvePlayerTeam } from '../../utils/playerTeam'
import { computeTeamSeasonMetrics, computeLeagueStanding, ordinal, SERIES_METRICS } from '../../utils/environment'

const METRIC_META = {
  proe: {
    label: 'PROE', mode: 'signed',
    format: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
    field: '(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)',
    note: 'Pass rate over expectation — positive means passing more than game state predicts.',
  },
  pace: {
    label: 'Pace', mode: 'scaled', domain: null,
    format: v => `${v.toFixed(1)}s`,
    field: 'Σ off.neutralSeconds ÷ Σ off.neutralGaps',
    note: 'Seconds per neutral-script play — lower is faster.',
  },
  successRate: {
    label: 'Success rate', mode: 'scaled', domain: [0, 1],
    format: v => `${(v * 100).toFixed(1)}%`,
    field: 'off.successes ÷ off.successPlays',
    note: 'Share of offensive plays graded successful.',
  },
  rzTdRate: {
    label: 'Red-zone TD rate', mode: 'scaled', domain: [0, 1],
    format: v => `${(v * 100).toFixed(1)}%`,
    field: 'off.rzTdTrips ÷ off.rzTrips',
    note: 'Share of red-zone trips ending in a touchdown.',
  },
}

function fmtEpa(v) {
  return v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '—'
}

// dp-v2 Slice 4c. First rendering consumer of teamcontext (CR-10). Uses its OWN axis — the
// loaded league window (`envAxisSeasons`, computed once in PlayerDetailModal.jsx from the same
// careerStats keys App.jsx's loader effect windows on) — not 4b's player axis
// (careerHistory.slice(-5), the player's last five seasons WITH DATA): for an older player those
// sets are disjoint and every bar would be void (task file §4.3). Reuses 4b's alignment
// MECHANICS (project onto a shared axis, null for gaps), not its axis.
export function EnvironmentSection({ careerStats, teamContextByYear, playerId, envAxisSeasons }) {
  const teamsPerSeason = useMemo(
    () => envAxisSeasons.map(season => resolvePlayerTeam({ careerStats }, playerId, season)),
    [envAxisSeasons, careerStats, playerId]
  )
  const hasAnySeason = teamsPerSeason.some(t => t != null)

  // One computation per season (not per metric) — every SERIES_METRICS id reads the same
  // REG-summed team-season object.
  const metricsPerSeason = useMemo(() => envAxisSeasons.map((season, i) => {
    const team = teamsPerSeason[i]
    if (!team) return null
    const loaded = teamContextByYear?.[season]
    if (!loaded?.complete) return null
    const games = getTeamSeasonRows(loaded, team)
    if (!games) return null
    return computeTeamSeasonMetrics(games)
  }), [envAxisSeasons, teamsPerSeason, teamContextByYear])

  if (!hasAnySeason) {
    return (
      <DegradedBlock kind="not-yet-accruing">
        No seasons in the last {envAxisSeasons.length || 5} loaded league seasons
        {envAxisSeasons.length > 0 && ` (${envAxisSeasons[0]}–${envAxisSeasons[envAxisSeasons.length - 1]})`} for this player.
      </DegradedBlock>
    )
  }

  const rows = SERIES_METRICS.map(id => {
    const values = metricsPerSeason.map(m => (m ? m[id] ?? null : null))
    let latest = null
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) { latest = { value: values[i], season: envAxisSeasons[i], team: teamsPerSeason[i] }; break }
    }
    let standing = { median: null, rank: null, n: null }
    if (latest) {
      const loaded = teamContextByYear?.[latest.season]
      if (loaded?.complete) standing = computeLeagueStanding(loaded, id, latest.team)
    }
    return { id, meta: METRIC_META[id], values, latest, ...standing }
  })

  // Splits block (§4.4) — current season only: the newest season with a resolved team AND
  // loaded data, searched the same way each series row finds its own latest.
  let splitsIdx = -1
  for (let i = metricsPerSeason.length - 1; i >= 0; i--) {
    if (metricsPerSeason[i]) { splitsIdx = i; break }
  }
  const splits = splitsIdx >= 0 ? metricsPerSeason[splitsIdx] : null
  const splitsSeason = splitsIdx >= 0 ? envAxisSeasons[splitsIdx] : null
  const splitsTeam = splitsIdx >= 0 ? teamsPerSeason[splitsIdx] : null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted-2 border border-dp-border-raised rounded px-1.5 py-0.5">
          DISPLAY ONLY
        </span>
        <span className="text-[11px] text-dp-muted">
          Never feeds projection or dynasty score — league context, regular season only, components recomputed per season.
        </span>
      </div>

      {/* Shared axis label — the per-season team, since a traded player's bars span franchises
          (task file §4.3: this must be labelled, or a reader takes one series for one team's own
          trend). One line for the whole section rather than repeated per row. */}
      <div className="flex gap-1.5 mb-4 text-[11px]">
        <span className="text-dp-muted-2 shrink-0">Team by season:</span>
        <span className="text-dp-text-3">
          {envAxisSeasons.map((s, i) => `${s} ${teamsPerSeason[i] ?? '—'}`).join(' · ')}
        </span>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        {rows.map(row => (
          <div key={row.id} className="flex items-center gap-3">
            <DefinitionPopover term={row.meta.label} gloss={row.meta.note} field={row.meta.field}>
              <span className="text-xs text-dp-text-2 w-[128px] inline-block truncate text-left">{row.meta.label}</span>
            </DefinitionPopover>
            <div className="flex-1 min-w-0">
              <SeriesBars values={row.values} mode={row.meta.mode} domain={row.meta.domain ?? undefined} height={26} barWidth={10} gap={3} />
            </div>
            <span className="font-dp-mono text-xs text-dp-text w-[56px] text-right shrink-0">
              {row.latest ? row.meta.format(row.latest.value) : '—'}
            </span>
            <span className="font-dp-mono text-[11px] text-dp-muted w-[56px] text-right shrink-0" title="League median (same season)">
              {row.median != null ? row.meta.format(row.median) : '—'}
            </span>
            <span className="font-dp-mono text-[11px] text-dp-text-3 w-[72px] text-right shrink-0">
              {row.rank != null && row.n != null ? `${ordinal(row.rank)} of ${row.n}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {splits && (
        <div>
          <div className="text-[11px] font-semibold text-dp-text-3 mb-2">
            Splits — {splitsSeason} {splitsTeam}, current season only
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-dp-muted">Off EPA / play</span>
              <span className="font-dp-mono text-dp-text">
                {fmtEpa(splits.epaPerPlay)}
                <span className="text-dp-muted-2 ml-1.5">(pass {fmtEpa(splits.passEpaPerPlay)} · rush {fmtEpa(splits.rushEpaPerPlay)})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-dp-muted">Plays / game</span>
              <span className="font-dp-mono text-dp-text">{splits.playsPerGame != null ? splits.playsPerGame.toFixed(1) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dp-muted">Points / game</span>
              <span className="font-dp-mono text-dp-text">{splits.pointsPerGame != null ? splits.pointsPerGame.toFixed(1) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dp-muted">Own def · EPA allowed</span>
              <span className="font-dp-mono text-dp-text">
                {fmtEpa(splits.defEpaPerPlay)}
                <span className="text-dp-muted-2 ml-1.5">
                  {splits.defEpaPerPlay != null && (splits.defEpaPerPlay < 0
                    ? '(negative = defense playing well — bad for the player\'s own volume)'
                    : '(positive = defense allowing efficient offense)')}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
