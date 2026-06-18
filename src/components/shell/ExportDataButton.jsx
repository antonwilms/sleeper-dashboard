import { useState } from 'react'
import { exportAllData } from '../../utils/exportData'

export function ExportDataButton() {
  const [state, setState] = useState('idle') // 'idle' | 'exporting' | 'done'
  const [summary, setSummary] = useState(null)

  async function handleClick() {
    if (state === 'exporting') return
    setState('exporting')
    try {
      const result = await exportAllData()
      setSummary(result)
      setState('done')
      setTimeout(() => setState('idle'), 4000)
    } catch (err) {
      console.error('[export] failed:', err)
      setState('idle')
    }
  }

  const label = state === 'exporting'
    ? 'Exporting…'
    : state === 'done' && summary
      ? `✓ ${summary.totalFiles} files · ${(summary.totalBytes / 1024).toFixed(0)} KB`
      : 'Export data'

  return (
    <button
      onClick={handleClick}
      disabled={state === 'exporting'}
      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50"
    >
      {label}
    </button>
  )
}
