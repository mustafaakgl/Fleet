# Fleet ERP - State Machines

Purpose:

Define lifecycle and business transitions for all major entities.

---

# 1. Driver Lifecycle

ACTIVE

↓

ON_LEAVE

↓

ACTIVE

ACTIVE

↓

SICK

↓

ACTIVE

ACTIVE / SICK / ON_LEAVE

↓

INACTIVE

↓

TERMINATED

Status values:

active
on_leave
sick
inactive
terminated

Rules:

active
→ leave approved
→ on_leave

active
→ sick leave approved
→ sick

on_leave
→ leave ended
→ active

sick
→ sick ended
→ active

any
→ employment ended
→ terminated

terminated

No assignments allowed

---

# 2. Vehicle Lifecycle

ACTIVE

↓

BROKEN

↓

MAINTENANCE

↓

ACTIVE

ACTIVE

↓

INACTIVE

↓

SOLD

Status values:

active
broken
maintenance
inactive
sold

Rules:

active

→ report problem

→ broken

broken

→ send to service

→ maintenance

maintenance

→ service completed

→ active

inactive/sold

Cannot receive assignments

---

# 3. Assignment Lifecycle

PLANNED

↓

CONFIRMED

↓

IN_PROGRESS

↓

COMPLETED

PLANNED / CONFIRMED

↓

CANCELLED

Status values:

planned
confirmed
in_progress
completed
cancelled

Rules:

planned

↓

admin confirm

↓

confirmed

confirmed

↓

work starts

↓

in_progress

in_progress

↓

finish work

↓

completed

planned/confirmed

↓

cancel

↓

cancelled

Validation:

Driver cannot:

- overlap assignments
- be UT
- be KT
- be inactive

Vehicle cannot:

- overlap assignments
- be maintenance
- be inactive
- be broken

---

# 4. Transport Request Lifecycle

PENDING

↓

APPROVED

↓

ASSIGNMENT CREATED

PENDING

↓

REJECTED

PENDING

↓

NEEDS_REVIEW

Status values:

pending
approved
rejected
needs_review

Rules:

Approve:

Create:

Assignment

↓

AT Calendar Event

↓

Update:

Driver History

Vehicle History

Company History

Dashboard

Notifications

Reject:

No assignment created

No AT event created

---

# 5. Leave Request Lifecycle

PENDING

↓

APPROVED

↓

CALENDAR EVENT CREATED

PENDING

↓

REJECTED

PENDING

↓

CANCELLED

Status values:

pending
approved
rejected
cancelled

Types:

vacation
sick_leave
other

Rules:

Vacation approve:

↓

Create:

UT

Calendar Event

Sick approve:

↓

Create:

KT

Calendar Event

Approved leave:

Blocks assignment creation

---

# 6. Calendar Event Lifecycle

CREATED

↓

ACTIVE

↓

COMPLETED

Status values:

created
active
completed

Calendar codes:

AT

Work day

UT

Vacation

KT

Sick

FT

Holiday

Rules:

Assignment

↓

AT

Vacation

↓

UT

Sickness

↓

KT

---

# 7. Document Lifecycle

VALID

↓

EXPIRING_SOON

↓

EXPIRED

↓

ARCHIVED

Status values:

valid
expiring_soon
expired
archived

Rules:

90+ days:

valid

90 days:

expiring_soon

Past date:

expired

Expired documents:

Create reminder

Create notification

---

# 8. Reminder Lifecycle

OPEN

↓

SENT

↓

RESOLVED

OPEN

↓

IGNORED

Status values:

open
sent
resolved
ignored

Rules:

Reminder generated

↓

Notification generated

↓

Admin resolves

↓

resolved

---

# 9. Notification Lifecycle

UNREAD

↓

READ

Status values:

unread
read

Rules:

New event

↓

notification created

↓

user clicks

↓

read

---

# 10. Accident / Cargo Damage Lifecycle

REPORTED

↓

UNDER_REVIEW

↓

RESOLVED

REPORTED

↓

REJECTED

Status values:

reported
under_review
resolved
rejected

Rules:

Damage detected:

↓

Create report

↓

Upload documents/photos

↓

Review

↓

Resolve

---

# 11. Vehicle Handover Lifecycle

PENDING

↓

PHOTO_REQUIRED

↓

PHOTO_UPLOADED

↓

COMPLETED

Status values:

pending
photo_required
photo_uploaded
completed

Rules:

If:

previous_vehicle == current_vehicle

↓

No photo needed

↓

completed

Else:

↓

photo_required

↓

upload photo

↓

completed

If damage:

↓

Create accident/cargo damage record