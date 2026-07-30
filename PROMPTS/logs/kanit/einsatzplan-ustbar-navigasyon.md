# Kanit — Einsatzplan ust bar navigasyonu

Tarih: 2026-07-30

## Istek
- Einsatzplan'a basildiginda "Gunluk ozet" paneli acilsin.
- Einsatzplan'in tum alt kategorileri sidebar'dan kalksin.
- Ayni alt kategoriler Einsatzplan sayfasinin ust barinda gozuksun.

## Degisiklikler

### frontend/lib/navigation.ts
- `EINSATZPLAN_SECTION` (7 alt link iceren `NavSection`) silindi.
- `OFFICE_NAV` ve `DEFAULT_NAV` icindeki kullanimlari tekil `item('assignments')`
  (`/assignments`, `nav.assignments`, `CalendarDays`) ile degistirildi.
- Sonuc: sidebar'da Einsatzplan artik tek satir, acilir alt liste yok.

### frontend/components/einsatzplan/EinsatzplanPage.tsx
- `TopTab` yeniden tanimlandi:
  `daily-overview | planning | morning-checkins | vehicle-handovers | company-notifications
   | vacation-planner | revenue-summary | overview`
- `topTabs` dizisi 8 sekme: eski sidebar alt kategorilerinin 7'si + mevcut genel bakis paneli.
  Etiketler yeni anahtar gerektirmeden mevcut `common:nav.assignments.*` anahtarlarindan
  okunuyor (`ns` alani ile), genel bakis sekmesi `einsatzplan:einsatzplan.dashboard` kullaniyor.
- Varsayilan sekme `dashboard` -> `daily-overview` oldu (istek maddesi 1).
- `initialTopTab` query eslemesi korundu:
  - `panel=revenue` -> `revenue-summary`
  - `panel=urlaubsplaner` -> `vacation-planner`
  - `panel=company_notifications` -> `company-notifications`
  - `view=<planlama alt sekmesi>` -> ilgili sekme
  - diger hallerde -> `daily-overview`
- Planlama sekmeleri arasinda `Tagesplanung` mount'ta kaliyor (tarih/filtre state'i korunuyor),
  `subTab` + `onSubTabChange` ile ust bara baglandi.

### frontend/components/einsatzplan/Tagesplanung.tsx
- Opsiyonel `subTab` / `onSubTabChange` proplari eklendi; alt sekme artik parent'tan
  kontrol edilebiliyor. Kontrol edilmedigi durumda (office view) eski `initialSubTab`
  davranisi aynen calisiyor.
- Bilesen icindeki mevcut `setActiveSubTab('planning')` ve `setActiveSubTab('company-notifications')`
  cagrilari parent'i da senkronize ediyor, ust bar vurgusu bayatlamiyor.

## Geriye donuk uyumluluk
Eski sidebar linkleri hala rota olarak duruyor ve dogru sekmeye redirect ediyor:

| Rota | Redirect | Cozulen sekme |
| --- | --- | --- |
| `/assignments/daily-overview` | `?panel=tagesplanung&view=daily-overview` | daily-overview |
| `/assignments/planning` | `?panel=tagesplanung&view=planning` | planning |
| `/assignments/morning-checkins` | `?panel=tagesplanung&view=morning-checkins` | morning-checkins |
| `/assignments/vehicle-handovers` | `?panel=tagesplanung&view=vehicle-handovers` | vehicle-handovers |
| `/assignments/company-notifications` | `?panel=company_notifications&view=company-notifications` | company-notifications |
| `/assignments/vacation-planner` | `?panel=urlaubsplaner` | vacation-planner |
| `/assignments/revenue-summary` | `?panel=revenue` | revenue-summary |

Office rolu (`EinsatzplanOfficeView`) kendi heute/morgen/betrieb sekmelerini kullanmaya
devam ediyor; degistirilmedi.

## i18n
Yeni anahtar eklenmedi. Kullanilan `nav.assignments.*` anahtarlari de/en/tr uclusunde zaten dolu:
- de: Tagesubersicht / Planung / Morgen-Check-ins / Fahrzeugubergaben / Firmen-E-Mails / Urlaubsplaner / Umsatzubersicht
- en: Daily overview / Planning / Morning check-ins / Vehicle handovers / Company emails / Vacation planner / Revenue summary
- tr: Gunluk ozet / Planlama / Sabah check-in / Arac devirleri / Firma e-postalari / Izin planlayici / Gelir ozeti

## Dogrulama
```
cd frontend
npx eslint components/einsatzplan/EinsatzplanPage.tsx components/einsatzplan/Tagesplanung.tsx \
  lib/navigation.ts components/layout/Sidebar.tsx     # ciktisiz (0 error)
npm run verify                                        # i18n-check + tsc --noEmit + next build => basarili
```
`npm run verify` build asamasi tum sayfalari uretti, hata yok.

Backend'e dokunulmadi (yalnizca frontend navigasyon/UI degisikligi).
