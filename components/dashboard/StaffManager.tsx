'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DepartmentRef {
  id: string
  name: string
  is_active: boolean
}

interface StaffRef {
  id: string
  auth_user_id: string
  name: string
  email: string
  phone: string | null
  role: string
  is_admin: boolean
  is_active: boolean
  allowed_departments: string[]
  allowed_modules: string[]
}

interface Props {
  facilityId: string
}

const MODULES = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'dispensing', label: 'Dispensing & Usage Log' },
  { key: 'front_desk', label: 'Front Desk (Check-In & Queue)' },
  { key: 'vitals', label: 'Vitals (Nursing)' },
  { key: 'approvals', label: 'Approvals & Release (Dispensing)' },
  { key: 'patients', label: 'Patients' },
  { key: 'billing', label: 'Billing' },
  { key: 'reports', label: 'Reports' },
  { key: 'notifications', label: 'Notifications' },
]

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

export function StaffManager({ facilityId }: Props) {
  const [view, setView] = useState<'staff' | 'departments'>('staff')
  const [departments, setDepartments] = useState<DepartmentRef[]>([])
  const [staff, setStaff] = useState<StaffRef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New department
  const [newDeptName, setNewDeptName] = useState('')

  // New staff
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffForm, setStaffForm] = useState({
    name: '', email: '', phone: '', role: '', is_admin: false,
    allowed_departments: [] as string[], allowed_modules: [] as string[],
  })
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPassword: string } | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [staffError, setStaffError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: depts }, { data: users }] = await Promise.all([
      supabase.from('health_departments').select('*').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_facility_users').select('*').eq('facility_id', facilityId).order('name'),
    ])
    setDepartments(depts ?? [])
    setStaff(users ?? [])
    setLoading(false)
  }

  async function addDepartment() {
    if (!newDeptName.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('health_departments').insert({ facility_id: facilityId, name: newDeptName.trim() })
    setNewDeptName('')
    await loadData()
    setSaving(false)
  }

  async function removeDepartment(id: string) {
    if (!confirm('Remove this department? Staff assigned to it will lose access to it.')) return
    const supabase = createClient()
    await supabase.from('health_departments').update({ is_active: false }).eq('id', id)
    await loadData()
  }

  function resetStaffForm() {
    setStaffForm({ name: '', email: '', phone: '', role: '', is_admin: false, allowed_departments: [], allowed_modules: [] })
    setEditingStaffId(null)
    setShowStaffForm(false)
    setStaffError('')
  }

  function startEditStaff(s: StaffRef) {
    setStaffForm({
      name: s.name, email: s.email, phone: s.phone ?? '', role: s.role, is_admin: s.is_admin,
      allowed_departments: s.allowed_departments ?? [], allowed_modules: s.allowed_modules ?? [],
    })
    setEditingStaffId(s.id)
    setShowStaffForm(true)
    setCreatedCredentials(null)
    setStaffError('')
  }

  function toggleDepartment(name: string) {
    setStaffForm(f => ({
      ...f,
      allowed_departments: f.allowed_departments.includes(name)
        ? f.allowed_departments.filter(d => d !== name)
        : [...f.allowed_departments, name],
    }))
  }

  function toggleModule(key: string) {
    setStaffForm(f => ({
      ...f,
      allowed_modules: f.allowed_modules.includes(key)
        ? f.allowed_modules.filter(m => m !== key)
        : [...f.allowed_modules, key],
    }))
  }

  async function saveStaff() {
    if (!staffForm.name.trim() || !staffForm.role.trim()) return
    setSaving(true)
    setStaffError('')

    const supabase = createClient()

    if (editingStaffId) {
      // Editing an existing staff member — no auth account creation needed
      await supabase.from('health_facility_users').update({
        name: staffForm.name.trim(),
        phone: staffForm.phone.trim() || null,
        role: staffForm.role.trim(),
        is_admin: staffForm.is_admin,
        allowed_departments: staffForm.allowed_departments,
        allowed_modules: staffForm.allowed_modules,
      }).eq('id', editingStaffId)

      await loadData()
      resetStaffForm()
      setSaving(false)
      return
    }

    if (!staffForm.email.trim()) {
      setStaffError('Email is required to create a login.')
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/create-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId,
          name: staffForm.name.trim(),
          email: staffForm.email.trim(),
          phone: staffForm.phone.trim() || null,
          role: staffForm.role.trim(),
          isAdmin: staffForm.is_admin,
          allowedDepartments: staffForm.allowed_departments,
          allowedModules: staffForm.allowed_modules,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCreatedCredentials({ email: staffForm.email.trim(), tempPassword: data.tempPassword })
        await loadData()
        resetStaffForm()
      } else {
        setStaffError(data.error ?? 'Could not create staff account')
      }
    } catch (err) {
      setStaffError('Could not create staff account, check your connection and try again.')
    }
    setSaving(false)
  }

  async function toggleStaffActive(s: StaffRef) {
    const supabase = createClient()
    await supabase.from('health_facility_users').update({ is_active: !s.is_active }).eq('id', s.id)
    await loadData()
  }

  async function resetPassword(s: StaffRef) {
    if (!confirm(`Generate a new temporary password for ${s.name}? Their current password will stop working.`)) return
    setResettingId(s.id)
    try {
      const res = await fetch('/api/reset-staff-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: s.id, authUserId: s.auth_user_id }),
      })
      const data = await res.json()
      if (data.success) {
        setCreatedCredentials({ email: s.email, tempPassword: data.tempPassword })
        await loadData()
      } else {
        alert(data.error ?? 'Could not reset password')
      }
    } catch (err) {
      alert('Could not reset password, check your connection and try again.')
    }
    setResettingId(null)
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading staff &amp; departments...</div>

  return (
    <div>
      <div className="flex gap-1 mb-6 flex-wrap">
        <button onClick={() => setView('staff')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'staff' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'staff' ? { background: '#0EA5E9' } : undefined}>
          Staff
        </button>
        <button onClick={() => setView('departments')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'departments' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'departments' ? { background: '#0EA5E9' } : undefined}>
          Departments
        </button>
      </div>

      {view === 'departments' && (
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 max-w-lg">
            <div className="font-semibold text-gray-900 mb-1">Departments</div>
            <div className="text-xs text-gray-400 mb-4">These are the departments staff can be assigned to, used across Stock Requests, Usage Log, Patients, and Billing.</div>
            <div className="flex gap-2">
              <input className={inputClass} placeholder="e.g. Imaging, Surgery, Phlebotomy" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} />
              <button onClick={addDepartment} disabled={saving || !newDeptName.trim()}
                className="px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap" style={{ background: '#0EA5E9' }}>
                + Add
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden max-w-lg">
            {departments.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No departments yet, add your first one above.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {departments.map(d => (
                  <div key={d.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{d.name}</span>
                    <button onClick={() => removeDepartment(d.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'staff' && (
        <div>
          {createdCredentials && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4 max-w-lg">
              <div className="text-sm font-semibold text-emerald-700 mb-1">New temporary password generated</div>
              <div className="text-sm text-gray-700">
                Share these login details with <strong>{createdCredentials.email}</strong>:
              </div>
              <div className="text-sm text-gray-900 font-mono bg-white rounded-lg px-3 py-2 mt-2 inline-block">
                {createdCredentials.tempPassword}
              </div>
              <div className="text-xs text-gray-400 mt-2">This password is shown once, make sure to copy it now. The staff member should change it after first login.</div>
              <button onClick={() => setCreatedCredentials(null)} className="text-xs text-emerald-600 hover:underline mt-2 block">Dismiss</button>
            </div>
          )}

          {!showStaffForm && (
            <button onClick={() => { resetStaffForm(); setShowStaffForm(true) }}
              className="px-4 py-2 rounded-xl text-white text-sm font-bold mb-4" style={{ background: '#0EA5E9' }}>
              + Add Staff
            </button>
          )}

          {showStaffForm && (
            <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6 max-w-2xl">
              <div className="font-semibold text-gray-900 mb-4">{editingStaffId ? 'Edit Staff Member' : 'New Staff Member'}</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input className={inputClass} value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Role / Title *</label>
                  <input className={inputClass} value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Senior Nurse, Radiographer, Cashier" />
                </div>
              </div>

              {!editingStaffId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Email * (used for login)</label>
                    <input type="email" className={inputClass} value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input className={inputClass} value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={staffForm.is_admin} onChange={e => setStaffForm(f => ({ ...f, is_admin: e.target.checked }))} />
                  Administrator ; full access to everything, including this Staff page
                </label>
              </div>

              {!staffForm.is_admin && (
                <>
                  <div className="mb-4">
                    <label className={labelClass}>Department Access</label>
                    <div className="flex flex-wrap gap-2">
                      {departments.length === 0 ? (
                        <div className="text-xs text-gray-400">No departments yet, add some under the Departments tab first.</div>
                      ) : departments.map(d => (
                        <button key={d.id} type="button" onClick={() => toggleDepartment(d.name)}
                          className={'px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ' + (staffForm.allowed_departments.includes(d.name) ? 'text-white' : 'bg-gray-100 text-gray-600')}
                          style={staffForm.allowed_departments.includes(d.name) ? { background: '#0EA5E9' } : undefined}>
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className={labelClass}>Module Access</label>
                    <div className="flex flex-wrap gap-2">
                      {MODULES.map(m => (
                        <button key={m.key} type="button" onClick={() => toggleModule(m.key)}
                          className={'px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ' + (staffForm.allowed_modules.includes(m.key) ? 'text-white' : 'bg-gray-100 text-gray-600')}
                          style={staffForm.allowed_modules.includes(m.key) ? { background: '#0EA5E9' } : undefined}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {staffError && <div className="text-xs text-red-500 mb-3">{staffError}</div>}

              <div className="flex gap-2">
                <button onClick={saveStaff} disabled={saving || !staffForm.name.trim() || !staffForm.role.trim()}
                  className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#0EA5E9' }}>
                  {saving ? 'Saving...' : editingStaffId ? 'Save Changes' : 'Create Staff Account'}
                </button>
                <button onClick={resetStaffForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {staff.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No staff added yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {staff.map(s => (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 text-sm">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{s.role}</span>
                        {s.is_admin && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">Admin</span>}
                        {!s.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Inactive</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {s.email}
                        {!s.is_admin && (s.allowed_departments?.length ?? 0) > 0 && ` · ${s.allowed_departments.join(', ')}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditStaff(s)} className="text-xs text-sky-600 hover:underline">Edit</button>
                      <button onClick={() => resetPassword(s)} disabled={resettingId === s.id} className="text-xs text-amber-600 hover:underline disabled:opacity-50">
                        {resettingId === s.id ? 'Resetting...' : 'Reset Password'}
                      </button>
                      <button onClick={() => toggleStaffActive(s)} className="text-xs text-gray-500 hover:underline">{s.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}