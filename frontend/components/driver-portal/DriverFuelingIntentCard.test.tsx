import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Planlanan yakit duragi karti.
 *
 * AYNI kart iki ekranda kullaniliyor (istasyon arama ve /driver/tour); testler
 * bu yuzden karta dogrudan yazildi — vitest kapsami bilincli olarak
 * `components/` ve `lib/` ile sinirli (bkz. vitest.config.mts), sayfa testi
 * yazilmiyor.
 */

const cancelFuelingIntent = vi.fn();
const markNavigationOpened = vi.fn();

vi.mock('@/lib/api', () => ({
  driverPortalApi: {
    cancelFuelingIntent: (...args: unknown[]) => cancelFuelingIntent(...args),
    markFuelingIntentNavigationOpened: (...args: unknown[]) => markNavigationOpened(...args),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import type { FuelingIntent } from '@/lib/types';
import { DriverFuelingIntentCard } from './DriverFuelingIntentCard';

const KEY = {
  title: 'driverPortal.fuelingIntent.title',
  quotedPriceNote: 'driverPortal.fuelingIntent.quotedPriceNote',
  doesNotChangeTour: 'driverPortal.fuelingIntent.doesNotChangeTour',
  openNavigation: 'driverPortal.fuelingIntent.openNavigation',
  change: 'driverPortal.fuelingIntent.change',
  cancel: 'driverPortal.fuelingIntent.cancel',
  cancelConfirmAction: 'driverPortal.fuelingIntent.cancelConfirmAction',
  priceUnavailable: 'driverPortal.fuelStations.priceUnavailable',
  noCoordinates: 'driverPortal.fuelStations.noCoordinates',
};

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

beforeEach(() => {
  cancelFuelingIntent.mockReset();
  cancelFuelingIntent.mockResolvedValue({ intent: null, cancelled: true });
  markNavigationOpened.mockReset();
  markNavigationOpened.mockResolvedValue(null);
});

describe('DriverFuelingIntentCard', () => {
  it('shows station, fuel, planned volume, deviation and eta', () => {
    render(<DriverFuelingIntentCard intent={intent()} onCancelled={vi.fn()} />);

    const card = screen.getByTestId('fueling-intent-card');
    expect(within(card).getByText(KEY.title)).toBeDefined();
    expect(within(card).getByText('Aral Duisburg Hafen')).toBeDefined();
    expect(within(card).getByText('driverPortal.fuelStations.products.DIESEL')).toBeDefined();
    expect(within(card).getByText(/driverPortal\.fuelingIntent\.plannedLitres/)).toBeDefined();
    expect(within(card).getByText(/driverPortal\.fuelStations\.routeImpact/)).toBeDefined();
    expect(within(card).getByText(/driverPortal\.fuelStations\.stationEta/)).toBeDefined();
  });

  it('never presents the search-time price as the amount paid', () => {
    render(<DriverFuelingIntentCard intent={intent()} onCancelled={vi.fn()} />);

    const card = screen.getByTestId('fueling-intent-card');
    expect(within(card).getByText(KEY.quotedPriceNote)).toBeDefined();
    // Musteri duraklarinin sirasinin degismedigi her zaman yaziyor.
    expect(within(card).getByText(KEY.doesNotChangeTour)).toBeDefined();
  });

  it('shows "price unavailable" instead of a zero when the provider gave none', () => {
    render(
      <DriverFuelingIntentCard intent={intent({ quotedPricePerLitre: null })} onCancelled={vi.fn()} />,
    );

    const card = screen.getByTestId('fueling-intent-card');
    expect(within(card).getByText(KEY.priceUnavailable)).toBeDefined();
    expect(card.textContent).not.toContain('0,00');
  });

  it('hides the route impact for a selection made without a tour', () => {
    render(
      <DriverFuelingIntentCard
        intent={intent({ tourId: null, extraDistanceKm: null, extraDurationMin: null })}
        onCancelled={vi.fn()}
      />,
    );

    // Sapma yokken "0 km" GOSTERILMEZ.
    expect(screen.queryByText(/driverPortal\.fuelStations\.routeImpact/)).toBeNull();
  });

  it('builds the navigation link from the coordinate, not from the address text', () => {
    render(<DriverFuelingIntentCard intent={intent()} onCancelled={vi.fn()} />);

    const link = screen.getByRole('link', { name: KEY.openNavigation });
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('href')).toContain('51.440000,6.760000');
    expect(link.getAttribute('href')).not.toContain('Hafenstra');
  });

  it('does not block navigation when the telemetry call fails', async () => {
    const user = userEvent.setup();
    markNavigationOpened.mockRejectedValue(new Error('offline'));

    render(<DriverFuelingIntentCard intent={intent()} onCancelled={vi.fn()} />);

    const link = screen.getByRole('link', { name: KEY.openNavigation });
    await user.click(link);

    await waitFor(() => expect(markNavigationOpened).toHaveBeenCalledTimes(1));
    // Baglanti yerinde duruyor ve kart bozulmadi: telemetri isin kendisini
    // engellemiyor.
    expect(screen.getByRole('link', { name: KEY.openNavigation })).toBeDefined();
    expect(screen.getByTestId('fueling-intent-card')).toBeDefined();
  });

  it('disables navigation for an unusable coordinate instead of guessing', () => {
    render(
      <DriverFuelingIntentCard
        intent={intent({
          station: { ...intent().station, latitude: Number.NaN, longitude: Number.NaN },
        })}
        onCancelled={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: KEY.openNavigation })).toBeNull();
    expect(screen.getByText(KEY.noCoordinates)).toBeDefined();
  });

  it('requires a second confirmation before cancelling', async () => {
    const user = userEvent.setup();
    const onCancelled = vi.fn();

    render(<DriverFuelingIntentCard intent={intent()} onCancelled={onCancelled} />);

    await user.click(screen.getByRole('button', { name: new RegExp(KEY.cancel) }));
    // Tek dokunusla iptal YOK.
    expect(cancelFuelingIntent).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: KEY.cancelConfirmAction }));
    await waitFor(() => expect(cancelFuelingIntent).toHaveBeenCalledTimes(1));
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('links the change action to the station screen when a target is given', () => {
    render(
      <DriverFuelingIntentCard
        intent={intent()}
        changeHref="/driver/fuel-stations"
        onCancelled={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: KEY.change }).getAttribute('href')).toBe(
      '/driver/fuel-stations',
    );
  });

  it('calls back instead of navigating when the caller handles the change itself', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DriverFuelingIntentCard intent={intent()} onChange={onChange} onCancelled={vi.fn()} />,
    );

    // Istasyon ekraninda "degistir" yeni bir arama ACMAZ: liste zaten ekranda.
    await user.click(screen.getByRole('button', { name: KEY.change }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: KEY.change })).toBeNull();
  });

  it('leaks no raw backend identifier to the driver', () => {
    render(<DriverFuelingIntentCard intent={intent()} onCancelled={vi.fn()} />);

    const card = screen.getByTestId('fueling-intent-card');
    expect(card.textContent).not.toContain('intent-1');
    expect(card.textContent).not.toContain('station-1');
    expect(card.textContent).not.toContain('ACTIVE');
  });
});
