'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  facilityId: string
  facilityName: string
  visibleTabKeys: string[]
  onNavigate: (tab: string) => void
}

interface Stats {
  todayRevenue: number
  todayPatients: number
  pendingApprovals: number
  lowStockCount: number
  resultsPending: number
  outstanding: number
}

interface ActivityItem {
  id: string
  icon: string
  label: string
  timestamp: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

export function OverviewManager({ facilityId, facilityName, visibleTabKeys, onNavigate }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: payments },
      { data: visits },
      { count: pendingApprovals },
      { data: supplies },
      { count: resultsPending },
      { data: outstandingVisits },
      { data: recentPayments },
      { data: recentUsage },
      { data: recentCheckins },
    ] = await Promise.all([
      supabase.from('health_payments').select('amount, paid_at').eq('facility_id', facilityId).gte('paid_at', `${today}T00:00:00`).lt('paid_at', `${today}T23:59:59.999`),
      supabase.from('health_visits').select('id').eq('facility_id', facilityId).eq('visit_date', today),
      supabase.from('health_dispensing_requests').select('id', { count: 'exact', head: true }).eq('facility_id', facilityId).in('status', ['pending', 'approved', 'ready']),
      supabase.from('health_supplies').select('current_stock, reorder_point').eq('facility_id', facilityId),
      supabase.from('health_results').select('id', { count: 'exact', head: true }).eq('facility_id', facilityId).in('status', ['pending', 'ready']),
      supabase.from('health_visits').select('outstanding').eq('facility_id', facilityId).gt('outstanding', 0),
      // Recent activity sources
      supabase.from('health_payments').select('id, amount, payment_method, paid_at, visit:visit_id(patient_name)').eq('facility_id', facilityId).gte('paid_at', since).order('paid_at', { ascending: false }).limit(8),
      supabase.from('health_usage_logs').select('id, department, procedure_name, patient_name, usage_type, created_at, procedure_instance_id').eq('facility_id', facilityId).eq('usage_type', 'procedure').gte('created_at', since).order('created_at', { ascending: false }).limit(15),
      supabase.from('health_visits').select('id, patient_name, department, checked_in_at, checker:checked_in_by(name)').eq('facility_id', facilityId).not('checked_in_at', 'is', null).gte('checked_in_at', since).order('checked_in_at', { ascending: false }).limit(8),
    ])

    const todayRevenue = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
    const lowStockCount = (supplies ?? []).filter(s => s.reorder_point > 0 && s.current_stock <= s.reorder_point).length
    const outstanding = (outstandingVisits ?? []).reduce((sum, v) => sum + (v.outstanding ?? 0), 0)

    setStats({
      todayRevenue,
      todayPatients: (visits ?? []).length,
      pendingApprovals: pendingApprovals ?? 0,
      lowStockCount,
      resultsPending: resultsPending ?? 0,
      outstanding,
    })

    // Merge activity feeds — dedupe usage logs by procedure_instance_id (one entry per procedure, not per consumable)
    const seenInstances = new Set<string>()
    const items: ActivityItem[] = []

    for (const p of recentPayments ?? []) {
      const visit = (p as any).visit
      items.push({
        id: `pay-${p.id}`,
        icon: '💳',
        label: `Payment of ₦${(p.amount ?? 0).toLocaleString()} received${visit?.patient_name ? ` - ${visit.patient_name}` : ''} (${p.payment_method ?? 'method unspecified'})`,
        timestamp: p.paid_at,
      })
    }

    for (const u of recentUsage ?? []) {
      if (seenInstances.has(u.procedure_instance_id)) continue
      seenInstances.add(u.procedure_instance_id)
      items.push({
        id: `usage-${u.id}`,
        icon: '🩺',
        label: `${u.procedure_name} logged in ${u.department}${u.patient_name ? ` - ${u.patient_name}` : ''}`,
        timestamp: u.created_at,
      })
    }

    for (const c of recentCheckins ?? []) {
      const checker = (c as any).checker
      items.push({
        id: `checkin-${c.id}`,
        icon: '🏥',
        label: `${c.patient_name ?? 'Patient'} checked in${checker?.name ? ` by ${checker.name}` : ''}`,
        timestamp: c.checked_in_at,
      })
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setActivity(items.slice(0, 10))

    setLoading(false)
  }

  if (loading || !stats) return <div className="text-center py-12 text-gray-400 text-sm">Loading overview...</div>

  const CARDS: { label: string; value: string; sub?: string; tab: string; alert?: boolean }[] = [
    { label: "Today's Revenue", value: `₦${stats.todayRevenue.toLocaleString()}`, tab: 'billing' },
    { label: "Today's Patients", value: `${stats.todayPatients}`, sub: stats.todayPatients === 1 ? 'visit' : 'visits', tab: 'patients' },
    { label: 'Pending Approvals', value: `${stats.pendingApprovals}`, sub: 'dispensing requests', tab: 'dispensing', alert: stats.pendingApprovals > 0 },
    { label: 'Low Stock Items', value: `${stats.lowStockCount}`, sub: 'at or below reorder point', tab: 'inventory', alert: stats.lowStockCount > 0 },
    { label: 'Results Pending', value: `${stats.resultsPending}`, sub: 'awaiting entry or delivery', tab: 'results', alert: stats.resultsPending > 0 },
    { label: 'Outstanding Balance', value: `₦${stats.outstanding.toLocaleString()}`, sub: 'across all patients', tab: 'billing', alert: stats.outstanding > 0 },
  ].filter(c => visibleTabKeys.includes(c.tab))

  const QUICK_ACTIONS: { label: string; icon: string; tab: string }[] = [
    { label: 'Check In Patient', icon: '🏥', tab: 'front_desk' },
    { label: 'Record Vitals', icon: '🩺', tab: 'vitals' },
    { label: 'Log Procedure', icon: '📋', tab: 'dispensing' },
    { label: 'Generate Bill', icon: '🧾', tab: 'billing' },
    { label: 'Receive Stock', icon: '📦', tab: 'procurement' },
  ].filter(a => visibleTabKeys.includes(a.tab))

  return (
    <div>
      <div className="font-black text-2xl text-gray-900 mb-1">Good day 👋</div>
      <div className="text-sm text-gray-400 mb-6">{facilityName}, here's what's happening today.</div>

      {QUICK_ACTIONS.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {QUICK_ACTIONS.map(a => (
            <button key={a.tab} onClick={() => onNavigate(a.tab)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-sky-300 transition-colors text-sm font-semibold text-gray-700">
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {CARDS.map(c => (
          <button key={c.label} onClick={() => onNavigate(c.tab)}
            className={'text-left bg-white rounded-2xl p-5 border transition-colors hover:border-gray-300 ' + (c.alert ? 'border-amber-200' : 'border-gray-100')}>
            <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">{c.label}</div>
            <div className="text-2xl font-black" style={{ color: c.alert ? '#f59e0b' : '#111827' }}>{c.value}</div>
            {c.sub && <div className="text-xs text-gray-400 mt-1">{c.sub}</div>}
          </button>
        ))}
      </div>

      <div className="font-semibold text-gray-900 mb-3">Recent Activity</div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {activity.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Nothing logged in the last 24 hours.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activity.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between text-sm gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-gray-700">{item.label}</span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(item.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}