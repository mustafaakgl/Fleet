import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nearbyFuelStations = vi.fn();

vi.mock('@/lib/api', () => ({
  driverPortalApi: {
    nearbyFuelStations: (...args: unknown[]) => nearbyFuelStations(...args),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

/**
 * Harita SINIRI mock: Leaflet jsdom'da acilmaz ve gercek harita karolari
 * ucuncu taraf servistir. Testte marker'lar dugmeye indirgeniyor — secim
 * senkronu ve "harita cokerse liste yasar" davranisi boylece sinanabiliyor.
 */
const mapRenderSpy = vi.fn();
let mapShouldThrow = false;

vi.mock('@/components/driver-portal/DriverFuelStationsMap', () => ({
  DriverFuelStationsMap: (props: {
    driver: { latitude: number; longitude: number };
    stations: Array<{ id: string; name: string }>;
    selectedStationId: string | null;
    onSelectStation: (id: string) => void;
  }) => {
    mapRenderSpy(props);
    if (mapShouldThrow) {
      throw new Error('leaflet exploded');
    }
    return (
      <div data-testid="fuel-map">
        <span data-testid="map-driver">{`${props.driver.latitude},${props.driver.longitude}`}</span>
        <span data-testid="map-selected">{props.selectedStationId ?? 'none'}</span>
        {props.stations.map((station) => (
          <button
            key={station.id}
            type="button"
            onClick={() => props.onSelectStation(station.id)}
          >
            {`marker:${station.id}`}
          </button>
        ))}
      </div>
    );
  },
}));

import { resetDriverPositionCache } from '@/lib/driver-geolocation';
import { DriverFuelStationsScreen } from './DriverFuelStationsScreen';

const KEY = {
  find: 'driverPortal.fuelStations.findAction',
  searchAgain: 'driverPortal.fuelStations.searchAgain',
  retry: 'driverPortal.fuelStations.retry',
  demo: 'driverPortal.fuelStations.demoBanner',
  emptyTitle: 'driverPortal.fuelStations.emptyTitle',
  priceUnavailable: 'driverPortal.fuelStations.priceUnavailable',
  openRoute: 'driverPortal.fuelStations.openRoute',
  nearest: 'driverPortal.fuelStations.nearest',
  cheapest: 'driverPortal.fuelStations.cheapest',
  open: 'driverPortal.fuelStations.open',
  closed: 'driverPortal.fuelStations.closed',
  diesel: 'driverPortal.fuelStations.products.DIESEL',
  e5: 'driverPortal.fuelStations.products.SUPER_E5',
  e10: 'driverPortal.fuelStations.products.SUPER_E10',
  sortPrice: 'driverPortal.fuelStations.sort.price',
  sortDistance: 'driverPortal.fuelStations.sort.distance',
  mapUnavailable: 'driverPortal.fuelStations.mapUnavailable',
  locationDenied: 'driverPortal.fuelStations.errors.locationDenied',
  locationTimeout: 'driverPortal.fuelStations.errors.locationTimeout',
  compatibilityMissing: 'driverPortal.fuelStations.errors.compatibilityMissing',
  noVehicle: 'driverPortal.fuelStations.errors.noVehicle',
  providerUnavailable: 'driverPortal.fuelStations.errors.providerUnavailable',
  generic: 'driverPortal.fuelStations.errors.generic',
};

/** Tarayici Geolocation'unu kontrol eden yardimci. */
type GeoBehaviour =
  | { kind: 'success'; latitude: number; longitude: number }
  | { kind: 'error'; code: number }
  | { kind: 'never' };

let geoBehaviour: GeoBehaviour = { kind: 'success', latitude: 51.4344, longitude: 6.7623 };
const getCurrentPosition = vi.fn();

function installGeolocation() {
  getCurrentPosition.mockImplementation(
    (
      onSuccess: (position: unknown) => void,
      onError?: (error: unknown) => void,
    ) => {
      if (geoBehaviour.kind === 'never') return;
      if (geoBehaviour.kind === 'error') {
        onError?.({
          code: geoBehaviour.code,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
        return;
      }
      onSuccess({
        coords: {
          latitude: geoBehaviour.latitude,
          longitude: geoBehaviour.longitude,
          accuracy: 10,
        },
        timestamp: Date.now(),
      });
    },
  );

  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
    configurable: true,
  });
}

function offering(productType: string, pricePerUnit: number | null) {
  return { productType, pricePerUnit, unit: 'liter', currency: 'EUR', updatedAt: null };
}

function station(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    provider: 'mock',
    name: `Station ${id}`,
    brand: 'ARAL',
    address: { street: 'Hafenstraße', houseNumber: '12', postalCode: '47059', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.76,
    distanceKm: 2,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-12T12:32:00.000Z',
    hgvAccess: 'unknown',
    acceptedFuelCards: null,
    offerings: [offering('DIESEL', 1.759)],
    ...overrides,
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123', compatibleProducts: ['DIESEL'] },
    search: { latitude: 51.4344, longitude: 6.7623, radiusKm: 10 },
    dataMode: 'mock',
    attribution: { label: 'Demodaten', url: null },
    providerSupportedProducts: ['DIESEL', 'SUPER_E5', 'SUPER_E10'],
    unsupportedCompatibleProducts: [],
    stations: [station('a')],
    ...overrides,
  };
}

beforeEach(() => {
  nearbyFuelStations.mockReset();
  getCurrentPosition.mockReset();
  mapRenderSpy.mockReset();
  mapShouldThrow = false;
  geoBehaviour = { kind: 'success', latitude: 51.4344, longitude: 6.7623 };
  resetDriverPositionCache();
  installGeolocation();
});

afterEach(() => {
  resetDriverPositionCache();
});

/**
 * Aksiyona basar ve sonucun GERCEKTEN render edilmesini bekler.
 *
 * Yalnizca "cagri yapildi" beklemek yeterli degil: yanit cozulduginde React
 * durumu henuz islenmemis oluyor ve testler bos ekrana bakiyor.
 */
async function findStations(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: KEY.find }));
  await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.queryByTestId('fuel-stations-skeleton')).toBeNull(),
  );
}

describe('DriverFuelStationsScreen — no work before the driver asks', () => {
  it('requests neither location nor stations on first render', () => {
    render(<DriverFuelStationsScreen />);

    // Sayfa acilisinda izin diyalogu acmak ve kota harcamak bilincli olarak yok.
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(nearbyFuelStations).not.toHaveBeenCalled();
  });

  it('asks for the location only after the driver taps the action', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await findStations(user);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('sends the coordinates and never a vehicleId', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const [params] = nearbyFuelStations.mock.calls[0] as [Record<string, unknown>];
    expect(params).toEqual({ latitude: 51.4344, longitude: 6.7623, radiusKm: 10 });
    // Arac sunucuda cozuluyor; istekte arac secilemez.
    expect(Object.keys(params)).not.toContain('vehicleId');
    expect(JSON.stringify(params)).not.toContain('vehicle');
  });

  it('does not query again when the radius changes', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);
    expect(nearbyFuelStations).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'driverPortal.fuelStations.radiusOption {"km":25}' }));

    // Yaricap degisti ama SORGU YOK — provider cagrisi ancak "Yeniden ara" ile.
    expect(nearbyFuelStations).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: KEY.searchAgain }));
    await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalledTimes(2));
    const [second] = nearbyFuelStations.mock.calls[1] as [Record<string, unknown>];
    expect(second.radiusKm).toBe(25);
  });
});

describe('DriverFuelStationsScreen — map and list', () => {
  it('shows the same stations on the map and in the list', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ stations: [station('a'), station('b', { distanceKm: 5 })] }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByTestId('fuel-map')).toBeDefined());
    const mapProps = mapRenderSpy.mock.calls.at(-1)![0] as { stations: Array<{ id: string }> };
    expect(mapProps.stations.map((s) => s.id)).toEqual(['a', 'b']);
    expect(screen.getByText('Station a')).toBeDefined();
    expect(screen.getByText('Station b')).toBeDefined();
  });

  it('passes the driver position to the map', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() =>
      expect(screen.getByTestId('map-driver').textContent).toBe('51.4344,6.7623'),
    );
  });

  it('syncs selection from the map to the list', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ stations: [station('a'), station('b', { distanceKm: 5 })] }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);
    await waitFor(() => expect(screen.getByTestId('fuel-map')).toBeDefined());

    await user.click(screen.getByRole('button', { name: 'marker:b' }));

    expect(screen.getByTestId('map-selected').textContent).toBe('b');
    // Ozet karti acilir ve secili istasyonu gosterir.
    expect(within(screen.getByTestId('station-summary')).getByText('Station b')).toBeDefined();
  });

  it('syncs selection from the list to the map', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ stations: [station('a'), station('b', { distanceKm: 5 })] }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const cards = screen.getAllByRole('button', { pressed: false });
    const listCard = cards.find((card) => card.textContent?.includes('Station b'));
    expect(listCard).toBeDefined();
    await user.click(listCard!);

    expect(screen.getByTestId('map-selected').textContent).toBe('b');
  });

  it('keeps the list working when the map component throws', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());
    mapShouldThrow = true;
    // React hata sinirini kullanirken beklenen konsol gurultusu bastiriliyor.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(<DriverFuelStationsScreen />);
      await findStations(user);

      await waitFor(() => expect(screen.getByText(KEY.mapUnavailable)).toBeDefined());
      // Harita coktu ama fiyat listesi hala orada.
      expect(screen.getByText('Station a')).toBeDefined();
      expect(screen.getByRole('link', { name: KEY.openRoute })).toBeDefined();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('DriverFuelStationsScreen — fuel filtering and sorting', () => {
  it('shows only the fuels the vehicle is compatible with', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123', compatibleProducts: ['DIESEL'] },
        stations: [station('a', { offerings: [offering('DIESEL', 1.759)] })],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    expect(screen.getByText(KEY.diesel)).toBeDefined();
    // Backend zaten filtreliyor; arayuz de benzin fiyati uydurmuyor.
    expect(screen.queryByText(KEY.e5)).toBeNull();
    expect(screen.queryByText(KEY.e10)).toBeNull();
  });

  it('sorts by price for the selected fuel and labels the cheapest correctly', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        vehicle: {
          id: 'veh-1',
          plateNumber: 'DU-AB 123',
          compatibleProducts: ['DIESEL', 'SUPER_E10'],
        },
        stations: [
          station('near-expensive', {
            distanceKm: 1,
            offerings: [offering('DIESEL', 1.899), offering('SUPER_E10', 1.799)],
          }),
          station('far-cheap', {
            distanceKm: 9,
            offerings: [offering('DIESEL', 1.649), offering('SUPER_E10', 1.999)],
          }),
        ],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    // Varsayilan mesafe siralamasi: en yakin basta ve "en yakin" etiketi onda.
    let headings = screen.getAllByText(/^Station /).map((node) => node.textContent);
    expect(headings[0]).toBe('Station near-expensive');

    // Dizel secip fiyata gore sirala.
    await user.click(screen.getByRole('button', { name: KEY.diesel }));
    await user.click(screen.getByRole('button', { name: KEY.sortPrice }));

    headings = screen.getAllByText(/^Station /).map((node) => node.textContent);
    expect(headings[0]).toBe('Station far-cheap');

    // "En ucuz" DIZEL icin uzaktaki istasyon; "en yakin" hala yakindaki.
    const cheapestCard = screen
      .getAllByText(KEY.cheapest)[0]!
      .closest('li') as HTMLElement;
    expect(cheapestCard.textContent).toContain('Station far-cheap');

    const nearestCard = screen
      .getAllByText(KEY.nearest)[0]!
      .closest('li') as HTMLElement;
    expect(nearestCard.textContent).toContain('Station near-expensive');
  });

  it('recomputes the cheapest label when the fuel changes', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        vehicle: {
          id: 'veh-1',
          plateNumber: 'DU-AB 123',
          compatibleProducts: ['DIESEL', 'SUPER_E10'],
        },
        stations: [
          station('diesel-cheap', {
            distanceKm: 1,
            offerings: [offering('DIESEL', 1.6), offering('SUPER_E10', 2.0)],
          }),
          station('e10-cheap', {
            distanceKm: 2,
            offerings: [offering('DIESEL', 1.9), offering('SUPER_E10', 1.7)],
          }),
        ],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await user.click(screen.getByRole('button', { name: KEY.diesel }));
    let cheapest = screen.getAllByText(KEY.cheapest)[0]!.closest('li') as HTMLElement;
    expect(cheapest.textContent).toContain('Station diesel-cheap');

    await user.click(screen.getByRole('button', { name: KEY.e10 }));
    cheapest = screen.getAllByText(KEY.cheapest)[0]!.closest('li') as HTMLElement;
    expect(cheapest.textContent).toContain('Station e10-cheap');
  });

  it('shows a station without a price as "price not available" and never as cheapest', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        stations: [
          station('noprice', { distanceKm: 1, offerings: [offering('DIESEL', null)] }),
          station('priced', { distanceKm: 4, offerings: [offering('DIESEL', 1.799)] }),
        ],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    expect(screen.getByText(KEY.priceUnavailable)).toBeDefined();

    const cheapest = screen.getAllByText(KEY.cheapest)[0]!.closest('li') as HTMLElement;
    expect(cheapest.textContent).toContain('Station priced');
    expect(cheapest.textContent).not.toContain('Station noprice');
  });

  it('warns about a compatible fuel the provider cannot price', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ unsupportedCompatibleProducts: ['HVO100'] }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    // Sessizce gizlenmiyor: surucu aracinin HVO100 kabul ettigini biliyor.
    expect(
      screen.getByText(/driverPortal\.fuelStations\.unsupportedProducts/),
    ).toBeDefined();
  });

  it('labels open and closed with text, not colour alone', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        stations: [
          station('open-one', { isOpen: true }),
          station('closed-one', { isOpen: false, distanceKm: 6 }),
        ],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    expect(screen.getByText(KEY.open)).toBeDefined();
    expect(screen.getByText(KEY.closed)).toBeDefined();
  });

  it('never renders unknown truck access or fuel card data', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    expect(document.body.textContent).not.toContain('unknown');
    expect(document.body.textContent).not.toContain('hgvAccess');
    expect(document.body.textContent).not.toContain('acceptedFuelCards');
  });

  it('labels the retrieval time as retrieved, not as a price update', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    // Anahtar adi bile "retrievedAt": fiyat guncelleme zamani diye sunulmuyor.
    expect(screen.getByText(/driverPortal\.fuelStations\.retrievedAt/)).toBeDefined();
    expect(document.body.textContent).not.toContain('pricesUpdatedAt');
  });
});

describe('DriverFuelStationsScreen — directions', () => {
  it('builds a safe external link from the coordinates only', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const link = screen.getByRole('link', { name: KEY.openRoute });
    const href = link.getAttribute('href')!;

    expect(href.startsWith('https://www.google.com/maps/dir/')).toBe(true);
    expect(href).toContain('destination=51.440000,6.760000');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('encodes the URL and does not inject the station name into the destination', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ stations: [station('a', { name: 'Aral & Co "Hafen"' })] }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const href = screen.getByRole('link', { name: KEY.openRoute }).getAttribute('href')!;
    // Adres/isim metni degil KOORDINAT kullaniliyor; ham tirnak/& sizmiyor.
    expect(href).not.toContain('"');
    expect(href).not.toContain('Aral & Co');
  });

  it('does not add the station to the tour', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);
    await user.click(screen.getByRole('link', { name: KEY.openRoute }));

    // Bu faz istasyonu TourStop olarak KAYDETMEZ ve rotayi degistirmez:
    // ekranda yalnizca yakit istasyonu ucu cagrilmis olmali.
    expect(nearbyFuelStations).toHaveBeenCalledTimes(1);
  });
});

describe('DriverFuelStationsScreen — errors and empty states', () => {
  it('explains a denied location and offers a retry', async () => {
    const user = userEvent.setup();
    geoBehaviour = { kind: 'error', code: 1 };

    render(<DriverFuelStationsScreen />);
    await user.click(screen.getByRole('button', { name: KEY.find }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(KEY.locationDenied));
    expect(nearbyFuelStations).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: KEY.retry })).toBeDefined();
  });

  it('explains a location timeout', async () => {
    const user = userEvent.setup();
    geoBehaviour = { kind: 'error', code: 3 };

    render(<DriverFuelStationsScreen />);
    await user.click(screen.getByRole('button', { name: KEY.find }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(KEY.locationTimeout));
  });

  it('turns 409 vehicle_fuel_compatibility_missing into driver-friendly guidance', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockRejectedValue({
      response: { data: { statusCode: 409, code: 'vehicle_fuel_compatibility_missing' } },
    });

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(KEY.compatibilityMissing),
    );
    // Ham kod gosterilmiyor; surucuye arac ayari degistirme yetkisi de verilmiyor.
    expect(screen.getByRole('alert').textContent).not.toContain('vehicle_fuel_compatibility_missing');
    expect(screen.queryByRole('link', { name: /vehicles/i })).toBeNull();
  });

  it('turns 409 driver_vehicle_not_resolved into a clear message', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockRejectedValue({
      response: { data: { statusCode: 409, code: 'driver_vehicle_not_resolved' } },
    });

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(KEY.noVehicle));
  });

  it('turns 503 provider_unavailable into a try-later message', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockRejectedValue({
      response: { data: { statusCode: 503, code: 'fuel_station_provider_unavailable' } },
    });

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(KEY.providerUnavailable),
    );
  });

  it('hides technical configuration detail for a misconfigured provider', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockRejectedValue({
      response: { data: { statusCode: 503, code: 'fuel_station_provider_not_configured' } },
    });

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).not.toContain('API');
    expect(text).not.toContain('TANKERKOENIG');
    expect(text).not.toContain('not_configured');
  });

  it('falls back to a generic message for a network failure', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockRejectedValue(new Error('Network Error'));

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(KEY.generic));
  });

  it('shows an empty state when nothing was found', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response({ stations: [] }));

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByText(KEY.emptyTitle)).toBeDefined());
    // Bos sonuc bir HATA degil.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DriverFuelStationsScreen — request lifecycle', () => {
  it('does not start a second request while one is in flight', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockReturnValue(new Promise(() => {}));

    render(<DriverFuelStationsScreen />);
    const action = screen.getByRole('button', { name: KEY.find });
    await user.click(action);
    await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalledTimes(1));

    // Dugme mesgul; ikinci dokunus yeni istek acmamali.
    await user.click(action).catch(() => undefined);
    expect(nearbyFuelStations).toHaveBeenCalledTimes(1);
  });

  it('passes an abort signal so a pending request can be cancelled', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const [, signal] = nearbyFuelStations.mock.calls[0] as [unknown, AbortSignal];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('aborts the pending request when the screen unmounts', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockReturnValue(new Promise(() => {}));

    const view = render(<DriverFuelStationsScreen />);
    await user.click(screen.getByRole('button', { name: KEY.find }));
    await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalled());

    const [, signal] = nearbyFuelStations.mock.calls[0] as [unknown, AbortSignal];
    view.unmount();

    expect(signal.aborted).toBe(true);
  });

  it('never lets a second search overlap the first, so no stale result can win', async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: unknown) => void) | undefined;

    nearbyFuelStations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    render(<DriverFuelStationsScreen />);
    // Dugmenin etiketi mesgul durumda degistigi icin DUGUM referansi tutuluyor.
    const action = screen.getByRole('button', { name: KEY.find });
    await user.click(action);
    await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalledTimes(1));

    // Bekleyen istek varken ikinci dokunus YENI ISTEK ACMAZ — bu, eski bir
    // yanitin yenisinin uzerine yazmasini kaynagindan engelliyor.
    await user.click(action).catch(() => undefined);
    expect(nearbyFuelStations).toHaveBeenCalledTimes(1);

    // Ilk (ve tek) istek doner ve normal sekilde render edilir.
    resolveFirst?.(response({ stations: [station('only')] }));
    await waitFor(() => expect(screen.getByText('Station only')).toBeDefined());
  });

  it('does not apply a response that arrives after the screen unmounted', async () => {
    const user = userEvent.setup();
    let resolveLate: ((value: unknown) => void) | undefined;
    nearbyFuelStations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLate = resolve;
        }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const view = render(<DriverFuelStationsScreen />);
      await user.click(screen.getByRole('button', { name: KEY.find }));
      await waitFor(() => expect(nearbyFuelStations).toHaveBeenCalled());

      view.unmount();
      // Gec gelen yanit unmount sonrasi durum guncellemesi denememeli.
      resolveLate?.(response({ stations: [station('late')] }));
      await Promise.resolve();

      expect(screen.queryByText('Station late')).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('DriverFuelStationsScreen — data mode and attribution', () => {
  it('shows the demo banner when the backend reports mock data', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({ dataMode: 'mock', attribution: { label: 'Demodaten', url: null } }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(KEY.demo));
    expect(screen.getByText('Demodaten')).toBeDefined();
  });

  it('shows the live attribution as a safe link and no demo banner', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        dataMode: 'live',
        attribution: {
          label: 'Tankstellen- und Preisdaten: Tankerkönig / MTS-K — CC BY 4.0',
          url: 'https://creativecommons.tankerkoenig.de',
        },
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.queryByText(KEY.demo)).toBeNull());
    const link = screen.getByRole('link', {
      name: 'Tankstellen- und Preisdaten: Tankerkönig / MTS-K — CC BY 4.0',
    });
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('decides the banner from the response, not a frontend flag', async () => {
    const user = userEvent.setup();
    // dataMode live ise, saglayici adi "mock" olsa bile demo bandi CIKMAZ:
    // karar yalnizca dataMode alanindan geliyor.
    nearbyFuelStations.mockResolvedValue(
      response({
        dataMode: 'live',
        attribution: { label: 'Live source', url: null },
        stations: [station('a', { provider: 'mock' })],
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    await waitFor(() => expect(screen.getByText('Station a')).toBeDefined());
    expect(screen.queryByText(KEY.demo)).toBeNull();
  });
});

describe('DriverFuelStationsScreen — accessibility', () => {
  it('gives the loading state a skeleton', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockReturnValue(new Promise(() => {}));

    render(<DriverFuelStationsScreen />);
    await user.click(screen.getByRole('button', { name: KEY.find }));

    await waitFor(() => expect(screen.getByTestId('fuel-stations-skeleton')).toBeDefined());
  });

  it('exposes radius, fuel and sort controls as pressable buttons', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        vehicle: {
          id: 'veh-1',
          plateNumber: 'DU-AB 123',
          compatibleProducts: ['DIESEL', 'SUPER_E10'],
        },
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    // aria-pressed: secili durum yalnizca renkle degil, erisilebilir
    // durumla da bildiriliyor.
    const radius = screen.getByRole('button', {
      name: 'driverPortal.fuelStations.radiusOption {"km":10}',
    });
    expect(radius.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: KEY.sortDistance }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: KEY.diesel }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('disables price sorting until a fuel is chosen', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(
      response({
        vehicle: {
          id: 'veh-1',
          plateNumber: 'DU-AB 123',
          compatibleProducts: ['DIESEL', 'SUPER_E10'],
        },
      }),
    );

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const priceSort = screen.getByRole('button', { name: KEY.sortPrice }) as HTMLButtonElement;
    expect(priceSort.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: KEY.diesel }));
    expect((screen.getByRole('button', { name: KEY.sortPrice }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('lets the keyboard reach and activate a station card', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    const card = screen
      .getAllByRole('button')
      .find((node) => node.textContent?.includes('Station a'))!;
    card.focus();
    expect(document.activeElement).toBe(card);

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('map-selected').textContent).toBe('a');
  });

  it('auto-selects the only compatible fuel so price sorting is usable', async () => {
    const user = userEvent.setup();
    nearbyFuelStations.mockResolvedValue(response());

    render(<DriverFuelStationsScreen />);
    await findStations(user);

    // Tek uyumlu urun varsa chip grubu gosterilmiyor ama fiyat siralamasi
    // calisir durumda olmali.
    expect(
      (screen.getByRole('button', { name: KEY.sortPrice }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
