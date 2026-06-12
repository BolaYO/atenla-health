### VERTICAL 2: Healthcare and Pharmaceuticals — STATUS UPDATE (June 2026)

**Status:** Live — Medics Partners pilot, deployed at health.atenla.ng

Cross-referencing the "Unique modules" list against `atenla-health/docs/PROGRESS.md`:

| Unique module (as specified) | Status |
|---|---|
| Individual dispensing accountability (named staff, named patient/department, timestamp) | **Done** — Usage Log records `logged_by`, `patient_id`, `procedure_instance_id`, timestamped |
| Consumption vs revenue reconciliation (reagents/consumables used vs billed) | **Done** — Reports → Operations Overview → Procedure Reconciliation, flags performed-but-unbilled |
| Patient billing with HMO and NHIS support | **Partial** — Paystack online + cash/manual payment methods logged with method tracking; HMO/NHIS as distinct payer types not yet modeled |
| Department P&L (pharmacy, lab, dental, general, specialist as profit centres) | **Done** (cost side) — Reports → Operations Overview → Procedure Cost Audit gives per-procedure margin by department, correctly deriving cost-per-issue-unit from received-unit cost ÷ conversion factor. Revenue side via Reports → Billing Summary (by department) |
| Procurement officer approval workflow | **Done** — via Staff permission model (`allowed_modules` including 'approvals'), not a separate procurement-specific flow |
| Daily allocation system (departments submit daily stock requests, procurement approves/releases) | **Done** — Dispensing Requests: pending → approved → ready → collected, with badge counts |
| Anomaly flagging (consumption significantly higher than billed activity) | **Done** — Reconciliation report's "gap" and "gap value" columns serve this; Cost Audit flags negative/thin margins |

**Beyond the original spec, also built:**
- Configurable departments per facility (`health_departments`) — not hardcoded, addresses the "terminology mapping" concept at the data layer, not just labels
- Full patient journey: Front Desk check-in (with reason for visit) → Vitals (Nursing, with badge notification) → open visit → any department logs procedures against it → Generate Bill
- Staff/permission model: `is_admin`, `allowed_departments[]`, `allowed_modules[]`, forced password change on first login, admin-triggered password reset
- Branding (logo + brand color) on facility record, surfaced in dashboard header and printed reports
- Reports: Operations Overview, Billing Summary, Inventory Snapshot, Patients — each with date-range filtering, Print (scoped per-table with facility branding header), and Excel export

**Genuinely not yet built (real gaps, not just unconfirmed):**
- **Results Delivery** — lab/imaging results attached to a procedure instance and delivered to patient/referring doctor. This is the next build (spec below).
- **Orders/Queue routing** — a consultant logs orders that route to Lab/Pharmacy/Billing/Nursing as a pending queue per department, rather than each department needing independent knowledge of what's needed for a patient. This is "Phase 2/3 EMR" territory per the original spec's EMS integration phasing.
- HMO/NHIS as distinct payer types with their own reconciliation logic (currently just "payment method" tagging)

**Architectural note for the Ring model:** the configurable-departments + staff-permissions work done for Atenla Health is exactly the kind of "configuration profile per vertical" Ring 2 describes (Section 2.6, Staff Module — "Role names: Defined per vertical"). This suggests the Ring 2 configuration system doesn't need to be built from scratch in Phase 3 — Atenla Health's implementation is close to a working reference for what that configuration layer should look like for at least the Staff and Inventory modules.
