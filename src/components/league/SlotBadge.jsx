export function SlotBadge({ slot }) {
  const styles = {
    Starter: 'text-dp-up-text border-dp-up-border bg-dp-up-bg',
    Bench: 'text-[var(--color-text-muted)] border-[var(--color-border-strong)] bg-transparent',
    IR: 'text-dp-down-text border-dp-down-border bg-dp-down-bg',
  }
  return (
    <span className={`font-mono text-[10.5px] w-[60px] text-center px-1.5 py-0.5 rounded-[5px] border font-medium shrink-0 ${styles[slot] ?? styles.Bench}`}>{slot}</span>
  )
}
