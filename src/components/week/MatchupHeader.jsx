// week-w-matchup-flags-visuals.md §1d — the `/week` matchup header card. Presentational, props-only.
// Names this week's league opponent (from the live-week matchups read in useWeeklyDecision), shows
// each side's PROJ (Sleeper) and OURS totals, says why when there is no opponent, and summarises the
// lineup flags. Totals that lack a slot's value say "n of N" — never zero-filled. Nothing here picks,
// recommends or reorders.

const MINUS = '−'

const REASON_COPY = {
  'no-league': 'No league selected — opponent not shown.',
  'fetch-failed': "This week's league matchups didn't load — opponent not shown.",
  'no-matchup': 'Sleeper lists no head-to-head opponent for you this week (bye, eliminated, or median-only).',
  unpaired: "Sleeper's matchup for you this week has no single opponent — not shown.",
}

function recordText(record) {
  if (!record) return '—'
  return record.ties > 0 ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`
}

const fmt = v => (v == null ? '—' : v.toFixed(1))

function TotalRow({ label, total, valued, slots, unit, title }) {
  return (
    <div className="mt-2" title={title}>
      <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">{label}</div>
      <div className="font-dp-mono text-[20px] font-semibold text-dp-text">{fmt(total)}</div>
      {valued < slots && (
        <div className="font-dp-mono text-[10px] text-dp-muted-2">{`${valued} of ${slots} ${unit}`}</div>
      )}
    </div>
  )
}

function Side({ side, testId, showOurs, oursPending = false }) {
  return (
    <div data-testid={testId} className="flex-1 min-w-0">
      <div className="text-[13px] font-semibold text-dp-text truncate">{side.teamName ?? '—'}</div>
      <div className="font-dp-mono text-[11px] text-dp-muted">{recordText(side.record)}</div>
      <TotalRow label="PROJ · Sleeper" total={side.proj.total} valued={side.proj.valued} slots={side.proj.slots} unit="projected" />
      {showOurs && oursPending ? (
        <div data-testid="matchup-ours-pending" className="mt-2" title="Season projections not available yet — OURS fills in when they arrive.">
          <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">OURS · ours</div>
          <div className="font-dp-mono text-[20px] font-semibold text-dp-muted">…</div>
          <div className="font-dp-mono text-[10px] text-dp-muted-2">season projections not available yet</div>
        </div>
      ) : showOurs ? (
        // PROVISIONAL(heuristic): OURS total in the matchup header · renders the sum of weeklyOwnProjection.js's heuristic, not a model verdict · a fitted, graded weekly model would make it real
        <TotalRow label="OURS · ours" total={side.ours.total} valued={side.ours.valued} slots={side.ours.slots} unit="valued" />
      ) : (
        <div className="mt-2" title="OURS is computed for your roster only">
          <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">OURS · ours</div>
          <div className="font-dp-mono text-[20px] font-semibold text-dp-muted">—</div>
        </div>
      )}
    </div>
  )
}

function FlagsLine({ startSit }) {
  const flags = startSit?.flags ?? []
  if (flags.length > 0) {
    const n = flags.length
    return (
      <div data-testid="startsit-summary" className="text-[12px] text-dp-text-2">
        <button
          type="button"
          className="underline decoration-dotted underline-offset-2 hover:text-dp-text"
          onClick={() => document.getElementById(`startsit-flag-${flags[0].slotIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          {`${n} lineup flag${n === 1 ? '' : 's'}`}
        </button>
        <span className="text-dp-muted">{' · basis: Sleeper PROJ'}</span>
      </div>
    )
  }
  if (startSit?.basisAvailable) {
    const unchecked = startSit.uncheckedSlots ?? []
    return (
      <div data-testid="startsit-summary" className="text-[12px] text-dp-muted">
        {'No bench player projects higher (Sleeper PROJ) for a slot he can fill, directly or with one starter moved'}
        {unchecked.length > 0 ? ` · ${unchecked.join(', ')} not checked` : ''}
      </div>
    )
  }
  return (
    <div data-testid="startsit-summary" className="text-[12px] text-dp-muted">
      No Sleeper projections loaded — lineup not checked.
    </div>
  )
}

export function MatchupHeader({ matchup, startSit, loading = false, oursPending = false }) {
  const shell = 'bg-dp-card border border-dp-border rounded-[12px] px-4 py-3'
  if (matchup.status === 'loading') {
    return (
      <div data-testid="matchup-header" className={shell}>
        <div className="text-[13px] font-semibold text-dp-text-strong">{`Week ${matchup.week} matchup`}</div>
        <div className="text-[12px] text-dp-muted mt-1">Loading matchup…</div>
      </div>
    )
  }
  const { mine, opponent } = matchup
  return (
    <div data-testid="matchup-header" className={shell}>
      <div className="text-[13px] font-semibold text-dp-text-strong">{`Week ${matchup.week} matchup`}</div>
      <div className="flex gap-4 mt-2">
        <Side side={mine} testId="matchup-mine" showOurs oursPending={oursPending} />
        {opponent && <Side side={opponent} testId="matchup-opponent" showOurs={false} />}
      </div>
      {matchup.live && (
        <div data-testid="matchup-live" className="mt-3">
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">POINTS · Sleeper</div>
              <div className="font-dp-mono text-[14px] text-dp-text">{fmt(mine.points)}</div>
            </div>
            {opponent && (
              <div className="flex-1 min-w-0">
                <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">POINTS · Sleeper</div>
                <div className="font-dp-mono text-[14px] text-dp-text">{fmt(opponent.points)}</div>
              </div>
            )}
          </div>
          <div className="text-[10px] text-dp-muted-2 mt-0.5">
            Sleeper&rsquo;s matchup points as of the last load — can be up to an hour old
          </div>
        </div>
      )}
      {matchup.projMargin != null && (
        <div className="font-dp-mono text-[12px] text-dp-text-2 mt-3">
          {`PROJ margin ${matchup.projMargin >= 0 ? '+' : MINUS}${Math.abs(matchup.projMargin).toFixed(1)}`}
        </div>
      )}
      {matchup.reason != null && (
        <div data-testid="matchup-reason" className="text-[12px] text-dp-muted mt-3">{REASON_COPY[matchup.reason]}</div>
      )}
      {!loading && (
        <div className="mt-3 pt-2.5 border-t border-dp-border-row">
          <FlagsLine startSit={startSit} />
        </div>
      )}
    </div>
  )
}
