# FMC003 Devreye Alma

> Cihaz elde yokken hazırlanan çalışma sırası. Kod tarafı bitti; kalan adımlar
> cihaz gelince yapılacak ve **bir tanesi zorunlu**: AVL ID doğrulaması.
>
> Donanım kararının gerekçesi: [telematik-donanim-secim.md](telematik-donanim-secim.md)

---

## 1. Kod tarafında hazır olanlar

| Parça | Durum |
|---|---|
| Codec 8 / 8E çözümü | Zaten vardı — `codec8-parser.ts` |
| IMEI → araç bağlama | Zaten vardı — `teltonika-gateway.service.ts` |
| `DeviceModel.FMC003` | **Eklendi** — bu olmadan cihaz kaydedilemiyor, kayıt olmadan el sıkışma reddediliyor |
| Model bazlı IO eşlemesi | **Eklendi** — `FMC003_IO_MAP`, ana ünitelerinkinden ayrı |
| OBD arıza kodu okuma | **Eklendi** — AVL 30 sayaç + AVL 281 metin |
| Ham IO kaydı | **Eklendi** — `TELEMATICS_IO_CAPTURE` |

### Neden ayrı harita

Aynı AVL ID modele göre başka anlama geliyor:

| AVL | Ana ünite (FMC130/650) | FMC003 |
|---|---|---|
| **32** | motor devri | **soğutucu sıcaklığı** |
| 390 | — | yakıt seviyesi (OEM) |
| 389 | — | kilometre (OEM) |
| 30 + 281 | — | arıza kodu sayacı + kodların kendisi |

Ortak harita kullanılsaydı motor sıcaklığı `rpm` sütununa hata vermeden yazılırdı.
`avl-io-map.spec.ts` bunu iki testle sabitliyor.

---

## 2. Cihaz gelince — sıra

### 2.1 · SIM ve FOTA

1. SIM'i tak, APN'i FOTA WEB'den gir.
2. Sunucu ayarı: **TCP**, `DEVICE_HOST` + `DEVICE_PORT` (varsayılan 5027).
3. Protokol: **Codec 8 Extended**. Düz Codec 8 de çalışır ama arıza kodu metni
   (AVL 281) yalnızca Extended'da geliyor — Extended seç.
4. IO listesinde şunları aç: `239` (kontak), `66` (voltaj), `30`, `281`, `32`,
   `389`, `390` ve devir elemanı.

### 2.2 · Cihazı Fleet'e kaydet

Cihazlar ekranı → yeni cihaz → IMEI + model **FMC003** + araç.
Kayıt yoksa ağ geçidi bağlantıyı reddeder (`imei rejected` log satırı).

### 2.3 · AVL ID doğrulaması — ATLANMAMALI

Bu adımın sebebi: veri sayfası tablosu `rpm` için ID vermiyor, ve ID'ler
firmware/profile göre oynayabiliyor. Haritada bu yüzden **doğrulanmamış** olarak
işaretli bir satır var.

```bash
TELEMATICS_IO_CAPTURE=true TELEMATICS_IO_CAPTURE_IMEI=<imei> npm --prefix backend run start:gateway
```

Aracı çalıştır, birkaç dakika sür. Log'da her kayıt için şöyle bir satır çıkar:

```
io-capture imei=35... model=FMC003 event=0 total=9 unmapped=[24,68,181] 32=91 66=13980 239=1 389=154321 390=62
```

- `unmapped=[...]` → haritanın kullanmadığı elemanlar. Devir buradaysa
  `FMC003_IO_MAP.fields.rpm` düzeltilir.
- Değişken uzunluklu elemanlar okunabilir metinse tırnak içinde görünür:
  `281="P0100,P0234"`.

Sonra `TELEMATICS_IO_CAPTURE`'ı kapat — sürekli açık kalacak bir şey değil.

### 2.4 · Kontrol listesi

- [ ] Canlı takip haritasında araç görünüyor
- [ ] `VehicleTelemetryLatest`: kontak, voltaj, soğutucu, km, yakıt dolu
- [ ] Sert fren/hızlanma olayları düşüyor (`FleetDrivingEvent`)
- [ ] Bilerek bir arıza lambası yakılıp `VehicleDtc`'ye kod düşüyor mu

---

## 3. Bu cihazın vermeyeceği şeyler

Yazılımla çözülmez, donanımda yok:

- **Sürücü kimliği** — 1-Wire pini yok, iButton takılamaz. Çok sürücülü araçta
  `FleetTrip.driverId` boş kalır.
- **İmmobilizer** — DOUT yok, röle kesilemez.
- **Kamyon** — OBD-II soketi bu veriyi vermiyor; cihaz binek ve van için.
- **Gerçek yakıt tüketimi** — `GNSS Fuel Counter` mesafeden tahmin. OEM
  parametresi araca göre değişiyor, filodaki modeller Teltonika'nın desteklenen
  araç listesinden kontrol edilmeli.

---

## 4. Bilinen açık

**Arıza kodu temizleme.** Cihaz "3 arıza var" deyip kodları okunamayan bir
biçimde gönderirse, sistem mevcut arıza kayıtlarına **dokunmuyor** ve log'a
uyarı yazıyor:

```
device reports fault codes but none could be decoded imei=... — existing DTC records left untouched
```

Bu bilinçli: boş liste göndermek açık arızaları "giderildi" saymak olurdu.
Böyle bir satır görülürse 2.3'teki kaydı açıp AVL 281'in gerçek biçimi okunmalı,
`parseObdDtcCodes` ona göre genişletilmeli.
