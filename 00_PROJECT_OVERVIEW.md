# Fleet ERP - Project Overview

# 1. Project Goal

Fleet ERP is an operations-focused fleet management and dispatch platform built for logistics companies.

The system manages:

- Drivers
- Vehicles
- Customer companies
- Daily planning (Einsatzplan)
- Driver assignments
- Documents
- Leave management
- Vehicle handovers
- Accidents and cargo damage
- Notifications
- Operational monitoring

The main goal:

Provide office staff and management a single operational system where they can manage daily fleet activities efficiently.

---

# 2. Core Concept

The system is centered around:

Assignment

Assignment acts as the central operational entity.

Example:

Driver:
Ilker Cukur

Vehicle:
AP-101

Company:
DHL

Cargo:
Electronics Pallets

Pickup:
Berlin Neukölln

Delivery:
Berlin Mitte

Start:
07:00

Status:
Planned

Everything connects to assignments:

Transport Request
        ↓
Approve
        ↓
Assignment
        ↓
Calendar Event (AT)
        ↓
Driver History
        ↓
Vehicle History
        ↓
Company History
        ↓
Dashboard
        ↓
Notifications

---

# 3. User Roles

## Admin

Full system access.

Permissions:

- Drivers
- Vehicles
- Companies
- Assignments
- Documents
- Notifications
- Revenue
- User management

---

## Boss

Management role.

Permissions:

- Full operational access
- Financial reports
- Revenue visibility
- Dashboard analytics

---

## Accounting

Financial role.

Permissions:

- Company revenue
- Reports
- Financial analytics
- Contract documents

---

## Office

Daily operations role.

Permissions:

- Drivers
- Vehicles
- Planning
- Requests
- Documents

Restrictions:

Cannot view:

- Revenue
- Financial values

---

## Driver

Mobile application only.

Driver web access is not required.

Driver actions:

- Submit transport request
- View assignments
- Report accident
- Upload handover photo
- Request leave/sick leave

---

# 4. MVP Modules

## Dashboard

Contains:

- KPI cards
- Active drivers
- Active vehicles
- Expiring documents
- Open accidents
- Cargo damages
- Notifications
- Today's assignments

---

## Drivers

Contains:

- Driver list
- Driver profile
- Documents
- Assignment history
- Risk score
- Leave history
- Accident history

---

## Vehicles

Contains:

- Vehicle list
- Vehicle profile
- Documents
- Assignment history
- Service history
- Handover history

---

## Companies

Contains:

- Company list
- Company profile
- Assignment history
- Revenue
- Documents
- Cargo damage history

---

## Documents

Shared document system.

Owner types:

- Driver
- Vehicle
- Company
- Request
- Accident
- Cargo Damage

---

## Einsatzplan

Main planning system.

Contains:

### Tagesübersicht

Daily dispatch board.

Shows:

- Active assignments
- Sick drivers
- Vacation drivers
- Companies

---

### Jahreskalender

Yearly calendar.

Status types:

- AT
- UT
- KT
- FT

---

### Abteilungskalender

Department-style calendar view.

---

### Antragsverwaltung

Request management.

---

### Transport Requests

Incoming driver planning requests.

---

### Vehicle Handovers

Vehicle pickup/return process.

---

## Flottenmonitor

Fleet monitoring module.

Contains:

- Vehicle overview
- Fahrhistorie
- Fuel history

---

## Accidents & Cargo Damage

Contains:

- Accident reports
- Cargo damage reports
- Photos
- Status workflow

---

## Notifications

Contains:

- Reminder notifications
- Request notifications
- Operational alerts

---

## Global Search

Search across:

- Drivers
- Vehicles
- Companies
- Documents
- Assignments

---

# 5. Technology Stack

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend:

- NestJS
- Prisma ORM
- PostgreSQL

Authentication:

- JWT

File Storage:

MVP:

Local storage

Production:

AWS S3 / Cloudinary

---

# 6. Future V2 Features

Not part of MVP:

- GPS tracking
- Messenger
- AI route optimization
- OCR document scanning
- Payroll
- Customer portal
- Warehouse management
- AI assistant

---

# 7. Main Philosophy

The system should:

- Be simple
- Be fast
- Be operational
- Avoid unnecessary complexity

MVP first.

ERP later.