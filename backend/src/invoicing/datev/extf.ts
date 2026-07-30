export type DatevTaxCategory = 'standard' | 'reduced' | 'exempt' | 'reverse_charge';

export type DatevTaxBucket = {
  taxCategory: DatevTaxCategory;
  taxRateBasisPoints: number;
  grossCents: number;
};

export type DatevInvoiceKind = 'invoice' | 'credit_note' | 'cancellation';

export type DatevInvoiceExportInput = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  companyName: string;
  debtorNumber: number;
  kind: DatevInvoiceKind;
  taxBuckets: DatevTaxBucket[];
};

export type DatevDebtorRecord = {
  debtorNumber: number;
  companyName: string;
};

export type DatevExtfProfile = {
  consultantNumber: string | null;
  clientNumber: string | null;
  chart: 'SKR03' | 'SKR04';
  revenueAccount19: string;
  revenueAccount7: string;
  revenueAccount0: string;
  revenueAccountReverseCharge: string;
};

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad4(value: number): string {
  return value.toString().padStart(4, '0');
}

/** DATEV GGAA: Tag + Monat, without year. */
export function formatBelegdatumGgaa(value: Date): string {
  const day = pad2(value.getUTCDate());
  const month = pad2(value.getUTCMonth() + 1);
  return `${day}${month}`;
}

/** German decimal comma, no thousands separators. */
export function formatExtfAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole},${pad2(fraction)}`;
}

function bucketRevenueAccount(profile: DatevExtfProfile, bucket: DatevTaxBucket): string {
  if (bucket.taxCategory === 'standard' || bucket.taxRateBasisPoints === 1900) {
    return profile.revenueAccount19;
  }
  if (bucket.taxCategory === 'reduced' || bucket.taxRateBasisPoints === 700) {
    return profile.revenueAccount7;
  }
  if (bucket.taxCategory === 'reverse_charge') {
    return profile.revenueAccountReverseCharge;
  }
  return profile.revenueAccount0;
}

function bucketBuSchluessel(bucket: DatevTaxBucket): string {
  if (bucket.taxCategory === 'standard' || bucket.taxRateBasisPoints === 1900) return '81';
  if (bucket.taxCategory === 'reduced' || bucket.taxRateBasisPoints === 700) return '86';
  if (bucket.taxCategory === 'reverse_charge') return '94';
  return '40';
}

function kindSign(kind: DatevInvoiceKind): number {
  return kind === 'invoice' ? 1 : -1;
}

function sanitizeText(value: string): string {
  return value.replace(/[;\r\n]/g, ' ').trim();
}

export function renderExtfBuchungsstapelCsv(params: {
  profile: DatevExtfProfile;
  createdAt: Date;
  invoices: DatevInvoiceExportInput[];
}): string {
  const created = params.createdAt;
  const stamp = `${pad4(created.getUTCFullYear())}${pad2(created.getUTCMonth() + 1)}${pad2(created.getUTCDate())}`;

  const header = [
    'EXTF',
    '700',
    '21',
    'Buchungsstapel',
    '12',
    stamp,
    sanitizeText(params.profile.consultantNumber ?? ''),
    sanitizeText(params.profile.clientNumber ?? ''),
    params.profile.chart,
    'EUR',
  ].join(';');

  const columns = [
    'Umsatz',
    'S/H',
    'Konto',
    'Gegenkonto',
    'BU-Schluessel',
    'Belegdatum',
    'Belegfeld1',
    'Buchungstext',
  ].join(';');

  const rows: string[] = [header, columns];

  for (const invoice of params.invoices) {
    const sign = kindSign(invoice.kind);
    for (const bucket of invoice.taxBuckets) {
      if (bucket.grossCents === 0) continue;
      const signedGross = bucket.grossCents * sign;
      const side = signedGross >= 0 ? 'S' : 'H';
      rows.push(
        [
          formatExtfAmount(signedGross),
          side,
          invoice.debtorNumber.toString(),
          bucketRevenueAccount(params.profile, bucket),
          bucketBuSchluessel(bucket),
          formatBelegdatumGgaa(invoice.invoiceDate),
          sanitizeText(invoice.invoiceNumber),
          sanitizeText(invoice.companyName),
        ].join(';'),
      );
    }
  }

  return `${rows.join('\n')}\n`;
}

export function renderDebtorMasterCsv(records: DatevDebtorRecord[]): string {
  const rows = ['Debitor;Name'];
  for (const record of records) {
    rows.push(`${record.debtorNumber};${sanitizeText(record.companyName)}`);
  }
  return `${rows.join('\n')}\n`;
}
