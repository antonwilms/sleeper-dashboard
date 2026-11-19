import { useState } from 'react'

// The horizontal scroll container for a table with frozen leading columns (dp/frozen.js). Marks
// itself `data-scrolled="true"` once scrolled right so the frozen edge shade shows only then.
export function FrozenScroll({ children }) {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div
      data-testid="frozen-scroll"
      data-scrolled={scrolled ? 'true' : 'false'}
      onScroll={e => setScrolled(e.currentTarget.scrollLeft > 0)}
      className="overflow-x-auto group/scroll"
    >
      {children}
    </div>
  )
}
