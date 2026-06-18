export function ScheduleGrid({ standings, weeklyScores, weeks }) {
  if (weeks.length === 0) {
    return <p className="text-gray-500 text-sm">No completed weeks yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="py-2 pr-4 text-left text-gray-500 whitespace-nowrap">Team</th>
            {weeks.map(w => (
              <th key={w} className="py-2 px-2 text-center text-gray-500 whitespace-nowrap">Wk {w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map(row => {
            const byWeek = {}
            for (const s of weeklyScores[row.rosterId] ?? []) byWeek[s.week] = s
            return (
              <tr key={row.rosterId} className="border-t">
                <td className="py-1 pr-4 font-medium whitespace-nowrap">{row.teamName}</td>
                {weeks.map(w => {
                  const s = byWeek[w]
                  if (!s) return <td key={w} className="px-2 py-1 text-center text-gray-300">—</td>
                  return (
                    <td key={w} className={`px-2 py-1 text-center ${s.won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {s.points.toFixed(1)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
