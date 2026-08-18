# Ordivan — Değerlendirme (Eval) Politikası

## İki set, iki farklı soru

| Set | Soru | Skor |
|---|---|---|
| `evals/functional` | Doğru sonucu üretiyor mu? | **accuracy** |
| `evals/security-red-team` | Savunma tutuyor mu? | **containment** |

Bu ikisi **asla tek bir skorda birleştirilmez**. Birleştirilseydi 100 doğru
vaka, 1 güvenlik kaçağını istatistiksel olarak görünmez kılardı. Adversarial
sette ölçülen şey doğruluk değildir: **tek bir kaçak setin tamamını düşürür.**

## Sürümleme

Her set kendi `manifest.json`'unu ve semantik sürümünü taşır. Kök
`evals/manifest.json` iki seti de sürümüyle kaydeder.

**Setler sessizce değişemez.** Manifest'teki vaka listesi ile `cases.json`
birebir örtüşmek zorundadır; bir vaka eklenip manifest güncellenmediğinde
`eval-runner.spec.ts` kırmızı olur. Bu, "testi geçirmek için vakayı kaldırma"
yolunu kapatır.

## Faz 12'nin kapsamı

Temsilî **metin/JSON fixture'ları**. Ölçülen şey:

- şema doğrulaması (beklenmeyen alan, tür, aralık, enum)
- araç/uç whitelist'i
- öneri türü sınırları
- iş türü ↔ öneri türü eşleşmesi

Gerçek belge ve model red-team seti **Faz 13'te** genişletilecek. Faz 12'nin
iddiası "model güvenli" değil, **"sözleşme sızdırmıyor"**dur.

## Yeni vaka ekleme

1. `cases.json`'a vakayı ekle (`expect`, gerekiyorsa `expectedReason` ile).
2. Set `manifest.json`'una vaka kimliğini ekle.
3. Set sürümünü artır.
4. `npm test` — adversarial vaka **reddedilmezse** test düşer.

## Regresyon kuralı

Bir güvenlik açığı bulunduğunda önce `security-red-team`'e onu üreten vaka
eklenir, **sonra** düzeltme yazılır. Vakasız düzeltme, aynı açığın altı ay
sonra geri gelmesini serbest bırakır.
