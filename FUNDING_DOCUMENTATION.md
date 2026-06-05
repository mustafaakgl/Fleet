# Fleet — Fleet & Workforce Management Platform for German Transport Companies

### Funding-Ready Product & Business Documentation

**Document type:** Investor / Funding Package (Seed)
**Version:** 1.0
**Date:** June 2026
**Status:** Confidential — for investor review
**Prepared by:** Product & Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Market Opportunity](#3-market-opportunity)
4. [Product Vision](#4-product-vision)
5. [Target Customers](#5-target-customers)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [MVP Scope](#8-mvp-scope)
9. [Future Roadmap](#9-future-roadmap)
10. [User Roles and Permissions](#10-user-roles-and-permissions)
11. [System Architecture](#11-system-architecture)
12. [Database ERD](#12-database-erd)
13. [GDPR / DSGVO Compliance](#13-gdpr--dsgvo-compliance)
14. [Security Requirements](#14-security-requirements)
15. [Mobile App Requirements](#15-mobile-app-requirements)
16. [Web Portal Requirements](#16-web-portal-requirements)
17. [API Requirements](#17-api-requirements)
18. [Revenue Model](#18-revenue-model)
19. [Competitor Analysis](#19-competitor-analysis)
20. [Development Timeline](#20-development-timeline)
21. [Budget Estimation](#21-budget-estimation)
22. [Risk Analysis](#22-risk-analysis)
23. [Success Metrics](#23-success-metrics)
24. [Funding Justification](#24-funding-justification)

---

## 1. Executive Summary

**Fleet** is a cloud-based fleet and workforce management SaaS platform purpose-built for small and mid-sized **transport and logistics companies in Germany**. It unifies the three operational pillars that these companies currently manage across spreadsheets, WhatsApp, paper folders and disconnected tools: **vehicles, drivers, and daily dispatch operations**.

The platform combines a **German-first web portal** (for office, dispatch, accounting and management), a **driver mobile app** (iOS/Android), and a **customer portal** (for the freight clients these companies serve). It is engineered around the realities of German transport SMEs: compliance-heavy document and deadline tracking (TÜV, SP, insurance, driver licences, passports), multilingual workforces (German operators dispatching non-German-speaking drivers), and razor-thin administrative capacity.

**What the product already does today (built, not aspirational):**

- **Driver & vehicle master data** with status lifecycles, risk levels and current-vehicle assignment.
- **Document management** for drivers, vehicles, companies and incidents, with expiry status (`valid` / `expiring_soon` / `expired` / `missing`).
- **Automated reminders** for licence, passport, TÜV, SP, insurance and document expiry, with configurable lead times.
- **Daily Assignment Planning (Einsatzplan)** with conflict detection, morning check-ins from drivers, and an office review queue.
- **Live GPS tracking** of drivers/vehicles (consent-based, mobile-sourced) on an interactive map.
- **Accident & cargo-damage reporting** with photo evidence and incident workflows.
- **Workforce administration**: leave requests, sick leave, a department calendar with German absence codes, and vehicle handover checks.
- **Fleet Messenger** with automatic **DeepL translation** between office and drivers (German ↔ driver's language).
- **Multi-language UI** in German, English and Turkish across web and mobile.
- **Role-based access control** across 6 roles, full **audit logging**, and a **DSGVO/GDPR** module.

**Architecture:** A modern, type-safe, horizontally scalable stack — **NestJS 11 + Prisma 6 + PostgreSQL** on the backend, **Next.js 15 / React 19** web frontend, and an **Expo / React Native** mobile app. The codebase is already organised into ~25 cleanly separated backend modules and a documented internal API contract.

**The ask:** We are raising a **seed round of €750,000** to harden the platform for multi-tenant scale, complete go-to-market readiness (telematics integrations, billing, onboarding automation), and acquire the **first 100 paying fleets (~1,000 vehicles)** in Year 1. At a blended **€400/month** package this reaches **€40K MRR / €480K ARR** in Year 1, on a path that **doubles year-over-year to €1.92M ARR by Year 3** — a Series-A-ready growth trajectory.

---

## 2. Problem Statement

German transport SMEs (typically 5–150 vehicles) operate in one of the most regulated, paperwork-intensive and margin-compressed industries in the country. Their back-office reality is broken in five specific ways:

### 2.1 Compliance is manual and high-risk
Every vehicle carries hard legal deadlines — **Hauptuntersuchung (TÜV)**, **Sicherheitsprüfung (SP)**, insurance, and registration renewals. Every driver carries **licence and passport expiry** dates, and (for many) the EU driver qualification. Missing a single deadline can mean fines, an immobilised vehicle, an uninsured trip, or a driver who is legally not permitted to drive. Today this is tracked in Excel or a wall calendar, and slips happen.

### 2.2 Dispatch lives in spreadsheets and WhatsApp
The daily plan — which driver, which vehicle, which cargo, which client, which route, what time — is rebuilt every evening in a spreadsheet and communicated by phone calls and WhatsApp messages. There is **no conflict detection** (double-booked driver or vehicle), no confirmation loop, and no system of record. Mistakes surface at 5 a.m. when a driver shows up to the wrong vehicle.

### 2.3 The workforce is multilingual; the tools are not
A large share of German transport drivers are not native German speakers. Dispatchers write in German; drivers read in Turkish, Polish, Romanian, Arabic, etc. Critical instructions get lost in translation — literally — leading to wrong pickups, missed handovers and safety issues.

### 2.4 Incidents and documents are paper
Accidents and cargo damage are documented on paper or loose phone photos, then lost. There is no chain of custody, no audit trail, and no structured data for insurers or clients — which directly costs companies money in disputed claims.

### 2.5 Workforce administration is disconnected
Leave requests, sick days, work-hour tracking and absence planning are handled separately from dispatch — so the person building tomorrow's plan doesn't know that a driver is on approved leave until it's too late.

**Net effect:** A 30-vehicle operator typically dedicates 1–2 full-time administrative staff to glue these systems together manually, and still absorbs avoidable costs from missed deadlines, dispatch errors, miscommunication and undocumented incidents.

---

## 3. Market Opportunity

### 3.1 Market size

| Layer | Definition | Estimate |
|---|---|---|
| **TAM** | Road freight & transport businesses across DACH (DE/AT/CH) | ~€2.5–3.0B addressable fleet-software spend |
| **SAM** | German road-transport SMEs (5–150 vehicles) needing dispatch + compliance + workforce tooling | ~€350–450M annually |
| **SOM (3–5 yr)** | 1,500–2,500 German fleets at €4–10K ACV | ~€10–20M ARR reachable |

Germany has tens of thousands of registered road-freight and transport enterprises; the overwhelming majority are SMEs below the size where enterprise TMS suites (Transporeon, Soloplan) make economic sense. This **underserved mid-market** is our beachhead.

### 3.2 Why now
- **Digitalisation pressure & funding:** German SME digitalisation grants (e.g. *Digital Jetzt*, regional programs) actively subsidise software adoption.
- **Regulatory tightening:** Mobility Package, electronic documentation and tachograph evolution push fleets toward digital record-keeping.
- **Labor shortage:** Driver shortages make every dispatch error and every avoidable admin hour more expensive, raising willingness to pay for efficiency.
- **Smartphone ubiquity:** Drivers now universally carry smartphones, making a mobile-first driver experience finally viable.

### 3.3 Wedge strategy
We win the underserved SME mid-market with a **German-first, compliance-first, mobile-first** product priced for SMEs, then expand up-market (larger fleets) and across DACH.

---

## 4. Product Vision

> **"The operating system for the German transport SME — every vehicle, every driver, every day, in one place, in every language."**

Fleet's vision is to be the single system of record and daily cockpit for transport operators. We are not building a generic TMS or a pure telematics product; we are building the **operational and compliance backbone** that an SME runs its whole day on.

**Three-horizon vision:**

- **Horizon 1 — Operate (today):** Replace spreadsheets and WhatsApp for dispatch, compliance tracking, driver communication and incident handling. Become indispensable to daily operations.
- **Horizon 2 — Optimise:** Layer analytics, telematics integration, automated compliance, and customer self-service on top of the operational data we already own.
- **Horizon 3 — Intelligence:** Predictive maintenance, route/assignment optimisation, automated client billing and an open ecosystem (telematics, accounting, insurance, ELD/tacho).

The strategic moat is **data gravity + workflow lock-in**: once a fleet runs its daily Einsatzplan, documents, incidents and driver communication through Fleet, switching cost is extremely high.

---

## 5. Target Customers

### 5.1 Primary segment (beachhead)
German transport / logistics SMEs operating **10–80 vehicles**, with a small office team (1–4 dispatchers/admin), a mixed-nationality driver workforce, and one or more recurring freight clients.

### 5.2 Buyer & user personas

| Persona | Role in product | Goals | Pain we remove |
|---|---|---|---|
| **Owner / Geschäftsführer ("Boss")** | Economic buyer | Profitability, fewer fires, compliance peace-of-mind | No visibility, constant firefighting, fine risk |
| **Dispatcher / Office (Disponent)** | Daily power user | Build the plan fast, no double-bookings, reach drivers | Spreadsheet chaos, phone tag, language barriers |
| **Accounting (Buchhaltung)** | Reporting user | Cost tracking, service/repair history, client billing data | Data scattered across folders |
| **Driver** | Mobile user | Know today's job, report problems, upload documents | Instructions in WhatsApp, no clarity, language barrier |
| **Freight Customer** | External portal user | See where their cargo is, what's planned | Constant "where is my truck?" phone calls |

### 5.3 Expansion segments
- Larger fleets (80–150+ vehicles) as reliability and integrations mature.
- Adjacent verticals: bus/coach operators, specialist haulage, last-mile fleets.
- DACH geographic expansion (Austria, Switzerland) — i18n foundation already in place.

---

## 6. Functional Requirements

The following requirements map directly to modules that exist in the codebase today (backend NestJS modules + web/mobile clients), unless explicitly marked *(planned)*.

### 6.1 Driver Management
- FR-DRV-1: Create/read/update driver records with employee number (unique), name, contact, languages.
- FR-DRV-2: Lifecycle status: `active`, `on_leave`, `sick`, `inactive`, `terminated`.
- FR-DRV-3: Risk level flag (`green` / `yellow` / `red`) for operational triage.
- FR-DRV-4: Track licence number + expiry and passport number + expiry.
- FR-DRV-5: Link a driver to a system user account for mobile login (optional, 1:1).
- FR-DRV-6: Birthday tracking with scheduled notification.

### 6.2 Vehicle Management
- FR-VEH-1: Vehicle master data (plate, internal code, brand, model, year, VIN — all uniqueness-constrained where relevant).
- FR-VEH-2: Lifecycle status: `active`, `maintenance`, `broken`, `inactive`.
- FR-VEH-3: Current-driver association.
- FR-VEH-4: Vehicle photo upload.

### 6.3 Driver Documents & 6.4 Vehicle Documents
- FR-DOC-1: Polymorphic document store keyed by owner type (`driver`, `vehicle`, `company`, `request`, `transport_request`, `accident`, `cargo_damage`, `vehicle_handover`, `assignment`, `service_record`).
- FR-DOC-2: Document type, file, optional expiry date, notes, uploader attribution.
- FR-DOC-3: Status engine: `valid`, `expiring_soon`, `expired`, `missing`, `archived`.
- FR-DOC-4: Drivers can upload documents from the mobile app (scanned via document scanner).

### 6.5 Service Reminders & 6.6 Vehicle Renewals
- FR-REM-1: Reminder records for TÜV, SP, insurance, registration, licence, passport and custom items.
- FR-REM-2: Configurable `notifyBeforeDays` lead time per reminder.
- FR-REM-3: Reminder lifecycle: `open`, `sent`, `resolved`, `ignored`.
- FR-REM-4: Scheduled job evaluates due reminders and dispatches notifications.
- FR-SVC-1: Service/repair history per vehicle (date, service type, repair company, cost, mileage).

### 6.7 Driver Licence Expiration Tracking
- FR-LIC-1: Surface upcoming/expired licences and passports on dashboard and reminders.
- FR-LIC-2: Automated reminder generation tied to expiry dates.

### 6.8 Accident Management & 6.9 Cargo Damage Reporting
- FR-INC-1: Unified incident model with type `vehicle_accident` or `cargo_damage`.
- FR-INC-2: Capture driver, vehicle, company, assignment link, date/time, location, description, estimated damage value.
- FR-INC-3: Incident workflow status: `reported`, `under_review`, `resolved`, `rejected`.
- FR-INC-4: Photo/document evidence attached via the document subsystem.
- FR-INC-5: Drivers can file accident/cargo-damage reports from mobile.

### 6.10 Employee Work Hours Tracking
- FR-WRK-1: Capture and review driver work time derived from assignments and check-ins. *(Reporting/export enhancements planned.)*

### 6.11 Leave Requests, 6.12 Sick Leave Reporting
- FR-REQ-1: Request types: vacation, sick leave, training, business trip, doctor appointment, special leave, overtime compensation, free day, other.
- FR-REQ-2: Approval workflow: `pending` → `approved` / `rejected` / `cancelled` / `needs_review`, with approver attribution.
- FR-REQ-3: Approved requests flow into the department calendar and influence dispatch availability.

### 6.13 Fleet Messenger
- FR-MSG-1: Office↔driver conversations with participants and read receipts.
- FR-MSG-2: **Automatic translation** of messages via DeepL between German and the driver's language; translation status tracked (`not_requested`, `pending`, `translated`, `failed`).
- FR-MSG-3: Push notification on new message.

### 6.14 Multi-language Support
- FR-I18N-1: Full UI localisation in **German, English, Turkish** (web + mobile).
- FR-I18N-2: Per-user language preference; German default.

### 6.15 Daily Assignment Planning (Einsatzplan)
- FR-PLAN-1: Create assignments (driver, vehicle, company, cargo, pickup/delivery, work date, start/end time, route).
- FR-PLAN-2: Assignment lifecycle: `planned`, `confirmed`, `in_progress`, `completed`, `cancelled`.
- FR-PLAN-3: **Conflict / double-booking detection** (driver and vehicle indexed by work date) and de-duplication logic.
- FR-PLAN-4: **Driver morning check-ins** (vehicle plate + company) with a status engine (`confirmed`, `waiting_for_review`, `missing_vehicle_plate`, `missing_company`, `conflict`, `added_to_einsatzplan`, `rejected`).
- FR-PLAN-5: **Office review queue** for reconciling check-ins and transport requests into the plan.
- FR-PLAN-6: **Transport requests** (proposed jobs) with approval into firm assignments.
- FR-PLAN-7: **Vehicle handovers** (pickup/return) with photo requirement and damage flagging.

### 6.16 Live Tracking
- FR-TRK-1: Consent-based GPS location capture from the driver mobile app.
- FR-TRK-2: Latest-location snapshot per driver + full location history (lat/long, accuracy, speed, heading, altitude).
- FR-TRK-3: Interactive map view (web) of active drivers/vehicles.
- FR-TRK-4: Tracking status lifecycle: `active`, `paused`, `denied`; explicit consent timestamping.

### 6.17 Department Calendar
- FR-CAL-1: Calendar events per driver with German absence/status codes (AT, UT, KT, FT, HO, SCH, GR, AZ, SZ, US, FR, WE, AB, MT).
- FR-CAL-2: Events sourced from assignments, leave or manual entry.

### 6.18 Dashboard & Analytics
- FR-DASH-1: Role-aware dashboards (financial KPIs for boss/accounting; operational alerts/queue for office).
- FR-DASH-2: Surface expiring documents, due reminders, open incidents, today's plan and check-in status.
- FR-DASH-3: Global search across core entities.

### 6.19 Customer Portal
- FR-CP-1: External freight-customer login scoped to their own company data (multi-tenant isolation).
- FR-CP-2: Configurable visibility (live tracking on/off, driver full name on/off, internal notes on/off) per company.
- FR-CP-3: Company users with `viewer` / `manager` roles.

### 6.20 Notifications & Audit
- FR-NOT-1: In-app + push notifications typed by domain (transport_request, request, document, handover, accident, cargo_damage, company_email, reminder, system) with priority.
- FR-AUD-1: Append-only audit log capturing actor, action, entity, summary, metadata, IP and user agent.

---

## 7. Non-Functional Requirements

| # | Category | Requirement |
|---|---|---|
| NFR-1 | **Performance** | P95 API latency < 300 ms for standard reads under nominal load; dashboard initial load < 2 s. |
| NFR-2 | **Scalability** | Stateless API horizontally scalable; PostgreSQL with appropriate indexing (already defined on hot paths: assignments, locations, documents, notifications). Location history designed for high write volume with dedicated indexes. |
| NFR-3 | **Availability** | Target 99.5% (MVP) → 99.9% (post-Series-A) monthly uptime. |
| NFR-4 | **Data residency** | All data hosted in **EU (Germany/Frankfurt-region)** to satisfy DSGVO and customer expectations. |
| NFR-5 | **Security** | JWT auth, bcrypt password hashing, role-based guards on every endpoint, tenant isolation guards for customer portal. |
| NFR-6 | **Localisation** | All user-facing strings externalised; new locale addable without code changes. |
| NFR-7 | **Maintainability** | Strongly typed end-to-end (TypeScript), modular NestJS architecture, Prisma schema as single source of truth, documented internal API contract. |
| NFR-8 | **Auditability** | All sensitive mutations recorded in immutable audit log. |
| NFR-9 | **Mobile resilience** | Mobile app tolerant of intermittent connectivity; location buffering; React Query caching. |
| NFR-10 | **Accessibility** | Web UI built on Radix primitives for keyboard/ARIA support; high-contrast, large-touch mobile UI for in-cab use. |
| NFR-11 | **Backup & recovery** | Automated daily encrypted backups; documented RPO ≤ 24 h, RTO ≤ 4 h. |
| NFR-12 | **Observability** | Centralised logging, error tracking and uptime monitoring *(infrastructure hardening in scope of this raise)*. |

---

## 8. MVP Scope

The MVP is **already substantially built**. This raise funds hardening, multi-tenant scale and go-to-market, not greenfield development.

### 8.1 In scope (MVP — built / completing)
- ✅ Driver & vehicle management with lifecycle states
- ✅ Document management + expiry status engine
- ✅ Reminders (TÜV/SP/insurance/licence/passport/custom) with scheduled dispatch
- ✅ Daily Assignment Planning (Einsatzplan) with conflict detection
- ✅ Driver morning check-ins + office review queue
- ✅ Transport requests → assignment approval
- ✅ Vehicle handovers with photo/damage checks
- ✅ Accident & cargo-damage reporting with evidence
- ✅ Leave / sick / absence requests + department calendar
- ✅ Fleet Messenger with DeepL auto-translation
- ✅ Live GPS tracking (consent-based) with map
- ✅ Multi-language UI (DE/EN/TR), web + mobile
- ✅ 6-role RBAC, audit logging, DSGVO module
- ✅ Customer portal with per-company visibility controls
- ✅ Push notifications (Expo) + in-app notification center

### 8.2 MVP hardening (this raise)
- Multi-tenant productisation (org-level isolation, self-serve provisioning)
- Subscription billing & metering
- Self-service onboarding & data import (CSV/Excel of drivers, vehicles, documents)
- Telematics ingestion path (beyond mobile-sourced GPS)
- Observability, backups, SLA infrastructure

### 8.3 Explicitly out of MVP scope
- Native TMS/route optimisation engine, automated client invoicing, predictive maintenance, full tachograph/ELD ingestion, accounting-system integrations — all on the roadmap (Section 9).

---

## 9. Future Roadmap

| Phase | Timeframe | Themes |
|---|---|---|
| **Phase 1 — Productise** | Months 0–6 | Multi-tenant SaaS, billing, self-serve onboarding, data import, observability/SLA, security audit. |
| **Phase 2 — Integrate** | Months 6–12 | Telematics/GPS hardware integrations, tachograph/working-time data, accounting export (DATEV), e-mail/calendar sync. |
| **Phase 3 — Optimise** | Months 12–18 | Analytics suite (cost-per-vehicle, utilisation, on-time), automated client billing from assignments, advanced reporting/exports. |
| **Phase 4 — Intelligence** | Months 18–30 | Predictive maintenance, assignment/route optimisation, anomaly detection on incidents/compliance, driver-app voice & offline-first. |
| **Phase 5 — Ecosystem** | Months 24–36+ | Public API & marketplace (insurance, leasing, fuel cards), DACH + EU expansion, additional locales. |

---

## 10. User Roles and Permissions

The platform implements **role-based access control** with the following roles (from the data model + permission layer):

| Role | Description | Representative capabilities |
|---|---|---|
| **admin** | System administrator | Manage users, manage settings, full data access, all of office's capabilities. |
| **boss** | Owner / management | View financials, fleet-wide visibility, handovers (view). |
| **accounting** | Finance / back-office | View financials, service/cost history, handovers (view). |
| **office** | Dispatcher / operations | Build & manage Einsatzplan, critical alerts, office review queue, edit handovers. |
| **driver** | Field worker (mobile) | View own assignments, morning check-in, upload documents, report incidents, messenger, location sharing. |
| **customer** | External freight client | Scoped customer-portal access to their own company's assignments/tracking, subject to per-company visibility settings. |

**Secondary (company-scoped) roles** for the customer portal: `viewer` and `manager` (`CompanyUser.role`), plus an `isPrimary` contact flag.

### 10.1 Permission matrix (illustrative)

| Capability | admin | boss | accounting | office | driver | customer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Manage users / settings | ✅ | — | — | — | — | — |
| View financial KPIs | ✅ | ✅ | ✅ | — | — | — |
| Build/edit Einsatzplan | ✅ | — | — | ✅ | — | — |
| Office review queue & critical alerts | ✅ | — | — | ✅ | — | — |
| View vehicle handovers | ✅ | ✅ | ✅ | ✅ | — | — |
| Edit vehicle handovers | ✅ | — | — | ✅ | — | — |
| Morning check-in / report incident (mobile) | — | — | — | — | ✅ | — |
| Share GPS location | — | — | — | — | ✅ | — |
| Customer portal (own company only) | — | — | — | — | — | ✅ |

Permissions are enforced server-side via NestJS guards (`RolesGuard`, JWT auth guard, customer-tenant guard) and mirrored in the client permission layer for UI gating.

---

## 11. System Architecture

### 11.1 High-level architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              Clients                         │
                         │                                              │
   Office / Boss /       │   Next.js 15 Web Portal (React 19, Tailwind, │
   Accounting  ─────────▶│   Radix UI, Leaflet maps, i18n DE/EN/TR)     │
                         │                                              │
   Drivers     ─────────▶│   Expo / React Native Mobile App             │
                         │   (location, document scanner, push)         │
                         │                                              │
   Freight     ─────────▶│   Customer Portal (Next.js, tenant-scoped)   │
   Customers             └───────────────────┬──────────────────────────┘
                                             │  HTTPS / JWT (Bearer)
                                             ▼
                         ┌─────────────────────────────────────────────┐
                         │        NestJS 11 API (TypeScript)            │
                         │                                              │
                         │  Auth/JWT · RBAC Guards · Tenant Guard       │
                         │  ~25 domain modules (drivers, vehicles,      │
                         │  assignments, documents, reminders,          │
                         │  accidents, requests, messenger, tracking,   │
                         │  customer-portal, dashboard, audit, …)       │
                         │                                              │
                         │  @nestjs/schedule (cron: reminders,          │
                         │  birthdays, status sweeps)                   │
                         └───┬───────────────┬───────────────┬──────────┘
                             │               │               │
                ┌────────────▼───┐  ┌────────▼─────────┐  ┌──▼───────────────┐
                │  PostgreSQL    │  │ Object/File      │  │ External services│
                │  (Prisma 6 ORM)│  │ Storage          │  │ · DeepL (i18n)   │
                │                │  │ (documents,      │  │ · Expo Push      │
                │  audit, master │  │  photos)         │  │ · Telematics     │
                │  data, history │  │                  │  │   (planned)      │
                └────────────────┘  └──────────────────┘  └──────────────────┘
```

### 11.2 Backend
- **Framework:** NestJS 11 (modular, dependency-injected, TypeScript).
- **ORM / DB:** Prisma 6 over PostgreSQL; schema is the single source of truth with indexed hot paths.
- **Auth:** Passport JWT strategy, bcrypt hashing, role + tenant guards.
- **Scheduling:** `@nestjs/schedule` cron jobs for reminders, birthday notifications and status sweeps.
- **Validation:** `class-validator` / `class-transformer` DTOs on every endpoint.
- **Modularity:** ~25 clearly bounded modules (auth, users, drivers, vehicles, companies, assignments, transport-requests, documents, reminders, service-records, accidents, requests, leave-requests, calendar, morning-checkins, vehicle-handovers, messenger, translation, tracking, notifications, push-notifications, dashboard, search, customer-portal, audit, storage).

### 11.3 Web frontend
- **Framework:** Next.js 15 / React 19, Tailwind CSS v4, Radix UI primitives.
- **Maps:** Leaflet / react-leaflet for live tracking.
- **Forms/validation:** react-hook-form + Zod.
- **i18n:** i18next / react-i18next (DE/EN/TR).
- **Data export:** XLSX export support.

### 11.4 Mobile app
- **Framework:** Expo / React Native (expo-router).
- **Capabilities:** expo-location (GPS), expo-image-picker + document scanner (document/photo capture), expo-notifications (push), expo-secure-store (token storage), TanStack React Query (caching/offline tolerance), Zustand (state).

### 11.5 Cross-cutting
- **Translation service:** DeepL integration for message translation.
- **Notifications:** unified notification model + Expo push delivery.
- **Audit:** centralised append-only audit logging with actor/IP/user-agent.

---

## 12. Database ERD

PostgreSQL via Prisma. Core entities and relationships (simplified):

```
User ──1:1── Driver
  │            │
  │            ├──< Assignment >── Vehicle
  │            │        │   └──── Company
  │            │        ├──< CalendarEvent
  │            │        ├──< VehicleHandover
  │            │        ├──< MorningCheckin
  │            │        ├──< Accident
  │            │        └──1:1 TransportRequest
  │            │
  │            ├──< Request (leave/sick/…) ──> approvedBy: User
  │            ├──< TransportRequest >── Vehicle, Company
  │            ├──< DriverLocationLatest (1:1) / DriverLocationHistory (1:N)
  │            └──< Conversation ──< Message ──< MessageRead
  │
  ├──< Notification
  ├──< AuditLog
  ├──< Document (uploadedBy)
  └──< CompanyUser >── Company ──1:1── CompanyPortalSettings
                          └──< CompanyEmail

Vehicle ──< ServiceRecord
Vehicle ──< (Assignment, TransportRequest, VehicleHandover, Accident, Location*)

Document  ── polymorphic (ownerType, ownerId) → driver | vehicle | company |
             request | transport_request | accident | cargo_damage |
             vehicle_handover | assignment | service_record

Reminder  ── polymorphic (targetType, targetId), reminderType ∈
             {license_expiry, passport_expiry, tuv_expiry, sp_expiry,
              insurance_expiry, document_expiry, custom}
```

### 12.1 Key entities

| Entity | Purpose | Notable fields |
|---|---|---|
| **User** | Auth & identity | role, status, language, expoPushToken |
| **Driver** | Driver master + compliance | employeeNumber (unique), licence/passport expiry, status, riskLevel, location consent |
| **Vehicle** | Vehicle master + compliance | plate/internalCode/VIN (unique), TÜV/SP/insurance/registration expiry, status |
| **Company** | Freight client | defaultDailyRevenue, portal settings, company users |
| **Assignment** | Daily dispatch job | driver+vehicle+company, cargo, pickup/delivery, workDate, status; indexed for conflict detection |
| **TransportRequest** | Proposed job → assignment | status, conflictReason, 1:1 assignment link |
| **MorningCheckin** | Driver day-start confirmation | vehiclePlate, companyName, status machine |
| **VehicleHandover** | Pickup/return checks | photoRequired/photoStatus, damageDetected |
| **Accident** | Accident + cargo damage | type (accident/cargo_damage), damageValue, status |
| **Request** | Leave/sick/absence | type, date range, approval status |
| **CalendarEvent** | Department calendar | German status codes, source |
| **Document** | Polymorphic file store | ownerType/ownerId, expiry, status |
| **Reminder** | Compliance deadlines | reminderType, dueDate, notifyBeforeDays, status |
| **ServiceRecord** | Maintenance/repair history | serviceType, cost, mileage |
| **Conversation/Message/MessageRead** | Messenger | translation fields, read receipts |
| **DriverLocationLatest / History** | Live tracking | lat/long, speed, heading, source, consent |
| **Notification** | Alerts | type, priority, status, related entity |
| **AuditLog** | Compliance trail | actor, action, entity, IP, userAgent |

> A detailed field-level ERD is maintained in the repository (`Fleet_ERD_SCHEMA.md` / Prisma schema) and kept in sync as the source of truth.

---

## 13. GDPR / DSGVO Compliance

Compliance is a **first-class product feature** (there is a dedicated DSGVO module/page), not an afterthought — essential for the German market.

### 13.1 Lawful basis & data minimisation
- Personal data processed under **contract performance** (employment/dispatch) and **legitimate interest** (fleet safety/compliance); explicit **consent** for GPS location tracking.
- Only operationally necessary personal data is collected (driver identity, licence/passport for legal compliance, location only with consent).

### 13.2 Consent management (location)
- GPS tracking requires **explicit, timestamped driver consent** (`locationTrackingConsentAt`), with status `active`/`paused`/`denied` and start/stop timestamps. Drivers control sharing from the mobile app.

### 13.3 Data subject rights
- **Access & portability:** structured export of a data subject's records.
- **Rectification:** standard edit flows.
- **Erasure / restriction:** soft-deactivation (status `inactive`/`terminated`) plus defined retention and purge processes; relations use `SetNull`/`Cascade` deliberately to preserve referential integrity while honouring erasure.

### 13.4 Retention
- Location **history** retained only as long as operationally necessary, then purged on a schedule; **latest** snapshot kept for live ops only.
- Audit logs retained per legal obligation; documents retained per their compliance purpose.

### 13.5 Accountability & security measures
- **Audit logging** of sensitive actions (actor, IP, user agent) provides demonstrable accountability (Art. 5(2)).
- **EU data residency** (Germany/Frankfurt-region hosting).
- **Access control**: least-privilege roles; customer-portal tenant isolation prevents cross-company data exposure; configurable PII visibility (e.g. hide driver full names from customers).
- **Encryption** in transit (TLS) and at rest.

### 13.6 Processor obligations
- **AV-Vertrag (Auftragsverarbeitungsvertrag / DPA)** offered to all customers.
- Sub-processors (hosting, DeepL, Expo push) documented; **DeepL Pro** used under its data-protection terms (no training on customer data). DPIA prepared for location tracking.

---

## 14. Security Requirements

| # | Domain | Requirement |
|---|---|---|
| SEC-1 | **Authentication** | JWT bearer tokens; bcrypt password hashing; secure token storage on mobile (expo-secure-store). |
| SEC-2 | **Authorization** | Server-side RBAC guards on every endpoint; customer-portal tenant guard enforcing company-scoped access. |
| SEC-3 | **Transport security** | TLS 1.2+ everywhere; HSTS; no sensitive data in URLs. |
| SEC-4 | **Input validation** | DTO validation (class-validator) on all inputs; Prisma parameterisation prevents SQL injection. |
| SEC-5 | **Data at rest** | Encrypted database volumes and object storage. |
| SEC-6 | **Secrets management** | Environment-based secrets; no secrets in source; rotation policy. |
| SEC-7 | **Audit & monitoring** | Immutable audit trail; centralised logging; alerting on anomalies *(hardening in scope)*. |
| SEC-8 | **File upload safety** | Type/size validation, isolated storage, virus scanning *(planned for hardening)*. |
| SEC-9 | **Rate limiting / abuse** | API rate limiting and brute-force protection on auth *(hardening in scope)*. |
| SEC-10 | **Vulnerability management** | Dependency scanning, periodic pen-test, responsible-disclosure process. |
| SEC-11 | **Backups** | Encrypted automated backups; tested restores; documented RPO/RTO. |
| SEC-12 | **Least privilege** | Role separation (e.g. financials restricted to admin/boss/accounting; user management to admin only). |

---

## 15. Mobile App Requirements

Target users: **drivers** (and a path to office-on-the-go). Built with Expo / React Native (iOS + Android).

| # | Requirement |
|---|---|
| MOB-1 | Secure login with token persisted in secure storage; per-user language (DE/EN/TR). |
| MOB-2 | **Today view:** the driver's assignments for the day (vehicle, company, cargo, pickup/delivery, times). |
| MOB-3 | **Morning check-in:** confirm vehicle plate + company, feeding the office review queue. |
| MOB-4 | **Document upload** via in-app **document scanner** + image picker (licence, passport, vehicle docs). |
| MOB-5 | **Incident reporting:** accident and cargo-damage filing with photos and description. |
| MOB-6 | **Vehicle handover:** pickup/return flow with required photos and damage notes. |
| MOB-7 | **Live location sharing:** consent-gated GPS with active/paused control; background-tolerant; battery-conscious. |
| MOB-8 | **Messenger:** chat with office, with messages auto-translated to/from the driver's language. |
| MOB-9 | **Push notifications** (Expo) for new assignments, messages, requests and reminders. |
| MOB-10 | **Requests:** submit leave/sick/other absence requests and view status. |
| MOB-11 | Offline tolerance: cached data via React Query; graceful handling of poor connectivity. |
| MOB-12 | Large-touch, high-contrast UI suitable for in-cab use; minimal cognitive load. |

---

## 16. Web Portal Requirements

Target users: **office, boss, accounting, admin** (internal) and **customers** (external portal).

| # | Requirement |
|---|---|
| WEB-1 | Role-aware dashboard (financial KPIs vs operational alerts/queue) with expiring documents, due reminders, open incidents and today's plan. |
| WEB-2 | **Einsatzplan** day planner: create/edit assignments, see conflicts, manage morning check-ins and transport requests via an office review queue. |
| WEB-3 | Driver management (CRUD, documents, licence/passport tracking, risk level, status). |
| WEB-4 | Vehicle management (CRUD, documents, TÜV/SP/insurance tracking, service history, photo). |
| WEB-5 | Document center with expiry status filtering across all owner types. |
| WEB-6 | Reminders center (compliance deadlines) with lead-time configuration. |
| WEB-7 | Accident & cargo-damage management with evidence and workflow. |
| WEB-8 | Leave/sick/absence requests with approval workflow + **department calendar** (German status codes). |
| WEB-9 | **Live tracking** map (Leaflet) of active drivers/vehicles, with detail and sidebar. |
| WEB-10 | Messenger console for office↔driver communication with translation. |
| WEB-11 | Companies/clients management, company emails, and **customer-portal visibility settings**. |
| WEB-12 | Global search, notification center, settings, user management (admin). |
| WEB-13 | **DSGVO** management page. |
| WEB-14 | Full DE/EN/TR localisation; data export (XLSX). |
| WEB-15 | **Customer portal** (separate route group): tenant-scoped dashboard showing the client's own assignments/tracking subject to visibility config. |

---

## 17. API Requirements

| # | Requirement |
|---|---|
| API-1 | **RESTful JSON** API built on NestJS controllers (~28 controllers across domains). |
| API-2 | **JWT bearer** auth on all non-public routes; `/auth` for login/token issuance. |
| API-3 | **RBAC enforcement** at the controller/guard layer per role. |
| API-4 | **Dedicated driver-mobile API surface** with a documented internal **CONTRACT** (`driver-mobile/CONTRACT.md`) decoupling the mobile client from internal models. |
| API-5 | **Customer-portal API** with tenant guard enforcing company-scoped responses and visibility settings. |
| API-6 | **DTO validation** and consistent error handling (Prisma exception filter → clean HTTP errors). |
| API-7 | **Versioning & stability:** stable contracts for mobile/portal clients; breaking changes versioned. |
| API-8 | **Webhooks / push:** Expo push integration; outbound webhooks *(planned)* for ecosystem integrations. |
| API-9 | **Public API & OpenAPI docs** *(roadmap Phase 5)* for partner/telematics/accounting integrations. |
| API-10 | **Rate limiting, pagination, filtering** on list endpoints; idempotency on critical writes. |

---

## 18. Revenue Model

### 18.1 Model: B2B SaaS subscription (tiered packages)
Pricing scales with fleet size (the primary value driver), billed monthly/annually. Packages range from **€299–€500 / month**, with a **blended average of ~€400 / month per customer** (≈ 10 vehicles per customer at our beachhead profile).

| Tier | Target fleet | Indicative price / mo | Included |
|---|---|---|---|
| **Starter** | up to ~10 vehicles | €299 | Core: drivers, vehicles, documents, reminders, Einsatzplan, mobile app, 1 office seat. |
| **Professional** | ~10–25 vehicles | €399 | Everything + live tracking, messenger w/ translation, incidents, calendar, multiple seats. |
| **Business** | ~25–50 vehicles | €500 | Everything + customer portal, analytics, priority support, API access. |
| **Enterprise** | 50+ / custom | Custom (from €500) | SLA, SSO, integrations, dedicated onboarding. |

> **Blended ARPA:** ~€400/mo (€4,800/yr ACV). This is the anchor used in the growth scenario below.

### 18.2 Expansion & add-on revenue
- **Customer portal** seats / white-label.
- **Telematics integration** add-on.
- **Translation usage** beyond fair-use (DeepL pass-through + margin).
- **Onboarding & data-migration** services (one-time).
- **Premium analytics / billing automation** module.

### 18.3 Unit economics (illustrative, blended)
- **ARPA / ACV:** ~€400/mo → **~€4,800/yr** per customer (≈ 10 vehicles).
- **Gross margin:** ~80–85% (cloud + DeepL + push are the main COGS).
- **Target CAC:** €1,500–2,500 (inside sales + content + grants channel).
- **Target LTV:CAC:** ≥ 4:1 at < 2% monthly logo churn (high stickiness from daily-use workflow lock-in).
- **Payback:** < 12 months.

### 18.4 Three-year growth scenario

| | **Year 1** | **Year 2** | **Year 3** |
|---|---:|---:|---:|
| Customers (fleets) | 100 | 200 | 400 |
| Vehicles under management | 1,000 | 2,000 | 4,000 |
| Avg. package (ARPA) | €400/mo | €400/mo | €400/mo |
| **MRR** | **€40,000** | **€80,000** | **€160,000** |
| **ARR** | **€480,000** | **€960,000** | **€1.92M** |
| YoY ARR growth | — | +100% | +100% |

**Assumptions & notes:**
- Blended ARPA held flat at €400/mo (conservative — no price increases or expansion uplift modelled, despite likely net-revenue-retention >100% from upsell to Professional/Business and add-ons).
- Customer base **doubles year-over-year**, a realistic trajectory for a daily-use SaaS with strong workflow lock-in and a large underserved SME pool.
- ~10 vehicles per customer (beachhead profile); ARPA rises naturally as larger fleets onboard.
- **Year 3 upside:** a **first ~500-vehicle pilot/anchor customer network** is in place, opening a clear path to enterprise-tier ACVs well above the blended average and accelerating the Year 3→4 ramp.
- At ~80–85% gross margin, Year 3 ARR of €1.92M implies ~€1.5–1.6M gross profit — a Series-A-grade growth profile.

> *Note on timing:* "Year 1–3" denote the three years of **commercial scaling**. The seed round's first ~3–6 months (Section 20) front-load multi-tenant productisation and pilots; the 100-fleet Year-1 target is reached as that motion ramps. Exit of the seed period aligns with the Year-1 → Year-2 inflection (€480K → €960K ARR).

---

## 19. Competitor Analysis

| Category | Examples | Strengths | Gap we exploit |
|---|---|---|---|
| **Enterprise TMS** | Soloplan (CarLo), Transporeon, TIS | Deep dispatch/logistics features | Expensive, complex, long onboarding — overkill for SMEs; weak driver mobile + multilingual UX. |
| **Telematics / tracking** | Webfleet (Bridgestone), Samsara, Verizon Connect | Strong GPS/hardware, vehicle data | Tracking-centric; weak on dispatch planning, compliance docs, workforce admin and driver communication. |
| **Fleet maintenance** | Fleetio, Vimcar | Good vehicle/maintenance records | Not built for daily dispatch, multilingual driver comms, or German absence/compliance workflows. |
| **Generic / horizontal** | Excel, WhatsApp, paper, generic HR tools | Free/familiar | No integration, no conflict detection, no compliance automation, no audit trail. |
| **German point tools** | Various Werkstatt/Fuhrpark tools | Local fit for one function | Single-purpose; no unified platform. |

### 19.1 Our differentiation
1. **German-first + DSGVO-native + EU-hosted** — built for the regulatory and language reality of German SMEs.
2. **Unified platform** — dispatch + compliance + workforce + tracking + customer portal in one system of record (competitors cover one or two of these).
3. **Multilingual by design** — DeepL auto-translated office↔driver messaging is a genuine differentiator for mixed-nationality workforces.
4. **Mobile-first driver experience** — check-ins, document scanning, incident reporting, handovers and consent-based tracking in one app.
5. **SME-priced & fast to onboard** — value reachable in days, not months.

---

## 20. Development Timeline

The platform's core is built; the timeline below covers the **18-month funded plan** to productise and scale.

| Months | Milestone | Key deliverables |
|---|---|---|
| **0–3** | Productisation foundation | Multi-tenant isolation, subscription billing, security hardening (rate limiting, file scanning), observability/backups, security audit #1. |
| **3–6** | GTM readiness | Self-serve onboarding, CSV/Excel data import, in-app onboarding, pricing/packaging live, **first 10 paying pilots**. |
| **6–9** | Integrations I | Telematics ingestion, refined live tracking at scale, DATEV/accounting export, scale to **~30 customers**. |
| **9–12** | Integrations II + analytics | Working-time/tachograph data path, analytics v1 (utilisation, cost-per-vehicle), scale to **~55 customers**. |
| **12–15** | Optimise | Automated client billing from assignments, advanced reporting/exports, SLA 99.9%, scale to **~80 customers**. |
| **15–18** | Series-A ready | Public API/OpenAPI, partner integrations, DACH expansion prep, **~100+ paying fleets**, Series-A materials. |

---

## 21. Budget Estimation

**18-month seed budget: €750,000**

| Category | Allocation | Amount | Notes |
|---|---|---|---|
| **Engineering** | 48% | €360,000 | 3 engineers (2 full-stack, 1 mobile) + fractional DevOps; productisation, integrations, scale. |
| **Product & Design** | 10% | €75,000 | 1 product/design lead; UX for onboarding & analytics. |
| **Go-to-Market (Sales & Marketing)** | 22% | €165,000 | Inside sales, content/SEO (German), trade presence, grants channel. |
| **Infrastructure & Tooling** | 7% | €52,500 | EU cloud hosting, DeepL Pro, Expo/push, monitoring, CI/CD. |
| **Compliance, Legal & Security** | 6% | €45,000 | DSGVO/DPA, security audit & pen-test, legal/contracts. |
| **Operations & Admin** | 4% | €30,000 | Accounting, office, software. |
| **Contingency** | 3% | €22,500 | Buffer. |
| **Total** | 100% | **€750,000** | ~18-month runway. |

> A meaningful portion of GTM and digitalisation spend is expected to be partly **offset by German SME digitalisation grants** (for both us and our customers), improving effective capital efficiency.

---

## 22. Risk Analysis

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **Slow SME adoption / long sales cycles** | Med | High | Land-and-expand via low-friction Starter tier; pilot-led selling; ROI framed around fines avoided + admin hours saved; grants channel. |
| R-2 | **Incumbent / telematics players move down-market** | Med | High | Deepen workflow lock-in and German/multilingual moat; speed and SME-fit they can't easily replicate. |
| R-3 | **DSGVO/compliance misstep (esp. GPS tracking)** | Low | High | Consent-by-design, EU hosting, DPA, DPIA, audit logging, external privacy review. |
| R-4 | **Third-party dependency risk (DeepL/Expo/cloud)** | Low | Med | Abstraction layers; fallback providers; cost monitoring; fair-use limits. |
| R-5 | **Scaling/reliability issues as fleets grow** | Med | Med | Stateless API, indexed schema, observability, load testing, SLA program. |
| R-6 | **Security breach** | Low | High | Hardening backlog (rate limiting, file scanning, secrets), pen-tests, least-privilege, backups. |
| R-7 | **Key-person / hiring risk** | Med | Med | Documented architecture & contracts, code clarity, modular design, equity retention. |
| R-8 | **Churn from shallow usage** | Med | Med | Onboarding success, daily-use features (Einsatzplan, messenger) drive habit; CS playbook. |
| R-9 | **FX/pricing pressure in tight-margin segment** | Med | Med | Quantified ROI, tiered pricing, annual prepay incentives. |

---

## 23. Success Metrics

### 23.1 North-star metric
**Weekly active dispatch usage** — % of customer fleets that build their daily Einsatzplan in Fleet (proxy for indispensability).

### 23.2 KPI dashboard

| Category | Metric | Year 1 | Year 2 | Year 3 |
|---|---|---:|---:|---:|
| **Growth** | Paying fleets | 100 | 200 | 400 |
| **Growth** | Vehicles under management | 1,000 | 2,000 | 4,000 |
| **Revenue** | MRR | €40K | €80K | €160K |
| **Revenue** | ARR | €480K | €960K | €1.92M |
| **Retention** | Net revenue retention | ≥ 105% | ≥ 110% | ≥ 110% |
| **Retention** | Monthly logo churn | < 2% | < 2% | < 1.5% |
| **Engagement** | Weekly active dispatch fleets | ≥ 80% | ≥ 82% | ≥ 85% |
| **Engagement** | Driver mobile MAU / assigned drivers | ≥ 75% | ≥ 80% | ≥ 82% |
| **Efficiency** | LTV:CAC | ≥ 4:1 | ≥ 4:1 | ≥ 5:1 |
| **Efficiency** | CAC payback | < 12 mo | < 10 mo | < 9 mo |
| **Product value** | Compliance reminders resolved on time | ≥ 95% | ≥ 96% | ≥ 97% |
| **Reliability** | Uptime | 99.5% | 99.9% | 99.9% |
| **Quality** | P95 API latency | < 300 ms | < 300 ms | < 250 ms |

### 23.3 Customer-value proof points
- Reduction in missed compliance deadlines (target → near-zero).
- Admin hours saved per fleet per week (target ≥ 8 hrs).
- Reduction in dispatch errors / wrong-vehicle incidents.

---

## 24. Funding Justification

### 24.1 Why invest now
- **De-risked product:** Unlike a typical seed pitch, the core product is **already built** — a working, modular, type-safe platform spanning web, mobile and a customer portal, with ~25 backend modules and a real data model. Capital goes to **scaling a proven product**, not discovering one.
- **Painful, quantifiable problem:** German transport SMEs lose real money to compliance slips, dispatch errors and admin overhead. We sell ROI, not novelty.
- **Underserved, sizeable market:** Thousands of German SMEs sit below enterprise-TMS economics and above what spreadsheets can handle — a clear wedge.
- **Defensible moat:** German-first + DSGVO-native + multilingual + unified workflow = high switching costs and a position incumbents can't easily reach down into.
- **Tailwinds:** Digitalisation grants, regulatory pressure, driver shortage and smartphone ubiquity all push adoption now.

### 24.2 Use of funds (summary)
€750K over 18 months: **~58% product/engineering** to productise (multi-tenancy, billing, integrations, scale, security), **~22% go-to-market** to reach 100 paying fleets, and the remainder to compliance, infrastructure and operations.

### 24.3 What this round achieves
- Multi-tenant, billable, self-serve SaaS with telematics + accounting integrations.
- **100 paying German fleets (~1,000 vehicles)** in Year 1 → **€40K MRR / €480K ARR**, NRR ≥ 105%, < 2% churn.
- A validated, repeatable GTM motion that **doubles the customer base year-over-year** — €960K ARR (Year 2) and **€1.92M ARR (Year 3)** — plus a **~500-vehicle anchor pilot network** seeding enterprise-tier expansion.
- A security- and DSGVO-audited platform on 99.9% uptime.
- The traction and metrics needed to raise a **Series A** for DACH/EU expansion and the intelligence roadmap (predictive maintenance, optimisation, billing automation).

### 24.4 The ask
**€750,000 seed** to convert a built product and a sharp market wedge into a category-leading fleet & workforce platform for German transport SMEs.

---

*Appendix references (in repository): `Fleet_ERD_SCHEMA.md`, `01_DATABASE_SCHEMA.md`, `02_ARCHITECTURE.md`, `03_API_SPECIFICATION.md`, `04_STATE_MACHINES.md`, `05_UI_WIREFRAMES.md`, `06_NOTIFICATION_RULES.md`, `07_PERMISSIONS_AND_ROLES.md`, `backend/src/driver-mobile/CONTRACT.md`, `backend/prisma/schema.prisma`.*

*Confidential — © 2026 Fleet. For investor review only.*
