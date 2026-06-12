'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  async function handleSubmit() {
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setError(pwError.message)
      setSaving(false)
      return
    }

    await fetch('/api/complete-password-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authUserId: user.id }),
    })

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full">
        <div className="text-xl font-black text-gray-900 mb-1">Set your password</div>
        <div className="text-sm text-gray-400 mb-6">This is your first login, choose a new password to continue.</div>

        <div className="mb-4">
          <label className={labelClass}>New Password</label>
          <input type="password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className={labelClass}>Confirm Password</label>
          <input type="password" className={inputClass} value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>

        {error && <div className="text-xs text-red-500 mb-4">{error}</div>}

        <button onClick={handleSubmit} disabled={saving || !password || !confirm}
          className="w-full px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#0EA5E9' }}>
          {saving ? 'Saving...' : 'Set Password & Continue'}
        </button>
      </div>
    </div>
  )
}