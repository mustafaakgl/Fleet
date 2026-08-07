# Mobil Denetim — 375 px

**Tarih:** 2026-08-07 · **Kapsam:** dashboard + portal + pazarlama sayfaları · **Görünüm:** 375×812, `isMobile`, dokunmatik

## Yöntem

`frontend/app` altındaki 119 `page.tsx` rotası çıkarıldı. Dinamik rotalar için API'den gerçek kayıt
ID'si çözüldü; 4 rota örnek kayıt bulunamadığı için atlandı (aşağıda). Kalan **115 rota** gerçek
Chrome ile 375 px'te tek tek açıldı; her sayfada konsol hataları, 400+ dönen istekler, yatay taşma
(ve taşmayı yapan element) ve dokunma hedefi boyutları ölçüldü, ekran görüntüsü alındı.

İlk tarama **admin** hesabıyla yapıldı. Bu, rol kısıtlı rotalar için yanlış bir mercek olduğundan
`/driver/*` sürücü hesabıyla, `/portal/*` müşteri hesabıyla ayrıca doğrulandı.

Rate limiter tüm denetimi tek kovaya sokmasın diye her sayfaya ayrı `X-Forwarded-For` verildi.

**Atlanan 4 rota** (veritabanında örnek kayıt yok): `/driver/messages/[id]`,
`/fleet-analytics/fuel/entries/[id]`, `/fleet-analytics/trips/[id]`, `/service-history/[id]`.

## Sonuç

Düzen 375 px'te büyük ölçüde sağlam: **115 sayfanın 111'inde yatay taşma yok.** Aşağıdaki altı
bulgu gerçek; denetim ortamından kaynaklanan gürültü en sonda ayrıca listelendi.

---

## Bulgular

### 1. Fatura detay sayfası çöküyor — YÜKSEK

`/invoicing/invoices/[id]` açıldığında sayfa tamamen düşüyor, kullanıcı "Something went wrong"
görüyor. Error boundary yakalıyor ama içerik hiç render edilmiyor.

**Kök neden.** API `taxBreakdown`'ı vergi oranına göre anahtarlanmış bir **nesne** döndürüyor:

```json
{"standard_1900": {"netCents": 235500, "taxCents": 44745, "grossCents": 280245}}
```

Arayüz ise dizi bekliyor — `frontend/app/(dashboard)/invoicing/invoices/[id]/page.tsx:143`:

```ts
const taxRows = useMemo(() => invoice?.taxBreakdown ?? [], [invoice]);
```

`?? []` yalnızca `null`/`undefined` durumunu karşılıyor; gelen değer nesne olduğu için olduğu gibi
geçiyor ve 520. satırdaki `taxRows.map(...)` `TypeError: taxRows.map is not a function` atıyor.

Muhasebecinin ana aracı olduğu için etkisi büyük. Düzeltme ya arayüzde `Object.entries` ile
normalize etmek ya da uçta diziye çevirmek; hangisi seçilirse `CustomerAssignment`/fatura tipleri
de buna göre güncellenmeli. Mobilde değil masaüstünde de aynı şekilde çöküyor — bu bir düzen
sorunu değil.

### 2. `/driver/*` yanlış rolde boş ekranda kalıyordu — ORTA · DÜZELTİLDİ

Admin hesabıyla herhangi bir `/driver/*` adresine girildiğinde kullanıcı `/dashboard`'a
yönlendirilmesi gerekirken `/driver`'da kalıyor, `DriverPortalRoute` de `canRender` false olduğu
için `null` döndürdüğünden bomboş bir ekran görüyordu.

**Kök neden.** `components/providers/DriverPortalRoute.tsx` iki yönlendirmeyi yarıştırıyordu:

```ts
router.replace(target);
if (typeof window !== 'undefined' && window.location.pathname !== target) {
  window.location.replace(target);
}
```

`router.replace()` asenkron; hemen ardından senkron okunan `window.location.pathname` henüz
değişmediği için sert yönlendirme de her seferinde tetikleniyordu. İki navigasyon birbirini iptal
ediyor, tarayıcı `/driver`'da kalıyordu. Ölçümde `/dashboard` belgesi isteniyor ama sayfa
`/driver`'da kalıyordu.

**Düzeltme.** Kardeş bileşenler `CustomerPortalRoute` ve `ProtectedRoute` yalnızca
`router.replace()` kullanıyor ve doğru çalışıyor; `DriverPortalRoute` de aynı desene çekildi.
Doğrulandı: admin `/driver` → `/dashboard` (2.589 karakter), sürücü `/driver` → sürücü portalı
(1.043 karakter).

**Not — ilk teşhis yanlıştı.** Bu bulgu raporun ilk sürümünde "tarayıcıyı kilitliyor" diye
geçiyordu. Rotalar önceden derlenip zaman aşımları yükseltilince kilitlenmenin test ortamından
geldiği, uygulamada böyle bir donma olmadığı görüldü. Gerçek kusur boş ekrandı.

### 3. Mobilde yatay taşma — 4 sayfa

Ekran 375 px iken içerik daha geniş; sayfa yana kayıyor.

| Sayfa | Taşma | Sebep |
|---|---|---|
| `/` | +31 px | Footer'daki `Bußgeld-Rechner` bağlantısı (+30 px), `m-mobile-cta` bloğu |
| `/funktionen` | +31 px | Aynı footer bağlantısı (+30 px) |
| `/preise` | +31 px | Aynı footer bağlantısı (+30 px) |
| `/tools/tuev-checker` | +40 px | `Fahrzeugtyp` etiketi ve `<select>` alanı |

Dördü de **pazarlama/araç sayfaları** — yani potansiyel müşterinin telefonda ilk gördüğü yerler.
İlk üçünün sebebi aynı tek footer bağlantısı olduğu için tek düzeltmeyle üçü birden kapanır.

### 4. Fotoğrafı olmayan araç için 404 — DÜŞÜK

`GET /api/v1/vehicles/{id}/photo` fotoğrafı olmayan araçlarda 404 dönüyor, arayüz yine de istiyor.
Denetim boyunca 100'den fazla 404 kaydedildi. İşlevi bozmuyor ama konsolu kirletiyor ve her araç
kartı için gereksiz bir istek üretiyor.

### 5. Yanlış rolde bomboş ekran — DÜŞÜK

Admin `/portal/assignments`'a girdiğinde tamamen boş bir sayfa geliyor (0 karakter). Müşteri
hesabıyla aynı sayfa 9.402 karakterle sorunsuz render oluyor. 2. bulgunun daha hafif hâli:
yönlendirme ya da "yetkiniz yok" yerine boş ekran.

### 6. Customer portal metinleri kodda sabit İngilizce — DÜŞÜK

`frontend/app/(customer-portal)/portal/assignments/page.tsx` içinde `"Assignments"` ve
`"Assignments could not be loaded."` doğrudan koda gömülü. `CLAUDE.md` 7. kural her kullanıcıya
görünen metnin de/en/tr locale dosyalarına eklenmesini şart koşuyor.

### 7. Sürücü portalı alt menüsünde etiketler üst üste biniyor — DÜŞÜK

375 px'te alt gezinme çubuğundaki beş sekmenin etiketleri çakışıyor: `Talepler`,
`Raporlar + bildirimler` ve `Profil` iç içe geçmiş durumda. Sebebi ortadaki sekmenin uzun etiketi;
beş sekme 375 px'e sığmıyor.

Taşma ölçümü bunu yakalamadı — içerik viewport'u aşmıyor, elemanlar birbirinin üstüne biniyor.
Denetim betiği çakışmayı değil taşmayı ölçtüğü için gözden kaçtı; ekran görüntüsüne bakarken
fark edildi. Sürücünün her ekranda gördüğü kalıcı bir çubuk olduğu için görünürlüğü yüksek.

### Doğrulanmamış sinyal: küçük dokunma hedefleri

Değerlendirilen 90 sayfanın 57'sinde 32 px'in altında dokunma hedefi sayıldı; en yoğunu
`/departure-checks` (2.284), `/invoicing` (985), `/documents` (285). Bu sayılar ölçümden geliyor,
tek tek doğrulanmadı — veri yoğun tablolarda ölçüm gerçekte sorun olmayan satır içi bağlantıları
da sayıyor olabilir. Erişilebilirlik önceliklendirilecekse başlangıç noktası olarak kullanılabilir,
bulgu olarak değil.

---

## Denetim gürültüsü — bunlar hata değil

İlk taramada çıkan ve incelendikten sonra elenen sinyaller, kayıt için:

- **15 sayfada "timeout", 9 sayfada "boş içerik".** Dev modunda ilk derleme süresi ölçüm limitimi
  aşıyordu. Zaman aşımları yükseltilince `/vehicles/{id}` (4.981 karakter), `/vehicles/assignments`
  (3.508), `/settings/profile` (736), `/onboarding` (225) dahil hepsi düzgün render oldu.
  Production build'de bu gecikme ortadan kalkar.
- **HMR websocket hatası (95 sayfa).** `ws://127.0.0.1:3001/_next/webpack-hmr` — dev sunucusu
  artefaktı, üretimde yok.
- **`401 POST /auth/login` (10 kez).** `NEXT_PUBLIC_AUTO_LOGIN` dev'de varsayılan açık ama koddaki
  varsayılan şifre (`admin123`) seed ile uyuşmuyor; giriş formuna düşüyor.
- **429 Too Many Requests (92 kez).** Büyük ölçüde denetimin kendi hızından. Ancak altında gerçek
  bir sınır var, aşağıda.

## Yan bulgu: rate limit tek sayfada aşılabiliyor

Global sınır IP başına 100 istek/dakika (`backend/src/app.module.ts:71`). Araç listesi gibi çok
sayıda araç fotoğrafı yükleyen bir sayfa bu bütçeyi tek başına zorluyor ve 429 almaya başlıyor.
Denetim hızından bağımsız olarak, çok araçlı bir kiracıda gerçek kullanıcının da karşılaşabileceği
bir durum. Fotoğraf uçlarını sınırdan muaf tutmak veya sayfalama başına istek sayısını düşürmek
değerlendirilmeli.

## Ekler

- Ham sonuçlar: `results.json` (115 sayfa, sayfa başına konsol/istek/taşma kaydı)
- Ekran görüntüleri: 100 adet, 375×812
- Denetim betiği: `mobile-audit.mjs`

Bu dosyalar oturum çalışma dizininde; kalıcı olmasını istersen repoya taşınabilir.
