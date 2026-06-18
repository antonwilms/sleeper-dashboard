import { NavLink } from 'react-router-dom'
import { PRIMARY_NAV, ROOKIES_NAV } from './navItems'

// TAB_BAR_HEIGHT must match the h-* class below — used by consumers to offset fixed content
export const TAB_BAR_HEIGHT = 56 // px (h-14)

export function BottomTabBar({ showRookies }) {
  // Cap at 5 items per IA spec
  const items = showRookies ? [...PRIMARY_NAV, ROOKIES_NAV].slice(0, 5) : PRIMARY_NAV

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t flex"
      style={{ height: TAB_BAR_HEIGHT }}
    >
      {items.map(item => (
        <NavLink
          key={item.key}
          to={item.path}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center text-[10px] gap-0.5 transition-colors ${
              isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`
          }
        >
          <span className="text-xs font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
