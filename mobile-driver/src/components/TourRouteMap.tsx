import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { decodePolyline } from '@/lib/decode-polyline';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import type { DriverTourStop } from '@/api/types';

/**
 * Turun tamamini haritada gosterir.
 *
 * NEDEN WEBVIEW: uygulamada harita kutuphanesi yok ve react-native-maps
 * native modul — Expo Go ile calismaz, Android'de ayrica Google API anahtari
 * ister. react-native-webview zaten bagimlilikta ve web tarafi da Leaflet
 * kullaniyor; ayni cizim iki platformda ayni gorunsun.
 *
 * Rota BACAK GOVDELERINDEN cizilir, duraklari duz cizgiyle baglamaktan degil:
 * duz cizgi 40 km'lik bir sapmayi gizler ve surucu gercekte nereden
 * gececegini goremez.
 *
 * Harita cevrimici calisir (kutu dosyalari internetten gelir). Sinyal yoksa
 * altindaki durak listesi tek basina yeterli olmali — bu yuzden harita bir
 * ek, tek bilgi kaynagi degil.
 */
export function TourRouteMap({ stops }: { stops: DriverTourStop[] }) {
  const { t } = useTranslation();

  const positioned = useMemo(
    () => stops.filter((stop) => stop.latitude !== null && stop.longitude !== null),
    [stops],
  );

  const html = useMemo(() => {
    const markers = positioned.map((stop) => ({
      lat: stop.latitude as number,
      lng: stop.longitude as number,
      seq: stop.sequence,
      blocked: stop.truckAccess === 'unreachable',
    }));

    const legs = stops
      .filter((stop) => Boolean(stop.legShape))
      .map((stop) => decodePolyline(stop.legShape as string))
      .filter((points) => points.length > 1);

    return buildMapHtml(markers, legs);
  }, [positioned, stops]);

  if (positioned.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('tour.mapUnavailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        // Surucu haritayla ugrasmasin diye kaydirma kapali; harita kendi
        // sinirlarina otomatik oturuyor.
        javaScriptEnabled
        androidLayerType="hardware"
      />
    </View>
  );
}

type MapMarker = { lat: number; lng: number; seq: number; blocked: boolean };

function buildMapHtml(markers: MapMarker[], legs: Array<Array<[number, number]>>): string {
  const data = JSON.stringify({ markers, legs });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eee}
.leaflet-control-attribution{font-size:9px}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var data = ${data};
  var map = L.map('map', { zoomControl: false });
  // Web tarafiyla AYNI kaynak (frontend/lib/map-tiles.ts). OSM'in kendi
  // sunucusu kullanilmiyor: kullanim politikasi ticari uygulamalari disliyor
  // ve atif zorunlu. Atif kontrolu kapatilmamali.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(map);

  var bounds = [];
  data.legs.forEach(function (points) {
    L.polyline(points, { color: '#1e3a5f', weight: 5 }).addTo(map);
    points.forEach(function (p) { bounds.push(p); });
  });

  data.markers.forEach(function (m) {
    var color = m.blocked ? '#e11d48' : '#1e3a5f';
    L.marker([m.lat, m.lng], {
      icon: L.divIcon({
        className: '',
        html: '<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:' + color + ';color:#fff;font:700 12px sans-serif;border:2px solid #fff">' + m.seq + '</span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    }).addTo(map);
    bounds.push([m.lat, m.lng]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  web: { flex: 1, backgroundColor: colors.border },
  empty: {
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.caption, color: colors.subtext },
});
