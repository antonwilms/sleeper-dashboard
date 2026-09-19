// Portfolio Slice C — "Where you rank, out of twelve". Renders `buildPositionLadders` output
// (Slice A, src/utils/lineup.js) as a per-position rank ladder. View-layer only; no lineup
// recomputation here — `lastAll`/`projAll` stay unread (geometry is by rank alone, not by the
// point gap). This block defines its own rank-tone/rung-fill helpers rather than reusing
// Portfolio.jsx's `rankClass` (C5) — the design's neutral colour for this block differs from the
// tiles', and sharing one helper would silently restyle the tiles.

const COUNT_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
]
const countWord = n => (n >= 0 && n <= 20 ? COUNT_WORDS[n] : String(n))

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

const third = n => Math.ceil(n / 3)
// Design's rankC, generalised off 12 teams (C2). Used for the rank NUMBER.
const rankTone = (r, n) =>
  r == null ? 'text-dp-muted'
    : r <= third(n) ? 'text-dp-up-text'
    : r > n - third(n) ? 'text-dp-down-text'
    : 'text-dp-text'
// The rung FILL — one step stronger than the number, per the design.
const rungFill = (r, n) =>
  r <= third(n) ? 'bg-dp-up' : r > n - third(n) ? 'bg-dp-down' : 'bg-dp-text-strong'

const GRID = 'grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_72px] gap-x-3' +
  ' sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)_96px] sm:gap-x-[22px]'

function RankLadder({ rank, teamCount, cellTestId }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3" data-testid={cellTestId}>
      <span
        data-testid="ladder-rank"
        className={`font-dp-mono text-base sm:text-lg font-semibold w-[34px] sm:w-[44px] shrink-0 ${rankTone(rank, teamCount)}`}
      >
        {rank == null ? '—' : ordinal(rank)}
      </span>
      <span className="flex gap-[2px] sm:gap-[3px] items-start h-3.5 flex-1 min-w-0" data-testid="ladder-rungs">
        {Array.from({ length: teamCount }, (_, i) => {
          const isMine = rank != null && i + 1 === rank
          return (
            <span key={i} className={`flex-1 min-w-0 h-3.5 ${isMine ? '' : 'pt-1'}`}>
              {isMine ? (
                <span data-testid="rung-mine" className={`block w-full rounded-[2px] h-3.5 ${rungFill(rank, teamCount)}`} />
              ) : (
                <span className="block w-full rounded-[2px] h-1.5 bg-dp-border" />
              )}
            </span>
          )
        })}
      </span>
    </div>
  )
}

function MoveCell({ move }) {
  let text = '—'
  let cls = 'text-dp-muted'
  if (move != null) {
    if (move < 0) { text = `up ${-move}`; cls = 'text-dp-up-text' }
    else if (move > 0) { text = `down ${move}`; cls = 'text-dp-down-text' }
    else { text = 'no change'; cls = 'text-dp-text-5' }
  }
  return <span data-testid="ladder-move" className={`font-dp-mono text-xs font-semibold ${cls}`}>{text}</span>
}

export function LeagueLadders({ ladders = [], teamCount = 0, dataSeason = null, projSeason = null }) {
  return (
    <div data-testid="league-ladders" className="bg-dp-card border border-dp-border rounded-[10px] px-[18px] pt-3.5 pb-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-dp-text-strong">
          {teamCount === 0 ? 'Where you rank' : `Where you rank, out of ${countWord(teamCount)}`}
        </span>
        <span className="text-[11.5px] text-dp-muted">by points from the starters at each position</span>
        {teamCount > 0 && (
          <span className="ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2">
            1ST ← LADDER → {ordinal(teamCount).toUpperCase()}
          </span>
        )}
      </div>

      {ladders.length === 0 ? (
        <p className="text-sm text-dp-muted py-6">No league lineups — league rosters or slots not loaded.</p>
      ) : (
        <>
          <div className={`${GRID} font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted-2 mt-3`}>
            <span></span>
            <span>{dataSeason ?? '—'} · SCORED</span>
            <span>{projSeason ?? '—'} · PROJECTED</span>
            <span>MOVE</span>
          </div>

          {ladders.map(l => (
            <div
              key={l.pos}
              data-testid={`ladder-row-${l.pos}`}
              className={`${GRID} items-center py-3 border-t border-dp-border-row`}
            >
              <div>
                <div className="text-sm font-bold text-dp-text">{l.pos}</div>
                <div className="text-[10.5px] text-dp-muted mt-px">{l.slotsLabel}</div>
              </div>
              <RankLadder rank={l.lastRank} teamCount={teamCount} cellTestId="ladder-last" />
              <RankLadder rank={l.projRank} teamCount={teamCount} cellTestId="ladder-proj" />
              <MoveCell move={l.move} />
            </div>
          ))}

          <p className="text-[11px] text-dp-muted leading-normal mt-1 pt-2.5 border-t border-dp-border-row [text-wrap:pretty]">
            Each ladder has {countWord(teamCount)} rungs, one per team, best on the left. The tall rung is you. MOVE is
            how many places the {projSeason == null ? 'projection shifts you' : `${projSeason} projection shifts you`}.
          </p>
        </>
      )}
    </div>
  )
}
