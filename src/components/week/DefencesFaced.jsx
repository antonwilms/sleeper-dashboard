// weekly-decision-2-panels.md §2, rebuilt by defence-numbers-rebuild.md §6.3 — the two unmixed
// halves of the ALLOWS blend, plus pass/rush yards allowed per game and W-L-T records, one row per
// filled starter, in set-lineup order (empty slots and bench get no row — this panel is about the
// defences your starters face). Presentational except for its own memo below, which calls the
// already-exported `computeFpaPerGame`/`computeYardsPerGame` directly against the hook's
// `priorAllowed`/`currentAllowed` — never re-derives them, and never reads the halves out of
// `buildFpaTable`'s return (it does not expose them).
//
// `opponentEra` (`LA`) keys `priorAllowed`/`currentAllowed` and the record maps — the era-accurate
// domain `buildDefenceSeasonAllowed`/`buildTeamRecords` key on (CR-16 hop applied there). `opponent`
// (Sleeper domain, `LAR`) is display only. `allows`/`allowsRank`/`weight` come straight off W2a's
// row, exactly as LineupTable's ALLOWS column renders them.

import { useMemo } from 'react'
import { TeamLogo } from '../dp/SleeperImages'
import { computeFpaPerGame, computeYardsPerGame, PRIOR_WEIGHT_GAMES } from '../../utils/opponentStrength'

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

// Two-line header for the three new columns: the label, then `current · prior` seasons.
function TwoLineTh({ label, currentSeason, priorSeason, edge = false }) {
  return (
    <th className={`text-right ${edge ? 'px-[18px]' : 'px-2.5'} py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap`}>
      <div>{label}</div>
      <div className="text-dp-muted-2 text-[9px]">{currentSeason ?? '—'} · {priorSeason ?? '—'}</div>
    </th>
  )
}

function TwoLineCell({ testId, current, prior, extra = null, edge = false }) {
  return (
    <td data-testid={testId} className={`${edge ? 'px-[18px]' : 'px-2.5'} py-2.5 text-right font-dp-mono`}>
      <div className="text-[12px] text-dp-text-2">
        {current}
        {extra}
      </div>
      <div className="text-[10.5px] text-dp-muted">{prior}</div>
    </td>
  )
}

export function DefencesFaced({
  starters = [], priorAllowed = null, currentAllowed = null, priorRecords = {}, currentRecords = {},
  priorSeason = null, currentSeason = null, failedWeeks = [],
}) {
  const rows = useMemo(() => {
    return starters
      .filter(r => r.player_id != null)
      .map(r => {
        const empty = r.bye || r.opponent == null
        const pos = r.position ? r.position.toLowerCase() : null
        const era = r.opponentEra
        const prior = !empty && pos ? computeFpaPerGame(priorAllowed, era, pos) : null
        const current = !empty && pos ? computeFpaPerGame(currentAllowed, era, pos) : null
        const yardsPrior = empty ? null : computeYardsPerGame(priorAllowed, era)
        const yardsCurrent = empty ? null : computeYardsPerGame(currentAllowed, era)
        const recPrior = empty ? null : (priorRecords?.[era] ?? null)
        const recCurrent = empty ? null : (currentRecords?.[era] ?? null)
        // The blend drops the prior once gCur reaches FPA_PRIOR_DROP_GAMES — the ONLY case where
        // weeklyLineup.js's buildRow sets `weight` to exactly 1 (blendWeight's n/(n+k) formula
        // never reaches 1 for a finite n below the drop threshold, so this reuses the row's own
        // weight rather than re-deriving gCur here).
        const notBlended = r.weight === 1
        return { ...r, prior, current, notBlended, empty, yardsPrior, yardsCurrent, recPrior, recCurrent }
      })
  }, [starters, priorAllowed, currentAllowed, priorRecords, currentRecords])

  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
      <div className="flex items-baseline gap-2.5 px-[18px] py-3 border-b border-dp-border-row flex-wrap">
        <span className="text-[13px] font-semibold text-dp-text-strong">Defences you face</span>
        <span className="ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2">k {PRIOR_WEIGHT_GAMES}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dp-card-quiet">
              <th className="text-left px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted">DEF</th>
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
            {rows.map((r, i) => (
              <tr key={`${r.slot}-${r.player_id}-${i}`} data-testid={`defences-row-${r.player_id}`} className="border-t border-dp-border-row">
                <td className="px-[18px] py-2.5">
                  <div className="text-[12.5px] font-semibold text-dp-text">{r.name}</div>
                  <div className="text-[10.5px] text-dp-muted">{r.position}</div>
                </td>
                <td data-testid="defences-vs" className="px-2.5 py-2.5 font-dp-mono text-[11.5px] text-dp-text-2">
                  {!r.bye && r.opponent ? (
                    <span className="inline-flex items-center gap-1.5">
                      <TeamLogo team={r.opponent} size={14} />
                      {r.opponent}
                    </span>
                  ) : (r.bye ? 'BYE' : '—')}
                </td>
                <td data-testid="defences-prior" className="px-2.5 py-2.5 text-right">
                  {r.empty ? <span className="text-dp-muted">—</span> : (
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={`font-dp-mono text-[12px] ${r.notBlended ? 'text-dp-muted' : 'text-dp-text-2'}`}>{fpaText(r.prior)}</span>
                      {r.notBlended && r.prior != null && (
                        <span className="text-dp-muted-2 text-[9px] whitespace-nowrap">not blended</span>
                      )}
                    </div>
                  )}
                </td>
                <td data-testid="defences-current" className="px-2.5 py-2.5 text-right font-dp-mono text-[12px] text-dp-text-2">
                  {r.empty ? <span className="text-dp-muted">—</span> : fpaText(r.current)}
                </td>
                <td data-testid="defences-blended" className="px-2.5 py-2.5 text-right">
                  {r.empty || r.allows == null ? <span className="text-dp-muted">—</span> : (
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-dp-mono text-[13px] font-semibold text-dp-text">{r.allows.toFixed(1)}</span>
                      <div className="flex items-center gap-1">
                        <span className="w-[26px] h-1 bg-dp-border rounded-full overflow-hidden block">
                          <span className="block h-1 bg-dp-up" style={{ width: `${Math.round((r.weight ?? 0) * 100)}%` }} />
                        </span>
                        <span className="font-dp-mono text-[9px] text-dp-muted whitespace-nowrap">{Math.round((r.weight ?? 0) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-2.5 py-2.5 text-right font-dp-mono text-[11px] text-dp-muted">
                  {r.empty || r.allowsRank == null ? '—' : `${r.allowsRank} of 32`}
                </td>
                <TwoLineCell testId="defences-pass" current={yardsText(r.yardsCurrent?.pass)} prior={yardsText(r.yardsPrior?.pass)} />
                <TwoLineCell testId="defences-rush" current={yardsText(r.yardsCurrent?.rush)} prior={yardsText(r.yardsPrior?.rush)} />
                <TwoLineCell
                  testId="defences-record"
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
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed">
        Points allowed use this league&rsquo;s scoring: every QB, RB, WR and TE stat line in
        Sleeper&rsquo;s weekly stats, scored with your league&rsquo;s settings and credited to the defence
        it came against, divided by that defence&rsquo;s games. Each row&rsquo;s bar beneath BLENDED is how
        much of that row&rsquo;s blend is the current season — it differs by defence and position, so
        there is no single season-wide percentage to show in the header. Yards are per game from the
        opposing offence&rsquo;s weekly team line; passing is net of sack yards, so pass plus rush is
        total yards allowed. Records are regular-season results from the nflverse schedule file, which
        refreshes on its own cadence; &ldquo;thru wk N&rdquo; marks a record that trails the completed
        weeks.
        {failedWeeks.map(f => (
          <div key={f.season} data-testid="defences-failed-weeks">{failedWeeksLine(f)}</div>
        ))}
      </div>
    </div>
  )
}
