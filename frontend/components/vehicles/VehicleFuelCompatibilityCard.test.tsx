import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFuelCompatibility = vi.fn();
const replaceFuelCompatibility = vi.fn();
const showToast = vi.fn();

vi.mock('@/lib/api', () => ({
  vehiclesApi: {
    getFuelCompatibility: (...args: unknown[]) => getFuelCompatibility(...args),
    replaceFuelCompatibility: (...args: unknown[]) => replaceFuelCompatibility(...args),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => showToast(...args) }));

import { VehicleFuelCompatibilityCard } from './VehicleFuelCompatibilityCard';

/**
 * Gercek API'ye cikilmiyor: `@/lib/api` mock. Tankerkonig bu ekranda hic yok
 * (saglayici surucu ucunun isi) — burada sinanan sey ofis tarafinin uyumluluk
 * yazimi.
 *
 * i18n global olarak mock (vitest.setup.ts): `t` anahtarin kendisini donduruyor,
 * bu yuzden testler Almanca metne degil ANAHTARA bakiyor. Ceviri varliginin
 * denetimi ayri: lib/fuel-compatibility.test.ts + scripts/i18n-check.mjs.
 */

const KEY = {
  empty: 'vehicleDetail.fuelCompatibility.empty',
  edit: 'vehicleDetail.fuelCompatibility.edit',
  save: 'vehicleDetail.fuelCompatibility.save',
  cancel: 'vehicleDetail.fuelCompatibility.cancel',
  success: 'vehicleDetail.fuelCompatibility.saveSuccess',
  saveError: 'vehicleDetail.fuelCompatibility.saveError',
  adblue: 'vehicleDetail.fuelCompatibility.errors.adblueMustBeAdditive',
  noPrimary: 'vehicleDetail.fuelCompatibility.noPrimaryWarning',
  diesel: 'vehicleDetail.fuelCompatibility.products.DIESEL',
  e5: 'vehicleDetail.fuelCompatibility.products.SUPER_E5',
  e10: 'vehicleDetail.fuelCompatibility.products.SUPER_E10',
  adblueProduct: 'vehicleDetail.fuelCompatibility.products.ADBLUE',
  hvo: 'vehicleDetail.fuelCompatibility.products.HVO100',
  primaryUsage: 'vehicleDetail.fuelCompatibility.usages.PRIMARY',
  alternativeUsage: 'vehicleDetail.fuelCompatibility.usages.ALTERNATIVE',
};

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: `cmp-${String(overrides.productType ?? 'DIESEL')}`,
    productType: 'DIESEL',
    usageType: 'PRIMARY',
    approved: true,
    source: 'MANUFACTURER',
    verifiedAt: null,
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-12T08:00:00.000Z',
    ...overrides,
  };
}

function response(entries: Array<Record<string, unknown>>) {
  return {
    vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123' },
    compatibleProducts: entries
      .filter((item) => item.approved !== false && item.usageType !== 'ADDITIVE')
      .map((item) => item.productType),
    entries,
  };
}

async function renderCard(options: { canEdit?: boolean } = {}) {
  const view = render(
    <VehicleFuelCompatibilityCard vehicleId="veh-1" canEdit={options.canEdit ?? true} />,
  );
  // Iskelet kaybolana kadar bekle — yukleme durumu gercekten render ediliyor.
  await waitFor(() =>
    expect(screen.queryByTestId('fuel-compatibility-skeleton')).toBeNull(),
  );
  return view;
}

/** Duzenleme moduna gecer. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: KEY.edit }));
}

beforeEach(() => {
  getFuelCompatibility.mockReset();
  replaceFuelCompatibility.mockReset();
  showToast.mockReset();
});

describe('VehicleFuelCompatibilityCard — reading', () => {
  it('requests the compatibility for the vehicle and shows what is defined', async () => {
    getFuelCompatibility.mockResolvedValue(
      response([
        entry({ productType: 'DIESEL', usageType: 'PRIMARY' }),
        entry({ productType: 'ADBLUE', usageType: 'ADDITIVE' }),
      ]),
    );

    await renderCard();

    expect(getFuelCompatibility).toHaveBeenCalledWith('veh-1');
    expect(screen.getByText(KEY.diesel)).toBeDefined();
    expect(screen.getByText(KEY.adblueProduct)).toBeDefined();
    // Kullanim turu metinle de yaziliyor: renk tek basina anlam tasimamali.
    expect(screen.getByText(`· ${KEY.primaryUsage}`)).toBeDefined();
  });

  it('shows a skeleton while loading', () => {
    getFuelCompatibility.mockReturnValue(new Promise(() => {}));

    render(<VehicleFuelCompatibilityCard vehicleId="veh-1" canEdit />);

    expect(screen.getByTestId('fuel-compatibility-skeleton')).toBeDefined();
  });

  it('shows the empty state when nothing is recorded', async () => {
    getFuelCompatibility.mockResolvedValue(response([]));

    await renderCard();

    // Bos durum sadece "bos" demiyor, SONUCUNU soyluyor: surucu istasyon
    // onerisi alamaz.
    expect(screen.getByRole('status').textContent).toContain(KEY.empty);
  });

  it('surfaces a product the UI does not know instead of dropping it', async () => {
    getFuelCompatibility.mockResolvedValue(
      response([entry({ productType: 'SOMETHING_NEW', usageType: 'PRIMARY' })]),
    );

    await renderCard();

    expect(screen.getByText('SOMETHING_NEW')).toBeDefined();
  });
});

describe('VehicleFuelCompatibilityCard — permissions', () => {
  it('hides the edit action for a role without write permission', async () => {
    getFuelCompatibility.mockResolvedValue(response([entry()]));

    await renderCard({ canEdit: false });

    expect(screen.queryByRole('button', { name: KEY.edit })).toBeNull();
    // Okuma yine calisiyor — muhasebe gorebilir, degistiremez.
    expect(screen.getByText(KEY.diesel)).toBeDefined();
  });

  it('shows the edit action when the role may write', async () => {
    getFuelCompatibility.mockResolvedValue(response([entry()]));

    await renderCard({ canEdit: true });

    expect(screen.getByRole('button', { name: KEY.edit })).toBeDefined();
  });
});

describe('VehicleFuelCompatibilityCard — editing', () => {
  it('supports selecting more than one main fuel', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockResolvedValue(
      response([
        entry({ productType: 'SUPER_E5', usageType: 'PRIMARY' }),
        entry({ productType: 'SUPER_E10', usageType: 'PRIMARY' }),
      ]),
    );

    await renderCard();
    await openEditor(user);

    await user.click(screen.getByLabelText(KEY.e5));
    await user.click(screen.getByLabelText(KEY.e10));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(replaceFuelCompatibility).toHaveBeenCalled());
    const [, payload] = replaceFuelCompatibility.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(payload.map((item) => item.productType)).toEqual(['SUPER_E5', 'SUPER_E10']);
  });

  it('offers AdBlue only as an additive and never as a main fuel', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockResolvedValue(
      response([entry({ productType: 'ADBLUE', usageType: 'ADDITIVE' })]),
    );

    await renderCard();
    await openEditor(user);

    // AdBlue ana yakit grubunda YOK: id ile kanitlaniyor, checkbox yalnizca
    // katki grubunda var.
    expect(document.getElementById('fuel-primary-ADBLUE')).toBeNull();
    expect(document.getElementById('fuel-additive-ADBLUE')).not.toBeNull();

    await user.click(screen.getByLabelText(KEY.adblueProduct));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(replaceFuelCompatibility).toHaveBeenCalled());
    const [, payload] = replaceFuelCompatibility.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(payload).toEqual([
      expect.objectContaining({ productType: 'ADBLUE', usageType: 'ADDITIVE' }),
    ]);
  });

  it('cannot add the same product twice', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockResolvedValue(response([entry({ productType: 'DIESEL' })]));

    await renderCard();
    await openEditor(user);

    const dieselBox = screen.getByLabelText(KEY.diesel);
    // Ayni kutuya uc kez basmak: isaretle -> kaldir -> isaretle. Tek kayit.
    await user.click(dieselBox);
    await user.click(dieselBox);
    await user.click(dieselBox);
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(replaceFuelCompatibility).toHaveBeenCalled());
    const [, payload] = replaceFuelCompatibility.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(expect.objectContaining({ productType: 'DIESEL' }));
  });

  it('sends a payload that matches the backend contract', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockResolvedValue(response([entry({ productType: 'DIESEL' })]));

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(replaceFuelCompatibility).toHaveBeenCalledTimes(1));
    const [vehicleId, payload] = replaceFuelCompatibility.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];

    expect(vehicleId).toBe('veh-1');
    // Backend DTO'sunun beklediği alanlar: productType, usageType, source
    // zorunlu; approved opsiyonel (varsayilan true); verifiedAt opsiyonel.
    expect(payload[0]).toEqual({
      productType: 'DIESEL',
      usageType: 'PRIMARY',
      approved: true,
      source: 'ADMIN',
    });
    // Uydurma alan gonderilmiyor — backend forbidNonWhitelisted ile reddeder.
    expect(Object.keys(payload[0]!).sort()).toEqual([
      'approved',
      'productType',
      'source',
      'usageType',
    ]);
  });

  it('preserves the stored source and usage of an existing entry', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(
      response([
        entry({ productType: 'DIESEL', usageType: 'ALTERNATIVE', source: 'MANUFACTURER' }),
      ]),
    );
    replaceFuelCompatibility.mockResolvedValue(response([entry({ productType: 'SUPER_E5' })]));

    await renderCard();
    await openEditor(user);
    // Baska bir urun eklenince mevcut kaydin kaynagi ADMIN'e DUSMEMELI —
    // ureticiden gelen onayin denetim izi korunur.
    await user.click(screen.getByLabelText(KEY.e5));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(replaceFuelCompatibility).toHaveBeenCalled());
    const [, payload] = replaceFuelCompatibility.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(payload).toEqual([
      expect.objectContaining({
        productType: 'DIESEL',
        usageType: 'ALTERNATIVE',
        source: 'MANUFACTURER',
      }),
      expect.objectContaining({ productType: 'SUPER_E5', source: 'ADMIN' }),
    ]);
  });

  it('keeps Save disabled until something actually changes', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([entry({ productType: 'DIESEL' })]));

    await renderCard();
    await openEditor(user);

    expect((screen.getByRole('button', { name: KEY.save }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByLabelText(KEY.e5));
    expect((screen.getByRole('button', { name: KEY.save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('warns when no main fuel is selected', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([entry({ productType: 'DIESEL' })]));

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));

    // Backend bos seti acikca gecerli sayiyor, bu yuzden ENGEL degil UYARI.
    expect(screen.getByText(KEY.noPrimary)).toBeDefined();
    expect((screen.getByRole('button', { name: KEY.save }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('discards the draft on cancel', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([entry({ productType: 'DIESEL' })]));

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.e5));
    await user.click(screen.getByRole('button', { name: KEY.cancel }));

    expect(replaceFuelCompatibility).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: KEY.edit })).toBeDefined();
    expect(screen.getByText(KEY.diesel)).toBeDefined();
  });
});

describe('VehicleFuelCompatibilityCard — after saving', () => {
  it('refreshes the view from the server response and confirms with a toast', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockResolvedValue(
      response([entry({ productType: 'SUPER_E10', usageType: 'PRIMARY' })]),
    );

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.e10));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    // Duzenleme modu kapaniyor ve GORUNTULEME sunucu yanitini gosteriyor.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: KEY.edit })).toBeDefined(),
    );
    expect(screen.getByText(KEY.e10)).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: KEY.success, type: 'success' }),
    );
  });
});

describe('VehicleFuelCompatibilityCard — API errors', () => {
  it('keeps the selection and shows a translated message for a known error code', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockRejectedValue({
      response: { data: { statusCode: 400, code: 'adblue_must_be_additive' } },
    });

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    // Ham kod ya da Ingilizce backend metni DEGIL, cevrilmis anahtar.
    expect(screen.getByRole('alert').textContent).toContain(KEY.adblue);
    expect(screen.getByRole('alert').textContent).not.toContain('adblue_must_be_additive');

    // Secim KAYBEDILMIYOR: kullanici duzenleme modunda ve kutu isaretli kaldi.
    expect((screen.getByLabelText(KEY.diesel) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: KEY.save })).toBeDefined();
  });

  it('reads the code from details when the payload nests it', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockRejectedValue({
      response: { data: { statusCode: 400, details: { code: 'duplicate_fuel_compatibility_entry' } } },
    });

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toContain(
      'vehicleDetail.fuelCompatibility.errors.duplicateEntry',
    );
  });

  it('falls back to the generic message for an unknown code', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));
    replaceFuelCompatibility.mockRejectedValue({
      response: { data: { statusCode: 500, code: 'something_unmapped' } },
    });

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));
    await user.click(screen.getByRole('button', { name: KEY.save }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toContain(KEY.saveError);
    expect(screen.getByRole('alert').textContent).not.toContain('something_unmapped');
  });

  it('offers a retry when loading fails', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(
      response([entry({ productType: 'DIESEL' })]),
    );

    await renderCard();

    expect(screen.getByText('vehicleDetail.fuelCompatibility.loadError')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'vehicleDetail.fuelCompatibility.retry' }));

    await waitFor(() => expect(screen.getByText(KEY.diesel)).toBeDefined());
  });
});

describe('VehicleFuelCompatibilityCard — accessibility', () => {
  it('gives every selection control a label a screen reader can use', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));

    await renderCard();
    await openEditor(user);

    // getByLabelText basarisiz olursa kutu erisilebilir bir etikete sahip degil.
    for (const key of [KEY.diesel, KEY.e5, KEY.e10, KEY.hvo, KEY.adblueProduct]) {
      expect(screen.getByLabelText(key).tagName).toBe('INPUT');
    }
  });

  it('lets the keyboard reach and toggle a checkbox', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));

    await renderCard();
    await openEditor(user);

    const diesel = screen.getByLabelText(KEY.diesel);
    diesel.focus();
    expect(document.activeElement).toBe(diesel);
    await user.keyboard(' ');
    expect((diesel as HTMLInputElement).checked).toBe(true);
  });

  it('exposes the usage selector with its own label once a fuel is picked', async () => {
    const user = userEvent.setup();
    getFuelCompatibility.mockResolvedValue(response([]));

    await renderCard();
    await openEditor(user);
    await user.click(screen.getByLabelText(KEY.diesel));

    const usage = screen.getByLabelText('vehicleDetail.fuelCompatibility.usageLabel');
    expect(usage.tagName).toBe('SELECT');
    const options = within(usage as HTMLSelectElement).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      KEY.primaryUsage,
      KEY.alternativeUsage,
    ]);
  });
});
