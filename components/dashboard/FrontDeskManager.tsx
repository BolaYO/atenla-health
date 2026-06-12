'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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

interface Props {
  facilityId: string
  currentUser: FacilityUserRef
  onDataChange?: () => void
}

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
}

export function FrontDeskManager({ facilityId, currentUser, onDataChange }: Props) {
  const [patients, setPatients] = useState<PatientRef[]>([])
  const [todayVisits, setTodayVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Check-in form
  const [patientId, setPatientId] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [newPatient, setNewPatient] = useState({ first_name: '', last_name: '', phone: '' })
  const [chiefComplaint, setChiefComplaint] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const [{ data: pats }, { data: visits }] = await Promise.all([
      supabase.from('health_patients').select('id, first_name, last_name, patient_number, phone').eq('facility_id', facilityId).order('first_name'),
      supabase.from('health_visits')
        .select('*, patient:patient_id(first_name, last_name, patient_number), checker:checked_in_by(name), health_vitals(*)')
        .eq('facility_id', facilityId)
        .eq('status', 'open')
        .eq('visit_date', today)
        .order('checked_in_at', { ascending: false }),
    ])
    setPatients(pats ?? [])
    setTodayVisits(visits ?? [])
    setLoading(false)
  }

  function resetForm() {
    setPatientId(''); setPatientSearch(''); setShowNewPatient(false)
    setNewPatient({ first_name: '', last_name: '', phone: '' })
    setChiefComplaint('')
  }

  async function checkIn() {
    if (!showNewPatient && !patientId) return
    if (showNewPatient && (!newPatient.first_name.trim() || !newPatient.last_name.trim())) return

    setSaving(true)
    const supabase = createClient()

    let finalPatientId = patientId
    let finalPatientName: string | null = null

    if (showNewPatient) {
      const { data: newPat } = await supabase.from('health_patients').insert({
        facility_id: facilityId,
        first_name: newPatient.first_name.trim(),
        last_name: newPatient.last_name.trim(),
        phone: newPatient.phone.trim() || null,
        patient_number: `MP-${Date.now().toString().slice(-6)}`,
      }).select().single()
      if (newPat) {
        finalPatientId = newPat.id
        finalPatientName = `${newPat.first_name} ${newPat.last_name}`
        setPatients(prev => [...prev, newPat])
      }
    } else {
      const p = patients.find(pt => pt.id === patientId)
      finalPatientName = p ? `${p.first_name} ${p.last_name}` : null
    }

    if (!finalPatientId) { setSaving(false); return }

    // Find or create today's open visit for this patient — same logic
    // Usage Log relies on, so anything logged later attaches to this visit.
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('health_visits')
      .select('id')
      .eq('facility_id', facilityId)
      .eq('patient_id', finalPatientId)
      .eq('status', 'open')
      .eq('visit_date', today)
      .maybeSingle()

    let visitId = existing?.id

    if (!visitId) {
      const { data: created } = await supabase.from('health_visits').insert({
        facility_id: facilityId,
        patient_id: finalPatientId,
        patient_name: finalPatientName,
        department: 'General',
        visit_date: today,
        status: 'open',
        total_amount: 0,
        amount_paid: 0,
        outstanding: 0,
        checked_in_at: new Date().toISOString(),
        checked_in_by: currentUser.id,
        chief_complaint: chiefComplaint.trim() || null,
      }).select().single()
      visitId = created?.id
    } else {
      // Already has an open visit (e.g. a procedure was logged before check-in) —
      // just record that front desk has now checked them in too.
      await supabase.from('health_visits').update({
        checked_in_at: new Date().toISOString(),
        checked_in_by: currentUser.id,
        chief_complaint: chiefComplaint.trim() || null,
      }).eq('id', visitId)
    }

    await loadData()
    resetForm()
    setSaving(false)
    onDataChange?.()
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading front desk...</div>

  return (
    <div>
      <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6 max-w-2xl">
        <div className="font-semibold text-gray-900 mb-1">Check In Patient</div>
        <div className="text-xs text-gray-400 mb-4">Register the patient's arrival and what they're here for. Vitals are taken by Nursing while the patient waits.</div>

        <div className="mb-4">
          <label className={labelClass}>Patient *</label>
          {!showNewPatient ? (
            <div>
              <input className={inputClass + ' mb-2'} placeholder="Search patient by name or phone..."
                value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
              <select className={inputClass} value={patientId} onChange={e => setPatientId(e.target.value)}>
                <option value="">Select patient</option>
                {patients
                  .filter(p => !patientSearch || `${p.first_name} ${p.last_name} ${p.phone ?? ''} ${p.patient_number ?? ''}`.toLowerCase().includes(patientSearch.toLowerCase()))
                  .map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} {p.patient_number ? `(${p.patient_number})` : ''}</option>)}
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
                Cancel ; select existing patient instead
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className={labelClass}>Reason for Visit</label>
          <input className={inputClass} placeholder="e.g. Fever and headache for 3 days, follow-up dressing change..."
            value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} />
        </div>

        <button onClick={checkIn} disabled={
            saving ||
            (!showNewPatient && !patientId) ||
            (showNewPatient && (!newPatient.first_name.trim() || !newPatient.last_name.trim()))
          }
          className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
          {saving ? 'Checking in...' : 'Check In'}
        </button>
      </div>

      <div>
        <div className="font-semibold text-gray-900 mb-3">Checked In Today {todayVisits.length > 0 && `(${todayVisits.length})`}</div>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {todayVisits.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No patients checked in yet today.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayVisits.map(v => (
                <div key={v.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{v.patient?.first_name} {v.patient?.last_name}</span>
                      {v.patient?.patient_number && <span className="text-xs text-gray-400">({v.patient.patient_number})</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {v.checked_in_at ? `Checked in ${fmtTime(v.checked_in_at)}` : 'Awaiting check-in'}{v.checker?.name ? ` · ${v.checker.name}` : ''}
                    </span>
                  </div>
                  {v.chief_complaint && <div className="text-xs text-gray-400 mt-1">{v.chief_complaint}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}