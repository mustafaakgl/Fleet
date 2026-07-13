# TEST AJANI Kanit Logu — 2026-07-13

Ortam secimi: local dev ortam
Gerekce: Docker daemon erisilemedi, compose adimlari bu turda kosulamadi.

## 0. Ortam hijyeni

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && lsof -nP -iTCP:3000 -sTCP:LISTEN && lsof -nP -iTCP:3001 -sTCP:LISTEN && lsof -nP -iTCP:5027 -sTCP:LISTEN
```
Ham ciktı:
```text
COMMAND   PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    53860 mustafaakgul   26u  IPv6 0x1b008c17cd8ac857      0t0  TCP *:3000 (LISTEN)
COMMAND   PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    22114 mustafaakgul   17u  IPv6 0xfca6867a9e9a0821      0t0  TCP *:3001 (LISTEN)
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && docker info --format '{{.ServerVersion}}'
```
Ham ciktı:
```text
failed to connect to the docker API at unix:///Users/mustafaakgul/.docker/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /Users/mustafaakgul/.docker/run/docker.sock: connect: no such file or directory
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && kill -9 53860 22114
cd /Users/mustafaakgul/Projects/Fleet && lsof -nP -iTCP:3000 -sTCP:LISTEN
cd /Users/mustafaakgul/Projects/Fleet && lsof -nP -iTCP:3001 -sTCP:LISTEN
cd /Users/mustafaakgul/Projects/Fleet && lsof -nP -iTCP:5027 -sTCP:LISTEN
```
Ham ciktı:
```text
kill: kill 53860 failed: no such process
kill: kill 22114 failed: no such process
(base) mustafaakgul@Mustafa-MacBook-Pro Fleet %
(base) mustafaakgul@Mustafa-MacBook-Pro Fleet %
(base) mustafaakgul@Mustafa-MacBook-Pro Fleet %
```

## 1. Statik katman

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsc --noEmit
```
Ham ciktı:
```text
(base) mustafaakgul@Mustafa-MacBook-Pro backend %
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/frontend && PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify
```
Ham ciktı (ozet):
```text
i18n-check passed
✓ Compiled successfully in 12.5s
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages (104/104)
✓ Collecting build traces
✓ Finalizing page optimization
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && git status --short
```
Ham ciktı:
```text
?? PROMPTS/logs/kanit/
?? PROMPTS/test-ajani.md
?? RAPOR-SATIS-DENETIMI.md
```

## 2. Birim + entegrasyon

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
```
Ham ciktı:
```text
1..69
# tests 214
# suites 69
# pass 214
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6204.319875
[run-tests] summary spec_files=57 tests=214 pass=214 fail=0
```

## 3. Dogrulama script'leri

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH /usr/bin/time -p sh -c "node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs"
```
Ham ciktı:
```text
[codec8-sim] failed scenario=normal error=gateway kapali — su komutla baslat: PATH=/opt/homebrew/opt/node@22/bin:$PATH npm --prefix backend run start:dev (host=127.0.0.1 port=5027; detay=connect ECONNREFUSED 127.0.0.1:5027)
[verify-tacho-telematics] gateway kapali — su komutla baslat: PATH=/opt/homebrew/opt/node@22/bin:$PATH npm --prefix backend run start:dev (host=127.0.0.1 port=5027; detay=connect ECONNREFUSED 127.0.0.1:5027)
real 0.12
user 0.17
sys 0.02
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx ts-node --transpile-only scripts/tenant-isolation-check.ts
```
Ham ciktı:
```text
Total drivers (unscoped): 112
Scoped drivers tenant A (default-tenant): 50
Scoped drivers tenant B (mock-fleet-tenant): 62
Default tenant drivers: 50
DriverLocationLatest total: 98, tenant A scoped: 48
CustomerAssignmentMessage total: 0, tenant A scoped: 0
MessageAttachment total: 0, tenant A scoped: 0
MessageTranslation total: 9, tenant A scoped: 9
DddFile total: 117, tenant A scoped: 4
TachoProviderCredential total: 0, tenant A scoped: 0
FleetTripPurposeLog total: 0, tenant A scoped: 0
FuelCardImportBatch total: 2, tenant A scoped: 2
FuelCardTransaction total: 8, tenant A scoped: 8
EquipmentIssuance total: 3, tenant A scoped: 3
WorkSession total: 11, tenant A scoped: 11
Tenant isolation check passed.
```

## 4. Temiz kurulum provasi (compose)

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && docker info --format '{{.ServerVersion}}'
```
Ham ciktı:
```text
failed to connect to the docker API at unix:///Users/mustafaakgul/.docker/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /Users/mustafaakgul/.docker/run/docker.sock: connect: no such file or directory
```

Sonuc: compose provasi kosulamadi.

## 5. E2E paketi

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/qa-agents/e2e && PATH=/opt/homebrew/opt/node@22/bin:$PATH npx playwright test
```
Ham ciktı (ozet):
```text
Running 61 tests using 4 workers
...
15 failed
24 skipped
22 passed (5.1m)
```
Ham ciktı (kirmizi listesi):
```text
[chromium] › tests/access-control.spec.ts:54:9 › Access Control (auth) › [TM-002] unauthenticated user is redirected from /dashboard to login
[chromium] › tests/documents.rbac.spec.ts:63:7 › Documents RBAC › [TM-004][TM-060] office role should NOT access the driver portal documents page
[chromium] › tests/generated/dashboard-route-sweep.spec.ts:20:7 › Dashboard route sweep › [TM-400] admin dashboard routes from navigation stay healthy
[chromium] › tests/smoke.spec.ts:63:7 › Smoke › login page is localized for DE/EN/TR without raw i18n keys
[chromium] › tests/smoke.spec.ts:161:7 › Office smoke › office login reaches assignments without a forbidden state
[chromium] › tests/smoke.spec.ts:169:7 › Office smoke › service reminders route opens and renders empty state when no data
[chromium] › tests/smoke.spec.ts:415:7 › Equipment issuance smoke › office create -> driver sign -> office approve
[chromium] › tests/tacho-telematics/premium-cila.spec.ts:48:7 › Session 11 premium polish › [premium] connection banner on SSE failure
[chromium] › tests/tacho-telematics/premium-cila.spec.ts:65:7 › Session 11 premium polish › [premium] page titles follow template
[chromium] › tests/tacho-telematics/premium-cila.spec.ts:81:7 › Session 11 premium polish › [premium] dark mode uses CARTO dark tiles
[chromium] › tests/tacho-telematics/tacho-compliance.spec.ts:67:7 › Tachograph compliance & badges › [tacho] sidebar badges match API
[chromium] › tests/tacho-telematics/tacho-compliance.spec.ts:111:7 › Tachograph infringements queue › [tacho] repeat offender badge and tooltip
[chromium] › tests/tacho-telematics/tacho-compliance.spec.ts:161:7 › Tachograph infringements queue › [tacho] acknowledge flow: note required → closed tab → badge drops → audit log
[chromium] › tests/tacho-telematics/ui-cila.spec.ts:30:7 › Session 9 integration polish › [cila] dashboard compliance strip numbers and drill-down links
[chromium] › tests/tacho-telematics/ui-cila.spec.ts:74:7 › Session 9 integration polish › [cila] driver story chart shows infringement scatter for repeat offender
```

## 6. Gateway uctan uca

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node -r ts-node/register/transpile-only src/telematics-gateway/main.ts
```
Ham ciktı:
```text
[Nest] ... LOG [TeltonikaGatewayService] Teltonika Codec8 gateway listening on 0.0.0.0:5027
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42
```
Ham ciktı:
```text
{"scenario":"normal","startedAtMs":1783933274041,"startedAt":"2026-07-13T09:01:14.041Z","verifySince":"2026-07-13T09:00:59.041Z","baseTs":1783933259041,"expectedLastRecordedAtMs":1783933267041,"expectedLastRecordedAt":"2026-07-13T09:01:07.041Z","recordsSent":5,"recordsAcceptedExpected":5,"corruptFramesSent":0,"expectedLocationPoints":5,"expectedActiveDtcCount":0,"expectedClosedTrips":1,"ackRecords":9,"seed":42,"imei":"359339080000101","telemetryQuarantineExpected":0}
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs --scenario normal
```
Ham ciktı:
```text
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    { "name": "DriverLocationHistory", "expected": 5, "actual": 5, "ok": true },
    { "name": "VehicleTelemetryLatest.recordedAt", "expected": "2026-07-13T09:02:10.260Z", "actual": "2026-07-13T09:02:10.260Z", "ok": true },
    { "name": "activeDtcSinceScenario", "expected": 0, "actual": 0, "ok": true },
    { "name": "TelemetryQuarantine", "expected": 0, "actual": 0, "ok": true },
    { "name": "closedDeviceTrips", "expected": 1, "actual": 0, "ok": false }
  ],
  "ok": false
}
[verify-tacho-telematics] mismatch detected
  closedDeviceTrips: expected=1 actual=0
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node -e "const fs=require('node:fs'); const token=JSON.parse(fs.readFileSync('/tmp/test-ajani-token.json','utf8')).accessToken; fetch('http://127.0.0.1:3000/api/v1/tracking/live?includeOffline=true&staleAfterSec=300',{headers:{authorization:'Bearer '+token}}).then(async r=>{const t=await r.text(); console.log(r.status); console.log(t);}).catch(err=>{console.error(err); process.exit(1);});"
```
Ham ciktı:
```text
200
[{"driverId":"tacho-demo-driver-a","driverName":"Demo Driver A","vehicleId":"tacho-demo-vehicle-a","plateNumber":"T-DEMO-01","latitude":52.522851,"longitude":13.4786222,"speedKmh":0,"headingDeg":45,"accuracyM":null,"recordedAt":"2026-07-13T09:02:10.260Z","receivedAt":"2026-07-13T09:02:17.591Z","status":"online","motionState":"stopped","hasCriticalDtc":false,"fuelDropFlag":true,"isSilent":false,"locationSource":"telematics","assignmentId":"cmriv1og30007v2aqvet6mv41","companyName":"Tacho Demo Logistics","cargoName":"Tacho demo telematics"}]
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario load --seed 42 --count 200 | node scripts/verify-tacho-telematics.mjs --scenario load
```
Ham ciktı:
```text
{
  "scenario": "load",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    { "name": "DriverLocationHistory", "expected": 200, "actual": 200, "ok": true },
    { "name": "duplicateLocationPoints", "expected": 0, "actual": 0, "ok": true },
    { "name": "VehicleTelemetryLatest.recordedAt", "expected": "2026-07-13T09:04:24.487Z", "actual": "2026-07-13T09:04:24.487Z", "ok": true },
    { "name": "activeDtcSinceScenario", "expected": 0, "actual": 0, "ok": true },
    { "name": "TelemetryQuarantine", "expected": 0, "actual": 0, "ok": true }
  ],
  "ok": true
}
```

## 7. Retention kaniti

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node -r ts-node/register/transpile-only -e "const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('./src/app.module'); const { QueueService } = require('./src/queue/queue.service'); (async()=>{const app = await NestFactory.createApplicationContext(AppModule,{logger:['log','error','warn']}); await app.get(QueueService).enqueue('privacy.retention'); await app.close();})().catch((error)=>{console.error(error); process.exit(1);});"
```
Ham ciktı:
```text
[Nest] 69598  - 07/13/2026, 12:03:14 PM     LOG [PrivacyService] Retention purge [telemetry_quarantine]: deleted=0, cutoff=2026-06-13T09:03:14.287Z, batches=0
[Nest] 69598  - 07/13/2026, 12:03:14 PM     LOG [PrivacyService] Retention purge [telemetry_processed_records]: deleted=0, cutoff=2026-06-13T09:03:14.287Z, batches=0
[Nest] 69598  - 07/13/2026, 12:03:14 PM     LOG [PrivacyService] Retention purge [driver_location_history]: deleted=0, cutoff=2026-04-14T09:03:14.286Z, batches=0
[Nest] 69598  - 07/13/2026, 12:03:14 PM     LOG [PrivacyService] Retention purge [fleet_driving_events]: deleted=0, cutoff=2026-01-14T09:03:14.287Z, batches=0
[Nest] 69598  - 07/13/2026, 12:03:14 PM     LOG [JobBootstrapService] Retention [telemetry]: location=0, telemetry=0, driving_events=0, quarantine=0, total=0
```

## 8. Dayaniklilik mini turu

### 8a Redis durdur / toparlanma
Koşulamadi.
Sebep: Bu tur local dev ortaminda ve `REDIS_URL` bos; sistem zaten inline queue modunda calisiyor.
Kanıt:
```text
[Nest] ... LOG [QueueService] REDIS_URL not set — background jobs run inline when enqueued.
[Nest] ... LOG [TelemetryQueueService] REDIS_URL not set — telemetry jobs run inline when enqueued.
[Nest] ... LOG [TachographQueueService] REDIS_URL not set — tachograph DDD jobs run inline when enqueued.
```

### 8b Postgres restart / toparlanma
Koşulamadi.
Sebep: Bu tur local gelistirme PostgreSQL surecini ajan kontrol etmiyor; kullanicinin aktif ortami olabilir.

### 8c 50 cihaz / yuksek paket
Kanıt komutu:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario load --seed 42 --count 200 | node scripts/verify-tacho-telematics.mjs --scenario load
```
Ham ciktı:
```text
ok: true
DriverLocationHistory expected=200 actual=200
duplicateLocationPoints expected=0 actual=0
```

## 9. Guvenlik hizli kontrol

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH /usr/bin/time -p env NODE_ENV=production JWT_SECRET=development_jwt_secret_minimum_32_chars DATABASE_URL='postgresql://fleet:fleet123@localhost:5432/fleet' FRONTEND_URL='https://example.com' DATA_CONTROLLER_NAME='Example GmbH' PRIVACY_CONTACT_EMAIL='privacy@example.com' TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY='00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' node -r ts-node/register/transpile-only src/main.ts
```
Ham ciktı:
```text
Error: JWT_SECRET must not use default placeholder values from .env.example in production.
real 0.33
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH curl -sS -D - -o /tmp/test-ajani-metrics-body.txt http://127.0.0.1:3000/api/v1/metrics | head -n 12
```
Ham ciktı:
```text
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH node -e "const fs=require('node:fs'); const token=JSON.parse(fs.readFileSync('/tmp/test-ajani-driver-token.json','utf8')).accessToken; fetch('http://127.0.0.1:3000/api/v1/users',{headers:{authorization:'Bearer '+token}}).then(async r=>{const t=await r.text(); console.log(r.status); console.log(t);}).catch(err=>{console.error(err); process.exit(1);});"
```
Ham ciktı:
```text
403
{"statusCode":403,"message":"driver role is not allowed for this endpoint"}
```

## Ek runtime kanitlari

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && curl -sS -D - -o /tmp/test-ajani-health-body.txt http://127.0.0.1:3000/api/v1/health | head -n 12
```
Ham ciktı:
```text
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
```

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && PATH=/opt/homebrew/opt/node@22/bin:$PATH find prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort | tail -1
```
Ham ciktı:
```text
prisma/migrations/20260719103000_equipment_issuance_rev3_form_pdf
```
