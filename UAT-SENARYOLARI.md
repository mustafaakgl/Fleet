# UAT Senaryoları — "Altın Yol" Kontrol Listesi

Amaç: Kurulu sistemde son kullanıcının işini baştan sona yapabildiğini elle doğrulamak.
Her senaryoyu gerçek tarayıcıda, seed'li demo tenant'ta koş. Sonucu işaretle:
✅ geçti / ❌ kaldı (not düş) / ⏭ atlandı (sebep yaz).

Ortam: temiz kurulum (INSTALL.md ile) + seed verisi. Tarayıcı: Chrome. Dil: önce DE, sorun görürsen TR/EN ile karşılaştır.

## A. Giriş ve Roller
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| A1 | Admin ile giriş yap | Dashboard açılır, admin menüsü tam | |
| A2 | Yanlış şifreyle 6 kez dene | 5. denemeden sonra rate-limit engeli | |
| A3 | Office rolüyle giriş | Sadece operasyon menüleri görünür, finansal alanlar yok | |
| A4 | Driver rolüyle giriş | Sürücü portalı açılır, başka sürücünün verisi görünmez | |
| A5 | Dili DE→TR→EN değiştir | Tüm menü/butonlar çevrili, ham anahtar (örn. "nav.xyz") görünmüyor | |

## B. Günlük Operasyon (Office)
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| B1 | Yarına yeni görev (Einsatz) oluştur: sürücü + araç + müşteri firma seç | Görev kaydedilir, planda görünür | |
| B2 | Aynı sürücüye aynı saatte ikinci görev ata | Çakışma uyarısı/engeli | |
| B3 | İzinli sürücüye görev atamayı dene | Müsaitlik engeli | |
| B4 | Görevi onayla → sürücü tarafında görünürlüğünü kontrol et (A4 hesabıyla) | Sürücü portalında görev detayı doğru | |
| B5 | Sürücü adına izin talebi oluştur → onay akışını yürüt | Durum: bekliyor → onaylandı; bildirim düşer | |

## C. Sürücü Günü (Driver portalı — telefonda veya dar pencerede)
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| C1 | Sabah check-in yap (uygunluk beyanı dahil) | Kayıt zaman damgalı; office panosunda check-in oranı güncellenir | |
| C2 | Sefer öncesi kontrol listesini doldur — bir maddeyi "kritik arıza" işaretle | Görev bloke olur / sevkiyata anlık bildirim gider | |
| C3 | Araç devir-teslimi başlat: 8 foto akışını tamamla | Kayıt oluşur, fotolar görüntülenebilir | |
| C4 | Arıza bildir (foto + açıklama) | Defect kaydı office tarafında açık statüde görünür | |
| C5 | Kaza raporu oluştur | Accident kaydı + office'e bildirim | |

## D. Takograf (satışın yıldızı — özenli test)
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| D1 | DDD arşivine örnek sürücü kartı dosyası yükle | "Kuyruğa alındı" mesajı; kayıt önce pending, sonra processed | |
| D2 | Aynı dosyayı ikinci kez yükle | Mükerrer uyarısı, yeni kayıt yok | |
| D3 | Bozuk/imzasız dosya yükle | Kayıt failed/imza geçersiz işaretli; yükleyene bildirim | |
| D4 | İhlal üreten dosya sonrası: infringements sayfası | İhlal listelenir; office+boss'a bildirim düşmüş | |
| D5 | İhlali acknowledge et | Durum değişir; SLA sayacı kapanır | |
| D6 | İhlali bordro için işaretle (accounting rolüyle) | Toggle çalışır; driver rolü aynı işlemi YAPAMAZ (403) | |
| D7 | Compliance sayfası: 28/90 okuma vadeleri bölümü | Sürücü/araç başına son okuma + sonraki vade + doğru renk rozeti | |
| D8 | Kalan sürüş süresi ekranı | D1'deki dosyanın verisiyle tutarlı değerler | |

## E. Ceza, Belge, Bildirim
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| E1 | Yeni Bußgeld gir (araç+tarih) | Doğru sürücüyle eşleşir | |
| E2 | Süresi 20 gün sonra dolacak belge yükle | Belge "süresi yaklaşıyor" statüsüne düşer, panoda görünür | |
| E3 | Bildirim merkezini aç | Bugünkü testlerin bildirimleri listede; tümünü okundu işaretle çalışır | |
| E4 | Sürücüye mesaj gönder (TR yazan sürücüyle DE yazan ofis) | Otomatik çeviri iki yönde çalışır | |

## F. Analitik ve Canlı İzleme
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| F1 | Boss rolüyle dashboard | Ciro/KPI kartları dolu, hata yok | |
| F2 | Canlı takip haritası (onay vermiş sürücüyle) | Konum görünür; onaysız sürücü görünmez | |
| F3 | Trip geçmişi + araç sağlığı + sürücü skorları sayfaları | Seed/sim verisiyle dolu, grafikler çiziliyor | |
| F4 | Herhangi bir liste sayfasında CSV dışa aktar | Dosya iner, Türkçe/Almanca karakterler bozulmamış | |

## G. Veri Koruma
| # | Senaryo | Beklenen | Sonuç |
|---|---------|----------|-------|
| G1 | Bir sürücü için DSGVO veri ihracı (ZIP) | ZIP iner, içerik tam | |
| G2 | Sürücü konum onayını geri çek | Canlı takipte sürücü kaybolur | |

---
**Geçme kriteri:** A-D blokları %100 yeşil olmadan satış demosu yapılmaz. E-G'de kırmızı
kalan maddeler "bilinen eksik" listesine yazılır ve demoda o ekranlardan uzak durulur.
