# Fleet Driver Mobile (Expo)

Driver mobile MVP built with Expo + React Native + TypeScript.

## Covered MVP Screens

- Login
- Home / Today
- Assignment Detail
- Morning Check-in
- Vehicle Handover Photo Upload
- Leave / Sick Request
- Accident Report
- Cargo Damage Report
- Notifications
- Profile / Settings

## Backend Contract

This app targets the driver namespace endpoints:

- `GET /api/v1/driver/me`
- `GET /api/v1/driver/assignments/today`
- `GET /api/v1/driver/assignments/:id`
- `GET/POST /api/v1/driver/morning-checkins`
- `GET/POST /api/v1/driver/vehicle-handovers`
- `POST /api/v1/driver/vehicle-handovers/:id/photo`
- `GET/POST /api/v1/driver/requests`
- `GET/POST /api/v1/driver/accidents`
- `GET /api/v1/driver/notifications`
- `GET /api/v1/driver/notifications/unread-count`
- `POST /api/v1/driver/notifications/:id/read`
- `POST /api/v1/driver/notifications/read-all`

## Run

```bash
cd mobile-driver
npm install
npm run start
```

## QA Credentials

These credentials are created by `prisma db seed`:

- Email: `driver@fleet.com`
- Password: `driver123`

## Quick QA Script

From workspace root:

```bash
npm run qa:mobile-driver
```
