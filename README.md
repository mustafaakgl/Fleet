# Fleet ERP

Fleet ERP is a full-stack fleet operations platform for transport and logistics teams.  
It centralizes daily planning, driver and vehicle lifecycle management, compliance documents, incident tracking, notifications, and operational reporting in one system.

---

## 1) Project Overview

This repository contains:

- A NestJS backend API (`/backend`) with PostgreSQL + Prisma.
- A Next.js frontend (`/frontend`) for operations teams (dispatch, office, accounting, management).
- Local file-based document upload and static file serving for ERP documents.
- Role-based access control with financial field masking and route-level restrictions.

The implementation is assignment-centered and designed around real operational workflows (driver/vehicle/company coordination for daily transport work).

---

## 2) Key Features

- JWT-based authentication and protected API routes.
- Assignment planning with create/update/cancel/transition flow.
- Driver, vehicle, company, service record, and handover management.
- Requests and leave workflows (approve/reject/cancel/needs-review).
- Document tracking (expiring, expired, missing-required) with upload + replace-upload.
- Accident and cargo damage tracking with role-aware financial masking.
- Dashboard KPIs, critical alerts, vehicle health, driver risk overview, revenue analytics (financial roles only).
- Notifications and reminders (including unread count and bulk read).
- Global operational search with role constraints.

---

## 3) Technology Stack

**Backend**

- Node.js + NestJS
- PostgreSQL
- Prisma ORM
- JWT + Passport
- Multer (local disk storage for documents)

**Frontend**

- Next.js (App Router)
- React + TypeScript
- Axios API client
- Tailwind-based UI components

**Infrastructure / Runtime**

- Local development without Docker (`npm run dev:backend`, `npm run dev:frontend`, `npm run dev:full`)
- Optional Docker Compose for deployment-like environments

---

## 4) Architecture Overview

Fleet ERP follows a standard frontend-backend split:

1. Frontend calls REST endpoints under `/api/v1`.
2. Backend applies authentication, RBAC guards, validation, and business services.
3. Prisma persists data to PostgreSQL.
4. Uploaded files are stored on disk and exposed via `/uploads/documents/...`.

Core patterns:

- Module-based backend architecture (NestJS modules per domain).
- DTO validation for request contracts.
- Guard + decorator-based authorization (`JwtAuthGuard`, `RolesGuard`, `DriverBlockGuard`).
- Shared permissions utility for financial visibility and masking.

---

## 5) Backend Modules

Implemented backend domains include:

- `auth`
- `users`
- `drivers`
- `vehicles`
- `companies`
- `assignments`
- `transport-requests`
- `calendar`
- `requests`
- `leave-requests`
- `documents`
- `storage` (abstraction + local storage implementation)
- `vehicle-handovers`
- `accidents`
- `company-emails`
- `notifications`
- `reminders`
- `dashboard`
- `search`
- `service-records`
- `morning-checkins`
- `common`
- `prisma`

---

## 6) Frontend Modules

Implemented frontend areas (App Router pages) include:

- Authentication (`/login`)
- Dashboard (`/dashboard`)
- Drivers (`/drivers`, detail, edit, new)
- Vehicles (`/vehicles`, detail, edit, new)
- Companies (`/companies`, detail, edit, new)
- Assignments (`/assignments`, new)
- Documents (`/documents`)
- Requests (`/requests`)
- Reminders (`/reminders`)
- Service history (`/service-history`)
- Cargo damage (`/cargo-damage`)
- Additional implemented pages: `flottenmonitor`, `live-tracking`, `messenger`, `settings`, `dsgvo`

---

## 7) Assignment-Centered Workflow

Assignments are the operational core:

1. Plan an assignment by linking `driver + vehicle + company + date/time + route/cargo`.
2. Transition assignment states (`planned`, `confirmed`, `in_progress`, `completed`) or cancel.
3. Coordinate with related domains:
   - Driver/vehicle availability
   - Transport requests
   - Calendar entries
   - Vehicle handovers
   - Incident and reminder visibility

This keeps daily operations traceable from planning to completion.

---

## 8) File Upload System

Documents support both metadata-only and file-backed flows:

- `POST /documents/upload`
- `POST /documents/:id/replace-upload`

Implemented behavior:

- Accepted types: PDF, JPG, JPEG, PNG, WEBP
- Max size: 10MB
- Disk storage in `backend/uploads/documents`
- Static serving from `/uploads/documents/{filename}`
- Storage abstraction (`StorageService`) with local implementation (`LocalStorageService`)

---

## 9) RBAC & Security

Security model includes:

- JWT authentication for protected endpoints.
- Role checks via `@Roles(...)` + `RolesGuard`.
- Driver-block guard for non-driver operational/admin endpoints.
- Financial visibility controls:
  - Office role cannot view sensitive financial fields.
  - Financial roles can view relevant financial fields.
  - Sensitive fields are masked in responses using shared masking utilities.
- Role-aware mutation restrictions on critical planning and admin operations.

---

## 10) Local Setup

### Prerequisites

- Node.js (supported by repo engines)
- PostgreSQL running locally (default: `localhost:5432`)

### Install

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Expected local defaults:

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`
- Frontend API URL: `http://localhost:3000/api/v1`

### Run (No Docker)

```bash
# backend only
npm run dev:backend

# frontend only
npm run dev:frontend

# backend + frontend together
npm run dev:full
```

Notes:

- Backend dev startup runs Prisma generate automatically (`prestart:dev`).
- Upload directory is created automatically (`backend/uploads/documents`).

---

## 11) Seed Data

Seed script populates realistic operational data (users, drivers, vehicles, companies, assignments, documents, incidents, reminders, notifications, etc.).

```bash
npm --prefix backend exec prisma db seed
```

Before seed (if needed), ensure schema is in sync:

```bash
npm --prefix backend run prisma:migrate
```

---

## 12) Demo Credentials

Seeded accounts:

- `admin@fleet.com` / `admin123`
- `boss@fleet.com` / `boss123`
- `accounting@fleet.com` / `accounting123`
- `office@fleet.com` / `office123`

---

## 13) API Overview

Base path: `/api/v1`

Main endpoint groups:

- `auth`
- `users`
- `drivers`
- `vehicles`
- `companies`
- `assignments`
- `transport-requests`
- `calendar`
- `requests`
- `leave-requests`
- `documents`
- `vehicle-handovers`
- `accidents`
- `company-emails`
- `notifications`
- `reminders`
- `dashboard`
- `search`
- `service-records`
- `morning-checkins`

The frontend API client is implemented in `frontend/lib/api.ts`.

---

## 14) Roadmap

Planned and/or future-facing areas (as tracked in project docs):

- GPS live tracking enhancements
- Work session / end-of-shift flows
- Expanded internal messaging workflows
- Broader multilingual support
- Advanced accident and cargo incident workflows
- Email automation improvements
- Finance and salary integration extensions

---

## 15) Screenshots

> Place product screenshots here.

- `[Placeholder]` Login screen
- `[Placeholder]` Dashboard overview
- `[Placeholder]` Assignment planning
- `[Placeholder]` Driver detail
- `[Placeholder]` Vehicle detail
- `[Placeholder]` Documents upload and replacement

---

## Optional: Docker (kept for deployment workflows)

Docker files are intentionally kept in the repository for later deployment use.

```bash
npm run docker:up
npm run docker:logs
npm run docker:down
```
