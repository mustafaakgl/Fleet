# TEST-AJANI-DUZELTME Kanitlari

Tarih: 2026-07-13

$ docker info --format "{{.ServerVersion}}"
29.6.1

$ docker compose down -v --remove-orphans
 Container fleet_frontend Stopping 
 Container fleet-gateway-1 Stopping 
 Container fleet-gateway-1 Stopped 
 Container fleet-gateway-1 Removing 
 Container fleet-gateway-1 Removed 
 Container fleet_frontend Stopped 
 Container fleet_frontend Removing 
 Container fleet_frontend Removed 
 Container fleet_backend Stopping 
 Container fleet_backend Stopped 
 Container fleet_backend Removing 
 Container fleet_backend Removed 
 Container fleet_postgres Stopping 
 Container fleet_redis Stopping 
 Container fleet_redis Stopped 
 Container fleet_redis Removing 
 Container fleet_redis Removed 
 Container fleet_postgres Stopped 
 Container fleet_postgres Removing 
 Container fleet_postgres Removed 
 Volume fleet_postgres_data Removing 
 Volume fleet_backend_uploads Removing 
 Volume fleet_redis_data Removing 
 Network fleet_default Removing 
 Volume fleet_postgres_data Removed 
 Volume fleet_backend_uploads Removed 
 Volume fleet_redis_data Removed 
 Network fleet_default Removed 

$ METRICS_TOKEN=test-metrics-token docker compose up -d --build
 Image fleet-backend Building 
 Image fleet-frontend Building 
#1 [internal] load local bake definitions
#1 reading from stdin 1.08kB done
#1 DONE 0.0s

#2 [frontend internal] load build definition from Dockerfile
#2 transferring dockerfile: 523B 0.0s done
#2 DONE 0.1s

#3 [backend internal] load build definition from Dockerfile
#3 transferring dockerfile: 684B 0.0s done
#3 DONE 0.1s

#4 [frontend internal] load metadata for docker.io/library/node:22-alpine
#4 ...

#5 [auth] library/node:pull token for registry-1.docker.io
#5 DONE 0.0s

#4 [frontend internal] load metadata for docker.io/library/node:22-alpine
#4 DONE 7.0s

#6 [frontend internal] load .dockerignore
#6 transferring context: 106B done
#6 DONE 0.0s

#7 [backend internal] load .dockerignore
#7 transferring context: 174B 0.0s done
#7 DONE 0.0s

#8 [backend builder 1/6] FROM docker.io/library/node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
#8 DONE 0.0s

#9 [frontend internal] load build context
#9 ...

#10 [backend internal] load build context
#10 transferring context: 2.42MB 0.3s done
#10 DONE 0.3s

#9 [frontend internal] load build context
#9 ...

#11 [frontend builder 2/6] WORKDIR /app
#11 CACHED

#12 [backend builder 3/8] COPY package*.json ./
#12 DONE 0.1s

#9 [frontend internal] load build context
#9 ...

#13 [backend builder 4/8] COPY prisma ./prisma
#13 DONE 0.1s

#9 [frontend internal] load build context
#9 transferring context: 538.49MB 5.3s
#9 transferring context: 852.83MB 10.4s
#9 ...

#14 [backend builder 5/8] RUN npm ci
#14 2.469 npm warn deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported
#14 3.846 npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
#14 3.994 npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
#14 7.353 npm warn deprecated @otplib/preset-default@12.0.1: Please upgrade to v13 of otplib. Refer to otplib docs for migration paths
#14 7.888 npm warn deprecated @otplib/plugin-thirty-two@12.0.1: Please upgrade to v13 of otplib. Refer to otplib docs for migration paths
#14 7.889 npm warn deprecated @otplib/plugin-crypto@12.0.1: Please upgrade to v13 of otplib. Refer to otplib docs for migration paths
#14 ...

#9 [frontend internal] load build context
#9 transferring context: 913.19MB 13.8s done
#9 DONE 13.9s

#15 [frontend builder 3/6] COPY package*.json ./
#15 DONE 1.9s

#14 [backend builder 5/8] RUN npm ci
#14 ...

#16 [frontend builder 4/6] RUN npm ci
#16 1.657 npm warn deprecated uuid@9.0.1: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).
#16 4.612 npm warn deprecated recharts@2.15.4: 1.x and 2.x branches are no longer active. Bump to Recharts v3 to receive latest features and bugfixes. See https://github.com/recharts/recharts/wiki/3.0-migration-guide
#16 6.917 npm warn deprecated glob@9.3.5: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
#16 ...

#14 [backend builder 5/8] RUN npm ci
#14 41.87 
#14 41.87 > fleet-backend@0.1.0 postinstall
#14 41.87 > prisma generate
#14 41.87 
#14 42.37 warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
#14 42.37 For more information, see: https://pris.ly/prisma-config
#14 42.37 
#14 42.53 Prisma schema loaded from prisma/schema.prisma
#14 43.80 ┌─────────────────────────────────────────────────────────┐
#14 43.80 │  Update available 6.19.3 -> 7.8.0                       │
#14 43.80 │                                                         │
#14 43.80 │  This is a major update - please follow the guide at    │
#14 43.80 │  https://pris.ly/d/major-version-upgrade                │
#14 43.80 │                                                         │
#14 43.80 │  Run the following to update                            │
#14 43.80 │    npm i --save-dev prisma@latest                       │
#14 43.80 │    npm i @prisma/client@latest                          │
#14 43.80 └─────────────────────────────────────────────────────────┘
#14 43.80 
#14 43.80 ✔ Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 654ms
#14 43.80 
#14 43.80 Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
#14 43.80 
#14 43.80 Tip: Interested in query caching in just a few lines of code? Try Accelerate today! https://pris.ly/tip-3-accelerate
#14 43.80 
#14 43.85 
#14 43.85 added 422 packages, and audited 423 packages in 43s
#14 43.85 
#14 43.85 78 packages are looking for funding
#14 43.85   run `npm fund` for details
#14 43.87 
#14 43.87 8 vulnerabilities (5 moderate, 3 high)
#14 43.87 
#14 43.87 To address issues that do not require attention, run:
#14 43.87   npm audit fix
#14 43.87 
#14 43.87 To address all issues (including breaking changes), run:
#14 43.87   npm audit fix --force
#14 43.87 
#14 43.87 Run `npm audit` for details.
#14 43.88 npm notice
#14 43.88 npm notice New major version of npm available! 10.9.8 -> 12.0.1
#14 43.88 npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.1
#14 43.88 npm notice To update run: npm install -g npm@12.0.1
#14 43.88 npm notice
#14 DONE 48.7s

#16 [frontend builder 4/6] RUN npm ci
#16 ...

#17 [backend builder 6/8] COPY tsconfig.json ./
#17 DONE 0.2s

#16 [frontend builder 4/6] RUN npm ci
#16 ...

#18 [backend builder 7/8] COPY src ./src
#18 DONE 0.2s

#16 [frontend builder 4/6] RUN npm ci
#16 ...

#19 [backend builder 8/8] RUN npx prisma generate && npm run build
#19 0.937 warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
#19 0.937 For more information, see: https://pris.ly/prisma-config
#19 0.937 
#19 1.136 Prisma schema loaded from prisma/schema.prisma
#19 3.671 
#19 3.671 ✔ Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 2.21s
#19 3.671 
#19 3.671 Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
#19 3.671 
#19 3.671 Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
#19 3.671 
#19 3.865 
#19 3.865 > fleet-backend@0.1.0 build
#19 3.865 > tsc -p tsconfig.json
#19 3.865 
#19 ...

#16 [frontend builder 4/6] RUN npm ci
#16 40.88 
#16 40.88 added 718 packages, and audited 719 packages in 41s
#16 40.88 
#16 40.88 169 packages are looking for funding
#16 40.88   run `npm fund` for details
#16 40.95 
#16 40.95 25 vulnerabilities (23 moderate, 2 high)
#16 40.95 
#16 40.95 To address issues that do not require attention, run:
#16 40.95   npm audit fix
#16 40.95 
#16 40.95 To address all issues possible (including breaking changes), run:
#16 40.95   npm audit fix --force
#16 40.95 
#16 40.95 Some issues need review, and may require choosing
#16 40.95 a different dependency.
#16 40.95 
#16 40.95 Run `npm audit` for details.
#16 40.95 npm notice
#16 40.95 npm notice New major version of npm available! 10.9.8 -> 12.0.1
#16 40.95 npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.1
#16 40.95 npm notice To update run: npm install -g npm@12.0.1
#16 40.95 npm notice
#16 DONE 43.7s

#19 [backend builder 8/8] RUN npx prisma generate && npm run build
#19 ...

#20 [frontend builder 5/6] COPY . .
#20 ...

#19 [backend builder 8/8] RUN npx prisma generate && npm run build
#19 DONE 15.8s

#20 [frontend builder 5/6] COPY . .
#20 DONE 40.5s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#22 [backend runner 3/9] COPY --from=builder /app/package*.json ./
#22 DONE 0.2s

#21 [frontend builder 6/6] RUN npm run build
#21 0.624 
#21 0.624 > frontend@0.1.0 build
#21 0.624 > next build
#21 0.624 
#21 8.958 Attention: Next.js now collects completely anonymous telemetry regarding usage.
#21 8.958 This information is used to shape Next.js' roadmap and prioritize features.
#21 8.958 You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
#21 8.958 https://nextjs.org/telemetry
#21 8.958 
#21 9.399    ▲ Next.js 15.5.18
#21 9.399    - Experiments (use with caution):
#21 9.399      ⨯ devtoolSegmentExplorer
#21 9.399 
#21 9.559    Creating an optimized production build ...
#21 ...

#23 [backend runner 4/9] COPY --from=builder /app/node_modules ./node_modules
#23 DONE 24.1s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#24 [backend runner 5/9] COPY --from=builder /app/prisma ./prisma
#24 DONE 0.5s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#25 [backend runner 6/9] COPY --from=builder /app/dist ./dist
#25 DONE 1.3s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#26 [backend runner 7/9] COPY --from=builder /app/src ./src
#26 DONE 0.5s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#27 [backend runner 8/9] COPY --from=builder /app/tsconfig.json ./tsconfig.json
#27 DONE 0.0s

#28 [backend runner 9/9] RUN mkdir -p /app/uploads/documents
#28 DONE 1.6s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#29 [backend] exporting to image
#29 exporting layers
#29 exporting layers 4.0s done
#29 writing image sha256:bc34e8eadcca24ccd38c13b0f65892575d0b0e585d17b25d3d7a0a13cd458825 0.0s done
#29 naming to docker.io/library/fleet-backend 0.0s done
#29 DONE 4.1s

#21 [frontend builder 6/6] RUN npm run build
#21 ...

#30 [backend] resolving provenance for metadata file
#30 DONE 0.5s

#21 [frontend builder 6/6] RUN npm run build
#21 269.0  ✓ Compiled successfully in 3.9min
#21 269.1    Linting and checking validity of types ...
#21 289.3 
#21 289.3 ./app/(dashboard)/fleet-analytics/trips/page.tsx
#21 289.3 758:36  Warning: 'index' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 
#21 289.3 ./app/(dashboard)/tachograph/ddd-archive/page.tsx
#21 289.3 179:9  Warning: The 'files' logical expression could make the dependencies of useMemo Hook (at line 196) change on every render. To fix this, wrap the initialization of 'files' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./app/(dashboard)/tachograph/infringements/page.tsx
#21 289.3 360:9  Warning: The 'allItems' logical expression could make the dependencies of useMemo Hook (at line 366) change on every render. To fix this, wrap the initialization of 'allItems' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 360:9  Warning: The 'allItems' logical expression could make the dependencies of useMemo Hook (at line 371) change on every render. To fix this, wrap the initialization of 'allItems' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 360:9  Warning: The 'allItems' logical expression could make the dependencies of useMemo Hook (at line 375) change on every render. To fix this, wrap the initialization of 'allItems' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./app/(dashboard)/telematics/driver-scores/page.tsx
#21 289.3 185:9  Warning: The 'items' logical expression could make the dependencies of useMemo Hook (at line 204) change on every render. To fix this, wrap the initialization of 'items' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 186:9  Warning: The 'fleetTrend' logical expression could make the dependencies of useMemo Hook (at line 198) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'fleetTrend' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./app/(dashboard)/telematics/vehicle-health/page.tsx
#21 289.3 34:3  Warning: 'FLEET_TABLE_CELL_MUTED' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 272:9  Warning: The 'items' logical expression could make the dependencies of useMemo Hook (at line 286) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'items' in its own useMemo() Hook.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./app/(dashboard)/vehicles/page.tsx
#21 289.3 88:6  Warning: React Hook useCallback has a missing dependency: 't'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./app/(driver-portal)/driver/equipment-issuance/page.tsx
#21 289.3 66:6  Warning: React Hook useEffect has a missing dependency: 'selected'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./components/connection/ConnectionBannerProvider.tsx
#21 289.3 95:6  Warning: React Hook useEffect has a missing dependency: 'lastUpdatedAt'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./components/live-tracking/LiveTrackingDetail.tsx
#21 289.3 8:10  Warning: 'coolantTempClass' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 
#21 289.3 ./components/loading/page-skeletons.tsx
#21 289.3 5:15  Warning: 'HTMLAttributes' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 
#21 289.3 ./components/messenger/MessengerChatPanel.tsx
#21 289.3 3:63  Warning: 'RotateCcw' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 179:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
#21 289.3 284:6  Warning: React Hook useEffect has a missing dependency: 'loadingOlder'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./components/messenger/MessengerPage.tsx
#21 289.3 387:6  Warning: React Hook useCallback has a missing dependency: 'userLanguage'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 504:6  Warning: React Hook useCallback has a missing dependency: 'sortMessages'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./components/providers/DriverPortalRoute.tsx
#21 289.3 37:6  Warning: React Hook useEffect has a missing dependency: 'redirectTo'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
#21 289.3 
#21 289.3 ./lib/api.ts
#21 289.3 1940:5  Warning: '_params' is defined but never used.  @typescript-eslint/no-unused-vars
#21 289.3 
#21 289.3 info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/app/api-reference/config/eslint#disabling-rules
#21 304.3    Collecting page data ...
#21 312.3    Generating static pages (0/104) ...
#21 313.2    Generating static pages (26/104) 
#21 313.4    Generating static pages (52/104) 
#21 313.5    Generating static pages (78/104) 
#21 313.6  ✓ Generating static pages (104/104)
#21 315.0    Finalizing page optimization ...
#21 315.0    Collecting build traces ...
$ METRICS_TOKEN=test-metrics-token docker compose down --remove-orphans && METRICS_TOKEN=test-metrics-token docker compose up -d && METRICS_TOKEN=test-metrics-token docker compose ps
 Network fleet_default Removing 
 Network fleet_default Error Error response from daemon: error while removing network: error marking network fleet_default (62eb807bf96e3ebf36a7fee9ba48b7cca2d98d03ae90f18ee8790e7908e33121) for deletion: failed to update store for object type *libnetwork.Network: write /var/lib/docker/network/files/local-kv.db: input/output error
failed to remove network fleet_default: Error response from daemon: error while removing network: error marking network fleet_default (62eb807bf96e3ebf36a7fee9ba48b7cca2d98d03ae90f18ee8790e7908e33121) for deletion: failed to update store for object type *libnetwork.Network: write /var/lib/docker/network/files/local-kv.db: input/output error

$ osascript -e 'quit app "Docker"'
$ open -a Docker
$ docker info --format "{{.ServerVersion}}"
request returned 500 Internal Server Error for API route and version http://%2FUsers%2Fmustafaakgul%2F.docker%2Frun%2Fdocker.sock/v1.55/info, check if the server supports the requested API version


$ BASE_URL=http://localhost:3001 npx playwright test tests/documents.rbac.spec.ts --project=chromium --no-deps

Running 6 tests using 1 worker

  ✓  1 [chromium] › tests/documents.rbac.spec.ts:39:7 › Documents RBAC › [TM-003][TM-060] driver role should NOT access the admin documents page (3.0s)
  ✓  2 [chromium] › tests/documents.rbac.spec.ts:63:7 › Documents RBAC › [TM-004][TM-060] office role should NOT access the driver portal documents page (3.4s)
  -  3 [chromium] › tests/documents.rbac.spec.ts:87:7 › Documents RBAC › [TM-050][TM-060] office role should NOT see private driver salary/medical documents
  -  4 [chromium] › tests/documents.rbac.spec.ts:101:7 › Documents RBAC › [TM-051][TM-060] direct-ID document access should be blocked when not authorized
  -  5 [chromium] › tests/documents.rbac.spec.ts:113:7 › Documents RBAC › [TM-051][TM-063] tenant_a user should NOT access a tenant_b document
  ✓  6 [chromium] › tests/documents.rbac.spec.ts:126:7 › Documents RBAC › driver portal documents route constant is correct (1ms)

  3 skipped
  3 passed (14.6s)

To open last HTML report run:
[36m[39m
[36m  npx playwright show-report[39m
[36m[39m

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs --scenario normal
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    {
      "name": "DriverLocationHistory",
      "expected": 5,
      "actual": 5,
      "ok": true
    },
    {
      "name": "VehicleTelemetryLatest.recordedAt",
      "expected": "2026-07-13T09:26:42.035Z",
      "actual": "2026-07-13T09:26:42.035Z",
      "ok": true
    },
    {
      "name": "activeDtcSinceScenario",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "TelemetryQuarantine",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "closedDeviceTrips",
      "expected": 1,
      "actual": 0,
      "ok": false
    }
  ],
  "ok": false
}
[verify-tacho-telematics] mismatch detected
  closedDeviceTrips: expected=1 actual=0

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs --scenario normal
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    {
      "name": "DriverLocationHistory",
      "expected": 5,
      "actual": 5,
      "ok": true
    },
    {
      "name": "VehicleTelemetryLatest.recordedAt",
      "expected": "2026-07-13T09:27:21.524Z",
      "actual": "2026-07-13T09:27:21.524Z",
      "ok": true
    },
    {
      "name": "activeDtcSinceScenario",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "TelemetryQuarantine",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "closedDeviceTrips",
      "expected": 1,
      "actual": 1,
      "ok": true
    }
  ],
  "ok": true
}

$ curl -s -o /tmp/metrics_no_token.txt -w "%{http_code}" http://127.0.0.1:3100/api/v1/metrics
401
$ curl -s -H "Authorization: Bearer test-metrics-token" -o /tmp/metrics_with_token.txt -w "%{http_code}" http://127.0.0.1:3100/api/v1/metrics
200
$ head -n 3 /tmp/metrics_no_token.txt
{"statusCode":401,"message":"Invalid metrics token","timestamp":"2026-07-13T09:28:33.206Z","error":"UnauthorizedException","details":{"message":"Invalid metrics token","error":"Unauthorized","statusCode":401},"stack":"UnauthorizedException: Invalid metrics token\n    at MetricsController.getMetrics (/Users/mustafaakgul/Projects/Fleet/backend/src/metrics/metrics.controller.ts:27:15)\n    at /Users/mustafaakgul/Projects/Fleet/backend/node_modules/@nestjs/core/router/router-execution-context.js:38:29\n    at processTicksAndRejections (node:internal/process/task_queues:103:5)"}$ head -n 3 /tmp/metrics_with_token.txt
# HELP fleet_process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE fleet_process_cpu_user_seconds_total counter
fleet_process_cpu_user_seconds_total 0.43337099999999995

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsc -p tsconfig.json --noEmit

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test

> fleet-backend@0.1.0 test
> node ../scripts/run-tests.mjs

[run-tests] discovered spec files=57
TAP version 13
# Subtest: equipment issuance state guards
    # Subtest: allows approve only for signed/manual_uploaded
    ok 1 - allows approve only for signed/manual_uploaded
      ---
      duration_ms: 1.0935
      type: 'test'
      ...
    # Subtest: blocks sign when not pending_signature
    ok 2 - blocks sign when not pending_signature
      ---
      duration_ms: 0.558833
      type: 'test'
      ...
    # Subtest: blocks mutation when approved or cancelled
    ok 3 - blocks mutation when approved or cancelled
      ---
      duration_ms: 0.341709
      type: 'test'
      ...
    # Subtest: enforces approvable states
    ok 4 - enforces approvable states
      ---
      duration_ms: 0.155833
      type: 'test'
      ...
    1..4
ok 1 - equipment issuance state guards
  ---
  duration_ms: 3.611541
  type: 'suite'
  ...
# Subtest: EquipmentIssuancesService
    # Subtest: notifies the driver when an issuance is created
    ok 1 - notifies the driver when an issuance is created
      ---
      duration_ms: 2.534625
      type: 'test'
      ...
    # Subtest: blocks a driver from reading another driver's issuance
    ok 2 - blocks a driver from reading another driver's issuance
      ---
      duration_ms: 0.448958
      type: 'test'
      ...
    # Subtest: requires a form PDF when creating an issuance
    ok 3 - requires a form PDF when creating an issuance
      ---
      duration_ms: 0.267083
      type: 'test'
      ...
    1..3
ok 2 - EquipmentIssuancesService
  ---
  duration_ms: 4.332666
  type: 'suite'
  ...
# Subtest: toWinAnsiSafeText
    # Subtest: maps Turkish-specific letters to WinAnsi equivalents
    ok 1 - maps Turkish-specific letters to WinAnsi equivalents
      ---
      duration_ms: 0.552375
      type: 'test'
      ...
    # Subtest: keeps German umlauts and cp1252 extras untouched
    ok 2 - keeps German umlauts and cp1252 extras untouched
      ---
      duration_ms: 0.094875
      type: 'test'
      ...
    # Subtest: replaces characters outside WinAnsi with a question mark
    ok 3 - replaces characters outside WinAnsi with a question mark
      ---
      duration_ms: 0.05525
      type: 'test'
      ...
    # Subtest: keeps plain ASCII unchanged
    ok 4 - keeps plain ASCII unchanged
      ---
      duration_ms: 0.157375
      type: 'test'
      ...
    1..4
ok 3 - toWinAnsiSafeText
  ---
  duration_ms: 1.520583
  type: 'suite'
  ...
# Subtest: fleet-driving-events.util
    # Subtest: detects a speeding episode lasting at least 10 seconds
    ok 1 - detects a speeding episode lasting at least 10 seconds
      ---
      duration_ms: 1.104625
      type: 'test'
      ...
    # Subtest: detects harsh acceleration and harsh braking
    ok 2 - detects harsh acceleration and harsh braking
      ---
      duration_ms: 0.276625
      type: 'test'
      ...
    1..2
ok 4 - fleet-driving-events.util
  ---
  duration_ms: 2.382291
  type: 'suite'
  ...
# Subtest: fleet-driver-score.util
    # Subtest: computes a trip score with penalties normalized per 100 km
    ok 1 - computes a trip score with penalties normalized per 100 km
      ---
      duration_ms: 0.480667
      type: 'test'
      ...
    # Subtest: aggregates driver score across multiple trips
    ok 2 - aggregates driver score across multiple trips
      ---
      duration_ms: 0.14875
      type: 'test'
      ...
    1..2
ok 5 - fleet-driver-score.util
  ---
  duration_ms: 0.7375
  type: 'suite'
  ...
# Subtest: fleet-fuel-consumption.util
    # Subtest: computes lt/100km between two full tank entries using odometer distance
    ok 1 - computes lt/100km between two full tank entries using odometer distance
      ---
      duration_ms: 1.695167
      type: 'test'
      ...
    # Subtest: falls back to GPS trip distance when odometer is missing
    ok 2 - falls back to GPS trip distance when odometer is missing
      ---
      duration_ms: 0.169583
      type: 'test'
      ...
    # Subtest: computes a weighted average across intervals
    ok 3 - computes a weighted average across intervals
      ---
      duration_ms: 0.153875
      type: 'test'
      ...
    1..3
ok 6 - fleet-fuel-consumption.util
  ---
  duration_ms: 2.829417
  type: 'suite'
  ...
# Subtest: fleet-fuel-estimation.util
    # Subtest: applies behavior factor from events per 100 km and idle ratio
    ok 1 - applies behavior factor from events per 100 km and idle ratio
      ---
      duration_ms: 1.059708
      type: 'test'
      ...
    # Subtest: estimates trip liters from distance and average consumption
    ok 2 - estimates trip liters from distance and average consumption
      ---
      duration_ms: 0.175708
      type: 'test'
      ...
    # Subtest: aggregates estimated liters across trips
    ok 3 - aggregates estimated liters across trips
      ---
      duration_ms: 0.319875
      type: 'test'
      ...
    1..3
ok 7 - fleet-fuel-estimation.util
  ---
  duration_ms: 3.06825
  type: 'suite'
  ...
# Subtest: fleet-fuel-analytics.util
    # Subtest: builds weekly trend buckets for estimated and real consumption
    ok 1 - builds weekly trend buckets for estimated and real consumption
      ---
      duration_ms: 2.696833
      type: 'test'
      ...
    # Subtest: builds driver breakdown from trips and fuel entries
    ok 2 - builds driver breakdown from trips and fuel entries
      ---
      duration_ms: 0.590416
      type: 'test'
      ...
    1..2
ok 8 - fleet-fuel-analytics.util
  ---
  duration_ms: 3.49775
  type: 'suite'
  ...
# Subtest: fleet-maintenance.util
    # Subtest: computes remaining km until the next interval
    ok 1 - computes remaining km until the next interval
      ---
      duration_ms: 0.545292
      type: 'test'
      ...
    # Subtest: marks km-based maintenance as overdue
    ok 2 - marks km-based maintenance as overdue
      ---
      duration_ms: 0.076167
      type: 'test'
      ...
    # Subtest: computes remaining days for time-based rules
    ok 3 - computes remaining days for time-based rules
      ---
      duration_ms: 2.312375
      type: 'test'
      ...
    1..3
ok 9 - fleet-maintenance.util
  ---
  duration_ms: 3.601792
  type: 'suite'
  ...
# Subtest: fleet-odometer.util
    # Subtest: uses the latest correction as baseline and adds GPS km after it
    ok 1 - uses the latest correction as baseline and adds GPS km after it
      ---
      duration_ms: 0.567041
      type: 'test'
      ...
    # Subtest: falls back to initial odometer when no correction exists
    ok 2 - falls back to initial odometer when no correction exists
      ---
      duration_ms: 0.077167
      type: 'test'
      ...
    1..2
ok 10 - fleet-odometer.util
  ---
  duration_ms: 1.470375
  type: 'suite'
  ...
# Subtest: fleet-trip-gap.util
    # Subtest: returns null when there are fewer than two points
    ok 1 - returns null when there are fewer than two points
      ---
      duration_ms: 0.680292
      type: 'test'
      ...
    # Subtest: returns the largest gap window
    ok 2 - returns the largest gap window
      ---
      duration_ms: 1.233625
      type: 'test'
      ...
    1..2
ok 11 - fleet-trip-gap.util
  ---
  duration_ms: 3.219875
  type: 'suite'
  ...
# Subtest: fleet-trip-locations.util
    # Subtest: parses valid recordedAt timestamps
    ok 1 - parses valid recordedAt timestamps
      ---
      duration_ms: 1.625833
      type: 'test'
      ...
    # Subtest: rejects timestamps too far in the future
    ok 2 - rejects timestamps too far in the future
      ---
      duration_ms: 0.415917
      type: 'test'
      ...
    # Subtest: normalizes location points with optional telemetry fields
    ok 3 - normalizes location points with optional telemetry fields
      ---
      duration_ms: 0.49
      type: 'test'
      ...
    # Subtest: deduplicates points by trip identity key
    ok 4 - deduplicates points by trip identity key
      ---
      duration_ms: 0.112
      type: 'test'
      ...
    1..4
ok 12 - fleet-trip-locations.util
  ---
  duration_ms: 3.421375
  type: 'suite'
  ...
# Subtest: fleet-trip-odometer.util
    # Subtest: returns null when one of the snapshots is missing
    ok 1 - returns null when one of the snapshots is missing
      ---
      duration_ms: 3.170875
      type: 'test'
      ...
    # Subtest: returns null when snapshots are inverted
    ok 2 - returns null when snapshots are inverted
      ---
      duration_ms: 0.163167
      type: 'test'
      ...
    # Subtest: returns a rounded odometer range when both snapshots are present
    ok 3 - returns a rounded odometer range when both snapshots are present
      ---
      duration_ms: 0.150709
      type: 'test'
      ...
    1..3
ok 13 - fleet-trip-odometer.util
  ---
  duration_ms: 4.497709
  type: 'suite'
  ...
# Subtest: fleet-trip-processing.util
    # Subtest: filters inaccurate GPS points before processing
    ok 1 - filters inaccurate GPS points before processing
      ---
      duration_ms: 1.139042
      type: 'test'
      ...
    # Subtest: sums haversine distance for realistic movement
    ok 2 - sums haversine distance for realistic movement
      ---
      duration_ms: 0.447375
      type: 'test'
      ...
    # Subtest: skips impossible GPS jumps when computing distance
    ok 3 - skips impossible GPS jumps when computing distance
      ---
      duration_ms: 0.26225
      type: 'test'
      ...
    # Subtest: accumulates idle time when speed stays below threshold
    ok 4 - accumulates idle time when speed stays below threshold
      ---
      duration_ms: 0.252417
      type: 'test'
      ...
    # Subtest: marks data gaps between accepted points
    ok 5 - marks data gaps between accepted points
      ---
      duration_ms: 0.096625
      type: 'test'
      ...
    1..5
ok 14 - fleet-trip-processing.util
  ---
  duration_ms: 3.692417
  type: 'suite'
  ...
# Subtest: fleet-trip-stops.util
    # Subtest: does not create a stop below the 5 minute threshold
    ok 1 - does not create a stop below the 5 minute threshold
      ---
      duration_ms: 1.228667
      type: 'test'
      ...
    # Subtest: creates a stop at exactly five minutes
    ok 2 - creates a stop at exactly five minutes
      ---
      duration_ms: 1.159667
      type: 'test'
      ...
    # Subtest: skips stops across a day boundary
    ok 3 - skips stops across a day boundary
      ---
      duration_ms: 0.138666
      type: 'test'
      ...
    1..3
ok 15 - fleet-trip-stops.util
  ---
  duration_ms: 3.814958
  type: 'suite'
  ...
# Subtest: trip-purpose-lock.util
    # Subtest: keeps the trip unlocked until the 7 day window passes
    ok 1 - keeps the trip unlocked until the 7 day window passes
      ---
      duration_ms: 1.538584
      type: 'test'
      ...
    1..1
ok 16 - trip-purpose-lock.util
  ---
  duration_ms: 3.010125
  type: 'suite'
  ...
# Subtest: messenger-attachments.util
    # Subtest: accepts up to 3 valid attachments
    ok 1 - accepts up to 3 valid attachments
      ---
      duration_ms: 0.691709
      type: 'test'
      ...
    # Subtest: rejects unsupported file types
    ok 2 - rejects unsupported file types
      ---
      duration_ms: 0.392125
      type: 'test'
      ...
    # Subtest: rejects more than maximum attachment count
    ok 3 - rejects more than maximum attachment count
      ---
      duration_ms: 0.185917
      type: 'test'
      ...
    # Subtest: sanitizes risky file names
    ok 4 - sanitizes risky file names
      ---
      duration_ms: 0.121917
      type: 'test'
      ...
    1..4
ok 17 - messenger-attachments.util
  ---
  duration_ms: 2.157
  type: 'suite'
  ...
# Subtest: messenger-departments.util
    # Subtest: normalizes unknown departments to general
    ok 1 - normalizes unknown departments to general
      ---
      duration_ms: 0.521875
      type: 'test'
      ...
    # Subtest: normalizes driver conversation audience aliases
    ok 2 - normalizes driver conversation audience aliases
      ---
      duration_ms: 0.080042
      type: 'test'
      ...
    # Subtest: scopes office users to allowed departments
    ok 3 - scopes office users to allowed departments
      ---
      duration_ms: 0.744459
      type: 'test'
      ...
    1..3
ok 18 - messenger-departments.util
  ---
  duration_ms: 2.584375
  type: 'suite'
  ...
# Subtest: messenger-export.util
    # Subtest: builds csv with escaped values
    ok 1 - builds csv with escaped values
      ---
      duration_ms: 0.183583
      type: 'test'
      ...
    1..1
ok 19 - messenger-export.util
  ---
  duration_ms: 0.238625
  type: 'suite'
  ...
# [32m[Nest] 86826  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[PrivacyService] [39m[32mRetention purge [driver_location_history]: deleted=1, cutoff=2026-04-14T09:30:08.498Z, batches=1[39m
# [32m[Nest] 86826  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[PrivacyService] [39m[32mRetention purge [driver_location_history]: deleted=1, cutoff=2026-04-14T09:30:08.505Z, batches=1[39m
# [32m[Nest] 86826  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[PrivacyService] [39m[32mRetention purge [telemetry_processed_records]: deleted=1, cutoff=2026-06-13T09:30:08.505Z, batches=1[39m
# [32m[Nest] 86826  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[PrivacyService] [39m[32mRetention purge [fleet_driving_events]: deleted=1, cutoff=2026-01-14T09:30:08.505Z, batches=1[39m
# [32m[Nest] 86826  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[PrivacyService] [39m[32mRetention purge [telemetry_quarantine]: deleted=1, cutoff=2026-06-13T09:30:08.505Z, batches=1[39m
# Subtest: PrivacyService retention
    # Subtest: keeps 89-day location rows and deletes 91-day rows
    ok 1 - keeps 89-day location rows and deletes 91-day rows
      ---
      duration_ms: 6.070292
      type: 'test'
      ...
    # Subtest: purges telemetry retention targets in batches and leaves fleet trips untouched
    ok 2 - purges telemetry retention targets in batches and leaves fleet trips untouched
      ---
      duration_ms: 1.465792
      type: 'test'
      ...
    1..2
ok 20 - PrivacyService retention
  ---
  duration_ms: 8.51925
  type: 'suite'
  ...
# Subtest: TelematicsAlarmService
    # Subtest: suppresses duplicate fuel theft notifications within the suppression window
    ok 1 - suppresses duplicate fuel theft notifications within the suppression window
      ---
      duration_ms: 0.980042
      type: 'test'
      ...
    1..1
ok 21 - TelematicsAlarmService
  ---
  duration_ms: 1.601
  type: 'suite'
  ...
# Subtest: telematics-thresholds
    # Subtest: exposes alarm suppression window and idle fuel constants
    ok 1 - exposes alarm suppression window and idle fuel constants
      ---
      duration_ms: 0.92675
      type: 'test'
      ...
    1..1
ok 22 - telematics-thresholds
  ---
  duration_ms: 2.117541
  type: 'suite'
  ...
# Subtest: TelemetryIngestService
    # Subtest: skips duplicate imei+timestamp+priority records
    ok 1 - skips duplicate imei+timestamp+priority records
      ---
      duration_ms: 1.127834
      type: 'test'
      ...
    # Subtest: does not overwrite VehicleTelemetryLatest with older recordedAt
    ok 2 - does not overwrite VehicleTelemetryLatest with older recordedAt
      ---
      duration_ms: 0.48
      type: 'test'
      ...
    1..2
ok 23 - TelemetryIngestService
  ---
  duration_ms: 2.26325
  type: 'suite'
  ...
# [32m[Nest] 86835  - [39m07/13/2026, 12:30:08 PM [32m    LOG[39m [38;5;3m[TelemetryQueueService] [39m[32mREDIS_URL not set — telemetry jobs run inline when enqueued.[39m
# Subtest: TelemetryQueueService inline mode
    # Subtest: runs ingest handler inline when REDIS_URL is unset
    ok 1 - runs ingest handler inline when REDIS_URL is unset
      ---
      duration_ms: 1.630625
      type: 'test'
      ...
    1..1
ok 24 - TelemetryQueueService inline mode
  ---
  duration_ms: 2.412542
  type: 'suite'
  ...
# Subtest: ActivityChangeInfo decode
    # Subtest: decodes 0x0000
    ok 1 - decodes 0x0000
      ---
      duration_ms: 2.237292
      type: 'test'
      ...
    # Subtest: decodes 0x0800
    ok 2 - decodes 0x0800
      ---
      duration_ms: 0.161166
      type: 'test'
      ...
    # Subtest: decodes 0x1000
    ok 3 - decodes 0x1000
      ---
      duration_ms: 0.114
      type: 'test'
      ...
    # Subtest: decodes 0x1800
    ok 4 - decodes 0x1800
      ---
      duration_ms: 1.641958
      type: 'test'
      ...
    # Subtest: decodes 0x01e0
    ok 5 - decodes 0x01e0
      ---
      duration_ms: 0.1435
      type: 'test'
      ...
    # Subtest: decodes 0x21e0
    ok 6 - decodes 0x21e0
      ---
      duration_ms: 0.058833
      type: 'test'
      ...
    # Subtest: decodes 0xfbff
    ok 7 - decodes 0xfbff
      ---
      duration_ms: 0.070333
      type: 'test'
      ...
    # Subtest: decodes 0x912c
    ok 8 - decodes 0x912c
      ---
      duration_ms: 0.138792
      type: 'test'
      ...
    # Subtest: round-trips encoded values
    ok 9 - round-trips encoded values
      ---
      duration_ms: 0.307833
      type: 'test'
      ...
    1..9
ok 25 - ActivityChangeInfo decode
  ---
  duration_ms: 6.272541
  type: 'suite'
  ...
# Subtest: TimeReal codec
    # Subtest: encodes and decodes epoch seconds
    ok 1 - encodes and decodes epoch seconds
      ---
      duration_ms: 0.202875
      type: 'test'
      ...
    1..1
ok 26 - TimeReal codec
  ---
  duration_ms: 0.328792
  type: 'suite'
  ...
# Subtest: Annex 1C fixture round-trip
    # Subtest: parses two-day Gen1 card file
    ok 1 - parses two-day Gen1 card file
      ---
      duration_ms: 2.960916
      type: 'test'
      ...
    # Subtest: parses ring-buffer wrap-around card file
    ok 2 - parses ring-buffer wrap-around card file
      ---
      duration_ms: 0.484083
      type: 'test'
      ...
    # Subtest: parses VU file with driving_without_card event
    ok 3 - parses VU file with driving_without_card event
      ---
      duration_ms: 0.425083
      type: 'test'
      ...
    # Subtest: validates signed card signatures
    ok 4 - validates signed card signatures
      ---
      duration_ms: 7.342333
      type: 'test'
      ...
    # Subtest: rejects corrupted signed copy
    ok 5 - rejects corrupted signed copy
      ---
      duration_ms: 2.50375
      type: 'test'
      ...
    1..5
ok 27 - Annex 1C fixture round-trip
  ---
  duration_ms: 15.06525
  type: 'suite'
  ...
# Subtest: Annex 1C TLV boundaries
    # Subtest: parses valid TLV chain
    ok 1 - parses valid TLV chain
      ---
      duration_ms: 1.313917
      type: 'test'
      ...
    # Subtest: throws on truncated header
    ok 2 - throws on truncated header
      ---
      duration_ms: 0.247041
      type: 'test'
      ...
    # Subtest: throws on truncated value
    ok 3 - throws on truncated value
      ---
      duration_ms: 0.07475
      type: 'test'
      ...
    1..3
ok 28 - Annex 1C TLV boundaries
  ---
  duration_ms: 2.830834
  type: 'suite'
  ...
# Subtest: ddd-parser
    # Subtest: parses driver card sample fixture via synthetic fallback
    ok 1 - parses driver card sample fixture via synthetic fallback
      ---
      duration_ms: 2.389125
      type: 'test'
      ...
    # Subtest: parses vu sample fixture via synthetic fallback
    ok 2 - parses vu sample fixture via synthetic fallback
      ---
      duration_ms: 0.466375
      type: 'test'
      ...
    # Subtest: returns graceful warning for broken file
    ok 3 - returns graceful warning for broken file
      ---
      duration_ms: 1.551667
      type: 'test'
      ...
    # Subtest: parses legacy synthetic fixtures directly
    ok 4 - parses legacy synthetic fixtures directly
      ---
      duration_ms: 0.321208
      type: 'test'
      ...
    1..4
ok 29 - ddd-parser
  ---
  duration_ms: 5.929667
  type: 'suite'
  ...
# Subtest: validateDddUpload
    # Subtest: accepts allowed extensions case-insensitively
    ok 1 - accepts allowed extensions case-insensitively
      ---
      duration_ms: 1.1085
      type: 'test'
      ...
    # Subtest: accepts exactly 5 MB and rejects one byte over
    ok 2 - accepts exactly 5 MB and rejects one byte over
      ---
      duration_ms: 0.123208
      type: 'test'
      ...
    # Subtest: rejects unsupported extensions
    ok 3 - rejects unsupported extensions
      ---
      duration_ms: 0.120292
      type: 'test'
      ...
    # Subtest: rejects empty files
    ok 4 - rejects empty files
      ---
      duration_ms: 0.049333
      type: 'test'
      ...
    1..4
ok 30 - validateDddUpload
  ---
  duration_ms: 2.072834
  type: 'suite'
  ...
# Subtest: breaks (Art. 7)
    # Subtest: art7_break_at_4h30m00s_clean
    ok 1 - art7_break_at_4h30m00s_clean
      ---
      duration_ms: 0.696583
      type: 'test'
      ...
    # Subtest: art7_break_at_4h30m01s_infringement
    ok 2 - art7_break_at_4h30m01s_infringement
      ---
      duration_ms: 0.10875
      type: 'test'
      ...
    # Subtest: art7_break_30m_overrun_is_critical
    ok 3 - art7_break_30m_overrun_is_critical
      ---
      duration_ms: 0.065625
      type: 'test'
      ...
    # Subtest: art7_full_45m_break_resets_counter
    ok 4 - art7_full_45m_break_resets_counter
      ---
      duration_ms: 0.199667
      type: 'test'
      ...
    # Subtest: art7_split_15_then_30_valid
    ok 5 - art7_split_15_then_30_valid
      ---
      duration_ms: 0.085166
      type: 'test'
      ...
    # Subtest: art7_split_30_then_15_invalid
    ok 6 - art7_split_30_then_15_invalid
      ---
      duration_ms: 0.132125
      type: 'test'
      ...
    1..6
ok 31 - breaks (Art. 7)
  ---
  duration_ms: 1.960083
  type: 'suite'
  ...
# Subtest: card-events
    # Subtest: driving_without_card_with_driver_is_critical
    ok 1 - driving_without_card_with_driver_is_critical
      ---
      duration_ms: 0.52
      type: 'test'
      ...
    # Subtest: driving_without_card_without_driver_still_returns_candidate
    ok 2 - driving_without_card_without_driver_still_returns_candidate
      ---
      duration_ms: 0.067583
      type: 'test'
      ...
    1..2
ok 32 - card-events
  ---
  duration_ms: 1.240208
  type: 'suite'
  ...
# Subtest: daily-driving (Art. 6/1)
    # Subtest: art6_exactly_9h_clean
    ok 1 - art6_exactly_9h_clean
      ---
      duration_ms: 0.639625
      type: 'test'
      ...
    # Subtest: art6_first_extension_to_10h_clean
    ok 2 - art6_first_extension_to_10h_clean
      ---
      duration_ms: 0.287167
      type: 'test'
      ...
    # Subtest: art6_third_extension_is_infringement
    ok 3 - art6_third_extension_is_infringement
      ---
      duration_ms: 0.740916
      type: 'test'
      ...
    # Subtest: art6_over_10h_is_critical
    ok 4 - art6_over_10h_is_critical
      ---
      duration_ms: 0.554208
      type: 'test'
      ...
    1..4
ok 33 - daily-driving (Art. 6/1)
  ---
  duration_ms: 3.0085
  type: 'suite'
  ...
# Subtest: daily-rest (Art. 8/1-2)
    # Subtest: art8_11h_rest_clean
    ok 1 - art8_11h_rest_clean
      ---
      duration_ms: 0.655667
      type: 'test'
      ...
    # Subtest: art8_reduced_9h_clean_within_allowance
    ok 2 - art8_reduced_9h_clean_within_allowance
      ---
      duration_ms: 0.082667
      type: 'test'
      ...
    # Subtest: art8_fourth_reduced_rest_is_infringement
    ok 3 - art8_fourth_reduced_rest_is_infringement
      ---
      duration_ms: 0.138125
      type: 'test'
      ...
    # Subtest: art8_under_9h_rest_is_critical
    ok 4 - art8_under_9h_rest_is_critical
      ---
      duration_ms: 0.066416
      type: 'test'
      ...
    1..4
ok 34 - daily-rest (Art. 8/1-2)
  ---
  duration_ms: 1.618542
  type: 'suite'
  ...
# Subtest: golden-reference scenarios
    # Subtest: golden:exactly_9h_driving_clean
    ok 1 - golden:exactly_9h_driving_clean
      ---
      duration_ms: 0.767334
      type: 'test'
      ...
    # Subtest: golden:9h1m_after_two_extensions
    ok 2 - golden:9h1m_after_two_extensions
      ---
      duration_ms: 0.1565
      type: 'test'
      ...
    # Subtest: golden:valid_15_then_30_break
    ok 3 - golden:valid_15_then_30_break
      ---
      duration_ms: 0.129875
      type: 'test'
      ...
    # Subtest: golden:invalid_30_then_15_break
    ok 4 - golden:invalid_30_then_15_break
      ---
      duration_ms: 0.134666
      type: 'test'
      ...
    # Subtest: golden:iso_week_56h_plus
    ok 5 - golden:iso_week_56h_plus
      ---
      duration_ms: 0.190375
      type: 'test'
      ...
    # Subtest: golden_total_matches_seed_table
    ok 6 - golden_total_matches_seed_table
      ---
      duration_ms: 0.332875
      type: 'test'
      ...
    1..6
ok 35 - golden-reference scenarios
  ---
  duration_ms: 2.396
  type: 'suite'
  ...
# Subtest: computeDriverRemainingSnapshot
    # Subtest: matches rule-engine constants for daily remaining and break counters
    ok 1 - matches rule-engine constants for daily remaining and break counters
      ---
      duration_ms: 0.955083
      type: 'test'
      ...
    # Subtest: resets continuous driving after a valid 45-minute break
    ok 2 - resets continuous driving after a valid 45-minute break
      ---
      duration_ms: 0.272458
      type: 'test'
      ...
    1..2
ok 36 - computeDriverRemainingSnapshot
  ---
  duration_ms: 2.128542
  type: 'suite'
  ...
# Subtest: remaining endpoint rule reuse
    # Subtest: produces the same snapshot as direct rules helper for mock activities
    ok 1 - produces the same snapshot as direct rules helper for mock activities
      ---
      duration_ms: 1.075083
      type: 'test'
      ...
    1..1
ok 37 - remaining endpoint rule reuse
  ---
  duration_ms: 1.146416
  type: 'suite'
  ...
# Subtest: weekly-driving (Art. 6/2-3)
    # Subtest: art6_weekly_56h00s_clean
    ok 1 - art6_weekly_56h00s_clean
      ---
      duration_ms: 0.651542
      type: 'test'
      ...
    # Subtest: art6_weekly_56h01s_infringement
    ok 2 - art6_weekly_56h01s_infringement
      ---
      duration_ms: 0.093458
      type: 'test'
      ...
    # Subtest: art6_weekly_over_60h_critical
    ok 3 - art6_weekly_over_60h_critical
      ---
      duration_ms: 0.116666
      type: 'test'
      ...
    # Subtest: art6_two_week_90h_boundary
    ok 4 - art6_two_week_90h_boundary
      ---
      duration_ms: 0.104791
      type: 'test'
      ...
    # Subtest: art6_iso_week_transition_counts_in_week
    ok 5 - art6_iso_week_transition_counts_in_week
      ---
      duration_ms: 0.177333
      type: 'test'
      ...
    1..5
ok 38 - weekly-driving (Art. 6/2-3)
  ---
  duration_ms: 1.828959
  type: 'suite'
  ...
# Subtest: compensation
    # Subtest: art8_compensation_debt_unpaid_after_3_weeks
    ok 1 - art8_compensation_debt_unpaid_after_3_weeks
      ---
      duration_ms: 0.522833
      type: 'test'
      ...
    1..1
ok 39 - compensation
  ---
  duration_ms: 1.867084
  type: 'suite'
  ...
# Subtest: weekly-rest (Art. 8/6)
    # Subtest: art8_weekly_rest_45h_clean
    ok 1 - art8_weekly_rest_45h_clean
      ---
      duration_ms: 0.386917
      type: 'test'
      ...
    # Subtest: art8_weekly_rest_under_24h_critical
    ok 2 - art8_weekly_rest_under_24h_critical
      ---
      duration_ms: 0.190041
      type: 'test'
      ...
    1..2
ok 40 - weekly-rest (Art. 8/6)
  ---
  duration_ms: 0.747416
  type: 'suite'
  ...
# Subtest: TachoProviderCredentialService
    # Subtest: stores encrypted payloads and never returns plaintext from list()
    ok 1 - stores encrypted payloads and never returns plaintext from list()
      ---
      duration_ms: 70.851709
      type: 'test'
      ...
    1..1
ok 41 - TachoProviderCredentialService
  ---
  duration_ms: 155.906125
  type: 'suite'
  ...
# Subtest: tachograph-format.util
    # Subtest: formats duration without decimal hours
    ok 1 - formats duration without decimal hours
      ---
      duration_ms: 0.444042
      type: 'test'
      ...
    # Subtest: parses assignment HH:mm span for planned today seconds
    ok 2 - parses assignment HH:mm span for planned today seconds
      ---
      duration_ms: 0.091584
      type: 'test'
      ...
    # Subtest: parses infringement evidence JSON
    ok 3 - parses infringement evidence JSON
      ---
      duration_ms: 0.066166
      type: 'test'
      ...
    1..3
ok 42 - tachograph-format.util
  ---
  duration_ms: 1.226084
  type: 'suite'
  ...
# Subtest: tachograph-infringement-meta
    # Subtest: maps all infringement types to articles
    ok 1 - maps all infringement types to articles
      ---
      duration_ms: 0.09425
      type: 'test'
      ...
    1..1
ok 43 - tachograph-infringement-meta
  ---
  duration_ms: 0.199416
  type: 'suite'
  ...
# [32m[Nest] 86851  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file ddd-1 processed: 1 activities, 0 infringements.[39m
# Subtest: TachographService consumer
    # Subtest: processes a DDD file successfully and marks it processed
    ok 1 - processes a DDD file successfully and marks it processed
      ---
      duration_ms: 87.218333
      type: 'test'
      ...
    # Subtest: marks failed and stores a short error summary when parsing fails
    ok 2 - marks failed and stores a short error summary when parsing fails
      ---
      duration_ms: 32.262333
      type: 'test'
      ...
# [32m[Nest] 86851  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file ddd-1 processed: 1 activities, 0 infringements.[39m
    # Subtest: does not reprocess an already processed file
    ok 3 - does not reprocess an already processed file
      ---
      duration_ms: 18.606959
      type: 'test'
      ...
# [32m[Nest] 86851  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file ddd-1 processed: 1 activities, 0 infringements.[39m
    # Subtest: fulfills an existing driver-card schedule and pushes nextDueAt by intervalDays
    ok 4 - fulfills an existing driver-card schedule and pushes nextDueAt by intervalDays
      ---
      duration_ms: 19.037166
      type: 'test'
      ...
# [33m[Nest] 86851  - [39m07/13/2026, 12:30:10 PM [33m   WARN[39m [38;5;3m[TachographService] [39m[33mSkipping rule engine: DDD signature validation failed[39m
# [32m[Nest] 86851  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file ddd-1 processed: 1 activities, 0 infringements.[39m
    # Subtest: does not fulfill schedules when DDD signature is invalid
    ok 5 - does not fulfill schedules when DDD signature is invalid
      ---
      duration_ms: 17.123833
      type: 'test'
      ...
    1..5
ok 44 - TachographService consumer
  ---
  duration_ms: 175.860459
  type: 'suite'
  ...
# Subtest: tachograph dashboard integration endpoints
    # Subtest: exposes idle fuel cost constants
    ok 1 - exposes idle fuel cost constants
      ---
      duration_ms: 0.441584
      type: 'test'
      ...
    # Subtest: aggregates vehicle costs by calendar month
    ok 2 - aggregates vehicle costs by calendar month
      ---
      duration_ms: 2.240708
      type: 'test'
      ...
    # Subtest: counts drivers out of time from remaining snapshot
    ok 3 - counts drivers out of time from remaining snapshot
      ---
      duration_ms: 0.537958
      type: 'test'
      ...
    1..3
ok 45 - tachograph dashboard integration endpoints
  ---
  duration_ms: 4.054917
  type: 'suite'
  ...
# Subtest: TachographDownloadReminderService.processDueReminders
    # Subtest: triggers 7d/1d/overdue thresholds and avoids duplicate stage notifications
    ok 1 - triggers 7d/1d/overdue thresholds and avoids duplicate stage notifications
      ---
      duration_ms: 3.188333
      type: 'test'
      ...
    1..1
ok 46 - TachographDownloadReminderService.processDueReminders
  ---
  duration_ms: 4.401542
  type: 'suite'
  ...
# Subtest: TachographInfringementNotificationService.notifyCreated
    # Subtest: sends created notifications to office and boss for medium infringements
    ok 1 - sends created notifications to office and boss for medium infringements
      ---
      duration_ms: 1.932834
      type: 'test'
      ...
    # Subtest: includes the driver for critical infringements when the driver user is active
    ok 2 - includes the driver for critical infringements when the driver user is active
      ---
      duration_ms: 0.182125
      type: 'test'
      ...
    # Subtest: does not create duplicate notifications for the same infringement and recipient
    ok 3 - does not create duplicate notifications for the same infringement and recipient
      ---
      duration_ms: 0.258125
      type: 'test'
      ...
    1..3
ok 47 - TachographInfringementNotificationService.notifyCreated
  ---
  duration_ms: 4.138792
  type: 'suite'
  ...
# Subtest: TachographInfringementNotificationService.processAcknowledgementReminders
    # Subtest: sends one reminder per recipient and skips acknowledged or recent infringements
    ok 1 - sends one reminder per recipient and skips acknowledged or recent infringements
      ---
      duration_ms: 0.83325
      type: 'test'
      ...
    1..1
ok 48 - TachographInfringementNotificationService.processAcknowledgementReminders
  ---
  duration_ms: 1.407833
  type: 'suite'
  ...
# Subtest: tachograph payroll-flag authorization
    # Subtest: rejects driver role with a forbidden result
    ok 1 - rejects driver role with a forbidden result
      ---
      duration_ms: 0.697542
      type: 'test'
      ...
    # Subtest: allows accounting role and the controller returns the service response
    ok 2 - allows accounting role and the controller returns the service response
      ---
      duration_ms: 0.754041
      type: 'test'
      ...
    1..2
ok 49 - tachograph payroll-flag authorization
  ---
  duration_ms: 2.058209
  type: 'suite'
  ...
# [32m[Nest] 86863  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographQueueService] [39m[32mREDIS_URL not set — tachograph DDD jobs run inline when enqueued.[39m
# [32m[Nest] 86863  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographQueueService] [39m[32mREDIS_URL not set — tachograph DDD jobs run inline when enqueued.[39m
# [32m[Nest] 86863  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographQueueService] [39m[32mREDIS_URL not set — tachograph DDD jobs run inline when enqueued.[39m
# [32m[Nest] 86863  - [39m07/13/2026, 12:30:10 PM [32m    LOG[39m [38;5;3m[TachographQueueService] [39m[32mREDIS_URL not set — tachograph DDD jobs run inline when enqueued.[39m
# Subtest: TachographQueueService inline mode
    # Subtest: processes successful jobs in inline fallback mode when REDIS_URL is unset
    ok 1 - processes successful jobs in inline fallback mode when REDIS_URL is unset
      ---
      duration_ms: 1.4285
      type: 'test'
      ...
    # Subtest: retries with exponential backoff and succeeds before max attempts
    ok 2 - retries with exponential backoff and succeeds before max attempts
      ---
      duration_ms: 0.307416
      type: 'test'
      ...
    # Subtest: invokes permanent failure handler on persistent failure
    ok 3 - invokes permanent failure handler on persistent failure
      ---
      duration_ms: 1.644292
      type: 'test'
      ...
    # Subtest: treats duplicated enqueue payload as idempotent no-op in consumer logic
    ok 4 - treats duplicated enqueue payload as idempotent no-op in consumer logic
      ---
      duration_ms: 0.6155
      type: 'test'
      ...
    1..4
ok 50 - TachographQueueService inline mode
  ---
  duration_ms: 4.838958
  type: 'suite'
  ...
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographQueueService] [39m[32mREDIS_URL not set — tachograph DDD jobs run inline when enqueued.[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographQueueBootstrapService] [39m[32mTachograph queue mode: inline[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file cmrj0ugmy0006v20w3ech05fx processed: 4 activities, 0 infringements.[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmrj0ugmb0004v20w3joxdyog processed: 1 files[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmriw2yeh000rv2ejbc3u96al processed: 1 files[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmriw2yet000zv2ej5c15too7 processed: 1 files[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmrj0ugmb0004v20w3joxdyog processed: 1 files[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmriw2yeh000rv2ejbc3u96al processed: 1 files[39m
# [32m[Nest] 86864  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographRemoteDownloadService] [39m[32mRemote DDD schedule cmriw2yet000zv2ej5c15too7 processed: 1 files[39m
# Subtest: TachographRemoteDownloadService
    # Subtest: downloads due schedules, enqueues DDD processing, and deduplicates a second run
    ok 1 - downloads due schedules, enqueues DDD processing, and deduplicates a second run
      ---
      duration_ms: 91.304166
      type: 'test'
      ...
    1..1
ok 51 - TachographRemoteDownloadService
  ---
  duration_ms: 315.165625
  type: 'suite'
  ...
# [32m[Nest] 86865  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file cmrj0ugq60005v20xt2c21kr2 processed: 3 activities, 4 infringements.[39m
# Subtest: TachographService Annex 1C signature ingest
    # Subtest: ingests valid signed Annex 1C card and evaluates rules
    ok 1 - ingests valid signed Annex 1C card and evaluates rules
      ---
      duration_ms: 62.938916
      type: 'test'
      ...
# [33m[Nest] 86865  - [39m07/13/2026, 12:30:11 PM [33m   WARN[39m [38;5;3m[TachographService] [39m[33mSkipping rule engine: DDD signature validation failed[39m
# [32m[Nest] 86865  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file cmrj0ugrq000iv20xx3allz26 processed: 3 activities, 0 infringements.[39m
    # Subtest: archives corrupted signed copy without new infringements
    ok 2 - archives corrupted signed copy without new infringements
      ---
      duration_ms: 21.004917
      type: 'test'
      ...
    1..2
ok 52 - TachographService Annex 1C signature ingest
  ---
  duration_ms: 145.008834
  type: 'suite'
  ...
# [32m[Nest] 86866  - [39m07/13/2026, 12:30:11 PM [32m    LOG[39m [38;5;3m[TachographService] [39m[32mDDD file cmrj0ugmy0006v20yo8j8k3pr processed: 4 activities, 1 infringements.[39m
# Subtest: TachographService.ingestDddFile
    # Subtest: ingests fixture DDD and deduplicates identical uploads
    ok 1 - ingests fixture DDD and deduplicates identical uploads
      ---
      duration_ms: 132.837458
      type: 'test'
      ...
    1..1
ok 53 - TachographService.ingestDddFile
  ---
  duration_ms: 301.793708
  type: 'suite'
  ...
# [31m[Nest] 86867  - [39m07/13/2026, 12:30:11 PM [31m  ERROR[39m [38;5;3m[TeltonikaGatewayService] [39m[31mtelemetry queue enqueue failed imei=359339080000101 error=redis unavailable[39m
# Subtest: TeltonikaGatewayService ACK policy
    # Subtest: withholds ACK when queue enqueue fails
    ok 1 - withholds ACK when queue enqueue fails
      ---
      duration_ms: 1.131792
      type: 'test'
      ...
    1..1
ok 54 - TeltonikaGatewayService ACK policy
  ---
  duration_ms: 1.684125
  type: 'suite'
  ...
# Subtest: downsampleTimeSeries
    # Subtest: averages values into 5-minute buckets without sending raw points
    ok 1 - averages values into 5-minute buckets without sending raw points
      ---
      duration_ms: 1.488959
      type: 'test'
      ...
    # Subtest: ignores points outside the window
    ok 2 - ignores points outside the window
      ---
      duration_ms: 0.098083
      type: 'test'
      ...
    1..2
ok 55 - downsampleTimeSeries
  ---
  duration_ms: 2.216708
  type: 'suite'
  ...
# Subtest: TenantAccessService
    # Subtest: allows active tenants
    ok 1 - allows active tenants
      ---
      duration_ms: 0.656916
      type: 'test'
      ...
    # Subtest: blocks suspended tenants
    ok 2 - blocks suspended tenants
      ---
      duration_ms: 0.30675
      type: 'test'
      ...
    # Subtest: blocks provisioning tenants
    ok 3 - blocks provisioning tenants
      ---
      duration_ms: 0.133833
      type: 'test'
      ...
    # Subtest: rejects unknown tenants
    ok 4 - rejects unknown tenants
      ---
      duration_ms: 0.09375
      type: 'test'
      ...
    1..4
ok 56 - TenantAccessService
  ---
  duration_ms: 7.272917
  type: 'suite'
  ...
# Subtest: applyTenantScope — read operations
    # Subtest: adds tenantId filter to findMany without where
    ok 1 - adds tenantId filter to findMany without where
      ---
      duration_ms: 1.233125
      type: 'test'
      ...
    # Subtest: wraps existing where in AND with tenantId for findMany
    ok 2 - wraps existing where in AND with tenantId for findMany
      ---
      duration_ms: 0.076083
      type: 'test'
      ...
    # Subtest: cannot be overridden by a caller-specified foreign tenantId
    ok 3 - cannot be overridden by a caller-specified foreign tenantId
      ---
      duration_ms: 0.618375
      type: 'test'
      ...
    # Subtest: scopes findFirst
    ok 4 - scopes findFirst
      ---
      duration_ms: 0.228791
      type: 'test'
      ...
    # Subtest: scopes count
    ok 5 - scopes count
      ---
      duration_ms: 0.208667
      type: 'test'
      ...
    # Subtest: scopes aggregate
    ok 6 - scopes aggregate
      ---
      duration_ms: 0.133583
      type: 'test'
      ...
    # Subtest: scopes groupBy
    ok 7 - scopes groupBy
      ---
      duration_ms: 0.215875
      type: 'test'
      ...
    1..7
ok 57 - applyTenantScope — read operations
  ---
  duration_ms: 3.860833
  type: 'suite'
  ...
# Subtest: applyTenantScope — findUnique
    # Subtest: adds tenantId alongside id lookups (cross-tenant id reads return null)
    ok 1 - adds tenantId alongside id lookups (cross-tenant id reads return null)
      ---
      duration_ms: 0.415
      type: 'test'
      ...
    # Subtest: adds tenantId alongside id for findUniqueOrThrow
    ok 2 - adds tenantId alongside id for findUniqueOrThrow
      ---
      duration_ms: 0.652084
      type: 'test'
      ...
    # Subtest: injects tenantId into compound unique keys
    ok 3 - injects tenantId into compound unique keys
      ---
      duration_ms: 0.488542
      type: 'test'
      ...
    # Subtest: leaves compound unique keys unchanged when tenantId is not part of the unique input
    ok 4 - leaves compound unique keys unchanged when tenantId is not part of the unique input
      ---
      duration_ms: 0.148833
      type: 'test'
      ...
    # Subtest: adds tenantId to plain unique fields
    ok 5 - adds tenantId to plain unique fields
      ---
      duration_ms: 0.115167
      type: 'test'
      ...
    1..5
ok 58 - applyTenantScope — findUnique
  ---
  duration_ms: 2.416625
  type: 'suite'
  ...
# Subtest: applyTenantScope — write operations
    # Subtest: forces tenantId on create data
    ok 1 - forces tenantId on create data
      ---
      duration_ms: 0.3625
      type: 'test'
      ...
    # Subtest: forces tenantId on every row of createMany
    ok 2 - forces tenantId on every row of createMany
      ---
      duration_ms: 0.1495
      type: 'test'
      ...
    # Subtest: scopes update by unique id with tenantId
    ok 3 - scopes update by unique id with tenantId
      ---
      duration_ms: 0.116208
      type: 'test'
      ...
    # Subtest: scopes updateMany
    ok 4 - scopes updateMany
      ---
      duration_ms: 0.104792
      type: 'test'
      ...
    # Subtest: scopes delete by unique id with tenantId
    ok 5 - scopes delete by unique id with tenantId
      ---
      duration_ms: 0.085834
      type: 'test'
      ...
    # Subtest: scopes deleteMany without where (prevents cross-tenant wipe)
    ok 6 - scopes deleteMany without where (prevents cross-tenant wipe)
      ---
      duration_ms: 0.088125
      type: 'test'
      ...
    # Subtest: scopes upsert create, update and where
    ok 7 - scopes upsert create, update and where
      ---
      duration_ms: 0.116292
      type: 'test'
      ...
    1..7
ok 59 - applyTenantScope — write operations
  ---
  duration_ms: 1.252333
  type: 'suite'
  ...
# Subtest: TenantContext
    # Subtest: returns the tenant id inside run()
    ok 1 - returns the tenant id inside run()
      ---
      duration_ms: 0.639167
      type: 'test'
      ...
    # Subtest: returns undefined outside any context
    ok 2 - returns undefined outside any context
      ---
      duration_ms: 0.0585
      type: 'test'
      ...
    # Subtest: isolates nested contexts
    ok 3 - isolates nested contexts
      ---
      duration_ms: 0.063875
      type: 'test'
      ...
    # Subtest: runUnscoped bypasses tenant filtering and reports bypass
    ok 4 - runUnscoped bypasses tenant filtering and reports bypass
      ---
      duration_ms: 0.065208
      type: 'test'
      ...
    # Subtest: propagates context across async boundaries
    ok 5 - propagates context across async boundaries
      ---
      duration_ms: 12.997958
      type: 'test'
      ...
    # Subtest: keeps concurrent async contexts separate
    ok 6 - keeps concurrent async contexts separate
      ---
      duration_ms: 9.608041
      type: 'test'
      ...
    1..6
ok 60 - TenantContext
  ---
  duration_ms: 23.658041
  type: 'suite'
  ...
# Subtest: TENANT_SCOPED_MODELS
    # Subtest: includes customer assignment messages for tenant isolation
    ok 1 - includes customer assignment messages for tenant isolation
      ---
      duration_ms: 0.526625
      type: 'test'
      ...
    # Subtest: includes user invitations for tenant isolation
    ok 2 - includes user invitations for tenant isolation
      ---
      duration_ms: 0.102958
      type: 'test'
      ...
    # Subtest: includes work sessions for tenant isolation
    ok 3 - includes work sessions for tenant isolation
      ---
      duration_ms: 0.074625
      type: 'test'
      ...
    # Subtest: includes vehicle equipment for tenant isolation
    ok 4 - includes vehicle equipment for tenant isolation
      ---
      duration_ms: 0.230459
      type: 'test'
      ...
    # Subtest: includes fleet analytics models for tenant isolation
    ok 5 - includes fleet analytics models for tenant isolation
      ---
      duration_ms: 0.160125
      type: 'test'
      ...
    # Subtest: includes telematics device models for tenant isolation
    ok 6 - includes telematics device models for tenant isolation
      ---
      duration_ms: 0.299791
      type: 'test'
      ...
    # Subtest: includes tachograph compliance models for tenant isolation
    ok 7 - includes tachograph compliance models for tenant isolation
      ---
      duration_ms: 0.169958
      type: 'test'
      ...
    1..7
ok 61 - TENANT_SCOPED_MODELS
  ---
  duration_ms: 2.540708
  type: 'suite'
  ...
# Subtest: tenant scoping regressions
    # Subtest: normalizes lower-case Prisma model names
    ok 1 - normalizes lower-case Prisma model names
      ---
      duration_ms: 0.478458
      type: 'test'
      ...
    # Subtest: injects tenantId for count, aggregate and groupBy operations
    ok 2 - injects tenantId for count, aggregate and groupBy operations
      ---
      duration_ms: 1.261333
      type: 'test'
      ...
    # Subtest: does not inject tenantId into compound unique inputs that do not contain tenantId
    ok 3 - does not inject tenantId into compound unique inputs that do not contain tenantId
      ---
      duration_ms: 0.393458
      type: 'test'
      ...
    1..3
ok 62 - tenant scoping regressions
  ---
  duration_ms: 3.2115
  type: 'suite'
  ...
# Subtest: resolveMotionState
    # Subtest: returns moving at boundary speed 2.0 when ignition is on
    ok 1 - returns moving at boundary speed 2.0 when ignition is on
      ---
      duration_ms: 0.6965
      type: 'test'
      ...
    # Subtest: does not return idle at speed 1.9 before 10:00 threshold
    ok 2 - does not return idle at speed 1.9 before 10:00 threshold
      ---
      duration_ms: 0.102042
      type: 'test'
      ...
    # Subtest: returns idle with idleSince at 10:00 threshold
    ok 3 - returns idle with idleSince at 10:00 threshold
      ---
      duration_ms: 0.122625
      type: 'test'
      ...
    # Subtest: returns stopped for ignition off while online
    ok 4 - returns stopped for ignition off while online
      ---
      duration_ms: 0.0575
      type: 'test'
      ...
    # Subtest: returns offline regardless of ignition and speed when presence is offline
    ok 5 - returns offline regardless of ignition and speed when presence is offline
      ---
      duration_ms: 0.051708
      type: 'test'
      ...
    1..5
ok 63 - resolveMotionState
  ---
  duration_ms: 2.170334
  type: 'suite'
  ...
# Subtest: TrackingService.ingestTelemetry
    # Subtest: writes telemetry latest, dtc, device trip and driving events
    ok 1 - writes telemetry latest, dtc, device trip and driving events
      ---
      duration_ms: 1.659333
      type: 'test'
      ...
    # Subtest: accepts critical dtc payload without throwing
    ok 2 - accepts critical dtc payload without throwing
      ---
      duration_ms: 0.15625
      type: 'test'
      ...
    1..2
ok 64 - TrackingService.ingestTelemetry
  ---
  duration_ms: 2.402833
  type: 'suite'
  ...
# Subtest: Tracking telematics read models
    # Subtest: returns expected shape for vehicle-health and driver-scores using scoped prisma only
    ok 1 - returns expected shape for vehicle-health and driver-scores using scoped prisma only
      ---
      duration_ms: 0.714458
      type: 'test'
      ...
    # Subtest: smoke: processes sim-like payload and exposes baseline telematics fields
    ok 2 - smoke: processes sim-like payload and exposes baseline telematics fields
      ---
      duration_ms: 0.284917
      type: 'test'
      ...
    1..2
ok 65 - Tracking telematics read models
  ---
  duration_ms: 1.074458
  type: 'suite'
  ...
# Subtest: sampleTrailPoints
    # Subtest: samples 201 points down to <= 200 while keeping first and last
    ok 1 - samples 201 points down to <= 200 while keeping first and last
      ---
      duration_ms: 1.0095
      type: 'test'
      ...
    1..1
ok 66 - sampleTrailPoints
  ---
  duration_ms: 1.807291
  type: 'suite'
  ...
# Subtest: handover-photo-validation.util
    # Subtest: rejects invalid magic bytes
    ok 1 - rejects invalid magic bytes
      ---
      duration_ms: 0.690417
      type: 'test'
      ...
    # Subtest: rejects images without EXIF metadata
    ok 2 - rejects images without EXIF metadata
      ---
      duration_ms: 1.817916
      type: 'test'
      ...
    # Subtest: rejects EXIF timestamps older than 10 minutes
    ok 3 - rejects EXIF timestamps older than 10 minutes
      ---
      duration_ms: 0.135833
      type: 'test'
      ...
    # Subtest: rejects client timestamps outside the allowed window
    ok 4 - rejects client timestamps outside the allowed window
      ---
      duration_ms: 0.115208
      type: 'test'
      ...
    # Subtest: accepts recent EXIF and client timestamps
    ok 5 - accepts recent EXIF and client timestamps
      ---
      duration_ms: 0.284208
      type: 'test'
      ...
    # Subtest: produces stable SHA-256 hashes for duplicate detection
    ok 6 - produces stable SHA-256 hashes for duplicate detection
      ---
      duration_ms: 0.075833
      type: 'test'
      ...
    # Subtest: duplicate uploads share the same file hash (server rejects second upload)
    ok 7 - duplicate uploads share the same file hash (server rejects second upload)
      ---
      duration_ms: 0.698208
      type: 'test'
      ...
    # Subtest: assertTimestampWithinWindow enforces the 10-minute rule
    ok 8 - assertTimestampWithinWindow enforces the 10-minute rule
      ---
      duration_ms: 0.194625
      type: 'test'
      ...
    1..8
ok 67 - handover-photo-validation.util
  ---
  duration_ms: 4.8785
  type: 'suite'
  ...
# Subtest: normalizePlate
    # Subtest: strips spaces and dashes and uppercases
    ok 1 - strips spaces and dashes and uppercases
      ---
      duration_ms: 0.44675
      type: 'test'
      ...
    1..1
ok 68 - normalizePlate
  ---
  duration_ms: 1.009709
  type: 'suite'
  ...
# Subtest: calculatePhotoRequirement
    # Subtest: requires photos when vehicle changed
    ok 1 - requires photos when vehicle changed
      ---
      duration_ms: 0.809083
      type: 'test'
      ...
    # Subtest: does not require photos when vehicle unchanged and no plate context
    ok 2 - does not require photos when vehicle unchanged and no plate context
      ---
      duration_ms: 0.185666
      type: 'test'
      ...
    # Subtest: requires photos when plate changed even if vehicle id is the same
    ok 3 - requires photos when plate changed even if vehicle id is the same
      ---
      duration_ms: 0.150333
      type: 'test'
      ...
    # Subtest: treats normalized plates as equal
    ok 4 - treats normalized plates as equal
      ---
      duration_ms: 0.20025
      type: 'test'
      ...
    # Subtest: does not require photos on first day without yesterday plate
    ok 5 - does not require photos on first day without yesterday plate
      ---
      duration_ms: 0.063458
      type: 'test'
      ...
    1..5
ok 69 - calculatePhotoRequirement
  ---
  duration_ms: 1.96575
  type: 'suite'
  ...
1..69
# tests 214
# suites 69
# pass 214
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5945.734333
[run-tests] summary spec_files=57 tests=214 pass=214 fail=0

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs --scenario normal
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    {
      "name": "DriverLocationHistory",
      "expected": 5,
      "actual": 5,
      "ok": true
    },
    {
      "name": "VehicleTelemetryLatest.recordedAt",
      "expected": "2026-07-13T09:30:05.454Z",
      "actual": "2026-07-13T09:30:05.454Z",
      "ok": true
    },
    {
      "name": "activeDtcSinceScenario",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "TelemetryQuarantine",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "closedDeviceTrips",
      "expected": 1,
      "actual": 0,
      "ok": false
    }
  ],
  "ok": false
}
[verify-tacho-telematics] mismatch detected
  closedDeviceTrips: expected=1 actual=0

$ PATH=/opt/homebrew/opt/node@22/bin:$PATH npx ts-node scripts/tenant-isolation-check.ts
Total drivers (unscoped): 112
Scoped drivers tenant A (default-tenant): 50
Scoped drivers tenant B (mock-fleet-tenant): 62
Default tenant drivers: 50
DriverLocationLatest total: 98, tenant A scoped: 48
CustomerAssignmentMessage total: 0, tenant A scoped: 0
MessageAttachment total: 0, tenant A scoped: 0
MessageTranslation total: 11, tenant A scoped: 11
DddFile total: 117, tenant A scoped: 4
TachoProviderCredential total: 0, tenant A scoped: 0
FleetTripPurposeLog total: 0, tenant A scoped: 0
FuelCardImportBatch total: 2, tenant A scoped: 2
FuelCardTransaction total: 8, tenant A scoped: 8
EquipmentIssuance total: 4, tenant A scoped: 4
WorkSession total: 13, tenant A scoped: 13
Tenant isolation check passed.

$ for i in 1 2; do PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs --scenario normal; done
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    {
      "name": "DriverLocationHistory",
      "expected": 5,
      "actual": 5,
      "ok": true
    },
    {
      "name": "VehicleTelemetryLatest.recordedAt",
      "expected": "2026-07-13T09:30:51.532Z",
      "actual": "2026-07-13T09:30:51.532Z",
      "ok": true
    },
    {
      "name": "activeDtcSinceScenario",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "TelemetryQuarantine",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "closedDeviceTrips",
      "expected": 1,
      "actual": 1,
      "ok": true
    }
  ],
  "ok": true
}
{
  "scenario": "normal",
  "imei": "359339080000101",
  "vehicleId": "tacho-demo-vehicle-a",
  "checks": [
    {
      "name": "DriverLocationHistory",
      "expected": 5,
      "actual": 5,
      "ok": true
    },
    {
      "name": "VehicleTelemetryLatest.recordedAt",
      "expected": "2026-07-13T09:30:57.469Z",
      "actual": "2026-07-13T09:30:57.469Z",
      "ok": true
    },
    {
      "name": "activeDtcSinceScenario",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "TelemetryQuarantine",
      "expected": 0,
      "actual": 0,
      "ok": true
    },
    {
      "name": "closedDeviceTrips",
      "expected": 1,
      "actual": 1,
      "ok": true
    }
  ],
  "ok": true
}

$ rg "test\.skip\(|\.skip\(" tests -n
tests/generated/priority-auth-rbac.generated.spec.ts:14:  test.skip(!state, 'Missing .auth/admin.json — configure ADMIN_* credentials to enable TM-001.');
tests/generated/priority-auth-rbac.generated.spec.ts:17:    test.skip(!browser, 'Browser context unavailable for TM-001.');
tests/generated/priority-auth-rbac.generated.spec.ts:40:  test.skip(!state, 'Missing .auth/office.json — configure OFFICE_* credentials to enable TM-004.');
tests/documents.rbac.spec.ts:8: * Phase 7A shipped these as unconditional `test.skip(true, ...)` placeholders.
tests/documents.rbac.spec.ts:41:    test.skip(
tests/documents.rbac.spec.ts:65:    test.skip(
tests/documents.rbac.spec.ts:92:    test.skip(
tests/documents.rbac.spec.ts:105:    test.skip(
tests/documents.rbac.spec.ts:117:    test.skip(
tests/smoke.spec.ts:158:  test.skip(!fs.existsSync(OFFICE_AUTH_STATE), 'Missing .auth/office.json — run auth setup with OFFICE_EMAIL/OFFICE_PASSWORD first.');
tests/smoke.spec.ts:205:    test.skip(!officeToken || !driverToken || !driverUser, 'Missing office/driver auth state for messenger smoke.');
tests/smoke.spec.ts:281:  test.skip(!fs.existsSync(DRIVER_AUTH_STATE), 'Missing .auth/driver.json — run auth setup with DRIVER_EMAIL/DRIVER_PASSWORD first.');
tests/smoke.spec.ts:294:    test.skip(!token, 'Missing driver access token in .auth/driver.json.');
tests/smoke.spec.ts:366:    test.skip(!token, 'Missing driver access token in .auth/driver.json.');
tests/smoke.spec.ts:419:    test.skip(!officeToken || !driverToken, 'Missing office/driver auth state for equipment issuance smoke.');
tests/tacho-telematics/ui-cila.spec.ts:32:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/ui-cila.spec.ts:79:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/ui-cila.spec.ts:94:      test.skip(!driverId, 'No infringements with driver in seed data');
tests/tacho-telematics/ui-cila.spec.ts:115:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/ui-cila.spec.ts:122:      test.skip((await firstVehicleRow.count()) < 1, 'No vehicle row in list');
tests/tacho-telematics/ui-cila.spec.ts:127:      test.skip(!vehicleId, 'No vehicle in list');
tests/tacho-telematics/ui-cila.spec.ts:139:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/ui-cila.spec.ts:146:      test.skip((await firstVehicleRow.count()) < 1, 'No vehicle row in list');
tests/tacho-telematics/ui-cila.spec.ts:151:      test.skip(!vehicleId, 'No vehicle in list');
tests/tacho-telematics/ui-cila.spec.ts:182:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/telematics-health-scores.spec.ts:22:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/telematics-health-scores.spec.ts:39:      test.skip((await criticalDtcBadge.count()) < 1, 'No critical DTC row in current seeded telematics state');
tests/tacho-telematics/telematics-health-scores.spec.ts:51:    test.skip(!E2E_FULL, 'Runs only with E2E_FULL=1');
tests/tacho-telematics/telematics-health-scores.spec.ts:54:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/telematics-health-scores.spec.ts:75:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/telematics-health-scores.spec.ts:100:    test.skip(!E2E_FULL, 'Runs only with E2E_FULL=1');
tests/tacho-telematics/telematics-health-scores.spec.ts:103:    test.skip(!state, 'Missing .auth/driver.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:21:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:33:      test.skip(cardCount < 1, 'No remaining-driving cards in current dataset');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:45:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:56:      test.skip((await staleCard.count()) < 1, 'No stale remaining-driving card in current dataset');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:66:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:77:      test.skip((await band.count()) < 1, 'No warning band in current assignment/remaining state');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:89:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:100:      test.skip((await invalidRow.count()) < 1, 'No invalid-signature DDD row in current dataset');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:110:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/tacho-remaining-ddd.spec.ts:122:      test.skip(!hasUnassigned, 'No unassigned DDD file in seed');
tests/tacho-telematics/premium-cila.spec.ts:16:  test.skip(rowCount < 1, 'No live locations in current seed/sim state');
tests/tacho-telematics/premium-cila.spec.ts:24:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:50:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:67:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:83:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:103:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:104:    test.skip(
tests/tacho-telematics/premium-cila.spec.ts:126:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:127:    test.skip(
tests/tacho-telematics/premium-cila.spec.ts:149:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/premium-cila.spec.ts:150:    test.skip(
tests/tacho-telematics/tacho-compliance.spec.ts:33:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/tacho-compliance.spec.ts:44:      test.skip((await openKpi.count()) < 1, 'No compliance KPI cards (likely no DDD files in dataset)');
tests/tacho-telematics/tacho-compliance.spec.ts:59:      test.skip((await staleRow.count()) < 1, 'No stale driver row in current compliance dataset');
tests/tacho-telematics/tacho-compliance.spec.ts:69:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/tacho-compliance.spec.ts:84:      test.skip((await infringementsNav.count()) < 1, 'Tachograph sidebar links are not visible in current nav state');
tests/tacho-telematics/tacho-compliance.spec.ts:113:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/tacho-compliance.spec.ts:127:      test.skip(!hasRepeat, 'No repeat offender (3×) in seed for open queue');
tests/tacho-telematics/tacho-compliance.spec.ts:137:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/tacho-compliance.spec.ts:149:      test.skip(options.length < 2, 'No drivers in filter');
tests/tacho-telematics/tacho-compliance.spec.ts:166:    test.skip(!state, 'Missing .auth/admin.json — set ADMIN_EMAIL/ADMIN_PASSWORD in e2e/.env.e2e');
tests/tacho-telematics/tacho-compliance.spec.ts:186:      test.skip(!hasRow, 'No open infringements in seed data for acknowledge flow');
tests/tacho-telematics/live-cockpit.spec.ts:21:  test.skip(rowCount < 1, 'No live locations in current seed/sim state');
tests/tacho-telematics/live-cockpit.spec.ts:28:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:40:      test.skip(count < 1, 'No moving vehicles in current seed/sim state');
tests/tacho-telematics/live-cockpit.spec.ts:57:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:69:      test.skip(alarmCount < 1, 'No alarm vehicles in current fuel-theft sim state');
tests/tacho-telematics/live-cockpit.spec.ts:84:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:105:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:134:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:146:      test.skip(rowCount < 25, 'Need mock-fleet >=25 visible markers for clustering');
tests/tacho-telematics/live-cockpit.spec.ts:158:    test.skip(!state, 'Missing .auth/admin.json');
tests/tacho-telematics/live-cockpit.spec.ts:159:    test.skip(

