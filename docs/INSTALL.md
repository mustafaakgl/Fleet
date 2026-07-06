# INSTALL

Bu belge Docker'siz adimlarda dogrulanmis komutlari ve Docker gerektiren ama henuz bu turda calistirilmayan adimlari ayirir.

## 1) On Kosullar

- Node.js 22.x
- npm 10+
- PostgreSQL ve Redis (lokal calisma icin)
- Docker Desktop (Docker provasi icin, bu turda calistirilmadi)

## 2) Ortam Dosyalari

1. Kopyala:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```
2. Placeholder kalan alanlari doldur:
- `JWT_SECRET`
- SMTP alanlari (`SMTP_HOST`, `SMTP_FROM`, vb.)
- S3 alanlari (`S3_*`) eger `STORAGE_DRIVER=s3` kullanilacaksa
- Stripe alanlari eger billing acilacaksa

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

## 7) Uretim Benzeri Docker Kurulumu

- (dogrulanacak) Temiz volume ile kaldir:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```
- (dogrulanacak) Build + up:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
- (dogrulanacak) Saglik kontrolu:
```bash
curl -fsS http://localhost:3000/api/v1/health
```
- (dogrulanacak) Login smoke testi: UI'dan giris ve temel dashboard acilisi

Bu adimlar Docker hazir oldugunda tekrar kosulacak, `(dogrulanacak)` notlari kaldirilacak.
