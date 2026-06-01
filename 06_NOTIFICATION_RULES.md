# Fleet ERP - Notification & Reminder Rules

Purpose:

Define all notification and reminder generation rules inside Fleet ERP.

MVP Goal:

- Inform users about important operational events
- Prevent missed documents
- Prevent planning conflicts
- Support office workflow

---

# 1. Notification Channels

MVP:

✓ In-app notifications

✓ Dashboard alerts

✓ Notification Bell

---

Future:

Email

Push notification

WhatsApp

SMS

---

# 2. Notification Priorities

Low

Medium

High

Critical

---

Priority colors:

Low:

Blue

Medium:

Yellow

High:

Orange

Critical:

Red

---

# 3. Notification Types

Transport Request

Leave Request

Expiring Document

Vehicle Handover

Accident

Cargo Damage

Reminder

Assignment

Company Email

System

---

# 4. Notification Data Structure

```ts
{
id:string;

title:string;

message:string;

type:string;

priority:
'low'
|'medium'
|'high'
|'critical';

status:
'unread'
|'read';

related_entity_type?:string;

related_entity_id?:string;

created_at:timestamp;
}
```

---

# 5. Notification Rules

## New Transport Request

Trigger:

Driver submits request

Create:

Priority:

Medium

Example:

Title:

New Transport Request

Message:

Ilker Cukur submitted a request for tomorrow.

Recipient:

Office
Admin

---

## Transport Request Approved

Trigger:

Admin approves request

Create:

Priority:

Low

Example:

Title:

Transport Request Approved

Message:

Assignment created successfully.

Recipient:

Office

---

## Leave Request Created

Trigger:

Vacation/sick request submitted

Priority:

Medium

Example:

Title:

New Leave Request

Message:

Thomas Scharein requested vacation.

Recipient:

Office

Admin

---

## Missing Handover Photo

Trigger:

Vehicle changed

AND

photo_uploaded=false

Priority:

High

Example:

Title:

Missing Handover Photo

Message:

Thomas Scharein has not uploaded handover photo.

Recipient:

Office

---

## Accident Created

Trigger:

New accident report

Priority:

Critical

Example:

Title:

New Accident Report

Message:

Vehicle AP-101 reported an accident.

Recipient:

Admin

Office

---

## Cargo Damage Created

Trigger:

New cargo damage

Priority:

Critical

Example:

Title:

Cargo Damage Reported

Message:

Cargo damage created for DHL shipment.

Recipient:

Admin

Office

Boss

---

## Company Email Failed

Trigger:

status=failed

Priority:

High

Example:

Title:

Company Email Failed

Message:

Email to DHL could not be delivered.

Recipient:

Office

Admin

---

# 6. Reminder Types

license_expiry

passport_expiry

tuv_expiry

sp_expiry

insurance_expiry

document_expiry

custom

---

# 7. Reminder Windows

Default:

90 days

60 days

30 days

7 days

---

Examples:

License expires:

31.12.2026

Generate:

02.10.2026

01.11.2026

01.12.2026

24.12.2026

---

# 8. Reminder Cron Job

Runs:

Every day

Time:

06:00

Checks:

drivers

vehicles

documents

Logic:

FOR each document

IF:

today + notify_before_days

THEN:

Create Reminder

Create Notification

---

# 9. Duplicate Prevention

Prevent:

same reminder created twice

Unique logic:

target_type
+
target_id
+
reminder_type
+
due_date
+
notify_before_days

---

# 10. Notification Bell Rules

Bell icon:

Top Navbar

Unread count:

Example:

🔔 6

Click:

Open Notification Center

Features:

Mark Read

Mark All Read

Navigate to related page

Close on outside click

---

# 11. Dashboard Alerts

Dashboard can show:

Expiring documents

Open accidents

Pending requests

Missing handover photos

Unsent company emails

Upcoming reminders

---

# 12. Future Notification Rules

Not MVP:

Assignment changed

Driver online/offline

GPS alerts

Route delays

AI recommendations

Warehouse alerts