# Telematik & Tachograph — Grafik / Sayfa Planı

> Her veri noktası: ayrı sayfa mı, bir sayfanın içinde grafik mi? + grafik türü + durum.
> Durum: ✅ var · 🟡 kısmi · ⏳ yapılacak.

## Önemli ön koşul: telemetri geçmişi
Zaman serisi grafikleri (hız-zaman, sıcaklık, voltaj, yakıt trendi) için **`VehicleTelemetryLatest` yetmez** —
sadece "son durum" tutuyor. Trend grafikleri için bir **`VehicleTelemetryHistory`** (zaman serisi) modeli + kayıt + endpoint gerekir.
Bu, aşağıdaki "çizgi" grafiklerinin ortak ön koşulu.

---

## Telematik · operasyon

| Veri | Yer | Grafik türü | Durum |
|---|---|---|---|
| Canlı konum | **Ayrı sayfa** (Canlı Takip) | Harita + ETA | ✅ |
| Rota geçmişi | **Ayrı sayfa** (Sefer Geçmişi) | Harita path + liste | ✅ |
| Hız | Araç detay içi | Çizgi (eşik çizgili) | ⏳ (history gerekli) |
| Yakıt | **Ayrı sayfa** (Yakıt Analizi) | Çubuk/trend | ✅ (trend 🟡) |
| Motor verileri (RPM) | Araç detay içi | Gauge / çizgi | ⏳ (history) |
| DTC arızaları | Araç Sağlığı içi | Liste + rozet | ✅ |
| Rölanti | Verimlilik/Sefer içi | Donut % | 🟡 |
| Sert fren | Sürücü Skoru içi | Çubuk (sayım) | ✅ |
| Sert hızlanma | Sürücü Skoru içi | Çubuk | ✅ |
| Sert viraj | Sürücü Skoru içi | Çubuk | 🟡 (enum eklendi) |
| Motor sıcaklığı | Araç detay içi | Çizgi | ⏳ (history) |
| Akü voltajı | Araç Sağlığı / detay içi | Çizgi + eşik | 🟡 (anlık ✅, trend ⏳) |
| Kilometre | Araç Sağlığı içi | İlerleme (bakıma kalan) | 🟡 |

## Tachograph · compliance

| Veri | Yer | Grafik türü | Durum |
|---|---|---|---|
| Sürüş süresi | **Ayrı sayfa** (Kalan Süre) | Yatay çubuk | ✅ |
| Dinlenme süresi | Kalan Süre / Uyum içi | Çubuk | ✅ |
| Mola | Kalan Süre içi | Donut / sayaç | 🟡 |
| Driver Card | İhlaller/Kalan Süre içi | Kimlik rozeti | ✅ |
| DDD dosyaları | **Ayrı sayfa** (DDD Arşivi) | Liste | ✅ |
| İhlaller | **Ayrı sayfa** (İhlaller) | Liste + KPI | ✅ |
| Haftalık sürüş | Uyum içi | İlerleme (limit) | 🟡 |
| İki haftalık limit | Uyum içi | İlerleme (limit) | 🟡 |

---

## Yapım sırası (eksik grafikler için)
1. **Ön koşul:** `VehicleTelemetryHistory` modeli + ingest kaydı + `GET /tracking/telematics/vehicles/:id/history` endpoint.
2. **Araç detay sayfası:** bir araca tıklayınca hız / RPM / soğutucu / voltaj / yakıt zaman serisi çizgileri (recharts).
3. **Küçük eklemeler:** Rölanti donut (Verimlilik), haftalık/iki-haftalık ilerleme çubukları (Uyum), kilometre "bakıma kalan" çubuğu (Araç Sağlığı).

Not: "Ayrı sayfa"lar zaten sidebar'da. Zaman serisi grafikler history ön koşuluna bağlı; küçük eklemeler mevcut sayfalara kart olarak girer.
