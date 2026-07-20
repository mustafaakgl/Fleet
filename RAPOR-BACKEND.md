# Backend Sağlık Denetimi — Mühendislik Raporu
*Kapsam: NestJS backend, branch faz-a, 13.07.2026 · Yöntem: kod denetimi (kanıt: dosya:satır)*

## Kısa cevap: "Tam mı?"

**Evet, tam — iskelet sağlam, şüphelenilen hiçbir modül yarım çıkmadı** (billing,
customer-portal, company-emails, invitations: hepsi gerçek ve çalışır durumda).
Auth katmanı bu aşamadaki bir ürün için güçlü: hash'li dönen refresh token,
tek kullanımlık hash'li parola sıfırlama, gerçek TOTP 2FA. SQL injection yüzeyi
neredeyse sıfır (raw SQL yok), hata yanıtları tek filtreden, kritik para/uyum
yolları (ceza, görev, DDD) transaction'lı. TODO sayısı: 3 (hepsi bilinçli).

**Ama 10 somut sorun var** — üçü doğruluk (correctness), gerisi sertleştirme.

## Sorunlar (üretim riskine göre)

### A. Doğruluk hataları (hemen)
1. **Hatırlatma cron'u tek kiracıya çalışıyor** — `reminders.service.ts:117`
   `tenantId:'default-tenant'` hardcode. İkinci müşteri geldiğinde onun TÜV/belge
   hatırlatmaları HİÇ üretilmez. Aynı fallback `fines.controller.ts:97` ve
   `checklist-templates.controller.ts:25/42`'ye de sızmış. **Multi-tenant doğruluk bugı.**
2. **Ekipman imzası atomik değil** — `equipment-issuances.service.ts:492-522`:
   önce PDF+Document yazılıyor, sonra ayrı update ile status. Arada hata = yetim
   belge + takılı tutanak. Hukuki artefakt üreten yol transaction'a alınmalı.
   (Benzer: fine'da dosya tx dışında; DDD arşiv dosyası create öncesi.)
3. **Bazı yazma endpoint'leri doğrulamasız** — raw `@Body('x')` ValidationPipe'ı
   tamamen atlıyor: documents upload (5 alan), tachograph service upload
   (**untyped tenantId!**), accident status, payroll-flag, departure payload.
   7 controller'da toplam.

### B. Sertleştirme (pilot/ölçek öncesi)
4. Dosya yüklemede magic-byte kontrolü yok (MIME client beyanı);
   `service-records.controller.ts:68` hiç filtresiz.
5. Dashboard'da sınırsız findMany fan-out (~27 sorgu, birkaçı take'siz) —
   veri büyüyünce ana ekran yavaşlar.
6. Saat 07:00'de üç ağır cron çakışıyor; distributed lock yok (çoklu instance'ta
   çift ateşleme); fleet-maintenance tüm kiracıları tek geçişte tarıyor (take:2000).
7. Prisma connection pool ayarsız (varsayılan) — 07:00 patlamasıyla riskli.
8. Device CRUD tamamen audit'siz (hard delete dahil).
9. Sessiz hata yolları: audit yazımı ve cron hataları console.warn'a yutuluyor —
   üretimde fark edilmez; metrik/alarm yok.

### C. Tutarlılık (planlı, aceleye gelmez)
10. Yanıt alan adlandırması karışık: ~10 servis ham camelCase Prisma satırı
    dönerken diğerleri snake_case'e eşliyor; ortak pagination zarfı yok.
    Ayrıca eşlenmemiş servislerde Decimal/BigInt serileştirme tuzağı.
    **Not: düzeltmesi frontend'i kırar — tek başına değil, planlı sürümle.**

## Önerilen görev paketleri

**BACKEND-1 (doğruluk, S-M):** tenant-aware reminders cron (tüm kiracı döngüsü) +
default-tenant fallback temizliği · equipment sign/fine/DDD dosya+satır atomikliği ·
7 controller'daki raw @Body'leri DTO'ya taşıma · service-records upload filtresi.

**BACKEND-2 (sertleştirme, M):** magic-byte doğrulama (file-type) tüm upload'lara ·
dashboard sorgularına sınır+tarih penceresi · cron saatlerini yay (06:50/07:00/07:10)
+ basit DB-lock idempotency · pool ayarı (connection_limit) · device audit ·
audit/cron hatalarına Prometheus sayacı+alarm.

**BACKEND-3 (tutarlılık, M-L, planlı):** ortak yanıt zarfı + adlandırma standardı —
frontend'le eşgüdümlü ayrı sürüm işi; şimdilik sadece YENİ endpoint'ler için kural.

*Genel hüküm: Bu backend, bu yaştaki ürünler için ortalamanın belirgin üstünde —
riskler dar, adresli ve iki paketle (BACKEND-1/2) kapanabilir durumda.*
