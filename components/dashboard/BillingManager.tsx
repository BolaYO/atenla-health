'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ServicesManager, type Service } from './ServicesManager'
import { buildWhatsAppLink } from '@/lib/whatsapp'

interface PatientRef {
  id: string
  first_name: string
  last_name: string
  patient_number: string | null
  phone: string | null
  email: string | null
  hmo_provider: string | null
  total_billed: number
  outstanding_balance: number
}

interface ChargeLine {
  service_id: string
  service_name: string
  quantity: string
  unit_price: string
  department: string
}

interface FacilityUserRef {
  id: string
  name: string
  role: string
}

interface Props {
  facilityId: string
  currentUser: FacilityUserRef
}

const DEPARTMENTS = ['Lab', 'Pharmacy', 'Nursing', 'Dental', 'General', 'Specialist']

const RECORD_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'hmo', label: 'HMO' },
  { value: 'nhis', label: 'NHIS' },
]

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-gray-100 text-gray-600',
  billed: 'bg-amber-100 text-amber-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
}

const emptyLine = (department = ''): ChargeLine => ({ service_id: '', service_name: '', quantity: '1', unit_price: '', department })

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-sky-400 transition-colors bg-white'
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1.5 font-medium'

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

interface DispatchPanelProps {
  visit: any
  dispatchEmail: string
  setDispatchEmail: (v: string) => void
  linkAmount: string
  setLinkAmount: (v: string) => void
  generatingLink: boolean
  onGenerateLink: (visit: any) => void
  sendingWhatsApp: boolean
  onSendWhatsApp: (visit: any) => void
  sendingEmail: boolean
  onSendEmail: (visit: any) => void
  dispatchMessage: string
  onClose: () => void
}

function DispatchPanel({
  visit, dispatchEmail, setDispatchEmail, linkAmount, setLinkAmount,
  generatingLink, onGenerateLink, sendingWhatsApp, onSendWhatsApp,
  sendingEmail, onSendEmail, dispatchMessage, onClose,
}: DispatchPanelProps) {
  const patient = visit.patient
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mt-2">
      <div className="text-xs uppercase tracking-widest text-sky-700 font-medium mb-3">Send Bill to Patient</div>
      <div className="text-sm text-gray-700 mb-3">
        Total: <span className="font-bold text-gray-900">₦{visit.total_amount.toLocaleString()}</span>
        {visit.outstanding < visit.total_amount && (
          <span className="text-xs text-gray-400 ml-2">· ₦{visit.outstanding.toLocaleString()} outstanding</span>
        )}
        {visit.bill_sent_at && <span className="text-xs text-gray-400 ml-2">Sent {fmtDateTime(visit.bill_sent_at)} via {visit.bill_sent_via}</span>}
      </div>
      {dispatchMessage && <div className="text-xs text-emerald-600 mb-3">{dispatchMessage}</div>}

      <div className="mb-3">
        {!patient?.email && (
          <div className="mb-2">
            <label className={labelClass}>Patient Email (needed for online payment link)</label>
            <input className={inputClass + ' max-w-xs'} type="email" value={dispatchEmail} onChange={e => setDispatchEmail(e.target.value)} placeholder="patient@email.com" />
          </div>
        )}
        <div className="mb-2">
          <label className={labelClass}>Payment Link Amount (₦) - for part-payment, enter what the patient is ready to pay now</label>
          <input type="number" className={inputClass + ' max-w-40'} value={linkAmount} onChange={e => setLinkAmount(e.target.value)} />
        </div>
        <button onClick={() => onGenerateLink(visit)} disabled={generatingLink || (!patient?.email && !dispatchEmail.trim()) || !linkAmount || parseFloat(linkAmount) <= 0}
          className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
          {generatingLink ? 'Generating...' : visit.payment_link_url ? 'Generate New Link' : 'Generate Payment Link'}
        </button>
        {visit.payment_link_url && (
          <div className="text-xs text-gray-500 mt-2 break-all">
            Current link: <a href={visit.payment_link_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">{visit.payment_link_url}</a>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {patient?.phone && (
          <button onClick={() => onSendWhatsApp(visit)} disabled={sendingWhatsApp}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50" style={{ background: '#22c55e' }}>
            {sendingWhatsApp ? 'Opening...' : 'Send via WhatsApp'}
          </button>
        )}
        {(patient?.email || dispatchEmail.trim()) && (
          <button onClick={() => onSendEmail(visit)} disabled={sendingEmail}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50" style={{ background: '#6366f1' }}>
            {sendingEmail ? 'Sending...' : 'Send via Email'}
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-xs text-gray-600">
          Close
        </button>
      </div>
    </div>
  )
}

export function BillingManager({ facilityId, currentUser }: Props) {
  const [view, setView] = useState<'new' | 'visits' | 'services' | 'payments'>('new')
  const [patients, setPatients] = useState<PatientRef[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [visits, setVisits] = useState<any[]>([])
  const [facilityName, setFacilityName] = useState('')
  const [facilitySupportEmail, setFacilitySupportEmail] = useState<string | null>(null)
  const [linkAmount, setLinkAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New bill form
  const [patientId, setPatientId] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [lines, setLines] = useState<ChargeLine[]>([emptyLine()])

  // Dispatch panel — shown after a bill is generated, or reopened from Visits
  const [dispatchVisit, setDispatchVisit] = useState<any | null>(null)
  const [dispatchEmail, setDispatchEmail] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [dispatchMessage, setDispatchMessage] = useState('')

  // Record payment state
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [paymentMethodInput, setPaymentMethodInput] = useState('cash')

  // Open-visit billing
  const [billingVisitId, setBillingVisitId] = useState<string | null>(null)
  const [openVisitProcedures, setOpenVisitProcedures] = useState<Record<string, { department: string; name: string; count: number }[]>>({})

  // Payments ledger view
  const [payments, setPayments] = useState<any[]>([])
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState(new Date().toISOString().split('T')[0])
  const [customTo, setCustomTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: pats }, { data: svc }, { data: vis }, { data: facility }] = await Promise.all([
      supabase.from('health_patients').select('id, first_name, last_name, patient_number, phone, email, hmo_provider, total_billed, outstanding_balance').eq('facility_id', facilityId).order('first_name'),
      supabase.from('health_services').select('*').eq('facility_id', facilityId).eq('is_active', true).order('name'),
      supabase.from('health_visits')
        .select('*, health_visit_items(*), patient:patient_id(first_name, last_name, patient_number, phone, email)')
        .eq('facility_id', facilityId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('health_facilities').select('name, support_email').eq('id', facilityId).single(),
    ])
    setPatients(pats ?? [])
    setServices(svc ?? [])
    setVisits(vis ?? [])
    setFacilityName(facility?.name ?? 'Atenla Health')
    setFacilitySupportEmail(facility?.support_email ?? null)

    // For open visits, load the procedures captured against them so the
    // cashier can see (and bill from) what's already on record.
    const openVisitIds = (vis ?? []).filter(v => v.status === 'open').map(v => v.id)
    if (openVisitIds.length > 0) {
      const { data: usageLogs } = await supabase.from('health_usage_logs')
        .select('visit_id, department, procedure_name, procedure_instance_id')
        .eq('facility_id', facilityId)
        .eq('usage_type', 'procedure')
        .in('visit_id', openVisitIds)

      const grouped: Record<string, Record<string, { department: string; name: string; instances: Set<string> }>> = {}
      for (const log of usageLogs ?? []) {
        if (!log.visit_id || !log.procedure_name) continue
        const visitGroups = grouped[log.visit_id] ?? (grouped[log.visit_id] = {})
        const key = `${log.department}::${log.procedure_name.toLowerCase()}`
        const entry = visitGroups[key] ?? (visitGroups[key] = { department: log.department, name: log.procedure_name, instances: new Set() })
        entry.instances.add(log.procedure_instance_id)
      }

      const result: Record<string, { department: string; name: string; count: number }[]> = {}
      for (const [visitId, visitGroups] of Object.entries(grouped)) {
        result[visitId] = Object.values(visitGroups).map(g => ({ department: g.department, name: g.name, count: g.instances.size }))
      }
      setOpenVisitProcedures(result)
    } else {
      setOpenVisitProcedures({})
    }

    setLoading(false)
  }

  function resetForm() {
    setPatientId(''); setPatientSearch(''); setDepartment('')
    setVisitDate(new Date().toISOString().split('T')[0])
    setLines([emptyLine()])
    setBillingVisitId(null)
  }

  function updateLine(idx: number, field: keyof ChargeLine, value: string) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'service_id') {
        const svc = services.find(s => s.id === value)
        return { ...l, service_id: value, service_name: svc?.name ?? '', unit_price: svc ? String(svc.price) : '' }
      }
      return { ...l, [field]: value }
    }))
  }

  function addLine() { setLines(prev => [...prev, emptyLine(department)]) }
  function removeLine(idx: number) { setLines(prev => prev.filter((_, i) => i !== idx)) }

  const subtotal = lines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)

  function buildPriceMap() {
    const map = new Map<string, { id: string; price: number }>()
    for (const s of services) {
      map.set(`${s.department ?? ''}::${s.name.toLowerCase()}`, { id: s.id, price: s.price })
    }
    return map
  }

  // Pull a patient's open visit into the bill form, pre-populated from
  // every procedure logged against them, matched to priced services.
  function openGenerateBill(visit: any) {
    const groups = openVisitProcedures[visit.id] ?? []
    const priceMap = buildPriceMap()
    const newLines: ChargeLine[] = groups.map(g => {
      const match = priceMap.get(`${g.department}::${g.name.toLowerCase()}`)
      return {
        service_id: match?.id ?? '',
        service_name: g.name,
        quantity: String(g.count),
        unit_price: match ? String(match.price) : '0',
        department: g.department,
      }
    })
    setLines(newLines.length > 0 ? newLines : [emptyLine(visit.department)])
    setPatientId(visit.patient_id)
    setPatientSearch('')
    setDepartment(visit.department)
    setVisitDate(visit.visit_date)
    setBillingVisitId(visit.id)
    setView('new')
  }

  async function generateBill() {
    const validLines = lines.filter(l => l.service_id && l.quantity)
    if (!patientId || validLines.length === 0) return
    if (!billingVisitId && !department) return

    setSaving(true)
    const supabase = createClient()

    const total = validLines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)
    const patient = patients.find(p => p.id === patientId)

    let visit: any = null
    if (billingVisitId) {
      const { data: updated } = await supabase.from('health_visits').update({
        total_amount: total,
        outstanding: total,
        status: 'billed',
        attended_by: currentUser.id,
      }).eq('id', billingVisitId).select().single()
      visit = updated
    } else {
      const { data: created } = await supabase.from('health_visits').insert({
        facility_id: facilityId,
        patient_id: patientId,
        patient_name: patient ? `${patient.first_name} ${patient.last_name}` : null,
        department,
        attended_by: currentUser.id,
        visit_date: visitDate,
        payment_method: null,
        total_amount: total,
        amount_paid: 0,
        outstanding: total,
        status: 'billed',
      }).select().single()
      visit = created
    }

    let createdItems: any[] = []
    if (visit) {
      for (const l of validLines) {
        const item = {
          visit_id: visit.id,
          service_id: l.service_id,
          service_name: l.service_name,
          department: l.department || department || null,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          total_price: (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0),
        }
        await supabase.from('health_visit_items').insert(item)
        createdItems.push(item)
      }

      if (patient) {
        await supabase.from('health_patients').update({
          total_billed: (patient.total_billed ?? 0) + total,
          outstanding_balance: (patient.outstanding_balance ?? 0) + total,
        }).eq('id', patientId)
      }
    }

    await loadData()
    resetForm()
    setSaving(false)

    if (visit && patient) {
      setDispatchVisit({ ...visit, health_visit_items: createdItems, patient })
      setDispatchEmail(patient.email ?? '')
      setDispatchMessage('')
      setLinkAmount(String(visit.outstanding))
    }
    setView('visits')
  }

  async function generatePaymentLink(visit: any) {
    const patient = visit.patient
    const email = dispatchEmail.trim() || patient?.email
    const amount = parseFloat(linkAmount)
    if (!email || !amount || amount <= 0) return

    setGeneratingLink(true)
    const supabase = createClient()

    // Save email to patient record if it wasn't there before
    if (!patient?.email && visit.patient_id) {
      await supabase.from('health_patients').update({ email }).eq('id', visit.patient_id)
    }

    const reference = `MP-${visit.id.slice(0, 8)}-${Date.now()}`

    try {
      const res = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          amount,
          reference,
          metadata: { vertical: 'health', visit_id: visit.id, patient_id: visit.patient_id, facility_id: facilityId },
        }),
      })
      const data = await res.json()
      if (data.authorization_url) {
        await supabase.from('health_visits').update({
          payment_link_url: data.authorization_url, paystack_reference: data.reference,
        }).eq('id', visit.id)

        const updated = { ...visit, payment_link_url: data.authorization_url, paystack_reference: data.reference }
        setDispatchVisit(updated)
        await loadData()
      } else {
        alert(data.error ?? 'Could not generate payment link')
      }
    } catch (err) {
      alert('Could not generate payment link')
    }
    setGeneratingLink(false)
  }

  async function sendViaWhatsApp(visit: any) {
    const patient = visit.patient
    if (!patient?.phone) return

    const itemsList = (visit.health_visit_items ?? []).map((it: any) => `- ${it.service_name}${it.quantity > 1 ? ` x${it.quantity}` : ''}: ₦${it.total_price.toLocaleString()}`).join('\n')
    const link = visit.payment_link_url ? `\n\nPay online: ${visit.payment_link_url}` : '\n\nYou can pay at the hospital. Cash, card, or transfer accepted.'

    const message = `Hello ${patient.first_name}, here is your bill from ${facilityName}:\n\n${itemsList}\n\nTotal: ₦${visit.total_amount.toLocaleString()}${link}`

    const url = buildWhatsAppLink(patient.phone, message)
    if (!url) return
    window.open(url, '_blank')

    setSendingWhatsApp(true)
    const supabase = createClient()
    await supabase.from('health_visits').update({ bill_sent_at: new Date().toISOString(), bill_sent_via: 'whatsapp' }).eq('id', visit.id)
    await loadData()
    setSendingWhatsApp(false)
    setDispatchMessage('WhatsApp opened with the bill ready to send.')
  }

  async function sendViaEmail(visit: any) {
    const email = dispatchEmail.trim() || visit.patient?.email
    if (!email) return

    setSendingEmail(true)
    const supabase = createClient()

    if (!visit.patient?.email && visit.patient_id) {
      await supabase.from('health_patients').update({ email }).eq('id', visit.patient_id)
    }

    try {
      const res = await fetch('/api/send-bill-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientEmail: email,
          patientName: `${visit.patient?.first_name ?? ''} ${visit.patient?.last_name ?? ''}`.trim(),
          facilityName,
          facilitySupportEmail,
          items: visit.health_visit_items ?? [],
          totalAmount: visit.total_amount,
          outstanding: visit.outstanding,
          paymentLinkUrl: visit.payment_link_url ?? null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        await supabase.from('health_visits').update({ bill_sent_at: new Date().toISOString(), bill_sent_via: 'email' }).eq('id', visit.id)
        await loadData()
        setDispatchMessage(`Email sent to ${email}. Check Resend's dashboard for delivery status.`)
      } else {
        setDispatchMessage(`Email failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch (err) {
      setDispatchMessage('Email failed to send, check your connection and try again.')
    }
    setSendingEmail(false)
  }

  async function recordPayment(visit: any) {
    const amount = parseFloat(paymentAmountInput)
    if (!amount || amount <= 0) return
    setSaving(true)
    const supabase = createClient()

    const newPaid = Math.min(visit.total_amount, visit.amount_paid + amount)
    const newOutstanding = Math.max(0, visit.total_amount - newPaid)
    const newStatus = newOutstanding === 0 ? 'paid' : 'partial'

    await supabase.from('health_visits').update({
      amount_paid: newPaid, outstanding: newOutstanding, status: newStatus,
    }).eq('id', visit.id)

    await supabase.from('health_payments').insert({
      facility_id: facilityId,
      visit_id: visit.id,
      patient_id: visit.patient_id,
      patient_name: visit.patient_name,
      amount,
      payment_method: paymentMethodInput,
      recorded_by: currentUser.id,
    })

    const { data: patient } = await supabase.from('health_patients').select('outstanding_balance').eq('id', visit.patient_id).single()
    if (patient) {
      await supabase.from('health_patients').update({
        outstanding_balance: Math.max(0, (patient.outstanding_balance ?? 0) - amount),
      }).eq('id', visit.patient_id)
    }

    await loadData()
    setPayingVisitId(null)
    setPaymentAmountInput('')
    setPaymentMethodInput('cash')
    setSaving(false)
  }

  async function loadPayments() {
    const supabase = createClient()
    let from: Date, to: Date
    const now = new Date()
    if (dateFilter === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
    } else if (dateFilter === 'week') {
      const day = now.getDay()
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (dateFilter === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    } else {
      from = new Date(customFrom)
      to = new Date(customTo)
      to.setDate(to.getDate() + 1)
    }

    const { data } = await supabase.from('health_payments')
      .select('*, recorder:recorded_by(name), visit:visit_id(department)')
      .eq('facility_id', facilityId)
      .gte('paid_at', from.toISOString())
      .lt('paid_at', to.toISOString())
      .order('paid_at', { ascending: false })

    setPayments(data ?? [])
  }

  useEffect(() => { if (view === 'payments') loadPayments() }, [view, dateFilter, customFrom, customTo])

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading billing...</div>

  return (
    <div>
      <div className="flex gap-1 mb-6 flex-wrap">
        <button onClick={() => setView('new')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'new' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'new' ? { background: 'var(--brand-color)' } : undefined}>
          Generate Bill
        </button>
        <button onClick={() => setView('visits')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'visits' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'visits' ? { background: 'var(--brand-color)' } : undefined}>
          Visits
        </button>
        <button onClick={() => setView('payments')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'payments' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'payments' ? { background: 'var(--brand-color)' } : undefined}>
          Payments
        </button>
        <button onClick={() => setView('services')}
          className={'px-4 py-2 rounded-xl text-sm font-semibold transition-colors ' + (view === 'services' ? 'text-white' : 'bg-gray-100 text-gray-600')}
          style={view === 'services' ? { background: 'var(--brand-color)' } : undefined}>
          Services &amp; Pricing
        </button>
      </div>

      {view === 'services' && <ServicesManager facilityId={facilityId} />}

      {view === 'payments' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {(['today', 'week', 'month', 'custom'] as const).map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                className={'px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors ' + (dateFilter === f ? 'text-white' : 'bg-gray-100 text-gray-600')}
                style={dateFilter === f ? { background: 'var(--brand-color)' } : undefined}>
                {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'today' ? 'Today' : 'Custom'}
              </button>
            ))}
            {dateFilter === 'custom' && (
              <>
                <input type="date" className={inputClass + ' max-w-40'} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" className={inputClass + ' max-w-40'} value={customTo} onChange={e => setCustomTo(e.target.value)} />
              </>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Total Inflow</div>
              <div className="text-2xl font-black text-gray-900">₦{payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Transactions</div>
              <div className="text-2xl font-black text-gray-900">{payments.length}</div>
            </div>
            {['cash', 'pos', 'transfer'].map(method => {
              const total = payments.filter(p => p.payment_method === method).reduce((s, p) => s + p.amount, 0)
              return (
                <div key={method} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1 capitalize">{method}</div>
                  <div className="text-2xl font-black text-gray-900">₦{total.toLocaleString()}</div>
                </div>
              )
            })}
          </div>

          {/* Ledger */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {payments.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No payments recorded for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Date & Time', 'Patient', 'Department', 'Amount', 'Method', 'Recorded By'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{fmtDateTime(p.paid_at)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.patient_name}</td>
                        <td className="px-4 py-3 text-gray-500">{p.visit?.department ?? '-'}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₦{p.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{p.payment_method}</td>
                        <td className="px-4 py-3 text-gray-500">{p.recorder?.name ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'new' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-2xl">
          <div className="font-semibold text-gray-900 mb-1">{billingVisitId ? 'Generate Bill ; Open Visit' : 'Generate Bill'}</div>
          <div className="text-xs text-gray-400 mb-4">
            {billingVisitId
              ? "Pre-filled from everything logged against this patient's visit. Review, adjust prices or quantities, add anything missed, then generate."
              : 'Record the services rendered. The bill is sent to the patient, payment can happen online or in person, recorded separately under Visits.'}
          </div>

          <div className="mb-4">
            <label className={labelClass}>Patient *</label>
            {billingVisitId ? (
              (() => {
                const p = patients.find(pt => pt.id === patientId)
                return <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-700">{p ? `${p.first_name} ${p.last_name}` : 'Patient'}{p?.patient_number ? ` (${p.patient_number})` : ''}</div>
              })()
            ) : (
              <>
                <input className={inputClass + ' mb-2'} placeholder="Search patient by name, phone, or patient number..."
                  value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
                <select className={inputClass} value={patientId} onChange={e => setPatientId(e.target.value)}>
                  <option value="">Select patient</option>
                  {patients
                    .filter(p => !patientSearch || `${p.first_name} ${p.last_name} ${p.phone ?? ''} ${p.patient_number ?? ''}`.toLowerCase().includes(patientSearch.toLowerCase()))
                    .map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} {p.patient_number ? `(${p.patient_number})` : ''}{p.hmo_provider ? ` - ${p.hmo_provider}` : ''}</option>)}
                </select>
              </>
            )}
          </div>

          {!billingVisitId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Department *</label>
                <select className={inputClass} value={department} onChange={e => setDepartment(e.target.value)}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Visit Date</label>
                <input type="date" className={inputClass} value={visitDate} onChange={e => setVisitDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className={labelClass}>Charges</label>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx}>
                  <div className="flex gap-2 items-start">
                    <select className={inputClass + ' max-w-28'} value={line.department} onChange={e => updateLine(idx, 'department', e.target.value)}>
                      <option value="">Dept</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className={inputClass} value={line.service_id} onChange={e => updateLine(idx, 'service_id', e.target.value)}>
                      <option value="">Select service</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name} (₦{s.price.toLocaleString()})</option>)}
                    </select>
                    <input type="number" className={inputClass + ' max-w-20'} placeholder="Qty"
                      value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                    <input type="number" className={inputClass + ' max-w-30'} placeholder="Unit Price"
                      value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} />
                    <button onClick={() => removeLine(idx)} className="text-xs text-red-500 hover:underline pt-3 whitespace-nowrap">Remove</button>
                  </div>
                  {!line.service_id && line.service_name && (
                    <div className="text-xs text-amber-600 mt-1 ml-1">
                      Logged as "{line.service_name}" but no matching priced service found, select one above, or price it in Services &amp; Pricing later.
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addLine} className="mt-2 text-xs text-sky-600 font-semibold hover:underline">+ Add another charge</button>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-lg font-black text-gray-900">₦{subtotal.toLocaleString()}</span>
          </div>

          <div className="flex gap-2">
            <button onClick={generateBill} disabled={saving || !patientId || (!billingVisitId && !department) || lines.every(l => !l.service_id)}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand-color)' }}>
              {saving ? 'Generating...' : 'Generate Bill'}
            </button>
            {billingVisitId && (
              <button onClick={() => { resetForm(); setView('visits') }} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'visits' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {visits.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No visits recorded yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visits.map(v => (
                <div key={v.id} className="px-4 py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{v.patient?.first_name} {v.patient?.last_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{v.department}</span>
                        <span className={'text-xs px-2 py-0.5 rounded-full font-semibold capitalize ' + (STATUS_COLORS[v.status] ?? '')}>{v.status === 'open' ? 'Open; not yet billed' : v.status}</span>
                        {v.bill_sent_at && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">Bill sent</span>}
                      </div>
                      {v.status === 'open' ? (
                        <div className="text-xs text-gray-400 mt-1">
                          {fmtDate(v.visit_date)} ·{' '}
                          {(openVisitProcedures[v.id] ?? []).length === 0
                            ? 'No procedures logged yet'
                            : (openVisitProcedures[v.id] ?? []).map(g => `${g.name} (${g.department})${g.count > 1 ? ` x${g.count}` : ''}`).join(', ')}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1">{fmtDate(v.visit_date)} · {(v.health_visit_items ?? []).map((i: any) => i.service_name).join(', ')}</div>
                      )}
                    </div>
                    <div className="text-right">
                      {v.status === 'open' ? (
                        <div className="text-xs text-gray-400">Not yet priced</div>
                      ) : (
                        <>
                          <div className="font-bold text-gray-900">₦{v.total_amount.toLocaleString()}</div>
                          {v.outstanding > 0 && <div className="text-xs text-red-500">₦{v.outstanding.toLocaleString()} owed</div>}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-2 items-center">
                    {v.status === 'open' ? (
                      <button onClick={() => openGenerateBill(v)}
                        className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand-color)' }}>Generate Bill</button>
                    ) : (
                      <>
                        {v.outstanding > 0 && (
                          payingVisitId !== v.id ? (
                            <button onClick={() => { setPayingVisitId(v.id); setPaymentAmountInput('') }}
                              className="text-xs text-emerald-600 hover:underline">Record Payment</button>
                          ) : null
                        )}
                        {dispatchVisit?.id !== v.id && (
                          <button onClick={() => { setDispatchVisit(v); setDispatchEmail(v.patient?.email ?? ''); setDispatchMessage(''); setLinkAmount(String(v.outstanding)) }}
                            className="text-xs text-sky-600 hover:underline">{v.bill_sent_at ? 'Resend Bill' : 'Send Bill'}</button>
                        )}
                      </>
                    )}
                  </div>

                  {payingVisitId === v.id && (
                    <div className="flex items-center gap-2 flex-wrap bg-emerald-50 rounded-lg p-2 mt-2">
                      <span className="text-xs text-gray-600">Amount</span>
                      <input type="number" className="px-2 py-1 rounded-lg border border-gray-200 text-sm w-28 outline-none focus:border-emerald-400"
                        value={paymentAmountInput} onChange={e => setPaymentAmountInput(e.target.value)} />
                      <select className="px-2 py-1 rounded-lg border border-gray-200 text-sm outline-none focus:border-emerald-400"
                        value={paymentMethodInput} onChange={e => setPaymentMethodInput(e.target.value)}>
                        {RECORD_PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <button onClick={() => recordPayment(v)} disabled={saving || !paymentAmountInput}
                        className="px-3 py-1 rounded-lg text-white text-xs font-bold disabled:opacity-50" style={{ background: '#10b981' }}>
                        Confirm
                      </button>
                      <button onClick={() => setPayingVisitId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                    </div>
                  )}

                  {dispatchVisit?.id === v.id && (
                    <DispatchPanel
                      visit={dispatchVisit}
                      dispatchEmail={dispatchEmail}
                      setDispatchEmail={setDispatchEmail}
                      linkAmount={linkAmount}
                      setLinkAmount={setLinkAmount}
                      generatingLink={generatingLink}
                      onGenerateLink={generatePaymentLink}
                      sendingWhatsApp={sendingWhatsApp}
                      onSendWhatsApp={sendViaWhatsApp}
                      sendingEmail={sendingEmail}
                      onSendEmail={sendViaEmail}
                      dispatchMessage={dispatchMessage}
                      onClose={() => setDispatchVisit(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}