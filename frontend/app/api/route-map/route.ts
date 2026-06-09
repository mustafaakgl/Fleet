import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const USER_AGENT = 'FleetDriverPortal/1.0 (route-map)';

interface GeoPoint {
  lat: number;
  lng: number;
  displayName: string;
}

async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address.trim();
  if (!query) return null;

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    addressdetails: '0',
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) return null;

  const rows = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const hit = rows[0];
  if (!hit) return null;

  return {
    lat: Number.parseFloat(hit.lat),
    lng: Number.parseFloat(hit.lon),
    displayName: hit.display_name,
  };
}

export async function GET(request: NextRequest) {
  const pickupAddress = request.nextUrl.searchParams.get('pickup')?.trim() ?? '';
  const deliveryAddress = request.nextUrl.searchParams.get('delivery')?.trim() ?? '';

  if (!pickupAddress || !deliveryAddress) {
    return NextResponse.json({ error: 'pickup and delivery are required' }, { status: 400 });
  }

  try {
    const [pickup, delivery] = await Promise.all([
      geocodeAddress(pickupAddress),
      geocodeAddress(deliveryAddress),
    ]);

    if (!pickup || !delivery) {
      return NextResponse.json({ error: 'geocoding_failed' }, { status: 404 });
    }

    const coords = `${pickup.lng},${pickup.lat};${delivery.lng},${delivery.lat}`;
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
    });

    const routeResponse = await fetch(`${OSRM_URL}/${coords}?${params.toString()}`);
    if (!routeResponse.ok) {
      return NextResponse.json({ error: 'routing_failed' }, { status: 502 });
    }

    const payload = (await routeResponse.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };

    const route = payload.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    if (!route || !geometry?.length) {
      return NextResponse.json({ error: 'routing_failed' }, { status: 404 });
    }

    return NextResponse.json({
      pickup,
      delivery,
      coordinates: geometry.map(([lng, lat]) => [lat, lng]),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    });
  } catch {
    return NextResponse.json({ error: 'route_map_failed' }, { status: 500 });
  }
}
