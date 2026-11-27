// Brief item X — the depth label shown app-wide: fantasy position + Sleeper depth order ("WR2"), never
// Sleeper's slot code (LWR/SWR/RWR), which reads as a formation role. Null unless the player has a depth
// entry (slot code and order) and a fantasy position. View-only; the Teams depth chart
// (utils/depthChart.js) keeps slot codes — there they are the grid layout.
export function depthLabel(position, depthChartPosition, depthChartOrder) {
  return position && depthChartPosition && depthChartOrder != null ? `${position}${depthChartOrder}` : null
}
