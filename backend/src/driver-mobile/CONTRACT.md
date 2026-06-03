# Driver Mobile API Contract

Driver-only API namespace for the mobile application.

Base prefix: `/api/v1/driver`

All endpoints enforce JWT + `role=driver` and ownership scoping from the authenticated user.

## Profile

- `GET /me` — linked `user` and `driver` profile
- `POST /me/language` — body: `{ language }` (`de|tr|en|pl|nl|it|es|ru`)
- `POST /me/push-token` — body: `{ token }` (Expo push token)
- `DELETE /me/push-token` — clear token on logout
- `POST /me/location-consent`
- `GET /me/location-status`
- `POST /location` — submit GPS payload

## Assignments

- `GET /assignments/today?date=YYYY-MM-DD`
- `GET /assignments/:id`

## Morning check-ins

- `GET /morning-checkins?date=YYYY-MM-DD`
- `POST /morning-checkins` — body: `date`, optional `vehiclePlate`, `companyName`, `notes`

## Vehicle handovers

- `GET /vehicle-handovers` — filters: `status`, `photoStatus`, `date`
- `POST /vehicle-handovers`
- `POST /vehicle-handovers/:id/photo` (multipart, field `file`)

## Leave / absence requests

- `GET /requests` — filters: `status`, `type`
- `POST /requests` — body: `type`, `startDate`, `endDate`, optional `reason`

Supported `type` values: `vacation`, `sick_leave`, `training`, `business_trip`, `doctor_appointment`, `special_leave`, `overtime_compensation`, `free_day`, `other`.

## Transport requests

- `GET /transport-requests` — optional `status`
- `GET /transport-form-options` — vehicles/companies from today's assignments
- `POST /transport-requests`

## Incidents

- `GET /accidents` — filters: `type`, `status`
- `POST /accidents`

## Notifications

- `GET /notifications?status=unread|read`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

In-app notifications are created for assignment changes, request outcomes, messenger messages, and transport request outcomes (with push).
