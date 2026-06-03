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
