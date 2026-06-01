# Fleet ERP - API Specification

Base URL:

/api/v1

Protected endpoints:

Authorization: Bearer {JWT}

---

# 1. Authentication

## Login

POST /auth/login

Request:

{
    "email":"admin@fleet.com",
    "password":"password123"
}

Response:

{
    "access_token":"jwt",
    "refresh_token":"jwt",
    "expires_in":3600,

    "user":{
        "id":"uuid",
        "name":"Admin",
        "role":"admin"
    }
}

---

## Current User

GET /auth/me

Response:

{
"id":"uuid",
"name":"Admin",
"role":"admin",
"language":"de"
}

---

# 2. Dashboard

## Dashboard Summary

GET /dashboard

Response:

{

"active_drivers":95,

"active_vehicles":70,

"today_assignments":42,

"open_accidents":3,

"cargo_damage":1,

"expiring_documents":6,

"notifications":12

}

---

# 3. Drivers

## List Drivers

GET /drivers

Filters:

?page=1
&limit=20
&status=active
&search=

---

## Driver Detail

GET /drivers/{id}

Response:

{

"id":"uuid",

"name":"Ilker Cukur",

"phone":"+49",

"status":"active",

"risk_level":"green",

"documents":[],

"assignment_history":[],

"leave_history":[],

"accidents":[]

}

---

## Create Driver

POST /drivers

---

## Update Driver

PATCH /drivers/{id}

---

## Deactivate Driver

DELETE /drivers/{id}

---

# 4. Vehicles

## List Vehicles

GET /vehicles

---

## Vehicle Detail

GET /vehicles/{id}

Response:

{

"id":"uuid",

"plate":"AP-101",

"brand":"Mercedes",

"model":"Actros",

"status":"active",

"documents":[],

"service_history":[],

"handover_history":[]

}

---

## Create Vehicle

POST /vehicles

---

## Update Vehicle

PATCH /vehicles/{id}

---

## Deactivate Vehicle

DELETE /vehicles/{id}

---

# 5. Companies

## List Companies

GET /companies

---

## Company Detail

GET /companies/{id}

Response:

{

"id":"uuid",

"name":"DHL",

"contact_person":"John",

"email":"contact@dhl.com",

"phone":"+49",

"current_assignments":[],

"documents":[],

"cargo_damage_history":[]

}

---

## Create Company

POST /companies

---

## Update Company

PATCH /companies/{id}

---

# 6. Assignments

## List Assignments

GET /assignments

Filters:

date
driver_id
vehicle_id
company_id

---

## Create Assignment

POST /assignments

Request:

{

"driver_id":"uuid",

"vehicle_id":"uuid",

"company_id":"uuid",

"cargo_name":"Electronics",

"pickup_address":"Berlin",

"delivery_address":"Hamburg",

"work_date":"2026-05-22",

"start_time":"07:00"

}

Business Rules:

- Driver cannot overlap
- Vehicle cannot overlap
- Driver cannot be UT/KT
- Vehicle cannot be maintenance

---

## Update Assignment

PATCH /assignments/{id}

---

## Cancel Assignment

POST /assignments/{id}/cancel

---

# 7. Transport Requests

## List Requests

GET /transport-requests

---

## Approve Request

POST /transport-requests/{id}/approve

Flow:

Request

↓

Assignment

↓

AT Calendar Event

↓

Driver History

↓

Vehicle History

↓

Company History

↓

Notification

---

## Reject Request

POST /transport-requests/{id}/reject

---

# 8. Calendar

## List Events

GET /calendar

Filters:

driver_id
date
status

---

## Create Manual Event

POST /calendar

Request:

{

"driver_id":"uuid",

"date":"2026-05-22",

"status":"UT"

}

---

# 9. Leave Requests

## Create Leave

POST /leave-requests

---

## Approve Leave

POST /leave-requests/{id}/approve

Behavior:

Vacation:

↓

Create UT

Sick:

↓

Create KT

---

## Reject Leave

POST /leave-requests/{id}/reject

---

# 10. Documents

## List Documents

GET /documents

Filters:

owner_type
owner_id

---

## Upload Document

POST /documents

multipart/form-data

Fields:

owner_type
owner_id
document_type
expiry_date
file

---

## Replace Document

PATCH /documents/{id}

---

## Delete Document

DELETE /documents/{id}

---

# 11. Vehicle Handovers

## List Handovers

GET /vehicle-handovers

---

## Create Handover

POST /vehicle-handovers

Rules:

same vehicle:

photo_required=false

different vehicle:

photo_required=true

---

# 12. Accidents

## List

GET /accidents

---

## Create

POST /accidents

---

## Update Status

PATCH /accidents/{id}

---

# 13. Notifications

## List Notifications

GET /notifications

---

## Mark Read

POST /notifications/{id}/read

---

## Mark All Read

POST /notifications/read-all

---

# 14. Search

GET /search?q=

Searches:

- Drivers
- Vehicles
- Companies
- Documents
- Assignments

Response:

{

"drivers":[],

"vehicles":[],

"companies":[],

"documents":[]

}