import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfileData } from '../../context/ProfileDataContext'
import { computeConsistency } from '../../utils/outlookConsistency'
import { PlayerCell } from './cells'
import { PlayerDetailModal } from './PlayerDetailModal'

// The pop-up's shell (1b Slice v) — scrim, panel, tab strip, compare matrix, and the
// "+ Add player to compare" dropdown. Renders PlayerDetailModal (body-only since this slice) for
// whichever tab is active. App.jsx owns the tabs[]/activeTab state and the open/close/select
// callbacks; this component is otherwise state-free except the dropdown's own open/closed flag.

const SUGGESTION_COUNT = 5

// §4.2 — seven rows, all sourced through useProfileData() (never usePlayerProfile, which is a
// per-playerId hook and cannot be called once per open tab). direction drives §4.1's winner
// colouring. Every row is directional by design — see the PPG-now note below.
const METRICS = [
  { key: 'dynastyScore', label: 'Dynasty score', direction: 'higher', format: v => String(v) },
  { key: 'ktcValue', label: 'Market value', direction: 'higher', format: v => v.toLocaleString() },
  { key: 'age', label: 'Age', direction: 'lower', format: v => String(v) },
  // PPG now is directional here (higher is better) even though the mock marks it directionless
  // (.dc.html:1725) — in a comparison matrix "which is producing more right now" has an answer
  // like every other row. The README's undirected case never fires in this v1; see the task
  // file §4.2.
  { key: 'ppgNow', label: 'PPG now', direction: 'higher', format: v => v.toFixed(1) },
  { key: 'ppgNext', label: 'PPG next', direction: 'higher', format: v => v.toFixed(1) },
  { key: 'gamesProj', label: 'Games proj.', direction: 'higher', format: v => String(v) },
  { key: 'consistency', label: 'Consistency', direction: 'lower', format: v => `±${v.toFixed(1)}` },
]

function TabButton({ playerId, label, position, active, onSelect, onClose }) {
  return (
    <div
      data-testid={`tab-${playerId}`}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-t-[8px] ${
        active ? 'bg-dp-card border border-dp-border border-b-dp-card -mb-px text-dp-text' : 'text-dp-text-4'
      }`}
    >
      <button onClick={onSelect} className="flex items-center gap-1.5">
        <span className="font-dp-mono text-[10px] px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-3">{position}</span>
        <span>{label}</span>
      </button>
      <button onClick={onClose} aria-label={`Close ${label}`} className="text-dp-muted-2 hover:text-dp-text-2 leading-none">
        ×
      </button>
    </div>
  )
}

export function PlayerDetailTabs({ tabs, activeTab, onSelectTab, onCloseTab, onCloseAll, onOpenPlayerDetail, myTeamName }) {
  const { playersMap, playerRows, careerStats, seasonProjections } = useProfileData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Escape is ONE listener, branching on dropdownOpen — two window listeners (one on the
  // dropdown, one on the shell) can't give "Escape closes the dropdown only": both would fire,
  // and stopPropagation between two listeners on the same target is a no-op. This is the one
  // intentional exception to "Escape always closes the whole pop-up".
  useEffect(() => {
    const handler = e => {
      if (e.key !== 'Escape') return
      if (dropdownOpen) setDropdownOpen(false)
      else onCloseAll()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dropdownOpen, onCloseAll])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const playerRowById = useMemo(() => {
    const m = new Map()
    for (const r of (playerRows ?? [])) m.set(r.player_id, r)
    return m
  }, [playerRows])

  // computeConsistency is a pure function, so calling it once per open tab (unlike a hook) is
  // fine — usePlayerProfile is not, which is why this whole memo reads useProfileData() instead.
  const consistencyById = useMemo(() => {
    const m = new Map()
    for (const id of tabs) m.set(id, computeConsistency(careerStats, id)?.sd ?? null)
    return m
  }, [careerStats, tabs])

  // §4.0 — one memo producing per-tab identity + metrics, feeding both the tab strip and the
  // compare matrix. All three data sources come through useProfileData(); no new props.
  const tabData = useMemo(() => tabs.map(id => {
    const row = playerRowById.get(id)
    const info = playersMap?.[id] ?? {}
    return {
      playerId: id,
      name: row?.full_name ?? info.full_name ?? id,
      position: row?.position ?? info.position ?? '?',
      metrics: {
        dynastyScore: row?.dynastyScore?.score ?? null,
        ktcValue: row?.ktcValue ?? null,
        age: row?.age ?? null,
        // The row field is 0, never null, for a player with no most-recent season — guard > 0
        // or an unguarded 0 renders as real and loses every min/max comparison it's in.
        ppgNow: row?.currentSeasonPPG > 0 ? row.currentSeasonPPG : null,
        ppgNext: row?.projectedPPG ?? null,
        // Not a row field — playerRowsWithProj never merges projectedGames.
        gamesProj: seasonProjections?.[id]?.projectedGames ?? null,
        consistency: consistencyById.get(id) ?? null,
      },
    }
  }), [tabs, playerRowById, playersMap, seasonProjections, consistencyById])

  // §4.1 — winner relative to the open tabs (the README's reading), not the mock's absolute
  // thresholds. Missing values render "—" and are excluded from min/max; an all-tie row (or a
  // single distinct value) renders every cell neutral.
  const compareRows = useMemo(() => {
    if (tabData.length < 2) return []
    return METRICS.map(m => {
      const present = tabData.map(d => d.metrics[m.key]).filter(v => v != null)
      const best = present.length ? (m.direction === 'higher' ? Math.max(...present) : Math.min(...present)) : null
      const worst = present.length ? (m.direction === 'higher' ? Math.min(...present) : Math.max(...present)) : null
      return {
        label: m.label,
        cells: tabData.map(d => {
          const v = d.metrics[m.key]
          if (v == null) return { text: '—', cls: 'text-dp-muted' }
          if (best === worst) return { text: m.format(v), cls: 'text-dp-text-strong' }
          if (v === best) return { text: m.format(v), cls: 'text-dp-up-text' }
          if (v === worst) return { text: m.format(v), cls: 'text-dp-down-text' }
          return { text: m.format(v), cls: 'text-dp-text-strong' }
        }),
      }
    })
  }, [tabData])

  // §5 — top 5 by dynasty score, excluding already-open tabs. No text input; the design has none.
  const suggestions = useMemo(() => {
    return (playerRows ?? [])
      .filter(r => !tabs.includes(r.player_id) && r.dynastyScore?.score != null)
      .sort((a, b) => b.dynastyScore.score - a.dynastyScore.score)
      .slice(0, SUGGESTION_COUNT)
  }, [playerRows, tabs])

  function pickSuggestion(id) {
    onOpenPlayerDetail(id)
    setDropdownOpen(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(6,7,9,0.74)]" onClick={onCloseAll} />
      <div className="fixed inset-0 z-50 flex items-stretch justify-center p-[26px] pointer-events-none">
        <div className="pointer-events-auto flex-1 max-w-[1320px] bg-dp-chrome border border-dp-border-raised rounded-[14px] shadow-[0_30px_90px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden">
          {/* Tab strip */}
          <div className="flex items-end gap-1 px-4 pt-2.5 border-b border-dp-border bg-dp-canvas">
            {tabData.map(d => (
              <TabButton
                key={d.playerId}
                playerId={d.playerId}
                label={d.name}
                position={d.position}
                active={d.playerId === activeTab}
                onSelect={() => onSelectTab(d.playerId)}
                onClose={() => onCloseTab(d.playerId)}
              />
            ))}

            <div className="relative ml-2.5 mb-2" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className={`text-xs px-2.5 py-1 rounded-md border border-dashed transition-colors ${
                  dropdownOpen ? 'bg-dp-up-bg border-dp-up-border text-dp-up-text' : 'border-dp-border-raised text-dp-muted'
                }`}
              >
                + Add player to compare
              </button>
              {dropdownOpen && (
                <div data-testid="compare-dropdown" className="absolute top-[34px] left-0 w-[250px] bg-dp-card border border-dp-border-raised rounded-[9px] p-[5px] z-10 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                  {suggestions.length === 0 ? (
                    <div className="text-xs text-dp-muted px-2 py-2">No more players to add.</div>
                  ) : suggestions.map(r => (
                    <div
                      key={r.player_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => pickSuggestion(r.player_id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickSuggestion(r.player_id) } }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-dp-row-self"
                    >
                      <div className="flex-1 min-w-0"><PlayerCell row={r} /></div>
                      <span className="font-dp-mono text-[11px] text-dp-muted shrink-0">{r.dynastyScore.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={onCloseAll} aria-label="Close" className="ml-auto mb-2 text-dp-text-4 hover:text-dp-text-2 text-lg leading-none px-1.5">
              ×
            </button>
          </div>

          {/* Compare matrix — ≥2 tabs only */}
          {compareRows.length > 0 && (
            <div className="px-[22px] py-3 border-b border-dp-border bg-dp-chrome">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-2.5 py-1 font-dp-mono text-[10px] tracking-[0.08em] text-dp-muted font-normal">COMPARE</th>
                    {tabData.map(d => (
                      <th key={d.playerId} className="text-right px-2.5 py-1 text-xs font-semibold text-dp-text-strong">{d.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map(row => (
                    <tr key={row.label} className="border-t border-dp-border-row">
                      <td className="px-2.5 py-1 text-dp-muted">{row.label}</td>
                      {row.cells.map((c, i) => (
                        <td key={i} className={`px-2.5 py-1 text-right font-dp-mono ${c.cls}`}>{c.text}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Body — the active tab's PlayerDetailModal */}
          {activeTab != null && (
            <PlayerDetailModal
              key={activeTab}
              playerId={activeTab}
              myTeamName={myTeamName}
              onCompare={() => setDropdownOpen(true)}
            />
          )}
        </div>
      </div>
    </>
  )
}
