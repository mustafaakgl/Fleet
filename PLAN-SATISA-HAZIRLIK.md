# Fleet — Telematik/Takograf Backlog + Satışa Hazırlık Planı

> Repo taramasına dayalı durum tespiti (06.07.2026). Her madde kod kanıtıyla doğrulandı.
> Efor tahminleri: tek kişi, tam zamanlı; i18n (de/en/tr), tenant-isolation kaydı ve doğrulama bataryası dahil.

---

## BÖLÜM 1 — Telematik & Takograf: Yapılacaklar

### Zaten bitmiş (yeniden yapma)

| Alan | Durum | Kanıt |
|---|---|---|
| Codec8/Codec8E TCP gateway + binary parser + IMEI handshake | ✅ | `telematics-gateway/teltonika-gateway.service.ts`, `codec8-parser.ts` |
| BullMQ telemetri kuyruğu + consumer + idempotency + ACK-after-enqueue | ✅ | `queue/telemetry-queue.service.ts`, `telemetry-ingest.service.ts` |
| Sürücü davranış olayları (hız/sert fren/sert kalkış tespiti) | ✅ | `telemetry-ingest.service.ts:180-218`, `telematics-trip-builder.service.ts` |
| Yakıt hırsızlığı alarmı (kontak kapalı ≥%15 düşüş, 4 saat bastırma) | ✅ | `queue/telematics-alarm.service.ts:51-76` |
| EU 561/2006 kural motoru (günlük/haftalık sürüş, mola, dinlenme, kartsız sürüş) | ✅ | `tachograph/rules/` — 7 spec dosyası + golden reference |
| DDD parser (Annex 1C) + imza doğrulama + arşiv | ✅ | `tachograph/ddd/` |
| İhlal kaydı + acknowledge endpoint'i | ✅ | `tachograph.controller.ts:115-186` |
| Frontend: 4 takograf + 2 telematik sayfası, gerçek endpoint'lere bağlı | ✅ | `frontend/app/(dashboard)/tachograph/*`, `telematics/*` |
| E2E testler (tacho-telematics, 5 spec) | ✅ | `qa-agents/e2e/tests/tacho-telematics/` |

### Kalan işler — öncelik sırasıyla

**Faz A: Satılabilir sürüm için zorunlu (~17-25 iş günü)**

| # | İş | Kapsam | Efor |
|---|---|---|---|
| T1 | DDD işlemeyi kuyruğa taşı | Upload şu an controller içinde senkron (`tachograph.service.ts:41-150`). BullMQ consumer + retry + hata kuyruğu. | 2-3 gün |
| T2 | TIS-Web/idem uzaktan DDD indirme | `tachoDownloadSchedule` tablosu var, indirme mantığı yok. Adaptör arayüzü + HTTP istemci + cron + hata/retry. En riskli kalem: dış API erişim onayı süreye dahil değil. | 5-8 gün |
| T3 | İhlal eskalasyon zinciri | Şu an sadece imza hatasında bildirim gidiyor. İhlal oluşunca: bildirim → önem bazlı eskalasyon → sürücü onayı → bordro işareti. Bußgeld modülündeki mevcut desen örnek alınabilir. | 3-4 gün |
| T4 | Davranış olaylarını bildirime bağla | `fleetDrivingEvent` yazılıyor ama notifications'a bağlı değil. Kritik olayda sevkiyata anlık bildirim + eşik ayarları. | 1-2 gün |
| T5 | Cihaz eşleştirme/provisioning | DevicesModule CRUD var; IMEI→araç eşleştirme akışı, cihaz sağlık/ping ekranı yok. | 2-3 gün |
| T6 | Tako↔GPS füzyonu (iş günü timeline) | TachoActivity + DriverLocationHistory birleşik zaman çizelgesi; tutarsızlık tespiti (DDD "sürüş" derken GPS park halinde vb.). | 3-4 gün |
| T7 | Quarantine akışı uçtan uca doğrulama | `TelemetryQuarantine` modeli var; CRC reject → quarantine → inceleme akışının tam çalıştığını doğrula, eksikse tamamla (loop journal: "CRC reject quarantine yok"). | 1 gün |

**Faz B: Sonraya bırakılabilir**

| # | İş | Efor |
|---|---|---|
| T8 | WebSocket/SSE canlı yayın (şu an polling) | 2-3 gün |
| T9 | Yakıt tüketim oranı anomalisi (hırsızlık alarmının ötesi) | 2-3 gün |
| T10 | UDP dinleyici (cihaz konfigürasyonuna göre gerekirse) | 1-2 gün |
| T11 | Üçüncü parti adaptörler: Webfleet / Samsara / Geotab | adaptör başına 4-6 gün |

**Toplam: Faz A ≈ 4-5 hafta → satılabilir takograf+telematik. Faz B ile birlikte ≈ 7-9 hafta.**

---

## BÖLÜM 2 — Satışa Hazırlık

### 2A. Eksikler (satış engelleyici → önce bunlar)

| # | Eksik | Neden engelleyici | Not |
|---|---|---|---|
| S1 | **Faturalama** (görev → Rechnung) | Müşteri parayı bu döngüden kazanıyor; ürün "operasyon + para" olmadan ERP sayılmıyor | Hiç yok |
| S2 | **ZUGFeRD/XRechnung** | 2025'ten beri Almanya'da B2B e-fatura yasal format | S1 ile birlikte |
| S3 | **DATEV dışa aktarım** | Alman muhasebecilerin standart talebi; yoksa finans onayı alınamıyor | CSV+format eşleme, görece küçük iş |
| S4 | **Bordro dışa aktarımı** | Sürücü kiralama firmaları için saat/izin/kesinti çıktısı temel ihtiyaç | WorkSession + Request verisi zaten var |
| S5 | **Bakım planlama** | Servis geçmişi var; km/tarih bazlı planlayıcı ve iş emri yok | |
| S6 | **Self-servis kayıt + abonelik** | Stripe webhook'ları var; tenant'ın uçtan uca kayıt olup ödeyebildiği akış doğrulanmalı/tamamlanmalı | `billing/` kapsam dışıydı — kapsama alınacak |

Nice-to-have (satışı engellemiyor): müşteri portalının genişletilmesi, public API + webhook'lar, benchmark raporları.

### 2B. Var ama kontrol edilecekler (satış öncesi checklist)

**Teknik doğrulama**
- [ ] Doğrulama bataryası tamamen yeşil: `tsc --noEmit`, `npm test`, `codec8-sim`, `verify-tacho-telematics`, `tenant-isolation-check`
- [ ] E2E suite (`qa-agents/e2e`) CI'da düzenli koşuyor mu; GitHub Actions pipeline'ı yeşil mi
- [ ] Yakıt kartı importu (Faz 5): loop journal "tamam" diyor, denetim stub buldu — gerçek durumu test et
- [ ] Güvenlik teyidi: refresh token rotasyonu, 2FA akışı, CORS/helmet, dosya yükleme doğrulaması gerçekten aktif mi (denetimde ✅ görünüyor, canlıda teyit)
- [ ] Gateway yük testi: kuyruk derinliği + ACK gecikmesi hedefleri (100+ cihaz senaryosu, simülatörle)

**Operasyon**
- [ ] `.env.example` eksiksiz mi; secrets yönetimi ve yedekleme/geri dönüş stratejisi yazılı mı
- [ ] `docker-compose.prod.yml` ile temiz kurulum provası (boş sunucuda)
- [ ] Sentry DSN + Prometheus alarm kuralları prod'da tanımlı mı; basit bir runbook var mı
- [ ] Veri saklama/purge cron'ları prod ayarlarıyla test edildi mi

**İçerik & yasal**
- [ ] AGB, Impressum, Datenschutzerklärung, AVV/DPA sayfaları gerçek içerik mi, placeholder mı
- [ ] i18n eksik anahtar taraması: de/en/tr üç dilde de boş/İngilizce kalmış metin var mı (özellikle yeni tako/telematik ekranları)
- [ ] Almanca metinlerin ana dil kalitesi kontrolü (satış demosunda ilk göze çarpan şey)

**Satış altyapısı**
- [ ] Demo tenant: gerçekçi seed verisiyle (sürücüler, araçlar, ihlaller, cezalar) her demo öncesi sıfırlanabilir ortam
- [ ] Swagger/API dokümantasyonu yayında mı (kurumsal BT değerlendirmeleri soruyor)
- [ ] Kısa kullanıcı kılavuzu / onboarding dokümanı (ofis + sürücü uygulaması)
- [ ] Fiyatlandırma sayfası ile gerçek paket/limitlerin tutarlılığı

### Önerilen sıralama

1. **Hafta 1-5:** Bölüm 1 Faz A (takograf+telematik satılabilir sürüm) — katalogdaki "çok yakında" vaadini kapatır
2. **Hafta 5-6:** 2B checklist'i (paralelde başlanabilir; çoğu doğrulama işi)
3. **Hafta 6-12:** Para döngüsü: S1+S2 (fatura/e-fatura) → S3 (DATEV) → S4 (bordro)
4. **Sonrası:** S5-S6, Faz B kalemleri, üçüncü parti adaptörler
