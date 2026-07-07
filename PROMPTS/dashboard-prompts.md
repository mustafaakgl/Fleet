# Dashboard Yenileme Promptları — sırayla: DASH-1 → DASH-2 → DASH-3

Ortak kurallar (her prompt için geçerli):
- Mevcut dashboard modülünü GENİŞLET, sıfırdan yazma. Var olan endpoint'leri kullan;
  eksik veri için dashboard.controller'a küçük ekleme yapılabilir, yeni modül açılmaz.
- recharts + shadcn, yeni bağımlılık YOK. Skeleton yükleme, boş durumlar, i18n de/en/tr.
- Her kart tıklanabilir → ilgili liste/detay sayfasına gider.
- Kırmızı renk sadece gerçek acil durumda. Her kartta zaman kapsamı etiketi
  ("Bugün", "Son 7 gün"). Gauge/3D/pasta grafik yasak.
- Batarya + frontend build + e2e smoke yeşil olmadan commit yok.
- Commit formatı: `ux: <rol> dashboard yenileme (DASH-<n>)` + loop_journal satırı.

---

## DASH-1 — Office/Sevkiyat: "Bugün ne eksik?" (eylem odaklı, grafik minimal)

```
GÖREV DASH-1: Office dashboard'unu eylem odaklı yeniden tasarla. Otonom çalış;
aynı hatada 3 tur dönersen dur. Ortak kurallar: PROMPTS/dashboard-prompts.md.

1. SAĞLIK ŞERİDİ (en üst, tek satır): bugün planlı görev sayısı · check-in yapmayan
   sürücü sayısı · kritik arıza sayısı · vadesi geçmiş DDD okuma sayısı.
   Her rakam tıklanınca ilgili filtreli listeye gider. 30 sn'de bir sessiz yenilenir.
2. CHECK-IN EKSİKLERİ kartı: bugün check-in yapmamış AKTİF sürücüler, isim listesi.
   Boş durum: "Herkes check-in yaptı ✓".
3. ATANMAMIŞ GÖREVLER kartı: bugün + yarın, saat/müşteri bilgisiyle; satırdan
   doğrudan atama sayfasına link.
4. YARIN KAPASİTE kartı: yarın planlı görev sayısı vs müsait sürücü sayısı;
   açık varsa sarı uyarı ("3 görev için sürücü eksik").
5. KRİTİK OLAY AKIŞI: son 24 saat — kritik arıza, kaza, kritik tako ihlali,
   başarısız DDD işleme. Önem + zaman sıralı, max 10 satır, "tümünü gör" linki.
6. TEK GRAFİK: 7 günlük check-in oranı sparkline (sağlık şeridinin yanında küçük).
7. Bu ekran mobilde de okunur olmalı (kartlar tek kolona düşer).
Mevcut office dashboard'daki kartlardan bu tasarıma uymayanları kaldır (veri
endpoint'lerini silme, sadece UI).
```

## DASH-2 — Boss/Geschäftsführer: "İşler yolunda mı?" (trend odaklı)

```
GÖREV DASH-2: Boss dashboard'unu trend odaklı yeniden tasarla. Otonom çalış;
aynı hatada 3 tur dönersen dur. Ortak kurallar: PROMPTS/dashboard-prompts.md.

1. CİRO kartı: günlük beklenen ciro (Einsatzplan expectedDailyRevenue) — son 30 gün
   çizgi grafiği + bu hafta/geçen hafta karşılaştırma sayısı. Yanında müşteri firma
   kırılımı: bu ayın cirosu firma bazlı yatay bar (ilk 5 + diğer).
2. ARAÇ KULLANIMI kartı: bugün görevli araç / toplam aktif araç (büyük sayı + oran);
   altında bugün boşta duran araçların listesi (tıklanır).
3. UYUMLULUK KARNESİ kartı (satış vaadinin ekranı): tek bakışta —
   geciken TÜV/UVV sayısı, süresi dolan/dolacak belge sayısı, vadesi geçmiş kart
   okuma sayısı, açık ihlal sayısı. Hepsi 0 ise büyük yeşil "Uyumlu ✓";
   değilse kırmızı maddeler liste halinde.
4. MALİYET TRENDİ kartı: aylık yakıt + ceza + hasar (mevcut fuel/fines verisi),
   son 6 ay yığılmış bar.
5. SÜRÜCÜ RİSKİ kartı: yeşil/sarı/kırmızı üç büyük sayı + kırmızı sürücülerin
   isimleri (driver-scores'a link).
6. İHLAL TRENDİ kartı: aylık tako ihlal sayısı, son 6 ay çizgi — hedef "düşüş
   hikâyesi" göstermek.
Finansal veriler sadece boss/admin rollerine (mevcut maskeleme desenine uy).
```

## DASH-3 — Accounting: "Bu ay ne ödedik, ne keseceğiz?"

```
GÖREV DASH-3: Accounting dashboard'unu yeniden tasarla. Otonom çalış; aynı hatada
3 tur dönersen dur. Ortak kurallar: PROMPTS/dashboard-prompts.md.

1. CEZA ÖZETİ kartı: bu ay toplam ceza tutarı + adet; sürücü bazlı ilk 5 kırılım;
   geçen ayla karşılaştırma. Aylık trend mini bar (6 ay).
2. BORDRO KUYRUĞU kartı: payrollRelevant işaretli, henüz işlenmemiş ihlaller —
   sürücü, tarih, tip listesi; infringements sayfasına link.
3. YAKIT MALİYETİ kartı: bu ay toplam + araç başına ortalama; anomali işaretli
   araçlar varsa uyarı satırı.
4. BELGE/VADE kartı: 30 gün içinde maliyet doğuracak vadeler (TÜV randevuları,
   süresi dolan sigorta belgeleri) — tarih sıralı liste.
Accounting rolünün GÖREMEYECEĞİ hiçbir kişisel sürücü verisi sızmasın (mevcut
maskeleme kurallarını UI'da da uygula — test et).
```
