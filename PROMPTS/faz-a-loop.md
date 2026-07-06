# Faz A Master Loop Prompt — VS Code / Claude Code'a tek seferde yapıştır

```
LOOP GÖREVİ: PROMPTS/faz-a-prompts.md içindeki T1→T7 görevlerini SIRAYLA ve OTONOM tamamla.
Benden onay bekleme, soru sorma; sadece aşağıdaki DUR koşullarında dur.

HAZIRLIK (bir kez):
- backend/package.json'a script ekle:
  "verify:all": "tsc -p tsconfig.json --noEmit && npm test && node scripts/codec8-sim.mjs --scenario normal --seed 42 && node scripts/verify-tacho-telematics.mjs && ts-node --transpile-only scripts/tenant-isolation-check.ts"
- Bundan sonra doğrulama = SADECE `npm run verify:all`. Adım atlamak, "muhtemelen geçer" demek yasak.

HER GÖREV İÇİN DÖNGÜ:
1. Görev tanımını PROMPTS/faz-a-prompts.md'den oku. Kapsam dışına çıkma, görevde yazandan
   fazlasını yapma (ekstra refactor, ekstra test, ekstra abstraction YOK).
2. Uygula. Mevcut desenleri kullan (CLAUDE.md kural 4).
3. `npm run verify:all` koş. Kırmızı → düzelt → baştan koş. GEÇTİYSE BANA SORMADAN devam et.
4. Yeşilse: sadece o göreve ait dosyaları commit et.
   Commit mesajı: `faz-a: <görev özeti> (T<n>)`
   PROMPTS/logs/loop_journal.md'ye tek satır: `[tarih] [faz-a] [T<n>] [özet; batarya yesil]`
5. Sonraki göreve geç.

ÖZEL DURUM — T1: Kod büyük ölçüde çalışma ağacında hazır (tachograph-queue*.ts, migration,
ddd-archive status kolonu). Sıfırdan yazma; devral, eksiği tamamla, doğrula, commit et.
T1 commit'ine fleet/fleet-trip-stops, fleet-trips gibi görevle ilgisiz mevcut değişiklikleri
KARIŞTIRMA — onları çalışma ağacında bırak.

DUR KOŞULLARI (sadece bunlarda durup bana özet yaz):
- Aynı hata 3 turda çözülmedi.
- Görev, CLAUDE.md MUTLAK KURALLARI ile çelişiyor.
- Kapsam dışı klasöre (billing/, customer-portal/, invoicing) dokunmak gerekiyor.
- verify:all altyapı sebebiyle hiç koşamıyor (ör. Postgres/Redis kapalı).

T7 bitince: `git log --oneline` son 7 commit + görev başına 2 satırlık kapanış raporu yaz.
```
