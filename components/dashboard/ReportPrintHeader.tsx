'use client'

interface Props {
  id: string
  facilityName: string
  logoUrl?: string | null
  title: string
  dateRangeLabel: string
}

// Hidden by default — ReportExportBar's Print handler toggles this to
// display:block right before window.print(), and back to none afterward.
export function ReportPrintHeader({ id, facilityName, logoUrl, title, dateRangeLabel }: Props) {
  return (
    <div id={id} style={{ display: 'none' }} className="mb-4 pb-4 border-b border-gray-200">
      <div className="flex items-center gap-3 mb-2">
        {logoUrl && <img src={logoUrl} alt={facilityName} className="w-12 h-12 rounded-xl object-cover" />}
        <div>
          <div className="font-black text-lg text-gray-900">{facilityName}</div>
          <div className="text-sm text-gray-500">{title}</div>
        </div>
      </div>
      <div className="text-xs text-gray-400">{dateRangeLabel}</div>
    </div>
  )
}