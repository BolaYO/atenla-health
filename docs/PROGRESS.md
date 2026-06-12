# Atenla Health — Progress

**Live at:** https://www.health.atenla.ng
**Pilot facility:** Medics Partners (Lagos)
**Stack:** Next.js, Supabase (Postgres + Auth + RLS), Paystack, Resend, Cloudinary

This document summarizes what's been built, how it's structured, and what's next. It's written so a new developer (or a future session) can pick this up without re-deriving the architecture.

---

## 1. Core Concept

Atenla Health is a **healthcare business operations platform** built on a shared business engine: track what you have (Inventory), track what comes in (Procurement), track what gets used (Usage Log), track what gets billed and paid (Billing), and reconcile all three (Reports). Everything is scoped to a `facility_id`, so the same codebase serves multiple healthcare facilities — each with their own departments, services, pricing, staff, and branding.

The healthcare-specific layer sits on top of this engine: patients, visits, procedures, vitals, and clinical staff roles. The underlying data model is deliberately generic enough that the same engine could serve a diagnostic center, pharmacy, or non-healthcare business (distribution, manufacturing, retail) with configuration changes rather than code changes — see Section 9.

---

## 2. Core Modules

### Inventory
Tracks supplies with a **received unit vs. issue unit** distinction that runs through the whole system: a supply might be *received* in packs (e.g. a pack of 50 centrifuge tubes costing ₦10,000) but *issued/used* in pieces. `conversion_factor` (50, in this example) converts between them. `unit_cost` is always the cost of one **received** unit; cost-per-issue-unit is derived as `unit_cost / conversion_factor` everywhere stock is valued (Inventory's "Estimated Stock Value" card, the Reports → Inventory Snapshot, and the Cost Audit report all use this same derivation — this was a recurring bug source and is now fixed consistently across all three).

### Procurement
Suppliers, purchase orders, and goods-received tracking. Includes a "parse procurement" route for importing delivery data.

### Dispensing & Usage Log
Staff request supplies (Dispensing Requests — pending → approved → ready → collected, with a badge showing pending counts to admins/procurement). The **Usage Log** records what's actually consumed, with two usage types:
- **Procedure**: a clinical procedure (e.g. "Suturing") with multiple consumables itemized under one `procedure_instance_id`. This automatically finds-or-creates an **open visit** for the patient (status `'open'`) — the foundation for the whole patient-journey flow.
- **Spillage/Damage**: wastage tracking, rolled up by department in Reports.

### Patients & Billing
Patients have visits; visits can be **open** (in progress, not yet billed) or **billed**. The open-visit model means: as departments log procedures against a patient throughout their visit, those procedures accumulate under one visit record. When ready, **Generate Bill** on an open visit auto-populates charge lines from the captured procedures (grouped by department, price-matched via `health_services`, with warnings for unmatched/unpriced procedures), and the admin can finalize.

Billing supports:
- **Paystack payment links** (test mode currently) — generates a link for the outstanding amount or a custom (part-payment) amount, with webhook-based confirmation routed through itan-platform's existing webhook (extended with `vertical: 'health'` metadata routing).
- **WhatsApp/email dispatch** of bills (Resend, sender `"{facilityName} via Atenla Health <hello@atenla.ng>"`, reply-to facility support email).
- **Payments ledger** (`health_payments`) — every payment recorded with method, staff, and Paystack reference; a "Payments" tab shows totals by method with date filters.
- `transaction_fee_pct` on `health_facilities` — inactive toggle for future Atenla commission on transactions.

### Reporting & Reconciliation
Four report types, each with date-range filtering (Today/Week/Month/Custom), Print, and Download Excel:

- **Operations Overview** — Procedure Reconciliation (usage vs. billed, flags procedures performed but not billed), Procedure Cost Audit (consumable cost vs. price, flags negative/thin margins), and Spillage & Damage by department.
- **Billing Summary** — charges billed by department, payments by method, with revenue totals (billed/collected/outstanding).
- **Inventory Snapshot** — current stock levels and value (point-in-time, uses the corrected cost-per-issue-unit valuation).
- **Patients** — visits and total billed per patient for the period.

Each report's Print button shows **only that table** (other sections are temporarily hidden, restored via the `afterprint` event) with a header showing the facility logo, name, report title, and date range — so a printed page is self-explanatory out of context.

**Not yet built**: Procurement Summary and Dispensing-Stock (requests/approvals log) report types — same pattern, straightforward to add next.

---

## 3. Staff, Departments & Permissions

**Departments are facility-configurable** (`health_departments` table) — no longer hardcoded. An admin can name departments freely ("Imaging", "Phlebotomy", "Administration", whatever fits the practice).

**Staff** (`health_facility_users`) have:
- `is_admin` — full access to everything, including Staff and Settings tabs
- `allowed_departments[]` — which departments they're tagged to (for non-admins)
- `allowed_modules[]` — which dashboard tabs they can see (Inventory, Procurement, Dispensing, Approvals, Front Desk, Vitals, Patients, Billing, Reports, Notifications)
- `must_change_password` — forces a password-change flow on first login (or after an admin-triggered reset)

The **Staff** tab (admin-only) lets the admin manage departments and staff: add staff (creates a Supabase auth account + temp password via a service-role API route), edit permissions, deactivate/reactivate, and **reset password** (generates a new temp password and re-triggers the forced-change flow — for lost passwords).

**Backward compatibility**: staff records not yet migrated to the new permission model fall back to the old role-based `ROLE_TABS` mapping, so nothing broke during rollout.

**Security note**: `setTab` in the dashboard is permission-checked against `visibleTabs` — this closed an earlier bug where the Overview page's quick-links could navigate to tabs outside a user's permissions regardless of their assigned modules.

---

## 4. Patient Journey: Front Desk → Vitals → Clinical

This reflects the real-world workflow (not the original "front desk does everything" assumption):

1. **Front Desk** registers/checks in a patient (existing or new), records the **Reason for Visit** (`chief_complaint`), and creates/finds the patient's open visit for today (`checked_in_at`, `checked_in_by`).
2. **Vitals** (Nursing) shows everyone checked in today with their reason for visit, and lets a nurse record vitals (BP, temp, pulse, respiratory rate, SpO2, weight, height, notes) — repeatable, each entry timestamped and name-stamped (`health_vitals` table).
3. A **red badge** on the Vitals tab shows how many checked-in patients are still waiting for vitals — appears the moment Front Desk checks someone in, clears as soon as a nurse records vitals.
4. From here, any department can log a procedure against the patient via Usage Log — it attaches to the same open visit (`findOrCreateOpenVisit` checks for an existing open visit first).

**Not yet built** (named Phase 2 — see Section 9): the consultant-orders-routing layer, where a doctor logs what's needed and Lab/Pharmacy/Billing/Nursing each see a queue of pending orders for that patient, instead of each department needing to know independently what to do.

---

## 5. Branding & Settings

A **Settings** tab (admin-only) lets the facility upload a logo (via a Cloudinary-backed upload route, using `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`) and pick a brand color. The logo appears in the dashboard header and on printed reports. The brand color is stored but not yet used to re-theme the internal dashboard UI (intentional — it's scoped for patient-facing documents).

The favicon currently reuses Atenla's main orange "A" mark (`public/favicon.svg`, copied from itan-platform) — a health-specific variant can be swapped in later without code changes beyond the file itself.

---

## 6. Deployment

- **itan-platform**: deployed via Vercel CLI (no git remote for this local copy). The Paystack webhook (`/api/paystack-webhook`) was extended with vertical routing — `metadata.vertical === 'health'` routes to `handleHealthPayment()`, otherwise falls through to the original Atenla Market order logic. Already live and confirmed working with a test payment.
- **atenla-health**: separate repo (`github.com/BolaYO/atenla-health`), separate Vercel project, deployed to `health.atenla.ng` (subdomain + CNAME configured, DNS propagated). Environment variables set: Supabase (URL/anon/service-role), Paystack (test keys), Resend, Cloudinary, and `NEXT_PUBLIC_SITE_URL=https://www.health.atenla.ng` (used as the Paystack callback URL — must point to the live site, not localhost).

**Known build-time gotcha**: any SDK client (`Resend`, `Cloudinary`, etc.) that's instantiated at module top-level using `process.env.*` can fail Next.js's build-time analysis if the env var isn't available at that stage — instantiate inside the request handler instead.

---

## 7. Database Notes

Key tables added/extended this phase: `health_departments`, `health_vitals`, `health_payments`, `health_facility_users` (+ `is_admin`, `allowed_departments[]`, `allowed_modules[]`, `must_change_password`), `health_visits` (+ `checked_in_at`, `checked_in_by`, `chief_complaint`, `payment_link_url`, `paystack_reference`, `bill_sent_at`, `bill_sent_via`), `health_visit_items` (+ `department`), `health_usage_logs` (+ `visit_id`, `procedure_instance_id`), `health_supplies` (`unit_cost`, `conversion_factor` — pre-existing but newly load-bearing), `health_facilities` (+ `brand_color`, `transaction_fee_pct`).

**RLS pattern**: most tables use `facility_id in (select facility_id from health_facility_users where auth_user_id = auth.uid() and is_active = true)`. For admin-scoped operations on `health_facility_users` itself (where a naive self-referential policy would recurse), a `security definer` function `is_admin_in_facility(facility_id)` with `set row_security = off` is used to check admin status without triggering RLS recursion.

---

## 8. Strategic Q&A (captured for reference)

**"Can this work for a diagnostic center?"** — Yes, with configuration, not new code: departments (Lab, Imaging), services/prices (Full Blood Count, Ultrasound, etc.), and staff permissions are all admin-configurable. Inventory/cost-tracking, billing with online payment, and reconciliation all apply directly. The one named gap is **Results Delivery** (Section 9).

**Multi-vertical potential** (for the eventual atenla.ng rethink): the same engine — inputs in (Procurement), stock tracked (Inventory), something consumes inputs and produces value (Usage Log/Production), customer billed and paid (Billing) — maps onto distribution (whiskey distributor), manufacturing (coconut processing, fragrance), agriculture/retail (poultry), and fashion production, with "patient" → "customer" and "procedure" → "order/production run". A multistore pharmacy with consultations is the closest re-skin of what already exists.

---

## 9. Next Steps

**Immediate / small:**
- Procurement Summary and Dispensing-Stock report types (same pattern as the four already built)
- Email-the-report (compile a report into an HTML email via Resend) — natural to build alongside Results Delivery, since both involve packaging data for external delivery

**Results Delivery (next major module):**
When a Lab/Imaging procedure is logged in Usage Log, attach a **result** to that procedure instance — file upload (PDF/image) via Cloudinary, or structured values for common tests. A "Results" tab shows pending results (procedures logged without one yet — same reconciliation pattern used for billing gaps). Delivery reuses the existing WhatsApp/email dispatch pattern built for billing. This closes the loop: order → perform → bill → **result delivered**, all from one visit record — and directly strengthens the diagnostic-center pitch.

**Orders/Queue Routing (Phase 2, larger):**
A consultant logs orders (e.g. "Lab: FBC", "Pharmacy: dispense X") against a patient's open visit; each department sees a queue of pending orders for patients in their department, instead of relying on paper files or independent knowledge of what's needed. Structurally builds on the open-visit model already in place, but is a genuinely new "orders" concept — deserves its own focused session.

**Dynamic departments propagation:**
`health_departments` (admin-configurable) exists and is used by Staff management, but `DispensingManager`, `UsageLogManager`, `BillingManager`, `ServicesManager`, and `InventoryManager` still reference a hardcoded department list in places. Propagating to read from `health_departments` (and filtering by `allowed_departments` for non-admins) is mechanical but touches ~5 files — do this once a facility actually needs departments beyond the original hardcoded six.

**Landing page / multi-vertical positioning:**
Once Atenla Health is a complete, polished case study, revisit atenla.ng's "Who it's for" section — either restructure around operation-type verticals (Healthcare, Distribution, Manufacturing, Retail) with Atenla Health as proof, or keep atenla.ng commerce-vendor-focused and give each vertical (health.atenla.ng, future subdomains) its own tailored landing page under a higher-level Atenla Group framing. Worth its own session — this is a positioning decision, not a copy edit.
