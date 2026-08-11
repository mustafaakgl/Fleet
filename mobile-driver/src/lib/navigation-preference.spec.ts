import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  availableNavigationApps,
  fullRouteOpensGoogle,
  isNavigationApp,
} from './navigation-preference';

describe('availableNavigationApps', () => {
  it('offers Apple Maps only on iOS', () => {
    // Android'de listelemek sonu "uygulama bulunamadi" ile biten bir secenek
    // sunmak olurdu.
    assert.ok(availableNavigationApps('ios').includes('apple'));
    assert.ok(!availableNavigationApps('android').includes('apple'));
  });

  it('always offers the platform default first', () => {
    for (const platform of ['ios', 'android', 'web'] as const) {
      assert.equal(availableNavigationApps(platform)[0], 'default');
    }
  });

  it('does not offer Waze on web', () => {
    assert.ok(!availableNavigationApps('web').includes('waze'));
  });
});

describe('fullRouteOpensGoogle', () => {
  it('warns when the chosen app is not the one that will open', () => {
    // Cok duraklı baglanti Google'a ozgu; Apple/Waze seceni uyarilmali.
    assert.equal(fullRouteOpensGoogle('apple', 'ios'), true);
    assert.equal(fullRouteOpensGoogle('waze', 'android'), true);
  });

  it('stays quiet when Google would open anyway', () => {
    assert.equal(fullRouteOpensGoogle('google', 'ios'), false);
    assert.equal(fullRouteOpensGoogle('default', 'android'), false);
  });

  it('warns an iOS driver on the platform default, because that is Apple Maps', () => {
    assert.equal(fullRouteOpensGoogle('default', 'ios'), true);
  });
});

describe('isNavigationApp', () => {
  it('rejects stored junk instead of trusting it', () => {
    assert.equal(isNavigationApp('here-maps'), false);
    assert.equal(isNavigationApp(null), false);
    assert.equal(isNavigationApp('waze'), true);
  });
});
