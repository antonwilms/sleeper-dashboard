import { NavLink } from 'react-router-dom'
import { NAV_GROUPS, ROOKIES_NAV } from './navItems'

export function NavRail({ showRookies }) {
  return (
    <nav className="hidden md:flex flex-col w-46 shrink-0 border-r pt-4 gap-4">
      {NAV_GROUPS.map(group => {
        const items = showRookies && group.key === 'manage'
          ? [...group.items, ROOKIES_NAV]
          : group.items

        return (
          <div key={group.key} className="flex flex-col gap-1">
            <span className="px-4 text-[10px] font-mono tracking-wider text-[var(--color-text-faint)]">
              {group.label}
            </span>
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
          </div>
        )
      })}
    </nav>
  )
}
