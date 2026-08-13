import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Ofisin yakit duragi gorunumu ve tur haritasindaki pompa isareti.
 *
 * Leaflet jsdom'da acilmaz; harita bilesenleri isaret basina bir DOM dugumune
 * indirgeniyor. Sinanan sey tam da bu seviyede: hangi isaretin NUMARA tasidigi
 * ve pompa isaretinin durak numaralandirmasina GIRMEDIGI.
 */

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  Marker: ({
    icon,
    children,
    ...rest
  }: {
    icon?: { options?: { html?: string } };
    children?: React.ReactNode;
  } & Record<string, unknown>) => (
    <div
      data-testid={(rest as { 'data-testid'?: string })['data-testid'] ?? 'marker'}
      data-icon-html={icon?.options?.html ?? ''}
    >
      {children}
    </div>
  ),
  Polyline: () => <div data-testid="polyline" />,
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

vi.mock('@/components/map/ThemedTileLayer', () => ({ ThemedTileLayer: () => <div /> }));

vi.mock('leaflet', () => ({
  default: {
    divIcon: (options: { html: string }) => ({ options }),
    latLngBounds: (points: unknown) => points,
  },
}));

const fuelingIntentCall = vi.fn();

vi.mock('@/lib/api', () => ({
  toursApi: {
    release: vi.fn(),
    fuelingIntent: (...args: unknown[]) => fuelingIntentCall(...args),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }));

import type { FuelingIntent } from '@/lib/types';
import { TourFuelingIntentPanel } from './TourFuelingIntentPanel';
import { TourRoutePreviewMap } from './TourRoutePreviewMap';

function intent(overrides: Partial<FuelingIntent> = {}): FuelingIntent {
  return {
    id: 'intent-1',
    status: 'ACTIVE',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    vehiclePlateNumber: 'DU-AB 123',
    tourId: 'tour-1',
    anchorTourStopId: 'stop-2',
    station: {
      provider: 'tankerkoenig',
      providerStationId: 'station-1',
      name: 'Aral Duisburg Hafen',
      brand: 'ARAL',
      address: { street: 'Hafenstraße', houseNumber: '1', postalCode: '47059', city: 'Duisburg' },
      latitude: 51.44,
      longitude: 6.76,
    },
    selectedFuelProduct: 'DIESEL',
    quotedPricePerLitre: 1.759,
    priceRetrievedAt: '2026-08-13T09:58:00.000Z',
    attribution: { label: 'Tankerkönig', url: null },
    plannedLitres: 120,
    routeMode: 'active_tour',
    extraDistanceKm: 1.6,
    extraDurationMin: 3,
    driveTimeToStationMin: 8,
    stationEta: '2026-08-13T10:08:00.000Z',
    routeCalculatedAt: '2026-08-13T10:00:00.000Z',
    selectedAt: '2026-08-13T10:00:00.000Z',
    navigationOpenedAt: null,
    expiresAt: '2026-08-13T21:59:59.999Z',
    ...overrides,
  };
}

function stop(id: string, sequence: number) {
  return {
    id,
    sequence,
    plannedSequence: sequence,
    kind: 'delivery' as const,
    assignmentId: null,
    address: `Musterweg ${sequence}`,
    label: null,
    city: 'Duisburg',
    postalCode: '47059',
    latitude: 51.4 + sequence / 100,
    longitude: 6.7 + sequence / 100,
    truckAccess: 'reachable' as const,
    serviceMinutes: 10,
    windowStart: null,
    windowEnd: null,
    legDistanceKm: null,
    legDurationMin: null,
    legShape: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
  };
}

describe('TourFuelingIntentPanel — office visibility', () => {
  it('shows what the office needs and nothing it can act on', () => {
    render(<TourFuelingIntentPanel intent={intent()} />);

    const panel = screen.getByTestId('tour-fueling-intent');
    expect(within(panel).getByText('tours.fuelingIntent.title')).toBeDefined();
    expect(within(panel).getByText('Aral Duisburg Hafen')).toBeDefined();
    expect(within(panel).getByText('DU-AB 123')).toBeDefined();
    expect(within(panel).getByText('driverPortal.fuelStations.products.DIESEL')).toBeDefined();
    expect(within(panel).getByText(/tours\.fuelingIntent\.plannedLitres/)).toBeDefined();
    expect(within(panel).getByText('tours.fuelingIntent.status.ACTIVE')).toBeDefined();
    expect(within(panel).getByText(/tours\.fuelingIntent\.selectedAt/)).toBeDefined();
    expect(within(panel).getByText(/driverPortal\.fuelStations\.routeImpact/)).toBeDefined();

    // Ofis bu fazda secimi DEGISTIREMEZ: kartta hicbir aksiyon yok.
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('link')).toHaveLength(0);
  });

  it('labels the price as a search-time price, not as the amount paid', () => {
    render(<TourFuelingIntentPanel intent={intent()} />);

    const panel = screen.getByTestId('tour-fueling-intent');
    expect(within(panel).getByText('tours.fuelingIntent.quotedPriceNote')).toBeDefined();
    expect(within(panel).getByText('tours.fuelingIntent.doesNotChangeTour')).toBeDefined();
  });

  it('hides the route impact for a selection made without a tour', () => {
    render(
      <TourFuelingIntentPanel
        intent={intent({ tourId: null, extraDistanceKm: null, extraDurationMin: null })}
      />,
    );

    // Sapma yokken "0 km" GOSTERILMEZ.
    expect(screen.queryByText(/driverPortal\.fuelStations\.routeImpact/)).toBeNull();
  });

  it('renders nothing when there is no active fuel stop', () => {
    const { container } = render(<TourFuelingIntentPanel intent={null} />);
    expect(container.textContent).toBe('');
  });

  it('does not leak a raw backend code into the office view', () => {
    render(<TourFuelingIntentPanel intent={intent()} />);
    expect(document.body.textContent).not.toContain('fueling_intent');
    expect(document.body.textContent).not.toContain('providerStationId');
  });
});

describe('TourRoutePreviewMap — fuel stop overlay', () => {
  it('draws the fuel stop as its own marker, outside the stop numbering', () => {
    render(
      <TourRoutePreviewMap
        stops={[stop('s1', 1), stop('s2', 2)]}
        fuelStop={{ latitude: 51.44, longitude: 6.76, name: 'Aral Duisburg Hafen' }}
      />,
    );

    const numbered = screen.getAllByTestId('marker');
    // Iki musteri duragi -> iki numarali isaret. Yakit duragi ARALARINDA DEGIL.
    expect(numbered).toHaveLength(2);
    expect(numbered.map((node) => node.getAttribute('data-icon-html'))).toEqual([
      expect.stringContaining('>1<'),
      expect.stringContaining('>2<'),
    ]);

    const fuelMarker = screen.getByTestId('tour-map-fuel-stop');
    // Pompa isareti numara TASIMIYOR.
    expect(fuelMarker.getAttribute('data-icon-html')).toContain('<svg');
    expect(fuelMarker.getAttribute('data-icon-html')).not.toMatch(/>\d</);
    expect(within(fuelMarker).getByText(/tours\.fuelingIntent\.mapMarker/)).toBeDefined();
  });

  it('keeps the stop numbering untouched when there is no fuel stop', () => {
    render(<TourRoutePreviewMap stops={[stop('s1', 1), stop('s2', 2)]} />);

    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.queryByTestId('tour-map-fuel-stop')).toBeNull();
  });

  it('draws no line to the station — there is no real road geometry for it', () => {
    render(
      <TourRoutePreviewMap
        stops={[stop('s1', 1), stop('s2', 2)]}
        fuelStop={{ latitude: 51.44, longitude: 6.76, name: 'Aral Duisburg Hafen' }}
      />,
    );

    // Bacak govdesi olmayan turda hic polyline yok; duz cizgi UYDURULMUYOR.
    expect(screen.queryAllByTestId('polyline')).toHaveLength(0);
  });

  it('ignores a fuel stop without usable coordinates', async () => {
    render(
      <TourRoutePreviewMap
        stops={[stop('s1', 1)]}
        fuelStop={{ latitude: Number.NaN, longitude: 6.76, name: 'Kaputt' }}
      />,
    );

    await waitFor(() => expect(screen.queryByTestId('tour-map-fuel-stop')).toBeNull());
  });
});
