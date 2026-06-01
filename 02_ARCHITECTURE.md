# Fleet ERP - Architecture

# 1. System Overview

Fleet ERP follows a modular client-server architecture.

Architecture:

Driver Mobile App
        │
        │
        ▼

Frontend (Next.js Admin Panel)
        │
        │ REST API
        ▼

Backend (NestJS API)
        │
        │ Prisma ORM
        ▼

PostgreSQL Database

        │
        ├──── Notifications
        ├──── Reminder Engine
        ├──── Document Service
        └──── Authentication Service

---

# 2. High-Level Components

System consists of:

1. Frontend Admin Panel
2. Backend API
3. Database
4. Notification Engine
5. Driver Mobile Integration

---

# 3. Frontend Architecture

Technology:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

Structure:

frontend/

src/

    app/

        dashboard/
        drivers/
        vehicles/
        companies/
        documents/

        einsatzplan/

            tagesuebersicht/
            jahreskalender/
            abteilungskalender/
            antragsverwaltung/
            transport-requests/
            handovers/

        flottenmonitor/

        notifications/

    components/

        ui/
        cards/
        tables/
        drawers/
        forms/
        calendars/

    hooks/

    services/

    types/

    utils/

---

# 4. Backend Architecture

Technology:

- NestJS
- Prisma ORM
- JWT Authentication
- PostgreSQL

Structure:

backend/

src/

    auth/

    users/

    drivers/

    vehicles/

    companies/

    assignments/

    transport_requests/

    calendar/

    documents/

    handovers/

    accidents/

    leave_requests/

    notifications/

    reminders/

    dashboard/

    common/

---

# 5. Authentication Flow

Login:

User
    ↓

POST /auth/login

    ↓

Backend validates credentials

    ↓

Generate:

- access token
- refresh token

    ↓

Frontend stores token

    ↓

Authenticated API access

---

# 6. Role Flow

Roles:

Admin

Boss

Accounting

Office

Driver

Access:

Admin
→ everything

Boss
→ everything + financial data

Accounting
→ financial reports

Office
→ operational data only

Driver
→ mobile app only

---

# 7. Core Business Flow

Transport Request:

Driver App

    ↓

Submit request

    ↓

Transport Requests

    ↓

Approve

    ↓

Assignment created

    ↓

Create Calendar Event:

AT

    ↓

Update:

Driver History

Vehicle History

Company History

Dashboard

Notifications

Tagesübersicht

---

# 8. Calendar Flow

Vacation:

Request

    ↓

Approve

    ↓

Create:

UT

Calendar Event

---

Sickness:

Request

    ↓

Approve

    ↓

Create:

KT

Calendar Event

---

Assignment:

Approve

    ↓

Create:

AT

Calendar Event

---

# 9. Vehicle Handover Flow

Driver changes vehicle

    ↓

Vehicle comparison

If:

same vehicle

    ↓

No photo required

Else:

Require handover photo

    ↓

Upload photo

    ↓

If damage:

Create accident/cargo damage record

---

# 10. Notification Engine

Sources:

Documents
Assignments
Leave Requests
Transport Requests
Vehicle Handovers

Examples:

- TÜV expires in 30 days
- New transport request
- Missing handover photo
- Open cargo damage report

---

# 11. Reminder Engine

Runs:

Daily Cron Job

Time:

06:00

Checks:

drivers

vehicles

documents

If expiry found:

Create:

Reminder

Notification

---

# 12. File Storage

MVP:

Local storage

Structure:

uploads/

    drivers/

    vehicles/

    companies/

    accidents/

    handovers/

Production:

AWS S3

Cloudinary

---

# 13. Future Architecture Extensions

Not in MVP:

GPS Tracking Service

AI Route Optimization

OCR Service

Warehouse Module

Payroll Module

Audit Logs

Message Service

Customer Portal