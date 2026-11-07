import { NavLink } from 'react-router-dom'
import { NAV_GROUPS, ROOKIES_NAV } from './navItems'

// Stroke icons keyed by nav item key — decorative only (aria-hidden); the label is the accessible
// name. Shared with BottomTabBar. An unknown key renders no icon rather than a wrong one.
const ICON_PATHS = {
  week:      ['M3 10h18M8 3v4M16 3v4', 'rect:3,5,18,16'],
  portfolio: ['M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6', 'circle:12,8,4'],
  market:    ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  teams:     ['M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z'],
  rookies:   ['M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z'],
  standings: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  schedule:  ['M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2', 'rect:3,5,18,16'],
  rosters:   ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
}

export function NavIcon({ name, className = '' }) {
  const parts = ICON_PATHS[name]
  if (!parts) return null
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {parts.map(p => {
        if (p.startsWith('rect:')) {
          const [x, y, w, h] = p.slice(5).split(',')
          return <rect key={p} x={x} y={y} width={w} height={h} rx="2" />
        }
        if (p.startsWith('circle:')) {
          const [cx, cy, r] = p.slice(7).split(',')
          return <circle key={p} cx={cx} cy={cy} r={r} />
        }
        return <path key={p} d={p} />
      })}
    </svg>
  )
}

export function BrandMark({ size = 26 }) {
  return (
    <span
      className="rounded-[7px] bg-[var(--color-accent)] flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none"
        stroke="var(--color-on-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18l5-6 4 3 7-9" />
      </svg>
    </span>
  )
}

export function NavRail({ showRookies }) {
  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex flex-col w-[232px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-chrome)] px-3.5 py-5 gap-[22px]"
    >
      <div className="flex items-center gap-2.5 px-2">
        <BrandMark />
        <span className="font-semibold text-[15px] tracking-[-0.01em] text-[var(--color-text)]">Sleeper Dashboard</span>
      </div>

      {NAV_GROUPS.map(group => {
        const items = showRookies && group.key === 'manage'
          ? [...group.items, ROOKIES_NAV]
          : group.items

        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1.5 text-[10.5px] font-mono tracking-[0.12em] text-[var(--color-text-muted)]">
              {group.label}
            </span>
            {items.map(item => (
              <NavLink
                key={item.key}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-[9px] text-[13.5px] rounded-[7px] transition-colors ${
                    isActive
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-text)] font-medium shadow-[inset_0_0_0_1px_var(--color-surface-4)]'
                      : 'text-[var(--color-text-semi-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <NavIcon name={item.key} className={isActive ? 'text-[var(--color-accent)]' : ''} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
