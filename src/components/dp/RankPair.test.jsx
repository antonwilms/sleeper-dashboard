// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { RankPair, RANK_PAIR_TITLE } from './RankPair'
import { rankPairText } from './rankPairText'
import { PPG_RANK_MIN_GAMES } from '../../utils/weeklyRanks'

afterEach(cleanup)

describe('RankPair', () => {
  it('RP-1: total rank first, /g rank second and dimmed; null handling; # prefix', () => {
    const { container, rerender } = render(<RankPair prefix="QB" rank={3} rankPpg={1} />)
    const pair = container.querySelector('[data-testid="rank-pair"]')
    expect(pair.textContent).toBe('QB3 · QB1/g')
    expect(pair.getAttribute('title')).toBe(RANK_PAIR_TITLE)
    const perGame = [...pair.querySelectorAll('span')].find(s => s.textContent.includes('/g'))
    expect(perGame.className).toContain('text-dp-muted-2')
    rerender(<RankPair prefix="QB" rank={3} rankPpg={null} />)
    expect(container.textContent).toBe('QB3 · —/g')
    rerender(<RankPair prefix="QB" rank={null} rankPpg={1} />)
    expect(container.innerHTML).toBe('')
    rerender(<RankPair prefix="#" rank={5} rankPpg={2} />)
    expect(container.textContent).toBe('#5 · #2/g')
  })

  it('RP-2: the tooltip states the shared games floor', () => {
    expect(RANK_PAIR_TITLE).toContain(`min ${PPG_RANK_MIN_GAMES} games`)
  })

  it('RP-3: rankPairText equals the rendered pair\'s text', () => {
    for (const [prefix, rank, rankPpg] of [['QB', 3, 1], ['QB', 3, null], ['#', 5, 2]]) {
      const { container, unmount } = render(<RankPair prefix={prefix} rank={rank} rankPpg={rankPpg} />)
      expect(container.querySelector('[data-testid="rank-pair"]').textContent).toBe(rankPairText(prefix, rank, rankPpg))
      unmount()
    }
  })

  it('RP-4: the tone props set the span classes; defaults leave the rank unclassed and dim /g', () => {
    const spans = (c) => [...c.querySelector('[data-testid="rank-pair"]').children]
    const toned = render(<RankPair prefix="QB" rank={3} rankPpg={1} rankClassName="text-dp-text-2" ppgClassName="text-dp-text-4" />)
    const [a, b] = spans(toned.container)
    expect(a.classList.contains('text-dp-text-2')).toBe(true)
    expect(b.classList.contains('text-dp-text-4')).toBe(true)
    expect(b.classList.contains('text-dp-muted-2')).toBe(false)
    toned.unmount()
    const [c, d] = spans(render(<RankPair prefix="QB" rank={3} rankPpg={1} />).container)
    expect(c.hasAttribute('class')).toBe(false)
    expect(d.classList.contains('text-dp-muted-2')).toBe(true)
  })
})
