/**
 * Null-safe table sort comparator.
 *
 * null/undefined/NaN always sorts to the bottom (after all real values)
 * regardless of the ascending/descending direction multiplier. The direction
 * flip is applied ONLY to the non-null vs non-null comparison branch.
 *
 * Design note: the null/non-null branch returns a constant (1 or -1), never
 * `dir` or `-dir`. Multiplying by `dir` would make nulls float when descending.
 *
 * @param {*}      va   value from row a
 * @param {*}      vb   value from row b
 * @param {number} dir  1 for ascending, -1 for descending
 * @returns {number}    negative = a before b, positive = a after b, 0 = equal
 */
export function compareNullsLast(va, vb, dir) {
  const aNullish = va == null || (typeof va === 'number' && isNaN(va))
  const bNullish = vb == null || (typeof vb === 'number' && isNaN(vb))
  if (aNullish && bNullish) return 0
  if (aNullish) return 1    // a sinks, regardless of dir
  if (bNullish) return -1   // b sinks, regardless of dir
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
}
