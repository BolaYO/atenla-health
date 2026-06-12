import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, imageBase64, imageMediaType, pdfBase64, existingSupplies, existingSuppliers } = body

    const supplyList = (existingSupplies ?? [])
      .slice(0, 300)
      .map((s: any) => `- ${s.name} (${s.category ?? ''}, unit: ${s.unit_of_receipt})`)
      .join('\n')

    const supplierList = (existingSuppliers ?? [])
      .map((s: any) => `- ${s.name}`)
      .join('\n')

    const systemPrompt = `You are a procurement document parser for a hospital called Medics Partners, part of the Atenla Health platform.

You will be given a supplier invoice, delivery note, or receipt — as text, an image, or a PDF. Extract the procurement details.

The hospital's existing suppliers:
${supplierList || '(none registered yet)'}

The hospital's existing supply catalogue (items they stock):
${supplyList || '(none yet)'}

Return ONLY a valid JSON object with no other text, markdown, or explanation, in this exact format:

{
  "supplier_name": "string — the supplier name as written on the document, or matched to existing supplier name if close enough",
  "supplier_matched": true/false — true if it matches an existing supplier in the list above,
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "invoice_amount": number or null — total amount on the invoice,
  "items": [
    {
      "item_name": "string — name as written on the document",
      "matched_name": "string or null — closest matching item from the existing supply catalogue, or null if no good match",
      "quantity_received": number,
      "unit": "string — the unit mentioned (e.g. litre, box, pack, carton)",
      "unit_cost": number or null,
      "batch_number": "string or null",
      "expiry_date": "YYYY-MM-DD or null"
    }
  ]
}

Rules:
- Match item names to the existing catalogue as closely as possible using "matched_name". If no reasonable match exists, set matched_name to null — the system will treat it as a new item.
- If unit_cost is not explicitly stated but a line total and quantity are given, calculate unit_cost = line_total / quantity.
- If the document is unclear or low quality, extract whatever is legible and leave other fields null.
- Dates should be in YYYY-MM-DD format. If only partial dates are visible, use your best judgment or null.
- Return items: [] if no line items can be identified.`

    const messages: any[] = []

    if (pdfBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: 'Parse this procurement document into the JSON format specified.' },
        ],
      })
    } else if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMediaType ?? 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Parse this procurement document into the JSON format specified.' },
        ],
      })
    } else {
      messages.push({
        role: 'user',
        content: `Parse this procurement information:\n\n${text}`,
      })
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 3000,
      system: systemPrompt,
      messages,
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Procurement parse error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}