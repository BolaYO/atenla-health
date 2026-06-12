import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function generateTempPassword() {
  return `atenla-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(req: NextRequest) {
  try {
    const { staffId, authUserId } = await req.json()

    if (!staffId || !authUserId) {
      return NextResponse.json({ error: 'Missing staffId or authUserId' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const tempPassword = generateTempPassword()

    const { error: authError } = await supabase.auth.admin.updateUserById(authUserId, { password: tempPassword })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    await supabase.from('health_facility_users').update({ must_change_password: true }).eq('id', staffId)

    return NextResponse.json({ success: true, tempPassword })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 })
  }
}