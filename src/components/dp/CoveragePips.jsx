import { coverageBand, COVERAGE_BANDS, pipCount } from '../../utils/coverageBand'

const PIP_HEIGHTS = [4, 6, 8]

// Decorative alongside a span label in every real use — aria-hidden here, callers carry the
// span in text. No aria-label: "coverage: medium" with no unit read aloud is worse than the
// visible span the caller already renders.
export function CoveragePips({ band, count, className }) {
  const resolvedBand = COVERAGE_BANDS.includes(band) ? band : (count != null ? coverageBand(count) : 'none')
  const filled = pipCount(resolvedBand)

  return (
    <div aria-hidden="true" className={`flex items-end gap-[1.5px] h-[8px] ${className ?? ''}`}>
      {PIP_HEIGHTS.map((h, i) => (
        <span
          key={i}
          style={{ width: 3, height: h }}
          className={i < filled ? 'bg-dp-text-5' : 'bg-dp-pip-off'}
        />
      ))}
    </div>
  )
}
