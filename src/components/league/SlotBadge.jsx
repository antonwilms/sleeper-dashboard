export function SlotBadge({ slot }) {
  const styles = { Starter: 'bg-[var(--c-blue-100)] text-[var(--c-blue-700)]', Bench: 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)]', IR: 'bg-[var(--c-red-100)] text-[var(--c-red-600)]' }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[slot] ?? styles.Bench}`}>{slot}</span>
  )
}
