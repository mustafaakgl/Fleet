# CLAUDE.md — Fleet Repo Kuralları (her oturumda geçerli)

## Proje
Multi-tenant Alman filo yönetimi SaaS. Backend: NestJS 11 + Prisma 6 + PostgreSQL 16 + BullMQ/Redis.
Frontend: Next.js 15 App Router + Tailwind 4 + shadcn/Radix + recharts. i18n: de/en/tr.

## MUTLAK KURALLAR (ihlali = işi durdur, bana sor)
1. **`as any` YASAK.** Özellikle Prisma erişiminde. Tip hatası varsa sebebi çözülür, susturulmaz.
2. **Her yeni Prisma modeli** aynı commit içinde: (a) migration alır, (b) `src/tenant/tenant-scoped-models.ts`'e
   kaydedilir, (c) `scripts/tenant-isolation-check.ts` kapsamına girer. Üçünden biri eksikse iş bitmemiştir.
3. **Kırmızıda commit yok.** Doğrulama bataryası tamamen yeşil olmadan commit atma, sonraki göreve geçme.
4. Mevcut desenleri KULLAN, yenisini icat etme: guard/decorator'lar (`@Roles`, `RequiresWrite`),
   tenant filtresi, shadcn bileşenleri, mevcut sayfalama/filtre deseni, recharts.
5. Migration SQL'de FK hedefleri: `Tenant`, `Vehicle`, `Driver` tabloları @@map'sizdir → `REFERENCES "Tenant"` vb.
6. Silme işlemleri: DDD arşivi immutable — silme endpoint'i yazma.
7. Yeni her kullanıcıya görünen metin de/en/tr locale dosyalarına eklenir (Almanca ana dil kalitesinde).

## DOĞRULAMA BATARYASI (her değişiklik setinden sonra sırayla çalıştır)
```
cd backend && npx tsc -p tsconfig.json --noEmit
npm test
node scripts/codec8-sim.mjs --scenario normal --seed 42   # varsa
node scripts/verify-tacho-telematics.mjs                   # varsa
npx ts-node scripts/tenant-isolation-check.ts
```
Herhangi biri kırmızıysa: düzelt, baştan başla. Bataryayı asla atlama, "muhtemelen geçer" deme.

## ÇALIŞMA DİSİPLİNİ
- Her görevden önce kısa plan yaz, onayımı bekleme ama plana sadık kal; kapsam dışına çıkma.
- Her iterasyonu `PROMPTS/logs/loop_journal.md`'ye tek satır ekle: `[tarih] [milestone] [adım] [sonuç/hata özeti]`
- Aynı hatada 3 kez dönersen DUR, durumu özetle ve bana sor.
- Commit mesajları: `faz0: <ne yapıldı>` formatında, milestone başına küçük ve incelenebilir commitler.

## KAPSAM SINIRI
Şu klasörlere DOKUNMA (bu loop'un kapsamı dışı): , `customer-portal/`, `qa-agents/` (e2e testleri hariç), ile ilgili her şey. Şüphedeysen sor.

