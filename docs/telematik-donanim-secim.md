# Telematik Donanım Seçimi — 30 Ürün, Ne Açar, Ne Tutar

> Tarih: 2026-08-06 · Kapsam: hangi cihazı alırsak Fleet'te hangi analiz ekranı çalışır
> ve piyasa fiyatı ne. Fiyat notu ve kaynak güveni için bölüm 6.

---

## 1. Kararı belirleyen tek şey: Codec 8

Fiyat ikinci sırada. Birinci kriter şu:

`backend/src/telematics-gateway/codec8-parser.ts:216` — ağ geçidi Codec 8 (0x08) ve
Codec 8 Extended (0x8E) dışındaki her codec id'de `Unsupported codec id` fırlatıyor.
Codec 8, **Teltonika'nın protokolü**. Yani:

- **Teltonika alırsak** → cihaz takılır, gateway zaten çözer, kod işi yalnızca IO
  eşlemesini doğrulamak (`avl-io-map.ts` başındaki `TODO device-side verify`).
- **Ruptela / Queclink / Concox / Suntech alırsak** → her biri kendi ikili protokolünü
  konuşur. Her marka için ayrı parser + ayrı test bataryası. Cihaz başına 20 € tasarruf
  için haftalarca parser bakımı.
- **Samsara / Geotab / Webfleet alırsak** → cihaz ham veri vermez. Onların bulutuna gider,
  biz API'den geri çekeriz; aylık araç başı ücret kalıcıdır ve **bunlar Fleet'in rakibi**.
  Ürünümüzün çekirdek verisini rakibin API'sine bağlamak stratejik olarak yanlış.

**Sonuç: Teltonika. Zaten doğru seçilmiş.** Aşağıdaki tablo bu çerçevede.

---

## 2. Fleet'in gerçekten tükettiği veri

`avl-io-map.ts` ve Prisma modellerinden okundu. Cihaz seçimi bu sekiz yeteneğe göre yapılır:

| Kod | Yetenek | Fleet'te açtığı ekran | Donanım şartı |
|---|---|---|---|
| **K1** | Konum | `live-tracking` haritası, `DriverLocation*`, rota sapma raporu | Sadece GPS — her cihazda var |
| **K2** | Trip + sürüş davranışı | `FleetTrip`, `FleetDrivingEvent` (`speeding`, `harsh_accel`, `harsh_brake`, `harsh_corner`), sürücü skoru | Cihaz içi ivmeölçer — çoğu modelde var |
| **K3** | Araç sağlığı | `VehicleTelemetryLatest` (rpm, soğutucu, voltaj, km), `VehicleDtc` arıza kodu | **CAN/FMS erişimi gerekir** |
| **K4** | Yakıt / verimlilik | `fuelLevelPct`, `FleetFuelEntry`, sapma raporundaki litre + euro | CAN yakıt ya da seviye sensörü |
| **K5** | Takograf / compliance | `src/tachograph`, 561/2006 ihlal motoru, DDD arşivi | K-Line/Tacho-CAN + **gerçek DDD parser (yok)** |
| **K6** | Sürücü kimliği | Araç↔sürücü eşleşmesi; `DriverLocationHistory.driverId` zorunlu alanını çözer | iButton / RFID okuyucu |
| **K7** | Dorse / varlık / soğuk zincir | Çekicisiz dorse takibi, sıcaklık kaydı | Bağımsız pilli tracker / BLE sensör |
| **K8** | Video | Henüz ekran yok — yeni modül gerekir | Kamera |

**Dikkat:** K1 ve K2 çıplak cihazla gelir. K3 ve K4 **CAN adaptörü olmadan gelmez** —
FMC130'u bir kamyona çıplak takarsan elinde yalnızca nokta ve hız olur, motor verisi olmaz.
Bu, bütçenin en sık kaçırılan kalemi.

---

## 3. 30 ürünlük tablo

Fiyatlar **net (KDV hariç)**, AB bayi sokak fiyatı, Ağustos 2026. Güven sütunu: bkz. bölüm 6.

### A · Ana ünite — araca sabit (Codec 8, gateway'e doğrudan takılır)

| # | Ürün | Sınıf | Fleet'te ne açar | Net € | Güven |
|---|---|---|---|---|---|
| 1 | Teltonika **FMC920** | 4G, kompakt, dahili anten | K1, K2 | 41,00 | orta |
| 2 | Teltonika **FMM920** | LTE-M/NB-IoT | K1, K2 — düşük veri, düşük tarife | 42,80 | orta |
| 3 | Teltonika **FMC130** | 4G, harici anten, **CAN yok** | K1, K2, K6 (+K3/K4 yalnızca CAN adaptörüyle) | 48,00 | **yüksek** |
| 4 | Teltonika **FMC125** | 4G, RS232 | K1, K2, K6 + seri çevre birimi | 53,49 | orta |
| 5 | Teltonika **FMC150** | 4G, **2× dahili CAN** | K1, K2, **K3, K4** (adaptörsüz), K6, **K5 sınırlı** — bkz. §3.1 | 80,00 | **yüksek** |
| 6 | Teltonika **FMC003** | 4G **OBD-II soketi**, alet gerektirmez | K1, K2, K3, K4 — **yalnızca binek/van** | 72,00 | **yüksek** |
| 7 | Teltonika **FMB003** | 2G OBD-II | Aynısı, 2G — Almanya'da 2G kapanıyor, **alma** | 56,00 | orta |
| 8 | Teltonika **FMC230** | 4G **IP67**, dış montaj | K1, K2 — römork/iş makinesi kabini | 56,00 | orta |
| 9 | Teltonika **FMC800** | 4G, çoklu IO | K1, K2, K6 + dijital giriş (kapı, PTO) | 51,80 | orta |
| 10 | Teltonika **FMC880** | 4G, geniş IO + CAN | K1, K2, K3 | 56,00 | orta |
| 11 | Teltonika **FMB140** (ALL-CAN300 dahili) | 2G, CAN gömülü | K1–K4 tek kutuda — ama **2G** | 128,62 | orta |
| 12 | Teltonika **FMB640** | Profesyonel, 2G, RS232/RS485/CAN | K1–K5 — **2G, yeni kurulumda alma** | 68,00 | düşük (stok yok) |
| 13 | Teltonika **FMC650** | **Profesyonel 4G**: 2×CAN J1939, J1708, RS232×2, RS485, 1-Wire, K-Line | **K1–K6 hepsi.** FMS'li kamyonda **adaptörsüz** — CAN1'e doğrudan bağlanır | 109,20–121,99 | **yüksek** |

### 3.1 · FMC130 / FMC150 / FMC003 — üçünün ayrımı

Bu üçü en sık karıştırılanlar, ayrım net:

| | **FMC130** — 48 € | **FMC150** — 80 € | **FMC003** — 72 € |
|---|---|---|---|
| Sınıf | Kablolu, harici antenli | Kablolu, **dahili CAN'li** | **OBD-II soketi**, tak-çalıştır |
| Hücresel | 4G LTE Cat 1 + 3G + 2G fallback | 4G LTE Cat 1 (10/5 Mbps) + 2G | 4G LTE Cat 1 (10/5 Mbps) + 2G |
| LTE bantları | B1, B3, B7, B8, B20, B28A | B1, B3, B7, B8, B20, B28 | LTE Cat 1 |
| SIM | Micro-SIM + **eSIM** | Micro-SIM + **eSIM** | Micro-SIM |
| GNSS | GPS, GLONASS, BeiDou, Galileo, QZSS | Aynısı | Aynısı + SBAS/DGPS/AGPS |
| Bluetooth | 4.0 LE | 4.0 LE | 4.0 LE |
| **CAN** | **Yok** — harici adaptör şart | **2× dahili** | OBD üzerinden HS/MS/SW CAN + K-line |
| 1-Wire (sürücü kimliği) | Var | Var | **Yok** |
| Dijital giriş / çıkış | 3 / 3 | 3 / 2 | Yok |
| Analog giriş | doğrulanmadı | 2 | Yok |
| Yedek pil | 170 mAh 3,7 V (0,63 Wh) | 170 mAh 3,7 V | 170 mAh 3,7 V |
| Besleme | 10–30 V DC | 10–30 V DC | 10–30 V (soketten) |
| Ölçü / ağırlık | 65 × 56,6 × 20,6 mm / 55 g | 65 × 56,6 × 20,6 mm / 55 g | 67 × 50 × 25 mm / 110 g |
| IP / sıcaklık | IP41 / −40…+85 °C | IP41 / −40…+85 °C | IP41 / −40…+85 °C |
| Anten | **Harici** GNSS + GSM | Harici | **Dahili** — gizlenemez |
| Montaj | Kablolama ~30–45 dk | Kablolama ~20–30 dk | **Sokete tak, 1 dk** |

**Fleet'te hangi `avl-io-map.ts` alanı dolar:**

Kaynak: üreticinin kendi veri sayfaları (FMC150 DS, FMC003 Datasheet v1.5 · 2025-03-19)
ve wiki AVL parametre tablosu. Bayi açıklamaları değil.

| Alan | FMC130 çıplak | FMC130 + LV-CAN200 | FMC150 | FMC003 |
|---|---|---|---|---|
| konum, hız → K1 | ✅ | ✅ | ✅ | ✅ |
| `speeding`, `harsh_*`, crash → K2 | ✅ | ✅ | ✅ | ✅ |
| `ignition`, `voltage` | ✅ | ✅ | ✅ | ✅ |
| `rpm` | ❌ | ✅ | ✅ dahili CAN | ✅ OBD |
| `fuelLevelPct` → K4 | ❌ | ✅ | ✅ dahili CAN | ✅ AVL 390 OEM |
| toplam tüketim | ❌ | ✅ | ✅ CAN Data'da adlı | ⚠️ adlandırılmamış² |
| `odometerKm` | belirsiz¹ | ✅ | ✅ dahili CAN | ✅ AVL 389 OEM |
| `coolantTemp` | ❌ | ✅ | ⚠️ BLE OBD dongle³ | ✅ AVL 32 |
| `VehicleDtc` → K3 | ❌ | ✅ | ⚠️ BLE OBD dongle³ | ✅ AVL 30 + 281 |
| sürücü kimliği → K6 | ✅ 1-Wire | ✅ | ✅ AVL 78 | ❌ **1-Wire yok** |
| immobilizer | ✅ DOUT | ✅ | ✅ AVL 248 | ❌ **DOUT yok** |

¹ AVL ID 16 "Total Odometer" — cihaz bunu GNSS'ten de türetebiliyor. CAN'siz gelip
gelmediği cihaz üstünde doğrulanmalı; `avl-io-map.ts:22`'deki `TODO device-side verify`.

² FMC150 veri sayfası CAN Data satırında `Total fuel consumption`'ı açıkça sayıyor,
FMC003 saymıyor. FMC003'te `GNSS Fuel Counter` (mesafeden **tahmin**) var; gerçek tüketim
"32 adede kadar OEM parametresi" içinde olabilir ama **araca göre değişir** — Teltonika'nın
desteklenen araç/veri listesinden filodaki modeller kontrol edilmeli.

³ FMC150'nin **dahili CAN çipi** DTC ve soğutucu sıcaklığı vermiyor (veri sayfasının CAN
Data satırı saymıyor). Ama AVL 30 / 281 / 32 satırlarının donanım listesinde FMC150 var:
FMC150 Bluetooth çevre birimi olarak **OBD dongle** destekliyor. Yani K3 kapalı değil,
adaptörsüz değil.

**FMC003'te iki "hayır" fiziksel.** Veri sayfasının Interface bölümü tam olarak şunları
listeliyor: `OBDII Socket`, GNSS anteni, GSM anteni, USB, 2 LED, Micro-SIM. Dijital giriş,
dijital çıkış, analog giriş, 1-Wire, impuls giriş — hiçbiri yok. Cihaz sokete geçen kapalı
bir dongle, dışarı çıkan kablo ucu yok. iButton 1-Wire pini ister, immobilizer röleyi kesecek
DOUT ister. AVL 78 ve 248'in donanım listelerinde de hiçbir 003 varyantı geçmiyor.
Sonuç: çok sürücülü araçta `FleetTrip.driverId` boş kalır.

**Kapsam farkı — dahili CAN her aracı okumaz:**

- FMC150 dahili CAN ≈ **600 araç modeli**: 2010 sonrası binek, van, hafif kamyon.
- FMC130 + ALL-CAN300 ≈ **1 500 model**: eski MAN kamyon, John Deere traktör,
  Caterpillar iş makinesi dahil. Ayrıca adaptör **elektriksel izolasyon** sağlar —
  tracker arızalanırsa aracın orijinal CAN hattını korur. Yaşlı ve karışık filoda önemli.

**Kod açısından kritik:** iki yolun **AVL ID şeması farklı.** FMC150 Teltonika'nın yerel
isimlendirmesini, CAN-CONTROL kendi normalize şemasını gönderir. İkisi birden alınırsa
`avl-io-map.ts`'de **iki ayrı çözümleme profili** tutmak gerekir; bugün tek profil var
(`TELEMATICS_IO_MAP.fields` sabit bir map). **Pilotta tek yolda kal.**

### 3.2 · FMC150 kamyonda takograf yapar mı?

**Evet, teknik olarak yapar.** Teltonika'nın *FMx150 Tachograph solution* sayfası var:
DDD indirme kaynağı (takografın hangi CAN hattında olduğu), WEB Tacho sunucu ayarları,
FMS I/O Info ve Tachograph Data Info bölümleri mevcut. DDD desteğinin yalnızca 640/650
ailesinde olduğu bilgisi eskidir.

**Ama kamyonda önerilmez — sebep port bütçesi:**

| | FMC150 | FMC650 |
|---|---|---|
| CAN | 2 | 2× J1939 + 1× J1708 |
| RS232 / RS485 | yok / yok | 2 / 1 |
| K-Line | **doğrulanamadı** | var |
| Takograf canlı veri yolu | Tacho CAN | K-Line, Tacho CAN **veya** FMS |
| Net fiyat | 80,00 € | 111,00 € |

Kamyonda **FMS CAN** (araç verisi) ve **Tacho CAN** (DDD) aynı anda okunur — FMC150'nin
iki CAN'i de dolar. Üstüne RS232/RS485 isteyen bir yakıt seviye sensörü (DUT-E, Escort)
eklenemez. Ayrıca bazı DTCO kurulumlarında yalnızca ön panel K-Line erişilebilir;
**FMC150'de K-Line olup olmadığı teyit edilmedi — sipariş öncesi kapatılacak soru.**

Fark kamyon başına **31 €**. 6 kamyonda 186 €. Karşılığında 2×RS232, 1×RS485 ve
K-Line yedeği alınıyor.

**Tek model ısrarı varsa körlemesine sipariş verme:** bir kamyona bir FMC150 tak,
`tachocheck` SMS komutunu gönder. Doğru bağlantıda `CAN_2:[111],[ABCD], K-Line:[K]`
benzeri cevap döner ve DDD indirilebileceğini teyit eder. 80 €'luk tek cihazla
6 kamyonluk karar test edilmiş olur.

**Donanımdan bağımsız üç engel** — hangi cihaz alınırsa alınsın takograf yolu kapalı:
1. Bizim parser'ımız gerçek DDD okumuyor (bkz. §7.1).
2. **Şirket kartı zorunlu** — indirmeyi yetkilendirir; Teltonika yolunda bir şirket
   PC'sine kart okuyucu yazılımı kurulur. Planlanmadı, kurulmadı.
3. **Atölye aktivasyonu** — DTCO'da uzaktan indirme, yetkili atölyede DTCO update
   kartıyla açılır. Kamyon başına maliyet + atölye ziyareti.

**Karar:** modern binek/van → **FMC150**. Kamyon → **FMC650** (FMS'li kamyonda adaptörsüz;
`ALL-CAN300` yalnızca FMS'i olmayan eski kamyon ve iş makinesi için).
**FMC130'u alma** — çıplakken FMC150'den 32 € ucuz ama CAN'siz; adaptörle FMC150'den
pahalı. Ortada kalıyor. FMC003'ün yeri ayrı: montaj işçiliği sıfır olduğu için kiralık
ve kısa dönem araçta tek makul seçenek; karşılığında sürücü kimliği yok ve sürücü çıkarabilir.

### B · Dorse, varlık, iş makinesi (bağımsız pilli)

| # | Ürün | Sınıf | Fleet'te ne açar | Net € | Güven |
|---|---|---|---|---|---|
| 14 | Teltonika **TAT100** | 2G varlık tracker, pilli | K7 — dorse konumu | 55,00 | orta |
| 15 | Teltonika **TAT140** | **4G IP68**, uzun pil | K7 — dorse/konteyner, yıllarca | 66,50 | orta (sapma yüksek) |
| 16 | Teltonika **TAT240** | 4G, kurcalama korumalı | K7 — yüksek değerli varlık | ~100 | düşük (USD çeviri) |
| 17 | Teltonika **ATC700** | Varlık tracker | K7 | 60,00 | orta |

### C · CAN / arayüz adaptörleri — K3 ve K4'ün asıl anahtarı

| # | Ürün | Sınıf | Fleet'te ne açar | Net € | Güven |
|---|---|---|---|---|---|
| 18 | Teltonika **LV-CAN200** | Binek/hafif ticari CAN | **K3 + K4** — rpm, yakıt %, km, soğutucu | 59,67–62,19 | **yüksek** |
| 19 | Teltonika **ALL-CAN300** | Ağır ticari + iş makinesi CAN | **K3 + K4**, kamyon FMS parametreleri | 114,04–122,92 | **yüksek** |
| 20 | Teltonika **CAN-CONTROL** | CAN okuma **+ komut yazma** | K3, K4 + uzaktan kilit/immobilizer | 81,51–97,00 | orta |
| 21 | Teltonika **ECAN02** | Basit CAN arayüzü | Kısıtlı K3 — ucuz giriş | 19,09–19,99 | orta |

### D · Sürücü kimliği, sensör, çevre birimi

| # | Ürün | Sınıf | Fleet'te ne açar | Net € | Güven |
|---|---|---|---|---|---|
| 22 | Teltonika **1-Wire RFID okuyucu** | Kart okuyucu | **K6** — `driverId` zorunlu alan sorununu çözer | 22,99 | orta |
| 23 | Teltonika **iButton okuyucu** | 1-Wire dokunmatik | K6 — en ucuz sürücü tanıma | 9,49 | orta |
| 24 | **Dallas iButton anahtar** | Sürücü başına jeton | K6 — sürücü başına sarf | 1,35 | orta |
| 25 | Teltonika **EYE SENSOR** | BLE sıcaklık/nem/hareket | **K7 soğuk zincir** — dorse iç sıcaklığı | 19,50 | orta |
| 26 | Teltonika **EYE BEACON** | BLE işaretleyici | K7 — dorse↔çekici eşleşmesi, ekipman | 15,00 | orta |
| 27 | Teltonika **Röle 12/24 V** | Aktüatör | Uzaktan marş kesme (**hukuken dikkat**) | 6,50 | orta |
| 28 | Teltonika **DualCam** | Kabin içi + yol kamerası | **K8 — Fleet'te ekran yok, yeni modül işi** | 135,66 (SD'siz) / 172,55 (2×64 GB) | orta |

### E · Takograf ve yakıt

| # | Ürün | Sınıf | Fleet'te ne açar | Net € | Güven |
|---|---|---|---|---|---|
| 29 | **DTCO takograf kablo seti** (FMC650 ↔ VDO ön panel) | Kablo | **K5'i fiziksel olarak açar** — K-Line + DDD indirme | 19–49 | orta |
| 30 | **Technoton DUT-E GSM** | Kapasitif yakıt seviye sensörü | **K4 hassas** — %1 doğruluk, yakıt hırsızlığı tespiti | 308,00 | orta |

---

## 4. Tabloya girmeyenler ve neden

Bunlar gerçek seçenek ama **Fleet'e takılmadıkları için** ayrı tutuldu:

| Ürün | Neden tabloda değil | Bilinen fiyat |
|---|---|---|
| **Samsara** VG34 vb. | Kapalı bulut, ham akış vermez, aylık araç ücreti, **doğrudan rakip** | 27–33 USD/araç/ay |
| **Geotab GO9** | Kapalı ekosistem; donanım satın alınsa da MyGeotab aboneliği şart | ~80–120 USD donanım, 30–40 USD/ay paket |
| **Webfleet LINK 710** | Bridgestone ekosistemi, kendi FMS'i | fiyat bulunamadı |
| **Ruptela HCV5 / Pro5** | Teknik olarak iyi ama **kendi protokolü** → yeni parser | fiyat bulunamadı |
| **Queclink GV310LAU** | Aynı sebep | fiyat bulunamadı |
| **VDO DTCO 4.1 / Stoneridge SE5000 Smart 2** | Bu **takografın kendisi**, telematik değil. Araçta zaten olmalı | 599 €'dan itibaren |

---

## 5. Önerilen paketler

Fiyatlar net, cihaz başına, SIM ve montaj hariç.

**Paket 1 — Binek / servis aracı (en ucuz gerçek veri)**
`FMC003` OBD → **72,00 €**. Alet gerekmez, sürücü kendi takar. K1–K4 açılır.
Kamyonda çalışmaz (OBD-II yok, FMS var).

**Paket 2 — Van / hafif ticari (2010 sonrası)**
`FMC150` + iButton okuyucu + anahtar = 80,00 + 9,49 + 1,35 = **90,84 €**.
K1, K2, K3, K4, K6 — CAN dahili, adaptör gerekmez.
*Yaşlı ya da egzotik araç varsa:* `FMC130` + `ALL-CAN300` + iButton = **173,53 €**.

**Paket 3 — Kamyon, tam kapsam (pilot için önerilen)**
`FMC650` + DTCO kablo seti + RFID okuyucu = 111,00 + 34 + 22,99 ≈ **168 €**.
K1–K6 tamamı. FMC650'nin CAN J1939'u FMS'e doğrudan bağlanır, **adaptör gerekmez**.
*FMS'i olmayan eski kamyon / iş makinesi:* + `ALL-CAN300` 114,04 = **282 €**.

**Paket 4 — Dorse**
`TAT140` + `EYE SENSOR` = 66,50 + 19,50 = **86,00 €**. K7 + soğuk zincir.

**10 araçlık gerçekçi pilot** (6 FMS'li kamyon + 2 van + 2 dorse):
6 × 168 + 2 × 90,84 + 2 × 86 = **1 361 €** donanım.
Üzerine SIM (~2–4 €/ay/cihaz) ve montaj işçiliği gelir.

### 5.1 · Doğrulanmış fiyatlar — FMC150 ve FMC650

Hepsi ürün sayfasından okundu, Ağustos 2026, net (KDV hariç).

| Bayi | FMC150 | FMC650 | Stok |
|---|---|---|---|
| MIRIFICA DE | 78,30 | — | sınırlı |
| **teltone-tracker** | **80,00** | **111,00** | ✅ FMC150: 104 adet |
| gpstelematics.eu | 81,82 | 116,53 | ✅ |
| gps-watch.de | — | ~109,20 (129,95 brüt) | ✅ |
| Getic | 92,82 | 121,99 | ❌ FMC150 ön sipariş |
| Getic.de | — | 133,28 (net/brüt belirsiz) | ✅ |
| Slapukas.lt | 97,52 | — | ✅ |
| Capestone | — | £102,78 | ✅ 2–3 gün |

**Aralık:** FMC150 78–98 €, FMC650 109–122 €. Aynı bayide fark **31 €**.
**Stok uyarısı:** Getic'te FMC150 tükenmiş. Pilot takvimi varsa fiyattan belirleyici.
**Arama sonucu başlıklarına güvenme:** "FMC150 best price 63,80 €" ve
"FMC650 best price 90,99 €" başlıkları bayat; aynı sayfaların gövdesi 80,00 € ve
111,00 € gösteriyor. Mağazalar başlığa fiyat gömüp güncellememiş.

---

## 6. Fiyat notu — bunu ciddiye al

Bu tablodaki fiyatların **hiçbiri teklif değil**, hepsi bayi liste fiyatı.

- **Sapma büyük.** FMC130 aynı hafta 40,99 €, 48,00 € ve 69,60 € olarak görüldü.
  FMC650 için 90,99 € / 111,00 € / 121,99 € çıktı. FMC-650'nin resmi Getic sayfası
  121,99 € net derken teltone-tracker 111,00 € net diyor.
- **Güven sütunu** ne demek: *yüksek* = en az iki bağımsız satıcıda benzer fiyat,
  ürün sayfasından doğrulandı. *orta* = tek katalogdan okundu. *düşük* = para birimi
  çevrildi ya da stok yok.
- **Hacim fiyatı ayrı.** 10+ adette Teltonika'nın Alman distribütöründen doğrudan
  teklif alınmalı; sokak fiyatının belirgin altına iner.
- **Dahil olmayanlar:** SIM/veri tarifesi, montaj işçiliği (kamyonda takograf bağlantısı
  atölye işi), kablo setleri, KDV.

**Sipariş öncesi:** 3 dağıtıcıdan (Getic, Capestone, Teltonika DE distribütörü)
yazılı teklif al ve bu tabloyu güncelle.

---

## 7. Donanım gelmeden kapatılması gereken kod işi

Cihaz alıp da kullanamamak riski burada. Sıraya göre:

### 7.1 · Sıra

1. **Gerçek DDD parser yok.** `src/tachograph/ddd/synthetic-ddd-parser.ts` kendi TLV
   etiketleriyle çalışıyor (`TAG_ACTIVITY_CHANGES = 0x2001` vb.) — bu AB takograf
   dosya formatı değil. FMC650'den gelen gerçek DDD dosyası **ayrıştırılamaz**.
   `DddParserPort` arayüzü mevcut, yani takılabilir; ama gerçek parser yazılmalı.
   **K5'in tamamı buna bağlı — FMC650 almadan önce bu bitmeli.**
2. **IO eşlemesi doğrulanmamış.** `avl-io-map.ts:22` kendi kendine söylüyor:
   *"TODO device-side verify — exact IDs and scaling vary by firmware/profile."*
   ID'ler ve ölçekleme cihaz üstünde FOTA profiliyle doğrulanmalı. Yanlış ölçekleme =
   sessizce yanlış rapor.
3. **Cihaz eşleştirme akışı (T5) yok.** `devices` modülü CRUD'da kalmış; IMEI→araç
   eşlemesi için saha akışı yok. Montajcı cihazı nasıl kaydedecek?
4. **K8 video için ekran yok.** DualCam alınırsa oynatma/saklama modülü sıfırdan.
   GDPR açısından da en ağır kalem — kabin içi kamera Betriebsrat konusu.

---

## 8. Kaynaklar

- [Getic — Teltonika CAN adaptörleri](https://www.getic.com/shop/teltonika-can-adapters)
- [Getic — Teltonika FMC650](https://www.getic.com/product/teltonika-fmc650)
- [Getic — Teltonika FMC130](https://www.getic.com/product/teltonika-fmc130) · [FMC150](https://www.getic.com/product/teltonika-fmc150) · [FMC003](https://www.getic.com/product/teltonika-fmc003)
- [Capestone — FMC130 ölçü/ağırlık](https://www.capestone.com/en/product/teltonika-fmc130/)
- [Trackiber — FMC150 dahili CAN vs FMC130 + CAN-CONTROL karşılaştırması](https://trackiber.com/en/blogs/news/fmc150-vs-fmc130-native-can-vs-can-control)
- [Teltonika Wiki — FMx150 Tachograph solution](https://wiki.teltonika-gps.com/view/FMx150_Tachograph_solution) · [FMx150 CAN – Tachograph](https://wiki.teltonika-gps.com/view/FMx150_CAN_%E2%80%93_Tachograph)
- [Teltonika — TachoSync](https://www.teltonika-gps.com/solutions/tachosync) · [Web Tacho](https://www.teltonika-gps.com/solutions/web-tacho)
- Fiyat sayfaları: [teltone FMC150](https://teltone-tracker.com/en/tracker-4glte/35-teltonika-fmc150-4779027310442.html) · [gps-watch.de FMC650](https://shop.gps-watch.de/products/teltonika-fmc650) · [Capestone FMC650](https://www.capestone.com/en/product/teltonika-fmc650/)
- [teltone-tracker — FMC650 ürün sayfası](https://teltone-tracker.com/en/tracker-4glte/48-teltonika-fmc650-4g-4779027310275.html)
- [gotracker-store — Teltonika fiyat listesi](https://gotracker-store.com/en/)
- [teltone-tracker — TAT140](https://teltone-tracker.com/en/tracker-asset/80-teltonika-tat140-4779027312897.html)
- [Teltonika Wiki — FMC650 ve takograf çözümü](https://wiki.teltonika-gps.com/view/FMC650_and_Tachograph_Solution)
- [Teltonika — Tachograph Front Panel Cable](https://teltonika-gps.com/products/accessories/data-cables/tachograph-front-panel-cable)
- [Teltonika — DualCam](https://www.teltonika-gps.com/products/accessories/video-telematics/teltonika-dualcam)
- [Technoton e-shop — DUT-E GSM](https://e-shop.jv-technoton.com/product/dut-e-gsm/)
- [Ruptela HCV5](https://ruptela.com/product/hcv5/) · [Queclink GV310LAU](https://www.queclink.com/product/gv310lau/)
- [Samsara fiyatlandırma 2026](https://airpinpoint.com/compare/samsara-pricing) · [Geotab fiyatlandırma 2026](https://www.stackscored.com/pricing/fleet-management/geotab/)
