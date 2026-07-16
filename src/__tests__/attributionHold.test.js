// Machine check that the R2 flip's hold survives refactors. The projection
// path (historicalShares/historicalTeamTotals/seasonProjections) moved to
// per-season-team attribution; the dynasty-score channels (computeDynastyScore,
// the teamContext memo) must stay pinned to an explicit current-team pair.
// Delete this file when the dynasty migration lands (see
// .claude/tasks/r2-flip-activation.md §1).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const src = readFileSync('src/App.jsx', 'utf8')

// Extracts the argument text of the first call to `name(` up to that call's
// own closing paren. Safe here because none of the guarded call sites nest
// parens inside their arguments (only object-literal braces do).
function callArgs(source, name) {
  const match = source.match(new RegExp(`${name}\\(([\\s\\S]*?)\\)`))
  if (!match) throw new Error(`${name}( call not found in src/App.jsx`)
  return match[1]
}

describe('R2-FLIP: dynasty channels stay current-team-pinned', () => {
  it('computeTeamContext is called with an explicit current-team attribution', () => {
    const args = callArgs(src, 'computeTeamContext')
    expect(args).toMatch(/attribution:\s*'current-team'/)
  })

  it('historicalSharesCurrentTeam is built from historicalTeamTotalsCurrentTeam with an explicit current-team attribution (pairwise coherence)', () => {
    const memoMatch = src.match(/const historicalSharesCurrentTeam = useMemo\(\(\) => \{([\s\S]*?)\}, \[/)
    expect(memoMatch).not.toBeNull()
    const body = memoMatch[1]
    expect(body).toMatch(/computeHistoricalShares\(/)
    expect(body).toMatch(/historicalTeamTotalsCurrentTeam/)
    expect(body).toMatch(/attribution:\s*'current-team'/)
  })

  it('computeDynastyScore is fed historicalSharesCurrentTeam (the pinned pair), not historicalShares', () => {
    const args = callArgs(src, 'computeDynastyScore')
    expect(args).toMatch(/\bhistoricalSharesCurrentTeam\b/)
  })

  it('computeRoleRanks still rides per-season historicalShares, not the pinned pair', () => {
    const args = callArgs(src, 'computeRoleRanks')
    expect(args).toMatch(/\bhistoricalShares\b/)
    expect(args).not.toMatch(/historicalSharesCurrentTeam/)
  })

  it('computeNextSeasonProjection consumes the per-season defaults and no current-team-pinned input or attribution override', () => {
    const args = callArgs(src, 'computeNextSeasonProjection')
    expect(args).toMatch(/historicalShares,/)
    expect(args).toMatch(/historicalTeamTotals,/)
    expect(args).not.toMatch(/historicalSharesCurrentTeam/)
    expect(args).not.toMatch(/historicalTeamTotalsCurrentTeam/)
    expect(args).not.toMatch(/attribution:/)
  })
})
