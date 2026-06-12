'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PresetSelect } from './PresetSelect'

interface Supply {
  id: string
  name: string
  category: string | null
  department: string | null
  unit_of_receipt: string
  unit_of_issue: string
  conversion_factor: number
  current_stock: number
  reorder_point: number
  expiry_tracked: boolean
  controlled_substance: boolean
  unit_cost: number | null
  notes: string | null
  is_active: boolean
}

interface Props {
  facilityId: string
}

const DEPARTMENTS = ['Lab', 'Pharmacy', 'Nursing', 'Dental', 'General', 'Specialist']
const UNITS = ['unit', 'litre', 'ml', 'pack', 'box', 'kg', 'g', 'roll', 'piece', 'vial', 'ampoule']

export function InventoryManager({ facilityId }: Props) {
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    category: '',
    department: '',
    unit_of_receipt: 'unit',
    unit_of_issue: 'unit',
    conversion_factor: '1',
    current_stock: '0',
    reorder_point: '0',
    expiry_tracked: false,
    controlled_substance: false,
    unit_cost: '',
    notes: '',
  })

  useEffect(() => { loadSupplies() }, [])

  async function loadSupplies() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('health_supplies')
      .select('*')
      .eq('facility_id', facilityId)
      .eq('is_active', true)
      .order('department', { ascending: true })
      .order('name', { ascending: true })
    setSupplies(data ?? [])
    setLoading(false)
  }

  function resetForm() {
    setForm({
      name: '', category: '', department: '', unit_of_receipt: 'unit', unit_of_issue: 'unit',
      conversion_factor: '1', current_stock: '0', reorder_point: '0',
      expiry_tracked: false, controlled_substance: false, unit_cost: '', notes: '',
    })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(s: Supply) {
    setForm({
      name: s.name,
      category: s.category ?? '',
      department: s.department ?? '',
      unit_of_receipt: s.unit_of_receipt,
      unit_of_issue: s.unit_of_issue,
      conversion_factor: String(s.conversion_factor),
      current_stock: String(s.current_stock),
      reorder_point: String(s.reorder_point),
      expiry_tracked: s.expiry_tracked,
      controlled_substance: s.controlled_substance,
      unit_cost: s.unit_cost != null ? String(s.unit_cost) : '',
      notes: s.notes ?? '',
    })
    setEditingId(s.id)
    setShowForm(true)
  }

  async function saveSupply() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      facility_id: facilityId,
      name: form.name.trim(),
      category: form.category.trim() || null,
      department: form.department || null,
      unit_of_receipt: form.unit_of_receipt,
      unit_of_issue: form.unit_of_issue,
      conversion_factor: parseFloat(form.conversion_factor) || 1,
      current_stock: parseFloat(form.current_stock) || 0,
      reorder_point: parseFloat(form.reorder_point) || 0,
      expiry_tracked: form.expiry_tracked,
      controlled_substance: form.controlled_substance,
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
      notes: form.notes.trim() || null,
    }

    if (editingId) {
      await supabase.from('health_supplies').update(payload).eq('id', editingId)
    } else {
      await supabase.from('health_supplies').insert(payload)
    }

    await loadSupplies()
    resetForm()
    setSaving(false)
  }

  async function deactivate(id: string) {
    if (!confirm('Remove this item from inventory?')) return
    const supabase = createClient()
    await supabase.from('health_supplies').update({ is_active: false }).eq('id', id)
    setSupplies(prev => prev.filter(s => s.id !== id))
  }

  const filtered = supplies.filter(s => {
    if (departmentFilter !== 'all' && s.department !== departmentFilter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const lowStockCount = supplies.filter(s => s.current_stock <= s.reorder_point && s.reorder_point > 0).length
  const totalItems = supplies.length
  // unit_cost is the cost of one RECEIVED unit (e.g. a pack of 50), but
  // current_stock is tracked in ISSUE units (e.g. pieces) — derive
  // cost-per-issue-unit before valuing stock.
  const totalValue = supplies.reduce((sum, s) => {
    const conversionFactor = s.conversion_factor || 1
    const costPerIssueUnit = (s.unit_cost ?? 0) / conversionFactor
    return sum + costPerIssueUnit * s.current_stock
  }, 0)

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading inventory...</div>

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Total Items</div>
          <div className="text-2xl font-black text-gray-900">{totalItems}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Low Stock Alerts</div>
          <div className="text-2xl font-black" style={{ color: lowStockCount > 0 ? '#dc2626' : '#111827' }}>{lowStockCount}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Estimated Stock Value</div>
          <div className="text-2xl font-black text-gray-900">₦{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Header controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search supplies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors w-48"
          />
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white">
            <option value="all">All departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 rounded-xl text-white text-sm font-bold"
          style={{ background: '#0EA5E9' }}>
          + Add Supply Item
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6">
          <div className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Supply Item' : 'New Supply Item'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Item Name *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Glucose Reagent, Surgical Gloves (Box of 100)" />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <PresetSelect facilityId={facilityId} table="health_supply_categories"
                value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
                placeholder="Select category" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Department</label>
              <select className={inputClass} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Unit Cost (₦)</label>
              <input type="number" className={inputClass} value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                placeholder="Cost per unit of issue" />
            </div>
          </div>

          <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-4">
            <div className="text-xs uppercase tracking-widest text-sky-600 font-semibold mb-3">Unit Configuration</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Received In</label>
                <select className={inputClass} value={form.unit_of_receipt} onChange={e => setForm(f => ({ ...f, unit_of_receipt: e.target.value }))}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Issued In</label>
                <select className={inputClass} value={form.unit_of_issue} onChange={e => setForm(f => ({ ...f, unit_of_issue: e.target.value }))}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Conversion (1 received = ? issued)</label>
                <input type="number" className={inputClass} value={form.conversion_factor} onChange={e => setForm(f => ({ ...f, conversion_factor: e.target.value }))}
                  placeholder="e.g. 1 box = 100 pieces, enter 100" />
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Example: a 5-litre reagent container received as 1 unit, issued in litres → conversion factor = 5
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Current Stock (in issue units)</label>
              <input type="number" className={inputClass} value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Reorder Point (in issue units)</label>
              <input type="number" className={inputClass} value={form.reorder_point} onChange={e => setForm(f => ({ ...f, reorder_point: e.target.value }))}
                placeholder="Alert when stock falls below this" />
            </div>
          </div>

          <div className="flex gap-6 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.expiry_tracked} onChange={e => setForm(f => ({ ...f, expiry_tracked: e.target.checked }))} />
              Track expiry dates for this item
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.controlled_substance} onChange={e => setForm(f => ({ ...f, controlled_substance: e.target.checked }))} />
              Controlled substance
            </label>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass + ' resize-none'} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveSupply} disabled={saving || !form.name.trim()}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              style={{ background: '#0EA5E9' }}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Item'}
            </button>
            <button onClick={resetForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {supplies.length === 0 ? 'No supply items yet. Add your first item to start tracking inventory.' : 'No items match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Item', 'Department', 'Category', 'Stock', 'Unit', 'Reorder At', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const isLow = s.reorder_point > 0 && s.current_stock <= s.reorder_point
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{s.name}</div>
                        {s.controlled_substance && (
                          <span className="text-xs text-amber-600 font-semibold">Controlled</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.department ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{s.category ?? '-'}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: isLow ? '#dc2626' : '#111827' }}>
                        {s.current_stock.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.unit_of_issue}</td>
                      <td className="px-4 py-3 text-gray-400">{s.reorder_point.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {isLow ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-600">Low Stock</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(s)} className="text-xs text-sky-600 hover:underline">Edit</button>
                          <button onClick={() => deactivate(s.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}