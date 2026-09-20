// §4.4 header cell classes, shared by Portfolio's Starting ten / Bench tables and TeamOffences.
// A pure move out of Portfolio.jsx (same precedent as slotLabel.js): exporting them from
// Portfolio.jsx and importing back would be a cycle, since Portfolio.jsx imports its siblings.
export const TH_CLASS = 'px-[10px] py-2 first:pl-[18px] last:pr-[18px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted-2 whitespace-nowrap'
export const DIVIDER = 'border-l border-dp-border-row'
