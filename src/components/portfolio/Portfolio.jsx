export function Portfolio() {
  return (
    // bg-dp-canvas is required, not decorative. The page ground still follows the theme
    // toggle, so a dark-only surface that sets only text colors is invisible in light mode.
    <div className="bg-dp-canvas rounded-lg py-12 text-center">
      <h1 className="text-xl font-semibold text-dp-text mb-3">Portfolio</h1>
      <p className="text-dp-muted text-sm max-w-sm mx-auto">Content lands in the next slice.</p>
    </div>
  )
}
