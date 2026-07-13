# TEST AJANI — Tam Sistem Doğrulama Turu (her sürüm öncesi yapıştır)

Kullanım: VS Code loop'una olduğu gibi yapıştır. Amaç: "sistem şu an satılabilir
durumda mı?" sorusuna KANITLI cevap. Kod yazmaz, davranış DEĞİŞTİRMEZ — sadece
test eder, sınıflandırır, raporlar. (Bulduğu hataların düzeltmesi ayrı görevdir.)

```
GÖREV TEST-AJANI: Sistemi uçtan uca doğrula. SEN BİR QA MÜHENDİSİSİN — kod
düzeltmek değil, gerçeği raporlamak için varsın. Otonom; bir adım koşulamıyorsa
atlama, "koşulamadı + sebep" olarak raporla.

PRENSİPLER (pazarlıksız):
- Her adımın kanıtı PROMPTS/logs/kanit/test-ajani-<tarih>.md dosyasına yazılır
  (komut + ham çıktı). Chat'e sadece özet.
- Kırmızı bulursan assertion gevşetme, test silme, skip'leme YASAK. Kırmızı,
  raporun değerli kısmıdır.
- Her kırmızıyı sınıfla: ÜRÜN HATASI / TEST ESKİMESİ / ORTAM SORUNU / FLAKY.
- Testler sırasında başlattığın her süreci (gateway, sunucu) tur sonunda kapat.
- Hiçbir şey commit etme (kanıt dosyası hariç).

SIRA:

0. ORTAM HİJYENİ: 3000/3001/5027 portlarında kaçak süreç var mı → temizle.
   Docker daemon durumu. Hangi ortama karşı test edeceğini YAZ (dev mi compose mu)
   ve tur boyunca değiştirme.

1. STATİK KATMAN:
   a) cd backend && npx tsc --noEmit
   b) cd frontend && npm run verify   (i18n-check + tsc + izole build)
   c) git status --short → çalışma ağacında kirli/unutulmuş dosya var mı, listele.

2. BİRİM + ENTEGRASYON: npm test (otomatik keşif). Keşfedilen dosya sayısı,
   test sayısı, süre. 56'dan az dosya keşfedilirse ALARM (keşif bozulmuş).

3. DOĞRULAMA SCRIPT'LERİ: backend ayakta olacak şekilde —
   codec8-sim | verify-tacho (pipe'lı) → tenant-isolation-check.
   Gateway kapalıysa fail-fast mesajının çalıştığını da NOT et (o bir özellik).

4. TEMİZ KURULUM PROVASI: docker compose -f docker-compose.prod.yml down -v &&
   up -d --build. Kanıt: 5 servis (gateway dahil) healthy/up; migrate deploy temiz;
   login sayfası stilli (curl ile /_next/static css 200); seed admin ile API login 200.

5. E2E PAKETİ (compose stack'e karşı): önce seed reset (temiz demo verisi),
   sonra Playwright tam suite (route sweep dahil). Sonuç: kaç test, kaç yeşil,
   skip'ler gerekçeli mi.

6. GATEWAY UÇTAN UCA: codec8-sim compose gateway'ine (5027) 5 paket → ACK 5/5;
   telemetri kaydı DB'de; canlı konum endpoint'i veri döndürüyor.

7. RETENTION KANITI: retention job'ını elle tetikle → her tablo için doğru
   cutoff hesaplandığını logdan doğrula.

8. DAYANIKLILIK MİNİ TURU (compose'da):
   a) Redis'i durdur → backend ayakta kalmalı, kuyruk inline'a düşmeli → Redis'i
      geri aç, sistem toparlamalı.
   b) Postgres'i restart et → backend kendine gelmeli, 500 fırtınası bitmeli.
   c) codec8-sim'i 50 cihaz/ yüksek sayıda paketle koştur → kuyruk gecikmesi ve
      kayıp raporla.

9. GÜVENLİK HIZLI KONTROL: prod modda bilinen placeholder secret ile backend'in
   AÇILMAYI REDDETTİĞİNİ doğrula (bu bir özellik, kanıtla). /metrics token'sız
   erişime kapalı mı. Driver rolüyle bir office endpoint'ine istek → 403.

10. KAPANIŞ RAPORU (chat'e):
    - Skor tablosu: 9 adımın her biri ✅/❌/⏭(sebep)
    - Kırmızılar sınıflandırılmış liste halinde (ÜRÜN/TEST/ORTAM/FLAKY)
    - "Bugün demo yapılabilir mi? Pilot verilebilir mi?" — tek cümlelik yargı
    - Kanıt dosyasının yolu
    Sonunda başlattığın tüm süreçleri kapat, compose'u ayakta bırak (kullanıcı
    kullanıyor olabilir), durumu söyle.
```

Notlar:
- Bu tur ~30-45 dk sürer; sürüm öncesi, demo öncesi ve büyük merge sonrası koşulur.
- Hedef: bu listenin adım 1-2-3'ü zaten CI'da; zamanla 4-5-6 da CI'a taşınır ve
  ajan sadece 8-9'a (dayanıklılık+güvenlik) iner.
```
