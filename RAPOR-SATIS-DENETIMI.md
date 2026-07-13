# Operion (Fleet) — Satışa Hazırlık Denetimi
*6 persona analizi · Repo durumu: branch faz-a, commit 16974f0, 13.07.2026 · Kaynak: kod denetimi + 5 haftalık geliştirme geçmişi*

---

## 1. Yönetici Özeti

**Satışa hazırlık skoru: 62/100.** Alt kırılım: Demo hazırlığı **85** (kurulum kanıtlı,
akışlar çalışıyor, demo senaryosu güçlü) · Pilot hazırlığı **72** (yazılım hazır,
cihaz sahada kanıtsız, mobil store'da değil) · **Sözleşme kapatma hazırlığı 48**
(fatura/DATEV yok, referans yok, retention/GDPR boşluğu var). Skorun anlamı:
bu ürün bugün gösterilebilir ve pilota verilebilir; ama Alman KOBİ'sinden imza
almak için eksik olan şeyler özellik değil, ticari altyapı.

**En kritik 5 bulgu:**

1. **Para döngüsü yok (P0):** Görev→fatura (ZUGFeRD), DATEV ihracı, bordro çıktısı —
   üçü de sıfır. Kod tabanında tek satır yok (doğrulandı). Hedef segmentin satın alma
   kararını bloke eden tek büyük eksik.
2. **Test bütünlüğü yanılsaması (P0):** 56 spec dosyası var ama `npm test` elle yazılmış
   48'lik listeyi koşuyor — **8 spec sessizce hiç koşulmuyor** (aralarında
   `tachograph-queue.service.spec.ts` gibi kritik olanlar var). Üstelik bu sorunun
   düzeltildiği daha önce raporlanmıştı — yapılmamış. "Batarya yeşil" iddiasının
   güvenilirliği bu kapanmadan tam değil.
3. **CI fiilen çalışmıyor (P0):** `.github/workflows/ci.yml` düzgün kurulmuş ama sadece
   main/master/develop dallarında tetikleniyor; tüm iş `faz-a`'da — yani CI bugüne kadar
   hiçbir commit'i denetlemedi.
4. **Konum verisi sonsuza kadar birikir (P0, DSGVO riski):** `DriverLocationHistory` ve
   telemetri tabloları için zaman bazlı silme/arşivleme YOK (sadece sürücü bazlı GDPR
   anonimleştirme var). "90 gün saklama" pazarlama vaadiyle çelişiyor; hem hukuki hem
   performans riski.
5. **Pilot ön şartları açık (P1):** T5 (cihaz eşleştirme) yapılmadı — devices modülü
   CRUD'da kaldı; mobil uygulama store'a çıkmamış (eas.json bile yok); cihaz hiç gerçek
   sahada denenmedi.

**Güçlü taraf netliği:** Uyumluluk paketi (takograf 561/2006 motoru + 28/90 takibi +
Führerscheinkontrolle + Bußgeld + ekipman tutanağı + DSGVO mimarisi) segmentte rakipsiz
genişlikte; kurulum 30 dakikada tekrarlanabilir ve belgelenmiş; sürücü portalı offline
kuyruklu, imza tuvalli, gerçek anlamda saha kalitesinde.

---

## 2. Persona Bulguları

### 2.1 Senior QA / Test Engineer

**Bulgular:**
- 56 backend spec, ama test script'i elle liste → 8 spec koşulmuyor (messenger,
  telematics-downsample, motion-state, trail-sampling, 3× fleet-core util,
  **tachograph-queue**). Otomatik keşif (`run-tests.mjs`) vaat edildi, yok.
- E2E: route-sweep (navigation'dan türetilmiş — iyi desen), RBAC, smoke, 6 tacho spec'i
  var. **Equipment ve work-session için ayrı e2e dosyası yok** (journal "yeşil" diyor,
  dosya yok — muhtemelen smoke içine gömüldü, izlenebilir değil).
- Tekrarlayan kırmızı: `codec8-sim` 5027 kapalıyken `verify-tacho` betiği **asılı
  kalıyor** (fail-fast yok) — batarya bazen sonsuz bekliyor.
- Yük testi: `k6-smoke.js` CI'da "dosya var mı" diye assert ediliyor ama hiçbir yerde
  koşulmuyor. 100+ cihaz/1000+ konum-nokta senaryosu hiç denenmedi.
- Edge-case boşlukları: zaman dilimi (cihaz UTC vs Berlin lokal — gün sınırı testi yok),
  çakışan handover, DDD dosyasında gelecek tarihli aktivite.

**Etki:** "Testler yeşil" cümlesi bugün kısmen doğru; müşteri önünde sürpriz riski.

**Öneriler (efor):** Spec otomatik keşfi + 8 spec'in gerçek durumu (S) ·
verify-tacho'ya bağlantı timeout'u (S) · equipment+work-session ayrı e2e (S) ·
k6 ile 100 sanal cihaz yük provası (M) · saat dilimi test paketi (M).

### 2.2 Senior Software Engineer / Architect

**Bulgular:**
- Mimari sağlam: modüler NestJS, tenant izolasyonu proxy+extension çift katman
  (regresyon testli), kuyruk soyutlaması (Redis/inline), gateway ayrı süreç.
- Güvenlik: prod env doğrulaması örnek düzeyde iyi (placeholder secret'ları reddediyor,
  METRICS_TOKEN/CORS zorunlu). Ancak **Swagger kurulu değil** (dependency var, setup
  yok) ve genel public API/webhook yok — entegrasyon vaadi verilemez.
- İndeksler: sıcak tablolar (location history, trips, notifications, tacho) doğru
  indeksli. **TelemetryProcessedRecord sadece createdAt** — dedupe tablosu büyüdükçe
  claim maliyeti izlenmeli.
- **Retention yok:** telemetri/konum tabloları purge'süz. 50 araçlık tek müşteri bile
  yılda ~50-100M konum satırı üretir; 2. yılda sorgu ve yedek maliyeti patlar.
- Migration tarih disiplini üç kez bozuldu (biri gerçek bug'dı); önleyici kural hâlâ
  sadece sözlü.
- Sentry lazy-init + prom-client metrikleri iyi; **alarm kuralları yok** (metrik var,
  eşik/uyarı yok), backup script var, **restore hiç denenmedi**.

**Etki:** 6-12 ay ölçeğinde teknik borç yönetilebilir; retention ve CI boşluğu ise
müşteri verisiyle buluştuğu gün gerçek risk.

**Öneriler:** Retention cron (telemetri 90g, location 90g, agregat trip verisi kalıcı)
(M) · CI trigger'ına faz-a/feature dalları (S) · Swagger setup + docs endpoint (S) ·
migration tarih kontrolünü pre-commit/CI'a al (S) · restore tatbikatı (S).

### 2.3 Senior UI/UX Designer

**Bulgular:**
- Global tutarlılık turu + i18n-check kapısı + verify-dist izolasyonu meyve vermiş:
  dashboard'da hardcode metin taraması temiz, route sweep tüm sayfaların açıldığını
  garanti ediyor.
- Messenger, dashboard (3 rol), Einsatzplan, login, driver portal — hepsi bu dönemde
  elden geçti; kalan bilinen borç: Einsatzplan sadeleştirme turu (UX-EINSATZPLAN-2
  koşulmadı: üç etkileşimli atama, 7 KPI kartı, adres bloğu), Notifications yenilemesi
  (UX-NOTIFICATIONS verildi mi belirsiz — ham ID önizleme sorunu kritikti).
- Erişilebilirlik hiç denetlenmedi (kontrast/klavye/aria) — demo riski değil ama
  kurumsal RFP'lerde sorulur.
- Mobil: driver web portalı telefonda iyi; **native app store'da yok** → "uygulama
  marketten indirilir" beklentisi karşılanmıyor, pilotta tarayıcı+PWA ile idare edilir.

**Etki:** Demo görünümü artık satılabilir seviyede; kalan işler cila, biri hariç:
bildirim merkezindeki ham ID'ler demo tenant'ında hâlâ görünüyorsa utandırır.

**Öneriler:** UX-NOTIFICATIONS durumunu teyit et/koştur (S) · Einsatzplan-2 (S) ·
demo öncesi seed reset komutu rutini (S) · erişilebilirlik hızlı taraması (M).

### 2.4 ERP / İş Analisti

**Bulgular:**
- Uyumluluk süreçleri segment standardının ÜZERİNDE: 28/90 kanıtlı kapanış, ihlal
  eskalasyonu, ekipman tutanağı (yeni ve ayırt edici), mesai kaydı artık bordro
  kalitesinde (orijinal+düzeltme ayrımı — denetim doğru tasarım).
- Standart beklenen ama eksik: **fatura/ZUGFeRD, DATEV, bordro ihracı** (üçü de yok,
  doğrulandı) · bakım iş emri/maliyet takibi zayıf (servis geçmişi var, planlayıcı ve
  maliyet merkezi yok) · amortisman/TCO raporu yok · genel rapor ihracı CSV ile sınırlı
  (PDF yönetim raporu yok).
- Mevzuat: DSGVO mimaride güçlü AMA (a) konum retention'ı uygulanmıyor (yukarıda),
  (b) AVV/DPA şablonu ve VVT (işleme envanteri) dokümanı repoda yok — kurumsal müşteri
  ilk toplantıda ister.
- İş akışı mantık boşluğu: ekipman tutanağı iade akışı yok (çıkan işçiden ekipman geri
  alma) — v2 doğal adayı.

**Etki:** Ürün "uyumluluk çözer" vaadini fazlasıyla karşılıyor; "işletmemi yönetir"
vaadinin para tarafı boş.

**Öneriler:** Fatura v1: Einsatz→ZUGFeRD PDF + numaralandırma + DATEV CSV (L) ·
bordro ihracı: mesai+izin+kesinti CSV (M) · AVV/VVT doküman paketi (S, hukukçu
onayıyla) · ekipman iade akışı (S, v2).

### 2.5 Project Manager

**"Satışa hazır" tanımı (Definition of Done):**
Demo hazır ✅ (bugün) → Pilot hazır = T5 + cihaz masa testi + mobil dağıtım kararı
(PWA yeter/store) + retention cron → Satış hazır = pilot referansı + fatura v1 +
DATEV + AVV paketi + CI aktif + destek runbook'u.

**Riskler ve azaltma:**
- *Tek geliştirici + AI loop güven açığı* (test onarımı örneği): her loop raporunda
  "kanıt komutu" zorunlu kılınmalı; haftada bir bağımsız denetim turu (bu rapor gibi).
- *Cihaz tedarik/saha riski:* FMC150 masa testi pilottan 2 hafta önce; IO eşleme
  doğrulaması görevde.
- *Tek kişiye bağımlılık:* runbook'lar iyi gidiyor; destek süreci (kim, hangi SLA)
  ilk sözleşmeden önce yazılmalı.

**Milestone önerisi:** M1 (bu hafta): P0-teknik dördü (test keşfi, CI trigger,
verify-tacho timeout, retention) — hepsi S/M. M2 (2 hafta): T5 + masa testi + demo
rutini + UAT-H (equipment). M3 (4-8 hafta): fatura v1 + DATEV + bordro CSV + AVV.
M4: pilot → referans → fiyat listesiyle aktif satış.

### 2.6 Product / Go-to-Market Danışmanı

**Bulgular:**
- Kurulum hikâyesi güçlü (INSTALL.md 9 bölüm, gateway dahil; env doğrulaması müşteriyi
  yanlış konfigürasyondan koruyor) — ilk kurulumda yaşanacak sorunların çoğu bu dönemde
  bizzat yaşanıp runbook'a işlendi. Kalan kurulum riski: SMTP zorunluluğu (müşteride
  SMTP yoksa prod açılmaz — bilinçli ama onboarding'de sürpriz olmasın).
- Demo cephanesi hazır: canlı harita simülasyonu (codec8-sim), DDD yükle→ihlal düşür,
  ekipman imza akışı, üç dilli messenger — rakipte olmayan sahneler.
- Eksikler: fiyat listesi/paket tanımı ürünle eşleşmiş değil (pricing sayfası var,
  gerçek limit/paket bağlantısı doğrulanmadı) · onboarding kılavuzu (müşteri admin'i
  için ilk 5 adım) yok · demo tenant reset rutini elle.
- 100 görüşmelik pipeline en değerli varlık; ama itiraz istatistiği sistematik
  toplanmıyor (hangi eksik kaç kez söylendi → yol haritası oylaması).

**Öneriler:** Pilot teklif paketi (1 sayfa + fiyat) (S) · onboarding kılavuzu (S) ·
pipeline tablosu + itiraz sayacı (S) · "demo modu" tek komut (S).

---

## 3. Birleştirilmiş Aksiyon Listesi

| # | Aksiyon | Öncelik | Efor | Bağımlılık |
|---|---------|---------|------|------------|
| 1 | Test otomatik keşfi + 8 kayıp spec'in gerçek durumu | **P0** | S | — |
| 2 | CI trigger'a faz-a/** ekle; ilk yeşil koşuyu kanıtla | **P0** | S | — |
| 3 | verify-tacho'ya timeout/fail-fast | **P0** | S | — |
| 4 | Telemetri+konum retention cron (90g) + arşiv kararı | **P0** | M | — |
| 5 | Fatura v1: Einsatz→ZUGFeRD + numara + DATEV CSV | **P0** | L | — |
| 6 | T5 cihaz eşleştirme + FMC150 masa testi | **P1** | M | cihaz siparişi |
| 7 | Bordro ihracı (mesai+izin CSV) | **P1** | M | DRIVER-3 ✅ |
| 8 | AVV/DPA + VVT doküman paketi | **P1** | S | hukuk onayı |
| 9 | UX-NOTIFICATIONS teyidi + Einsatzplan-2 | **P1** | S | — |
| 10 | Equipment+work-session ayrı e2e + UAT-H bloğu | **P1** | S | — |
| 11 | Swagger setup + temel API dokümanı | **P1** | S | — |
| 12 | k6 yük provası (100 cihaz) + alarm eşikleri | **P1** | M | 3 |
| 13 | Backup restore tatbikatı | **P1** | S | — |
| 14 | Onboarding kılavuzu + pilot teklif sayfası + demo rutini | **P1** | S | — |
| 15 | Mobil: EAS konfigürasyonu + iç dağıtım (TestFlight) | **P2** | M | Apple/Google hesap |
| 16 | T4 sürüş olayı bildirimleri (crash+speeding) | **P2** | S | — |
| 17 | T6 tako↔GPS füzyon, T7 quarantine ops ekranı | **P2** | M | — |
| 18 | Ekipman iade akışı, bakım planlayıcı, PDF yönetim raporu | **P2** | M-L | — |

## 4. Satış Öncesi Son Kontrol Listesi

- [ ] `npm test` TÜM spec'leri koşuyor (otomatik keşif) ve yeşil
- [ ] CI, aktif dalda her push'ta koşuyor ve yeşil
- [ ] Temiz kurulum provası son kod ile tekrarlandı (migration sırası dahil)
- [ ] Retention cron'u canlıda çalışıyor (konum verisi 90 günde siliniyor — kanıt)
- [ ] Demo tenant reset edildi (test kirliliği yok: "driver-smoke-..." görünmüyor)
- [ ] Demo senaryosu prova edildi: login→Einsatzplan→DDD→ihlal→ekipman imza→canlı harita
- [ ] UAT A-D blokları + H (equipment) güncel kodla yeşil
- [ ] Fiyat/paket sayfası gerçek ürün limitleriyle eşleşiyor
- [ ] AVV/DPA PDF'i el altında; "DSGVO nasıl?" sorusunun yazılı cevabı hazır
- [ ] Pilot teklif sayfası basılı/PDF
- [ ] Destek kanalı tanımlı (e-posta + yanıt hedefi)
- [ ] Yedek + geri dönüş bir kez uçtan uca denendi

## 5. Denetçinin Soruları (varsayım yapmadım, cevap gerekli)

1. **Fiyatlandırma kararı verildi mi?** (Paket yapısı ve araç başına fiyat — pilot
   teklifini buna göre yazacağız.)
2. **100 görüşmelik pipeline'dan pilot adayı seçildi mi?** İlk pilotun tarihi, M2/M3
   sıralamasını belirler (cihazlı mı cihazsız mı başlıyoruz?).
3. **Mobil dağıtım tercihi:** Pilot PWA ile mi başlasın (bugün mümkün), yoksa store
   yayını beklensin mi (hesap + 2-4 hafta)?
4. **Destek modeli:** İlk müşterilerde desteği kim verecek, hangi saatlerde?
   (Sözleşme ve fiyata girecek.)
5. **AVV/hukuk:** Çalıştığınız bir hukukçu var mı, yoksa şablon+onay yolu mu
   izlenecek?
