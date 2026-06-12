'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PresetSelect } from './PresetSelect'

interface DeptStockItem {
  supply_id: string
  supply_name: string
  unit_of_issue: string
  quantity: number
}

interface PatientRef {
  id: string
  first_name: string
  last_name: string
  patient_number: string | null
  phone: string | null
}

interface FacilityUserRef {
  id: string
  name: string
  role: string
}

interface ConsumableLine {
  supply_id: string
  quantity: string
}

interface Props {
  facilityId: string
  currentUser: FacilityUserRef
}

const DEPARTMENTS = ['Lab', 'Pharmacy', 'Nursing', 'Dental', 'General', 'Specialist']

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

const USAGE_TYPES = [
  { value: 'patient_specific', label: 'Patient-Specific' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'spillage_damage', label: 'Spillage / Damage' },
]

const USAGE_TYPE_COLORS: Record<string, string> = {
  patient_specific: 'bg-sky-100 text-sky-700',
  procedure: 'bg-purple-100 text-purple-700',
  emergency: 'bg-red-100 text-red-600',
  spillage_damage: 'bg-amber-100 text-amber-700',
}

const USAGE_TYPE_LABELS: Record<string, string> = {
  patient_specific: 'Patient-Specific',
  procedure: 'Procedure',
  emergency: 'Emergency',
  spillage_damage: 'Spillage / Damage',
}

const emptyConsumable = (): ConsumableLine => ({ supply_id: '', quantity: '' })

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function UsageLogManager({ facilityId, currentUser }: Props) {
  const [department, setDepartment] = useState('')
  const [deptStock, setDeptStock] = useState<DeptStockItem[]>([])
  const [patients, setPatients] = useState<PatientRef[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state — used by patient_specific / emergency / spillage_damage (single item)
  const [supplyId, setSupplyId] = useState('')
  const [quantityUsed, setQuantityUsed] = useState('')
  const [usageType, setUsageType] = useState('patient_specific')

  // Shared patient selection — patient_specific and procedure both need a patient
  const [patientId, setPatientId] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [newPatient, setNewPatient] = useState({ first_name: '', last_name: '', phone: '' })

  const [procedureName, setProcedureName] = useState('')
  const [emergencyNote, setEmergencyNote] = useState('')
  const [damageReason, setDamageReason] = useState('')
  const [notes, setNotes] = useState('')

  // Procedure mode — multiple consumables for a single procedure event
  const [consumables, setConsumables] = useState<ConsumableLine[]>([emptyConsumable()])

  useEffect(() => { loadStaticData() }, [])
  useEffect(() => { if (department) loadDepartmentData() }, [department])

  async function loadStaticData() {
    setLoading(true)
    const supabase = createClient()
    const { data: pats } = await supabase.from('health_patients').select('id, first_name, last_name, patient_number, phone').eq('facility_id', facilityId).order('first_name')
    setPatients(pats ?? [])
    setLoading(false)
  }

  async function loadDepartmentData() {
    const supabase = createClient()
    const [{ data: stock }, { data: logData }] = await Promise.all([
      supabase.from('health_department_stock').select('quantity, supply_id, health_supplies(name, unit_of_issue)').eq('facility_id', facilityId).eq('department', department),
      supabase.from('health_usage_logs')
        .select('*, health_supplies(name, unit_of_issue), patient:patient_id(first_name, last_name), procedure:procedure_id(name), logger:logged_by(name)')
        .eq('facility_id', facilityId).eq('department', department)
        .order('created_at', { ascending: false }).limit(60),
    ])
    setDeptStock((stock ?? []).map((s: any) => ({
      supply_id: s.supply_id,
      supply_name: s.health_supplies?.name ?? 'Item',
      unit_of_issue: s.health_supplies?.unit_of_issue ?? 'unit',
      quantity: s.quantity,
    })).filter((s: any) => s.quantity > 0))
    setLogs(logData ?? [])
  }

  function resetForm() {
    setSupplyId(''); setQuantityUsed(''); setUsageType('patient_specific')
    setPatientId(''); setPatientSearch(''); setShowNewPatient(false)
    setNewPatient({ first_name: '', last_name: '', phone: '' })
    setProcedureName(''); setEmergencyNote(''); setDamageReason(''); setNotes('')
    setConsumables([emptyConsumable()])
  }

  function updateConsumable(idx: number, field: keyof ConsumableLine, value: string) {
    setConsumables(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }
  function addConsumable() { setConsumables(prev => [...prev, emptyConsumable()]) }
  function removeConsumable(idx: number) { setConsumables(prev => prev.filter((_, i) => i !== idx)) }

  async function resolvePatient(supabase: ReturnType<typeof createClient>): Promise<{ id: string | null; name: string | null }> {
    if (showNewPatient) {
      const { data: newPat } = await supabase.from('health_patients').insert({
        facility_id: facilityId,
        first_name: newPatient.first_name.trim(),
        last_name: newPatient.last_name.trim(),
        phone: newPatient.phone.trim() || null,
        patient_number: `MP-${Date.now().toString().slice(-6)}`,
      }).select().single()
      if (newPat) {
        setPatients(prev => [...prev, newPat])
        return { id: newPat.id, name: `${newPat.first_name} ${newPat.last_name}` }
      }
      return { id: null, name: null }
    }
    const p = patients.find(pt => pt.id === patientId)
    return { id: patientId, name: p ? `${p.first_name} ${p.last_name}` : null }
  }

  async function resolveProcedureId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
    const { data: existing } = await supabase.from('health_procedures').select('id').eq('facility_id', facilityId).eq('name', procedureName.trim()).maybeSingle()
    if (existing) return existing.id
    const { data: created } = await supabase.from('health_procedures').insert({ facility_id: facilityId, name: procedureName.trim(), department }).select().single()
    return created?.id ?? null
  }

  // Find today's open visit for this patient, or create one
  async function findOrCreateOpenVisit(supabase: ReturnType<typeof createClient>, finalPatientId: string, finalPatientName: string | null): Promise<string | null> {
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('health_visits')
      .select('id')
      .eq('facility_id', facilityId)
      .eq('patient_id', finalPatientId)
      .eq('status', 'open')
      .eq('visit_date', today)
      .maybeSingle()

    if (existing) return existing.id

    const { data: created } = await supabase.from('health_visits').insert({
      facility_id: facilityId,
      patient_id: finalPatientId,
      patient_name: finalPatientName,
      department,
      visit_date: today,
      status: 'open',
      total_amount: 0,
      amount_paid: 0,
      outstanding: 0,
    }).select().single()

    return created?.id ?? null
  }

  async function submitLog() {
    setSaving(true)
    const supabase = createClient()

    if (usageType === 'procedure') {
      const validConsumables = consumables.filter(c => c.supply_id && c.quantity)

      const { id: finalPatientId, name: finalPatientName } = await resolvePatient(supabase)
      if (!finalPatientId) { setSaving(false); return }

      const procedureId = await resolveProcedureId(supabase)
      const visitId = await findOrCreateOpenVisit(supabase, finalPatientId, finalPatientName)
      const procedureInstanceId = crypto.randomUUID()

      type UsageLogRow = {
        facility_id: string
        department: string
        supply_id: string | null
        quantity_used: number
        usage_type: string
        patient_id: string
        patient_name: string | null
        procedure_id: string | null
        procedure_name: string
        visit_id: string | null
        procedure_instance_id: string
        logged_by: string
        notes: string | null
      }

      // Always record the procedure event itself, even with zero consumables logged,
      // so it counts toward billing reconciliation.
      const rowsToInsert: UsageLogRow[] = validConsumables.length > 0
        ? validConsumables.map(c => ({
            facility_id: facilityId,
            department,
            supply_id: c.supply_id,
            quantity_used: parseFloat(c.quantity),
            usage_type: 'procedure',
            patient_id: finalPatientId,
            patient_name: finalPatientName,
            procedure_id: procedureId,
            procedure_name: procedureName.trim(),
            visit_id: visitId,
            procedure_instance_id: procedureInstanceId,
            logged_by: currentUser.id,
            notes: notes.trim() || null,
          }))
        : [{
            facility_id: facilityId,
            department,
            supply_id: null,
            quantity_used: 0,
            usage_type: 'procedure',
            patient_id: finalPatientId,
            patient_name: finalPatientName,
            procedure_id: procedureId,
            procedure_name: procedureName.trim(),
            visit_id: visitId,
            procedure_instance_id: procedureInstanceId,
            logged_by: currentUser.id,
            notes: notes.trim() || null,
          }]

      for (const row of rowsToInsert) {
        await supabase.from('health_usage_logs').insert(row)
      }
    } else {
      let finalPatientId: string | null = null
      let finalPatientName: string | null = null

      if (usageType === 'patient_specific') {
        const resolved = await resolvePatient(supabase)
        finalPatientId = resolved.id
        finalPatientName = resolved.name
      }

      await supabase.from('health_usage_logs').insert({
        facility_id: facilityId,
        department,
        supply_id: supplyId,
        quantity_used: parseFloat(quantityUsed),
        usage_type: usageType,
        patient_id: finalPatientId,
        patient_name: finalPatientName,
        emergency_note: usageType === 'emergency' ? emergencyNote.trim() : null,
        damage_reason: usageType === 'spillage_damage' ? damageReason.trim() : null,
        logged_by: currentUser.id,
        notes: notes.trim() || null,
      })
    }

    await loadDepartmentData()
    resetForm()
    setSaving(false)
  }

  const spillageCount = logs.filter(l => l.usage_type === 'spillage_damage').length
  const spillageRatio = logs.length > 0 ? Math.round((spillageCount / logs.length) * 100) : 0

  // Group procedure-type logs by procedure_instance_id for display
  const displayGroups: { key: string; logs: any[] }[] = []
  const seenInstances = new Set<string>()
  for (const log of logs) {
    if (log.usage_type === 'procedure' && log.procedure_instance_id) {
      if (seenInstances.has(log.procedure_instance_id)) continue
      seenInstances.add(log.procedure_instance_id)
      displayGroups.push({
        key: log.procedure_instance_id,
        logs: logs.filter(l => l.procedure_instance_id === log.procedure_instance_id),
      })
    } else {
      displayGroups.push({ key: log.id, logs: [log] })
    }
  }
  // Re-sort groups by their most recent log's created_at
  displayGroups.sort((a, b) => new Date(b.logs[0].created_at).getTime() - new Date(a.logs[0].created_at).getTime())

  const patientFilter = (p: PatientRef) => !patientSearch || `${p.first_name} ${p.last_name} ${p.phone ?? ''} ${p.patient_number ?? ''}`.toLowerCase().includes(patientSearch.toLowerCase())

  const canSubmit = (() => {
    if (saving) return false
    if (usageType === 'patient_specific') {
      if (!supplyId || !quantityUsed) return false
      if (!showNewPatient && !patientId) return false
      if (showNewPatient && (!newPatient.first_name.trim() || !newPatient.last_name.trim())) return false
      return true
    }
    if (usageType === 'procedure') {
      if (!procedureName.trim()) return false
      if (!showNewPatient && !patientId) return false
      if (showNewPatient && (!newPatient.first_name.trim() || !newPatient.last_name.trim())) return false
      return true
    }
    if (usageType === 'emergency') return !!supplyId && !!quantityUsed && !!emergencyNote.trim()
    if (usageType === 'spillage_damage') return !!supplyId && !!quantityUsed && !!damageReason.trim()
    return false
  })()

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading usage log...</div>

  return (
    <div>
      <div className="mb-4">
        <label className={labelClass}>Department</label>
        <select className={inputClass + ' max-w-xs'} value={department} onChange={e => setDepartment(e.target.value)}>
          <option value="">Select department</option>
          {departmentsForRole(currentUser.role).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {!department ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Select a department to log usage and view its current holding stock.
        </div>
      ) : (
        <>
          {/* Spillage/damage stat */}
          {logs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Logged Today &amp; Recent</div>
                <div className="text-2xl font-black text-gray-900">{logs.length}</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Spillage / Damage Entries</div>
                <div className="text-2xl font-black" style={{ color: spillageCount > 0 ? '#dc2626' : '#111827' }}>{spillageCount}</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Spillage / Damage Rate</div>
                <div className="text-2xl font-black" style={{ color: spillageRatio > 15 ? '#dc2626' : '#111827' }}>{spillageRatio}%</div>
                {spillageRatio > 15 && <div className="text-xs text-red-500 mt-1">Higher than usual, may warrant review</div>}
              </div>
            </div>
          )}

          {/* Department stock available */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            <div className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-2">{department} - Current Holding Stock</div>
            {deptStock.length === 0 ? (
              <div className="text-sm text-gray-400">No stock currently held by this department. Submit a Stock Request first.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {deptStock.map(s => (
                  <span key={s.supply_id} className="text-xs px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                    {s.supply_name}: <span className="font-semibold text-gray-900">{s.quantity.toLocaleString()} {s.unit_of_issue}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Log usage form */}
          {deptStock.length > 0 && (
            <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6">
              <div className="font-semibold text-gray-900 mb-4">Log Usage</div>

              <div className="mb-4">
                <label className={labelClass}>Reason</label>
                <div className="flex gap-2 flex-wrap">
                  {USAGE_TYPES.map(t => (
                    <button key={t.value} onClick={() => setUsageType(t.value)}
                      className={'px-3 py-2 rounded-xl text-sm font-semibold transition-colors ' + (usageType === t.value ? 'text-white' : 'bg-gray-100 text-gray-600')}
                      style={usageType === t.value ? { background: t.value === 'spillage_damage' ? '#f59e0b' : t.value === 'emergency' ? '#dc2626' : '#0EA5E9' } : undefined}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single-item form: patient-specific / emergency / spillage */}
              {usageType !== 'procedure' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Item</label>
                    <select className={inputClass} value={supplyId} onChange={e => setSupplyId(e.target.value)}>
                      <option value="">Select item</option>
                      {deptStock.map(s => <option key={s.supply_id} value={s.supply_id}>{s.supply_name} ({s.quantity} {s.unit_of_issue} available)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Quantity Used</label>
                    <input type="number" className={inputClass} value={quantityUsed} onChange={e => setQuantityUsed(e.target.value)}
                      placeholder={deptStock.find(s => s.supply_id === supplyId)?.unit_of_issue ?? ''} />
                  </div>
                </div>
              )}

              {/* Procedure mode: procedure + patient + multi-item consumables */}
              {usageType === 'procedure' && (
                <div className="mb-4 bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <label className={labelClass}>Procedure / Test</label>
                  <PresetSelect facilityId={facilityId} table="health_procedures"
                    value={procedureName} onChange={setProcedureName}
                    extra={{ department: department || null }}
                    placeholder="Select procedure or test" className={inputClass} />
                </div>
              )}

              {(usageType === 'patient_specific' || usageType === 'procedure') && (
                <div className="mb-4 bg-sky-50 border border-sky-100 rounded-xl p-4">
                  <label className={labelClass}>Patient</label>
                  {!showNewPatient ? (
                    <div>
                      <input className={inputClass + ' mb-2'} placeholder="Search patient by name or phone..."
                        value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
                      <select className={inputClass} value={patientId} onChange={e => setPatientId(e.target.value)}>
                        <option value="">Select patient</option>
                        {patients.filter(patientFilter).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} {p.patient_number ? `(${p.patient_number})` : ''}</option>)}
                      </select>
                      <button onClick={() => { setShowNewPatient(true); setPatientId('') }}
                        className="mt-2 text-xs text-sky-600 font-semibold hover:underline">
                        + Register a new patient
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <input className={inputClass} placeholder="First name" value={newPatient.first_name}
                          onChange={e => setNewPatient(p => ({ ...p, first_name: e.target.value }))} />
                        <input className={inputClass} placeholder="Last name" value={newPatient.last_name}
                          onChange={e => setNewPatient(p => ({ ...p, last_name: e.target.value }))} />
                        <input className={inputClass} placeholder="Phone (optional)" value={newPatient.phone}
                          onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <button onClick={() => setShowNewPatient(false)} className="text-xs text-gray-500 hover:underline">
                        Cancel - select existing patient instead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {usageType === 'procedure' && (
                <div className="mb-4">
                  <label className={labelClass}>Consumables Used (internal audit ; optional but recommended)</label>
                  <div className="text-xs text-gray-400 mb-2">Everything used to carry out this procedure ; gloves, gauze, iodine, thread, etc. These won't appear on the patient's bill; the procedure itself is what's billed.</div>
                  <div className="space-y-2">
                    {consumables.map((c, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <select className={inputClass} value={c.supply_id} onChange={e => updateConsumable(idx, 'supply_id', e.target.value)}>
                          <option value="">Select item</option>
                          {deptStock.map(s => <option key={s.supply_id} value={s.supply_id}>{s.supply_name} ({s.quantity} {s.unit_of_issue} available)</option>)}
                        </select>
                        <input type="number" className={inputClass + ' max-w-30'} placeholder="Qty"
                          value={c.quantity} onChange={e => updateConsumable(idx, 'quantity', e.target.value)} />
                        <button onClick={() => removeConsumable(idx)} className="text-xs text-red-500 hover:underline pt-3 whitespace-nowrap">Remove</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={addConsumable} className="mt-2 text-xs text-sky-600 font-semibold hover:underline">+ Add another item</button>
                </div>
              )}

              {usageType === 'emergency' && (
                <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-4">
                  <label className={labelClass}>What is the emergency? *</label>
                  <textarea className={inputClass + ' resize-none'} rows={2} value={emergencyNote}
                    onChange={e => setEmergencyNote(e.target.value)}
                    placeholder="Briefly describe the emergency this was used for" />
                </div>
              )}

              {usageType === 'spillage_damage' && (
                <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <label className={labelClass}>What happened? *</label>
                  <textarea className={inputClass + ' resize-none'} rows={2} value={damageReason}
                    onChange={e => setDamageReason(e.target.value)}
                    placeholder="e.g. bottle dropped and broke, contaminated and discarded, expired before use" />
                </div>
              )}

              <div className="mb-4">
                <label className={labelClass}>Additional Notes (optional)</label>
                <input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <button onClick={submitLog} disabled={!canSubmit}
                className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                style={{ background: '#0EA5E9' }}>
                {saving ? 'Logging...' : 'Log Usage'}
              </button>
            </div>
          )}

          {/* Recent logs */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-xs uppercase tracking-widest text-gray-400 font-medium">Recent Usage - {department}</div>
            {displayGroups.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No usage logged yet for this department.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {displayGroups.map(group => {
                  const first = group.logs[0]
                  if (first.usage_type === 'procedure') {
                    return (
                      <div key={group.key} className="px-4 py-3 text-sm">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + USAGE_TYPE_COLORS.procedure}>Procedure</span>
                            <span className="font-medium text-gray-900">{first.procedure?.name ?? first.procedure_name}</span>
                            {first.patient?.first_name && <span className="text-gray-500">- {first.patient.first_name} {first.patient.last_name}</span>}
                          </div>
                          <span className="text-xs text-gray-400">{fmtDateTime(first.created_at)} · {first.logger?.name}</span>
                        </div>
                        {group.logs.some(l => l.health_supplies) && (
                          <div className="text-xs text-gray-400 mt-1">
                            Consumables: {group.logs.filter(l => l.health_supplies).map(l => `${l.health_supplies.name} x${l.quantity_used}`).join(', ')}
                          </div>
                        )}
                        {first.notes && <div className="text-xs text-gray-400 mt-1 italic">{first.notes}</div>}
                      </div>
                    )
                  }
                  return (
                    <div key={group.key} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{first.health_supplies?.name}</span>
                          <span className="text-gray-500">- {first.quantity_used} {first.health_supplies?.unit_of_issue}</span>
                          <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + (USAGE_TYPE_COLORS[first.usage_type] ?? '')}>
                            {USAGE_TYPE_LABELS[first.usage_type] ?? first.usage_type}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{fmtDateTime(first.created_at)} · {first.logger?.name}</span>
                      </div>
                      {first.patient?.first_name && <div className="text-xs text-gray-400 mt-1">Patient: {first.patient.first_name} {first.patient.last_name}</div>}
                      {first.emergency_note && <div className="text-xs text-red-500 mt-1">{first.emergency_note}</div>}
                      {first.damage_reason && <div className="text-xs text-amber-600 mt-1">{first.damage_reason}</div>}
                      {first.notes && <div className="text-xs text-gray-400 mt-1 italic">{first.notes}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}