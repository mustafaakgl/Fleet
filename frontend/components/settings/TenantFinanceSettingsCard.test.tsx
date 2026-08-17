import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Kiraci temel para birimi + zaman dilimi karti.
 *
 * Backend MOCK. Sinanan sey: kimin duzenleyebildigi, kilidin KULLANICI
 * DILINDE anlatilmasi, ham hata kodunun sizmamasi ve iki alanin birbirinin
 * geri bildirimini ezmemesi.
 */
const getCurrency = vi.fn();
const setCurrency = vi.fn();
const setTimezone = vi.fn();
const getUser = vi.fn();

vi.mock('@/lib/api', () => ({
  tenantSettingsApi: {
    getCurrency: (...args: unknown[]) => getCurrency(...args),
    setCurrency: (...args: unknown[]) => setCurrency(...args),
    setTimezone: (...args: unknown[]) => setTimezone(...args),
  },
}));

vi.mock('@/lib/auth', () => ({
  getUser: () => getUser(),
}));

import type { TenantCurrencySettings } from '@/lib/types';
import { TenantFinanceSettingsCard, tenantSettingsErrorKey } from './TenantFinanceSettingsCard';

function settings(over: Partial<TenantCurrencySettings> = {}): TenantCurrencySettings {
  return {
    baseCurrency: 'EUR',
    timezone: 'Europe/Berlin',
    suggestedTimeZones: ['Europe/Berlin', 'Europe/Istanbul', 'UTC'],
    supportedCurrencies: ['EUR', 'TRY', 'USD'],
    changeable: true,
    lockedReason: null,
    monetaryRecordCounts: { serviceRecords: 0, fines: 0, fuelEntries: 0 },
    ...over,
  };
}

beforeEach(() => {
  getCurrency.mockReset();
  setCurrency.mockReset();
  setTimezone.mockReset();
  getUser.mockReset();
  getUser.mockReturnValue({ id: 'u-1', role: 'admin', email: 'a@b.c', name: 'A' });
  getCurrency.mockResolvedValue(settings());
});

describe('TenantFinanceSettingsCard', () => {
  it('admin icin karti gosterir', async () => {
    render(<TenantFinanceSettingsCard />);
    expect(await screen.findByTestId('tenant-finance-settings')).toBeTruthy();
  });

  it('ofis rolune karti HIC gostermez', () => {
    getUser.mockReturnValue({ id: 'u-2', role: 'office', email: 'o@b.c', name: 'O' });
    render(<TenantFinanceSettingsCard />);
    expect(screen.queryByTestId('tenant-finance-settings')).toBeNull();
    expect(getCurrency).not.toHaveBeenCalled();
  });

  it('surucu rolune karti HIC gostermez', () => {
    getUser.mockReturnValue({ id: 'u-3', role: 'driver', email: 'd@b.c', name: 'D' });
    render(<TenantFinanceSettingsCard />);
    expect(screen.queryByTestId('tenant-finance-settings')).toBeNull();
  });

  it('muhasebeye salt okunur gosterir', async () => {
    getUser.mockReturnValue({ id: 'u-4', role: 'accounting', email: 'm@b.c', name: 'M' });
    render(<TenantFinanceSettingsCard />);
    expect(await screen.findByTestId('finance-readonly')).toBeTruthy();
    expect(screen.queryByTestId('finance-currency-save')).toBeNull();
    expect((screen.getByTestId('finance-currency-select') as HTMLSelectElement).disabled).toBe(true);
  });

  it('kilitliyse sebebini KULLANICI DILINDE yazar', async () => {
    getCurrency.mockResolvedValue(
      settings({
        changeable: false,
        lockedReason: 'has_monetary_records',
        monetaryRecordCounts: { serviceRecords: 4, fines: 2, fuelEntries: 9 },
      }),
    );
    render(<TenantFinanceSettingsCard />);
    const locked = await screen.findByTestId('finance-currency-locked');
    expect(locked.textContent).toContain('settings.finance.currencyLocked');
    expect(locked.textContent).toContain('"fuel":9');
    // Ham kod EKRANDA YOK.
    expect(locked.textContent).not.toContain('has_monetary_records');
  });

  it('kilitliyse para birimi secimi kapalidir', async () => {
    getCurrency.mockResolvedValue(settings({ changeable: false, lockedReason: 'has_monetary_records' }));
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-locked');
    expect((screen.getByTestId('finance-currency-select') as HTMLSelectElement).disabled).toBe(true);
  });

  it('kilitliyken bile zaman dilimi degistirilebilir', async () => {
    getCurrency.mockResolvedValue(settings({ changeable: false, lockedReason: 'has_monetary_records' }));
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-locked');
    // Zaman dilimi hicbir TUTARI degistirmez; kilitlemek yanlis olurdu.
    expect((screen.getByTestId('finance-timezone-select') as HTMLSelectElement).disabled).toBe(false);
  });

  it('degisiklik yokken kaydet dugmesi pasiftir', async () => {
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');
    expect((screen.getByTestId('finance-currency-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('para birimini kaydeder ve onay gosterir', async () => {
    setCurrency.mockResolvedValue(settings({ baseCurrency: 'TRY' }));
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');
    await userEvent.selectOptions(screen.getByTestId('finance-currency-select'), 'TRY');
    await userEvent.click(screen.getByTestId('finance-currency-save'));
    await waitFor(() =>
      expect(screen.getByTestId('finance-currency-message').textContent).toContain(
        'settings.finance.currencySaved',
      ),
    );
    expect(setCurrency).toHaveBeenCalledWith('TRY');
  });

  it('sunucu reddederse taslagi GERI ALIR', async () => {
    setCurrency.mockRejectedValue({ response: { data: { code: 'tenant_base_currency_locked' } } });
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');
    await userEvent.selectOptions(screen.getByTestId('finance-currency-select'), 'TRY');
    await userEvent.click(screen.getByTestId('finance-currency-save'));
    await waitFor(() =>
      expect((screen.getByTestId('finance-currency-select') as HTMLSelectElement).value).toBe('EUR'),
    );
  });

  it('hata mesajinda ham kod sizmaz', async () => {
    setCurrency.mockRejectedValue({ response: { data: { code: 'tenant_base_currency_locked' } } });
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');
    await userEvent.selectOptions(screen.getByTestId('finance-currency-select'), 'TRY');
    await userEvent.click(screen.getByTestId('finance-currency-save'));
    const message = await screen.findByTestId('finance-currency-message');
    expect(message.textContent).not.toContain('tenant_base_currency_locked');
    expect(message.textContent).toContain('settings.finance.error.currencyLocked');
  });

  it('zaman dilimini kaydeder ve rapor etkisini anlatir', async () => {
    setTimezone.mockResolvedValue(settings({ timezone: 'Europe/Istanbul' }));
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-timezone-select');
    await userEvent.selectOptions(screen.getByTestId('finance-timezone-select'), 'Europe/Istanbul');
    await userEvent.click(screen.getByTestId('finance-timezone-save'));
    await waitFor(() =>
      expect(screen.getByTestId('finance-timezone-message').textContent).toContain(
        'settings.finance.timezoneSaved',
      ),
    );
    expect(setTimezone).toHaveBeenCalledWith('Europe/Istanbul');
  });

  it('zaman dilimi hatasi para birimi mesajini EZMEZ', async () => {
    setCurrency.mockResolvedValue(settings({ baseCurrency: 'TRY' }));
    setTimezone.mockRejectedValue({ response: { data: { code: 'unsupported_timezone' } } });
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');

    await userEvent.selectOptions(screen.getByTestId('finance-currency-select'), 'TRY');
    await userEvent.click(screen.getByTestId('finance-currency-save'));
    await screen.findByTestId('finance-currency-message');

    await userEvent.selectOptions(screen.getByTestId('finance-timezone-select'), 'UTC');
    await userEvent.click(screen.getByTestId('finance-timezone-save'));
    await screen.findByTestId('finance-timezone-message');

    // Iki alan AYRI geri bildirim tasiyor.
    expect(screen.getByTestId('finance-currency-message').textContent).toContain(
      'settings.finance.currencySaved',
    );
    expect(screen.getByTestId('finance-timezone-message').textContent).toContain(
      'settings.finance.error.unsupportedTimezone',
    );
  });

  it('kayitli zaman dilimi listede yoksa onu da secenek yapar', async () => {
    getCurrency.mockResolvedValue(
      settings({ timezone: 'America/Bogota', suggestedTimeZones: ['Europe/Berlin'] }),
    );
    render(<TenantFinanceSettingsCard />);
    const select = (await screen.findByTestId('finance-timezone-select')) as HTMLSelectElement;
    // Gecerli ayar kaybolmamali.
    expect(select.value).toBe('America/Bogota');
  });

  it('yukleme hatasinda yeniden dene sunar', async () => {
    getCurrency.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(settings());
    render(<TenantFinanceSettingsCard />);
    await userEvent.click(await screen.findByText('common.retry'));
    await waitFor(() => expect(screen.getByTestId('finance-currency-select')).toBeTruthy());
  });

  it('para birimi ipucu, gecmis tutarlarin CEVRILMEDIGINI anlatir', async () => {
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-currency-select');
    expect(screen.getByText('settings.finance.currencyHint')).toBeTruthy();
  });

  it('zaman dilimi ipucu, ay sinirlarinin kaydigini anlatir', async () => {
    render(<TenantFinanceSettingsCard />);
    await screen.findByTestId('finance-timezone-select');
    expect(screen.getByText('settings.finance.timezoneHint')).toBeTruthy();
  });

  it('bilinmeyen hata kodunu genel mesaja cevirir', () => {
    expect(tenantSettingsErrorKey('who_knows')).toBe('settings.finance.error.generic');
  });

  it('bilinen hata kodlarini kendi mesajina cevirir', () => {
    expect(tenantSettingsErrorKey('unsupported_currency')).toBe(
      'settings.finance.error.unsupportedCurrency',
    );
    expect(tenantSettingsErrorKey('unsupported_timezone')).toBe(
      'settings.finance.error.unsupportedTimezone',
    );
  });
});
