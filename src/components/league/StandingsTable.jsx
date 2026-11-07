// Standings — Terminal-direction card table: mono uppercase headers, mono numerals, hairline rows.
const TH = 'px-3 py-3 font-mono text-[10.5px] tracking-[0.08em] font-medium uppercase text-[var(--color-text-muted)] whitespace-nowrap'
const TD = 'px-3 py-[11px] border-t border-[var(--color-border-subtle)]'

export function StandingsTable({ standings }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left">
              <th className={`${TH} pl-4 w-10`}>#</th>
              <th className={TH}>Team</th>
              <th className={TH}>Manager</th>
              <th className={`${TH} text-center`}>W</th>
              <th className={`${TH} text-center`}>L</th>
              <th className={`${TH} text-center`}>T</th>
              <th className={`${TH} text-right`}>PF</th>
              <th className={`${TH} text-right pr-4`}>PA</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(row => (
              <tr key={row.rosterId} className="hover:bg-[var(--color-surface-2)]">
                <td className={`${TD} pl-4 font-mono text-[var(--color-text-muted)]`}>{row.rank}</td>
                <td className={`${TD} font-medium text-[var(--color-text)]`}>{row.teamName}</td>
                <td className={`${TD} text-[var(--color-text-semi-muted)]`}>{row.managerName}</td>
                <td className={`${TD} text-center font-mono`}>{row.wins}</td>
                <td className={`${TD} text-center font-mono`}>{row.losses}</td>
                <td className={`${TD} text-center font-mono`}>{row.ties}</td>
                <td className={`${TD} text-right font-mono`}>{row.pointsFor.toFixed(2)}</td>
                <td className={`${TD} text-right font-mono pr-4 text-[var(--color-text-semi-muted)]`}>{row.pointsAgainst.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
