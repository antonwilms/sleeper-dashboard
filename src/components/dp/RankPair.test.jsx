// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { RankPair, RANK_PAIR_TITLE } from './RankPair'
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
})
