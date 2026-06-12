'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SuppliersManager, type Supplier } from './SuppliersManager'

interface Supply {
  id: string
  name: string
  category: string | null
  unit_of_receipt: string
  unit_of_issue: string
  conversion_factor: number
  expiry_tracked: boolean
}

interface LineItem {
  supply_id: string | null
  item_name: string
  quantity_received: string
  unit: string
  pack_size: string
  unit_cost: string
  batch_number: string
  expiry_date: string
  is_new: boolean
  new_unit_of_issue: string
  new_conversion_factor: string
}

interface Props {
  facilityId: string
}

type InputMode = 'manual' | 'paste' | 'upload'

const emptyLine = (): LineItem => ({
  supply_id: null, item_name: '', quantity_received: '', unit: 'unit', pack_size: '1', unit_cost: '', batch_number: '', expiry_date: '', is_new: false,
  new_unit_of_issue: 'unit', new_conversion_factor: '1',
})

export function ProcurementManager({ facilityId }: Props) {
  const [view, setView] = useState<'received' | 'suppliers'>('received')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingGrId, setEditingGrId] = useState<string | null>(null)

  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMediaType, setImageMediaType] = useState<string | null>(null)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [parseError, setParseError] = useState('')

  const [supplierId, setSupplierId] = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'full' | 'partial'>('credit')
  const [amountPaid, setAmountPaid] = useState('')

  // Record payment (reconciliation) state
  const [payingGrId, setPayingGrId] = useState<string | null>(null)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: sup }, { data: items }, { data: hist }] = await Promise.all([
      supabase.from('health_suppliers').select('*').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_supplies').select('id, name, category, unit_of_receipt, unit_of_issue, conversion_factor, expiry_tracked').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_goods_received').select('*, health_suppliers(id, name), health_goods_received_items(*, health_supplies(name, unit_of_issue))').eq('facility_id', facilityId).order('created_at', { ascending: false }).limit(30),
    ])
    setSuppliers(sup ?? [])
    setSupplies(items ?? [])
    setHistory(hist ?? [])
    setLoading(false)
  }

  function resetForm() {
    setSupplierId(''); setShowNewSupplier(false); setNewSupplierName('')
    setInvoiceNumber(''); setInvoiceAmount(''); setDeliveryDate(new Date().toISOString().split('T')[0])
    setNotes(''); setLines([emptyLine()])
    setPaymentMethod('credit'); setAmountPaid('')
    setPasteText(''); setImagePreview(null); setImageBase64(null); setImageMediaType(null)
    setPdfBase64(null); setPdfName(null); setInputMode('manual'); setParseError('')
    setEditingGrId(null)
    setShowForm(false)
  }

  function startEditDelivery(h: any) {
    setEditingGrId(h.id)
    setSupplierId(h.supplier_id ?? '')
    setShowNewSupplier(false)
    setNewSupplierName('')
    setInvoiceNumber(h.invoice_number ?? '')
    setInvoiceAmount(h.invoice_amount != null ? String(h.invoice_amount) : '')
    setDeliveryDate(h.delivery_date)
    setNotes(h.notes ?? '')
    if (h.payment_status === 'paid') {
      setPaymentMethod('full')
      setAmountPaid('')
    } else if (h.payment_status === 'partial') {
      setPaymentMethod('partial')
      setAmountPaid(h.amount_paid != null ? String(h.amount_paid) : '')
    } else {
      setPaymentMethod('credit')
      setAmountPaid('')
    }
    setLines([emptyLine()])
    setInputMode('manual')
    setShowForm(true)
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setPdfBase64(base64)
        setPdfName(file.name)
        setImagePreview(null)
        setImageBase64(null)
      }
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setImagePreview(result)
        setImageBase64(result.split(',')[1])
        setImageMediaType(file.type)
        setPdfBase64(null)
        setPdfName(null)
      }
      reader.readAsDataURL(file)
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          setImagePreview(result)
          setImageBase64(result.split(',')[1])
          setImageMediaType(file.type)
        }
        reader.readAsDataURL(file)
        e.preventDefault()
        return
      }
    }
  }

  async function processDocument() {
    setParsing(true)
    setParseError('')
    try {
      const res = await fetch('/api/parse-procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText || null,
          imageBase64: imageBase64 || null,
          imageMediaType: imageMediaType || null,
          pdfBase64: pdfBase64 || null,
          existingSupplies: supplies.map(s => ({ name: s.name, category: s.category, unit_of_receipt: s.unit_of_receipt })),
          existingSuppliers: suppliers.map(s => ({ name: s.name })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.supplier_name) {
        const matched = suppliers.find(s => s.name.toLowerCase() === data.supplier_name.toLowerCase())
        if (matched) {
          setSupplierId(matched.id)
        } else {
          setShowNewSupplier(true)
          setNewSupplierName(data.supplier_name)
        }
      }
      if (data.invoice_number) setInvoiceNumber(data.invoice_number)
      if (data.invoice_amount) setInvoiceAmount(String(data.invoice_amount))
      if (data.invoice_date) setDeliveryDate(data.invoice_date)

      const parsedLines: LineItem[] = (data.items ?? []).map((item: any) => {
        const matched = item.matched_name ? supplies.find(s => s.name.toLowerCase() === item.matched_name.toLowerCase()) : null
        return {
          supply_id: matched?.id ?? null,
          item_name: matched?.name ?? item.item_name,
          quantity_received: String(item.quantity_received ?? ''),
          unit: item.unit ?? matched?.unit_of_receipt ?? 'unit',
          pack_size: matched ? String(matched.conversion_factor ?? 1) : '1',
          unit_cost: item.unit_cost != null ? String(item.unit_cost) : '',
          batch_number: item.batch_number ?? '',
          expiry_date: item.expiry_date ?? '',
          is_new: !matched,
          new_unit_of_issue: 'unit',
          new_conversion_factor: '1',
        }
      })

      setLines(parsedLines.length ? parsedLines : [emptyLine()])
      setInputMode('manual')
    } catch (e: any) {
      setParseError(e.message)
    } finally {
      setParsing(false)
    }
  }

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function selectSupplyForLine(idx: number, supplyId: string) {
    const supply = supplies.find(s => s.id === supplyId)
    setLines(prev => prev.map((l, i) => i === idx ? {
      ...l, supply_id: supplyId, item_name: supply?.name ?? l.item_name,
      unit: supply?.unit_of_receipt ?? l.unit, is_new: false,
      pack_size: supply ? String(supply.conversion_factor ?? 1) : l.pack_size,
    } : l))
  }

  function addLine() { setLines(prev => [...prev, emptyLine()]) }
  function removeLine(idx: number) { setLines(prev => prev.filter((_, i) => i !== idx)) }

  async function saveGoodsReceived() {
    setSaving(true)
    const supabase = createClient()

    let finalSupplierId: string | null = supplierId || null

    if (showNewSupplier && newSupplierName.trim()) {
      const { data: newSup } = await supabase.from('health_suppliers')
        .insert({ facility_id: facilityId, name: newSupplierName.trim() })
        .select().single()
      if (newSup) {
        finalSupplierId = newSup.id
        setSuppliers(prev => [...prev, newSup])
      }
    }

    const invoiceTotal = invoiceAmount ? parseFloat(invoiceAmount) : 0
    const paidAmount = paymentMethod === 'full' ? invoiceTotal
      : paymentMethod === 'partial' ? (parseFloat(amountPaid) || 0)
      : 0
    const paymentStatus = paymentMethod === 'full' ? 'paid'
      : paymentMethod === 'partial' && paidAmount > 0 ? 'partial'
      : 'unpaid'

    if (editingGrId) {
      // EDIT MODE — update delivery details + reconcile supplier balances
      const original = history.find(h => h.id === editingGrId)
      const oldSupplierId: string | null = original?.supplier_id ?? null
      const oldInvoiceTotal = original?.invoice_amount ?? 0
      const oldPaid = original?.amount_paid ?? 0
      const oldOutstanding = oldInvoiceTotal - oldPaid
      const newOutstanding = invoiceTotal - paidAmount

      if (oldSupplierId && oldSupplierId === finalSupplierId) {
        // Same supplier — adjust by the difference only
        const sup = suppliers.find(s => s.id === oldSupplierId)
        if (sup) {
          await supabase.from('health_suppliers').update({
            total_purchased: Math.max(0, (sup.total_purchased ?? 0) - oldInvoiceTotal + invoiceTotal),
            outstanding_balance: Math.max(0, (sup.outstanding_balance ?? 0) - oldOutstanding + newOutstanding),
          }).eq('id', sup.id)
        }
      } else {
        // Reverse old supplier's figures (if any)
        if (oldSupplierId) {
          const oldSup = suppliers.find(s => s.id === oldSupplierId)
          if (oldSup) {
            await supabase.from('health_suppliers').update({
              total_purchased: Math.max(0, (oldSup.total_purchased ?? 0) - oldInvoiceTotal),
              outstanding_balance: Math.max(0, (oldSup.outstanding_balance ?? 0) - oldOutstanding),
            }).eq('id', oldSup.id)
          }
        }
        // Apply to new supplier (if any)
        if (finalSupplierId) {
          const newSup = suppliers.find(s => s.id === finalSupplierId)
          await supabase.from('health_suppliers').update({
            total_purchased: (newSup?.total_purchased ?? 0) + invoiceTotal,
            outstanding_balance: (newSup?.outstanding_balance ?? 0) + newOutstanding,
          }).eq('id', finalSupplierId)
        }
      }

      await supabase.from('health_goods_received').update({
        supplier_id: finalSupplierId,
        delivery_date: deliveryDate,
        invoice_number: invoiceNumber.trim() || null,
        invoice_amount: invoiceAmount ? invoiceTotal : null,
        payment_status: paymentStatus,
        amount_paid: paidAmount,
        notes: notes.trim() || null,
      }).eq('id', editingGrId)

      await loadData()
      resetForm()
      setSaving(false)
      return
    }

    // CREATE MODE
    const { data: gr } = await supabase.from('health_goods_received').insert({
      facility_id: facilityId,
      supplier_id: finalSupplierId,
      delivery_date: deliveryDate,
      invoice_number: invoiceNumber.trim() || null,
      invoice_amount: invoiceAmount ? invoiceTotal : null,
      payment_status: paymentStatus,
      amount_paid: paidAmount,
      notes: notes.trim() || null,
    }).select().single()

    if (!gr) { setSaving(false); return }

    const matchedSuppliesMap: Record<string, Supply> = {}
    for (const s of supplies) matchedSuppliesMap[s.id] = s

    for (const line of lines) {
      if (!line.item_name.trim() || !line.quantity_received) continue

      let supplyId = line.supply_id

      if (!supplyId) {
        const { data: newSupply } = await supabase.from('health_supplies').insert({
          facility_id: facilityId,
          name: line.item_name.trim(),
          unit_of_receipt: line.unit,
          unit_of_issue: line.new_unit_of_issue || line.unit,
          conversion_factor: parseFloat(line.new_conversion_factor) || 1,
          current_stock: 0,
          expiry_tracked: !!line.expiry_date,
          unit_cost: line.unit_cost ? parseFloat(line.unit_cost) : null,
        }).select().single()
        if (newSupply) {
          supplyId = newSupply.id
          setSupplies(prev => [...prev, newSupply])
        }
      }

      if (supplyId) {
        const qtyReceived = parseFloat(line.quantity_received) || 0
        const packSize = line.is_new ? (parseFloat(line.new_conversion_factor) || 1) : (parseFloat(line.pack_size) || 1)
        const issueUnits = qtyReceived * packSize

        await supabase.from('health_goods_received_items').insert({
          goods_received_id: gr.id,
          supply_id: supplyId,
          quantity_received: qtyReceived,
          quantity_issue_units: issueUnits,
          unit_cost: line.unit_cost ? parseFloat(line.unit_cost) : null,
          batch_number: line.batch_number.trim() || null,
          expiry_date: line.expiry_date || null,
        })

        // Update the supply's default conversion factor for next time (if it changed)
        if (!line.is_new && Math.abs(packSize - (matchedSuppliesMap[supplyId]?.conversion_factor ?? 1)) > 0.0001) {
          await supabase.from('health_supplies').update({ conversion_factor: packSize }).eq('id', supplyId)
        }
      }
    }

    if (finalSupplierId && invoiceAmount) {
      const supplier = suppliers.find(s => s.id === finalSupplierId)
      const outstandingFromThis = invoiceTotal - paidAmount
      await supabase.from('health_suppliers').update({
        total_purchased: (supplier?.total_purchased ?? 0) + invoiceTotal,
        outstanding_balance: (supplier?.outstanding_balance ?? 0) + outstandingFromThis,
      }).eq('id', finalSupplierId)
    }

    await loadData()
    resetForm()
    setSaving(false)
  }

  async function recordPayment(h: any) {
    const amount = parseFloat(paymentAmountInput)
    if (!amount || amount <= 0) return
    setRecordingPayment(true)
    const supabase = createClient()

    const invoiceTotal = h.invoice_amount ?? 0
    const currentPaid = h.amount_paid ?? 0
    const newPaid = Math.min(invoiceTotal, currentPaid + amount)
    const newStatus = newPaid >= invoiceTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

    await supabase.from('health_goods_received').update({
      amount_paid: newPaid,
      payment_status: newStatus,
    }).eq('id', h.id)

    if (h.supplier_id) {
      const supplier = suppliers.find(s => s.id === h.supplier_id)
      if (supplier) {
        await supabase.from('health_suppliers').update({
          outstanding_balance: Math.max(0, (supplier.outstanding_balance ?? 0) - amount),
        }).eq('id', supplier.id)
      }
    }

    await loadData()
    setPayingGrId(null)
    setPaymentAmountInput('')
    setRecordingPayment(false)
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading procurement...</div>

  return (
    <div>
      {/* View toggle */}
      <div className="flex gap-1 mb-6">
        {(['received', 'suppliers'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={'px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ' + (view === v ? 'text-white' : 'bg-gray-100 text-gray-600')}
            style={view === v ? { background: 'var(--brand-color)' } : undefined}>
            {v === 'received' ? 'Goods Received' : 'Suppliers'}
          </button>
        ))}
      </div>

      {view === 'suppliers' && <SuppliersManager facilityId={facilityId} />}

      {view === 'received' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-gray-900">Goods Received</div>
            {!showForm && (
              <button onClick={() => { resetForm(); setShowForm(true) }}
                className="px-4 py-2 rounded-xl text-white text-sm font-bold"
                style={{ background: 'var(--brand-color)' }}>
                + Log Delivery
              </button>
            )}
          </div>

          {showForm && (
            <div className="bg-white rounded-2xl border border-sky-200 p-6 mb-6">
              <div className="font-semibold text-gray-900 mb-4">
                {editingGrId ? 'Edit Delivery Details' : 'Log New Delivery'}
              </div>

              {!editingGrId && (
                <>
                  {/* Input mode tabs */}
                  <div className="flex gap-1 mb-4">
                    {([
                      { key: 'manual', label: 'Manual entry' },
                      { key: 'paste', label: 'Paste invoice text' },
                      { key: 'upload', label: 'Upload photo / PDF' },
                    ] as { key: InputMode; label: string }[]).map(m => (
                      <button key={m.key} onClick={() => setInputMode(m.key)}
                        className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (inputMode === m.key ? 'text-white' : 'bg-gray-100 text-gray-600')}
                        style={inputMode === m.key ? { background: 'var(--brand-color)' } : undefined}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {inputMode === 'paste' && (
                    <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-4">
                      <div className="text-xs uppercase tracking-widest text-sky-600 font-medium mb-2">Paste invoice or delivery note text</div>
                      <textarea className={inputClass + ' resize-none mb-3'} rows={6}
                        placeholder="Paste the supplier's invoice text here..." value={pasteText} onChange={e => setPasteText(e.target.value)} />
                      {parseError && <div className="text-xs text-red-500 mb-2">{parseError}</div>}
                      <button onClick={processDocument} disabled={parsing || !pasteText.trim()}
                        className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                        style={{ background: 'var(--brand-color)' }}>
                        {parsing ? 'Reading...' : 'Extract Items'}
                      </button>
                    </div>
                  )}

                  {inputMode === 'upload' && (
                    <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-4" onPaste={handlePaste}>
                      <div className="text-xs uppercase tracking-widest text-sky-600 font-medium mb-2">Upload or paste a photo of the invoice, or upload a PDF</div>
                      <input type="file" accept="image/*,application/pdf" onChange={handleImageUpload}
                        className="text-sm mb-3 block" />
                      {imagePreview && (
                        <img src={imagePreview} alt="preview" className="max-h-48 rounded-xl border border-gray-200 mb-3" />
                      )}
                      {pdfName && (
                        <div className="text-sm text-gray-600 mb-3">📄 {pdfName}</div>
                      )}
                      <div className="text-xs text-gray-400 mb-3">You can also paste a screenshot directly with Cmd+V into this box.</div>
                      {parseError && <div className="text-xs text-red-500 mb-2">{parseError}</div>}
                      <button onClick={processDocument} disabled={parsing || (!imageBase64 && !pdfBase64)}
                        className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                        style={{ background: 'var(--brand-color)' }}>
                        {parsing ? 'Reading...' : 'Extract Items'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Supplier selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Supplier</label>
                  {!showNewSupplier ? (
                    <div className="flex gap-2">
                      <select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                        <option value="">Select supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button onClick={() => { setShowNewSupplier(true); setSupplierId('') }}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 whitespace-nowrap">
                        + New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input className={inputClass} placeholder="New supplier name" value={newSupplierName}
                        onChange={e => setNewSupplierName(e.target.value)} />
                      <button onClick={() => setShowNewSupplier(false)}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 whitespace-nowrap">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Delivery Date</label>
                  <input type="date" className={inputClass} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Invoice Number</label>
                  <input className={inputClass} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Invoice Amount (₦)</label>
                  <input type="number" className={inputClass} value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} />
                </div>
              </div>

              {/* Payment status */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-3">Payment</div>
                <div className="flex gap-2 mb-3">
                  {([
                    { key: 'credit', label: 'Full Credit' },
                    { key: 'partial', label: 'Part Payment' },
                    { key: 'full', label: 'Paid in Full' },
                  ] as { key: 'credit' | 'partial' | 'full'; label: string }[]).map(opt => (
                    <button key={opt.key} onClick={() => setPaymentMethod(opt.key)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (paymentMethod === opt.key ? 'text-white' : 'bg-white border border-gray-200 text-gray-600')}
                      style={paymentMethod === opt.key ? { background: 'var(--brand-color)' } : undefined}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'partial' && (
                  <div>
                    <label className={labelClass}>Amount Paid {editingGrId ? 'So Far' : 'Now'} (₦)</label>
                    <input type="number" className={inputClass} value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      placeholder="How much has been paid" />
                    {invoiceAmount && amountPaid && (
                      <div className="text-xs text-gray-400 mt-1">
                        Remaining balance to supplier: ₦{Math.max(0, parseFloat(invoiceAmount) - (parseFloat(amountPaid) || 0)).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
                {paymentMethod === 'credit' && invoiceAmount && (
                  <div className="text-xs text-gray-500">Full amount of ₦{parseFloat(invoiceAmount).toLocaleString()} will be on supplier's outstanding balance.</div>
                )}
                {paymentMethod === 'full' && invoiceAmount && (
                  <div className="text-xs text-green-600">Marked as fully paid, no outstanding balance for this delivery.</div>
                )}
              </div>

              {/* Line items — only for new deliveries */}
              {!editingGrId && (
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-2">Items Received</div>
                  <div className="space-y-3">
                    {lines.map((line, idx) => {
                      const matchedSupply = supplies.find(s => s.id === line.supply_id)
                      const qty = parseFloat(line.quantity_received) || 0
                      const packSize = line.is_new ? (parseFloat(line.new_conversion_factor) || 1) : (parseFloat(line.pack_size) || 1)
                      const issueUnit = matchedSupply?.unit_of_issue ?? (line.is_new ? line.new_unit_of_issue : line.unit)
                      const willAdd = qty * packSize

                      return (
                        <div key={idx} className="bg-gray-50 rounded-xl p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-4">
                              <label className="text-xs text-gray-400 mb-1 block">Item</label>
                              {line.is_new ? (
                                <div>
                                  <input className={inputClass} value={line.item_name} onChange={e => updateLine(idx, 'item_name', e.target.value)}
                                    placeholder="New item name" />
                                  <span className="text-xs text-amber-600">New item, will be added to inventory</span>
                                </div>
                              ) : (
                                <select className={inputClass} value={line.supply_id ?? ''} onChange={e => {
                                  if (e.target.value === '__new__') {
                                    setLines(prev => prev.map((l, i) => i === idx ? { ...l, is_new: true, supply_id: null } : l))
                                  } else {
                                    selectSupplyForLine(idx, e.target.value)
                                  }
                                }}>
                                  <option value="">{line.item_name || 'Select item'}</option>
                                  {supplies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  <option value="__new__">+ New item: "{line.item_name}"</option>
                                </select>
                              )}
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-gray-400 mb-1 block">
                                Qty {matchedSupply ? `(${matchedSupply.unit_of_receipt}s)` : line.is_new ? '(received unit)' : ''}
                              </label>
                              <input type="number" className={inputClass} value={line.quantity_received} onChange={e => updateLine(idx, 'quantity_received', e.target.value)}
                                placeholder="e.g. 10" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-gray-400 mb-1 block">{matchedSupply ? 'Received As' : 'Unit'}</label>
                              <input className={inputClass} value={matchedSupply ? matchedSupply.unit_of_receipt : line.unit}
                                onChange={e => updateLine(idx, 'unit', e.target.value)} disabled={!!matchedSupply} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-gray-400 mb-1 block">Unit Cost (₦)</label>
                              <input type="number" className={inputClass} value={line.unit_cost} onChange={e => updateLine(idx, 'unit_cost', e.target.value)} />
                            </div>
                            <div className="sm:col-span-2">
                              <button onClick={() => removeLine(idx)} className="text-xs text-red-500 hover:underline px-2 py-2.5">Remove</button>
                            </div>
                          </div>

                          {/* Pack size — how many issue units per item received, editable per delivery */}
                          {!line.is_new && matchedSupply && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 bg-sky-50 border border-sky-100 rounded-lg p-3">
                              <div>
                                <label className="text-xs text-gray-600 mb-1 block font-medium">
                                  Each {matchedSupply.unit_of_receipt} contains how many {matchedSupply.unit_of_issue}{matchedSupply.unit_of_issue.endsWith('s') ? '' : 's'}?
                                </label>
                                <input type="number" className={inputClass} value={line.pack_size} onChange={e => updateLine(idx, 'pack_size', e.target.value)}
                                  placeholder="e.g. 25 for a 25-litre container" />
                              </div>
                              <div className="flex flex-col justify-end">
                                {qty > 0 && packSize > 0 && (
                                  <div className="text-sm font-bold text-sky-700">
                                    {qty} × {packSize} = {willAdd.toLocaleString()} {matchedSupply.unit_of_issue} added to stock
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Conversion setup for new items */}
                          {line.is_new && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 bg-sky-50 border border-sky-100 rounded-lg p-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Issued in (dispensing unit)</label>
                                <input className={inputClass} value={line.new_unit_of_issue} onChange={e => updateLine(idx, 'new_unit_of_issue', e.target.value)}
                                  placeholder="e.g. litre, piece, ml" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">1 {line.unit || 'unit'} = ? {line.new_unit_of_issue || 'issue unit'}</label>
                                <input type="number" className={inputClass} value={line.new_conversion_factor} onChange={e => updateLine(idx, 'new_conversion_factor', e.target.value)}
                                  placeholder="e.g. 25L container = 25 litres → enter 25" />
                              </div>
                              <div className="flex flex-col justify-end">
                                {qty > 0 && packSize > 0 && (
                                  <div className="text-sm font-bold text-sky-700">
                                    = {willAdd.toLocaleString()} {line.new_unit_of_issue || 'units'} added to stock
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Batch Number (optional)</label>
                              <input className={inputClass} value={line.batch_number} onChange={e => updateLine(idx, 'batch_number', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">Expiry Date (optional)</label>
                              <input type="date" className={inputClass} value={line.expiry_date} onChange={e => updateLine(idx, 'expiry_date', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={addLine} className="mt-2 text-xs text-sky-600 font-semibold hover:underline">+ Add another item</button>
                </div>
              )}

              {editingGrId && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-700">
                  Item lines from this delivery cannot be changed here to avoid affecting stock records that may already be in use. To adjust stock levels, use the Inventory tab directly.
                </div>
              )}

              <div className="mb-4">
                <label className={labelClass}>Notes</label>
                <textarea className={inputClass + ' resize-none'} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <div className="flex gap-2">
                <button onClick={saveGoodsReceived} disabled={saving || (!editingGrId && lines.every(l => !l.item_name.trim()))}
                  className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                  style={{ background: 'var(--brand-color)' }}>
                  {saving ? 'Saving...' : editingGrId ? 'Save Changes' : 'Save Delivery'}
                </button>
                <button onClick={resetForm} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
              </div>
            </div>
          )}

          {/* History */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {history.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No deliveries logged yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Date', 'Supplier', 'Invoice', 'Items', 'Amount', 'Payment', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => {
                      const balance = (h.invoice_amount ?? 0) - (h.amount_paid ?? 0)
                      return (
                        <React.Fragment key={h.id}>
                          <tr key={h.id} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500">{new Date(h.delivery_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {h.health_suppliers?.name ?? <span className="text-amber-600 text-xs">No supplier attached</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">{h.invoice_number ?? '-'}</td>
                            <td className="px-4 py-3 text-gray-500">
                              {(h.health_goods_received_items ?? []).length} item{(h.health_goods_received_items ?? []).length !== 1 ? 's' : ''}
                            </td>
                            <td className="px-4 py-3 text-gray-900">
                              {h.invoice_amount ? `₦${h.invoice_amount.toLocaleString()}` : '-'}
                              {balance > 0 && (
                                <div className="text-xs text-red-500">₦{balance.toLocaleString()} owed</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={'text-xs px-2 py-0.5 rounded-full font-semibold capitalize ' +
                                (h.payment_status === 'paid' ? 'bg-green-100 text-green-700' : h.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                                {h.payment_status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={() => startEditDelivery(h)} className="text-xs text-sky-600 hover:underline">Edit</button>
                                {balance > 0 && (
                                  <button onClick={() => { setPayingGrId(payingGrId === h.id ? null : h.id); setPaymentAmountInput('') }}
                                    className="text-xs text-emerald-600 hover:underline">
                                    {payingGrId === h.id ? 'Cancel' : 'Record Payment'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {payingGrId === h.id && (
                            <tr className="bg-emerald-50">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-600">Outstanding: ₦{balance.toLocaleString()} · Record a payment of</span>
                                  <input type="number" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-32 outline-none focus:border-emerald-400"
                                    value={paymentAmountInput} onChange={e => setPaymentAmountInput(e.target.value)} placeholder="Amount ₦" />
                                  <button onClick={() => recordPayment(h)} disabled={recordingPayment || !paymentAmountInput}
                                    className="px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50"
                                    style={{ background: '#10b981' }}>
                                    {recordingPayment ? 'Saving...' : 'Confirm Payment'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}