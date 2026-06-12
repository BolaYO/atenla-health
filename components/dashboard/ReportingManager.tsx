'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  facilityId: string
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

export function ReportingManager({ facilityId }: Props) {
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
        .select('total_amount, amount_paid, outstanding, visit_date')
        .eq('facility_id', facilityId)
        .gte('visit_date', from.toISOString().split('T')[0])
        .lt('visit_date', to.toISOString().split('T')[0]),
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

    setLoading(false)
  }

  const totalGapValue = reconRows.reduce((s, r) => s + r.gapValue, 0)
  const totalGapCount = reconRows.reduce((s, r) => s + Math.max(0, r.gap), 0)

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading reports...</div>

  return (
    <div>
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {(['today', 'week', 'month', 'custom'] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)}
            className={'px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ' + (dateFilter === f ? 'text-white' : 'bg-gray-100 text-gray-600')}
            style={dateFilter === f ? { background: '#0EA5E9' } : undefined}>
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
      <div className="mb-6">
        <div className="font-semibold text-gray-900 mb-3">Usage vs Billing - Procedure Reconciliation</div>
        <div className="text-xs text-gray-400 mb-3">Procedures logged in Usage Log compared against matching charges in Billing, for the selected period. A positive gap means the procedure was performed but not billed.</div>
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
                      <td className="px-4 py-3 font-semibold" style={{ color: r.gap > 0 ? '#dc2626' : r.gap < 0 ? '#0EA5E9' : '#9ca3af' }}>
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
            Some procedures above have no price set in Services &amp; Pricing - their potential loss can't be calculated yet. Add a price to see the full picture.
          </div>
        )}
      </div>

      {/* Cost audit */}
      <div className="mb-6">
        <div className="font-semibold text-gray-900 mb-3">Procedure Cost Audit</div>
        <div className="text-xs text-gray-400 mb-3">For each procedure, the average cost of consumables actually used (from procurement unit costs) compared against its price. A negative margin means the procedure costs more in materials than it's priced for.</div>
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
            Procedures with no price set show "-" for margin - add a price in Services &amp; Pricing to see the full picture.
          </div>
        )}
        {costAuditRows.some(r => r.avgCost === 0 && r.price > 0) && (
          <div className="text-xs text-gray-400 mt-2">
            Procedures showing ₦0 cost had no consumables logged against them - margin shown is the full price, not a true picture of cost.
          </div>
        )}
      </div>

      {/* Spillage / damage rollup */}
      <div>
        <div className="font-semibold text-gray-900 mb-3">Spillage &amp; Damage - By Department</div>
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
    </div>
  )
}