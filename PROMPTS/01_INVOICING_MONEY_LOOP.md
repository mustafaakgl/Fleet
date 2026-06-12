# PROMPT 01 — Money Loop: Assignment → Invoice → ZUGFeRD/XRechnung → DATEV Export

> Copy everything below this line into your coding agent as a single task brief.

---

## Role & Context

You are a senior full-stack engineer working on **Fleet**, a multi-tenant German fleet-operations SaaS.

- **Backend:** NestJS 11, Prisma 6 + PostgreSQL 16, BullMQ/Redis, S3-compatible object storage, class-validator DTOs, JWT auth with roles (`admin | boss | accounting | office | driver | customer`), tenant isolation via a Prisma extension that auto-scopes every query by `tenantId` (see `src/tenant/tenant-prisma.extension.ts` — every new model MUST be registered in `tenant-scoped-models.ts`).
- **Frontend:** Next.js 15 App Router, Tailwind 4, shadcn/Radix, react-hook-form + Zod, axios client in `lib/api.ts`, i18n (de/en/tr) via i18next with JSON locale files.
- **Existing domain objects you will build on:** `Assignment` (driverId, vehicleId, companyId, workDate, startTime/endTime, expectedDailyRevenue, status incl. `completed`), `Company` (the tenant's customer), `Tenant`, `AuditLog`, `Document`.

Build the **complete order-to-cash loop**: completed assignments become invoice lines, invoices are issued as legally compliant German e-invoices (ZUGFeRD 2.3 hybrid PDF and XRechnung 3.x UBL), receivables are tracked with a 3-stage Mahnung process, and everything exports to DATEV (Buchungsstapel EXTF CSV). This is the highest-value feature in the product; treat correctness and immutability as non-negotiable.

## Non-negotiable legal & accounting rules (Germany)

1. **§14 UStG mandatory invoice fields:** full supplier name/address, customer name/address, supplier tax number or USt-IdNr., invoice date, sequential gapless invoice number, quantity & description of services, service period (Leistungszeitraum), net amount per tax rate, tax rate(s) and tax amount, gross total. Support 19%, 7%, 0% (innergemeinschaftliche Leistung / Reverse Charge §13b with the required wording "Steuerschuldnerschaft des Leistungsempfängers").
2. **Gapless per-tenant invoice numbering.** Format configurable per tenant (default `RE-{YYYY}-{00001}`). Implement with a per-tenant, per-year sequence table updated inside the same DB transaction as invoice finalization (`SELECT ... FOR UPDATE`). Never reuse, never gap. Draft invoices have NO number; the number is assigned only at finalization.
3. **GoBD immutability:** once finalized, an invoice is immutable — no edits, no deletion. Corrections happen exclusively via cancellation invoice (Stornorechnung, full negative) or credit note (Gutschrift), each with its own number from the same sequence and a reference to the original. Store the rendered PDF/XML artifacts in object storage at finalization time and never regenerate them (render-once, store-forever).
4. **E-invoice formats:** generate both (a) **ZUGFeRD 2.3 (EN 16931 profile)** — a PDF/A-3 with embedded Factur-X XML — and (b) **XRechnung 3.x UBL XML** for public-sector customers (toggle per Company, with Leitweg-ID field). Use a well-maintained library (e.g. `node-zugferd`, or generate EN 16931 UBL/CII XML directly and embed via `pdf-lib`); validate output against the EN 16931 schematron in tests. Money is **integer cents** everywhere; tax rounding per line, then summed (configurable to document-level rounding later — encapsulate rounding in one pure module).
5. **Amounts/dates in German locale** on the rendered PDF (1.234,56 €, DD.MM.YYYY), German labels with English alternative template later (template system: one default DE template, HTML → PDF via headless Chromium/`puppeteer` already-available or `@react-pdf/renderer` — pick one, justify in the PR).

## Data model (Prisma — add to schema, register in tenant-scoped models, write migration)

- `TenantBillingProfile`: tenantId (1:1), legalName, address fields, taxNumber, vatId, iban, bic, bankName, invoiceNumberFormat, defaultPaymentTermDays (default 14), defaultTaxRate, smallBusinessRule boolean (§19 UStG — if true, no VAT + mandatory note), logoStoredPath, invoiceFooterText, datevConsultantNumber (Beraternummer), datevClientNumber (Mandantennummer), skr ("SKR03"|"SKR04", default SKR03), revenueAccount19/7/0/13b (defaults: SKR03 8400/8300/8125/8337), debtorNumberStart (default 10000).
- `RateCard`: tenantId, companyId, name, validFrom/validTo, lines: `RateCardItem` (description, unit: `day|hour|tour|km|flat`, unitPriceCents, taxRate). A company has at most one active rate card per date.
- `Invoice`: tenantId, companyId, type (`invoice|credit_note|cancellation`), status (`draft|finalized|sent|paid|partially_paid|overdue|cancelled`), number (nullable until finalized, unique per tenant), invoiceDate, serviceperiodStart/End, paymentTermDays, dueDate, netCents, taxCents, grossCents, taxBreakdown JSON, currency ("EUR"), customer snapshot fields (name, address, vatId — snapshotted at finalization, NOT a live relation for rendering), originalInvoiceId (for storno/credit), leitwegId, xmlStoredPath, pdfStoredPath, sentAt, paidAt, notes. Relation: lines.
- `InvoiceLine`: invoiceId, position, description, quantity (decimal 10,3), unit, unitPriceCents, taxRate, netCents, sourceType (`assignment|manual|rate_card_item`), assignmentId (nullable, indexed) — an assignment may appear on at most one non-cancelled invoice (enforce with partial unique index).
- `InvoiceNumberSequence`: tenantId, year, lastValue — row-locked at finalization.
- `Payment`: tenantId, invoiceId, amountCents, paidAt, method (`bank_transfer|cash|other`), reference, note.
- `DunningNotice`: tenantId, invoiceId, level (1|2|3), sentAt, feeCents (configurable defaults 0/5€/10€), pdfStoredPath.
- `DatevExport`: tenantId, periodStart/End, createdById, fileStoredPath, invoiceIds JSON, status.

## Backend (NestJS modules: `billing-out/` — do not touch the existing `billing/` Stripe module; name this module `invoicing`)

Endpoints (all tenant-scoped, role-guarded to `admin|boss|accounting`, with `office` read-only):

- `GET /invoicing/uninvoiced` — completed assignments without invoice line, grouped by company, with suggested amounts from the active rate card (fallback: assignment.expectedDailyRevenue). **This list is the gold of this feature** — the "money you forgot to ask for" view.
- `POST /invoicing/invoices` (draft from selection: companyId + assignmentIds[] + manual lines), `GET /invoicing/invoices` (filter: status, company, date range, overdue), `GET /invoicing/invoices/:id`, `PATCH` (drafts only — reject edits on finalized with 409), `POST /invoicing/invoices/:id/finalize` (transaction: assign number → snapshot customer → compute totals → render PDF + XML → store → status `finalized` → AuditLog), `POST /:id/send` (email with PDF attachment via existing MailService, CC configurable, track sentAt), `POST /:id/payments`, `POST /:id/cancel` (creates Stornorechnung), `POST /:id/credit-note`.
- `POST /invoicing/dunning/run` (manual trigger) + BullMQ daily job `invoicing.dunning`: invoices past due → level 1 (Zahlungserinnerung, friendly) → +14d level 2 → +14d level 3 (with fees, "letzte Mahnung" wording); each notice rendered as PDF, emailed, logged. Per-tenant toggle + per-invoice opt-out.
- `GET /invoicing/datev/export?from&to` — DATEV-Format (EXTF) Buchungsstapel CSV v13: header row 1 per spec (EXTF, 700, 21, Buchungsstapel...), one row per invoice tax-rate bucket: Umsatz (gross, German decimal comma, no thousands sep), S/H, debtor account (auto-assigned per company starting at debtorNumberStart, stored on Company as `datevDebtorNumber`), Gegenkonto (revenue account by tax rate from billing profile), BU-Schlüssel where applicable, Belegdatum (DDMM), Belegfeld 1 = invoice number, Buchungstext = company name. Also export a debtor master-data CSV (Debitorenstamm). Validate against fixed-width/field rules; include golden-file unit tests. Mark exported invoices; warn when re-exporting.
- Cron `invoicing.overdue` daily: flip `sent → overdue` past dueDate; emit notification + dashboard queue event.

All money math in a pure, fully unit-tested `money.ts` (integer cents, banker's-rounding-free: standard kaufmännisches Runden, per-line tax). Every state transition writes to `AuditLog`.

## Frontend (Next.js, under `(dashboard)/invoicing/`)

1. **`/invoicing` — Receivables cockpit:** KPI strip (uninvoiced work €, open AR €, overdue €, DSO), then tabbed table: Uninvoiced / Drafts / Open / Overdue / Paid. Uninvoiced tab: grouped by company with checkbox selection → "Create invoice" — the flagship interaction; from selection to draft in one click.
2. **`/invoicing/invoices/new` & `/invoicing/invoices/[id]` — Invoice editor (drafts) / viewer (finalized):** line table with inline editing (description, qty, unit, price, tax), live totals sidebar with tax breakdown, customer + period header, rate-card autofill indicator. Finalized view: read-only, PDF preview pane, action bar (Send / Record payment / Cancel / Credit note / Download PDF / Download XML), payment history, dunning history with level badges.
3. **Settings → Billing profile:** company data, bank, numbering format with live preview, tax accounts (SKR collapsible "advanced"), dunning configuration, invoice template preview.
4. Empty states that teach; all tables with the existing pagination/filter patterns; full de/en/tr i18n (German is the reference language — write DE strings natively, not translated-sounding). Status badges use ONE shared semantic component.
5. Dashboard integration: add "Uninvoiced completed work" and "Overdue invoices" cards to the existing dashboard, deep-linking into the cockpit tabs.

## Quality bar / acceptance criteria

- Migration runs clean on existing data; new models registered for tenant scoping; **tenant-isolation tests** proving Tenant A can never read/write Tenant B invoices (this is the security spine — test it explicitly).
- Unit tests: money/rounding (incl. 19%+7% mixed invoice), sequence gaplessness under concurrent finalization (parallel test), storno math, DATEV golden files, ZUGFeRD XML validates against EN 16931 rules.
- E2E happy path test: complete assignment → appears in uninvoiced → draft → finalize → PDF+XML stored → send → partial payment → overdue → Mahnung 1 → full payment → paid; DATEV export contains exactly this invoice once.
- No `any` types in new code; DTOs validated; all new strings in locale files; finalized artifacts immutable (attempt to edit returns 409 with clear message).
- Deliver in reviewable commits: (1) schema+migration, (2) money/number/tax core with tests, (3) invoice CRUD+finalize, (4) PDF/XML rendering, (5) dunning, (6) DATEV, (7) frontend cockpit, (8) frontend editor+settings, (9) dashboard cards + i18n sweep.

**Out of scope (do not build now):** Stripe changes, factoring, multi-currency, Peppol transmission (storage-ready: keep XML standalone), e-signature, customer-portal invoice view (next iteration).
