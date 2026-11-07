import { PageEyebrow } from '../dp/cells'
export function Board() {
  return (
    <div className="py-12 text-center">
      <div>
        <PageEyebrow>Placeholder</PageEyebrow>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-[var(--color-text)] mb-3">Board</h1>
      </div>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        This surface is gated on the <strong>marginal-value engine</strong> and{' '}
        <strong>season-phase classifier</strong>. Once those prerequisites land, the Board
        will surface the highest-leverage moves for your roster.
      </p>
    </div>
  )
}
