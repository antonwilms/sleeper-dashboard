// dp-v2 Slice 1. Never a call to action: no "check back soon", no retry, no link. The app is a
// static client over a CDN and cannot fetch what is missing. The only permitted forward-looking
// sentence is a cadence ("one column per week"). This is the rule most likely to be violated by
// someone writing copy later — hold the line here, not just in review.
//
// Always pass an explicit, recognised `kind`. An unrecognised kind still renders — KINDS[kind] ??
// falls back to NEUTRAL styling with `label` set to that kind string, uppercased (kind="foo" →
// "FOO"). Only an omitted or null `kind` falls through to an empty label — a bordered block with
// no text, which reads as a rendering bug rather than a data state.

const KINDS = {
  'not-yet-accruing': { label: 'NOT YET — ACCRUING', border: 'border-dp-border-raised', labelColor: 'text-dp-text-5' },
  'not-measured-then': { label: 'NOT MEASURED THEN', border: 'border-dp-border-raised', labelColor: 'text-dp-text-5' },
  'undefined-here':    { label: 'UNDEFINED HERE', border: 'border-dp-border-raised', labelColor: 'text-dp-text-5' },
  'never-available':   { label: 'NEVER AVAILABLE', border: 'border-dp-down-border', labelColor: 'text-dp-down-text' },
  'no-baseline':        { label: 'NO BASELINE', border: 'border-dp-border-raised', labelColor: 'text-dp-text-5' },
}

const NEUTRAL = { border: 'border-dp-border-raised', labelColor: 'text-dp-text-5' }

export function DegradedBlock({ kind, children }) {
  const spec = KINDS[kind] ?? { ...NEUTRAL, label: String(kind ?? '').toUpperCase() }

  return (
    <div
      className={`bg-dp-card-quiet rounded-[10px] px-[17px] py-[15px] ${spec.border}`}
      style={{ borderWidth: 1, borderStyle: 'dashed' }}
    >
      <div className={`font-dp-mono text-[9.5px] tracking-[0.08em] ${spec.labelColor}`}>{spec.label}</div>
      <div className="border-t border-dp-text-3 mt-2" />
      <div
        className="bg-dp-canvas rounded-[7px] px-[10px] py-[12px] mt-[10px] text-dp-muted text-[12px]"
        style={{ textWrap: 'pretty' }}
      >
        {children}
      </div>
    </div>
  )
}
