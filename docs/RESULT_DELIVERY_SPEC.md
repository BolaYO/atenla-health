# Result Delivery — Specification

**Status:** Spec — not yet built
**Depends on:** Usage Log / open-visit model, Cloudinary (already configured), WhatsApp/email dispatch pattern (already built for Billing)

---

## 1. The Problem

A diagnostic test or imaging study is logged today as a **procedure** in Usage Log — it consumes reagents/film, gets costed, gets billed. But its actual *output* — the result itself — has nowhere to live. For a diagnostic center, the result *is* the product; for a hospital lab, it's the thing the consultant is waiting on to make a decision. Right now that result lives outside the system (paper, a separate PACS, a phone call), which breaks the "one continuous record" story the rest of Atenla Health tells.

## 2. Scope

A **result** attaches to a `procedure_instance_id` (the same grouping key Usage Log already creates for a procedure and its consumables). A result can be:

- **A file** (PDF lab report, X-ray/ultrasound image, scanned handwritten result) — stored via Cloudinary
- **Structured values** for common tests (e.g. Full Blood Count: Hb, WBC, Platelets, each with a normal range and a flag if out of range) — stored as JSON on the result record, no file required, but a file can *also* be attached

A result has a status: `pending` (procedure logged, no result yet) → `ready` (result entered/uploaded, not yet delivered) → `delivered` (sent to patient and/or referring doctor).

## 3. Data Model

```sql
create table if not exists health_results (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references health_facilities(id),
  procedure_instance_id uuid not null,
  visit_id uuid references health_visits(id),
  patient_id uuid references health_patients(id),
  department text,
  procedure_name text,
  result_type text not null default 'file', -- 'file' | 'structured' | 'both'
  file_url text,            -- Cloudinary URL, nullable
  structured_values jsonb,  -- e.g. [{ "label": "Hemoglobin", "value": "10.2", "unit": "g/dL", "range": "12-16", "flag": "low" }]
  notes text,
  status text not null default 'pending', -- 'pending' | 'ready' | 'delivered'
  entered_by uuid references health_facility_users(id),
  entered_at timestamptz,
  delivered_at timestamptz,
  delivered_via text, -- 'whatsapp' | 'email' | 'both'
  referring_doctor_name text,
  referring_doctor_contact text,
  created_at timestamptz default now()
);

alter table health_results enable row level security;
create policy "Facility users can access own results" on health_results
  for all to authenticated
  using (facility_id in (select facility_id from health_facility_users where auth_user_id = auth.uid() and is_active = true));
```

**Referring doctor fields** are captured optionally at Front Desk check-in (a small addition to that form: "Referred by" name + phone/email, stored on the visit or carried into the result record) — relevant for hospitals where an external doctor is waiting on the result, and for diagnostic centers where most patients arrive *with* a referral.

## 4. Workflow

1. **Procedure logged** (existing flow, unchanged) — Lab/Imaging staff log "Full Blood Count" or "Abdominal Ultrasound" as a procedure in Usage Log against the patient's open visit. A `health_results` row is created automatically with `status = 'pending'` the moment the procedure is logged — this is what makes the "Results" tab's pending list possible without a separate manual step.

2. **Result entered** — on the **Results** tab, the pending list shows procedures awaiting a result (same reconciliation pattern as Billing's "potential unbilled work"). Staff click a pending item and either:
   - Upload a file (PDF/image) → Cloudinary, via a route following the same pattern as `upload-logo`
   - Fill structured values, if the procedure has a known template (FBC, Widal, Urinalysis, etc. — a small set of common-test templates defined per facility, or left fully free-form initially)
   - Add notes
   
   Saving sets `status = 'ready'`, `entered_by`, `entered_at`.

3. **Result delivered** — from the same Results tab, a "Send Result" action mirrors Billing's dispatch panel: WhatsApp (`buildWhatsAppLink`, message includes a summary + file link if present) and/or Email (Resend, same sender pattern as bills, with the file as an attachment or a Cloudinary link). If a referring doctor's contact was captured, the result can be sent to them as well as the patient — two recipients, one send action. Sets `status = 'delivered'`, `delivered_at`, `delivered_via`.

## 5. UI: Results Tab

New tab `results`, module key for Staff permissions (Lab/Imaging/Pathology staff get this; Front Desk/Billing typically don't).

- **Pending** section: list of procedure instances with `status = 'pending'`, grouped by department — "Full Blood Count — Bola Adewale — logged 2 hours ago." Click to enter a result.
- **Ready, not yet delivered** section: results entered but not sent — a queue for whoever handles delivery (could be the same person, could be Front Desk on their way out).
- **Delivered** section (collapsed/filterable by date): history.

This three-section structure mirrors the Vitals tab's "checked in, vitals pending" pattern and the Billing tab's "open visits, generate bill" pattern — same shape, different domain.

## 6. Structured Result Templates (optional, can phase)

For the most common tests, a predefined set of fields with normal ranges makes results faster to enter and lets the system flag abnormal values automatically (useful for the "result ready" notification — "2 values flagged" is more useful than just "result ready"). Suggested initial templates: Full Blood Count, Malaria Parasite (qualitative), Widal Test, Urinalysis, Lipid Profile, Liver Function Test, Renal Function Test.

Templates are **facility-configurable** (admin defines fields/ranges per test name in Settings or Services), consistent with the "departments are facility-configurable" pattern already established — no hardcoded medical templates baked into the codebase, which also keeps this usable for a diagnostic center with a different test menu.

Tests with no template default to file-only or free-text result entry — nothing blocks delivery just because a template doesn't exist yet.

## 7. Reporting Integration

A small addition to Reports: a **"Results Turnaround"** metric (time from procedure logged to result delivered, by department) — useful operationally ("Lab results average 3 hours, Imaging averages 1 day") and a credible thing to show a hospital administrator evaluating the platform.

## 8. What This Does NOT Do (explicitly out of scope for v1)

- No PACS/DICOM integration — image results are stored as standard image files (JPEG/PNG/PDF export from whatever imaging device), not native DICOM viewing
- No automated lab equipment integration (LIS) — results are entered manually or uploaded as files, not pulled automatically from analyzers
- No patient portal / self-service result retrieval — delivery is push-only (WhatsApp/email), matching the existing billing dispatch model

These are reasonable Phase 2/3 items if a pilot facility specifically needs them, but v1 closes the "order → perform → bill → result delivered" loop without requiring hardware integration — which is what makes it buildable in a similar timeframe to Billing.

## 9. Build Order

1. `health_results` table + RLS (SQL above)
2. Auto-create `pending` result row when a procedure is logged in Usage Log (one extra insert in the existing flow)
3. Results tab: Pending list + entry form (file upload via Cloudinary route + free-text notes; structured templates can follow)
4. Ready/Delivered sections + Send Result dispatch (reuse `buildWhatsAppLink` and the Resend pattern from Billing)
5. Referring doctor capture at Front Desk (small addition)
6. Structured templates (phase 2 of this module)
7. Results Turnaround report (phase 2 of this module)

Steps 1–4 deliver the core "order → result → delivered" loop and are comparable in size to what Billing took. Steps 5–7 are incremental enhancements that can follow once the core is in use.
