import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { patientEmail, patientName, facilityName, facilitySupportEmail, items, totalAmount, outstanding, paymentLinkUrl } = await req.json()

    if (!patientEmail || !items || totalAmount == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const itemsHtml = items.map((it: any) =>
      `<tr><td style="padding:6px 0;color:#374151;">${it.service_name} ${it.quantity > 1 ? `× ${it.quantity}` : ''}</td><td style="padding:6px 0;text-align:right;color:#111827;font-weight:600;">₦${it.total_price.toLocaleString()}</td></tr>`
    ).join('')

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#111827;">${facilityName}</h2>
        <p style="color:#6b7280;">Hi ${patientName ?? ''}, here is your bill summary.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
          ${itemsHtml}
          <tr style="border-top: 2px solid #e5e7eb;">
            <td style="padding:10px 0; font-weight:700; color:#111827;">Total</td>
            <td style="padding:10px 0; text-align:right; font-weight:700; font-size:18px; color:#111827;">₦${totalAmount.toLocaleString()}</td>
          </tr>
        </table>
        ${outstanding != null && outstanding < totalAmount && outstanding > 0 ? `
          <p style="color:#6b7280; font-size:13px;">Outstanding balance: <strong>₦${outstanding.toLocaleString()}</strong></p>
        ` : ''}
        ${paymentLinkUrl ? `
          <a href="${paymentLinkUrl}" style="display:inline-block; background:#0EA5E9; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700; margin-top: 8px;">
            Pay Now
          </a>
          <p style="color:#9ca3af; font-size:12px; margin-top:16px;">You can also pay in person. Cash, card, or transfer are all accepted.</p>
        ` : `
          <p style="color:#9ca3af; font-size:12px; margin-top:16px;">Please settle this bill at the facility. Cash, card, or transfer are accepted.</p>
        `}
        <p style="color:#9ca3af; font-size:12px; margin-top:24px;">Powered by Atẹ́nlá</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: `${facilityName} via Atenla Health <hello@atenla.ng>`,
      to: patientEmail,
      replyTo: facilitySupportEmail || undefined,
      subject: `Your bill from ${facilityName}`,
      html,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 })
  }
}