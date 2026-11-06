import { PageEyebrow } from '../dp/cells'
export function Trade() {
  return (
    <div className="py-12 text-center">
      <div>
        <PageEyebrow>Placeholder</PageEyebrow>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-[var(--color-text)] mb-3">Trade</h1>
      </div>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        This surface is gated on the <strong>marginal- and phase-aware trade evaluator</strong>.
        Once that prerequisite lands, the Trade builder will compare proposals using
        dynasty value and season-phase context.
      </p>
    </div>
  )
}
