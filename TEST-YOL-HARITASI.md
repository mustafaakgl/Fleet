# Test Yol Haritası — "Proje Hazır mı?" Kanıt Turu

Her adımın: amacı, kimin yapacağı, komutu ve geçme kriteri var. Sırayla; bir adım
kırmızıysa düzeltilmeden sonrakine geçilmez. Sonuçları işaretle: ✅ / ❌ / tarih.

---

## Adım 0 — Ortam kontrolü (SEN, 5 dk)
Amaç: Docker ve servislerin ayakta olduğunu görmek.
```
docker compose version
docker ps
```
Geçti kriteri: version çıktısı geliyor, hata yok. (Docker Desktop uygulaması açık olmalı.)
Not: Docker = uygulamanın tüm parçalarını (veritabanı, backend, frontend) izole
kutularda çalıştıran sistem; compose = hepsini tek komutla başlatan tarif dosyası.

## Adım 1 — Birim + entegrasyon bataryası (SEN, ~10 dk)
Amaç: Kod mantığının tamamının yeşil olduğunu kanıtlamak (400+ kontrol).
```
cd ~/Projects/Fleet/backend
npm run verify:all
```
Geçti kriteri: tsc temiz, testler 0 fail, sim|verify ok, tenant isolation passed.
(Lokal Postgres + Redis çalışıyor olmalı — dev ortamın zaten böyle.)

## Adım 2 — Frontend derleme kanıtı (SEN, ~5 dk)
Amaç: Tüm ekranların üretim modunda derlendiğini görmek.
```
cd ~/Projects/Fleet/frontend
npx tsc --noEmit && npm run build
```
Geçti kriteri: 0 hata, build tamamlandı.

## Adım 3 — Temiz Docker kurulumu (SEN, ~20 dk)
Amaç: "Sıfır sunucuya kurulsa çalışır" kanıtı — müşteri kurulum provası.
```
cd ~/Projects/Fleet
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```
Geçti kriteri: tüm servisler "healthy/running"; tarayıcıda http://localhost:3001
login sayfası TAM STİLLİ açılıyor; seed admin ile giriş oluyor.
(`down -v` = önceki tüm verileri silip sıfırdan başla; prova bu yüzden "temiz".)

## Adım 4 — E2E paketi (LOOP, VS Code)
Amaç: Backend↔frontend'in gerçek tarayıcıda uçtan uca konuştuğunu otomatik kanıtlamak.
Loop prompt'u: KURULUM-2 (secret sertleştirme + e2e yeşile çekme, sınıflandırma
kurallarıyla). Smoke 10/10 zaten yeşil; tam suite koşulacak.
Geçti kriteri: suite yeşil (skip'ler gerekçeli), ürün hataları düzeltilmiş + commit.

## Adım 5 — UAT elle turu (SEN, ~1 gün)
Amaç: Son kullanıcı gözüyle altın yolların çalıştığını görmek.
Doküman: UAT-SENARYOLARI.md — A3'ten devam (A1/A2/A5 ✅, 403 blokajları çözüldü).
Geçti kriteri: A-D blokları %100 ✅ (satış demosu ön şartı); E-G kırmızıları
"bilinen eksik" listesine.

## Adım 6 — Dayanıklılık mini turu (LOOP, pilot öncesi)
Amaç: Sistem sarsıntıda ayakta kalıyor mu?
- Redis'i durdur → sistem inline moda düşüp çalışmaya devam etmeli
- Postgres restart → backend kendini toparlamalı, veri kaybı olmamalı
- codec8-sim ile 50 sanal cihaz → kuyruk gecikmesi makul kalmalı
Geçti kriteri: üç senaryoda da veri kaybı yok, servis kendine geliyor.

## Adım 7 — Kapanış raporu
Tüm adımların ✅/❌ tablosu + kalan kırmızıların listesi = "hazırlık karnesi".
A-D yeşil + Adım 1-4 yeşil = demo turu başlayabilir.
Adım 6 da yeşil = cihaz pilotu başlayabilir.

---
Durum takibi:
- [ ] Adım 0
- [ ] Adım 1
- [ ] Adım 2
- [ ] Adım 3
- [ ] Adım 4
- [ ] Adım 5 (A bloğu kısmen ✅)
- [ ] Adım 6
- [ ] Adım 7
