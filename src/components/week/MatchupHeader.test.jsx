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

  it('T10b a side with nothing valued shows "0 of N projected" and an em dash', () => {
    const opp = side({ rosterId: 4, teamName: 'Them', ours: null, proj: { total: null, valued: 0, slots: 10 } })
    expect(opp.proj.total).toBeNull()
    const { getByTestId } = render(<MatchupHeader matchup={matchup({ opponent: opp })} startSit={SS} />)
    expect(getByTestId('matchup-opponent').textContent).toContain('0 of 10 projected')
  })

  it('T10c PROJ margin line signs and the W-L-T record', () => {
    const { container, rerender } = render(<MatchupHeader matchup={matchup({ projMargin: 4.25 })} startSit={SS} />)
    expect(container.textContent).toContain('PROJ margin +4.3')
    rerender(<MatchupHeader matchup={matchup({ projMargin: -3 })} startSit={SS} />)
    expect(container.textContent).toContain('PROJ margin \u22123.0')
    expect(container.textContent).not.toContain('PROJ margin -3.0')
    rerender(<MatchupHeader matchup={matchup({ projMargin: 0 })} startSit={SS} />)
    expect(container.textContent).toContain('PROJ margin +0.0')
    rerender(<MatchupHeader matchup={matchup({ projMargin: null })} startSit={SS} />)
    expect(container.textContent).not.toContain('PROJ margin')
    rerender(<MatchupHeader matchup={matchup({ mine: side({ record: { wins: 6, losses: 5, ties: 1 } }) })} startSit={SS} />)
    expect(container.textContent).toContain('6-5-1')
    rerender(<MatchupHeader matchup={matchup({ mine: side({ record: { wins: 7, losses: 4, ties: 0 } }) })} startSit={SS} />)
    expect(container.textContent).toContain('7-4')
    expect(container.textContent).not.toContain('7-4-0')
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

describe('MatchupHeader — OURS pending (T17b)', () => {
  it('oursPending swaps the OURS block for a neutral "not available yet"; false keeps the valued count', () => {
    const m = matchup({ mine: side({ ours: { total: null, valued: 0, slots: 10 } }) })
    expect(m.mine.ours.valued).toBe(0)
    const { getByTestId, queryByTestId, rerender } = render(<MatchupHeader matchup={m} startSit={SS} oursPending />)
    expect(getByTestId('matchup-ours-pending').textContent).toContain('not available yet')
    expect(getByTestId('matchup-mine').textContent).not.toContain('0 of 10 valued')
    rerender(<MatchupHeader matchup={m} startSit={SS} />)
    expect(queryByTestId('matchup-ours-pending')).toBeNull()
    expect(getByTestId('matchup-mine').textContent).toContain('0 of 10 valued')
  })
})
