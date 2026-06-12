import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function generateTempPassword() {
  // Simple, readable temp password — e.g. "atenla-7f3k2q"
  return `atenla-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(req: NextRequest) {
  try {
    const { facilityId, name, email, phone, role, allowedDepartments, allowedModules, isAdmin } = await req.json()

    if (!facilityId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const tempPassword = generateTempPassword()

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: authError?.message ?? 'Could not create auth account' }, { status: 400 })
    }

    const { error: insertError } = await supabase.from('health_facility_users').insert({
      facility_id: facilityId,
      auth_user_id: authUser.user.id,
      name,
      email,
      phone: phone || null,
      role: role || 'staff',
      is_admin: !!isAdmin,
      allowed_departments: allowedDepartments ?? [],
      allowed_modules: allowedModules ?? [],
      is_active: true,
      must_change_password: true,
    })

    if (insertError) {
      // Roll back the auth user if the facility_users insert fails
      await supabase.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, tempPassword })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 })
  }
}