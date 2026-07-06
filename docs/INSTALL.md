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

Not: Eger `3001` portu doluysa frontend container baslatilamaz; portu kullanan surec kapatilip `docker compose -f docker-compose.prod.yml up -d` tekrar kosulmalidir.
