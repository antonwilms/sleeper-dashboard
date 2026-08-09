repo: antonwilms/sleeper-dashboard
branch: main

## Last sync
date: 2026-08-08T15:46:43Z

### Updated in this project
- Recreated the Players surface (Value, Outlook, NFL stats, Profile) from source.
- Added a redesigned portfolio-first direction: Portfolio, Market, Player detail.
- Palette moved off red/green to a colour-blind-safe blue/amber pair.

## Screen map
| Project screen | Repo files |
| --- | --- |
| 1a — Players → Value | src/components/PlayersTab.jsx, src/components/players/PlayersDataTable.jsx, src/components/players/PlayersSurface.jsx, src/index.css |
| 1a — Players → Outlook | src/components/players/OutlookTab.jsx, src/components/ui/ExpandableTableRow.jsx |
| 1a — Players → NFL stats | src/components/players/NflStatsTab.jsx |
| 1a — Player profile panel | src/components/PlayersTab.jsx (PlayerProfile), src/components/SpiderChart.jsx, src/components/AdvancedStatsPanel.jsx |
| 1a — App chrome | src/components/shell/AppShell.jsx, TopBar.jsx, NavRail.jsx, navItems.js, src/index.css, src/theme.js |
| 1b — Redesign (Portfolio, Market, Player detail) | derived from the above |
