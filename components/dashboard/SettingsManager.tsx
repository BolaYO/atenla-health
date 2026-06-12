'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FacilityRef {
  id: string
  name: string
  logo_url: string | null
  brand_color: string | null
}

interface Props {
  facility: FacilityRef
}

const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

export function SettingsManager({ facility }: Props) {
  const [logoUrl, setLogoUrl] = useState(facility.logo_url ?? '')
  const [brandColor, setBrandColor] = useState(facility.brand_color ?? 'var(--brand-color)')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploading(true)

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await fetch('/api/upload-logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: reader.result, facilityId: facility.id }),
        })
        const data = await res.json()
        if (data.success) {
          setLogoUrl(data.url)
        } else {
          setError(data.error ?? 'Upload failed')
        }
      } catch {
        setError('Upload failed, check your connection and try again.')
      }
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('health_facilities')
      .update({ logo_url: logoUrl, brand_color: brandColor })
      .eq('id', facility.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setSaved(true)
    // Reload so the header (which reads facility data loaded at page mount) picks up the new branding
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div>
      <div className="font-semibold text-gray-900 mb-1">Branding</div>
      <div className="text-xs text-gray-400 mb-6">This logo and color appear on patient-facing documents ; bills, payment links, and emailed reports.</div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-lg">
        <div className="mb-6">
          <label className={labelClass}>Facility Logo</label>
          {logoUrl && (
            <img src={logoUrl} alt="Facility logo" className="w-20 h-20 rounded-xl object-cover border border-gray-100 mb-3" />
          )}
          <input type="file" accept="image/*" onChange={handleLogoChange} disabled={uploading}
            className="text-sm text-gray-600" />
          {uploading && <div className="text-xs text-gray-400 mt-1">Uploading...</div>}
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>

        <div className="mb-6">
          <label className={labelClass}>Brand Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
              className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer" />
            <span className="text-sm text-gray-500 font-mono">{brandColor}</span>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || uploading}
          className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Branding'}
        </button>
      </div>
    </div>
  )
}