import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_WAYPOINTS_IN_LINK,
  buildFullTourUrl,
  buildNavigationUrl,
  type NavigationTarget,
} from './navigation-links';

const DUISBURG: NavigationTarget = { latitude: 51.4408, longitude: 6.7069, label: 'Vinckeweg' };
const KOELN: NavigationTarget = { latitude: 50.9375, longitude: 6.9603 };

describe('navigation-links', () => {
  describe('buildNavigationUrl', () => {
    it('starts turn-by-turn navigation directly on Android', () => {
      // google.navigation: adim adim baslatir; maps arama URL'i yalnizca
      // konumu gosterir ve surucunun bir kez daha basmasini gerektirir.
      const url = buildNavigationUrl(DUISBURG, 'android');
      assert.equal(url, 'google.navigation:q=51.440800,6.706900&mode=d');
    });

    it('uses Apple Maps driving directions on iOS', () => {
      const url = buildNavigationUrl(DUISBURG, 'ios');
      assert.ok(url?.startsWith('http://maps.apple.com/?daddr=51.440800,6.706900&dirflg=d'));
      assert.ok(url?.includes('q=Vinckeweg'));
    });

    it('falls back to a web directions link on other platforms', () => {
      const url = buildNavigationUrl(KOELN, 'web');
      assert.ok(url?.includes('google.com/maps/dir/'));
      assert.ok(url?.includes('destination=50.937500,6.960300'));
      assert.ok(url?.includes('travelmode=driving'));
    });

    it('honours an explicit app choice over the platform default', () => {
      assert.ok(buildNavigationUrl(DUISBURG, 'android', 'apple')?.includes('maps.apple.com'));
      assert.ok(buildNavigationUrl(DUISBURG, 'ios', 'google')?.startsWith('google.navigation:'));
    });

    it('builds a Waze link that starts navigation immediately', () => {
      const url = buildNavigationUrl(DUISBURG, 'android', 'waze');
      assert.equal(url, 'https://waze.com/ul?ll=51.440800,6.706900&navigate=yes');
    });

    it('returns null for coordinates outside the valid range', () => {
      assert.equal(buildNavigationUrl({ latitude: 91, longitude: 6 }, 'android'), null);
      assert.equal(buildNavigationUrl({ latitude: 51, longitude: 181 }, 'android'), null);
      assert.equal(buildNavigationUrl({ latitude: Number.NaN, longitude: 6 }, 'android'), null);
    });

    it('omits the label when there is none', () => {
      const url = buildNavigationUrl(KOELN, 'ios');
      assert.ok(!url?.includes('&q='));
    });

    it('encodes labels containing spaces and umlauts', () => {
      const url = buildNavigationUrl(
        { ...DUISBURG, label: 'Lager Köln Süd' },
        'ios',
      );
      assert.ok(url?.includes('q=Lager%20K%C3%B6ln%20S%C3%BCd'));
    });
  });

  describe('buildFullTourUrl', () => {
    it('puts intermediate stops into waypoints', () => {
      const url = buildFullTourUrl([DUISBURG, KOELN, { latitude: 51.5136, longitude: 7.4653 }]);
      assert.ok(url?.includes('origin=51.440800,6.706900'));
      assert.ok(url?.includes('destination=51.513600,7.465300'));
      assert.ok(url?.includes('waypoints=50.937500%2C6.960300'));
    });

    it('returns null rather than silently truncating a long tour', () => {
      // Sessiz kirpma surucuye eksik rota gosterir; arayuz bunun yerine
      // "durak durak ilerleyin" diyebilmeli.
      const many = Array.from({ length: MAX_WAYPOINTS_IN_LINK + 2 }, (_, i) => ({
        latitude: 51 + i * 0.01,
        longitude: 6 + i * 0.01,
      }));
      assert.equal(buildFullTourUrl(many), null);
    });

    it('returns null when there are fewer than two usable stops', () => {
      assert.equal(buildFullTourUrl([DUISBURG]), null);
      assert.equal(buildFullTourUrl([]), null);
    });

    it('drops invalid coordinates before deciding', () => {
      const url = buildFullTourUrl([DUISBURG, { latitude: 999, longitude: 999 }, KOELN]);
      assert.ok(url?.includes('origin=51.440800,6.706900'));
      assert.ok(url?.includes('destination=50.937500,6.960300'));
      assert.ok(!url?.includes('999'));
    });
  });
});
