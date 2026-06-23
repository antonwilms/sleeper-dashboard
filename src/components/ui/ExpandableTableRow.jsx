/** Rotating ▸/▾ toggle button. Caller wraps it in a stop-propagation cell. */
export function ExpandChevron({ expanded, onClick, label = 'Toggle details' }) {
  return (
    <button
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-faintest)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
    >
      <span className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}>▸</span>
    </button>
  )
}

/**
 * A table row plus an optional full-width detail row beneath it (React fragment of
 * two <tr>s — valid inside <tbody>). Summary cells (incl. the chevron cell) are
 * `children`; expanded content is `detail`. Row-body click → onRowClick; the chevron
 * cell itself must stopPropagation (caller's responsibility, mirrors the Value compare cell).
 */
export function ExpandableTableRow({ expanded, onRowClick, colSpan, detailClassName, children, detail }) {
  return (
    <>
      <tr onClick={onRowClick}
          className="border-b hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors">
        {children}
      </tr>
      {expanded && (
        <tr className="border-b bg-[var(--color-surface-2)]">
          <td colSpan={colSpan} className={detailClassName ?? 'px-4 py-3'}>{detail}</td>
        </tr>
      )}
    </>
  )
}
