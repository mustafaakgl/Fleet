import { Linking, Platform } from 'react-native';

export async function openMapsAddress(address: string) {
  const encoded = encodeURIComponent(address.trim());
  if (!encoded) return;

  const url = Platform.select({
    ios: `http://maps.apple.com/?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  });

  if (!url) return;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}

/**
 * Hazir bir navigasyon URL'ini acar.
 *
 * canOpenURL Android'de `google.navigation:` gibi ozel semalarda uygulama
 * kurulu degilse false doner; o durumda web yol tarifine dusuyoruz ki buton
 * sessizce hicbir sey yapmasin.
 */
export async function openExternalUrl(url: string, webFallback?: string) {
  const canOpen = await Linking.canOpenURL(url).catch(() => false);
  if (canOpen) {
    await Linking.openURL(url);
    return;
  }
  if (webFallback) {
    await Linking.openURL(webFallback);
  }
}
