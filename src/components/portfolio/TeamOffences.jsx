import { useState } from 'react'
import { DefinitionPopover } from '../dp/DefinitionPopover'
import { ordinal } from '../../utils/environment'
import { PRIOR_WEIGHT_GAMES } from '../../utils/opponentStrength'
import { TH_CLASS, DIVIDER } from './tableClasses'

// Portfolio Slice D — "The offences your starters play in". Props-only, like LeagueLadders /
// WeakestSlots: Portfolio assembles the rows (already sorted, starters' teams first) and this
// component computes nothing from raw loaders. View-layer only.
//
// Colour is this table's verdict channel. Rank tone = blue at top-8, amber at bottom-8, neutral
// between; `invert` flips it where a LOW rank number is bad news for my player (SOS: 1 = hardest;
// DEF EPA ALL: buildLeagueRankTable ranks it higher-is-better, so rank 1 is the WORST defence — the
// inversion lives here, never in environment.js's LOWER_IS_BETTER, which Market and Teams share).
// MARGIN is deliberately uncoloured (a positive margin is good for a back and bad for a receiver —
// that per-position verdict is the GAME SCRIPT column's job), and PROE is uncoloured-by-position:
// it describes the offence, so it is never inverted per roster.

const MINUS = '−'

const signed = (v, digits) => `${v >= 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}`
const fmtPct = v => `${v >= 0 ? '+' : MINUS}${Math.abs(v * 100).toFixed(1)}%`

// 'good' | 'bad' | null. The amber edge is `rankedTeamCount - 7` (25 of 32), computed so a partial
// rank set does not colour half the table amber.
function toneOf(rank, invert, rankedTeamCount) {
  if (rank == null) return null
  const top = rank <= 8
  const bottom = rankedTeamCount > 0 && rank >= rankedTeamCount - 7
  if (invert) return bottom ? 'good' : top ? 'bad' : null
  return top ? 'good' : bottom ? 'bad' : null
}

function toneClass(rank, invert, rankedTeamCount) {
  const t = toneOf(rank, invert, rankedTeamCount)
  return t === 'good' ? 'text-dp-up-text' : t === 'bad' ? 'text-dp-down-text' : 'text-dp-text'
}

const NAME_SUFFIX = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])
function lastName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  while (parts.length > 1 && NAME_SUFFIX.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  return parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? full ?? '')
}

const Missing = () => <span className="text-dp-muted">—</span>

function Num({ value, format, cls = 'text-dp-text', testId, title }) {
  if (value == null) return <span data-testid={testId} className="text-dp-muted">—</span>
  return <span data-testid={testId} title={title} className={`font-dp-mono ${cls}`}>{format(value)}</span>
}

const POS_ORDER = ['QB', 'RB', 'WR', 'TE']

export function TeamOffences({
  rows = [], dataSeason = null, sosSeason = null, rankedTeamCount = 0, fpaCurrentSeason = null,
}) {
  const [expanded, setExpanded] = useState(false)
  const hasBenchOnly = rows.some(r => !r.hasStarter)
  const visible = expanded ? rows : rows.filter(r => r.hasStarter)

  const sosGloss = (fpaCurrentSeason != null
    ? `Average fantasy points allowed (FPA) to your player's position by the opponents still to come `
      + `on the ${sosSeason} schedule, ranked 1 = hardest. Each defence's rate blends ${fpaCurrentSeason} `
      + `games played so far with ${dataSeason}, shrinking toward ${dataSeason} at a ${PRIOR_WEIGHT_GAMES}-game `
      + `rate (a judgment call, not backtested) — not a completed season. `
    : `Average fantasy points allowed (FPA) to your player's position by the opponents still to come `
      + `on the ${sosSeason} schedule, ranked 1 = hardest. Defence rates are ${dataSeason} season data only — `
      + `no ${sosSeason} games recorded yet, so this is not a blend. `)
    + "Half-PPR basis (Sleeper's own scoring, not necessarily this league's)."

  const th = (label, { divider = false, popover = null } = {}) => (
    <th className={`${TH_CLASS} ${divider ? DIVIDER : ''}`}>
      {popover
        ? <DefinitionPopover term={popover.term ?? label} gloss={popover.gloss} field={popover.field}>{label}</DefinitionPopover>
        : label}
    </th>
  )

  return (
    <div data-testid="team-offences" className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-2.5 px-[18px] pt-3.5 pb-3 border-b border-dp-border-row">
        <div>
          <div className="text-[13px] font-semibold text-dp-text-strong">The offences your starters play in</div>
          <div className="text-[11.5px] text-dp-muted">
            {dataSeason} season, regular season only · how they use players, how well they do, what their defence gives back
          </div>
        </div>
        <div className="ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2">
          teamContext · {rankedTeamCount} TEAMS · BLUE / AMBER = TOP / BOTTOM 8
        </div>
      </div>

      {/* Plain `overflow-x-auto`, same as every other table in the app. This scroller briefly
          carried a `[contain:inline-size]` workaround because AppShell's <main> lacked `min-w-0`
          and these 12 nowrap columns widened the whole page; the fix now lives on <main> itself,
          so one mechanism covers every table rather than this one alone. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-dp-row-head">
            <tr>
              {th('TEAM')}
              {th('YOUR PLAYERS')}
              {th('PTS/G', { divider: true })}
              {th('PTS ALLOWED')}
              {th('MARGIN')}
              {th('OFF EPA/PL', { divider: true })}
              {th('PROE', { popover: {
                gloss: 'Pass rate over expected: how much more (or less) the team passes than its down, distance and score would predict. Positive = throws more than the situation calls for.',
                field: 'teamcontext off.passPlays ÷ off.plays − off.proeXpassSum ÷ off.proePlays, REG weeks summed',
              } })}
              {th('PLAYS/G')}
              {th('RZ TRIPS/G', { popover: {
                gloss: 'Red-zone trips per game — drives inside the opponent 20. More trips means more scoring chances for the players who work there.',
                field: 'teamcontext off.rzTrips ÷ REG games',
              } })}
              {th('DEF EPA ALL', { popover: {
                gloss: 'Expected points added per play the defence allows. Lower is better for the defence, so blue here means a stingy defence and amber a leaky one.',
                field: 'teamcontext def.epaSum ÷ def.epaPlays, REG weeks summed',
              } })}
              {th(`QB ${dataSeason} · EPA/ATT`, { divider: true, popover: {
                term: 'QB · EPA/ATT',
                gloss: `${dataSeason}'s primary passer by attempts, and his EPA per attempt that season. A team that has since changed quarterbacks will show last season's starter.`,
                field: `gamelogs passingEpa ÷ attempts, ${dataSeason} REG — needs 100+ attempts`,
              } })}
              {th(`SOS ${sosSeason}`, { divider: true, popover: {
                term: `SOS ${sosSeason}`,
                gloss: sosGloss,
                field: 'fan_pts_allow_<pos> ÷ gamesPlayed, averaged over remaining opponents',
              } })}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const pts = r.pointsPerGame
              const barPx = pts == null ? 0 : Math.max(0, Math.min(60, Math.round(((pts - 16) / 16) * 60)))
              const ptsTone = toneOf(r.ptsRank, false, rankedTeamCount)
              const barBg = ptsTone === 'good' ? 'bg-dp-up' : ptsTone === 'bad' ? 'bg-dp-down' : 'bg-dp-slate'
              const sos = [...(r.sos ?? [])].sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))
              return (
                <tr key={r.team} data-testid={`offence-${r.team}`} title={r.script?.label ?? undefined} className="border-t border-dp-border-row">
                  <td className="px-[10px] py-2 first:pl-[18px] whitespace-nowrap">
                    <span className="font-dp-mono font-semibold text-dp-text">{r.team}</span>
                    <span className="text-[11px] text-dp-muted ml-2">{r.name}</span>
                  </td>
                  <td data-testid="offence-players" className="px-[10px] py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.players ?? []).map(p => (
                        <span
                          key={p.playerId}
                          data-testid={p.starter ? 'chip-starter' : 'chip-bench'}
                          className={`text-[10.5px] rounded px-1.5 py-0.5 ${p.starter
                            ? 'text-dp-up-text bg-dp-up-bg border border-dp-up-border'
                            : 'text-dp-text-5 border border-dp-border'}`}
                        >
                          {lastName(p.name)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-testid="offence-pts" className={`px-[10px] py-2 ${DIVIDER}`}>
                    {pts == null ? <Missing /> : (
                      <div className="flex items-center gap-2">
                        <div data-testid="pts-bar" className={`h-1.5 rounded-[3px] shrink-0 ${barBg}`} style={{ width: `${barPx}px` }} />
                        <span className={`font-dp-mono ${toneClass(r.ptsRank, false, rankedTeamCount)}`}>{pts.toFixed(1)}</span>
                      </div>
                    )}
                  </td>
                  <td data-testid="offence-allowed" className="px-[10px] py-2"><Num value={r.pointsAllowedPerGame} format={v => v.toFixed(1)} /></td>
                  <td data-testid="offence-margin" className="px-[10px] py-2"><Num value={r.marginPerGame} format={v => signed(v, 1)} /></td>
                  <td data-testid="offence-epa" className={`px-[10px] py-2 ${DIVIDER}`}>
                    <Num value={r.epaPerPlay} format={v => signed(v, 3)} cls={toneClass(r.epaRank, false, rankedTeamCount)} />
                  </td>
                  <td data-testid="offence-proe" className="px-[10px] py-2">
                    <Num value={r.proe} format={fmtPct} cls={toneClass(r.proeRank, false, rankedTeamCount)} />
                  </td>
                  <td data-testid="offence-plays" className="px-[10px] py-2"><Num value={r.playsPerGame} format={v => v.toFixed(1)} /></td>
                  <td data-testid="offence-rz" className="px-[10px] py-2"><Num value={r.rzTripsPerGame} format={v => v.toFixed(2)} /></td>
                  <td data-testid="offence-def" className="px-[10px] py-2">
                    <Num value={r.defEpaPerPlay} format={v => signed(v, 3)} cls={toneClass(r.defRank, true, rankedTeamCount)} />
                  </td>
                  <td data-testid="offence-qb" className={`px-[10px] py-2 ${DIVIDER} whitespace-nowrap`}>
                    {r.qb == null ? <Missing /> : (
                      <>
                        <span className="text-dp-text">{r.qb.name ?? <Missing />}</span>
                        {' '}
                        <Num value={r.qb.epaPerAtt} format={v => signed(v, 3)} cls={toneClass(r.qb.rank, false, rankedTeamCount)} />
                      </>
                    )}
                  </td>
                  <td data-testid="offence-sos" className={`px-[10px] py-2 last:pr-[18px] ${DIVIDER} whitespace-nowrap`}>
                    {sos.length === 0 ? <Missing /> : sos.map((s, i) => (
                      <span key={s.position}>
                        {i > 0 && <span className="text-dp-muted"> · </span>}
                        <span className="text-[10.5px] text-dp-muted">{s.position} </span>
                        {s.rank == null
                          ? <span data-testid={`sos-${s.position}`} className="text-dp-muted">—</span>
                          : <span data-testid={`sos-${s.position}`} className={`font-dp-mono ${toneClass(s.rank, true, rankedTeamCount)}`}>{ordinal(s.rank)}</span>}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasBenchOnly && (
        <div className="px-[18px] py-2 border-t border-dp-border-row">
          <button
            type="button"
            data-testid="offences-toggle"
            className="text-[11.5px] text-dp-up-text"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'show fewer ←' : `show all ${rows.length} →`}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11.5px]">
        <span className="text-dp-muted">
          PTS/G against PTS ALLOWED is the game script: a negative MARGIN means the team usually trails and throws
          to catch up, good for pass-catchers; a big positive margin means leads and a run-heavy fourth quarter.
          A high PROE says the team throws more than the situation calls for.
        </span>
        <span className="text-dp-muted-2">
          SOS is the rest of the {sosSeason} schedule — the average fantasy points allowed to your player&apos;s
          position (FPA) by the opponents still to come, ranked 1 = hardest.
        </span>
      </div>
    </div>
  )
}
