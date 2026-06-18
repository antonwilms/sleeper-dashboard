import { SlotBadge } from './SlotBadge'
import { POSITION_ORDER } from '../../constants'

export function RostersTab({ rosterTeams }) {
  return (
    <div className="space-y-10">
      {rosterTeams.map(team => {
        const grouped = Object.fromEntries(POSITION_ORDER.map(p => [p, []]))
        const other = []
        for (const p of [...team.starters, ...team.bench, ...team.reserve]) {
          if (grouped[p.position]) grouped[p.position].push(p)
          else other.push(p)
        }
        return (
          <div key={team.rosterId}>
            <div className="mb-3 pb-1 border-b">
              <span className="font-semibold text-base">{team.teamName}</span>
              <span className="text-gray-400 text-sm ml-2">— {team.managerName}</span>
            </div>
            {[...POSITION_ORDER.map(pos => ({ pos, players: grouped[pos] })), { pos: 'Other', players: other }]
              .filter(({ players }) => players.length > 0)
              .map(({ pos, players }) => (
                <div key={pos} className="mb-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{pos}</div>
                  <div className="space-y-1">
                    {players.map(p => (
                      <div key={p.id} className="flex items-center gap-3 text-sm">
                        <SlotBadge slot={p.slot} />
                        <span className="font-medium w-40 truncate">{p.full_name ?? p.id}</span>
                        <span className="text-gray-400 w-8">{p.team ?? 'FA'}</span>
                        {p.age != null && <span className="text-gray-400">Age {p.age}</span>}
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
