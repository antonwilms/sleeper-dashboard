export function StandingsTable({ standings }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[var(--color-text-muted)]">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-4">Team</th>
            <th className="py-2 pr-4">Manager</th>
            <th className="py-2 pr-3 text-center">W</th>
            <th className="py-2 pr-3 text-center">L</th>
            <th className="py-2 pr-4 text-center">T</th>
            <th className="py-2 pr-3 text-right">PF</th>
            <th className="py-2 text-right">PA</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(row => (
            <tr key={row.rosterId} className="border-b hover:bg-[var(--color-surface-2)]">
              <td className="py-2 pr-3 text-[var(--color-text-faint)]">{row.rank}</td>
              <td className="py-2 pr-4 font-medium">{row.teamName}</td>
              <td className="py-2 pr-4 text-[var(--color-text-muted)]">{row.managerName}</td>
              <td className="py-2 pr-3 text-center">{row.wins}</td>
              <td className="py-2 pr-3 text-center">{row.losses}</td>
              <td className="py-2 pr-4 text-center">{row.ties}</td>
              <td className="py-2 pr-3 text-right">{row.pointsFor.toFixed(2)}</td>
              <td className="py-2 text-right">{row.pointsAgainst.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
