'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage, invoicingApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_HEADER_TITLE,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';
import { centsToEuroInput, euroInputToCents, previewInvoiceNumber } from '@/lib/invoicing-format';
import { showToast } from '@/lib/toast';
import type { BillingProfile, UpsertBillingProfilePayload } from '@/lib/types';

type FormState = UpsertBillingProfilePayload & {
  dunningLevel1Fee: string;
  dunningLevel2Fee: string;
  dunningLevel3Fee: string;
};

const EMPTY_FORM: FormState = {
  legalName: '',
  street: '',
  postalCode: '',
  city: '',
  countryCode: 'DE',
  taxNumber: '',
  vatId: '',
  registrationNumber: '',
  phone: '',
  iban: '',
  bic: '',
  bankName: '',
  invoiceNumberFormat: 'RE-{YYYY}-{00001}',
  defaultPaymentTermDays: 14,
  defaultTaxRateBasisPoints: 1_900,
  smallBusinessRule: false,
  invoiceFooterText: '',
  invoiceEmailCc: '',
  dunningEnabled: true,
  dunningLevel1Days: 1,
  dunningLevel2Days: 14,
  dunningLevel3Days: 28,
  dunningLevel1FeeCents: 0,
  dunningLevel2FeeCents: 500,
  dunningLevel3FeeCents: 1_000,
  dunningLevel1Fee: '0.00',
  dunningLevel2Fee: '5.00',
  dunningLevel3Fee: '10.00',
  datevConsultantNumber: '',
  datevClientNumber: '',
  datevChart: 'SKR03',
  revenueAccount19: '8400',
  revenueAccount7: '8300',
  revenueAccount0: '8125',
  revenueAccountReverseCharge: '8337',
  debtorNumberStart: 10_000,
};

function fromProfile(profile: BillingProfile): FormState {
  return {
    legalName: profile.legalName,
    street: profile.street,
    postalCode: profile.postalCode,
    city: profile.city,
    countryCode: profile.countryCode,
    taxNumber: profile.taxNumber ?? '',
    vatId: profile.vatId ?? '',
    registrationNumber: profile.registrationNumber ?? '',
    phone: profile.phone ?? '',
    iban: profile.iban,
    bic: profile.bic ?? '',
    bankName: profile.bankName ?? '',
    invoiceNumberFormat: profile.invoiceNumberFormat,
    defaultPaymentTermDays: profile.defaultPaymentTermDays,
    defaultTaxRateBasisPoints: profile.defaultTaxRateBasisPoints,
    smallBusinessRule: profile.smallBusinessRule,
    invoiceFooterText: profile.invoiceFooterText ?? '',
    invoiceEmailCc: profile.invoiceEmailCc ?? '',
    dunningEnabled: profile.dunningEnabled,
    dunningLevel1Days: profile.dunningLevel1Days,
    dunningLevel2Days: profile.dunningLevel2Days,
    dunningLevel3Days: profile.dunningLevel3Days,
    dunningLevel1FeeCents: profile.dunningLevel1FeeCents,
    dunningLevel2FeeCents: profile.dunningLevel2FeeCents,
    dunningLevel3FeeCents: profile.dunningLevel3FeeCents,
    dunningLevel1Fee: centsToEuroInput(profile.dunningLevel1FeeCents),
    dunningLevel2Fee: centsToEuroInput(profile.dunningLevel2FeeCents),
    dunningLevel3Fee: centsToEuroInput(profile.dunningLevel3FeeCents),
    datevConsultantNumber: profile.datevConsultantNumber ?? '',
    datevClientNumber: profile.datevClientNumber ?? '',
    datevChart: profile.datevChart === 'SKR04' ? 'SKR04' : 'SKR03',
    revenueAccount19: profile.revenueAccount19,
    revenueAccount7: profile.revenueAccount7,
    revenueAccount0: profile.revenueAccount0,
    revenueAccountReverseCharge: profile.revenueAccountReverseCharge,
    debtorNumberStart: profile.debtorNumberStart,
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className={FLEET_LIST_CARD}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function BillingProfileSettingsPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await invoicingApi.getBillingProfile();
      setForm(profile ? fromProfile(profile) : EMPTY_FORM);
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('invoicing.billingProfile.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const numberPreview = useMemo(
    () => previewInvoiceNumber(form.invoiceNumberFormat, new Date().getFullYear()),
    [form.invoiceNumberFormat],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const fee1 = euroInputToCents(form.dunningLevel1Fee);
    const fee2 = euroInputToCents(form.dunningLevel2Fee);
    const fee3 = euroInputToCents(form.dunningLevel3Fee);
    if (fee1 === null || fee2 === null || fee3 === null) {
      setError(t('invoicing.billingProfile.feeInvalid'));
      return;
    }
    if (!numberPreview) {
      setError(t('invoicing.billingProfile.numberFormatInvalid'));
      return;
    }
    if (!blankToUndefined(form.vatId) && !blankToUndefined(form.registrationNumber)) {
      setError(t('invoicing.billingProfile.sellerIdentityRequired'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: UpsertBillingProfilePayload = {
        legalName: form.legalName.trim(),
        street: form.street.trim(),
        postalCode: form.postalCode.trim(),
        city: form.city.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
        taxNumber: blankToUndefined(form.taxNumber),
        vatId: blankToUndefined(form.vatId),
        registrationNumber: blankToUndefined(form.registrationNumber),
        phone: blankToUndefined(form.phone),
        iban: form.iban.replace(/\s+/g, '').toUpperCase(),
        bic: blankToUndefined(form.bic),
        bankName: blankToUndefined(form.bankName),
        invoiceNumberFormat: form.invoiceNumberFormat.trim(),
        defaultPaymentTermDays: form.defaultPaymentTermDays,
        defaultTaxRateBasisPoints: form.defaultTaxRateBasisPoints,
        smallBusinessRule: form.smallBusinessRule,
        invoiceFooterText: blankToUndefined(form.invoiceFooterText),
        invoiceEmailCc: blankToUndefined(form.invoiceEmailCc),
        dunningEnabled: form.dunningEnabled,
        dunningLevel1Days: form.dunningLevel1Days,
        dunningLevel2Days: form.dunningLevel2Days,
        dunningLevel3Days: form.dunningLevel3Days,
        dunningLevel1FeeCents: fee1,
        dunningLevel2FeeCents: fee2,
        dunningLevel3FeeCents: fee3,
        datevConsultantNumber: blankToUndefined(form.datevConsultantNumber),
        datevClientNumber: blankToUndefined(form.datevClientNumber),
        datevChart: form.datevChart,
        revenueAccount19: blankToUndefined(form.revenueAccount19),
        revenueAccount7: blankToUndefined(form.revenueAccount7),
        revenueAccount0: blankToUndefined(form.revenueAccount0),
        revenueAccountReverseCharge: blankToUndefined(form.revenueAccountReverseCharge),
        debtorNumberStart: form.debtorNumberStart,
      };

      const saved = await invoicingApi.upsertBillingProfile(payload);
      setForm(fromProfile(saved));
      showToast({ message: t('invoicing.billingProfile.saved'), type: 'success' });
    } catch (caught) {
      setError(getApiErrorMessage(caught, t('invoicing.billingProfile.saveError')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={FLEET_PAGE}>
        <p className="text-[13px] text-slate-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <h1 className={FLEET_PAGE_TITLE}>{t('invoicing.billingProfile.title')}</h1>
          <p className="text-[13px] text-slate-500">{t('invoicing.billingProfile.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('invoicing.billingProfile.companySection')}>
          <Field label={t('invoicing.billingProfile.legalName')} htmlFor="legalName">
            <Input
              id="legalName"
              value={form.legalName}
              onChange={(event) => set('legalName', event.target.value)}
            />
          </Field>
          <Field label={t('invoicing.billingProfile.street')} htmlFor="street">
            <Input
              id="street"
              value={form.street}
              onChange={(event) => set('street', event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('invoicing.billingProfile.postalCode')} htmlFor="postalCode">
              <Input
                id="postalCode"
                value={form.postalCode}
                onChange={(event) => set('postalCode', event.target.value)}
              />
            </Field>
            <Field label={t('invoicing.billingProfile.city')} htmlFor="city">
              <Input
                id="city"
                value={form.city}
                onChange={(event) => set('city', event.target.value)}
              />
            </Field>
            <Field label={t('invoicing.billingProfile.countryCode')} htmlFor="countryCode">
              <Input
                id="countryCode"
                maxLength={2}
                value={form.countryCode}
                onChange={(event) => set('countryCode', event.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('invoicing.billingProfile.taxNumber')} htmlFor="taxNumber">
              <Input
                id="taxNumber"
                value={form.taxNumber ?? ''}
                onChange={(event) => set('taxNumber', event.target.value)}
              />
            </Field>
            <Field label={t('invoicing.billingProfile.vatId')} htmlFor="vatId">
              <Input
                id="vatId"
                value={form.vatId ?? ''}
                onChange={(event) => set('vatId', event.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t('invoicing.billingProfile.registrationNumber.label')}
            htmlFor="registrationNumber"
            hint={t('invoicing.billingProfile.registrationNumber.help')}
          >
            <Input
              id="registrationNumber"
              value={form.registrationNumber ?? ''}
              onChange={(event) => set('registrationNumber', event.target.value)}
            />
          </Field>
          <Field
            label={t('invoicing.billingProfile.phone.label')}
            htmlFor="phone"
            hint={t('invoicing.billingProfile.phone.help')}
          >
            <Input
              id="phone"
              value={form.phone ?? ''}
              onChange={(event) => set('phone', event.target.value)}
            />
          </Field>
        </Section>

        <Section title={t('invoicing.billingProfile.bankSection')}>
          <Field label={t('invoicing.billingProfile.iban')} htmlFor="iban">
            <Input
              id="iban"
              value={form.iban}
              onChange={(event) => set('iban', event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('invoicing.billingProfile.bic')} htmlFor="bic">
              <Input
                id="bic"
                value={form.bic ?? ''}
                onChange={(event) => set('bic', event.target.value)}
              />
            </Field>
            <Field label={t('invoicing.billingProfile.bankName')} htmlFor="bankName">
              <Input
                id="bankName"
                value={form.bankName ?? ''}
                onChange={(event) => set('bankName', event.target.value)}
              />
            </Field>
          </div>
          <Field label={t('invoicing.billingProfile.invoiceEmailCc')} htmlFor="invoiceEmailCc">
            <Input
              id="invoiceEmailCc"
              type="email"
              value={form.invoiceEmailCc ?? ''}
              onChange={(event) => set('invoiceEmailCc', event.target.value)}
            />
          </Field>
          <Field label={t('invoicing.billingProfile.footerText')} htmlFor="invoiceFooterText">
            <textarea
              id="invoiceFooterText"
              rows={3}
              value={form.invoiceFooterText ?? ''}
              onChange={(event) => set('invoiceFooterText', event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </Field>
        </Section>

        <Section title={t('invoicing.billingProfile.numberingSection')}>
          <Field
            label={t('invoicing.billingProfile.numberFormat')}
            htmlFor="invoiceNumberFormat"
            hint={t('invoicing.billingProfile.numberFormatHint')}
          >
            <Input
              id="invoiceNumberFormat"
              value={form.invoiceNumberFormat}
              onChange={(event) => set('invoiceNumberFormat', event.target.value)}
            />
          </Field>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
            <span className="text-slate-500">{t('invoicing.billingProfile.numberPreview')}: </span>
            <span className="font-mono font-medium text-slate-900">
              {numberPreview ?? t('invoicing.billingProfile.numberFormatInvalid')}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('invoicing.billingProfile.paymentTermDays')}
              htmlFor="defaultPaymentTermDays"
            >
              <Input
                id="defaultPaymentTermDays"
                type="number"
                min={0}
                max={365}
                value={form.defaultPaymentTermDays}
                onChange={(event) => set('defaultPaymentTermDays', Number(event.target.value))}
              />
            </Field>
            <Field label={t('invoicing.billingProfile.defaultTaxRate')} htmlFor="defaultTaxRate">
              <select
                id="defaultTaxRate"
                value={form.defaultTaxRateBasisPoints}
                disabled={form.smallBusinessRule}
                onChange={(event) =>
                  set('defaultTaxRateBasisPoints', Number(event.target.value))
                }
                className={FLEET_FILTER_SELECT}
              >
                <option value={1900}>{t('invoicing.taxPreset.standard')}</option>
                <option value={700}>{t('invoicing.taxPreset.reduced')}</option>
                <option value={0}>{t('invoicing.taxPreset.exempt')}</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-slate-800">
            <input
              type="checkbox"
              checked={form.smallBusinessRule}
              onChange={(event) => set('smallBusinessRule', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('invoicing.billingProfile.smallBusinessRule')}
          </label>
          <p className="text-xs text-slate-500">
            {t('invoicing.billingProfile.smallBusinessRuleHint')}
          </p>
        </Section>

        <Section title={t('invoicing.billingProfile.dunningSection')}>
          <label className="flex items-center gap-2 text-[13px] text-slate-800">
            <input
              type="checkbox"
              checked={form.dunningEnabled}
              onChange={(event) => set('dunningEnabled', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('invoicing.billingProfile.dunningEnabled')}
          </label>

          {([1, 2, 3] as const).map((level) => {
            const daysKey = `dunningLevel${level}Days` as
              | 'dunningLevel1Days'
              | 'dunningLevel2Days'
              | 'dunningLevel3Days';
            const feeKey = `dunningLevel${level}Fee` as
              | 'dunningLevel1Fee'
              | 'dunningLevel2Fee'
              | 'dunningLevel3Fee';

            return (
              <div key={level} className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('invoicing.billingProfile.dunningDays', { level })}
                  htmlFor={daysKey}
                >
                  <Input
                    id={daysKey}
                    type="number"
                    min={0}
                    max={365}
                    disabled={!form.dunningEnabled}
                    value={form[daysKey]}
                    onChange={(event) => set(daysKey, Number(event.target.value))}
                  />
                </Field>
                <Field label={t('invoicing.billingProfile.dunningFee', { level })} htmlFor={feeKey}>
                  <Input
                    id={feeKey}
                    inputMode="decimal"
                    disabled={!form.dunningEnabled}
                    value={form[feeKey]}
                    onChange={(event) => set(feeKey, event.target.value)}
                  />
                </Field>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">{t('invoicing.billingProfile.dunningHint')}</p>
        </Section>
      </div>

      <Card className={FLEET_LIST_CARD}>
        <CardHeader className="pb-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
            className="flex w-full items-center gap-2 text-left text-base font-semibold text-slate-900"
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
            {t('invoicing.billingProfile.advancedSection')}
          </button>
        </CardHeader>
        {advancedOpen ? (
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">{t('invoicing.billingProfile.advancedHint')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('invoicing.billingProfile.datevChart')} htmlFor="datevChart">
                <select
                  id="datevChart"
                  value={form.datevChart}
                  onChange={(event) =>
                    set('datevChart', event.target.value === 'SKR04' ? 'SKR04' : 'SKR03')
                  }
                  className={FLEET_FILTER_SELECT}
                >
                  <option value="SKR03">SKR03</option>
                  <option value="SKR04">SKR04</option>
                </select>
              </Field>
              <Field
                label={t('invoicing.billingProfile.consultantNumber')}
                htmlFor="datevConsultantNumber"
              >
                <Input
                  id="datevConsultantNumber"
                  value={form.datevConsultantNumber ?? ''}
                  onChange={(event) => set('datevConsultantNumber', event.target.value)}
                />
              </Field>
              <Field label={t('invoicing.billingProfile.clientNumber')} htmlFor="datevClientNumber">
                <Input
                  id="datevClientNumber"
                  value={form.datevClientNumber ?? ''}
                  onChange={(event) => set('datevClientNumber', event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label={t('invoicing.billingProfile.revenue19')} htmlFor="revenueAccount19">
                <Input
                  id="revenueAccount19"
                  value={form.revenueAccount19 ?? ''}
                  onChange={(event) => set('revenueAccount19', event.target.value)}
                />
              </Field>
              <Field label={t('invoicing.billingProfile.revenue7')} htmlFor="revenueAccount7">
                <Input
                  id="revenueAccount7"
                  value={form.revenueAccount7 ?? ''}
                  onChange={(event) => set('revenueAccount7', event.target.value)}
                />
              </Field>
              <Field label={t('invoicing.billingProfile.revenue0')} htmlFor="revenueAccount0">
                <Input
                  id="revenueAccount0"
                  value={form.revenueAccount0 ?? ''}
                  onChange={(event) => set('revenueAccount0', event.target.value)}
                />
              </Field>
              <Field
                label={t('invoicing.billingProfile.revenueReverseCharge')}
                htmlFor="revenueAccountReverseCharge"
              >
                <Input
                  id="revenueAccountReverseCharge"
                  value={form.revenueAccountReverseCharge ?? ''}
                  onChange={(event) => set('revenueAccountReverseCharge', event.target.value)}
                />
              </Field>
            </div>
            <Field
              label={t('invoicing.billingProfile.debtorNumberStart')}
              htmlFor="debtorNumberStart"
              hint={t('invoicing.billingProfile.debtorNumberStartHint')}
            >
              <Input
                id="debtorNumberStart"
                type="number"
                min={1}
                value={form.debtorNumberStart ?? 10000}
                onChange={(event) => set('debtorNumberStart', Number(event.target.value))}
              />
            </Field>
          </CardContent>
        ) : null}
      </Card>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void submit()}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden />
          )}
          {t('invoicing.billingProfile.save')}
        </Button>
      </div>
    </div>
  );
}
