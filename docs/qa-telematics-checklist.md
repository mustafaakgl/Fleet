# QA Checklist - Telematics and Tacho

## Scope
- Verify telematics ingest -> backend persistence -> dashboard read endpoints.
- Verify threshold-triggered notifications for telematics.
- Note: Tachograph (C4) backend infringement engine is not present in current backend source tree, so tacho-specific runtime assertions are limited to availability checks.

## Pre-Checks
- Backend is running with valid database connection.
- At least one tenant has:
  - one active vehicle,
  - one assigned driver for today,
  - one operational user (admin/boss/accounting/office) to receive notifications.
- Device ingest API key is configured for telematics telemetry endpoint.

## Telematics Ingest and Read Endpoints
1. POST telemetry payload to `POST /tracking/telematics/telemetry` with:
- `vehicleId`, `latitude`, `longitude`, `recordedAt`
- optional telemetry fields: `ignition`, `rpm`, `fuelLevelPct`, `coolantTemp`, `voltage`, `odometerKm`
- optional arrays: `dtc[]`, `events[]`

Expected:
- request accepted with `accepted=true`.
- latest row updated in vehicle telemetry latest state.
- latest driver location and location history contain source `telematics`.

2. Call `GET /tracking/telematics/vehicle-health`.

Expected:
- response includes `summary`, `vehicles`, `openDtcs`.
- each vehicle item includes `health`, `latest`, `openDtcCount`.
- DTC entries from ingest are visible in `openDtcs` with recent `occurredAt`.

3. Call `GET /tracking/telematics/driver-scores`.

Expected:
- response includes `fleetAverage` and `drivers`.
- each driver item includes `driverId`, `name`, `score`, `harshCount`, `overspeedCount`.

## Tenant Isolation
1. Use Tenant-A token and call both endpoints.
2. Use Tenant-B token and call both endpoints.

Expected:
- Tenant-A only sees Tenant-A vehicles/drivers/events.
- Tenant-B only sees Tenant-B vehicles/drivers/events.
- no cross-tenant plate, driver, or DTC leakage.

## Threshold Notification Rules
1. Critical DTC rule
- ingest telemetry with `dtc=[{ code: "P2002", severity: "critical" }]`.

Expected:
- notification created with related entity type `telematics_critical_dtc`.
- sent to active operational roles for the same tenant.
- dedupe window prevents repeated spam for same vehicle+code.

2. Low battery rule
- ingest telemetry with `voltage < 11.8`.

Expected:
- notification created with related entity type `telematics_low_voltage`.
- priority is high.
- dedupe window prevents repeated spam for same vehicle.

3. Overspeed rule
- ingest telemetry with `events` containing `speeding`.

Expected:
- notification created with related entity type `telematics_overspeed`.
- priority is low.
- dedupe window prevents repeated spam for same vehicle.

## Tacho (C4) Availability Check
1. Verify whether backend has tachograph infringement ingest/processor endpoints.

Expected now:
- no active tacho infringement processor detected in backend source.
- when C4 module is added, extend this checklist with:
  - infringement generation assertions,
  - remaining drive-time threshold (< 30 min) notification assertions.

## Smoke Scenario (Quick)
1. Send one sim telemetry payload with:
- one speeding event,
- one critical DTC,
- low voltage.
2. Read vehicle health and driver scores endpoints.
3. Open notification center as operational user.

Expected:
- telemetry accepted.
- vehicle health shows updated latest telemetry and open DTC.
- driver scores show non-empty driver metrics.
- at least one new telematics threshold notification appears.
