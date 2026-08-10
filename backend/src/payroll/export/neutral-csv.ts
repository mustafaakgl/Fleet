import type { DatevPayrollContext, PayrollFileWriter } from '../datev/core/datev-payroll.types';
import type { NormalizedPayrollMovement } from '../core/payroll-movement';

/**
 * Fleet'in kendi notr bordro dosyasi.
 *
 * DATEV'E VERILMEZ. Iki isi var: ihracatin ne urettigini insan gozuyle
 * dogrulamak ve Steuerberater'a "ham veri" gostermek. Gercek DATEV dosyalari
 * ayri yazicilardan cikiyor (bkz. payroll/datev/).
 *
 * Bicim EXTF yazicisiyla ayni konvansiyonlari izliyor (noktali virgul ayirici,
 * Alman ondalik virgulu) ki iki dosyayi ayni araclarla acan muhasebeci
 * sasirmasin — ama kod olarak onunla hicbir sey paylasmiyor.
 */

const HEADER = [
  'Personalnummer',
  'Bewegungsart',
  'Lohnart',
  'Menge',
  'Einheit',
  'Jahr',
  'Monat',
  'Kostenstelle',
  'Kostentraeger',
  'Quelle',
] as const;

/**
 * Alanlar noktali virgul iceremez; ayirici kacisi yerine temizleme tercih
 * edildi cunku DATEV tarafinda tirnakli alan destegi urunden urune degisiyor
 * ve bozuk bir satir tum aktarimi durduruyor.
 */
function sanitize(value: string): string {
  return value.replace(/[;\r\n]+/g, ' ').trim();
}

/** 495 → "8,25". Alman ondalik virgulu; negatif isaret korunuyor. */
export function minutesToDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2).replace('.', ',');
}

/** 12345 cent → "123,45". */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function formatQuantity(movement: NormalizedPayrollMovement): string {
  if (movement.unit === 'minutes') return minutesToDecimalHours(movement.quantity);
  if (movement.unit === 'euro_cents') return centsToAmount(movement.quantity);
  return String(movement.quantity);
}

function unitLabel(unit: NormalizedPayrollMovement['unit']): string {
  if (unit === 'minutes') return 'Stunden';
  if (unit === 'euro_cents') return 'EUR';
  return 'Tage';
}

export const neutralCsvWriter: PayrollFileWriter = {
  id: 'neutral_csv',

  fileName(context: DatevPayrollContext): string {
    return `lohn-neutral-${context.year}${String(context.month).padStart(2, '0')}.csv`;
  },

  render(movements, context): string {
    const lines: string[] = [
      // Ust bilgi: dosya tek basina gonderildiginde de nereye ait oldugu belli
      // olmali.
      [
        'LOHN',
        `${context.year}-${String(context.month).padStart(2, '0')}`,
        sanitize(context.consultantNumber),
        sanitize(context.clientNumber),
        context.payrollSystem,
      ].join(';'),
      HEADER.join(';'),
    ];

    for (const movement of movements) {
      lines.push(
        [
          sanitize(movement.personnelNumber),
          movement.type,
          sanitize(movement.wageType ?? ''),
          formatQuantity(movement),
          unitLabel(movement.unit),
          String(context.year),
          String(context.month),
          sanitize(movement.costCenter ?? ''),
          sanitize(movement.costUnit ?? ''),
          sanitize(movement.sourceId),
        ].join(';'),
      );
    }

    // Sonda satir sonu: bazi ice aktaricilar son satiri eksik okuyor.
    return `${lines.join('\r\n')}\r\n`;
  },
};
