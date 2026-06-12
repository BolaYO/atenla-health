'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { InventoryManager } from '@/components/dashboard/InventoryManager'
import { ProcurementManager } from '@/components/dashboard/ProcurementManager'
import { DispensingManager } from '@/components/dashboard/DispensingManager'
import { NotificationsCenter } from '@/components/dashboard/NotificationsCenter'
import { PatientsManager } from '@/components/dashboard/PatientsManager'
import { BillingManager } from '@/components/dashboard/BillingManager'
import { ReportingManager } from '@/components/dashboard/ReportingManager'
import { StaffManager } from '@/components/dashboard/StaffManager'
import { SettingsManager } from '@/components/dashboard/SettingsManager'
import { FrontDeskManager } from '@/components/dashboard/FrontDeskManager'
import { VitalsManager } from '@/components/dashboard/VitalsManager'
import { OverviewManager } from '@/components/dashboard/OverviewManager'

interface Facility {
  id: string
  name: string
  slug: string
  logo_url: string | null
  brand_color: string
}

interface FacilityUser {
  id: string
  name: string
  email: string
  role: string
  is_admin?: boolean
  allowed_departments?: string[]
  allowed_modules?: string[]
}

interface Props {
  facility: Facility
  facilityUser: FacilityUser
}

type Tab = 'overview' | 'inventory' | 'procurement' | 'dispensing' | 'front_desk' | 'vitals' | 'patients' | 'billing' | 'reports' | 'notifications' | 'staff' | 'settings'

const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'inventory',   label: 'Inventory' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'dispensing',  label: 'Dispensing' },
  { key: 'front_desk',  label: 'Front Desk' },
  { key: 'vitals',      label: 'Vitals' },
  { key: 'patients',    label: 'Patients' },
  { key: 'billing',     label: 'Billing' },
  { key: 'reports',     label: 'Reports' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'staff',       label: 'Staff' },
  { key: 'settings',    label: 'Settings' },
]

const ROLE_TABS: Record<string, Tab[]> = {
  admin:       ['overview', 'inventory', 'procurement', 'dispensing', 'patients', 'billing', 'reports', 'notifications'],
  procurement: ['inventory', 'procurement', 'dispensing'],
  lab:         ['dispensing', 'patients'],
  pharmacy:    ['inventory', 'dispensing', 'patients'],
  nursing:     ['dispensing', 'patients'],
  dental:      ['dispensing', 'patients', 'billing'],
  billing:     ['patients', 'billing', 'reports'],
  doctor:      ['patients', 'dispensing'],
  front_desk:  ['front_desk', 'patients', 'notifications'],
}

export function DashboardClient({ facility, facilityUser }: Props) {
  const router = useRouter()
  const [dispensingBadge, setDispensingBadge] = useState(0)
  const [vitalsBadge, setVitalsBadge] = useState(0)
  const [badgeRefreshTrigger, setBadgeRefreshTrigger] = useState(0)

  const usesNewPermissionModel = facilityUser.is_admin || (facilityUser.allowed_modules?.length ?? 0) > 0

  const visibleTabs = ALL_TABS.filter(t => {
    if (t.key === 'overview') return facilityUser.is_admin || !usesNewPermissionModel && (ROLE_TABS[facilityUser.role] ?? []).includes('overview')
    if (t.key === 'staff') return !!facilityUser.is_admin
    if (t.key === 'settings') return !!facilityUser.is_admin
    if (facilityUser.is_admin) return true
    if (usesNewPermissionModel) return (facilityUser.allowed_modules ?? []).includes(t.key)
    return (ROLE_TABS[facilityUser.role] ?? []).includes(t.key)
  })

  // Default to the user's first permitted tab — never assume 'overview' is available
  const [tab, setTabRaw] = useState<Tab>(() => visibleTabs[0]?.key ?? 'overview')

  // Every tab change is checked against visibleTabs — closes the gap where
  // a hardcoded link (e.g. an Overview card) could set a tab the user
  // doesn't actually have permission to view.
  function setTab(next: Tab) {
    if (visibleTabs.some(t => t.key === next)) setTabRaw(next)
  }

  useEffect(() => {
    async function loadBadge() {
      const supabase = createClient()
      if (['admin', 'procurement'].includes(facilityUser.role)) {
        // Count items needing approval, preparation, or release
        const { count } = await supabase
          .from('health_dispensing_requests')
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', facility.id)
          .in('status', ['pending', 'approved', 'ready'])
        setDispensingBadge(count ?? 0)
      } else {
        // Count own requests that are ready for collection
        const { count } = await supabase
          .from('health_dispensing_requests')
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', facility.id)
          .eq('requested_by', facilityUser.id)
          .eq('status', 'ready')
        setDispensingBadge(count ?? 0)
      }
    }
    async function loadVitalsBadge() {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { data: visits } = await supabase
        .from('health_visits')
        .select('id, checked_in_at, health_vitals(id)')
        .eq('facility_id', facility.id)
        .eq('status', 'open')
        .eq('visit_date', today)
        .not('checked_in_at', 'is', null)
      const pending = (visits ?? []).filter(v => (v.health_vitals ?? []).length === 0).length
      setVitalsBadge(pending)
    }

    loadBadge()
    loadVitalsBadge()
  }, [tab, badgeRefreshTrigger])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = facilityUser.role.charAt(0).toUpperCase() + facilityUser.role.slice(1)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ '--brand-color': facility.brand_color || '#F97316' } as React.CSSProperties}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-20 no-print">
        <div className="flex items-center gap-3">
          {facility.logo_url ? (
            <img src={facility.logo_url} alt={facility.name} className="w-8 h-8 rounded-xl object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
              style={{ background: 'var(--brand-color)' }}>
              {facility.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="font-extrabold text-gray-900" style={{ color: 'var(--brand-color)' }}>{facility.name}</div>
            <div className="text-xs text-gray-400 uppercase tracking-widest">{facilityUser.name} · {roleLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => window.location.reload()}
            className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors">
            Refresh
          </button>
          <button onClick={handleLogout}
            className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6 overflow-x-auto no-print">
        <div className="flex gap-1 min-w-max">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={'relative px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ' +
                (tab === t.key ? 'text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700')}
              style={tab === t.key ? { borderColor: 'var(--brand-color)' } : { borderColor: 'transparent' }}>
              {t.label}
              {t.key === 'dispensing' && dispensingBadge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {dispensingBadge}
                </span>
              )}
              {t.key === 'vitals' && vitalsBadge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {vitalsBadge}
                </span>
              )}
              {t.key === 'notifications' && ['admin', 'procurement'].includes(facilityUser.role) && dispensingBadge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {dispensingBadge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        {tab === 'overview' && (
          <OverviewManager
            facilityId={facility.id}
            facilityName={facility.name}
            visibleTabKeys={visibleTabs.map(t => t.key)}
            onNavigate={(t) => setTab(t as Tab)}
          />
        )}
        {tab === 'inventory' && <InventoryManager facilityId={facility.id} />}
        {tab === 'procurement' && <ProcurementManager facilityId={facility.id} />}
        {tab === 'dispensing' && <DispensingManager facilityId={facility.id} currentUser={facilityUser} onDataChange={() => setBadgeRefreshTrigger(t => t + 1)} />}
        {tab === 'notifications' && <NotificationsCenter facilityId={facility.id} />}
        {tab === 'patients' && <PatientsManager facilityId={facility.id} />}
        {tab === 'billing' && <BillingManager facilityId={facility.id} currentUser={facilityUser} />}
        {tab === 'reports' && <ReportingManager facilityId={facility.id} facility={facility} />}
        {tab === 'staff' && <StaffManager facilityId={facility.id} />}
        {tab === 'settings' && <SettingsManager facility={facility} />}
        {tab === 'front_desk' && <FrontDeskManager facilityId={facility.id} currentUser={facilityUser} onDataChange={() => setBadgeRefreshTrigger(t => t + 1)} />}
        {tab === 'vitals' && <VitalsManager facilityId={facility.id} currentUser={facilityUser} onDataChange={() => setBadgeRefreshTrigger(t => t + 1)} />}
        {tab !== 'overview' && tab !== 'inventory' && tab !== 'procurement' && tab !== 'dispensing' && tab !== 'notifications' && tab !== 'patients' && tab !== 'billing' && tab !== 'reports' && tab !== 'staff' && tab !== 'front_desk' && tab !== 'vitals' && tab !== 'settings' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="text-4xl mb-4">🏗️</div>
            <div className="font-bold text-gray-900 mb-2">{ALL_TABS.find(t => t.key === tab)?.label} module</div>
            <div className="text-sm text-gray-400">Coming soon, being built now</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-4 px-6">
        <div className="max-w-7xl mx-auto text-center text-xs text-gray-300">
          Powered by Atẹ́nlá
        </div>
      </div>
    </div>
  )
}