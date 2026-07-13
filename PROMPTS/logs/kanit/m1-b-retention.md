# M1-B Kanit Logu

## Commit

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && git rev-parse --short HEAD
```

Ham ciktı:
```text
828fb47
```

## Test Bataryasi

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
# duration_ms 6093.461042
[run-tests] summary spec_files=57 tests=214 pass=214 fail=0
```

## Manuel Retention Job

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend
node -r ts-node/register/transpile-only -e "const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('./src/app.module'); const { QueueService } = require('./src/queue/queue.service'); (async()=>{const app = await NestFactory.createApplicationContext(AppModule,{logger:['log','error','warn']}); await app.get(QueueService).enqueue('privacy.retention'); await app.close();})().catch((error)=>{console.error(error); process.exit(1);});"
```

Ham ciktı:
```text
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [PrivacyService] Retention purge [driver_location_history]: deleted=0, cutoff=2026-04-14T08:32:35.018Z, batches=0
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [PrivacyService] Retention purge [telemetry_quarantine]: deleted=0, cutoff=2026-06-13T08:32:35.018Z, batches=0
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [PrivacyService] Retention purge [telemetry_processed_records]: deleted=0, cutoff=2026-06-13T08:32:35.018Z, batches=0
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [PrivacyService] Retention purge [fleet_driving_events]: deleted=0, cutoff=2026-01-14T08:32:35.018Z, batches=0
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [JobBootstrapService] Retention [telemetry]: location=0, telemetry=0, driving_events=0, quarantine=0, total=0
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [JobBootstrapService] Retention [audit_logs]: deleted=0, cutoff=2024-07-13T08:32:35.062Z
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [JobBootstrapService] Retention [notifications]: deleted=0, cutoff=2024-07-13T08:32:35.066Z
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [JobBootstrapService] Retention [messages]: deleted=0, cutoff=2024-07-13T08:32:35.068Z
[Nest] 55180  - 07/13/2026, 11:32:35 AM     LOG [JobBootstrapService] Retention [expired_documents]: deleted=0, cutoff=2026-06-13T08:32:35.072Z
```

## Migration Tail

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet/backend && find prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort | tail -1
```

Ham ciktı:
```text
prisma/migrations/20260719103000_equipment_issuance_rev3_form_pdf
```

## Push

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && git push origin faz-a
```

Ham ciktı:
```text
To https://github.com/mustafaakgl/Fleet
   ae66be7..828fb47  faz-a -> faz-a
```

## CI Run Sorgusu

Komut:
```bash
cd /Users/mustafaakgul/Projects/Fleet && gh run list --workflow ci.yml --branch faz-a --limit 5 --json databaseId,displayTitle,headSha,status,conclusion,createdAt,event,url
```

Ham ciktı:
```text
To get started with GitHub CLI, please run:  gh auth login
Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.
```