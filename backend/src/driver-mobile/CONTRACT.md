# Driver Mobile API Contract

Driver-only API namespace introduced for the mobile application.

Base prefix: `/api/v1/driver`

## Authenticated Driver Profile

- `GET /me`
  - Returns linked `user` and `driver` profile.
  - Enforces that JWT user has a linked `Driver` record.

## Assignments

- `GET /assignments/today?date=YYYY-MM-DD`
  - Returns only current driver's assignments for day.
- `GET /assignments/:id`
  - Returns assignment detail with ownership check.

## Morning Check-ins

- `GET /morning-checkins?date=YYYY-MM-DD`
- `POST /morning-checkins`
  - Body: `date`, optional `vehiclePlate`, `companyName`, `notes`.
  - One check-in per driver/day enforced.

## Vehicle Handovers

- `GET /vehicle-handovers`
  - Optional filters: `status`, `photoStatus`, `date`.
- `POST /vehicle-handovers`
  - Body: `vehicleId`, optional `previousVehicleId`, `assignmentId`, `handoverType`, `handoverDateTime`, damage fields.
- `POST /vehicle-handovers/:id/photo` (multipart)
  - Field: `file`
  - Creates a `Document` with `ownerType=vehicle_handover` and marks handover `photoStatus=uploaded`.

## Leave / Sick Requests

- `GET /requests`
- `POST /requests`
  - Body: `type`, `startDate`, `endDate`, optional `reason`.

## Accident + Cargo Damage

- `GET /accidents`
  - Optional: `type`, `status`.
- `POST /accidents`
  - Body: `type`, `incidentDateTime`, `description`, optional `assignmentId`, `vehicleId`, `companyId`, and cargo fields.
  - `vehicleId` can be derived from `assignmentId`.

## Notifications

- `GET /notifications?status=unread|read`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

All endpoints enforce JWT + `role=driver` and ownership scoping from the authenticated user.
