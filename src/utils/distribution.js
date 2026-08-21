// dp-v2 Slice 4a — Distribution section pure helpers. 5-point buckets plus an explicit `<0`
// bucket: per-game league points go negative (83 of 25,376 games in
// src/__fixtures__/season-totals-2025.json), so without one they'd vanish and break the
// "buckets sum to the pooled count" invariant (task file §4).

export const DISTRIBUTION_BUCKETS = [
  { id: 'neg',   label: '<0',    test: v => v < 0 },
  { id: '0-5',   label: '0-5',   test: v => v >= 0 && v < 5 },
  { id: '5-10',  label: '5-10',  test: v => v >= 5 && v < 10 },
  { id: '10-15', label: '10-15', test: v => v >= 10 && v < 15 },
  { id: '15-20', label: '15-20', test: v => v >= 15 && v < 20 },
  { id: '20-25', label: '20-25', test: v => v >= 20 && v < 25 },
  { id: '25-30', label: '25-30', test: v => v >= 25 && v < 30 },
  { id: '30-35', label: '30-35', test: v => v >= 30 && v < 35 },
  { id: '35+',   label: '35+',   test: v => v >= 35 },
]

/** Counts `points` into DISTRIBUTION_BUCKETS. Counts always sum to points.length — the buckets
 *  are mutually exclusive and exhaustive over the reals. */
export function bucketPoints(points) {
  return DISTRIBUTION_BUCKETS.map(b => ({ ...b, count: points.filter(b.test).length }))
}

// Nominal value axis the buckets are drawn against, for positioning the ±1 SD markers on the
// plot: each of the 9 equal-width buckets stands for a 5-point span, so the two open-ended bins
// (`<0`, `35+`) are given a nominal 5-point width to match — there's no principled "true" width
// for an unbounded bin drawn at equal width to the rest.
const AXIS_MIN = -5
const AXIS_MAX = 40

/** Maps a raw per-game value onto the bucket axis as a 0-100 percent, clamped to the plot. */
export function bucketAxisPercent(value) {
  const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, value))
  return ((clamped - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100
}
