// myteam-m2b-defences-ahead.md §4.2 — My Team's "Defences ahead" card, in season (from week 1), under the
// offences table. One row per filled Starting-ten slot (D-a: the starting ten, not Sleeper's set
// lineup). Presentational — Portfolio.jsx builds `rows`/`weeks` with utils/defencesAhead.js.
//
// Part (a) "This week" is the old This-week "Defences you face" panel moved here (lineage:
// weekly-decision-2-panels.md §2, defence-numbers-rebuild.md §6.3): the two unmixed halves of the
// ALLOWS blend, the blend with its per-row weight and rank, pass/rush yards allowed per game and W-L-T
// records; the position group the points belong to is named in the This-week eyebrow (the points are the
// whole group's, not this player's matchup). Part (b) "Rest of season" is one column per
// remaining regular-season week: the opponent and the blended points it allows to the row's position,
// BYE on a bye, — when the schedule cannot answer.
//
// Colour (D3, D-c): points allowed are toned in LineupTable's five coarse rank bands
// (dp/allowsTone.js), on part (a)'s BLENDED value and RANK text and on each part (b) number. The halves,
// yards and records stay untoned. No percentile palette, no easy/hard word.
//
// `opponentEra` (`LA`) keys the allowed halves and the record maps upstream (CR-16); `opponent`
// (Sleeper domain, `LAR`) is display only. Season order per docs/ui.md: the current season is the main
// value, the prior season the grey line beneath, and that line names it.

import { FrozenScroll } from '../dp/FrozenScroll'
import { FROZEN_FIRST, FROZEN_EDGE, PLAYER_CELL_PHONE_CAP } from '../dp/frozen'
import { PlayerCell } from '../dp/cells'
import { TeamLogo } from '../dp/SleeperImages'
import { allowsToneClass } from '../dp/allowsTone'
import { PRIOR_WEIGHT_GAMES } from '../../utils/opponentStrength'

// PlayerCell's row shape from a Defences-ahead row (the shared player cell, M3 D8).
const cellRow = r => ({ player_id: r.player_id, full_name: r.name, position: r.position, nfl_team: r.team })

function fpaText(v) {
  return v == null ? '—' : v.toFixed(1)
}

function yardsText(v) {
  return v == null ? '—' : String(Math.round(v))
}

// W-L or W-L-T; null when there is no scored game (a bye row, or a schedule file that has not
// scored one yet) — never `0-0`.
function recordText(rec) {
  if (!rec || rec.w + rec.l + rec.t === 0) return null
  return rec.t === 0 ? `${rec.w}-${rec.l}` : `${rec.w}-${rec.l}-${rec.t}`
}

function failedWeeksLine({ season, weeks }) {
  const many = weeks.length > 1
  return `Week${many ? 's' : ''} ${weeks.join(', ')} of ${season} failed to load from Sleeper and ${many ? 'are' : 'is'} left out of these figures.`
}

// Two-line header for the three new columns: the label, then the current season (the main value's
// season; the grey line beneath each cell names its own).
function TwoLineTh({ label, currentSeason, priorSeason, edge = false }) {
  return (
    <th
      title={`Main value: ${currentSeason ?? '—'}; grey line beneath: ${priorSeason ?? '—'}`}
      className={`text-right ${edge ? 'px-[18px]' : 'px-2.5'} py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap`}
    >
      <div>{label}</div>
      <div className="text-dp-muted-2 text-[9px]">{currentSeason ?? '—'}</div>
    </th>
  )
}

function TwoLineCell({ testId, current, prior, priorSeason = null, extra = null, edge = false }) {
  return (
    <td data-testid={testId} className={`${edge ? 'px-[18px]' : 'px-2.5'} py-2.5 text-right font-dp-mono`}>
      <div className="text-[12px] text-dp-text-2">
        {current}
        {extra}
      </div>
      <div className="text-[10.5px] text-dp-muted">{priorSeason != null && prior !== '—' ? `${priorSeason} · ${prior}` : prior}</div>
    </td>
  )
}

function WeekCell({ cell }) {
  if (cell.status === 'game') {
    return (
      <td data-testid={`ahead-wk-${cell.week}`} className="px-2.5 py-2 text-center font-dp-mono whitespace-nowrap">
        <div className="text-[11px] text-dp-text-2">{cell.opponent}</div>
        {cell.allows == null
          ? <div className="text-[12px] text-dp-muted">—</div>
          : <div className={`text-[12px] ${allowsToneClass(cell.allowsRank)}`}>{cell.allows.toFixed(1)}</div>}
      </td>
    )
  }
  return (
    <td data-testid={`ahead-wk-${cell.week}`} className="px-2.5 py-2 text-center font-dp-mono text-[11px] text-dp-muted whitespace-nowrap">
      {cell.status === 'bye' ? 'BYE' : '—'}
    </td>
  )
}

export function DefencesAhead({
  rows = [], weeks = [], currentWeek, liveSeason, priorSeason = null,
  currentSeason = null, failedWeeks = [], scheduleLoaded = false,
}) {
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  return (
    <div data-testid="defences-ahead" className="bg-dp-card border border-dp-border rounded-[12px] overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-2.5 px-[18px] pt-3.5 pb-3 border-b border-dp-border-row">
        <div>
          <div className="text-[13px] font-semibold text-dp-text-strong">Defences ahead</div>
          <div className="text-[11.5px] text-dp-muted">Week {currentWeek} · {liveSeason} · your starting ten</div>
        </div>
        <span className="ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2">k {PRIOR_WEIGHT_GAMES}</span>
      </div>

      <div className="px-[18px] pt-2.5 pb-1.5 font-dp-mono text-[10px] tracking-[0.06em] uppercase text-dp-muted-2">This week · points allowed to the row's position / G</div>
      <FrozenScroll>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dp-card-quiet">
              <th className={`text-left px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted ${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card`}>DEF</th>
              <th className="text-left px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">VS</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">{priorSeason ?? '—'} PTS/G</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">{currentSeason ?? '—'} SO FAR</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">BLENDED</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">RANK</th>
              <TwoLineTh label="PASS YD/G" currentSeason={currentSeason} priorSeason={priorSeason} />
              <TwoLineTh label="RUSH YD/G" currentSeason={currentSeason} priorSeason={priorSeason} />
              <TwoLineTh label="RECORD" edge currentSeason={currentSeason} priorSeason={priorSeason} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const empty = r.bye || r.opponent == null
              return (
                <tr key={`${r.slot}-${r.player_id}-${i}`} data-testid={`ahead-row-${r.player_id}`} className="border-t border-dp-border-row">
                  <td className={`px-[18px] py-2.5 ${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card`}>
                    <PlayerCell row={cellRow(r)} sub={null} photoFromMd className={PLAYER_CELL_PHONE_CAP} />
                  </td>
                  <td data-testid="ahead-vs" className="px-2.5 py-2.5 font-dp-mono text-[11.5px] text-dp-text-2">
                    {!r.bye && r.opponent ? (
                      <span className="inline-flex items-center gap-1.5">
                        <TeamLogo team={r.opponent} size={14} />
                        {r.opponent}
                      </span>
                    ) : (r.bye ? 'BYE' : '—')}
                  </td>
                  <td data-testid="ahead-prior" className="px-2.5 py-2.5 text-right">
                    {empty ? <span className="text-dp-muted">—</span> : (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`font-dp-mono text-[12px] ${r.notBlended ? 'text-dp-muted' : 'text-dp-text-2'}`}>{fpaText(r.prior)}</span>
                        {r.notBlended && r.prior != null && (
                          <span className="text-dp-muted-2 text-[9px] whitespace-nowrap">not blended</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td data-testid="ahead-current" className="px-2.5 py-2.5 text-right font-dp-mono text-[12px] text-dp-text-2">
                    {empty ? <span className="text-dp-muted">—</span> : fpaText(r.current)}
                  </td>
                  <td data-testid="ahead-blended" className="px-2.5 py-2.5 text-right">
                    {empty || r.allows == null ? <span className="text-dp-muted">—</span> : (
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-dp-mono text-[13px] font-semibold ${allowsToneClass(r.allowsRank)}`}>{r.allows.toFixed(1)}</span>
                        <div className="flex items-center gap-1">
                          <span className="w-[26px] h-1 bg-dp-border rounded-full overflow-hidden block">
                            <span className="block h-1 bg-dp-up" style={{ width: `${Math.round((r.weight ?? 0) * 100)}%` }} />
                          </span>
                          <span className="font-dp-mono text-[9px] text-dp-muted whitespace-nowrap">{Math.round((r.weight ?? 0) * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </td>
                  <td data-testid="ahead-rank" className={`px-2.5 py-2.5 text-right font-dp-mono text-[11px] ${empty || r.allowsRank == null ? 'text-dp-muted' : allowsToneClass(r.allowsRank)}`}>
                    {empty || r.allowsRank == null ? '—' : `${r.allowsRank} of 32`}
                  </td>
                  <TwoLineCell testId="ahead-pass" priorSeason={priorSeason} current={yardsText(r.yardsCurrent?.pass)} prior={yardsText(r.yardsPrior?.pass)} />
                  <TwoLineCell testId="ahead-rush" priorSeason={priorSeason} current={yardsText(r.yardsCurrent?.rush)} prior={yardsText(r.yardsPrior?.rush)} />
                  <TwoLineCell
                    testId="ahead-record"
                    priorSeason={priorSeason}
                    edge
                    current={recordText(r.recCurrent) ?? '—'}
                    prior={recordText(r.recPrior) ?? '—'}
                    extra={r.recCurrent?.unscored > 0 && (
                      <span className="text-dp-muted-2 text-[9px] whitespace-nowrap">
                        {recordText(r.recCurrent) == null ? ' no wk scored' : ` thru wk ${r.recCurrent.lastWeek}`}
                      </span>
                    )}
                  />
                </tr>
              )
            })}
          </tbody>
        </table>
      </FrozenScroll>

      <div className="px-[18px] pt-3 pb-1.5 font-dp-mono text-[10px] tracking-[0.06em] uppercase text-dp-muted-2 border-t border-dp-border-row">
        {scheduleLoaded && weeks.length > 0 ? `Rest of season · WK ${first}–${last}` : 'Rest of season'}
      </div>
      {scheduleLoaded && weeks.length > 0 ? (
        <FrozenScroll>
          <table data-testid="ahead-schedule" className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-dp-card-quiet">
                <th className={`text-left px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted ${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card`}>DEF</th>
                {weeks.map(w => (
                  <th key={w} data-testid={`ahead-wk-head-${w}`} className="text-center px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">WK {w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.slot}-${r.player_id}-${i}`} data-testid={`ahead-sched-${r.player_id}`} className="border-t border-dp-border-row">
                  <td className={`px-[18px] py-2 ${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card`}>
                    <PlayerCell row={cellRow(r)} sub={null} photoFromMd className={PLAYER_CELL_PHONE_CAP} />
                  </td>
                  {r.ahead.map(cell => <WeekCell key={cell.week} cell={cell} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </FrozenScroll>
      ) : (
        <div className="px-[18px] pb-3 text-[11.5px] text-dp-muted">
          {!scheduleLoaded
            ? `No ${liveSeason} schedule is loaded, so the weeks ahead are not shown.`
            : 'No regular-season weeks remain.'}
        </div>
      )}

      <div className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed">
        Points allowed use this league&rsquo;s scoring: every QB, RB, WR and TE stat line in
        Sleeper&rsquo;s weekly stats, scored with your league&rsquo;s settings and credited to the defence
        it came against, divided by that defence&rsquo;s games. Each row&rsquo;s bar beneath BLENDED is how
        much of that row&rsquo;s blend is the current season — it differs by defence and position, so
        there is no single season-wide percentage to show in the header. Yards are per game from the
        opposing offence&rsquo;s weekly team line; passing is net of sack yards, so pass plus rush is
        total yards allowed. Records are regular-season results from the nflverse schedule file, which
        refreshes on its own cadence; &ldquo;thru wk N&rdquo; marks a record that trails the completed
        weeks.{' '}
        Points allowed are coloured in the same bands as This week&rsquo;s ALLOWED / G: ranks 23–32 allow
        the most, ranks 1–10 the fewest.
        {failedWeeks.map(f => (
          <div key={f.season} data-testid="ahead-failed-weeks">{failedWeeksLine(f)}</div>
        ))}
      </div>
    </div>
  )
}
