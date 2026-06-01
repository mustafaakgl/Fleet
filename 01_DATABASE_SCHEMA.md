# Fleet ERP - Database Schema

# 1. users

Purpose:
System users

```sql
users
-------
id UUID PK
full_name VARCHAR(255)

email VARCHAR(255) UNIQUE
password_hash VARCHAR(255)

role ENUM(
'admin',
'boss',
'accounting',
'office',
'driver'
)

language ENUM(
'de',
'en',
'tr'
)

status ENUM(
'active',
'inactive'
)

created_at TIMESTAMP
updated_at TIMESTAMP
```

---

# 2. drivers

Purpose:
Driver information

```sql
drivers
--------
id UUID PK

user_id UUID FK users.id

employee_number VARCHAR(50)

first_name VARCHAR(255)
last_name VARCHAR(255)

phone VARCHAR(50)
email VARCHAR(255)

license_number VARCHAR(255)
license_expiry_date DATE

passport_number VARCHAR(255)
passport_expiry_date DATE

status ENUM(
'active',
'on_leave',
'sick',
'inactive',
'terminated'
)

risk_level ENUM(
'green',
'yellow',
'red'
)

notes TEXT

created_at TIMESTAMP
updated_at TIMESTAMP
```

---

# 3. vehicles

Purpose:
Vehicle master data

```sql
vehicles
---------

id UUID PK

plate_number VARCHAR(50)

internal_code VARCHAR(50)

brand VARCHAR(255)
model VARCHAR(255)

year INTEGER

vin VARCHAR(255)

status ENUM(
'active',
'maintenance',
'broken',
'inactive'
)

current_driver_id UUID FK drivers.id

tuv_expiry_date DATE
sp_expiry_date DATE

insurance_expiry_date DATE
registration_expiry_date DATE

notes TEXT

created_at TIMESTAMP
updated_at TIMESTAMP
```

---

# 4. companies

Purpose:
Customer companies

```sql
companies
----------

id UUID PK

name VARCHAR(255)

email VARCHAR(255)

phone VARCHAR(50)

address TEXT

contact_person VARCHAR(255)

default_daily_revenue DECIMAL(10,2)

notes TEXT

created_at TIMESTAMP
updated_at TIMESTAMP
```

---

# 5. assignments

Purpose:
Main planning entity

```sql
assignments
------------

id UUID PK

driver_id UUID FK drivers.id

vehicle_id UUID FK vehicles.id

company_id UUID FK companies.id

cargo_name VARCHAR(255)

cargo_owner VARCHAR(255)

pickup_address TEXT

delivery_address TEXT

work_date DATE

start_time TIME
end_time TIME

route_name VARCHAR(255)

status ENUM(
'planned',
'confirmed',
'in_progress',
'completed',
'cancelled'
)

notes TEXT

created_by UUID FK users.id

created_at TIMESTAMP
updated_at TIMESTAMP
```

---

# 6. transport_requests

Purpose:
Incoming requests from driver app

```sql
transport_requests
-------------------

id UUID PK

driver_id UUID FK drivers.id

vehicle_id UUID FK vehicles.id

company_id UUID FK companies.id

cargo_name VARCHAR(255)

cargo_owner VARCHAR(255)

pickup_address TEXT

delivery_address TEXT

requested_date DATE

start_time TIME

status ENUM(
'pending',
'approved',
'rejected',
'needs_review'
)

conflict_reason TEXT

created_at TIMESTAMP
```

---

# 7. calendar_events

Purpose:
Calendar statuses

```sql
calendar_events
----------------

id UUID PK

driver_id UUID FK drivers.id

assignment_id UUID FK assignments.id

date DATE

status ENUM(
'AT',
'UT',
'KT',
'FT'
)

source ENUM(
'assignment',
'leave',
'manual'
)

created_at TIMESTAMP
```

---

# 8. documents

Purpose:
Shared document system

```sql
documents
----------

id UUID PK

owner_type ENUM(
'driver',
'vehicle',
'company',
'accident',
'cargo_damage',
'request'
)

owner_id UUID

document_type VARCHAR(255)

file_name VARCHAR(255)

file_url TEXT

expiry_date DATE

status ENUM(
'valid',
'expiring_soon',
'expired',
'missing'
)

notes TEXT

uploaded_by UUID FK users.id

created_at TIMESTAMP
```

---

# 9. vehicle_handovers

Purpose:
Pickup/return process

```sql
vehicle_handovers
------------------

id UUID PK

driver_id UUID FK drivers.id

vehicle_id UUID FK vehicles.id

assignment_id UUID FK assignments.id

previous_vehicle_id UUID

photo_required BOOLEAN

photo_uploaded BOOLEAN

damage_detected BOOLEAN

status ENUM(
'pending',
'completed'
)

notes TEXT

created_at TIMESTAMP
```

---

# 10. accidents

Purpose:
Accident + cargo damage

```sql
accidents
-----------

id UUID PK

type ENUM(
'vehicle_accident',
'cargo_damage'
)

driver_id UUID FK drivers.id

vehicle_id UUID FK vehicles.id

assignment_id UUID FK assignments.id

location TEXT

description TEXT

cargo_owner VARCHAR(255)

damage_value DECIMAL(10,2)

status ENUM(
'reported',
'under_review',
'resolved'
)

created_at TIMESTAMP
```

---

# 11. leave_requests

Purpose:
Vacation and sickness

```sql
leave_requests
----------------

id UUID PK

driver_id UUID FK drivers.id

type ENUM(
'vacation',
'sick_leave',
'other'
)

start_date DATE
end_date DATE

reason TEXT

status ENUM(
'pending',
'approved',
'rejected',
'cancelled'
)

created_at TIMESTAMP
```

---

# 12. notifications

Purpose:
System notifications

```sql
notifications
---------------

id UUID PK

user_id UUID FK users.id

title VARCHAR(255)

message TEXT

type VARCHAR(100)

is_read BOOLEAN

created_at TIMESTAMP
```

---

# 13. reminders

Purpose:
Expiry and operational reminders

```sql
reminders
------------

id UUID PK

target_type VARCHAR(50)

target_id UUID

reminder_type VARCHAR(100)

due_date DATE

notify_before_days INTEGER

status ENUM(
'pending',
'sent',
'resolved'
)

created_at TIMESTAMP
```

---

# 14. company_emails

Purpose:
Generated customer emails

```sql
company_emails
---------------

id UUID PK

company_id UUID FK companies.id

subject VARCHAR(255)

recipient VARCHAR(255)

status ENUM(
'draft',
'sent',
'failed'
)

last_sent TIMESTAMP

created_at TIMESTAMP
```