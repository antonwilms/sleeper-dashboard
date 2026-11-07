// Schedule — Terminal-direction card table. A won week is tinted dp-up (blue), a lost week dp-down
// (orange): the app's blue/orange pair, distinguishable without relying on red/green hue alone.
const TH = 'px-3 py-3 font-mono text-[10.5px] tracking-[0.08em] font-medium uppercase text-[var(--color-text-muted)] whitespace-nowrap'

export function ScheduleGrid({ standings, weeklyScores, weeks }) {
  if (weeks.length === 0) {
    return <p className="text-[var(--color-text-muted)] text-sm">No completed weeks yet.</p>
  }
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-[13px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} pl-4 text-left`}>Team</th>
              {weeks.map(w => (
                <th key={w} className={`${TH} px-2 text-center`}>Wk {w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map(row => {
              const byWeek = {}
              for (const s of weeklyScores[row.rosterId] ?? []) byWeek[s.week] = s
              return (
                <tr key={row.rosterId} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-1.5 pl-4 pr-4 font-medium whitespace-nowrap text-[var(--color-text)]">{row.teamName}</td>
                  {weeks.map(w => {
                    const s = byWeek[w]
                    if (!s) return <td key={w} className="px-1 py-1.5 text-center font-mono text-[var(--color-text-faintest)]">—</td>
                    return (
                      <td key={w} className="px-1 py-1">
                        <div className={`rounded-[5px] px-1.5 py-1 text-center font-mono text-[12px] ${s.won ? 'bg-dp-up-bg-strong text-dp-up-text' : 'bg-dp-down-bg text-dp-down-text'}`}>
                          {s.points.toFixed(1)}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
