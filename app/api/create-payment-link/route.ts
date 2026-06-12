import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { amount, email, reference, callbackUrl, metadata } = await req.json()

    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 })
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email || 'billing@atenla.ng',
        amount: Math.round(amount * 100), // kobo
        reference,
        callback_url: callbackUrl,
        metadata: metadata || {},
      }),
    })

    const data = await res.json()

    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Failed to create payment link' }, { status: 500 })
    }

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
      access_code: data.data.access_code,
    })
  } catch (err: any) {
    console.error('Payment link error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}