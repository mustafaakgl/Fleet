'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { tenantSettingsApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import { getUser } from '@/lib/auth';
import type { TenantCurrencySettings } from '@/lib/types';

/** Ham hata kodu KULLANICIYA GOSTERILMEZ; ceviri anahtarina cevriliyor. */
export function tenantSettingsErrorKey(code: string | null): string {
  switch (code) {
    case 'tenant_base_currency_locked':
      return 'settings.finance.error.currencyLocked';
    case 'unsupported_currency':
      return 'settings.finance.error.unsupportedCurrency';
    case 'unsupported_timezone':
      return 'settings.finance.error.unsupportedTimezone';
    case 'tenant_not_found':
      return 'settings.finance.error.tenantNotFound';
    case 'forbidden':
      return 'settings.finance.error.forbidden';
    default:
      return 'settings.finance.error.generic';
  }
}

/**
 * Kiracinin temel para birimi ve zaman dilimi.
 *
 * IKI ALAN AYRI KAYDEDILIYOR: para birimi parasal kayit varsa KILITLI,
 * zaman dilimi ise her zaman degistirilebilir. Tek bir "kaydet" dugmesi
 * olsaydi kilitli para birimi yuzunden zaman dilimi degisikligi de
 * reddedilirdi.
 *
 * GORUNURLUK: admin/boss duzenler, muhasebe yalnizca okur, digerleri
 * bu karti hic gormez.
 */
export function TenantFinanceSettingsCard() {
  const { t } = useTranslation();
  const [user] = useState(() => getUser());
  const role = user?.role ?? null;
  const canEdit = role === 'admin' || role === 'boss';
  const canView = canEdit || role === 'accounting';

  const [settings, setSettings] = useState<TenantCurrencySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const [currencyDraft, setCurrencyDraft] = useState('');
  const [timezoneDraft, setTimezoneDraft] = useState('');
  const [savingField, setSavingField] = useState<'currency' | 'timezone' | null>(null);
  // Iki alanin geri bildirimi AYRI: birinin hatasi digerinin basarisini silmiyor.
  const [currencyMessage, setCurrencyMessage] = useState<{ tone: 'ok' | 'error'; key: string } | null>(null);
  const [timezoneMessage, setTimezoneMessage] = useState<{ tone: 'ok' | 'error'; key: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((next: TenantCurrencySettings) => {
    setSettings(next);
    setCurrencyDraft(next.baseCurrency);
    setTimezoneDraft(next.timezone);
  }, []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadErrorKey(null);
    try {
      apply(await tenantSettingsApi.getCurrency(controller.signal));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setLoadErrorKey(tenantSettingsErrorKey(extractApiErrorCode(caught)));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    if (!canView) return;
    void load();
    return () => abortRef.current?.abort();
  }, [canView, load]);

  if (!canView) return null;

  const saveCurrency = async () => {
    setSavingField('currency');
    setCurrencyMessage(null);
    try {
      apply(await tenantSettingsApi.setCurrency(currencyDraft));
      setCurrencyMessage({ tone: 'ok', key: 'settings.finance.currencySaved' });
    } catch (caught) {
      setCurrencyMessage({ tone: 'error', key: tenantSettingsErrorKey(extractApiErrorCode(caught)) });
      // Sunucu reddettiyse taslak GERI ALINIYOR: ekranda kaydedilmemis bir
      // deger kaydedilmis gibi durmasin.
      if (settings) setCurrencyDraft(settings.baseCurrency);
    } finally {
      setSavingField(null);
    }
  };

  const saveTimezone = async () => {
    setSavingField('timezone');
    setTimezoneMessage(null);
    try {
      apply(await tenantSettingsApi.setTimezone(timezoneDraft));
      setTimezoneMessage({ tone: 'ok', key: 'settings.finance.timezoneSaved' });
    } catch (caught) {
      setTimezoneMessage({ tone: 'error', key: tenantSettingsErrorKey(extractApiErrorCode(caught)) });
      if (settings) setTimezoneDraft(settings.timezone);
    } finally {
      setSavingField(null);
    }
  };

  return (
    <Card data-testid="tenant-finance-settings">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">{t('settings.finance.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" data-testid="finance-loading" />
        ) : loadErrorKey ? (
          <div className="space-y-2" data-testid="finance-load-error">
            <p role="alert" className="text-sm text-red-700">{t(loadErrorKey)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : settings ? (
          <>
            {/* Temel para birimi */}
            <div>
              <Label htmlFor="tenant-base-currency">{t('settings.finance.currencyLabel')}</Label>
              <Select
                id="tenant-base-currency"
                data-testid="finance-currency-select"
                className="mt-1"
                value={currencyDraft}
                // Kilit karari BACKEND'den geliyor; frontend tahmin etmiyor.
                disabled={!canEdit || !settings.changeable || savingField !== null}
                onChange={(event) => setCurrencyDraft(event.target.value)}
              >
                {settings.supportedCurrencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">{t('settings.finance.currencyHint')}</p>

              {settings.lockedReason === 'has_monetary_records' ? (
                <p
                  className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
                  data-testid="finance-currency-locked"
                >
                  {t('settings.finance.currencyLocked', {
                    service: settings.monetaryRecordCounts.serviceRecords,
                    fines: settings.monetaryRecordCounts.fines,
                    fuel: settings.monetaryRecordCounts.fuelEntries,
                  })}
                </p>
              ) : null}

              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  data-testid="finance-currency-save"
                  disabled={
                    !settings.changeable ||
                    savingField !== null ||
                    currencyDraft === settings.baseCurrency
                  }
                  onClick={() => void saveCurrency()}
                >
                  {savingField === 'currency' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t('settings.finance.save')}
                </Button>
              ) : (
                <p className="mt-2 text-xs text-slate-500" data-testid="finance-readonly">
                  {t('settings.finance.readOnly')}
                </p>
              )}

              {currencyMessage ? (
                <p
                  role={currencyMessage.tone === 'error' ? 'alert' : 'status'}
                  data-testid="finance-currency-message"
                  className={
                    currencyMessage.tone === 'error'
                      ? 'mt-2 text-xs text-red-700'
                      : 'mt-2 text-xs text-emerald-700'
                  }
                >
                  {t(currencyMessage.key)}
                </p>
              ) : null}
            </div>

            {/* Zaman dilimi */}
            <div className="border-t pt-4">
              <Label htmlFor="tenant-timezone">{t('settings.finance.timezoneLabel')}</Label>
              <Select
                id="tenant-timezone"
                data-testid="finance-timezone-select"
                className="mt-1"
                value={timezoneDraft}
                disabled={!canEdit || savingField !== null}
                onChange={(event) => setTimezoneDraft(event.target.value)}
              >
                {/* Kayitli deger listede yoksa BASINA ekleniyor: gecerli ayar kaybolmasin. */}
                {(settings.suggestedTimeZones.includes(settings.timezone)
                  ? settings.suggestedTimeZones
                  : [settings.timezone, ...settings.suggestedTimeZones]
                ).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">{t('settings.finance.timezoneHint')}</p>

              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  data-testid="finance-timezone-save"
                  disabled={savingField !== null || timezoneDraft === settings.timezone}
                  onClick={() => void saveTimezone()}
                >
                  {savingField === 'timezone' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t('settings.finance.save')}
                </Button>
              ) : null}

              {timezoneMessage ? (
                <p
                  role={timezoneMessage.tone === 'error' ? 'alert' : 'status'}
                  data-testid="finance-timezone-message"
                  className={
                    timezoneMessage.tone === 'error'
                      ? 'mt-2 text-xs text-red-700'
                      : 'mt-2 text-xs text-emerald-700'
                  }
                >
                  {t(timezoneMessage.key)}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
