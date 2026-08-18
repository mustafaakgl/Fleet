# Ordivan — Manuel Güncelleme Prosedürü

Faz 12 · **otomatik güncelleme YOK**

## Bu fazda kasıtlı olarak yapılmayanlar

- Otomatik yazılım indirme
- Uzaktan komut çalıştırma (shell/remote execution)
- Otomatik rollback

Gerekçe: müşterinin makinesinde kendi kendine yazılım indirip çalıştıran bir
süreç, güvenlik açısından uzaktan kod çalıştırma yeteneğinin ta kendisidir.
Bu yetenek, imzalı release ve doğrulanabilir bir zincir olmadan verilemez.

**Tam otomatik imzalı güncelleme/rollback bir scaling gate'tir**: geniş dağıtım
öncesinde gereklidir, ilk dost müşteri pilotunu bloklamaz.

## Sürüm görünürlüğü (bu fazda var)

Connector her heartbeat'te bildirir: `connectorVersion`, `protocolVersion`,
`platform`, `architecture`.

Fleet ekranda gösterir: minimum desteklenen protokol, uyumluluk durumu
(`ok` / `connector_too_old` / `connector_too_new` / `unknown`) ve güncelleme
gerekip gerekmediği.

## İmzalı release metadata tasarımı (uygulanmadı, tasarlandı)

Bir release aşağıdakini taşımalıdır:

```
{
  "version": "1.2.0",
  "protocolVersion": 1,
  "platform": "win32", "architecture": "x64",
  "artifactUrl": "https://…",
  "sha256": "…",
  "signature": "…",          // yayıncı anahtarıyla imza
  "minimumFleetProtocol": 1,
  "releasedAt": "…"
}
```

Kurallar:

1. İmza **artifact'in özeti üzerinden** doğrulanır, indirme URL'i üzerinden
   değil.
2. Yayıncı anahtarı connector'a **kurulumda** gömülür; güncelleme kanalından
   gelmez.
3. `minimumFleetProtocol` tutmuyorsa güncelleme **uygulanmaz**.
4. Rollback için bir önceki sürümün metadata'sı saklanır.

## Manuel güncelleme adımları (bugün geçerli prosedür)

1. Fleet → **Connector** ekranından uyumluluk durumunu oku.
2. Yeni sürümü yalnızca resmî yayın kanalından indir.
3. SHA-256'yı yayınlanan değerle **elle** karşılaştır.
4. Connector sürecini durdur.
5. Dosyaları değiştir.
6. Süreci başlat, heartbeat'in geldiğini ve `protocolCompatibility: ok`
   olduğunu ekranda doğrula.
7. Sorun çıkarsa: süreci durdur, önceki sürümü geri koy, adım 6'yı tekrarla.

## Anahtar hijyeni

Güncelleme anahtarı **etkilemez**. Şüphe varsa Connector ekranından
**rotate** kullan; eski anahtar anında geçersiz olur. Makine elden çıkıyorsa
**revoke** — kayıt silinmez, denetim izi kalır.
