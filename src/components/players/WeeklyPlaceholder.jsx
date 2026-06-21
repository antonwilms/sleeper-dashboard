export function WeeklyPlaceholder() {
  return (
    <div className="py-12 text-center">
      <h1 className="text-xl font-semibold text-[var(--color-text-strong)] mb-3">Weekly start/sit</h1>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        This view is gated on the <strong>weekly rankings &amp; matchup engine</strong>{' '}
        powered by Sleeper projections. Once that prerequisite lands, Weekly will
        surface weekly rankings, matchup context, and recent form.
      </p>
    </div>
  )
}
