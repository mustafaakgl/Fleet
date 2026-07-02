import L from 'leaflet';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';

export type SpeedPoint = {
  lat: number;
  lng: number;
  speedKmh: number | null;
};

export type SpeedSegment = {
  positions: L.LatLngExpression[];
  color: string;
};

function speedSegmentColor(speedKmh: number | null): string {
  const speed = speedKmh ?? 0;
  if (speed < TELEMATICS_THRESHOLDS.mapSpeedGreenMaxKph) return '#16a34a';
  if (speed <= TELEMATICS_THRESHOLDS.mapSpeedAmberMaxKph) return '#d97706';
  return '#dc2626';
}

/** Merge consecutive points with the same speed color into single polylines. */
export function buildSpeedColoredSegments(points: SpeedPoint[]): SpeedSegment[] {
  if (points.length < 2) return [];

  const segments: SpeedSegment[] = [];
  let start = 0;
  let color = speedSegmentColor(points[0].speedKmh);

  for (let index = 1; index < points.length; index += 1) {
    const nextColor = speedSegmentColor(points[index].speedKmh);
    if (nextColor !== color) {
      segments.push({
        positions: points.slice(start, index + 1).map((point) => [point.lat, point.lng]),
        color,
      });
      start = index;
      color = nextColor;
    }
  }

  segments.push({
    positions: points.slice(start).map((point) => [point.lat, point.lng]),
    color,
  });

  return segments.filter((segment) => segment.positions.length >= 2);
}
