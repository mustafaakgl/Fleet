# Mobile Driver App — Değerlendirme Raporu
*Bakış: UI/UX Designer + Frontend Engineer + ERP Analisti · Odak: office/admin/boss ile iletişim · Kaynak: tam kod incelemesi (Expo SDK 52, expo-router v4) · 13.07.2026*

## Yönetici özeti

Uygulama **sanılandan çok daha olgun**: 25+ ekran, tamamı gerçek API'de, 13 dilde
(Arapça RTL dahil!), native imza, EXIF+GPS damgalı kamera, SQLite'lı offline GPS
kuyruğu, sıfır TODO/`as any`. Tasarım sistemi tutarlı, Operion markalı.

Ama iki ağır sorun var ve ikisi de tam senin sorduğun yerde — **ofis↔sürücü
iletişiminde**:

1. **Push bildirimleri gerçek build'de büyük ihtimalle ÇALIŞMAYACAK.** Kod tarafı
   eksiksiz yazılmış (token kaydı, derin bağlantı yönlendirme, soğuk başlatma) ama
   altyapı bağlanmamış: EAS projectId yok, FCM/APNs kimlik bilgisi yok, Android
   bildirim kanalı yok, kayıt tek seferlik ve retry'sız. Sonuç: **uygulama kapalıyken
   sürücüye ulaşamazsın** — yeni görev, mesaj, ihlal onayı, ekipman imzası... hepsi
   sürücü uygulamayı açana kadar bekler.
2. **Muhtemel çökme:** `app/(app)/_layout.tsx:4` — `Fragment`, `react` yerine
   `react-native`'den import edilmiş; runtime'da undefined → ana uygulama kabuğu
   çökebilir. TÜM giriş yapmış ekranları saran bileşen bu. Derhal doğrulanmalı.

## Ofis↔sürücü iletişim karnesi (asıl odak)

| Kanal | Durum | Not |
|---|---|---|
| Push (uygulama kapalıyken) | ❌ Build-hazır değil | Kod var, altyapı yok — 1 numaralı boşluk |
| Bildirim gelen kutusu | ⚠️ Var ama gömülü | Sekmesi yok (href:null), rozeti yok, otomatik yenilenmiyor — push da yoksa ofis bildirimi görünmez kalır |
| Messenger | ⚠️ Kısmi parite | Çeviri toggle'ı var ✓, 10 sn polling ✓; ama **ek gönderme YOK** (ofis dosya yollayamaz), optimistic send yok (yavaş ağda bekletiyor, hata/retry balonu yok), sürücü yeni konuşma başlatamıyor |
| Talep/onay döngüsü | ✅ İyi | İzin (9 tip) + üniforma + transport talepleri, ekleriyle; ofis kararı (onay/red+sebep) sürücüye görünüyor |
| Ekipman imzası | ✅ Native | signature-canvas ile; form görüntüleme + imzalı PDF erişimi çalışıyor |
| Veri tazeliği | ⚠️ Sadece polling | Messenger 10 sn; talepler/cezalar/arızalar/bildirimler otomatik yenilenmiyor — ofis kararları manuel yenilemeye kadar bayat |

## Frontend mühendisi bulguları

- `tsc`: 36 hata — ~30'u bayat typed-routes üretimi (kozmetik, regen ister),
  **6'sı gerçek bug**: Fragment import'u (çökme riski), fuel.tsx tarih hatası,
  tanımsız `radius.full`, `uniform_delivery` tip uyumsuzluğu.
- API base URL **yalnızca dev**: Metro host IP / localhost türetiliyor; üretim HTTPS
  adresi hiçbir yerde yok (`extra.apiBaseUrl` boş).
- Auth: SecureStore ✓ ama refresh token yok — token süresi dolunca sessiz logout.
- **Yayın hazırlığı zayıf:** eas.json yok, bundle id/package yok, uygulama ikonu yok
  (assets'te sadece logo), expo-updates (OTA) yok. Store'a çıkarılabilir durumda değil.
- Offline: GPS noktaları için SQLite kuyruğu örnek nitelikte ✓; ama mesaj, rapor,
  imza, ceza onayı offline'da sert düşüyor (web'in IndexedDB kuyruğunun mobil
  karşılığı yok).
- Arka plan GPS yok — izin metni "sevkiyat aracı izler" diyor ama takip yalnızca
  uygulama öndeyken (watchPositionAsync); arkaplanda sessizce durur.

## UI/UX bulguları

- Tasarım sistemi (theme + 35 ortak bileşen) tutarlı; birkaç ekranda hex kaçağı
  (`#FFFFFF`, `#CBD5E1`... token yerine) ve tanımsız radius.
- Tarih/saat alanları çıplak metin (`YYYY-MM-DD` regex'li) — native picker yok,
  eldivenli elde ciddi sürtünme.
- Bildirimlerin sekmesizliği bilgi mimarisi hatası: messages rozeti var,
  notifications rozeti yok — iki "gelen kutusu"ndan biri görünmez.

## ERP analisti bulguları

- Süreç kapsaması web portalından bile geniş: Abfahrtkontrolle **ayrı ekran olarak
  var** (webde yoktu!), Führerscheinkontrolle (ön/arka/selfie), ceza onayı, arıza
  takibi, yakıt fişi — sahadaki tüm veri giriş noktaları mevcut.
- 13 dil, profil senkronlu — Doğu Avrupa/Orta Doğu sürücü işgücü için satış artısı.
- Kanıt zinciri mobilde de sağlam: handover fotoğrafına takenAt+GPS+cihaz bilgisi
  gömülüyor.
- Risk: mesai/mola gerçekliği web'dekiyle aynı ilkeye bağlanmalı (DRIVER-3 mantığı
  mobile de yansımalı — doğrulanmadı, MOBILE-1'de kontrol edilecek).

## Önerilen görevler (öncelik sırasıyla)

**MOBILE-1 — Çökme + gerçek buglar + tip kapısı (S):** Fragment import'u düzelt ve
cihazda/simülatörde doğrula; fuel tarih bugı; radius.full; uniform_delivery tipi;
typed-routes regen; `tsc --noEmit` 0 hata → CI'a mobile typecheck adımı.

**MOBILE-2 — Push'u gerçek yap + yayın temeli (M):** EAS projesi + projectId,
FCM/APNs kimlikleri, app.json notification bloğu + Android kanalı, kayıt retry'ı,
bundle id/package + ikonlar + eas.json profilleri, prod apiBaseUrl (env),
expo-updates. Çıktı: TestFlight/iç dağıtım build'i + gerçek cihazda push kanıtı.

**MOBILE-3 — Ofis iletişim paritesi (M):** Notifications'a sekme + rozet + 30sn
polling + foreground refetch; messenger'a ek gönderme/görüntüleme + optimistic
send/hata/retry; talepler-cezalar ekranlarına foreground yenileme.

**MOBILE-4 — Offline aksiyon kuyruğu (M):** GPS kuyruğu desenini genelle: rapor,
imza, ceza onayı, mesaj için SQLite kuyruk + clientRequestId idempotency (backend
desteği DRIVER-2'de hazır) + "bekleyen gönderim" göstergesi.

**MOBILE-5 — Cila (S):** Native tarih/saat picker'ları, hex→token temizliği,
arka plan GPS kararı (ürün kararı: gerekli mi? gerekliyse izin+TaskManager işi).

*Sıra önerisi: 1 (bugün) → 2 (pilot için şart) → 3 → 4 → 5. MOBILE-2 bitmeden
mobil uygulama pilotta kullanılmamalı; o zamana kadar sürücüler web portal/PWA'da.*
