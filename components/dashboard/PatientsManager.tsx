'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Patient {
  id: string
  patient_number: string | null
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  phone: string | null
  email: string | null
  address: string | null
  blood_group: string | null
  genotype: string | null
  hmo_provider: string | null
  hmo_number: string | null
  outstanding_balance: number
  total_billed: number
  notes: string | null
}

interface Props {
  facilityId: string
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const GENOTYPES = ['AA', 'AS', 'SS', 'AC', 'SC']

function generatePatientNumber() {
  const ts = Date.now().toString().slice(-6)
  return `MP-${ts}`
}

export function PatientsManager({ facilityId }: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '', gender: '', phone: '', email: '',
    address: '', blood_group: '', genotype: '', hmo_provider: '', hmo_number: '', notes: '',
  })

  useEffect(() => { loadPatients() }, [])

  async function loadPatients() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('health_patients')
      .select('*')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false })
    setPatients(data ?? [])
    setLoading(false)
  }

  function resetForm() {
    setForm({
      first_name: '', last_name: '', date_of_birth: '', gender: '', phone: '', email: '',
      address: '', blood_group: '', genotype: '', hmo_provider: '', hmo_number: '', notes: '',
    })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(p: Patient) {
    setForm({
      first_name: p.first_name, last_name: p.last_name, date_of_birth: p.date_of_birth ?? '',
      gender: p.gender ?? '', phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '',
      blood_group: p.blood_group ?? '', genotype: p.genotype ?? '', hmo_provider: p.hmo_provider ?? '',
      hmo_number: p.hmo_number ?? '', notes: p.notes ?? '',
    })
    setEditingId(p.id)
    setShowForm(true)
    setSelectedPatient(null)
  }

  async function savePatient() {
    if (!form.first_name.trim() || !form.last_name.trim()) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      facility_id: facilityId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      blood_group: form.blood_group || null,
      genotype: form.genotype || null,
      hmo_provider: form.hmo_provider.trim() || null,
      hmo_number: form.hmo_number.trim() || null,
      notes: form.notes.trim() || null,
    }

    if (editingId) {
      await supabase.from('health_patients').update(payload).eq('id', editingId)
    } else {
      await supabase.from('health_patients').insert({ ...payload, patient_number: generatePatientNumber() })
    }

    await loadPatients()
    resetForm()
    setSaving(false)
  }

  function age(dob: string | null) {
    if (!dob) return null
    const d = new Date(dob)
    const diff = Date.now() - d.getTime()
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  }

  const filtered = patients.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      (p.patient_number ?? '').toLowerCase().includes(q)
    )
  })

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading patients...</div>

  // Patient detail view
  if (selectedPatient) {
    const p = selectedPatient
    return (
      <div>
        <button onClick={() => setSelectedPatient(null)} className="text-xs text-sky-600 hover:underline mb-4">&larr; Back to patients</button>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-2xl font-black text-gray-900">{p.first_name} {p.last_name}</div>
              <div className="text-xs text-gray-400 font-mono mt-1">{p.patient_number}</div>
            </div>
            <button onClick={() => startEdit(p)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-sky-300">
              Edit Patient
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Age</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{age(p.date_of_birth) ?? '-'}{age(p.date_of_birth) != null ? ' yrs' : ''}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Gender</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.gender ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Blood Group</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.blood_group ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Genotype</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.genotype ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Phone</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Email</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.email ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">HMO Provider</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.hmo_provider ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest">HMO Number</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">{p.hmo_number ?? '-'}</div>
            </div>
          </div>
          {p.address && (
            <div className="mt-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Address</div>
              <div className="text-sm text-gray-700 mt-1">{p.address}</div>
            </div>
          )}
          {p.notes && (
            <div className="mt-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Notes</div>
              <div className="text-sm text-gray-700 mt-1">{p.notes}</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Total Billed</div>
            <div className="text-2xl font-black text-gray-900">₦{p.total_billed.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Outstanding Balance</div>
            <div className="text-2xl font-black" style={{ color: p.outstanding_balance > 0 ? '#dc2626' : '#111827' }}>
              ₦{p.outstanding_balance.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Visit history and billing will appear here once a visit is recorded for this patient.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name, phone, or patient number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors w-72"
        />
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="px-4 py-2 rounded-xl text-white text-sm font-bold"
            style={{ background: '#0EA5E9' }}>
            + Register Patient
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6">
          <div className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Patient' : 'Register New Patient'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>First Name *</label>
              <input className={inputClass} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Last Name *</label>
              <input className={inputClass} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Date of Birth</label>
              <input type="date" className={inputClass} value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Gender</label>
              <select className={inputClass} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08012345678" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Blood Group</label>
              <select className={inputClass} value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Genotype</label>
              <select className={inputClass} value={form.genotype} onChange={e => setForm(f => ({ ...f, genotype: e.target.value }))}>
                <option value="">Select</option>
                {GENOTYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>HMO Provider</label>
              <input className={inputClass} value={form.hmo_provider} onChange={e => setForm(f => ({ ...f, hmo_provider: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>HMO Number</label>
              <input className={inputClass} value={form.hmo_number} onChange={e => setForm(f => ({ ...f, hmo_number: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className={labelClass}>Address</label>
            <input className={inputClass} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass + ' resize-none'} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={savePatient} disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              style={{ background: '#0EA5E9' }}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Register Patient'}
            </button>
            <button onClick={resetForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {patients.length === 0 ? 'No patients registered yet.' : 'No patients match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Patient', 'Patient No.', 'Phone', 'HMO', 'Outstanding'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPatient(p)}
                    className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.first_name} {p.last_name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.patient_number}</td>
                    <td className="px-4 py-3 text-gray-500">{p.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.hmo_provider ?? '-'}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: p.outstanding_balance > 0 ? '#dc2626' : '#111827' }}>
                      ₦{p.outstanding_balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}