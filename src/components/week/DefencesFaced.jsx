// weekly-decision-2-panels.md §2 — the two unmixed halves of the ALLOWS blend, one row per filled
// starter, in set-lineup order (empty slots and bench get no row — this panel is about the defences
// your starters face). Presentational except for its own memo below, which calls the already-
// exported `computeFpaPerGame` directly against the hook's `priorRows`/`currentRows` — never
// re-derives them, and never reads the halves out of `buildFpaTable`'s return (it does not expose
// them; widening that shape for one panel would touch two shipped surfaces).
//
// `opponent` (Sleeper domain, e.g. `LAR`) keys `priorRows`/`currentRows` — the same domain those row
// maps use their own DEF-row keys in. `opponentEra` (`LA`) is what `fpaTable`/`fpaRanks` key on, and
// this panel never re-derives it: `allows`/`allowsRank`/`weight` come straight off W2a's row, exactly
// as LineupTable's ALLOWS column renders them.

import { useMemo } from 'react'
import { computeFpaPerGame, PRIOR_WEIGHT_GAMES } from '../../utils/opponentStrength'

function fpaText(v) {
  return v == null ? '—' : v.toFixed(1)
}

export function DefencesFaced({ starters = [], priorRows = null, currentRows = null, dataSeason = null, currentSeason = null }) {
  const rows = useMemo(() => {
    return starters
      .filter(r => r.player_id != null)
      .map(r => {
        const empty = r.bye || r.opponent == null
        const pos = r.position ? r.position.toLowerCase() : null
        const prior = !empty && pos ? computeFpaPerGame(priorRows, r.opponent, pos) : null
        const current = !empty && pos ? computeFpaPerGame(currentRows, r.opponent, pos) : null
        // The blend drops the prior once gCur reaches FPA_PRIOR_DROP_GAMES — the ONLY case where
        // weeklyLineup.js's buildRow sets `weight` to exactly 1 (blendWeight's n/(n+k) formula
        // never reaches 1 for a finite n below the drop threshold, so this reuses the row's own
        // weight rather than re-deriving gCur here).
        const notBlended = r.weight === 1
        return { ...r, prior, current, notBlended, empty }
      })
  }, [starters, priorRows, currentRows])

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
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">{dataSeason ?? '—'} PTS/G</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">{currentSeason ?? '—'} SO FAR</th>
              <th className="text-right px-2.5 py-2 font-dp-mono text-[10px] text-dp-muted">BLENDED</th>
              <th className="text-right px-[18px] py-2 font-dp-mono text-[10px] text-dp-muted">RANK</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.slot}-${r.player_id}-${i}`} data-testid={`defences-row-${r.player_id}`} className="border-t border-dp-border-row">
                <td className="px-[18px] py-2.5">
                  <div className="text-[12.5px] font-semibold text-dp-text">{r.name}</div>
                  <div className="text-[10.5px] text-dp-muted">{r.position}</div>
                </td>
                <td className="px-2.5 py-2.5 font-dp-mono text-[11.5px] text-dp-text-2">
                  {r.bye ? 'BYE' : (r.opponent ?? '—')}
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
                <td className="px-[18px] py-2.5 text-right font-dp-mono text-[11px] text-dp-muted">
                  {r.empty || r.allowsRank == null ? '—' : `${r.allowsRank} of 32`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed">
        Half-PPR basis (Sleeper&rsquo;s own <span className="font-dp-mono text-dp-text-4">fan_pts_allow_*</span>,
        not this league&rsquo;s scoring). Each row&rsquo;s own bar beneath BLENDED is how much of that row&rsquo;s
        blend is the current season — it differs by defence and position, so there is no single
        season-wide percentage to show in the header.
      </div>
    </div>
  )
}
