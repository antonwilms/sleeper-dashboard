// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { PlayerHeadshot, TeamLogo } from './SleeperImages'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('PlayerHeadshot', () => {
  it('renders the Sleeper thumb with the hardening attributes and no crossorigin', () => {
    const { getByTestId } = render(<PlayerHeadshot playerId="4046" />)
    const img = getByTestId('headshot')
    expect(img).toHaveAttribute('src', 'https://sleepercdn.com/content/nfl/players/thumb/4046.jpg')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
    expect(img).toHaveAttribute('alt', '')
    expect(img).not.toHaveAttribute('crossorigin')
  })

  it('an image error swaps in the neutral placeholder', () => {
    const { getByTestId, queryByTestId } = render(<PlayerHeadshot playerId="4046" />)
    fireEvent.error(getByTestId('headshot'))
    expect(queryByTestId('headshot')).toBeNull()
    expect(queryByTestId('headshot-fallback')).not.toBeNull()
  })

  it('a non-numeric id renders the placeholder without an img', () => {
    const { queryByTestId } = render(<PlayerHeadshot playerId="p1" />)
    expect(queryByTestId('headshot')).toBeNull()
    expect(queryByTestId('headshot-fallback')).not.toBeNull()
  })

  it('a custom fallback replaces the default placeholder, for an unusable id and after an error', () => {
    const fb = <div data-testid="custom-fb">chip</div>
    const first = render(<PlayerHeadshot playerId="p1" fallback={fb} />)
    expect(first.queryByTestId('custom-fb')).not.toBeNull()
    expect(first.queryByTestId('headshot-fallback')).toBeNull()
    first.unmount()

    const second = render(<PlayerHeadshot playerId="4046" fallback={fb} />)
    fireEvent.error(second.getByTestId('headshot'))
    expect(second.queryByTestId('custom-fb')).not.toBeNull()
    expect(second.queryByTestId('headshot-fallback')).toBeNull()
  })

  it('retries when the id changes after a failure (failedSrc === src, not a boolean)', () => {
    const { getByTestId, queryByTestId, rerender } = render(<PlayerHeadshot playerId="4046" />)
    fireEvent.error(getByTestId('headshot'))
    expect(queryByTestId('headshot')).toBeNull()
    rerender(<PlayerHeadshot playerId="9999" />)
    expect(getByTestId('headshot')).toHaveAttribute('src', 'https://sleepercdn.com/content/nfl/players/thumb/9999.jpg')
  })

  it('badge overlays a loaded photo and is absent on the fallback path', () => {
    const badge = <span data-testid="badge">WR</span>
    const loaded = render(<PlayerHeadshot playerId="4046" badge={badge} />)
    expect(loaded.getByTestId('badge')).toBeInTheDocument()
    expect(loaded.getByTestId('headshot')).toBeInTheDocument()
    fireEvent.error(loaded.getByTestId('headshot'))
    expect(loaded.queryByTestId('badge')).toBeNull()
    loaded.unmount()

    const unusable = render(<PlayerHeadshot playerId="p1" badge={badge} />)
    expect(unusable.queryByTestId('badge')).toBeNull()
  })

  it('without a badge the img renders bare (no wrapper span)', () => {
    const { container, getByTestId } = render(<PlayerHeadshot playerId="4046" />)
    expect(container.firstChild).toBe(getByTestId('headshot'))
  })
})

describe('TeamLogo', () => {
  it('renders the lower-case png for a Sleeper code', () => {
    const { getByTestId } = render(<TeamLogo team="KC" />)
    const img = getByTestId('team-logo')
    expect(img).toHaveAttribute('src', 'https://sleepercdn.com/images/team_logos/nfl/kc.png')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(img).not.toHaveAttribute('crossorigin')
  })

  it('FA and null render nothing', () => {
    const fa = render(<TeamLogo team="FA" />)
    expect(fa.container).toBeEmptyDOMElement()
    fa.unmount()
    const none = render(<TeamLogo team={null} />)
    expect(none.container).toBeEmptyDOMElement()
  })

  it('an image error removes the logo', () => {
    const { getByTestId, container } = render(<TeamLogo team="KC" />)
    fireEvent.error(getByTestId('team-logo'))
    expect(container).toBeEmptyDOMElement()
  })
})
