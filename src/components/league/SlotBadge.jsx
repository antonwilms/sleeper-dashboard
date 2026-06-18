export function SlotBadge({ slot }) {
  const styles = { Starter: 'bg-blue-100 text-blue-700', Bench: 'bg-gray-100 text-gray-500', IR: 'bg-red-100 text-red-600' }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[slot] ?? styles.Bench}`}>{slot}</span>
  )
}
