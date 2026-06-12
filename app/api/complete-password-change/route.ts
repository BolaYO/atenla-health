import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  try {
    const { authUserId } = await req.json()
    if (!authUserId) {
      return NextResponse.json({ error: 'Missing authUserId' }, { status: 400 })
    }

    const supabase = getServiceClient()
    await supabase.from('health_facility_users').update({ must_change_password: false }).eq('auth_user_id', authUserId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 })
  }
}