# INSTALL

Bu belge KURULUM-1 provasi sirasinda gercekten kosulan komutlarla guncellenmistir.

## 1) On Kosullar

- Node.js 22.x
- npm 10+
- PostgreSQL ve Redis (lokal calisma icin)
- Docker Desktop

## 2) Ortam Dosyalari

1. Kopyala:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```
2. Production validation icin asagidaki alanlar bos olmamali:
- `JWT_SECRET`
- SMTP alanlari (`SMTP_ENABLED=true`, `SMTP_HOST`, `SMTP_FROM`)
- S3 alanlari (`STORAGE_DRIVER=s3`, `S3_*`)
- `FRONTEND_URL` localhost olmamali
- `DATA_CONTROLLER_NAME` ve `PRIVACY_CONTACT_EMAIL` gercek deger olmali
- `TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY` bos olmamali

3. Uretim icin benzersiz secret uretin (placeholder deger kullanmayin):
```bash
JWT_SECRET="$(openssl rand -hex 32)"
TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```
Not: Bu iki deger her ortam (staging/production) icin farkli olmali ve `.env.example` icindeki varsayilanlarla ayni olmamalidir.

## 2.1) Retention Politikasi

Varsayilan retention degerleri backend `.env` uzerinden yonetilir:

- `DRIVER_LOCATION_HISTORY_RETENTION_DAYS=90`
- `TELEMETRY_PROCESSED_RECORD_RETENTION_DAYS=30`
- `FLEET_DRIVING_EVENT_RETENTION_DAYS=180`
- `TELEMETRY_QUARANTINE_RETENTION_DAYS=30`
- `RETENTION_BATCH_SIZE=10000`

Silinmeyen/veri is gerekcesiyle saklanan tablolar:

- `FleetTrip` silinmez (is/verimlilik agregati)
- `TachoActivity` silinmez
- `DddFile` silinmez

Musteriye verilecek kisa yanit:

- Konum gecmisi 90 gun saklanir.
- Telemetri dedupe ve quarantine kayitlari 30 gun saklanir.
- Surus olaylari 180 gun saklanir.
- Is kaydi olan FleetTrip ve yasal arsiv niteligindeki tachograph kayitlari bu purge kapsaminda silinmez.

## 3) Bagimliliklar

```bash
npm --prefix backend install
npm --prefix frontend install
```

## 4) Veritabani Migration Durumu

Asagidaki adim dogrulandi:
```bash
cd backend
npx prisma migrate status
```
Beklenen: `Database schema is up to date!`

Not: `add_ddd_generation_signature` migration klasoru kronolojik olarak
`20260702100257_add_ddd_generation_signature` adina alinmistir.

## 5) Frontend Derleme Dogrulamasi

Asagidaki adimlar dogrulandi:
```bash
cd frontend
npx tsc --noEmit
npm run build
```
Beklenen:
- `npx tsc --noEmit` hatasiz tamamlanir
- `next build` basarili tamamlanir (warning olabilir)

## 6) Backend Dogrulama Bataryasi

Asagidaki batarya Docker olmadan lokalde calistirilabilir:
```bash
cd backend
npx tsc -p tsconfig.json --noEmit
npm test
node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs
npx ts-node --transpile-only scripts/tenant-isolation-check.ts
```

Retention job'ini manuel kosup log gormek icin:
```bash
cd backend
node -r ts-node/register/transpile-only -e "const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('./src/app.module'); const { QueueService } = require('./src/queue/queue.service'); (async()=>{const app = await NestFactory.createApplicationContext(AppModule); await app.get(QueueService).enqueue('privacy.retention'); await app.close();})().catch((error)=>{console.error(error); process.exit(1);});"
```

## 7) Uretim Benzeri Docker Kurulumu (Dogrulandi)

1. Temiz volume ile kaldir:
```bash
docker compose -f docker-compose.prod.yml down -v
```
2. Build + up:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
3. Servis durumunu kontrol et:
```bash
docker compose -f docker-compose.prod.yml ps
```
4. API saglik kontrolu:
```bash
curl -sS http://localhost:3000/api/v1/health
```
Beklenen: HTTP 200 ve `{"status":"ok",...}`

5. Ilk kurulum seed adimi (container icinden):
```bash
docker compose -f docker-compose.prod.yml exec -T backend sh -lc \
"NODE_ENV=development SEED_SILENT=true \
SEED_ADMIN_PASSWORD=admin123 SEED_BOSS_PASSWORD=boss123 \
SEED_ACCOUNTING_PASSWORD=accounting123 SEED_OFFICE_PASSWORD=office123 \
SEED_DRIVER_PASSWORD=driver123 SEED_DHL_CUSTOMER_PASSWORD=dhl123 \
SEED_AMAZON_CUSTOMER_PASSWORD=amazon123 npx ts-node --transpile-only prisma/seed.ts"
```
Beklenen: `Fleet seed completed successfully.`

6. Login smoke testi (API):
```bash
curl -sS -H 'Content-Type: application/json' \
	-d '{"email":"admin@fleet.com","password":"admin123"}' \
	http://localhost:3000/api/v1/auth/login
```
Beklenen: HTTP 200 ve `accessToken` donmesi.

## 8) Gateway Uctan Uca Dogrulama (Codec8)

Bu adim docker stack icinde telematik gateway'in gercekten paket alip API tarafina yansittigini kanitlar.

1. Stack'i kaldir:
```bash
docker compose -f docker-compose.prod.yml up -d
```

2. Gateway dinleme dogrulamasi:
```bash
docker compose -f docker-compose.prod.yml logs gateway --tail 120
```
Beklenen log satiri:
`Teltonika Codec8 gateway listening on 0.0.0.0:5027`

3. Device binding'i compose DB icinde dogrula (IMEI red durumunda):
```bash
docker compose -f docker-compose.prod.yml exec gateway node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); (async()=>{const rows=await p.device.findMany({where:{imei:"359339080000101"},select:{tenantId:true,vehicleId:true}}); console.log(rows); await p.$disconnect();})()'
```
Not: Gateway ayni IMEI icin tam 1 kayit ve `vehicleId` dolu bekler. Kayit yoksa veya birden fazla ise login reject olur.

4. Simulasyon + ACK kontrolu:
```bash
npm run verify:gateway
```
Bu komut `backend/scripts/codec8-sim.mjs --scenario normal --seed 42` kosar ve JSON ozetinde `ackRecords > 0` oldugunu dogrular.

5. Canli endpoint kaniti:
```bash
TOKEN=$(curl -sS -X POST http://localhost:3000/api/v1/auth/login \
	-H 'Content-Type: application/json' \
	-d '{"email":"admin@fleet.com","password":"Admin123!"}' \
	| node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); process.stdout.write(j.accessToken||"");})')

curl -sS 'http://localhost:3000/api/v1/tracking/live?includeOffline=true&staleAfterSec=300' \
	-H "Authorization: Bearer $TOKEN"
```
Beklenen: HTTP 200 ve en az bir arac/surucu satiri.

Takilinan tipik kok neden: hostta seedlenen DB ile compose icindeki DB farkli oldugunda gateway `imei rejected` verir; kayit dogrudan compose DB'de olmalidir.

## 9) Kurulum Sonrasi Gorsel Kontrol (Zorunlu)

Temiz prod compose acildiktan sonra su kontroller yapilmadan kurulum tamamlandi sayilmaz:

1. Tarayicida su sayfalari tek tek acin:
- `http://localhost:3001/` (landing)
- `http://localhost:3001/login` (login)
- `http://localhost:3001/dashboard` (login sonrasi dashboard)

2. Her uc sayfada da su durumlari dogrulayin:
- Sayfa "ciplak HTML" degil, Tailwind stilleri tam yuklu.
- Etkilesimli JS bilesenleri (menu, buton, sayac gibi) calisiyor.

3. Gercek static asset URL'ini HTML'den alip HTTP durumunu kontrol edin:
```bash
CSS_PATH=$(curl -s http://localhost:3001/login | rg -o '/_next/static/[^"\) ]+\.css' -m 1 | head -n 1)
curl -I "http://localhost:3001${CSS_PATH}"
```
Beklenen: `HTTP/1.1 200 OK`

4. JS chunk icin de ayni kontrolu yapin:
```bash
JS_PATH=$(curl -s http://localhost:3001/login | rg -o '/_next/static/chunks/[^"\) ]+\.js' -m 1 | head -n 1)
curl -I "http://localhost:3001${JS_PATH}"
```
Beklenen: `HTTP/1.1 200 OK`

Not: Eger `3001` portu doluysa frontend container baslatilamaz; portu kullanan surec kapatilip `docker compose -f docker-compose.prod.yml up -d` tekrar kosulmalidir.
