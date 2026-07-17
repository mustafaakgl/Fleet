# MOBILE-2 Kanit ve Durum

Tarih: 2026-07-17

## Tamamlananlar

1. EAS ve uygulama kimlik temeli hazirlandi
- mobile-driver/eas.json olusturuldu (development/preview/production).
- mobile-driver/app.json guncellendi:
  - ios.bundleIdentifier: de.operion.driver
  - ios.buildNumber: 1
  - android.package: de.operion.driver
  - android.versionCode: 1
  - icon/adaptive-icon/splash/notification bloklari eklendi
  - runtimeVersion.policy: appVersion
  - plugin: expo-updates
  - extra.eas.projectId: REPLACE_WITH_EAS_PROJECT_ID (yer hazir)
- mobile-driver/app.config.ts olusturuldu:
  - extra.apiBaseUrl, EXPO_PUBLIC_API_BASE_URL env ile profile bazli besleniyor.

2. Push altyapisi guclendirildi
- Android default notification channel kodu eklendi (default, ses, titreşim, max onem).
- Login sonrasi push register devam ediyor.
- Retry mekanizmasi eklendi:
  - app foreground'a donunce tekrar dene
  - izin degisimi sonrasi (active event) tekrar dene
- Profil ekraninda durum satiri eklendi:
  - "Bildirimler: aktif"
  - "Bildirimler: kapalı — aç"
  - kapaliysa acma aksiyonu (izin denied ise ayarlari acar, diger durumda tekrar register dener).

3. OTA zemini
- expo-updates paketi yuklendi (expo install ile).
- eas.json build profillerine channel baglandi:
  - development
  - preview
  - production

4. Marka assetleri
- frontend/public/brand/operion-mark.svg kaynagindan PNG turetildi:
  - mobile-driver/assets/icon.png (1024)
  - mobile-driver/assets/adaptive-icon.png (1024)
  - mobile-driver/assets/notification-icon.png (96)
- splash marka hizasi:
  - mobile-driver/assets/splash-logo.png

5. Dogrulama ciktilari
- mobile-driver typecheck:
```text
pushd /Users/mustafaakgul/Projects/Fleet/mobile-driver >/dev/null; npx tsc --noEmit
(base) mustafaakgul@Mustafa-MacBook-Pro mobile-driver %
```
- Expo config public resolve:
```text
pushd /Users/mustafaakgul/Projects/Fleet/mobile-driver >/dev/null; npx expo config --type public
...
extra: {
  apiBaseUrl: 'http://localhost:3000/api/v1',
  eas: { projectId: 'REPLACE_WITH_EAS_PROJECT_ID' }
}
```

## DUR-NOKTASI 1 (kullanici aksiyonu gerekir): EAS hesap/init

Asagidaki komutlari mobile-driver icinde calistir ve ham ciktiyi paylas:

```bash
cd /Users/mustafaakgul/Projects/Fleet/mobile-driver
npx eas login
npx eas init
```

Beklenen cikti:
- EAS projectId olusur/atanir.
- Bunu app.json -> extra.eas.projectId alanina yazacagiz (tek satir).

## DUR-NOKTASI 2 (kullanici aksiyonu gerekir): FCM/APNs kurulum dosyalari

### Android FCM (Firebase Console)
1. Firebase Console -> Project settings (dişli) -> Your apps -> Android app ekle.
2. Android package name olarak de.operion.driver gir.
3. Register app.
4. "Download google-services.json" ile dosyayi indir.
5. Dosyayi su yola koy:
   - mobile-driver/google-services.json

### iOS APNs anahtari (Apple Developer + Firebase)
1. Apple Developer -> Certificates, Identifiers & Profiles -> Keys.
2. "+" -> Key Name ver -> "Apple Push Notifications service (APNs)" sec -> Continue -> Register.
3. Key ID not al, .p8 dosyasini indir (tek sefer indirilebilir).
4. Apple Team ID not al.
5. Firebase Console -> Project settings -> Cloud Messaging -> Apple app configuration.
6. APNs Authentication Key yukle:
   - .p8 dosyasi
   - Key ID
   - Team ID
7. Firebase'de iOS app bundle id de.operion.driver ile eslesmeli.

Not:
- Bu adimlar tamamlandiginda EAS credentials ekraninda da iOS push key baglantisi dogrulanir.

## DUR-NOKTASI 3 (kullanici onayli build/test)

Asagidaki komut kullanici onayiyla calistirilacak:

```bash
cd /Users/mustafaakgul/Projects/Fleet/mobile-driver
npx eas build --profile preview
```

Hedef kanit (sonraki adim):
- Gercek cihaz kurulum + login
- Backend'de user.expoPushToken dolu satir/log
- Test push bildiriminin cihaza dusmesi

Bu kanitlar icin build URL, cihaz logu/screenshot ve backend kanit satiri gerekecek.
