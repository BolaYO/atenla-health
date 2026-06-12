'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DashboardClient } from './client'

export function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: facilityUser } = await supabase
        .from('health_facility_users')
        .select('*, health_facilities(*)')
        .eq('auth_user_id', user.id)
        .eq('is_active', true)
        .single()

      if (!facilityUser) {
        router.push('/login')
        return
      }

      if (facilityUser.must_change_password) {
        router.push('/change-password')
        return
      }

      setData(facilityUser)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-sm text-gray-400">Loading...</div>
    </div>
  )

  return (
    <DashboardClient
      facility={data.health_facilities}
      facilityUser={data}
    />
  )
}