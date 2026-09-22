// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { ProjectionGapNotice } from './ProjectionGapNotice'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('ProjectionGapNotice', () => {
  it('null reason renders nothing', () => {
    const { container } = render(<ProjectionGapNotice reason={null} week={3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("'scoring' text", () => {
    const { getByText } = render(<ProjectionGapNotice reason="scoring" week={3} />)
    expect(getByText("PROJ is blank: this league's scoring settings didn't load.")).toBeInTheDocument()
  })

  it("'unpublished' text includes the week", () => {
    const { getByText } = render(<ProjectionGapNotice reason="unpublished" week={3} />)
    expect(getByText(/week 3/)).toBeInTheDocument()
    expect(getByText(/hasn't published week 3 projections yet/)).toBeInTheDocument()
  })

  it("'player' text includes the week", () => {
    const { getByText } = render(<ProjectionGapNotice reason="player" week={3} />)
    expect(getByText(/week 3/)).toBeInTheDocument()
    expect(getByText(/no week 3 projection for that player/)).toBeInTheDocument()
  })
})
