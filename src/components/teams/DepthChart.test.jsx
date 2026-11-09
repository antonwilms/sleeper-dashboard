// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DepthChart } from './DepthChart'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const pm = {
  de1: { team: 'KC', position: 'DE', full_name: 'Starter Lde', depth_chart_position: 'LDE', depth_chart_order: 1, injury_status: 'Out' },
  de2: { team: 'KC', position: 'DE', full_name: 'Backup Lde', depth_chart_position: 'LDE', depth_chart_order: 2 },
  dl1: { team: 'KC', position: 'DT', full_name: 'Generic Dl', depth_chart_position: 'DL', depth_chart_order: 1 },
  ol1: { team: 'KC', position: 'OT', full_name: 'Sleeper Olman', depth_chart_position: 'OL', depth_chart_order: 1, gsis_id: '00-9', espn_id: 9 },
  mapped: { team: 'KC', position: 'OT', full_name: 'Mapped Tackle', depth_chart_position: 'OL', gsis_id: '00-7', espn_id: 7 },
  qb: { team: 'KC', position: 'QB', full_name: 'Quincy Back', depth_chart_position: 'QB', depth_chart_order: 1 },
  wr: { team: 'KC', position: 'WR', full_name: 'Wide Rec', depth_chart_position: 'LWR', depth_chart_order: 1 },
  te: { team: 'KC', position: 'TE', full_name: 'Tight End', depth_chart_position: 'TE', depth_chart_order: 1, injury_status: 'Questionable', injury_body_part: 'Knee' },
  fb: { team: 'KC', position: 'FB', full_name: 'Full Back', depth_chart_position: 'RB', depth_chart_order: 1 },
  kr: { team: 'KC', position: 'WR', full_name: 'Kick Returner', depth_chart_position: 'KR', depth_chart_order: 1 },
  dt: { team: 'KC', position: 'DT', full_name: 'Tackle Dt', depth_chart_position: 'RDE', depth_chart_order: 1, injury_status: 'Out' },
}
const rosterTeams = [
  { teamName: 'My Squad', starters: [{ id: 'qb' }], bench: [{ id: 'fb' }], reserve: [], taxi: [] },
  { teamName: 'Other Squad', starters: [{ id: 'wr' }], bench: [], reserve: [], taxi: [] },
]
const oline = {
  complete: true, year: 2026,
  latestByTeam: { KC: { date: '2026-11-07', ol: [
    { slot: 'LT', rank: 1, name: 'Oline Leftie', gsisId: null, espnId: null },
    { slot: 'LG', rank: 1, name: 'Mapped Tackle', gsisId: '00-7', espnId: '7' },
  ] } },
}

function setup(props = {}) {
  const onOpenPlayerDetail = vi.fn(), onNeedOline = vi.fn()
  render(
    <MemoryRouter>
      <DepthChart abbr="KC" playersMap={pm} rosterTeams={rosterTeams} myTeamName="My Squad"
        oline={oline} onNeedOline={onNeedOline} onOpenPlayerDetail={onOpenPlayerDetail} liveSeason={2026} {...props} />
    </MemoryRouter>
  )
  return { onOpenPlayerDetail, onNeedOline }
}

describe('DepthChart', () => {
  it('14: order-1 LDE is the starter line, order-2 the backup', () => {
    setup()
    const card = screen.getByTestId('dc-slot-LDE')
    expect(card.textContent).toMatch(/Starter Lde.*2\. Backup Lde/)
    expect(card.textContent.indexOf('Starter Lde')).toBeLessThan(card.textContent.indexOf('Backup Lde'))
  })
  it('15: generic DL card renders the DL-coded player', () => {
    setup()
    expect(within(screen.getByTestId('dc-generic-DL')).getByText('Generic Dl')).toBeInTheDocument()
  })
  it('16: OL cards come from oline; Sleeper OL names appear nowhere', () => {
    setup()
    expect(within(screen.getByTestId('dc-slot-LT')).getByText('Oline Leftie')).toBeInTheDocument()
    expect(screen.queryByText('Sleeper Olman')).toBeNull()
  })
  it('17: unmapped OL is text, mapped OL is a button that opens the pop-up', () => {
    const { onOpenPlayerDetail } = setup()
    expect(screen.getByTestId('dc-ol-unmapped').textContent).toBe('Oline Leftie')
    expect(screen.queryByRole('button', { name: 'Oline Leftie' })).toBeNull()
    fireEvent.click(screen.getByTestId('dc-ol-mapped'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('mapped')
  })
  it('18: fantasy layer is keyed on slot code', () => {
    const { onOpenPlayerDetail } = setup()
    expect(within(screen.getByTestId('dc-slot-QB')).getByText('yours')).toBeInTheDocument()
    expect(within(screen.getByTestId('dc-slot-LWR')).getByText('Other Squad')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dc-player-qb'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('qb')
    expect(screen.getByTestId('dc-injury-te').textContent).toBe('Q')
    expect(screen.getByTestId('dc-injury-te')).toHaveAttribute('title', 'Questionable · Knee')
    // defender: no button, no chip
    expect(screen.queryByTestId('dc-player-de1')).toBeNull()
    expect(screen.queryByTestId('dc-injury-de1')).toBeNull()
    // slot/position disagreement
    expect(screen.getByTestId('dc-player-fb')).toBeInTheDocument()
    expect(screen.getByTestId('dc-other-WR').textContent).toContain('Kick Returner')
    expect(screen.queryByTestId('dc-player-kr')).toBeNull()
    expect(screen.queryByTestId('dc-injury-dt')).toBeNull()
  })
  it('19: caption and oline states', () => {
    const { onNeedOline } = setup()
    expect(onNeedOline).toHaveBeenCalled()
    expect(screen.getByTestId('depth-caption').textContent.endsWith('as of 2026-11-07)')).toBe(true)
    cleanup()
    setup({ oline: null })
    expect(screen.getByText('Loading offensive line…')).toBeInTheDocument()
    expect(screen.getByTestId('depth-caption').textContent).toBe('Current depth chart (Sleeper)')
    cleanup()
    setup({ oline: { complete: false } })
    expect(screen.getByText('NOT YET — ACCRUING')).toBeInTheDocument()
  })
})
