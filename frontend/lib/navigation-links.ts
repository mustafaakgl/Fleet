/**
 * Links into the phone's map app.
 *
 * Coordinates, not addresses: an address string gets re-searched by the map app
 * and can land somewhere else. Ours came from Photon and was verified with
 * Valhalla as "a truck can reach this"; dropping back to text throws that away.
 *
 * One stop, not the whole tour: Google Maps caps waypoints (~9) and Waze has
 * none at all. More importantly map apps do not know the truck profile and will
 * happily route under a low bridge. The full tour stays in our app, computed
 * with the truck profile; the map app only drives the next leg.
 *
 * TWIN FILE: `mobile-driver/src/lib/navigation-links.ts` holds the same rules.
 * They are duplicated on purpose — the frontend Docker image is built from
 * `frontend/` alone (`COPY . .`), so importing across the two packages would
 * break the production build. `navigation-links.spec.ts` locks the shared URL
 * shapes on both sides so the copies cannot drift silently.
 */

export type NavigationApp = 'default' | 'google' | 'apple' | 'waze';

export interface NavigationTarget {
  latitude: number;
  longitude: number;
  /** Shown as a label by the map app; it does not determine the location. */
  label?: string | null;
}

export type MobilePlatform = 'ios' | 'android' | 'web';

function isValidCoordinate(target: NavigationTarget): boolean {
  return (
    Number.isFinite(target.latitude)
    && Number.isFinite(target.longitude)
    && Math.abs(target.latitude) <= 90
    && Math.abs(target.longitude) <= 180
  );
}

/** Trims coordinates to a fixed precision so URLs stay short. */
function coord(target: NavigationTarget): string {
  return `${target.latitude.toFixed(6)},${target.longitude.toFixed(6)}`;
}

/**
 * The mobile app reads Platform.OS; in the browser the user agent is all we have.
 * Only used to pick a default map app, so a wrong guess degrades to the Google
 * Maps web URL rather than breaking navigation.
 */
export function detectMobilePlatform(userAgent?: string): MobilePlatform {
  const ua = (userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)).toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}

/**
 * Builds a navigation link to the next stop.
 * Returns null for an invalid coordinate — the caller must disable the button.
 */
export function buildNavigationUrl(
  target: NavigationTarget,
  platform: MobilePlatform,
  app: NavigationApp = 'default',
): string | null {
  if (!isValidCoordinate(target)) {
    return null;
  }

  const destination = coord(target);
  const label = target.label?.trim() ? encodeURIComponent(target.label.trim()) : '';

  if (app === 'waze') {
    // Waze has no waypoints; navigate=yes starts guidance straight away.
    return `https://waze.com/ul?ll=${destination}&navigate=yes`;
  }

  if (app === 'apple' || (app === 'default' && platform === 'ios')) {
    // dirflg=d: driving directions
    const name = label ? `&q=${label}` : '';
    return `http://maps.apple.com/?daddr=${destination}&dirflg=d${name}`;
  }

  if (app === 'google' || (app === 'default' && platform === 'android')) {
    // google.navigation: starts turn-by-turn directly; the maps search URL only
    // shows the location and makes the driver tap once more.
    return `google.navigation:q=${destination}&mode=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/**
 * Attempt to fit the whole tour into one link.
 *
 * Deliberately limited: a Google Maps URL takes about nine waypoints in practice
 * and silently truncates beyond that, leaving the driver with a route that is
 * missing stops. Returning null instead lets the UI say "too long, go stop by
 * stop" rather than lying.
 */
export const MAX_WAYPOINTS_IN_LINK = 9;

export function buildFullTourUrl(stops: NavigationTarget[]): string | null {
  const valid = stops.filter(isValidCoordinate);
  if (valid.length < 2 || valid.length > MAX_WAYPOINTS_IN_LINK + 1) {
    return null;
  }

  const origin = coord(valid[0]);
  const destination = coord(valid[valid.length - 1]);
  const waypoints = valid.slice(1, -1).map(coord).join('|');

  const params = [
    'api=1',
    `origin=${origin}`,
    `destination=${destination}`,
    'travelmode=driving',
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : '',
  ].filter(Boolean);

  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
