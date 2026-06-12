'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Supplier {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  credit_terms_days: number
  outstanding_balance: number
  total_purchased: number
  notes: string | null
  is_active: boolean
}

interface Props {
  facilityId: string
}

export function SuppliersManager({ facilityId }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', contact_name: '', phone: '', email: '', address: '', credit_terms_days: '0', notes: '',
  })

  useEffect(() => { loadSuppliers() }, [])

  async function loadSuppliers() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('health_suppliers')
      .select('*')
      .eq('facility_id', facilityId)
      .eq('is_active', true)
      .order('name')
    setSuppliers(data ?? [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', contact_name: '', phone: '', email: '', address: '', credit_terms_days: '0', notes: '' })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(s: Supplier) {
    setForm({
      name: s.name, contact_name: s.contact_name ?? '', phone: s.phone ?? '', email: s.email ?? '',
      address: s.address ?? '', credit_terms_days: String(s.credit_terms_days), notes: s.notes ?? '',
    })
    setEditingId(s.id)
    setShowForm(true)
  }

  async function saveSupplier() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      facility_id: facilityId,
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      credit_terms_days: parseInt(form.credit_terms_days) || 0,
      notes: form.notes.trim() || null,
    }

    if (editingId) {
      await supabase.from('health_suppliers').update(payload).eq('id', editingId)
    } else {
      await supabase.from('health_suppliers').insert(payload)
    }

    await loadSuppliers()
    resetForm()
    setSaving(false)
  }

  async function deactivate(id: string) {
    if (!confirm('Remove this supplier?')) return
    const supabase = createClient()
    await supabase.from('health_suppliers').update({ is_active: false }).eq('id', id)
    setSuppliers(prev => prev.filter(s => s.id !== id))
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading suppliers...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-gray-900">Suppliers</div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
          style={{ background: '#0EA5E9' }}>
          + Add Supplier
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Supplier Name *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Contact Person</label>
              <input className={inputClass} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input className={inputClass} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Credit Terms (days)</label>
              <input type="number" className={inputClass} value={form.credit_terms_days} onChange={e => setForm(f => ({ ...f, credit_terms_days: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveSupplier} disabled={saving || !form.name.trim()}
              className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              style={{ background: '#0EA5E9' }}>
              {saving ? 'Saving...' : editingId ? 'Save' : 'Add Supplier'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No suppliers yet. Add your first supplier.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Supplier', 'Contact', 'Credit Terms', 'Total Purchased', 'Outstanding', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.contact_name ?? '-S'}
                      {s.phone && <div className="text-xs text-gray-400">{s.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.credit_terms_days} days</td>
                    <td className="px-4 py-3 text-gray-900">₦{s.total_purchased.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: s.outstanding_balance > 0 ? '#dc2626' : '#111827' }}>
                      ₦{s.outstanding_balance.toLocaleString()}
                    </td>
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