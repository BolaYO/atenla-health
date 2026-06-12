'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Service {
  id: string
  name: string
  category: string | null
  department: string | null
  price: number
  hmo_price: number | null
  nhis_price: number | null
  is_active: boolean
}

interface ProcedureRef {
  id: string
  name: string
  department: string | null
}

interface Props {
  facilityId: string
}

const DEPARTMENTS = ['Lab', 'Pharmacy', 'Nursing', 'Dental', 'General', 'Specialist']
const CATEGORIES = ['Consultation', 'Lab Test', 'Procedure', 'Dental', 'Pharmacy', 'Other']

export function ServicesManager({ facilityId }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [procedures, setProcedures] = useState<ProcedureRef[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', category: '', department: '', price: '', hmo_price: '', nhis_price: '',
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: svc }, { data: proc }] = await Promise.all([
      supabase.from('health_services').select('*').eq('facility_id', facilityId).order('department').order('name'),
      supabase.from('health_procedures').select('id, name, department').eq('facility_id', facilityId).order('name'),
    ])
    setServices(svc ?? [])
    setProcedures(proc ?? [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', category: '', department: '', price: '', hmo_price: '', nhis_price: '' })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(s: Service) {
    setForm({
      name: s.name, category: s.category ?? '', department: s.department ?? '',
      price: String(s.price), hmo_price: s.hmo_price != null ? String(s.hmo_price) : '',
      nhis_price: s.nhis_price != null ? String(s.nhis_price) : '',
    })
    setEditingId(s.id)
    setShowForm(true)
  }

  function startFromProcedure(p: ProcedureRef) {
    setForm({ name: p.name, category: 'Procedure', department: p.department ?? '', price: '', hmo_price: '', nhis_price: '' })
    setEditingId(null)
    setShowForm(true)
  }

  async function saveService() {
    if (!form.name.trim() || !form.price) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      facility_id: facilityId,
      name: form.name.trim(),
      category: form.category || null,
      department: form.department || null,
      price: parseFloat(form.price) || 0,
      hmo_price: form.hmo_price ? parseFloat(form.hmo_price) : null,
      nhis_price: form.nhis_price ? parseFloat(form.nhis_price) : null,
    }

    if (editingId) {
      await supabase.from('health_services').update(payload).eq('id', editingId)
    } else {
      await supabase.from('health_services').insert(payload)
    }

    await loadData()
    resetForm()
    setSaving(false)
  }

  async function deactivate(id: string) {
    if (!confirm('Remove this service from the catalogue?')) return
    const supabase = createClient()
    await supabase.from('health_services').update({ is_active: false }).eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  // Procedures that don't yet have a matching service
  const serviceNames = new Set(services.map(s => s.name.toLowerCase()))
  const unpriced = procedures.filter(p => !serviceNames.has(p.name.toLowerCase()))

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading services...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-gray-900">Services &amp; Pricing</div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="px-4 py-2 rounded-xl text-white text-sm font-bold" style={{ background: 'var(--brand-color)' }}>
            + Add Service
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6">
          <div className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Service' : 'New Service'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Service Name *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. General Consultation, Malaria Test" />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Department</label>
              <select className={inputClass} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelClass}>Standard Price (₦) *</label>
              <input type="number" className={inputClass} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>HMO Price (₦)</label>
              <input type="number" className={inputClass} value={form.hmo_price} onChange={e => setForm(f => ({ ...f, hmo_price: e.target.value }))}
                placeholder="Leave blank if same as standard" />
            </div>
            <div>
              <label className={labelClass}>NHIS Price (₦)</label>
              <input type="number" className={inputClass} value={form.nhis_price} onChange={e => setForm(f => ({ ...f, nhis_price: e.target.value }))}
                placeholder="Leave blank if same as standard" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveService} disabled={saving || !form.name.trim() || !form.price}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}
            </button>
            <button onClick={resetForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Suggestions from procedures preset */}
      {unpriced.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6">
          <div className="text-xs uppercase tracking-widest text-amber-700 font-medium mb-2">
            Procedures without a price yet
          </div>
          <div className="flex flex-wrap gap-2">
            {unpriced.map(p => (
              <button key={p.id} onClick={() => startFromProcedure(p)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 font-medium hover:border-amber-400">
                + Price "{p.name}"{p.department ? ` (${p.department})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Services table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {services.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No services priced yet. Add a service or price one of the suggested procedures above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Service', 'Category', 'Department', 'Standard', 'HMO', 'NHIS', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.category ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.department ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">₦{s.price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500">{s.hmo_price != null ? `₦${s.hmo_price.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.nhis_price != null ? `₦${s.nhis_price.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(s)} className="text-xs text-sky-600 hover:underline">Edit</button>
                        <button onClick={() => deactivate(s.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                      </div>
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