# Ordivan — Connector Protokolü

Sürüm: **1** · Faz 12

Connector, müşterinin makinesinde çalışan ve Fleet'ten iş alan süreçtir. Bu
doküman connector'ın görebileceği **tek yüzeyi** tanımlar.

## Bağlantı yönü

Connector **outbound HTTPS** kullanır. Müşterinin makinesinde **inbound port
açılmaz**. Bu bir tercih değil, kurulumun en büyük güvenlik ve destek
maliyetini ortadan kaldıran temel karardır: NAT, firewall kuralı, port
yönlendirme ve sertifika yönetimi gerekmez.

## Kimlik

| Aşama | Kim doğrular | Not |
|---|---|---|
| Enrollment | tek kullanımlık kod | Kod da bir secret'tir; DB'de yalnızca SHA-256 özeti durur |
| Normal işleyiş | `x-ordivan-credential` başlığı | Düz metin anahtar DB'de **durmaz** |

**Kiracıyı connector seçemez.** `tenantId` yalnızca enrollment kodunun bağlı
olduğu connector kaydından okunur; istekteki hiçbir alan kiracı belirleyemez.
Connector bir kullanıcı rolü de üstlenemez (`role: 'ordivan_connector'`), bu
yüzden rol tabanlı Fleet uçlarına giremez.

## Uçlar

Taban: `/api/v1/ordivan/connector`

| Uç | Kimlik | Açıklama |
|---|---|---|
| `POST /enroll` | enrollment kodu | Kod → kalıcı anahtar. Anahtar **bir kez** döner |
| `POST /heartbeat` | credential | Canlılık + sürüm bildirimi |
| `POST /jobs/lease` | credential | Uygun bir iş kiralar; yoksa `{ job: null }` |
| `POST /jobs/:id/running` | credential | İş gerçekten başladı |
| `POST /jobs/:id/complete` | credential | Sonuç + öneri |
| `POST /jobs/:id/fail` | credential | Hata sınıfı |

Bu listede olmayan hiçbir şey connector'a açık değildir. **Genel SQL, shell ve
keyfi HTTP aracı yoktur** ve eklenemez (`FORBIDDEN_TOOLS` bunu testle
sabitler). Connector Fleet veritabanına doğrudan erişemez.

## Kiralama (lease) protokolü

```
queued ──lease──> leased ──running──> running ──complete──> completed
   ^                 |                    |
   |                 └──fail / lease süresi dolar──┐
   └─────────────────────────────────────────────┘
                                    (attempt >= maxAttempts) → dead_letter
```

Kurallar:

1. **Yetenek eşleşmesi.** İş yalnızca `requiredCapability`'sine sahip
   connector'a verilir.
2. **Tek sahip.** Kiralama koşullu `updateMany` ile alınır (`status`,
   `leaseToken`, `attempt` beklenen değerde mi). İki connector aynı adayı
   görse bile yalnızca biri kazanır.
3. **Lease süresi.** Süre dolarsa iş kontrollü biçimde kuyruğa döner; scheduler
   dakikada bir toparlar.
4. **Bayat deneme reddedilir.** Her kiralama kendi `leaseToken`'ını üretir. Geç
   gelen eski bir denemenin sonucu token eşleşmediği için **kabul edilmez** ve
   mevcut sonucu ezemez.
5. **Idempotent tamamlama.** Aynı token ile ikinci kez gelen tamamlama yeni
   öneri üretmez; var olanı döner.
6. **Dead-letter.** Deneme sınırı dolduğunda otomatik tekrar yoktur; insan
   bakmalıdır.

## Payload ve şema

Her iş `jobType + schemaVersion` çiftiyle registry'ye karşı doğrulanır.
Registry'de olmayan tür veya sürüm **kuyruğa hiç girmez**.

Faz 12'de yalnızca iki iş türü vardır:

- `system.echo` — protokolün uçtan uca çalıştığını kanıtlar
- `document.mock_classification` — deterministik, içerik okumayan sınıflandırma

## Sürüm ve uyumluluk

Connector her heartbeat'te `connectorVersion`, `protocolVersion`, `platform` ve
`architecture` bildirir. Fleet karşılığında `current` ve `minimumSupported`
protokol sürümünü döner.

Uyumluluk üç durumludur: `ok`, `connector_too_old`, `connector_too_new`,
`unknown`. **Sürüm bildirmeyen connector "uyumlu" sayılmaz** — bu, üç durumlu
kontrol sözleşmesinin protokol tarafındaki karşılığıdır.

## Hata sınıfları

Dışarı **yalnızca sınıf** çıkar, sağlayıcı mesajı değil:
`ordivan_credential_missing`, `ordivan_credential_invalid`,
`ordivan_enrollment_invalid`, `ordivan_lease_not_current`,
`ordivan_proposal_invalid`, `ordivan_check_contract_violation`,
`ordivan_disabled`.

Geçersiz kod, süresi dolmuş kod ve kullanılmış kod **aynı cevabı** alır:
saldırgan hangisinin doğru olduğunu öğrenememeli.
