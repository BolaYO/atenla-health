'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildWhatsAppLink } from '@/lib/whatsapp'

interface FacilityUserRef {
  id: string
  name: string
  role: string
  phone: string | null
}

interface Props {
  facilityId: string
}

const CAN_MANAGE_ROLES = ['admin', 'procurement']

export function NotificationsCenter({ facilityId }: Props) {
  const [facilityUsers, setFacilityUsers] = useState<FacilityUserRef[]>([])
  const [pendingApproval, setPendingApproval] = useState<any[]>([])
  const [approvedAwaitingPrep, setApprovedAwaitingPrep] = useState<any[]>([])
  const [readyForCollection, setReadyForCollection] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()

    const [{ data: users }, { data: reqs }] = await Promise.all([
      supabase.from('health_facility_users').select('id, name, role, phone').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      // Dispensing module — pending nudges
      supabase.from('health_dispensing_requests')
        .select('*, health_dispensing_items(*, health_supplies(name, unit_of_issue)), requested:requested_by(id, name)')
        .eq('facility_id', facilityId)
        .in('status', ['pending', 'approved', 'ready'])
        .order('created_at', { ascending: true }),
      // Future modules (patients, billing, procurement) can add their own pending-nudge queries here
      // and merge their results into the same notification feed below.
    ])

    setFacilityUsers(users ?? [])
    const all = reqs ?? []
    setPendingApproval(all.filter(r => r.status === 'pending'))
    setApprovedAwaitingPrep(all.filter(r => r.status === 'approved'))
    setReadyForCollection(all.filter(r => r.status === 'ready'))
    setLoading(false)
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading notifications...</div>

  const totalCount = pendingApproval.length + approvedAwaitingPrep.length + readyForCollection.length

  return (
    <div>
      <div className="mb-6">
        <div className="text-2xl font-black text-gray-900 mb-1">Notifications</div>
        <div className="text-sm text-gray-400">
          Items across the system that need a nudge. Tap "Send WhatsApp" to open a pre-filled message, review and send from the hospital's WhatsApp.
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          All caught up, nothing needs a nudge right now.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Dispensing — pending approval */}
          {pendingApproval.map(req => {
            const managers = facilityUsers.filter(u => CAN_MANAGE_ROLES.includes(u.role) && u.phone)
            const itemsList = (req.health_dispensing_items ?? []).map((i: any) => `${i.health_supplies?.name} (${i.quantity_requested} ${i.health_supplies?.unit_of_issue})`).join(', ')
            const message = `Hi, a new ${req.request_type.replace('_', ' ')} request from ${req.requested?.name} (${req.department}) is awaiting your approval on Atenla Health: ${itemsList}.`
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-amber-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Dispensing · Awaiting Approval</span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <span className="font-semibold">{req.requested?.name}</span> ({req.department}) requested <span className="font-medium">{itemsList}</span>
                </div>
                {managers.length === 0 ? (
                  <div className="text-xs text-gray-400">No phone number on file for an approver. Add one in Staff settings.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {managers.map(m => {
                      const link = buildWhatsAppLink(m.phone, message)
                      return link ? (
                        <a key={m.id} href={link} target="_blank" rel="noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: '#25D366' }}>
                          Send WhatsApp to {m.name}
                        </a>
                      ) : null
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Dispensing — approved, awaiting preparation */}
          {approvedAwaitingPrep.map(req => {
            const managers = facilityUsers.filter(u => CAN_MANAGE_ROLES.includes(u.role) && u.phone)
            const itemsList = (req.health_dispensing_items ?? []).map((i: any) => `${i.health_supplies?.name} (${i.quantity_requested} ${i.health_supplies?.unit_of_issue})`).join(', ')
            const message = `Hi, a request for ${req.department} has been approved and is ready to be prepared on Atenla Health: ${itemsList}. Requested by ${req.requested?.name}.`
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-sky-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">Dispensing · Needs Preparation</span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  Approved request for <span className="font-semibold">{req.department}</span> - <span className="font-medium">{itemsList}</span>
                </div>
                {managers.length === 0 ? (
                  <div className="text-xs text-gray-400">No phone number on file for the store manager. Add one in Staff settings.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {managers.map(m => {
                      const link = buildWhatsAppLink(m.phone, message)
                      return link ? (
                        <a key={m.id} href={link} target="_blank" rel="noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ background: '#25D366' }}>
                          Send WhatsApp to {m.name}
                        </a>
                      ) : null
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Dispensing — ready for collection */}
          {readyForCollection.map(req => {
            const requester = facilityUsers.find(u => u.id === req.requested_by)
            const itemsList = (req.health_dispensing_items ?? []).map((i: any) => `${i.health_supplies?.name} (${i.quantity_requested} ${i.health_supplies?.unit_of_issue})`).join(', ')
            const message = `Hi ${requester?.name ?? ''}, your request for ${itemsList} is ready for collection at the store. Please come pick it up.`
            const link = buildWhatsAppLink(requester?.phone, message)
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-purple-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Dispensing · Ready for Collection</span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <span className="font-semibold">{requester?.name}</span>'s request - <span className="font-medium">{itemsList}</span> is ready
                </div>
                {!link ? (
                  <div className="text-xs text-gray-400">No phone number on file for {requester?.name}. Add one in Staff settings.</div>
                ) : (
                  <a href={link} target="_blank" rel="noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold inline-block" style={{ background: '#25D366' }}>
                    Send WhatsApp to {requester?.name}
                  </a>
                )}
              </div>
            )
          })}

          {/* Future modules — Patients (appointment reminders), Billing (payment reminders),
              Procurement (supplier follow-ups) plug into this same feed once built. */}
        </div>
      )}
    </div>
  )
}