import { NavLink } from 'react-router-dom'
import { PRIMARY_NAV, ROOKIES_NAV } from './navItems'

export function NavRail({ showRookies }) {
  const items = showRookies ? [...PRIMARY_NAV, ROOKIES_NAV] : PRIMARY_NAV

  return (
    <nav className="hidden md:flex flex-col w-40 shrink-0 border-r pt-4 gap-1">
      {items.map(item => (
        <NavLink
          key={item.key}
          to={item.path}
          className={({ isActive }) =>
            `px-4 py-2 text-sm rounded-r transition-colors ${
              isActive
                ? 'bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent)] font-medium border-l-2 border-[var(--color-accent)]'
                : 'text-[var(--color-text-semi-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
      <div className="border-t my-2 mx-4" />
      <NavLink
        to="/league"
        className={({ isActive }) =>
          `px-4 py-2 text-sm rounded-r transition-colors ${
            isActive
              ? 'bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent)] font-medium border-l-2 border-[var(--color-accent)]'
              : 'text-[var(--color-text-semi-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
          }`
        }
      >
        League
      </NavLink>
    </nav>
  )
}
