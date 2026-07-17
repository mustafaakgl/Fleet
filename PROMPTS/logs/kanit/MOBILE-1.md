# MOBILE-1 Kanit

Tarih: 2026-07-17

## 1) KRITIK import duzeltmesi + tab bar dogrulama

Dosya duzeltmesi:
- mobile-driver/app/(app)/_layout.tsx
- `Fragment` importu `react-native` -> `react` olarak duzeltildi.

iOS dogrulama denemesi (ham log):
```text
pushd /Users/mustafaakgul/Projects/Fleet/mobile-driver >/dev/null; npx expo start --offline --clear --ios
Networking has been disabled
Starting project at /Users/mustafaakgul/Projects/Fleet/mobile-driver
Starting Metro Bundler
warning: Bundler cache is empty, rebuilding (this may take a minute)
✔ Xcode must be fully installed before you can continue. Continue to the App Store? … no
```

Not:
- Bu ortamda Xcode tam kurulu olmadigi icin iOS simulator/Expo dev-client login sonrasi tab bar runtime kaniti (ekran goruntusu veya app-log) uretilmesi bloklandi.
- Tab bar agaci kodda aktif: `Tabs.Screen` -> `today/messages/requests/reports/profile`.

## 2) Diger gercek buglar

Uygulanan duzeltmeler:
- mobile-driver/app/(app)/today/fuel.tsx
  - `formatAppDate(entry.enteredAt, locale)` -> `formatAppDate(locale, new Date(entry.enteredAt))`
- mobile-driver/src/components/DriverReportsPanel.tsx
  - `radius.full` -> `radius.pill`
  - `radius.full` referans taramasi: tek kullanim bu dosyada, kapatildi.
- requests uniform_delivery backend uyumu:
  - mobile-driver/src/api/endpoints.ts: `createRequest.type` union'a `uniform_delivery` eklendi
  - backend/src/requests/requests.service.ts: `RequestType` ve `REQUEST_TYPES` listesine `uniform_delivery` eklendi
  - backend/src/requests/dto/create-request.dto.ts: enum listesine `uniform_delivery` eklendi
  - backend/src/driver-mobile/dto/create-driver-request.dto.ts: enum listesine `uniform_delivery` eklendi

Backend kaynagi (referans):
- backend/prisma/schema.prisma -> `enum RequestType` icinde `uniform_delivery` var.

## 3) Typed-routes yenileme

Ham log (uretim tetigi):
```text
pushd /Users/mustafaakgul/Projects/Fleet/mobile-driver >/dev/null; npx expo start --offline --clear --non-interactive
  --non-interactive is not supported, use $CI=1 instead
Networking has been disabled
Starting project at /Users/mustafaakgul/Projects/Fleet/mobile-driver
Starting Metro Bundler
...
```

Sonuc:
- `.expo/types/router.d.ts` route seti guncellendi (reports, fines, defects, fuel, trip, vehicle-status, departure-check, profile/license-history vb. route'lar gorunur hale geldi).

## 4) HEDEF KANIT: tsc sifir hata

Ham komut ciktisi:
```text
pushd /Users/mustafaakgul/Projects/Fleet/mobile-driver >/dev/null; npx tsc --noEmit; echo "TSC_EXIT:$?"
TSC_EXIT:0
```

## 5) CI mobile-typecheck job

Dosya:
- .github/workflows/ci.yml

Eklenen job:
- `mobile-typecheck`
- Node matrix: 20, 22
- `working-directory: mobile-driver`
- adimlar: `npm ci` + `npx tsc --noEmit`

## 6) Mesai (work-session) mantigi tespit raporu (DUZELTME YOK)

Bulgular:
- Otomatik baslat/bitir davranisi mevcut:
  - mobile-driver/src/components/WorkSessionHost.tsx
  - App acilis/active durumunda `startWorkSession()` cagriliyor
  - App background/inactive durumunda `endWorkSession('app_background')` cagriliyor
- Manuel kontrol de mevcut:
  - mobile-driver/src/components/WorkSessionCard.tsx
  - Manuel bitir: `endWorkSession('manual')`
  - Manuel baslat: `startWorkSession()`
- Logout davranisi:
  - mobile-driver/src/features/auth/store.ts
  - `endWorkSession('logout')`

DRIVER-3 manuel baslat/bitir ilkesi ile uyum degerlendirmesi:
- Kismi celiski riski var.
- Neden: `WorkSessionHost` otomatik start/end yaptigi icin kullanici manuel olarak baslatmadan da aktif oturum acilabiliyor; app background olayinda da manuel bitis disi kapanis uretebiliyor.
- Sonraki gorev girdisi: manuel ilke katilasacaksa `WorkSessionHost` otomatik start/end akisinin feature flag veya policy kosuluyla sinirlanmasi gerekir.
