// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ExpandableTableRow, ExpandChevron } from './ExpandableTableRow'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function Wrapper({ children }) {
  return <table><tbody>{children}</tbody></table>
}

describe('ExpandableTableRow', () => {
  it('expanded=false → detail not in DOM; summary cells present', () => {
    render(
      <Wrapper>
        <ExpandableTableRow expanded={false} onRowClick={() => {}} colSpan={3} detail={<span>detail content</span>}>
          <td>player name</td>
        </ExpandableTableRow>
      </Wrapper>
    )
    expect(screen.queryByText('detail content')).toBeNull()
    expect(screen.getByText('player name')).toBeInTheDocument()
  })

  it('expanded=true → detail row present; <td> has the correct colSpan', () => {
    const { container } = render(
      <Wrapper>
        <ExpandableTableRow expanded={true} onRowClick={() => {}} colSpan={3} detail={<span>detail content</span>}>
          <td>player name</td>
        </ExpandableTableRow>
      </Wrapper>
    )
    expect(screen.getByText('detail content')).toBeInTheDocument()
    const detailTd = container.querySelector('td[colspan="3"]')
    expect(detailTd).not.toBeNull()
  })

  it('onRowClick fires when clicking the row body', () => {
    const onRowClick = vi.fn()
    render(
      <Wrapper>
        <ExpandableTableRow expanded={false} onRowClick={onRowClick} colSpan={3} detail={null}>
          <td>player name</td>
        </ExpandableTableRow>
      </Wrapper>
    )
    fireEvent.click(screen.getByText('player name'))
    expect(onRowClick).toHaveBeenCalledOnce()
  })
})

describe('ExpandChevron', () => {
  it('onClick fires on click', () => {
    const onClick = vi.fn()
    render(<table><tbody><tr><td><ExpandChevron expanded={false} onClick={onClick} /></td></tr></tbody></table>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('aria-expanded reflects expanded prop', () => {
    const { rerender } = render(
      <table><tbody><tr><td><ExpandChevron expanded={false} onClick={() => {}} /></td></tr></tbody></table>
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    rerender(
      <table><tbody><tr><td><ExpandChevron expanded={true} onClick={() => {}} /></td></tr></tbody></table>
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('ExpandableTableRow + ExpandChevron coexistence', () => {
  it('chevron click (stop-propagation cell) does NOT call onRowClick; row body click DOES', () => {
    const onRowClick = vi.fn()
    const onChevronClick = vi.fn()
    render(
      <Wrapper>
        <ExpandableTableRow expanded={false} onRowClick={onRowClick} colSpan={3} detail={null}>
          <td onClick={e => e.stopPropagation()}>
            <ExpandChevron expanded={false} onClick={onChevronClick} />
          </td>
          <td>player name</td>
        </ExpandableTableRow>
      </Wrapper>
    )

    // Click the chevron button — stopPropagation on parent <td> must block onRowClick
    fireEvent.click(screen.getByRole('button'))
    expect(onChevronClick).toHaveBeenCalledOnce()
    expect(onRowClick).not.toHaveBeenCalled()

    // Click the row body — must call onRowClick
    fireEvent.click(screen.getByText('player name'))
    expect(onRowClick).toHaveBeenCalledOnce()
  })
})
