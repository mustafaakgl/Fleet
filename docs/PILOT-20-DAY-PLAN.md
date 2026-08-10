# Fleet / Operion — 20 Günlük Pilot Planı

**Başlangıç:** 10.08.2026 · **Hedef GO/NO-GO:** 29.08.2026
**Dayanak:** `docs/PILOT-READINESS-REPORT.md` (10.08.2026 denetimi)

## Plandaki sapma ve gerekçesi

Önerilen taslakta saha testi 10–12. günlerdeydi. **Değiştirildi.** Denetim, **gerçek** telematik
cihaz sayısının **0** olduğunu gösterdi (hat yalnızca simülatörle doğrulandı); cihaz tedariki + montaj + IMEI eşleştirme, yazılım işi değil
**tedarik süresi** işidir ve 10. günde başlarsa saha testine yer kalmaz. Bu yüzden:

- **Cihaz tedariki 1. günde başlar** ve arka planda paralel ilerler (T1).
- Veri provisioning öne alındı (Gün 2–5): sürücüler giriş yapamadan hiçbir E2E gerçek değildir.
- Saha testi 11–14. güne genişletildi: bir tam iş günü + tekrar denemesi için pay.
- Üretim/güvenlik 15–17'ye kaydı; UX + eğitim 17–18'de sıkıştırıldı, çünkü UX bulgularının
  çoğu veri geldikten sonra görünür hale gelir.

**Roller:** `DEV` = geliştirme · `OPS` = altyapı/DevOps · `PILOT` = pilot şirket irtibatı ·
`QA` = doğrulama · `LEGAL` = hukuk/İK

**Durum kodları:** `todo` · `wip` · `done` · `blocked`

---

## Gün 1–2 — Kapsam dondurma + engelleyici düzeltmeler

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 1 | Kapsam dondurma yazılı olarak duyurulur; §14 kalemleri backlog'a taşınır | DEV | Kapsam dışı listesi ekipçe onaylı | — | Kapsam kayması | todo |
| 1 | **T1: Telematik cihaz siparişi** (en az 2 adet) ve montaj randevusu | OPS+PILOT | Sipariş onayı + tahmini teslim tarihi yazılı | — | **Tedarik gecikmesi tüm planı kaydırır** | todo |
| 1 | ~~**P0-4:** `BreakCandidate` → `tenant-isolation-check.ts`~~ | DEV | Kontrol yeşil, çıktıda `BreakCandidate` A=2 B=0 | — | — | **done** (10.08) |
| 2 | Commit'lenmemiş 63 dosya gözden geçirilip parçalı commit'lenir | DEV | `git status` temiz, batarya yeşil | P0-4 | Orta — büyük diff | todo |
| 2 | Pilot şirketten **gerçek veri listesi** istenir (sürücü, araç, müşteri) | PILOT | CSV/liste elde | — | Şirket gecikmesi | todo |
| 2 | Bu rapordaki P0/P1 listesi ekiple gözden geçirilir, sahipler atanır | DEV+OPS | Her P0'ın sahibi ve tarihi var | — | Düşük | todo |

---

## Gün 3–6 — Pilot verisi, kullanıcı ve rol temizliği

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 3 | **Ayrı pilot kiracısı** açılır; QA kiracıları pilot DB'sinden ayrılır | OPS | Pilot kiracısında `qa-*` kaydı 0 | — | Orta | todo |
| 3 | `qa-crud-*` kullanıcıları ve demo artıkları temizlenir | DEV | Aktif kullanıcıların tamamı gerçek kişi | Gün 3 kiracı | Düşük | todo |
| 4 | Gerçek **araç filosu** yüklenir | OPS+PILOT | Araç sayısı pilot filosuyla birebir | Gün 2 listesi | Orta | todo |
| 4 | Gerçek **müşteri/firma** kayıtları yüklenir | OPS | Pilotun günlük müşterileri sistemde | Gün 2 listesi | Düşük | todo |
| 5 | **Sürücü hesapları + `driver.userId` eşlemesi** | DEV+OPS | Pilot sürücülerinin **%100'ü** giriş yapabiliyor | Gün 2 listesi | **Yüksek — P0-1** | todo |
| 5 | Sürücü davet e-postaları gönderilir | OPS | Her sürücü davet aldı ve en az 1'i giriş yaptı | Gün 5 hesaplar, e-posta altyapısı | Yüksek | todo |
| 6 | **Dijital ehliyet kontrolleri** girilir | PILOT+OPS | Halterhaftung uyarısı olmadan iş oluşturulabiliyor | Gün 5 | Orta — **P0-8** | todo |
| 6 | Rol-yetki matrisi gerçek kullanıcılarla doğrulanır | QA | Her rol yalnızca görmesi gerekeni görüyor | Gün 3–5 | Orta | todo |

---

## Gün 7–10 — Ofis / Sürücü / Patron uçtan uca

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 7 | **Ofis E2E**: gerçek veriyle 5 iş oluştur/ata/güncelle/iptal | QA+PILOT | 5/5 başarılı, sürücüde doğru görünüyor | Gün 3–6 | Orta | todo |
| 7 | Einsatzplan gerçek günle doldurulur ve gözden geçirilir | PILOT | Bir günün planı ekranda eksiksiz | Gün 7 işler | Orta | todo |
| 8 | **Sürücü E2E**: gerçek sürücü, gerçek telefon, tam vardiya | QA+PILOT | Kalkış kontrolü → mesai → mola → bitiş; dakikalar ±1 dk doğru | Gün 5–6 | **Yüksek** | todo |
| 8 | Çevrimdışı davranış denenir (tünel/ölü bölge senaryosu) | QA | Olaylar bağlantı gelince tek kez yazılıyor | Gün 8 | Orta | todo |
| 9 | **Patron E2E**: dashboard, sürücü/araç durumu, anomaliler | PILOT | Patron günü ekrandan anlayabiliyor (sözlü onay) | Gün 7–8 | Orta | todo |
| 9 | Anomali ve çalışma süresi incelemesi ofis tarafında | PILOT | Ofis bir anomaliyi bulup düzeltebiliyor | Gün 8 | Orta | todo |
| 10 | 7–9. gün bulgularının düzeltilmesi (yalnız hata) | DEV | Açılan P0 hatası kalmadı | Gün 7–9 | Yüksek | todo |

---

## Gün 11–14 — Gerçek araç / cihaz saha testi

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 11 | Cihaz montajı ve **IMEI → araç eşleştirmesi** | OPS | En az 2 araçta cihaz kayıtlı ve `devices` ucunda görünüyor | **T1 teslimat** | **Yüksek — P0-2** | todo |
| 11 | `codec8-sim` **gerçek** IMEI ile koşulur (simülatör hattı 10.08'de zaten yeşile alındı) | DEV | Gerçek cihaz IMEI'siyle batarya yeşil | Gün 11 eşleştirme | Orta | todo |
| 12 | **Tam gün ingest testi** — 1 araç, ≥8 saat | OPS+PILOT | Kesintisiz konum akışı; boşluk raporlanıyor | Gün 11 | **Yüksek** | todo |
| 12 | Canlı takip ofis ekranında doğrulanır | PILOT | Araç haritada gerçek zamanlı | Gün 12 | Orta | todo |
| 13 | Trip yaşam döngüsü (başlangıç/bitiş/mesafe) doğrulanır | QA | Trip kayıtları gerçek sürüşle uyumlu | Gün 12 | Orta | todo |
| 13 | **Gerçek DDD dosyası** indirilip işlenir | OPS+PILOT | `TachoActivity` doluyor, ihlal motoru çalışıyor | Sürücü kartı/VU erişimi | **Yüksek** | todo |
| 14 | **REST → BreakCandidate gerçek veriyle** | QA | Gerçek DDD'den aday üretiliyor, onaylanınca PayrollDay tutuyor | Gün 13 | Yüksek | todo |
| 14 | Saha testi bulgularının düzeltilmesi | DEV | Açık P0 yok | Gün 11–14 | Yüksek | todo |

---

## Gün 15–17 — Üretim, güvenlik, yedekleme, izleme

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 15 | `.env.production.example` **106 env**'e göre tamamlanır | DEV | Kodun okuduğu her zorunlu değişken örnekte var | — | Orta — **P0-7** | todo |
| 15 | Production açılış provası (eksik anahtarla açılmamalı) | OPS | Eksik anahtarda uygulama **başlamıyor** | Gün 15 | Orta | todo |
| 16 | **Restore testi**: gerçek yedek boş DB'ye geri yüklenir | OPS | Kritik tabloların satır sayıları eşleşiyor | `backup-daily.sh` cron | **Yüksek — P0-6** | todo |
| 16 | Yedek cron'u kurulur ve bir gece çalıştığı doğrulanır | OPS | Yedek dosyası oluştu, boyut makul | — | Orta | todo |
| 16 | Rollback planı yazılır | OPS+DEV | Yazılı, ekiple paylaşılmış | — | Orta | todo |
| 17 | Sentry + `/health` izlemeye bağlanır, alarm testi | OPS | Yapay hata alarma düşüyor | — | Orta | todo |
| 17 | DNS/SPF/DKIM/DMARC + gerçek e-posta teslimi | OPS | Davet, hatırlatma, fatura e-postası ulaşıyor | — | Orta — **P1-R9** | todo |
| 17 | Kiracı izolasyonu ve denetim kaydı son kontrolü | QA | Kontrol yeşil; denetim kaydında pilot işlemleri görünüyor | Gün 3–14 | Düşük | todo |

---

## Gün 18–19 — UX temizliği, eğitim, kuru prova

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 18 | **UX geçişi**: kırık gezinti, erişilemez sayfa, 403 üreten görünür buton | QA | Her rol için tıklanabilir her öğe ya çalışıyor ya gizli | Gün 3–6 roller | Orta | todo |
| 18 | Boş/hata durumları ve Almanca metin kalitesi | DEV | Pilotun göreceği her ekranda anlamlı boş durum + doğru Almanca | Gün 7–14 | Orta | todo |
| 18 | Sidebar otomatik kaydırma düzeltmesi gerçek tarayıcıda doğrulanır | QA | Bölüm açınca kaymıyor, gezinince aktif öğeye kayıyor | — | Düşük | todo |
| 19 | **Kuru prova: tam gün** — ofis + sürücü + patron aynı anda | HEPSİ | Kritik arıza olmadan bir iş günü tamamlandı | Gün 1–18 | **Yüksek** | todo |
| 19 | Sürücü ve ofis için kısa eğitim materyali (1 sayfa, Almanca) | PILOT+DEV | Sürücü materyalin ilk maddesi "Abfahrtskontrolle" | Gün 8 | Düşük | todo |
| 19 | Yalnızca hata düzeltme — yeni özellik yok | DEV | Açık P0 yok | Gün 19 prova | Yüksek | todo |

---

## Gün 20 — GO / NO-GO

| Gün | Görev | Sahip | Kabul ölçütü | Bağımlılık | Risk | Durum |
|---|---|---|---|---|---|---|
| 20 | §17'deki **10 ölçüt** tek tek kanıtla işaretlenir | HEPSİ | Her ölçütün yanında kanıt bağlantısı (log, ekran, çıktı) | Gün 1–19 | — | todo |
| 20 | Batarya son kez tam yeşil çalıştırılır | DEV | 5 adımın hepsi yeşil, tek oturumda | Gün 11 telematik | Yüksek | todo |
| 20 | Hukuki onaylar (AVV, Impressum, Datenschutz, AGB, §87 BetrVG) | LEGAL | Yazılı onay | — | Orta | todo |
| 20 | **GO / NO-GO kararı** | HEPSİ | 10/10 → GO; aksi halde erteleme ve yeni tarih | Hepsi | — | todo |

---

## Kritik yol

```
T1 cihaz siparişi (Gün 1)
        ↓  [tedarik süresi — plan dışı risk]
Cihaz montajı + IMEI eşleştirme (Gün 11)
        ↓
Tam gün ingest (Gün 12)
        ↓
Gerçek DDD → BreakCandidate (Gün 13–14)
        ↓
Kuru prova (Gün 19)
        ↓
GO/NO-GO (Gün 20)
```

Paralel ve daha kısa ikinci yol: **veri provisioning (Gün 2–6) → E2E (Gün 7–10)**. Bu yol
gecikirse saha testi anlamsızlaşır, çünkü test edilecek gerçek bir gün olmaz.

**Tek en büyük risk:** cihaz teslimatı 11. günü aşarsa saha testi ve dolayısıyla GO ölçütü 5,
6 ve batarya adımı 20. güne yetişmez. Bu gerçekleşirse seçenekler: (a) pilotu erteleme,
(b) pilotu telematiksiz kapsamla başlatma — ancak bu, başarı ölçütünün "telemetri bir tam
günü hayatta kalıyor" maddesini kapsam dışına almak demektir ve **yazılı kabul gerektirir**.
