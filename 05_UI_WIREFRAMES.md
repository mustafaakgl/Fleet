# Fleet ERP - UI Wireframes

Purpose:

Define MVP UI pages and layout.

Design:

- Next.js
- Tailwind CSS
- shadcn/ui
- ERP style
- Compact tables
- Clean layout

---

# 1. Main Layout

Sidebar:

┌────────────────────┐
│ FLEET ERP          │
├────────────────────┤

│ 📊 Dashboard
│ 👤 Drivers
│ 🚚 Vehicles
│ 🏢 Companies
│ 📄 Documents

│ 📅 Einsatzplan

│ 🚛 Flottenmonitor

│ ⚠ Accidents

│ 🔔 Notifications

└────────────────────┘

---

Header:

┌───────────────────────────────────────────┐

Search...

Language Switch

Notification Bell

User Menu

└───────────────────────────────────────────┘

Language:

DE | EN | TR

---

# 2. Dashboard

Dashboard

KPI cards:

┌─────────────┐
│Active Driver│
│95           │
└─────────────┘

┌─────────────┐
│Vehicles     │
│70           │
└─────────────┘

┌─────────────┐
│Assignments  │
│42           │
└─────────────┘

┌─────────────┐
│Expiring Docs│
│6            │
└─────────────┘

---

Second row:

Vehicle Health

Driver Risk

Today's Assignments

Upcoming Notifications

---

# 3. Drivers

Drivers

Search

Status filter

+ Add Driver

---------------------------------

Name

Phone

Status

Risk

Actions

View

Edit

---

Driver Profile

Single page

Sections:

Header

Personal Information

Documents

Assignment History

Leave History

Accident History

Notes

---

# 4. Vehicles

Vehicles

Search

Status filter

+ Add Vehicle

---------------------------------

Plate

Brand

Status

Actions

View

Edit

---

Vehicle Profile

Single page

Sections:

Vehicle Info

Documents

Assignment History

Service History

Handover History

Notes

---

# 5. Companies

Companies

Search

+ Add Company

---------------------------------

Company

Contact Person

Drivers

Vehicles

Assignments

Actions

View

---

Company Profile

Single page

Sections:

Header

Company Information

Current Assignments

Assignment History

Driver History

Vehicle History

Email History

Documents

Cargo Damage History

Notes

Revenue visible only:

Admin

Boss

Accounting

---

# 6. Documents

Documents

Search

Filters:

Owner Type

Document Type

Status

---------------------------------

Owner

Document

Expiry

Status

Actions

View

Replace

Delete

---

Document Drawer

Owner

Document Type

File

Expiry

Status

Preview Placeholder

---

# 7. Einsatzplan

Tabs:

Tagesübersicht

Jahreskalender

Abteilungskalender

Antragsverwaltung

Transport Requests

Vehicle Handovers

---

# 8. Tagesübersicht

Top:

Date

Today

Tomorrow

Export Excel

Search

Refresh

---

Status blocks:

Urlaub

Krank

Kündigung

---

Company assignment cards:

Company:

DHL

Driver

Vehicle

Trailer

Start Time

---

Click row:

Assignment Drawer

---

# 9. Jahreskalender

Year calendar

Status:

AT

UT

KT

FT

Hover:

Show tooltip

Click:

Open details

Empty cells:

Right click

↓

Context Menu

Options:

Urlaub eintragen

Krankenstand eintragen

Sonstige Abwesenheit

---

# 10. Abteilungskalender

Department-style calendar

Same behavior as Jahreskalender

---

# 11. Antragsverwaltung

Request list

Status:

Pending

Approved

Rejected

---

# 12. Transport Requests

Table:

Driver

Vehicle

Company

Cargo

Pickup

Delivery

Status

Actions

Approve

Reject

---

# 13. Vehicle Handovers

Table:

Driver

Previous Vehicle

Current Vehicle

Photo Required

Photo Status

Damage

Status

---

# 14. Flottenmonitor

Tabs:

Übersicht

Fahrhistorie

Fuel History

---

Fahrhistorie:

Vehicle Sidebar

Date filter

Event history table

Trip summary

---

# 15. Accidents

Tabs:

Vehicle Accidents

Cargo Damage

---

Table:

Driver

Vehicle

Company

Date

Status

Actions

---

# 16. Notifications

Bell dropdown:

Priority

Title

Message

Time

Status

Mark all read

---

# 17. Global Search

Search:

Drivers

Vehicles

Companies

Documents

Assignments

Results:

Type Icon

Name

Subtitle