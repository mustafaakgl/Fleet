import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFullTourUrl,
  buildNavigationUrl,
  detectMobilePlatform,
  MAX_WAYPOINTS_IN_LINK,
} from './navigation-links';

/**
 * This file is the web half of a deliberate duplication: the same rules live in
 * `mobile-driver/src/lib/navigation-links.ts` because the frontend Docker image
 * cannot see that package. These assertions mirror the mobile spec so the two
 * copies cannot drift apart without a test going red on one side.
 */

const DUISBURG = { latitude: 51.4408, longitude: 6.7069 };
const LEIPZIG = { latitude: 51.3397, longitude: 12.3731 };

describe('buildNavigationUrl', () => {
  it('starts turn-by-turn navigation directly on Android', () => {
    assert.equal(
      buildNavigationUrl(DUISBURG, 'android'),
      'google.navigation:q=51.440800,6.706900&mode=d',
    );
  });

  it('uses Apple Maps driving directions on iOS', () => {
    assert.equal(
      buildNavigationUrl(DUISBURG, 'ios'),
      'http://maps.apple.com/?daddr=51.440800,6.706900&dirflg=d',
    );
  });

  it('falls back to a web directions link on other platforms', () => {
    assert.equal(
      buildNavigationUrl(DUISBURG, 'web'),
      'https://www.google.com/maps/dir/?api=1&destination=51.440800,6.706900&travelmode=driving',
    );
  });

  it('honours an explicit app choice over the platform default', () => {
    assert.equal(
      buildNavigationUrl(DUISBURG, 'android', 'apple'),
      'http://maps.apple.com/?daddr=51.440800,6.706900&dirflg=d',
    );
  });

  it('builds a Waze link that starts navigation immediately', () => {
    assert.equal(
      buildNavigationUrl(DUISBURG, 'android', 'waze'),
      'https://waze.com/ul?ll=51.440800,6.706900&navigate=yes',
    );
  });

  /** An unusable link must be refused so the caller can disable the button. */
  it('returns null for coordinates outside the valid range', () => {
    assert.equal(buildNavigationUrl({ latitude: 91, longitude: 6 }, 'android'), null);
    assert.equal(buildNavigationUrl({ latitude: 51, longitude: 181 }, 'android'), null);
    assert.equal(buildNavigationUrl({ latitude: Number.NaN, longitude: 6 }, 'android'), null);
  });

  it('encodes labels containing spaces and umlauts', () => {
    const url = buildNavigationUrl({ ...DUISBURG, label: 'Lager Süd 3' }, 'ios');
    assert.ok(url?.includes(`&q=${encodeURIComponent('Lager Süd 3')}`));
  });

  it('omits the label when there is none', () => {
    assert.ok(!buildNavigationUrl({ ...DUISBURG, label: '   ' }, 'ios')?.includes('&q='));
  });
});

describe('buildFullTourUrl', () => {
  it('puts intermediate stops into waypoints', () => {
    const url = buildFullTourUrl([DUISBURG, { latitude: 51.5, longitude: 7.5 }, LEIPZIG]);
    assert.ok(url?.includes('origin=51.440800,6.706900'));
    assert.ok(url?.includes('destination=51.339700,12.373100'));
    assert.ok(url?.includes(`waypoints=${encodeURIComponent('51.500000,7.500000')}`));
  });

  /** Truncating would show the driver a route that quietly skips stops. */
  it('returns null rather than silently truncating a long tour', () => {
    const many = Array.from({ length: MAX_WAYPOINTS_IN_LINK + 2 }, (_, i) => ({
      latitude: 51 + i * 0.01,
      longitude: 7 + i * 0.01,
    }));
    assert.equal(buildFullTourUrl(many), null);
  });

  it('returns null when there are fewer than two usable stops', () => {
    assert.equal(buildFullTourUrl([DUISBURG]), null);
    assert.equal(buildFullTourUrl([]), null);
  });

  it('drops invalid coordinates before deciding', () => {
    assert.equal(buildFullTourUrl([DUISBURG, { latitude: 999, longitude: 999 }]), null);
  });
});

describe('detectMobilePlatform', () => {
  it('recognises the platforms that change the default map app', () => {
    assert.equal(detectMobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
    assert.equal(detectMobilePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android');
    assert.equal(detectMobilePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'web');
  });

  /** A wrong guess only picks a different map app, so an empty UA is safe. */
  it('falls back to web for an unknown agent', () => {
    assert.equal(detectMobilePlatform(''), 'web');
  });
});
