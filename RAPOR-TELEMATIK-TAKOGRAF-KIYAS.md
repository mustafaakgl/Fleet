# Telematik & Takograf — Rakip Karşılaştırması ve Eksik Analizi

**Tarih:** 2026-07-20 · **Kıyaslanan rakipler:** Webfleet (Bridgestone), Samsara, VDO Fleet / TIS-Web (Continental) + genel pazar özellik çıtası
**Bizim durum tespiti:** Canlı ürün turu (Live Tracking, Sefer Geçmişi, Yakıt Analitiği, Sürücü Skorları, Araç Sağlığı, Cihaz Yönetimi, Uyum Raporu, İhlaller, Kalan Sürüş Süresi, DDD Arşivi) + backend kod incelemesi

---

## 1. Mevcut Güçlü Yanlarımız (rakiplerle başa baş veya iyi)

| Alan | Bizde | Not |
|---|---|---|
| Canlı harita | ✅ Mobil GPS + Teltonika (FMC130, Codec8) çift kaynak | Çift kaynak (telefon+cihaz) esnekliği Webfleet/Samsara'da yok denecek kadar az |
| Rölanti maliyeti | ✅ Canlı rölanti nöbeti + €/dk tahmini + 28 günlük rölanti yakıt maliyeti | Samsara benzeri, iyi |
| Yakıt analitiği | ✅ Fiş vs GPS-tahmin farkı, CO₂, şüpheli olay/hırsızlık alarmı (suppression'lı), yakıt kartı importu | Fark analizi (fiş-tahmin) ayrıştırıcı özellik |
| Sürücü skorları | ✅ Sert fren/hızlanma/hız, 100km başına normalize, hedef çizgili trend, sıralama | Koçluk workflow hariç iyi seviye |
| Araç sağlığı | ✅ DTC, voltaj, bakım geri sayımı (km+zaman kuralları), sessiz cihaz tespiti | Rakip seviyesinde |
| DDD arşivi | ✅ İmza (Annex 1C) doğrulamalı, SHA-256'lı, immutable, retention/KVKK temizliği | İmza doğrulama + hash birçok rakipte yüzeysel |
| Kural motoru | ✅ EU 561/2006 (Art. 6/7/8): mola, günlük/haftalık sürüş, dinlenme, telafi borcu; golden-test'li | Ciddi mühendislik varlığı |
| İhlal yönetimi | ✅ Kuyruk, onay (ack), bildirim + hatırlatma, tekrar eden ihlalciler, bordro işaretleri | Samsara "compliance inbox" muadili çekirdek var |
| Kalan sürüş süresi | ⚠️ Sürücü başına canlı kart (hafta/iki hafta, 10s günü, azaltılmış dinlenme sayaçları) | Var AMA kaynağı DDD dosyası → veri bayat olabilir (aşağıda #T1) |
| İndirme uyumu | ✅ Kart/VU indirme takvimleri, 7g/1g/gecikmiş hatırlatma, uzaktan indirme servisi | Çekirdek doğru kurulmuş |

---

## 2. Rakip Özeti

**Webfleet Tachograph Manager:** otomatik uzaktan indirme, yasal arşivleme, "social infringement" raporları **beklenen ceza tutarıyla**, TachoGrade uyum notu, kalan sürüş süresi (günlük/haftalık), son tarih yöneticisi (kart bitişi, indirme deadlline'ları), DVSA akreditasyonu, TachoShare ile 3. parti analiz aktarımı, Temmuz 2026 Smart Tacho 2 hazırlığı.

**Samsara:** uzaktan indirme + **canlı takograf verisi** (gerçek zamanlı sürüş modu), gerçek zamanlı kalan süre + **limit dolmadan kabin içi/mobil uyarı**, VDO ruleset'iyle otomatik ihlal tespiti, uçtan uca ihlal workflow'u (debrief + koçluk + sefer bağlamı), telematik+güvenlik+kamera tek platform, 17+ ülke.

**VDO Fleet / TIS-Web:** DLD ile yasal süre içinde otomatik indirme, yasal arşivleme/silme, 25+ rapor (hız profilleri, maliyet), **çalışma süresi (WTD/gece çalışması dahil) analizi**, ERRU scorecard'ları, **ülke bazlı ceza kataloğu**, kart yenileme/ehliyet kontrol/indirme deadline hatırlatmaları, sürücü grupları + zamanlanmış raporlar.

**Genel telematik çıtası (pazar standardı):** geofencing, rota replay, AI dashcam/video telematiği, önleyici bakım + iş emri, yakıt anomalisi, ELD/HOS, özelleştirilebilir dashboard, API/entegrasyonlar, mobil uygulama.

---

## 3. EKSİKLER — Telematik

Öncelik: 🔴 kritik (satış kaybettirir) · 🟡 orta · 🟢 nice-to-have

1. 🔴 **Geofencing / POI yok.** Bölge tanımı, giriş-çıkış alarmı, bölge bazlı rapor (müşteri sahasında geçirilen süre), mesai dışı kullanım alarmı. Her rakipte var; demo'larda ilk sorulan özellik.
2. 🔴 **İş/Özel sefer sınıflandırması "yakında"da takılı.** DE pazarında vergiye uygun **Fahrtenbuch (Finanzamt-konform)** exportu tek başına satın alma nedeni (Vimcar bunun üstüne şirket kurdu). Sınıflandırma + değiştirilemez kayıt + PDF/CSV resmi export gerekli.
3. 🟡 **Rota replay zayıf.** Sefer listesi var; harita üstünde iz + duraklar + olay işaretli tam replay (hız grafiğiyle senkron) rakip standardı.
4. 🟡 **Video telematiği / AI dashcam yok.** Samsara'nın ana satış kozu; en azından 3. parti kamera entegrasyon yolu (API) planlanmalı.
5. 🟡 **Tek donanım: Teltonika Codec8.** Rakipler çoklu cihaz + **OEM rFMS** (MAN, Mercedes, Scania fabrika telematiği) destekliyor — cihaz taktırmadan filo bağlamak DACH'ta güçlü satış argümanı.
6. 🟡 **Sürücüye anlık geri bildirim yok.** Skor var ama kabin içi/mobil gerçek zamanlı uyarı (hız, sert fren anında) ve koçluk oturumu kaydı yok.
7. 🟢 **Trailer/asset takibi, sıcaklık/soğuk zincir** yok (segment ihtiyacına göre).
8. 🟢 **Bakım iş emri derinliği:** servis kaydı var; parça/işçilik maliyet kırılımı ve iş emri yaşam döngüsü sınırlı.

## 4. EKSİKLER — Takograf

1. 🔴 **Canlı takograf verisi yok (en kritik fark).** Kalan sürüş süresi DDD dosyasından hesaplanıyor; dosya 21 gün eskiyse kart "0 sn / bayat" gösteriyor (demo'da görüldü: "son DDD 21 gün önce"). Samsara/Webfleet canlı D8/tacho feed ile **gerçek zamanlı** kalan süre + limit dolmadan sürücüye uyarı veriyor. Yol: rFMS veya DLD-tipi canlı akış + mevcut kural motorunun canlı moda bağlanması. Kural motoru hazır olduğu için buradaki yatırım verimli.
2. 🔴 **Ceza kataloğu eşlemesi yok.** İhlal → ülke bazlı beklenen ceza tutarı (VDO fines catalog, Webfleet "expected fines"). Yöneticinin dilinden konuşan özellik; veri seti (DE Bußgeldkatalog) ile hızlı eklenebilir.
3. 🟡 **Çalışma süresi direktifi (WTD/ArbZG) analizi yok.** 561/2006 var ama haftalık ort. 48 saat, gece çalışması, Mindestlohn dokümantasyonu yok — VDO'nun ayrıştırıcısı.
4. 🟡 **Sürücü debrief/imza akışı eksik.** İhlal onayı (ack) var; sürücüye tebliğ + dijital imza + eğitim/Unterweisung kaydı (denetimde kanıt) yok. Samsara "digital debrief" satıyor.
5. 🟡 **Deadline yönetimi parçalı.** Kart bitişi/ehliyet kontrolü var; **takograf kalibrasyonu (2 yıl)** ve şirket kartı yönetimi net değil — tek "son tarih yöneticisi" ekranında toplanmalı (Webfleet Deadline Manager muadili).
6. 🟡 **Bordro/dış sistem exportu.** Payroll flag var; DATEV/Excel saat exportu ve 3. parti analiz aktarımı (TachoShare muadili API) yok.
7. 🟢 **Gen2v2 / DSRC teyidi.** Parser Annex 1C Gen1/Gen2 test ediyor; **Temmuz 2026 Smart Tacho 2 zorunluluğu** için Gen2v2 dosya varyantlarının açık teyidi ve pazarlama mesajı gerekli (rakipler bunu vitrine koydu).
8. 🟢 **Resmi kurum formatları.** DVSA/BAG-uyumlu denetim raporu şablonları, ERRU risk skoru benzeri gösterim.

## 5. Önerilen Yol Haritası (etki/efor sırasıyla)

1. **Geofencing + POI** (telematik tarafında en büyük boşluk; mevcut canlı konum altyapısıyla orta efor)
2. **Fahrtenbuch tamamlama** (sınıflandırma UI hazır görünüyor; resmi export + kilitleme kuralı ekle)
3. **Ceza kataloğu** (kural motoru çıktısına DE katalog eşlemesi; düşük efor, yüksek algı)
4. **Canlı tacho akışı** (rFMS entegrasyonu üzerinden; kural motoru hazır → fark kapatıcı büyük hamle)
5. **Deadline Manager birleşik ekranı** (kalibrasyon + kartlar + ehliyet + indirme tek yerde)
6. **Sürücü debrief + imza** (mevcut ihlal ack akışının üstüne)
7. rFMS/çoklu donanım, WTD analizi, dashcam API'si (orta vade)

---

### Kaynaklar
- [Webfleet Tachograph Manager](https://www.webfleet.com/en_gb/webfleet/products/webfleet/features/tachograph-manager/)
- [Samsara Tachograph Management](https://www.samsara.com/uk/products/telematics/tachograph)
- [VDO Fleet Tachograph Management](https://www.fleet.vdo.com/products/tachograph-management/)
- [VDO Fleet Scorecards (Continental)](https://www.continental.com/en/products-and-innovation/innovation/fleet-management/vdo-fleet-scorecards-for-tis-web/)
- [Fleet yönetim yazılımı özellik rehberi (EcoFactor)](https://ecofactortech.com/fleet-management-software-features/)
- [Samsara canlı takograf duyurusu](https://www.samsara.com/blog/introducing-live-tachograph-data-and-instant-analysis)
