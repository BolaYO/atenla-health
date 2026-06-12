'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  facilityId: string
  table: 'health_supply_categories' | 'health_procedures'
  value: string
  onChange: (name: string) => void
  extra?: Record<string, any>
  placeholder?: string
  className?: string
}

export function PresetSelect({ facilityId, table, value, onChange, extra, placeholder, className }: Props) {
  const [options, setOptions] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from(table).select('name').eq('facility_id', facilityId).order('name')
    setOptions((data ?? []).map((d: any) => d.name))
  }

  async function addNew() {
    if (!newName.trim()) return
    const supabase = createClient()
    await supabase.from(table).insert({ facility_id: facilityId, name: newName.trim(), ...(extra ?? {}) })
    await load()
    onChange(newName.trim())
    setNewName('')
    setAdding(false)
  }

  const inputClass = className ?? 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'

  if (adding) {
    return (
      <div className="flex gap-2">
        <input className={inputClass} value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New name" autoFocus onKeyDown={e => { if (e.key === 'Enter') addNew() }} />
        <button onClick={addNew} className="px-3 py-2 rounded-xl text-white text-xs font-bold whitespace-nowrap" style={{ background: 'var(--brand-color)' }}>Add</button>
        <button onClick={() => { setAdding(false); setNewName('') }} className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 whitespace-nowrap">Cancel</button>
      </div>
    )
  }

  return (
    <select className={inputClass} value={value} onChange={e => {
      if (e.target.value === '__new__') setAdding(true)
      else onChange(e.target.value)
    }}>
      <option value="">{placeholder ?? 'Select'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__new__">+ Add new...</option>
    </select>
  )
}