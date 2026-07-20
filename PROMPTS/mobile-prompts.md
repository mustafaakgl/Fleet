# MOBILE Görev Promptları — sırayla: 1 → 2 → 3 → 4 → 5

Ortak kurallar (hepsinde geçerli):
- Otonom çalış; aynı hatada 3 tur = DUR ve raporla.
- Kanıtlar chat'e değil PROMPTS/logs/kanit/<gorev>.md dosyasına (komut + ham çıktı);
  chat'te yol + tek cümle özet.
- Kapsam dışına çıkma; assertion/test gevşetme yasak.
- Çalışma dizini: mobile-driver/. Backend'e dokunmak gerekirse minimum ekle ve belirt.
- Commit formatı: `mobile: <ozet> (MOBILE-<n>)` + loop_journal satırı.
- Test için başlattığın süreçleri tur sonunda kapat.

---

## MOBILE-1 — Çökme + gerçek buglar + tip kapısı

```
GÖREV MOBILE-1: mobile-driver'daki gerçek bugları düzelt, tsc'yi sıfır hataya indir.

1. KRİTİK: app/(app)/_layout.tsx:4 — Fragment 'react-native'den import edilmiş
   ('react' olmalı). Düzelt ve DOĞRULA: iOS simülatöründe (veya Expo Go/dev client)
   login sonrası tab bar'ın render olduğunu gör; kanıt dosyasına ekran görüntüsü
   yolu veya log satırı.
2. Diğer gerçek buglar:
   - today/fuel.tsx:262 — Date beklenen yere locale string geçiliyor; düzelt.
   - DriverReportsPanel.tsx:367 — radius.full theme'de yok: ya theme'e ekle
     (tam yuvarlak = 999) ya doğru token kullan; tüm radius.full referanslarını tara.
   - requests/index.tsx — 'uniform_delivery' createRequest tip union'ında yok:
     backend'in gerçekte kabul ettiği değeri bul, tipi/değeri EŞİTLE (tahmin etme,
     backend DTO'suna bak).
3. Typed-routes: .expo/types üretimini yenile (npx expo customize / typegen) —
   ~30 bayat route hatası kapansın.
4. HEDEF KANIT: cd mobile-driver && npx tsc --noEmit → 0 hata (ham çıktı kanıt
   dosyasına).
5. CI: .github/workflows/ci.yml'e mobile-typecheck job'u ekle (sadece tsc,
   build değil — hızlı kalsın).
6. Ayrıca kontrol et ve RAPORLA (düzeltme değil, tespit): mobil tarafta mesai
   (work-session) mantığı var mı; varsa DRIVER-3'ün manuel başlat/bitir ilkesiyle
   çelişiyor mu? (Sonraki görevlerin girdisi.)
Commit: `mobile: cokme fixi + gercek buglar + tsc sifir (MOBILE-1)`.
```

## MOBILE-2 — Push'u gerçeğe bağla + yayın temeli

```
GÖREV MOBILE-2: Push bildirimlerini gerçek build'de çalışır yap, yayın temelini kur.
NOT: Bu görevde SENİN YAPAMAYACAĞIN adımlar var (hesap girişleri) — o noktalarda DUR
ve kullanıcıdan iste; kalan her şeyi hazırla.

1. EAS temeli: eas.json oluştur (development/preview/production profilleri);
   app.json'a ios.bundleIdentifier (örn. de.operion.driver) + android.package +
   version/buildNumber; extra.eas.projectId için yer hazırla.
   DUR-NOKTASI: `eas init` / `eas login` kullanıcı hesabı ister — kullanıcıya
   komutları ver, çıktısını bekle.
2. Bildirim altyapısı: app.json'a notification bloğu (ikon+renk); Android
   notification channel oluşturma kodu (varsayılan kanal, ses+önem);
   push token kaydına RETRY (login'de başarısızsa: app foreground + izin
   değişiminde tekrar dene; durumu profile ekranında göster:
   "Bildirimler: aktif/kapalı — aç" satırı).
3. FCM/APNs: DUR-NOKTASI — google-services.json (Firebase) ve APNs anahtarı
   kullanıcıdan istenecek; hangi adımlarla alacağını TARİF ET (madde madde,
   ekran isimleriyle), dosya yollarını hazırla.
4. Prod API adresi: extra.apiBaseUrl'i eas.json profillerinden beslenir yap
   (dev: mevcut davranış; preview/prod: https placeholder — kullanıcı domainini
   verince tek satır değişecek).
5. OTA: expo-updates ekle + eas.json'a channel bağla (acil düzeltmeleri store
   incelemesi beklemeden basabilmek için).
6. Uygulama ikonu: assets'e icon/adaptive-icon üret — operion-mark.svg'den
   (frontend/public/brand'de) 1024px PNG türet; splash'i markayla hizala.
7. KANIT HEDEFİ: eas build --profile preview (kullanıcı onayıyla) → gerçek
   cihazda kurulum + login sonrası push token'ın backend'e kaydolduğu
   (DB satırı/log) + test push'unun cihaza düştüğü.
Commit'ler: yapılandırma ve kod ayrı ayrı, `mobile: ... (MOBILE-2)` + journal.
```

## MOBILE-3 — Ofis iletişim paritesi

```
GÖREV MOBILE-3: Ofis→sürücü iletişimini uygulama İÇİNDE de garantiye al.

1. NOTIFICATIONS SEKMESİ: notifications'ı gizli route olmaktan çıkar — tab bar'a
   rozetli sekme olarak ekle (unread sayısı; messages rozetiyle aynı desen).
   Sekme sayısı 6'yı geçmesin: Reports ile Requests'i tek "İşlemler" sekmesinde
   birleştirmek serbest (UX kararını sen ver, gerekçele).
2. CANLILIK: notifications 30 sn polling + AppState foreground'da refetch;
   requests/fines/defects ekranlarına foreground refetch (React Query
   refetchOnWindowFocus/AppState köprüsü — tek merkezi hook yaz, ekranlara uygula).
3. MESSENGER EKLERİ: web paritesi —
   - Gönderme: kamera/galeri/dosya (10MB, pdf/jpg/png/webp, max 3) mevcut backend
     endpoint'iyle; upload progress + hata/retry.
   - Görüntüleme: görsel önizleme (tıkla-büyüt), dosya kartı (ad+boyut+indir,
     authenticated download).
4. OPTIMISTIC SEND: mesaj anında balon olarak görünsün (sending durumu),
   başarısızsa kırmızı + "tekrar dene"; web'deki desenle aynı davranış.
5. i18n: yeni metinler TÜM 13 dile (en azından de/en/tr tam; diğerlerine en
   fallback + sync-locale-keys script'ini koştur).
KANIT: tsc 0; cihaz/simülatörde: ofisten mesaj+ek gönder → mobilde düştü,
mobilden ek gönder → webde göründü; notifications rozeti artıyor/sıfırlanıyor.
Commit: `mobile: ofis iletisim paritesi (MOBILE-3)`.
```

## MOBILE-4 — Offline aksiyon kuyruğu

```
GÖREV MOBILE-4: GPS kuyruğu desenini kritik aksiyonlara genelle.

1. trip-location-queue.ts'i temel alan genel OfflineActionQueue (SQLite):
   kayıt = {id(uuid), type, payload, createdAt, attempts}. Kapsam TİPLERİ:
   mesaj gönderimi, kaza/hasar/arıza raporu, ekipman imzası, ceza onayı,
   handover fotoğrafı. BAŞKA TİP EKLEME.
2. Idempotency: her kayda clientRequestId; backend DRIVER-2'de bunu destekliyor —
   mobil isteklere aynı alanı ekle; desteklemeyen endpoint varsa backend'e
   minimum ekleme yap (belirt).
3. Davranış: network hatası → kuyruğa; NetInfo online + app foreground → sırayla
   flush (attempts++, 5'te kalıcı-hata işaretle ve kullanıcıya göster).
4. UI: global ince banner "Çevrimdışı — N işlem bekliyor / Senkronize ediliyor";
   ilgili ekranlarda öğe bazlı "bekliyor" rozeti.
5. TEST: kuyruk modülüne birim test (enqueue/flush/idempotent tekrar/attempts);
   cihazda uçak modu senaryosu: rapor gönder → uçak modu kapat → otomatik gitti
   (kanıt: log + backend kaydı).
Commit: `mobile: offline aksiyon kuyrugu (MOBILE-4)`.
```

## MOBILE-5 — Cila

```
GÖREV MOBILE-5: Kullanım cilası.
1. Tarih/saat girişlerini native picker'a çevir (@react-native-community/datetimepicker
   veya expo uyumlu eşdeğeri): leave-request, transport request, fuel — regex metin
   alanları kalksın.
2. Hex kaçaklarını theme token'larına çevir (requests/index.tsx, equipment imza
   ekranı ve grep'le bulacağın diğerleri) — yeni renk üretme, mevcut theme'i kullan.
3. Arka plan GPS: KOD YAZMA — ürün kararı dosyası yaz (docs/mobile-background-gps.md):
   gereklilik, izin/mağaza inceleme maliyeti, pil etkisi, öneri. Kullanıcı karar verecek.
4. Profile'a "Bildirim durumu" satırı yoksa (MOBILE-2'den) tamamla.
KANIT: tsc 0; picker'ların iOS+Android görünümü (ekran görüntüsü yolu).
Commit: `mobile: kullanim cilasi (MOBILE-5)`.
```
