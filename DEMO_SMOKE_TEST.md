# Demo Smoke-Test Kontrol Listesi

> Demo şirketinde göstermeden önce bu listeyi **baştan sona elle** uygula.
> Her satır için: çalışıyorsa `[x]`, çalışmıyorsa `[ ]` bırak ve **Not** sütununa
> ekran görüntüsü adını / hatayı yaz. Hepsi yeşil olunca demoya hazırsın.

**Test tarihi:** ______________   **Test eden:** ______________
**Ortam (URL):** ______________   **Tarayıcı:** ______________

---

## 0. Hazırlık (demo öncesi 1 kez)

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 0.1 | Backend ve frontend ayakta mı | Login sayfası açılıyor | [ ] | |
| 0.2 | Demo şirket (tenant) oluşturuldu mu | Şirket aktif, giriş yapılabiliyor | [ ] | |
| 0.3 | Test hesapları hazır mı (admin / office / driver) | 3 rolle de giriş yapılabiliyor | [ ] | |
| 0.4 | Örnek veri var mı (en az 1 araç, 1 şoför) | Listeler boş değil | [ ] | |

---

## 1. Giriş / Güvenlik (Kritik)

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 1.1 | Doğru e-posta + şifre ile giriş | Dashboard açılır | [ ] | |
| 1.2 | Yanlış şifre ile giriş | Net hata mesajı, giriş yok | [ ] | |
| 1.3 | Çıkış yap (logout) | Login sayfasına döner | [ ] | |
| 1.4 | Çıkıştan sonra tarayıcı "geri" tuşu | Korumalı sayfa açılmaz, login'e atar | [ ] | |
| 1.5 | Giriş yapmadan korumalı URL'ye git (örn. /vehicles) | Login'e yönlendirir | [ ] | |

---

## 2. Araçlar (Vehicles) — Kritik

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 2.1 | Yeni araç ekle (plaka, marka, model) | Araç listede görünür | [ ] | |
| 2.2 | Aracı düzenle | Değişiklik kaydedilir | [ ] | |
| 2.3 | Zorunlu alanı boş bırakıp kaydet | Net doğrulama hatası | [ ] | |
| 2.4 | Araç fotoğrafı yükle | Fotoğraf görünür | [ ] | |
| 2.5 | Araç detayını aç | Bilgiler doğru görünür | [ ] | |

---

## 3. Şoförler (Drivers) — Kritik

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 3.1 | Yeni şoför ekle | Şoför listede görünür | [ ] | |
| 3.2 | Şoför bilgisini düzenle | Değişiklik kaydedilir | [ ] | |
| 3.3 | Ehliyet/belge yükle | Belge açılır | [ ] | |

---

## 4. Atama / Einsatzplan — Kritik

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 4.1 | Şoföre araç ata | Atama oluşur | [ ] | |
| 4.2 | Atama takvime düşüyor mu | Takvimde görünür | [ ] | |
| 4.3 | Aynı şoföre çakışan atama yap | Çakışma uyarısı / engel | [ ] | |
| 4.4 | Atamayı güncelle | Takvim anında güncellenir | [ ] | |

---

## 5. Dökümanlar & Hatırlatmalar

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 5.1 | Döküman yükle (ruhsat/ehliyet) | Yükleme başarılı | [ ] | |
| 5.2 | Desteklenmeyen dosya tipi yükle | Net hata, yükleme yok | [ ] | |
| 5.3 | Son kullanma tarihi yaklaşan belge | Hatırlatma oluşur | [ ] | |
| 5.4 | Belgeyi yenile | Eski hatırlatma temizlenir | [ ] | |

---

## 6. İzin Talepleri (Requests / Urlaub)

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 6.1 | İzin talebi oluştur | Talep listeye düşer | [ ] | |
| 6.2 | Talebi onayla | Takvime izin olarak yansır | [ ] | |
| 6.3 | Talebi reddet | Takvimde olay oluşmaz | [ ] | |
| 6.4 | Çakışan izin talebi | Çakışma yakalanır | [ ] | |

---

## 7. Mobil Sürücü Uygulaması

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 7.1 | Şoför hesabıyla mobil girişi | Giriş başarılı | [ ] | |
| 7.2 | Çıkış kontrolü / fotoğraf yükleme | Fotoğraf kaydedilir | [ ] | |
| 7.3 | Görev/atama listesi görünür mü | Atamalar listelenir | [ ] | |

---

## 8. Yetki & Veri İzolasyonu (Kritik — güvenlik)

| # | Adım | Beklenen sonuç | ✅/❌ | Not |
|---|------|----------------|------|-----|
| 8.1 | Şoför hesabıyla admin sayfasına git | Erişim engellenir | [ ] | |
| 8.2 | Office hesabıyla finans sayfasına git | Erişim engellenir | [ ] | |
| 8.3 | Office, şoförün özel belgesini görmeye çalış | Erişim yok | [ ] | |
| 8.4 | A şirketi, B şirketinin verisini URL ile aç | Reddedilir, veri sızmaz | [ ] | |

---

## Sonuç

- **Toplam madde:** 30
- **Geçen:** ____   **Kalan/Hatalı:** ____
- **Demoya hazır mı?** Tüm "Kritik" bölümler ✅ ise: **EVET**

### Bulunan hatalar (varsa)
| # | Madde | Ne oldu | Öncelik (Yüksek/Orta/Düşük) |
|---|-------|---------|------------------------------|
| | | | |
| | | | |
