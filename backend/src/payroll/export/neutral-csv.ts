import { PayrollWageType } from '@prisma/client';

/**
 * Notr bordro ihracati.
 *
 * Hedef DATEV urunu (LODAS mi Lohn und Gehalt mi) henuz belli degil. Bu dosya
 * Steuerberater'in ihtiyaci olan TAM veriyi tasiyor: kim, hangi Lohnart, ne
 * kadar, hangi donem, hangi Kostenstelle. Gercek bicim netlestiginde yalnizca
 * yeni bir yazici eklenecek — veri modeli ve toplama mantigi degismeyecek.
 *
 * Bicim EXTF yazicisiyla ayni konvansiyonlari izliyor (noktali virgul ayirici,
 * Alman ondalik virgulu) ki iki dosyayi ayni araclarla acan muhasebeci sasirmasin.
 */

export type NeutralCsvProfile = {
  consultantNumber: string | null;
  clientNumber: string | null;
};

export type NeutralCsvRow = {
  personnelNumber: string;
  lastName: string;
  firstName: string;
  wageType: PayrollWageType;
  datevWageTypeNumber: string;
  /** Saat kalemlerinde dakika, gun kalemlerinde gun sayisi. */
  quantity: number;
  unit: 'hours' | 'days';
  costCenter: string | null;
  costUnit: string | null;
  /** Duzeltme kalemi ise duzeltilen donem "YYYY-MM"; degilse bos. */
  correctsPeriod: string | null;
};

export type NeutralCsvInput = {
  year: number;
  month: number;
  profile: NeutralCsvProfile;
  rows: readonly NeutralCsvRow[];
};

const HEADER = [
  'Personalnummer',
  'Nachname',
  'Vorname',
  'Lohnart',
  'Lohnartschluessel',
  'Menge',
  'Einheit',
  'Jahr',
  'Monat',
  'Kostenstelle',
  'Kostentraeger',
  'Rueckrechnung',
] as const;

/**
 * Alanlar noktali virgul iceremez; ayirici kacisi yerine temizleme tercih
 * edildi cunku DATEV tarafinda tirnakli alan destegi urunden urune degisiyor
 * ve bozuk bir satir tum aktarimi durduruyor.
 */
function sanitize(value: string): string {
  return value.replace(/[;\r\n]+/g, ' ').trim();
}

/** 495 dakika → "8,25". Alman ondalik virgulu, iki basamak. */
export function minutesToDecimalHours(minutes: number): string {
  const hours = minutes / 60;
  return hours.toFixed(2).replace('.', ',');
}

function formatQuantity(row: NeutralCsvRow): string {
  return row.unit === 'hours' ? minutesToDecimalHours(row.quantity) : String(row.quantity);
}

/**
 * Bir kova ihracata girer mi.
 *
 * Sifir miktarli kalem YAZILMIYOR: DATEV tarafinda sifirlik bir Lohnart satiri
 * mevcut degeri sifirlayabiliyor ve "bu ay gece calismasi yok" ile "gece
 * kalemini gonderme" ayni sey degil.
 */
export function hasQuantity(row: NeutralCsvRow): boolean {
  return row.quantity > 0;
}

export function renderNeutralPayrollCsv(input: NeutralCsvInput): string {
  const period = `${input.year}-${String(input.month).padStart(2, '0')}`;
  const lines: string[] = [
    // Ust bilgi: hangi Berater/Mandant ve hangi donem. Dosya tek basina
    // gonderildiginde de nereye ait oldugu belli olmali.
    [
      'LOHN',
      period,
      sanitize(input.profile.consultantNumber ?? ''),
      sanitize(input.profile.clientNumber ?? ''),
    ].join(';'),
    HEADER.join(';'),
  ];

  for (const row of input.rows) {
    if (!hasQuantity(row)) continue;
    lines.push(
      [
        sanitize(row.personnelNumber),
        sanitize(row.lastName),
        sanitize(row.firstName),
        row.wageType,
        sanitize(row.datevWageTypeNumber),
        formatQuantity(row),
        row.unit === 'hours' ? 'Stunden' : 'Tage',
        String(input.year),
        String(input.month),
        sanitize(row.costCenter ?? ''),
        sanitize(row.costUnit ?? ''),
        sanitize(row.correctsPeriod ?? ''),
      ].join(';'),
    );
  }

  // Sonda satir sonu: bazi ice aktaricilar son satiri eksik okuyor.
  return `${lines.join('\r\n')}\r\n`;
}

/** Kalem alanlarindan hangi kovanin hangi miktari aldigi. */
export const WAGE_TYPE_SOURCES: ReadonlyArray<{
  wageType: PayrollWageType;
  field:
    | 'regularMinutes'
    | 'overtimeMinutes'
    | 'nightMinutes'
    | 'nightCoreMinutes'
    | 'sundayMinutes'
    | 'holidayMinutes'
    | 'vacationDays'
    | 'sickDays'
    | 'unpaidAbsenceDays';
  unit: 'hours' | 'days';
}> = [
  { wageType: PayrollWageType.regular, field: 'regularMinutes', unit: 'hours' },
  { wageType: PayrollWageType.overtime, field: 'overtimeMinutes', unit: 'hours' },
  { wageType: PayrollWageType.night, field: 'nightMinutes', unit: 'hours' },
  { wageType: PayrollWageType.night_core, field: 'nightCoreMinutes', unit: 'hours' },
  { wageType: PayrollWageType.sunday, field: 'sundayMinutes', unit: 'hours' },
  { wageType: PayrollWageType.holiday, field: 'holidayMinutes', unit: 'hours' },
  { wageType: PayrollWageType.vacation, field: 'vacationDays', unit: 'days' },
  { wageType: PayrollWageType.sick, field: 'sickDays', unit: 'days' },
  { wageType: PayrollWageType.unpaid_absence, field: 'unpaidAbsenceDays', unit: 'days' },
];
