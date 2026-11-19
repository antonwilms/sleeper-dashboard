// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MatchupHeader } from './MatchupHeader'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const side = (over = {}) => ({
  rosterId: 3, teamName: 'Me', record: { wins: 7, losses: 4, ties: 0 },
  proj: { total: 100, valued: 10, slots: 10 }, ours: { total: 95, valued: 10, slots: 10 }, points: 0, ...over,
})
const matchup = (over = {}) => ({
  week: 9, status: 'ready', reason: null, mine: side(),
  opponent: side({ rosterId: 4, teamName: 'Them', ours: null }), live: false, projMargin: null, ...over,
})
const SS = { flags: [], uncheckedSlots: [], basisAvailable: true }

describe('MatchupHeader', () => {
  it('T9 no pair renders my side and the reason, no opponent', () => {
    const { getByTestId, queryByTestId, container } = render(
      <MatchupHeader matchup={matchup({ opponent: null, reason: 'no-matchup' })} startSit={SS} />
    )
    expect(getByTestId('matchup-mine')).toBeInTheDocument()
    expect(queryByTestId('matchup-opponent')).toBeNull()
    expect(getByTestId('matchup-reason').textContent).toContain('no head-to-head opponent')
    expect(container.textContent).not.toMatch(/undefined|null/)
  })

  it('T10 totals, incompleteness and the points row', () => {
    const m = matchup({ mine: side({ proj: { total: 98.4, valued: 9, slots: 10 } }) })
    const { getByTestId, queryByTestId, container, rerender } = render(<MatchupHeader matchup={m} startSit={SS} />)
    expect(container.textContent).toContain('98.4')
    expect(container.textContent).toContain('9 of 10 projected')
    expect(getByTestId('matchup-opponent').textContent).toContain('OURS · ours—')
    expect(queryByTestId('matchup-live')).toBeNull()
    rerender(<MatchupHeader matchup={matchup({ live: true, mine: side({ points: 54.3 }), opponent: side({ rosterId: 4, ours: null, points: 61.2 }) })} startSit={SS} />)
    const live = getByTestId('matchup-live')
    expect(live.textContent).toContain('POINTS · Sleeper')
    expect(live.textContent).toContain('54.3')
    expect(live.textContent).toContain('61.2')
    expect(live.textContent).toContain('up to an hour old')
    expect(container.textContent).not.toContain('LIVE')
  })

  it('T11 flags summary', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const flags = [{ slotIndex: 4 }, { slotIndex: 6 }]
    const { getByRole, getByTestId, queryByTestId, container, rerender } = render(
      <div><div id="startsit-flag-4" /><MatchupHeader matchup={matchup()} startSit={{ ...SS, flags }} /></div>
    )
    const btn = getByRole('button', { name: '2 lineup flags' })
    fireEvent.click(btn)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0].id).toBe('startsit-flag-4')
    rerender(<MatchupHeader matchup={matchup()} startSit={{ flags: [], uncheckedSlots: ['K'], basisAvailable: true }} />)
    expect(getByTestId('startsit-summary').textContent).toBe(
      'No bench player projects higher (Sleeper PROJ) for a slot he can fill, directly or with one starter moved · K not checked'
    )
    expect(container.textContent).not.toContain('matches')
    rerender(<MatchupHeader matchup={matchup()} startSit={{ flags: [], uncheckedSlots: [], basisAvailable: false }} />)
    expect(getByTestId('startsit-summary').textContent).toContain('lineup not checked')
    rerender(<MatchupHeader matchup={matchup()} startSit={SS} loading />)
    expect(queryByTestId('startsit-summary')).toBeNull()
  })
})
