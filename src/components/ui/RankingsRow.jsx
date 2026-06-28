import Tooltip from '../Tooltip'

const RANKINGS_LEGEND =
  'Recent: current-form rank vs ACTIVE players, by most-recent qualifying PPG (this season ≥6 GP, else last ≤3 seasons ≥8 GP) — mixed-season, not a single-season finish\n' +
  'Peak: best-season rank within the active-player pool (differs from the Explorer Ceiling column, which uses the full-field single-season finish)\n' +
  'Consist: Weighted avg rank across last 3 seasons — reliability (50/30/20%)\n' +
  'Outlook: Forward-looking rank by dynasty score\n' +
  'Role: Rank by multi-season carry/target share\n' +
  'Next Szn: Projected rank by next season PPG'

export function RankingsRow({
  position, recentRank, peakRank, consistencyRank, dynastyRank,
  roleRank, nextSeasonRank, movementLabel, projectionConfidence,
}) {
  let narrative = null
  if (recentRank != null && dynastyRank != null) {
    const gap = dynastyRank - recentRank
    if (gap >= 5) narrative = 'Performing above long-term projection — potential sell window while value is high'
    else if (gap <= -5) narrative = 'Long-term projection stronger than current output — potential buy-low target'
  }

  const chips = [
    { label: 'Recent',  value: recentRank,
      color: movementLabel === 'up' ? 'text-[var(--c-green-600)]'
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
        : projectionConfidence === 'high' ? 'text-[var(--color-accent-text)]'
        : projectionConfidence === 'medium' ? 'text-[var(--color-accent)]'
        : projectionConfidence === 'rookie' ? 'text-[var(--c-purple-600)]'
        : 'text-[var(--color-text-muted)]' },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chips.map(({ label, value, color, suffix }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wide leading-none mb-0.5">{label}</span>
            <span className={`text-sm font-semibold tabular-nums ${color}`}>
              {value != null ? `${position}${value}${suffix ?? ''}` : '—'}
            </span>
          </div>
        ))}
        <Tooltip content={RANKINGS_LEGEND} position="bottom">
          <span className="text-[var(--color-text-faintest)] hover:text-[var(--color-text-muted)] cursor-help text-xs ml-1">ⓘ</span>
        </Tooltip>
      </div>
      {narrative && (
        <p className="text-xs italic text-[var(--color-text-muted)] mt-2">{narrative}</p>
      )}
    </>
  )
}
