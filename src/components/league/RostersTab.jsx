import { SlotBadge } from './SlotBadge'
import { POSITION_ORDER } from '../../constants'
import { rosteredPlayers } from '../../utils/rosterSlots'

// Rosters — one Terminal-direction card per team; position groups under mono uppercase labels.
export function RostersTab({ rosterTeams }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {rosterTeams.map(team => {
        const grouped = Object.fromEntries(POSITION_ORDER.map(p => [p, []]))
        const other = []
        for (const p of rosteredPlayers(team)) {
          if (grouped[p.position]) grouped[p.position].push(p)
          else other.push(p)
        }
        return (
          <div key={team.rosterId} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] p-4 min-w-0">
            <div className="mb-3 pb-3 border-b border-[var(--color-border)]">
              <span className="font-semibold text-[15px] text-[var(--color-text)]">{team.teamName}</span>
              <span className="text-[var(--color-text-muted)] text-[13px] ml-2">— {team.managerName}</span>
            </div>
            {[...POSITION_ORDER.map(pos => ({ pos, players: grouped[pos] })), { pos: 'Other', players: other }]
              .filter(({ players }) => players.length > 0)
              .map(({ pos, players }) => (
                <div key={pos} className="mb-4 last:mb-0">
                  <div className="font-mono text-[10.5px] tracking-[0.12em] font-medium text-[var(--color-text-muted)] uppercase mb-1.5">{pos}</div>
                  <div className="flex flex-col gap-1">
                    {players.map(p => (
                      <div key={p.id} className="flex items-center gap-3 text-[13px] py-0.5">
                        <SlotBadge slot={p.slot} />
                        <span className="font-medium w-40 truncate text-[var(--color-text)]">{p.full_name ?? p.id}</span>
                        <span className="font-mono text-[12px] text-[var(--color-text-muted)] w-8">{p.team ?? 'FA'}</span>
                        {p.age != null && <span className="text-[12px] text-[var(--color-text-muted)]">Age {p.age}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
