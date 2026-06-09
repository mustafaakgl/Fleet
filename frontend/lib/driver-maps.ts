export function openMapsAddress(address: string) {
  const encoded = encodeURIComponent(address.trim());
  if (!encoded || typeof window === 'undefined') return;

  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  const url = isApple
    ? `http://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  window.open(url, '_blank', 'noopener,noreferrer');
}
