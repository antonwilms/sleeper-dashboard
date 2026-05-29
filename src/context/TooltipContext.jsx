import { createContext, useContext } from 'react'

// Provides a boolean for whether tooltips are enabled globally.
// Default true — tooltips show by default on first visit.
export const TooltipContext = createContext(true)
export const useTooltipsEnabled = () => useContext(TooltipContext)
