'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PresetSelect } from './PresetSelect'
import { UsageLogManager } from './UsageLogManager'

interface Supply {
  id: string
  name: string
  unit_of_issue: string
  current_stock: number
  department: string | null
}

interface FacilityUserRef {
  id: string
  name: string
  role: string
  phone?: string | null
}

interface RequestItem {
  supply_id: string
  quantity_requested: string
}

interface PatientRef {
  id: string
  first_name: string
  last_name: string
  patient_number: string | null
  phone: string | null
}

interface Props {
  facilityId: string
  currentUser: FacilityUserRef
  onDataChange?: () => void
}

const DEPARTMENTS = ['Lab', 'Pharmacy', 'Nursing', 'Dental', 'General', 'Specialist']

// Restrict department choice based on role — admin/procurement see all
const ROLE_DEPARTMENTS: Record<string, string[]> = {
  lab: ['Lab'],
  pharmacy: ['Pharmacy'],
  nursing: ['Nursing'],
  dental: ['Dental'],
  doctor: ['General', 'Specialist'],
  billing: [],
  front_desk: [],
}

function departmentsForRole(role: string): string[] {
  if (role === 'admin' || role === 'procurement') return DEPARTMENTS
  return ROLE_DEPARTMENTS[role] ?? DEPARTMENTS
}
// Stock Requests are restocks from the central store to a department.
// Patient/procedure/emergency-specific reasoning now lives in the Usage Log module.

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Approval',
  approved: 'Approved! Awaiting Preparation',
  ready: 'Ready for Collection',
  issued: 'Issued',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-sky-100 text-sky-700',
  ready: 'bg-purple-100 text-purple-700',
  issued: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

const CAN_MANAGE_ROLES = ['admin', 'procurement']

export function DispensingManager({ facilityId, currentUser, onDataChange }: Props) {
  const [view, setView] = useState<'new' | 'mine' | 'manage' | 'usage'>('new')
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [facilityUsers, setFacilityUsers] = useState<FacilityUserRef[]>([])
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [patients, setPatients] = useState<PatientRef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New request form
  const [department, setDepartment] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [patientName, setPatientName] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<RequestItem[]>([{ supply_id: '', quantity_requested: '' }])


  // Issue modal state
  const [issuingId, setIssuingId] = useState<string | null>(null)
  const [issueQuantities, setIssueQuantities] = useState<Record<string, string>>({})
  const [collectedBy, setCollectedBy] = useState('')

  const canManage = CAN_MANAGE_ROLES.includes(currentUser.role)
  const hasDepartmentAccess = departmentsForRole(currentUser.role).length > 0

  useEffect(() => {
    if (!hasDepartmentAccess && canManage) setView('manage')
  }, [hasDepartmentAccess, canManage])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: sup }, { data: users }, { data: reqs }] = await Promise.all([
      supabase.from('health_supplies').select('id, name, unit_of_issue, current_stock, department').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_facility_users').select('id, name, role, phone').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_dispensing_requests')
        .select('*, health_dispensing_items(*, health_supplies(name, unit_of_issue)), requested:requested_by(id, name), approved:approved_by(id, name), prepared:prepared_by(id, name), issued_user:issued_by(id, name), collected:collected_by(id, name)')
        .eq('facility_id', facilityId)
        .eq('request_type', 'restock')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setSupplies(sup ?? [])
    setFacilityUsers(users ?? [])
    setAllRequests(reqs ?? [])
    setLoading(false)
  }

  function addItemRow() { setItems(prev => [...prev, { supply_id: '', quantity_requested: '' }]) }
  function removeItemRow(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof RequestItem, value: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function resetForm() {
    setDepartment(''); setNotes('')
    setItems([{ supply_id: '', quantity_requested: '' }])
    setPriority('normal')
  }

  async function submitRequest() {
    const validItems = items.filter(it => it.supply_id && it.quantity_requested)
    if (!department || validItems.length === 0) return

    setSaving(true)
    const supabase = createClient()

    const { data: req } = await supabase.from('health_dispensing_requests').insert({
      facility_id: facilityId,
      requested_by: currentUser.id,
      department,
      request_type: 'restock',
      priority,
      notes: notes.trim() || null,
      status: 'pending',
    }).select().single()

    if (req) {
      for (const it of validItems) {
        const supply = supplies.find(s => s.id === it.supply_id)
        await supabase.from('health_dispensing_items').insert({
          request_id: req.id,
          supply_id: it.supply_id,
          quantity_requested: parseFloat(it.quantity_requested),
          unit_of_issue: supply?.unit_of_issue ?? 'unit',
        })
      }
    }

    await loadData()
    resetForm()
    setSaving(false)
    setView('mine')
    onDataChange?.()
  }

  async function approveRequest(reqId: string) {
    const supabase = createClient()
    await supabase.from('health_dispensing_requests').update({
      status: 'approved', approved_by: currentUser.id, approved_at: new Date().toISOString(),
    }).eq('id', reqId)
    await loadData()
    onDataChange?.()
  }

  async function rejectRequest(reqId: string) {
    if (!confirm('Reject this request?')) return
    const supabase = createClient()
    await supabase.from('health_dispensing_requests').update({
      status: 'rejected', approved_by: currentUser.id, approved_at: new Date().toISOString(),
    }).eq('id', reqId)
    await loadData()
    onDataChange?.()
  }

  async function markReady(reqId: string) {
    const supabase = createClient()
    await supabase.from('health_dispensing_requests').update({
      status: 'ready', prepared_by: currentUser.id, ready_at: new Date().toISOString(),
    }).eq('id', reqId)
    await loadData()
    onDataChange?.()
  }

  function startIssue(req: any) {
    setIssuingId(req.id)
    const qtys: Record<string, string> = {}
    for (const item of req.health_dispensing_items ?? []) {
      qtys[item.id] = String(item.quantity_requested)
    }
    setIssueQuantities(qtys)
    setCollectedBy(req.requested_by)
  }

  async function confirmIssue(req: any) {
    setSaving(true)
    const supabase = createClient()

    for (const item of req.health_dispensing_items ?? []) {
      const qty = parseFloat(issueQuantities[item.id] ?? '0') || 0
      await supabase.from('health_dispensing_items').update({ quantity_issued: qty }).eq('id', item.id)
    }

    await supabase.from('health_dispensing_requests').update({
      status: 'issued', issued_by: currentUser.id, issued_at: new Date().toISOString(),
      collected_by: collectedBy || req.requested_by,
    }).eq('id', req.id)

    await loadData()
    setIssuingId(null)
    setSaving(false)
    onDataChange?.()
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  const myRequests = allRequests.filter(r => r.requested_by === currentUser.id)
  const pendingApproval = allRequests.filter(r => r.status === 'pending')
  const approvedAwaitingPrep = allRequests.filter(r => r.status === 'approved')
  const readyForCollection = allRequests.filter(r => r.status === 'ready')

  function fmtDateTime(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function RequestTimeline({ req }: { req: any }) {
    const steps = [
      { label: 'Requested', by: req.requested?.name, at: req.requested_at },
      { label: 'Approved', by: req.approved?.name, at: req.approved_at },
      { label: 'Prepared', by: req.prepared?.name, at: req.ready_at },
      { label: 'Issued', by: req.issued_user?.name, at: req.issued_at },
    ]
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-1">
        {steps.map(s => s.at ? (
          <span key={s.label}>{s.label} by <span className="text-gray-600 font-medium">{s.by ?? '-'}</span> · {fmtDateTime(s.at)}</span>
        ) : null)}
        {req.collected?.name && req.status === 'issued' && (
          <span>Collected by <span className="text-gray-600 font-medium">{req.collected.name}</span></span>
        )}
      </div>
    )
  }

  function RequestCard({ req, actions }: { req: any; actions?: React.ReactNode }) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{req.department}</span>
              {req.priority === 'urgent' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">URGENT</span>
              )}
              <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (STATUS_COLORS[req.status] ?? '')}>{STATUS_LABELS[req.status] ?? req.status}</span>
            </div>
            <div className="mt-2 space-y-1">
              {(req.health_dispensing_items ?? []).map((item: any) => (
                <div key={item.id} className="text-sm text-gray-700">
                  {item.health_supplies?.name ?? 'Item'} - {item.quantity_requested} {item.health_supplies?.unit_of_issue ?? item.unit_of_issue}
                  {item.quantity_issued != null && item.quantity_issued !== item.quantity_requested && (
                    <span className="text-amber-600"> (issued: {item.quantity_issued})</span>
                  )}
                </div>
              ))}
            </div>
            {req.notes && <div className="text-xs text-gray-400 mt-2 italic">{req.notes}</div>}
            <RequestTimeline req={req} />
          </div>
          {actions}
        </div>
      </div>
    )
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading dispensing...</div>

  return (
    <div>
      {/* View tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {hasDepartmentAccess && (
        <button onClick={() => setView('new')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'new' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'new' ? { background: 'var(--brand-color)' } : undefined}>
          Stock Request
        </button>
        )}
        {hasDepartmentAccess && (
        <button onClick={() => setView('mine')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'mine' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'mine' ? { background: 'var(--brand-color)' } : undefined}>
          My Requests {myRequests.length > 0 && `(${myRequests.length})`}
        </button>
        )}
        {hasDepartmentAccess && (
        <button onClick={() => setView('usage')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'usage' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'usage' ? { background: 'var(--brand-color)' } : undefined}>
          Usage Log
        </button>
        )}
        {canManage && (
          <button onClick={() => setView('manage')}
            className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'manage' ? 'text-white' : 'bg-gray-100 text-gray-600')}
            style={view === 'manage' ? { background: 'var(--brand-color)' } : undefined}>
            Approvals &amp; Release
            {(pendingApproval.length + approvedAwaitingPrep.length + readyForCollection.length) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs">
                {pendingApproval.length + approvedAwaitingPrep.length + readyForCollection.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* New Request */}
      {view === 'new' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-2xl">
          <div className="font-semibold text-gray-900 mb-1">New Stock Request</div>
          <div className="text-xs text-gray-400 mb-4">Restock your department from the central store. For logging what is actually used on a patient, procedure, or noting spillage/damage, use the Usage Log.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Department *</label>
              <select className={inputClass} value={department} onChange={e => setDepartment(e.target.value)}>
                <option value="">Select department</option>
                {departmentsForRole(currentUser.role).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <div className="flex gap-2">
                {(['normal', 'urgent'] as const).map(p => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={'px-3 py-2.5 rounded-xl text-sm font-semibold capitalize flex-1 transition-colors ' + (priority === p ? 'text-white' : 'bg-gray-100 text-gray-600')}
                    style={priority === p ? { background: p === 'urgent' ? '#dc2626' : 'var(--brand-color)' } : undefined}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Items Needed</label>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const supply = supplies.find(s => s.id === it.supply_id)
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <select className={inputClass} value={it.supply_id} onChange={e => updateItem(idx, 'supply_id', e.target.value)}>
                      <option value="">Select item</option>
                      {supplies.map(s => <option key={s.id} value={s.id}>{s.name} ({s.current_stock} {s.unit_of_issue} in stock)</option>)}
                    </select>
                    <input type="number" className={inputClass + ' max-w-[120px]'} placeholder="Qty"
                      value={it.quantity_requested} onChange={e => updateItem(idx, 'quantity_requested', e.target.value)} />
                    {supply && <div className="text-xs text-gray-400 pt-3 whitespace-nowrap">{supply.unit_of_issue}</div>}
                    <button onClick={() => removeItemRow(idx)} className="text-xs text-red-500 hover:underline pt-3 whitespace-nowrap">Remove</button>
                  </div>
                )
              })}
            </div>
            <button onClick={addItemRow} className="mt-2 text-xs text-sky-600 font-semibold hover:underline">+ Add another item</button>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass + ' resize-none'} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button onClick={submitRequest} disabled={saving || !department || items.every(it => !it.supply_id)}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
            style={{ background: 'var(--brand-color)' }}>
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      )}

      {/* My Requests */}
      {view === 'mine' && (
        <div className="space-y-3">
          {myRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              You haven't submitted any requests yet.
            </div>
          ) : myRequests.map(req => <RequestCard key={req.id} req={req} />)}
        </div>
      )}

      {/* Approvals & Release */}
      {view === 'manage' && canManage && (
        <div className="space-y-8">
          {/* Pending approval */}
          <div>
            <div className="font-semibold text-gray-900 mb-3">Pending Approval {pendingApproval.length > 0 && `(${pendingApproval.length})`}</div>
            {pendingApproval.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">No pending requests.</div>
            ) : (
              <div className="space-y-3">
                {pendingApproval.map(req => (
                  <RequestCard key={req.id} req={req} actions={
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => approveRequest(req.id)}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{ background: 'var(--brand-color)' }}>
                        Approve
                      </button>
                      <button onClick={() => rejectRequest(req.id)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600">
                        Reject
                      </button>
                    </div>
                  } />
                ))}
              </div>
            )}
          </div>

          {/* Approved — awaiting preparation */}
          <div>
            <div className="font-semibold text-gray-900 mb-3">Approved! Awaiting Preparation {approvedAwaitingPrep.length > 0 && `(${approvedAwaitingPrep.length})`}</div>
            {approvedAwaitingPrep.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">Nothing awaiting preparation.</div>
            ) : (
              <div className="space-y-3">
                {approvedAwaitingPrep.map(req => (
                  <RequestCard key={req.id} req={req} actions={
                    <button onClick={() => markReady(req.id)}
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-bold shrink-0" style={{ background: '#8b5cf6' }}>
                      Mark Ready for Collection
                    </button>
                  } />
                ))}
              </div>
            )}
          </div>

          {/* Ready for collection */}
          <div>
            <div className="font-semibold text-gray-900 mb-3">Ready for Collection {readyForCollection.length > 0 && `(${readyForCollection.length})`}</div>
            {readyForCollection.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">Nothing ready for collection.</div>
            ) : (
              <div className="space-y-3">
                {readyForCollection.map(req => (
                  <div key={req.id}>
                    <RequestCard req={req} actions={
                      issuingId !== req.id ? (
                        <button onClick={() => startIssue(req)}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-bold shrink-0" style={{ background: '#10b981' }}>
                          Issue / Confirm Collection
                        </button>
                      ) : null
                    } />
                    {issuingId === req.id && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mt-2">
                        <div className="text-xs uppercase tracking-widest text-emerald-700 font-medium mb-3">Confirm Quantities Issued</div>
                        <div className="space-y-2 mb-3">
                          {(req.health_dispensing_items ?? []).map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3">
                              <div className="text-sm text-gray-700 flex-1">{item.health_supplies?.name}</div>
                              <input type="number" className={inputClass + ' max-w-[100px]'}
                                value={issueQuantities[item.id] ?? ''}
                                onChange={e => setIssueQuantities(prev => ({ ...prev, [item.id]: e.target.value }))} />
                              <div className="text-xs text-gray-400 w-16">{item.health_supplies?.unit_of_issue}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mb-3">
                          <label className={labelClass}>Collected By</label>
                          <select className={inputClass} value={collectedBy} onChange={e => setCollectedBy(e.target.value)}>
                            {facilityUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => confirmIssue(req)} disabled={saving}
                            className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#10b981' }}>
                            {saving ? 'Saving...' : 'Confirm Issue - Deduct Stock'}
                          </button>
                          <button onClick={() => setIssuingId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'usage' && <UsageLogManager facilityId={facilityId} currentUser={currentUser} />}
    </div>
  )
}