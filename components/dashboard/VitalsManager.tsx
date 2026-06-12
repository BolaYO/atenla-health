'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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

export function VitalsManager({ facilityId, currentUser, onDataChange }: Props) {
  const [todayVisits, setTodayVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [recordingVisitId, setRecordingVisitId] = useState<string | null>(null)
  const [vitals, setVitals] = useState({
    bp_systolic: '', bp_diastolic: '', temperature: '', pulse: '',
    respiratory_rate: '', spo2: '', weight: '', height: '', notes: '',
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: visits } = await supabase.from('health_visits')
      .select('*, patient:patient_id(first_name, last_name, patient_number), health_vitals(*, recorder:recorded_by(name))')
      .eq('facility_id', facilityId)
      .eq('status', 'open')
      .eq('visit_date', today)
      .order('checked_in_at', { ascending: true })

    setTodayVisits(visits ?? [])
    setLoading(false)
  }

  function resetVitals() {
    setVitals({ bp_systolic: '', bp_diastolic: '', temperature: '', pulse: '', respiratory_rate: '', spo2: '', weight: '', height: '', notes: '' })
    setRecordingVisitId(null)
  }

  async function saveVitals(visit: any) {
    setSaving(true)
    const supabase = createClient()

    const bp = vitals.bp_systolic && vitals.bp_diastolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : null

    await supabase.from('health_vitals').insert({
      facility_id: facilityId,
      visit_id: visit.id,
      patient_id: visit.patient_id,
      blood_pressure: bp,
      temperature: vitals.temperature ? parseFloat(vitals.temperature) : null,
      pulse: vitals.pulse ? parseFloat(vitals.pulse) : null,
      respiratory_rate: vitals.respiratory_rate ? parseFloat(vitals.respiratory_rate) : null,
      spo2: vitals.spo2 ? parseFloat(vitals.spo2) : null,
      weight: vitals.weight ? parseFloat(vitals.weight) : null,
      height: vitals.height ? parseFloat(vitals.height) : null,
      notes: vitals.notes.trim() || null,
      recorded_by: currentUser.id,
    })

    await loadData()
    resetVitals()
    setSaving(false)
    onDataChange?.()
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading vitals...</div>

  return (
    <div>
      <div className="font-semibold text-gray-900 mb-1">Today's Patients</div>
      <div className="text-xs text-gray-400 mb-4">Everyone checked in today. Record vitals for anyone waiting, repeat checks (e.g. before and after a procedure) are fine, each is logged with its own timestamp.</div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {todayVisits.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No patients checked in yet today.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todayVisits.map(v => (
              <div key={v.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{v.patient?.first_name} {v.patient?.last_name}</span>
                      {v.patient?.patient_number && <span className="text-xs text-gray-400">({v.patient.patient_number})</span>}
                    </div>
                    {v.chief_complaint && <div className="text-xs text-gray-400 mt-1">{v.chief_complaint}</div>}
                  </div>
                  {recordingVisitId !== v.id && (
                    <button onClick={() => { setRecordingVisitId(v.id); resetVitals(); setRecordingVisitId(v.id) }}
                      className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand-color)' }}>
                      Record Vitals
                    </button>
                  )}
                </div>

                {(v.health_vitals ?? []).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {v.health_vitals.map((vt: any) => (
                      <div key={vt.id} className="text-xs text-gray-400">
                        {fmtTime(vt.recorded_at)} · {vt.recorder?.name ?? ''} -
                        {vt.blood_pressure && ` BP ${vt.blood_pressure}`}
                        {vt.temperature && ` Temp ${vt.temperature}°C`}
                        {vt.pulse && ` Pulse ${vt.pulse}bpm`}
                        {vt.respiratory_rate && ` RR ${vt.respiratory_rate}`}
                        {vt.spo2 && ` SpO2 ${vt.spo2}%`}
                        {vt.weight && ` Wt ${vt.weight}kg`}
                        {vt.height && ` Ht ${vt.height}cm`}
                        {vt.notes && ` - ${vt.notes}`}
                      </div>
                    ))}
                  </div>
                )}

                {recordingVisitId === v.id && (
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="col-span-2 sm:col-span-1 flex gap-1">
                        <input type="number" className={inputClass} placeholder="BP Sys" value={vitals.bp_systolic} onChange={e => setVitals(s => ({ ...s, bp_systolic: e.target.value }))} />
                        <input type="number" className={inputClass} placeholder="BP Dia" value={vitals.bp_diastolic} onChange={e => setVitals(s => ({ ...s, bp_diastolic: e.target.value }))} />
                      </div>
                      <input type="number" className={inputClass} placeholder="Temp (°C)" value={vitals.temperature} onChange={e => setVitals(s => ({ ...s, temperature: e.target.value }))} />
                      <input type="number" className={inputClass} placeholder="Pulse (bpm)" value={vitals.pulse} onChange={e => setVitals(s => ({ ...s, pulse: e.target.value }))} />
                      <input type="number" className={inputClass} placeholder="Resp. Rate" value={vitals.respiratory_rate} onChange={e => setVitals(s => ({ ...s, respiratory_rate: e.target.value }))} />
                      <input type="number" className={inputClass} placeholder="SpO2 (%)" value={vitals.spo2} onChange={e => setVitals(s => ({ ...s, spo2: e.target.value }))} />
                      <input type="number" className={inputClass} placeholder="Weight (kg)" value={vitals.weight} onChange={e => setVitals(s => ({ ...s, weight: e.target.value }))} />
                      <input type="number" className={inputClass} placeholder="Height (cm)" value={vitals.height} onChange={e => setVitals(s => ({ ...s, height: e.target.value }))} />
                    </div>
                    <input className={inputClass + ' mt-2'} placeholder="Notes (optional)" value={vitals.notes} onChange={e => setVitals(s => ({ ...s, notes: e.target.value }))} />
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => saveVitals(v)} disabled={saving}
                        className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
                        {saving ? 'Saving...' : 'Save Vitals'}
                      </button>
                      <button onClick={resetVitals} className="px-4 py-2 rounded-xl border border-gray-200 text-xs text-gray-600">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}