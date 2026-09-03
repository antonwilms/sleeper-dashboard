import { CoveragePips } from './CoveragePips'

// dp-v2 Slice 3 — a table of contents, not navigation. Clicking scrolls; it never swaps content,
// never unmounts a section, never filters. No route, no hash, no window.location — the pop-up is
// deliberately routeless (task file §3). Hidden below the dpwide breakpoint (src/index.css
// @theme's --breakpoint-dpwide), where the sections remain reachable by scrolling instead.
//
// CoveragePips renders only for a row that carries a `count`. With neither `band` nor `count` it
// draws three UNFILLED pips — a visible artefact — so a site with no real coverage omits the
// element entirely rather than passing nothing.
export function SectionIndex({ sections, activeId, onSelect }) {
  return (
    <div className="hidden dpwide:flex dpwide:flex-col w-[140px] shrink-0 border-r border-dp-border bg-dp-chrome">
      {sections.map(s => {
        const active = s.id === activeId
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left text-[13px] px-2.5 py-[7px] rounded-[7px] ${
              active ? 'bg-dp-row-active text-dp-up-text font-semibold' : 'text-dp-text-4'
            }`}
          >
            <div>{s.label}</div>
            {s.count != null && (
              <div className="flex items-center gap-1.5 mt-1">
                <CoveragePips count={s.count} />
                {s.span != null && <span className="text-[11px] text-dp-muted-2">{s.span}</span>}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
