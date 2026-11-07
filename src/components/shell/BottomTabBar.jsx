import { NavLink } from 'react-router-dom'
import { PRIMARY_NAV, ROOKIES_NAV } from './navItems'
import { NavIcon } from './NavRail'

// TAB_BAR_HEIGHT must match the inline height below — used by consumers to offset fixed content
export const TAB_BAR_HEIGHT = 60 // px

export function BottomTabBar({ showRookies }) {
  // Cap at 5 items per IA spec
  const items = showRookies ? [...PRIMARY_NAV, ROOKIES_NAV].slice(0, 5) : PRIMARY_NAV

  return (
    <nav
      aria-label="Primary (mobile)"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-chrome)] border-t border-[var(--color-border)] flex"
      style={{ height: TAB_BAR_HEIGHT }}
    >
      {items.map(item => (
        <NavLink
          key={item.key}
          to={item.path}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`
          }
        >
          <NavIcon name={item.key} />
          <span className="text-[11px] font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
