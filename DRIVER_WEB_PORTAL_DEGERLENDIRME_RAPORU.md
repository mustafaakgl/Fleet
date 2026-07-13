# Driver Web Portalı — Değerlendirme Raporu

*Bakış açısı: Kıdemli ERP analisti + UI designer. Kaynak: kod incelemesi (tüm driver-portal sayfaları, API katmanı, GPS hook'u, route guard). Tarih: 08.07.2026*

## Yönetici özeti

Portal **üretim kıvamında ve mutlu yolda eksiksiz**: 13 sayfa, hepsi gerçek API'ye bağlı,
mock/TODO yok. Alt navigasyon, canlı kamera (EXIF+GPS damgalı), imza tuvali, optimistic
mesajlaşma, sunucu kontrollü GPS paylaşımı — hepsi çalışıyor. Günlük zincir telefonda
tamamlanabiliyor: check-in → görev → devir-teslim → rapor → ekipman imzası → mesaj.

Üç kritik risk, üçü de sürücü **vardiya ortasında, zayıf çekimdeyken** vuruyor:

1. **Offline katmanı yok** — çekimsiz bölgede foto/rapor/konum kaybolur.
2. **Ana sayfa hataları yutuyor** — API düşerse sürücü boş ekran görür, hata yok, retry yok.
3. **İki akış menüden ulaşılamıyor** — handover ve ekipman imzası sadece koşullu banner/
parametreyle açılıyor; koşul tetiklenmezse sürücünün oraya gidecek yolu yok.

## ERP analisti bulguları (süreç + veri)

Konu
Durum
Değerlendirme

Günlük süreç zinciri
✅ Tam
Check-in görevden ön-dolduruluyor, gerekirse otomatik handover'a yönlendiriyor — iyi süreç tasarımı

**Mesai kaydı (kritik)**
⚠️ Riskli
Oturum, sayfa yaşam döngüsüne bağlı otomatik başlıyor/bitiyor: tarayıcı arka plana alınınca mesai "bitiyor", açınca yeniden başlıyor. Almanya'da çalışma süresi kaydı yasal belgedir (ArbZG) ve bordroyu besleyecek — bu haliyle veri güvenilmez. Manuel start/stop + sunucu tarafı uzlaştırma şart.

Abfahrtkontrolle (sefer öncesi kontrol)
⚠️ Eksik
Sürücü tarafında ayrı sayfa yok; handover içine gömülü. Yasal olarak ayrı belgelenmesi beklenen bir adım — ürün kararı gerekiyor: ayrı ekran mı, handover'da yeterli mi?

Veri kalitesi (görünüm)
⚠️
~7 yerde ham enum sızıyor (`in_progress`, `pending_signature`...) — TR/PL sürücü için çevrilmemiş, rapor/ekran güveni zedeliyor

Kanıt zinciri
✅ Güçlü
Handover fotoğrafları canlı kameradan, EXIF+GPS gömülü — denetim değeri yüksek. Ancak rapor/belge yüklemelerinde `capture` özniteliği yok: kaza yerinde kamera doğrudan açılmıyor (tutarsızlık)

Offline veri kaybı
❌
Kuyruk yok: başarısız yükleme = kaybolan an. Sadece messenger retry yapıyor

## UI designer bulguları

Konu
Durum
Not

Alt navigasyon (5 sekme)
✅ İyi
Safe-area doğru, aktif durum doğru — telefon için doğru desen

Açıklanabilirlik akışı
⚠️
Handover + ekipman imzası yalnızca koşullu kartlardan; Documents ve Notifications Profil'in altına gömülü (okunmamış rozeti taşımasına rağmen sekme değil)

Ana sayfa hata durumu
❌
6 paralel çağrı `.catch(()=>undefined)` — sessiz boş ekran; portalın vitrini en kötü hata moduna sahip

Quick actions kırılganlığı
⚠️
Görev yüklenmediyse check-in butonu dahil tüm hızlı eylemler gizleniyor

i18n kaçakları
⚠️
error.tsx İngilizce, loading.tsx Almanca hardcode; onboarding/rapor placeholder'ları Almanca — dil değiştiren sürücü karma dil görüyor

Kamera/imza etkileşimleri
✅
HandoverCameraCapture ve imza tuvali dokunmatik için doğru kurulmuş

## Öncelikli öneriler

**P1 — saha güvenilirliği (pilot öncesi şart):**

1. Offline temel katmanı: PWA manifest + service worker + yükleme kuyruğu (handover
fotoğrafı, rapor eki, konum noktası: başarısızsa yerelde sırala, bağlantı gelince
otomatik gönder, ekranda "bekleyen 2 yükleme" göstergesi).
2. Ana sayfa hata/retry durumu: sessiz catch kaldırılsın; kısmi hata → kart bazlı
"yüklenemedi, tekrar dene".
3. Menü ulaşılabilirliği: handover ve ekipman imzası Home'da koşulsuz erişilebilir
giriş noktası kazansın (ör. "Görevlerim" altında kalıcı satırlar); Notifications
alt navigasyona rozetli sekme olsun (Reports ile birleştirilebilir → 5 sekme kalır).

**P2 — güven ve cila:**
4. Ham enum'lara i18n sözlüğü (tek util: `translateStatus(domain, value)`).
5. Rapor/belge dosya girişlerine `capture="environment"` (messenger ile tutarlı).
6. Hardcode metinler i18n'e (error/loading/placeholder'lar) — i18n-check zaten kapı.
7. Mesai oturumu yeniden tasarımı: otomatik başlat/bitir kaldırılsın veya yalnızca
"öneri" olsun; kayıt manuel start/stop + sunucu uzlaştırması; profil kartında
"bugünkü kayıt: 07:12–?" net gösterim. (Bordro entegrasyonundan önce şart.)

**P3 — ürün kararları:**
8. Abfahrtkontrolle: ayrı sürücü sayfası mı, handover içinde mi? (Müşteri
görüşmelerinde sorulacak — pilot geri bildirimi beklenebilir.)
9. PWA "ana ekrana ekle" yönlendirmesi (kurulum hissi, push bildirimlerine zemin).

## Önerilen loop görevleri

- **DRIVER-1 (P1.2 + P1.3 + P2 tamamı):** hızlı kazanımlar, tek tur — düşük risk.
- **DRIVER-2 (P1.1):** offline/PWA katmanı — ayrı tur, dikkatli test ister.
- **DRIVER-3 (P2.7):** mesai oturum sağlamlaştırma — backend'le birlikte.

*Not: Native mobil uygulama (mobile-driver/) bu raporun kapsamı dışında — ayrı
değerlendirme gerekir; web portal bu haliyle telefonda tarayıcıdan kullanılabilir
durumda ve pilotun ilk haftası için yeterli.*