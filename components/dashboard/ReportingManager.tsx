'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ReportExportBar } from '@/components/dashboard/ReportExportBar'
import { ReportPrintHeader } from '@/components/dashboard/ReportPrintHeader'

interface Props {
  facilityId: string
  facility: { name: string; logo_url?: string | null }
}

interface ReconRow {
  department: string
  name: string
  usageCount: number
  billedCount: number
  gap: number
  unitPrice: number
  gapValue: number
}

interface SpillageRow {
  department: string
  count: number
  totalQuantity: number
}

interface CostAuditRow {
  department: string
  name: string
  instanceCount: number
  avgCost: number
  price: number
  margin: number | null
  marginPct: number | null
}

export function ReportingManager({ facilityId, facility }: Props) {
  const [reportType, setReportType] = useState<'overview' | 'billing' | 'inventory' | 'patients'>('overview')
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [customTo, setCustomTo] = useState(new Date().toISOString().split('T')[0])

  const [loading, setLoading] = useState(true)
  const [reconRows, setReconRows] = useState<ReconRow[]>([])
  const [costAuditRows, setCostAuditRows] = useState<CostAuditRow[]>([])
  const [spillageRows, setSpillageRows] = useState<SpillageRow[]>([])
  const [revenue, setRevenue] = useState({ billed: 0, collected: 0, outstanding: 0, visitCount: 0 })

  // Billing Summary report
  const [billingByDept, setBillingByDept] = useState<{ department: string; billed: number; count: number }[]>([])
  const [paymentsByMethod, setPaymentsByMethod] = useState<{ method: string; total: number; count: number }[]>([])

  // Inventory Snapshot report (point-in-time, not date-filtered)
  const [inventorySnapshot, setInventorySnapshot] = useState<{ name: string; department: string; quantity: number; unit: string; unitCost: number; value: number }[]>([])

  // Patients report
  const [patientsReport, setPatientsReport] = useState<{ name: string; patientNumber: string; visits: number; totalBilled: number; lastVisit: string }[]>([])

  function getRange(): [Date, Date] {
    const now = new Date()
    let from: Date, to: Date
    if (dateFilter === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
    } else if (dateFilter === 'week') {
      const day = now.getDay()
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (dateFilter === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    } else {
      from = new Date(customFrom)
      to = new Date(customTo)
      to.setDate(to.getDate() + 1)
    }
    return [from, to]
  }

  useEffect(() => { loadData() }, [dateFilter, customFrom, customTo])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [from, to] = getRange()

    const [{ data: usageLogs }, { data: visitItems }, { data: services }, { data: visits }] = await Promise.all([
      supabase.from('health_usage_logs')
        .select('department, usage_type, procedure_name, procedure_instance_id, quantity_used, supply_id, health_supplies(unit_cost, conversion_factor)')
        .eq('facility_id', facilityId)
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString()),
      supabase.from('health_visit_items')
        .select('service_name, quantity, department, visit:visit_id(department, visit_date, facility_id)')
        .eq('visit.facility_id', facilityId),
      supabase.from('health_services')
        .select('name, department, price')
        .eq('facility_id', facilityId)
        .eq('is_active', true),
      supabase.from('health_visits')
        .select('total_amount, amount_paid, outstanding, visit_date, patient_id, patient_name')
        .eq('facility_id', facilityId)
        .gte('visit_date', from.toISOString().split('T')[0])
        .lt('visit_date', to.toISOString().split('T')[0]),
    ])

    const [{ data: payments }, { data: supplies }, { data: patients }] = await Promise.all([
      supabase.from('health_payments')
        .select('amount, payment_method, paid_at')
        .eq('facility_id', facilityId)
        .gte('paid_at', from.toISOString())
        .lt('paid_at', to.toISOString()),
      supabase.from('health_supplies')
        .select('name, department, current_stock, unit_of_issue, unit_cost, conversion_factor')
        .eq('facility_id', facilityId),
      supabase.from('health_patients')
        .select('id, patient_number')
        .eq('facility_id', facilityId),
    ])

    // --- Reconciliation: procedure usage vs billed services ---
    // Count distinct procedure instances, not consumable rows — one Suturing
    // with 5 consumables logged is still ONE procedure performed.
    const usageInstances = new Map<string, Set<string>>()
    for (const log of usageLogs ?? []) {
      if (log.usage_type !== 'procedure' || !log.procedure_name) continue
      const key = `${log.department}::${log.procedure_name.toLowerCase()}`
      const set = usageInstances.get(key) ?? new Set<string>()
      if (log.procedure_instance_id) set.add(log.procedure_instance_id)
      usageInstances.set(key, set)
    }
    const usageMap = new Map<string, number>()
    for (const [key, set] of usageInstances) usageMap.set(key, set.size)

    const billedMap = new Map<string, number>()
    for (const item of visitItems ?? []) {
      const visit = (item as any).visit
      if (!visit) continue
      // visit_date filter (visit join doesn't support gte/lt directly, so filter here)
      const vDate = new Date(visit.visit_date)
      if (vDate < from || vDate >= to) continue
      // Each charge line carries its own department (a visit can span multiple
      // departments); fall back to the visit's department for older records.
      const itemDepartment = item.department ?? visit.department
      const key = `${itemDepartment}::${(item.service_name ?? '').toLowerCase()}`
      billedMap.set(key, (billedMap.get(key) ?? 0) + (item.quantity ?? 1))
    }

    const priceMap = new Map<string, number>()
    for (const s of services ?? []) {
      priceMap.set(`${s.department}::${s.name.toLowerCase()}`, s.price)
    }

    const allKeys = new Set([...usageMap.keys(), ...billedMap.keys()])
    const rows: ReconRow[] = []
    for (const key of allKeys) {
      const [department, name] = key.split('::')
      const usageCount = usageMap.get(key) ?? 0
      const billedCount = billedMap.get(key) ?? 0
      const gap = usageCount - billedCount
      const unitPrice = priceMap.get(key) ?? 0
      if (usageCount === 0) continue // only show procedures that were actually performed
      rows.push({
        department, name, usageCount, billedCount, gap,
        unitPrice, gapValue: Math.max(0, gap) * unitPrice,
      })
    }
    rows.sort((a, b) => b.gapValue - a.gapValue || b.gap - a.gap)
    setReconRows(rows)

    // --- Cost audit: consumable cost per procedure instance vs. its price ---
    const instanceCost = new Map<string, { department: string; name: string; cost: number }>()
    for (const log of usageLogs ?? []) {
      if (log.usage_type !== 'procedure' || !log.procedure_name || !log.procedure_instance_id) continue
      const entry = instanceCost.get(log.procedure_instance_id) ?? { department: log.department, name: log.procedure_name, cost: 0 }
      if (log.supply_id) {
        const supply = (log as any).health_supplies
        const receivedCost = supply?.unit_cost ?? 0
        const conversionFactor = supply?.conversion_factor || 1
        // unit_cost is per RECEIVED unit (e.g. a pack of 50); derive cost per ISSUE unit (a piece)
        const costPerIssueUnit = receivedCost / conversionFactor
        entry.cost += (log.quantity_used ?? 0) * costPerIssueUnit
      }
      instanceCost.set(log.procedure_instance_id, entry)
    }

    const costGroups = new Map<string, { department: string; name: string; costs: number[] }>()
    for (const { department, name, cost } of instanceCost.values()) {
      const key = `${department}::${name.toLowerCase()}`
      const g = costGroups.get(key) ?? { department, name, costs: [] }
      g.costs.push(cost)
      costGroups.set(key, g)
    }

    const costRows: CostAuditRow[] = []
    for (const [key, g] of costGroups) {
      const avgCost = g.costs.reduce((s, c) => s + c, 0) / g.costs.length
      const price = priceMap.get(key) ?? 0
      const hasPrice = price > 0
      costRows.push({
        department: g.department,
        name: g.name,
        instanceCount: g.costs.length,
        avgCost,
        price,
        margin: hasPrice ? price - avgCost : null,
        marginPct: hasPrice ? ((price - avgCost) / price) * 100 : null,
      })
    }
    costRows.sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity))
    setCostAuditRows(costRows)

    // --- Spillage / damage rollup ---
    const spillMap = new Map<string, { count: number; totalQuantity: number }>()
    for (const log of usageLogs ?? []) {
      if (log.usage_type !== 'spillage_damage') continue
      const existing = spillMap.get(log.department) ?? { count: 0, totalQuantity: 0 }
      existing.count += 1
      existing.totalQuantity += log.quantity_used ?? 0
      spillMap.set(log.department, existing)
    }
    setSpillageRows(Array.from(spillMap.entries()).map(([department, v]) => ({ department, ...v })))

    // --- Revenue summary ---
    let billed = 0, collected = 0, outstanding = 0
    for (const v of visits ?? []) {
      billed += v.total_amount ?? 0
      collected += v.amount_paid ?? 0
      outstanding += v.outstanding ?? 0
    }
    setRevenue({ billed, collected, outstanding, visitCount: (visits ?? []).length })

    // --- Billing Summary: billed amount by department, payments by method ---
    const deptMap = new Map<string, { billed: number; count: number }>()
    for (const item of visitItems ?? []) {
      const visit = (item as any).visit
      if (!visit) continue
      const vDate = new Date(visit.visit_date)
      if (vDate < from || vDate >= to) continue
      const itemDepartment = item.department ?? visit.department
      const price = priceMap.get(`${itemDepartment}::${(item.service_name ?? '').toLowerCase()}`) ?? 0
      const entry = deptMap.get(itemDepartment) ?? { billed: 0, count: 0 }
      entry.billed += price * (item.quantity ?? 1)
      entry.count += item.quantity ?? 1
      deptMap.set(itemDepartment, entry)
    }
    setBillingByDept(Array.from(deptMap.entries()).map(([department, v]) => ({ department, ...v })).sort((a, b) => b.billed - a.billed))

    const methodMap = new Map<string, { total: number; count: number }>()
    for (const p of payments ?? []) {
      const method = p.payment_method || 'Unspecified'
      const entry = methodMap.get(method) ?? { total: 0, count: 0 }
      entry.total += p.amount ?? 0
      entry.count += 1
      methodMap.set(method, entry)
    }
    setPaymentsByMethod(Array.from(methodMap.entries()).map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total))

    // --- Inventory Snapshot: current stock levels and value (point-in-time, not date-filtered) ---
    // current_stock is tracked in ISSUE units (e.g. pieces), but unit_cost is the
    // cost of one RECEIVED unit (e.g. a pack of 50). Derive cost-per-issue-unit
    // before valuing stock — same fix as the Cost Audit report.
    setInventorySnapshot((supplies ?? []).map(s => {
      const conversionFactor = s.conversion_factor || 1
      const costPerIssueUnit = (s.unit_cost ?? 0) / conversionFactor
      return {
        name: s.name,
        department: s.department,
        quantity: s.current_stock ?? 0,
        unit: s.unit_of_issue ?? '',
        unitCost: costPerIssueUnit,
        value: (s.current_stock ?? 0) * costPerIssueUnit,
      }
    }).sort((a, b) => b.value - a.value))

    // --- Patients: visits and billing per patient in the period ---
    const patientMap = new Map<string, { name: string; visits: number; totalBilled: number; lastVisit: string }>()
    for (const v of visits ?? []) {
      if (!v.patient_id) continue
      const entry = patientMap.get(v.patient_id) ?? { name: v.patient_name ?? 'Unknown', visits: 0, totalBilled: 0, lastVisit: v.visit_date }
      entry.visits += 1
      entry.totalBilled += v.total_amount ?? 0
      if (v.visit_date > entry.lastVisit) entry.lastVisit = v.visit_date
      patientMap.set(v.patient_id, entry)
    }
    const patientNumberMap = new Map((patients ?? []).map(p => [p.id, p.patient_number ?? '']))
    setPatientsReport(Array.from(patientMap.entries()).map(([id, v]) => ({
      name: v.name,
      patientNumber: patientNumberMap.get(id) ?? '',
      visits: v.visits,
      totalBilled: v.totalBilled,
      lastVisit: v.lastVisit,
    })).sort((a, b) => b.visits - a.visits))

    setLoading(false)
  }

  const totalGapValue = reconRows.reduce((s, r) => s + r.gapValue, 0)
  const totalGapCount = reconRows.reduce((s, r) => s + Math.max(0, r.gap), 0)

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading reports...</div>

  const REPORT_TYPES: { key: typeof reportType; label: string }[] = [
    { key: 'overview', label: 'Operations Overview' },
    { key: 'billing', label: 'Billing Summary' },
    { key: 'inventory', label: 'Inventory Snapshot' },
    { key: 'patients', label: 'Patients' },
  ]

  const [rangeFrom, rangeTo] = getRange()
  const fmtDate = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  const dateRangeLabel = reportType === 'inventory'
    ? `As of ${fmtDate(new Date())}`
    : `${fmtDate(rangeFrom)} – ${fmtDate(new Date(rangeTo.getTime() - 1))}`

  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap no-print">
        {REPORT_TYPES.map(r => (
          <button key={r.key} onClick={() => setReportType(r.key)}
            className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (reportType === r.key ? 'text-white' : 'bg-gray-100 text-gray-600')}
            style={reportType === r.key ? { background: 'var(--brand-color)' } : undefined}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-center no-print">
        {(['today', 'week', 'month', 'custom'] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)}
            className={'px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ' + (dateFilter === f ? 'text-white' : 'bg-gray-100 text-gray-600')}
            style={dateFilter === f ? { background: 'var(--brand-color)' } : undefined}>
            {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'today' ? 'Today' : 'Custom'}
          </button>
        ))}
        {dateFilter === 'custom' && (
          <>
            <input type="date" className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 max-w-40" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 max-w-40" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </>
        )}
      </div>

      {/* ===== Billing Summary ===== */}
      {reportType === 'billing' && (
        <div>
          <div className="font-semibold text-gray-900 mb-1">Billing Summary</div>
          <div className="text-xs text-gray-400 mb-4">Charges billed by department, and payments collected by method, for the selected period.</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Total Billed</div>
              <div className="text-2xl font-black text-gray-900">₦{revenue.billed.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Collected</div>
              <div className="text-2xl font-black text-gray-900">₦{revenue.collected.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Outstanding</div>
              <div className="text-2xl font-black" style={{ color: revenue.outstanding > 0 ? '#f59e0b' : '#111827' }}>₦{revenue.outstanding.toLocaleString()}</div>
            </div>
          </div>

          <div className="report-section mb-8" id="billing-by-dept">
            <ReportPrintHeader id="billing-by-dept-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
              title="Billing Summary - By Department" dateRangeLabel={dateRangeLabel} />
            <div className="font-semibold text-gray-900 mb-3">By Department</div>
            <ReportExportBar filename="billing_by_department" title="Billing Summary - By Department" sectionId="billing-by-dept"
              columns={['Department', 'Items Billed', 'Amount']}
              rows={billingByDept.map(r => [r.department, r.count, r.billed])} />
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {billingByDept.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No charges billed in this period.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {billingByDept.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{r.department}</span>
                      <span className="text-gray-500">{r.count} item{r.count !== 1 ? 's' : ''}</span>
                      <span className="font-semibold text-gray-900">₦{r.billed.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="report-section" id="payments-by-method">
            <ReportPrintHeader id="payments-by-method-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
              title="Billing Summary - Payments by Method" dateRangeLabel={dateRangeLabel} />
            <div className="font-semibold text-gray-900 mb-3">Payments by Method</div>
            <ReportExportBar filename="payments_by_method" title="Billing Summary - Payments by Method" sectionId="payments-by-method"
              columns={['Method', 'Payments', 'Total']}
              rows={paymentsByMethod.map(r => [r.method, r.count, r.total])} />
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {paymentsByMethod.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No payments recorded in this period.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {paymentsByMethod.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 capitalize">{r.method}</span>
                      <span className="text-gray-500">{r.count} payment{r.count !== 1 ? 's' : ''}</span>
                      <span className="font-semibold text-gray-900">₦{r.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Inventory Snapshot ===== */}
      {reportType === 'inventory' && (
        <div className="report-section" id="inventory-snapshot">
          <ReportPrintHeader id="inventory-snapshot-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
            title="Inventory Snapshot" dateRangeLabel={dateRangeLabel} />
          <div className="font-semibold text-gray-900 mb-1">Inventory Snapshot</div>
          <div className="text-xs text-gray-400 mb-4">Current stock levels and value, as of now, not affected by the date filter above.</div>
          <ReportExportBar filename="inventory_snapshot" title="Inventory Snapshot" sectionId="inventory-snapshot"
            columns={['Item', 'Department', 'Quantity', 'Unit', 'Unit Cost', 'Value']}
            rows={inventorySnapshot.map(r => [r.name, r.department, r.quantity, r.unit, r.unitCost, r.value])} />
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {inventorySnapshot.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No inventory items found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Item', 'Department', 'Quantity', 'Unit', 'Unit Cost', 'Value'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventorySnapshot.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-3 text-gray-500">{r.department}</td>
                        <td className="px-4 py-3 text-gray-700">{r.quantity}</td>
                        <td className="px-4 py-3 text-gray-500">{r.unit}</td>
                        <td className="px-4 py-3 text-gray-500">₦{r.unitCost.toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₦{r.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total Value</td>
                      <td className="px-4 py-3 text-sm font-black text-gray-900">₦{inventorySnapshot.reduce((s, r) => s + r.value, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Patients ===== */}
      {reportType === 'patients' && (
        <div className="report-section" id="patients-report">
          <ReportPrintHeader id="patients-report-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
            title="Patients Report" dateRangeLabel={dateRangeLabel} />
          <div className="font-semibold text-gray-900 mb-1">Patients</div>
          <div className="text-xs text-gray-400 mb-4">Patients with visits in the selected period, with visit count and total billed.</div>
          <ReportExportBar filename="patients_report" title="Patients Report" sectionId="patients-report"
            columns={['Patient', 'Patient Number', 'Visits', 'Total Billed', 'Last Visit']}
            rows={patientsReport.map(r => [r.name, r.patientNumber, r.visits, r.totalBilled, r.lastVisit])} />
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {patientsReport.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No patient visits in this period.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {patientsReport.map((r, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{r.name}</span>
                      {r.patientNumber && <span className="text-xs text-gray-400 ml-2">({r.patientNumber})</span>}
                    </div>
                    <span className="text-gray-500">{r.visits} visit{r.visits !== 1 ? 's' : ''}</span>
                    <span className="text-gray-400">Last: {r.lastVisit}</span>
                    <span className="font-semibold text-gray-900">₦{r.totalBilled.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Operations Overview (existing reconciliation/cost-audit/spillage) ===== */}
      {reportType === 'overview' && (
      <>
      {/* Revenue summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Total Billed</div>
          <div className="text-2xl font-black text-gray-900">₦{revenue.billed.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">{revenue.visitCount} visit{revenue.visitCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Collected</div>
          <div className="text-2xl font-black text-gray-900">₦{revenue.collected.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Outstanding</div>
          <div className="text-2xl font-black" style={{ color: revenue.outstanding > 0 ? '#f59e0b' : '#111827' }}>₦{revenue.outstanding.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-5">
          <div className="text-xs text-amber-600 uppercase tracking-widest font-medium mb-1">Potential Unbilled Work</div>
          <div className="text-2xl font-black" style={{ color: totalGapValue > 0 ? '#dc2626' : '#111827' }}>₦{totalGapValue.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">{totalGapCount} procedure{totalGapCount !== 1 ? 's' : ''} performed but not billed</div>
        </div>
      </div>

      {/* Reconciliation table */}
      <div className="report-section mb-6" id="reconciliation-report">
        <ReportPrintHeader id="reconciliation-report-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
          title="Procedure Reconciliation Report" dateRangeLabel={dateRangeLabel} />
        <div className="font-semibold text-gray-900 mb-3">Usage vs Billing - Procedure Reconciliation</div>
        <div className="text-xs text-gray-400 mb-3">Procedures logged in Usage Log compared against matching charges in Billing, for the selected period. A positive gap means the procedure was performed but not billed.</div>
        <ReportExportBar filename="reconciliation_report" title="Procedure Reconciliation Report" sectionId="reconciliation-report"
          columns={['Department', 'Procedure', 'Performed', 'Billed', 'Gap', 'Unit Price', 'Gap Value']}
          rows={reconRows.map(r => [r.department, r.name, r.usageCount, r.billedCount, r.gap, r.unitPrice, r.gapValue])} />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {reconRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No procedure usage logged for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Department', 'Procedure', 'Performed', 'Billed', 'Gap', 'Unit Price', 'Potential Loss'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconRows.map((r, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{r.department}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-gray-700">{r.usageCount}</td>
                      <td className="px-4 py-3 text-gray-700">{r.billedCount}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: r.gap > 0 ? '#dc2626' : r.gap < 0 ? 'var(--brand-color)' : '#9ca3af' }}>
                        {r.gap > 0 ? `+${r.gap}` : r.gap}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.unitPrice > 0 ? `₦${r.unitPrice.toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: r.gapValue > 0 ? '#dc2626' : '#9ca3af' }}>
                        {r.gapValue > 0 ? `₦${r.gapValue.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {reconRows.some(r => r.unitPrice === 0 && r.gap > 0) && (
          <div className="text-xs text-amber-600 mt-2">
            Some procedures above have no price set in Services &amp; Pricing, their potential loss can't be calculated yet. Add a price to see the full picture.
          </div>
        )}
      </div>

      {/* Cost audit */}
      <div className="report-section mb-6" id="cost-audit-report">
        <ReportPrintHeader id="cost-audit-report-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
          title="Procedure Cost Audit Report" dateRangeLabel={dateRangeLabel} />
        <div className="font-semibold text-gray-900 mb-3">Procedure Cost Audit</div>
        <div className="text-xs text-gray-400 mb-3">For each procedure, the average cost of consumables actually used (from procurement unit costs) compared against its price. A negative margin means the procedure costs more in materials than it's priced for.</div>
        <ReportExportBar filename="cost_audit_report" title="Procedure Cost Audit Report" sectionId="cost-audit-report"
          columns={['Department', 'Procedure', 'Instances', 'Avg Cost', 'Price', 'Margin', 'Margin %']}
          rows={costAuditRows.map(r => [r.department, r.name, r.instanceCount, r.avgCost, r.price, r.margin ?? '', r.marginPct ?? ''])} />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {costAuditRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No procedure cost data for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Department', 'Procedure', 'Instances', 'Avg. Consumable Cost', 'Price', 'Margin', 'Margin %'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costAuditRows.map((r, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{r.department}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-gray-700">{r.instanceCount}</td>
                      <td className="px-4 py-3 text-gray-700">₦{r.avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-gray-500">{r.price > 0 ? `₦${r.price.toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: r.margin == null ? '#9ca3af' : r.margin < 0 ? '#dc2626' : '#111827' }}>
                        {r.margin == null ? '-' : `₦${r.margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: r.marginPct == null ? '#9ca3af' : r.marginPct < 0 ? '#dc2626' : r.marginPct < 20 ? '#f59e0b' : '#111827' }}>
                        {r.marginPct == null ? '-' : `${r.marginPct.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {costAuditRows.some(r => r.price === 0) && (
          <div className="text-xs text-amber-600 mt-2">
            Procedures with no price set show "-" for margin, add a price in Services &amp; Pricing to see the full picture.
          </div>
        )}
        {costAuditRows.some(r => r.avgCost === 0 && r.price > 0) && (
          <div className="text-xs text-gray-400 mt-2">
            Procedures showing ₦0 cost had no consumables logged against them, margin shown is the full price, not a true picture of cost.
          </div>
        )}
      </div>

      {/* Spillage / damage rollup */}
      <div className="report-section" id="spillage-report">
        <ReportPrintHeader id="spillage-report-print-header" facilityName={facility.name} logoUrl={facility.logo_url}
          title="Spillage & Damage Report" dateRangeLabel={dateRangeLabel} />
        <div className="font-semibold text-gray-900 mb-3">Spillage &amp; Damage - By Department</div>
        <ReportExportBar filename="spillage_report" title="Spillage & Damage Report" sectionId="spillage-report"
          columns={['Department', 'Entries', 'Total Quantity']}
          rows={spillageRows.map(r => [r.department, r.count, r.totalQuantity])} />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {spillageRows.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No spillage or damage logged for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Department', 'Entries', 'Total Quantity'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spillageRows.map(r => (
                    <tr key={r.department} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.department}</td>
                      <td className="px-4 py-3 text-gray-700">{r.count}</td>
                      <td className="px-4 py-3 text-gray-700">{r.totalQuantity.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}