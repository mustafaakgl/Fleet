import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFromStops = vi.fn();
const optimize = vi.fn();

vi.mock('@/lib/api', () => ({
  toursApi: {
    createFromStops: (...args: unknown[]) => createFromStops(...args),
    optimize: (...args: unknown[]) => optimize(...args),
    release: vi.fn(),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }));

// Gercek adres alani Photon'a gidiyor; testte yalnizca "secildi" olayini
// tetikleyen bir dugmeye indirgeniyor. Secim mantigi kendi bileseninde.
vi.mock('@/components/shared/AddressPickerFields', () => ({
  AddressPickerFields: ({
    label,
    value,
    onLocationChange,
  }: {
    label: string;
    value: string;
    onLocationChange?: (location: unknown) => void;
  }) => (
    <div>
      <span>{label}</span>
      <span data-testid="picked-value">{value}</span>
      <button
        type="button"
        onClick={() =>
          onLocationChange?.({
            id: `loc-${Math.random().toString(36).slice(2, 8)}`,
            rawAddress: 'Musterweg 1, Duisburg',
            latitude: 51.4,
            longitude: 6.7,
            truckAccess: 'reachable',
          })
        }
      >
        {`pick:${label}`}
      </button>
      <button
        type="button"
        onClick={() =>
          onLocationChange?.({
            id: 'loc-blocked',
            rawAddress: 'Sperrweg 9, Bielefeld',
            latitude: 52.03,
            longitude: 8.53,
            truckAccess: 'unreachable',
          })
        }
      >
        {`blocked:${label}`}
      </button>
      <button
        type="button"
        onClick={() =>
          onLocationChange?.({
            id: 'loc-unknown',
            rawAddress: 'Buttmannstraße 2, Berlin',
            latitude: 52.55,
            longitude: 13.37,
            truckAccess: 'unknown',
          })
        }
      >
        {`unknown:${label}`}
      </button>
    </div>
  ),
}));

// Harita jsdom'da Leaflet ile acilmaz; sonuc panelinin kendi testi ayri.
vi.mock('./TourRoutePreviewMap', () => ({
  TourRoutePreviewMap: () => <div data-testid="tour-map" />,
}));

import { TourBuilder } from './TourBuilder';

const OPTIONS = [{ value: 'driver-1', label: 'Max Mustermann' }];

function renderBuilder() {
  return render(
    <TourBuilder
      date="2026-08-12"
      driverId="driver-1"
      driverOptions={OPTIONS}
      companyOptions={[{ value: 'Musterspedition', label: 'Musterspedition' }]}
      vehicleOptions={[{ value: 'DU-AB-123', label: 'DU-AB-123' }]}
    />,
  );
}

async function pick(user: ReturnType<typeof userEvent.setup>, label: string, nth = 0) {
  const buttons = screen.getAllByRole('button', { name: `pick:${label}` });
  await user.click(buttons[nth]);
}

/** Durak satiri kapali gelir; adres alanina ulasmak icin acmak gerekir. */
async function expandStop(user: ReturnType<typeof userEvent.setup>, index = 0) {
  const rows = screen.getAllByTestId('tour-stop-row');
  const toggles = within(rows[index]).getAllByRole('button', { expanded: false });
  await user.click(toggles[0]);
}

async function pickStopAddress(user: ReturnType<typeof userEvent.setup>, index = 0) {
  await expandStop(user, index);
  await pick(user, 'tourBuilder.stopAddress');
}

beforeEach(() => {
  createFromStops.mockReset();
  optimize.mockReset();
});

describe('TourBuilder', () => {
  it('starts with one empty stop', () => {
    renderBuilder();
    expect(screen.getAllByTestId('tour-stop-row')).toHaveLength(1);
  });

  it('adds and removes stops', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('button', { name: 'tourBuilder.addStop' }));
    expect(screen.getAllByTestId('tour-stop-row')).toHaveLength(2);

    const rows = screen.getAllByTestId('tour-stop-row');
    await user.click(within(rows[0]).getByRole('button', { name: 'tourBuilder.removeStop' }));
    expect(screen.getAllByTestId('tour-stop-row')).toHaveLength(1);
  });

  it('keeps the calculate button disabled until every address is picked', async () => {
    const user = userEvent.setup();
    renderBuilder();

    const calculate = screen.getByRole('button', { name: /tourBuilder.calculate/ }) as HTMLButtonElement;
    expect(calculate.disabled).toBe(true);

    await pick(user, 'tourBuilder.startAddress');
    expect(calculate.disabled).toBe(true);

    await pickStopAddress(user);
    expect(calculate.disabled).toBe(false);
  });

  it('explains why the calculate button is disabled', () => {
    // Soluk bir dugme tek basina neyi duzeltecegini soylemez.
    renderBuilder();
    expect(screen.getByTestId('tour-blocking-reason').textContent).toContain(
      'tourBuilder.issue.start_missing',
    );
  });

  it('keeps a stop collapsed until it is opened', async () => {
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.queryByRole('button', { name: 'pick:tourBuilder.stopAddress' })).toBeNull();
    await expandStop(user);
    expect(screen.getByRole('button', { name: 'pick:tourBuilder.stopAddress' })).toBeDefined();
  });

  it('reorders stops with the move buttons', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('button', { name: 'tourBuilder.addStop' }));
    await pickStopAddress(user, 0);
    // Kapali satirin ozeti okunacak; secim sonrasi satir acik kaliyor.
    await user.click(
      within(screen.getAllByTestId('tour-stop-row')[0]).getAllByRole('button', {
        expanded: true,
      })[0],
    );

    const before = screen.getAllByTestId('tour-stop-row').map((row) => row.textContent ?? '');
    expect(before[0]).toContain('Musterweg 1');
    expect(before[1]).toContain('tourBuilder.stopEmpty');

    const rows = screen.getAllByTestId('tour-stop-row');
    await user.click(within(rows[0]).getByRole('button', { name: 'tourBuilder.moveDown' }));

    const after = screen.getAllByTestId('tour-stop-row').map((row) => row.textContent ?? '');
    expect(after[0]).toContain('tourBuilder.stopEmpty');
    expect(after[1]).toContain('Musterweg 1');
  });

  it('cannot move the first stop up or the last one down', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'tourBuilder.addStop' }));

    const rows = screen.getAllByTestId('tour-stop-row');
    const up = within(rows[0]).getByRole('button', { name: 'tourBuilder.moveUp' }) as HTMLButtonElement;
    const down = within(rows[1]).getByRole('button', { name: 'tourBuilder.moveDown' }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(true);
  });

  it('creates the tour and optimises it in one action, sending only location ids', async () => {
    const user = userEvent.setup();
    const tour = {
      id: 'tour-1',
      status: 'optimized',
      plannedDistanceKm: 186,
      plannedDurationMin: 275,
      baselineDistanceKm: 210,
      stops: [],
    };
    createFromStops.mockResolvedValue({ id: 'tour-1' });
    optimize.mockResolvedValue({ optimized: true, tour });

    renderBuilder();
    await pick(user, 'tourBuilder.startAddress');
    await pickStopAddress(user);
    await user.click(screen.getByRole('button', { name: /tourBuilder.calculate/ }));

    expect(createFromStops).toHaveBeenCalledTimes(1);
    const payload = createFromStops.mock.calls[0][0];
    expect(payload.start.location_id).toMatch(/^loc-/);
    expect(payload.stops).toHaveLength(1);
    // Ham adres gonderilmemeli: sunucu ikinci kez geocode etmemeli.
    expect(JSON.stringify(payload)).not.toContain('Musterweg');

    expect(optimize).toHaveBeenCalledWith('tour-1');
    expect(await screen.findByTestId('tour-result')).toBeDefined();
  });

  it('does not publish the tour to the driver on its own', async () => {
    const user = userEvent.setup();
    createFromStops.mockResolvedValue({ id: 'tour-1' });
    optimize.mockResolvedValue({
      optimized: true,
      tour: { id: 'tour-1', status: 'optimized', plannedDistanceKm: 10, stops: [] },
    });

    renderBuilder();
    await pick(user, 'tourBuilder.startAddress');
    await pickStopAddress(user);
    await user.click(screen.getByRole('button', { name: /tourBuilder.calculate/ }));

    // Yayin ayri bir onay: dugme duruyor, kendiliginden basilmiyor.
    expect(await screen.findByRole('button', { name: /tourBuilder.approveAndSend/ })).toBeDefined();
  });

  it('blocks the calculation when a stop has no truck access, and says which', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await pick(user, 'tourBuilder.startAddress');
    await expandStop(user);
    await user.click(screen.getByRole('button', { name: 'blocked:tourBuilder.stopAddress' }));

    const calculate = screen.getByRole('button', {
      name: /tourBuilder.calculate/,
    }) as HTMLButtonElement;
    expect(calculate.disabled).toBe(true);
    // Adresi soylemek sart: dokuz durakli bir formda hangi satir oldugunu
    // aramak zorunda kalmamali.
    expect(screen.getByTestId('tour-blocking-reason').textContent).toContain('Sperrweg 9');
  });

  it('does not block when truck access could only not be verified', async () => {
    // Motor kapali ya da adres harita kapsaminin disinda — kullanicinin hatasi
    // degil ve onu durdurmamali.
    const user = userEvent.setup();
    renderBuilder();

    await pick(user, 'tourBuilder.startAddress');
    await expandStop(user);
    await user.click(screen.getByRole('button', { name: 'unknown:tourBuilder.stopAddress' }));

    const calculate = screen.getByRole('button', {
      name: /tourBuilder.calculate/,
    }) as HTMLButtonElement;
    expect(calculate.disabled).toBe(false);
    expect(screen.getByTestId('tour-unverified-note')).toBeDefined();
  });
});
