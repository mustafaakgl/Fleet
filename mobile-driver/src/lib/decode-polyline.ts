/**
 * Valhalla encoded polyline cozucu.
 *
 * Valhalla varsayilan olarak PRECISION 6 kullanir, Google'in klasik
 * polyline'i 5. Yanlis hassasiyetle cozulen bir rota dunyanin baska bir
 * yerine dusuyor ve bu hata haritada "bos ekran" olarak gorunuyor — sebebi
 * anlasilmadigi icin pahali.
 */
export function decodePolyline(encoded: string, precision = 6): Array<[number, number]> {
  if (!encoded) {
    return [];
  }

  const factor = 10 ** precision;
  const points: Array<[number, number]> = [];

  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lng / factor]);
  }

  return points;
}
