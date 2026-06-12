'use client'

import * as XLSX from 'xlsx'

interface Props {
  filename: string
  title: string
  columns: string[]
  rows: (string | number)[][]
  sectionId: string
}

export function ReportExportBar({ filename, title, columns, rows, sectionId }: Props) {
  function downloadExcel() {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  function handlePrint() {
    // Hide every other report section so only this one prints,
    // then restore everything once printing finishes.
    const sections = document.querySelectorAll<HTMLElement>('.report-section')
    const target = document.getElementById(sectionId)
    sections.forEach(el => {
      if (el !== target) el.style.display = 'none'
    })

    const printHeader = document.getElementById(`${sectionId}-print-header`)
    if (printHeader) printHeader.style.display = 'block'

    const restore = () => {
      sections.forEach(el => { el.style.display = '' })
      if (printHeader) printHeader.style.display = 'none'
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)

    window.print()
  }

  return (
    <div className="flex gap-2 mb-3 no-print">
      <button onClick={handlePrint}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors">
        Print
      </button>
      <button onClick={downloadExcel}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors">
        Download Excel
      </button>
    </div>
  )
}