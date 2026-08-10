import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import {
  REQUIRES_WRITE_KEY,
  WRITE_EXTRA_ROLES_KEY,
} from '../common/decorators/requires-write.decorator';
import { FINANCIAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { PayrollController } from '../payroll/payroll.controller';
import { InvoicingController } from './invoicing.controller';

/**
 * Faturalama rol matrisini sabitler.
 *
 * Bu ucta iki katman kesisiyor: controller'daki @Roles kimin ERISEBILECEGINI,
 * WriteRoleGuard kimin YAZABILECEGINI belirliyor. Kesisim sessizce daralabiliyor —
 * muhasebeci uzun sure faturalari gorup hicbirini kesemedi, cunku global yazma
 * listesinde yok. Test o kesisimi acikca yaziyor.
 */

const prototype = InvoicingController.prototype as unknown as Record<string, object>;

function extraWriteRoles(method: string): string[] {
  const handler = prototype[method];
  assert.ok(handler, `handler yok: ${method}`);
  return (Reflect.getMetadata(WRITE_EXTRA_ROLES_KEY, handler) as string[] | undefined) ?? [];
}

function requiresWrite(method: string): boolean {
  return Reflect.getMetadata(REQUIRES_WRITE_KEY, prototype[method]) === true;
}

/** RolesGuard ile AYNI kural: metot seviyesi sinif seviyesini ezer. */
function rolesFor(method: string): string[] {
  const classRoles = (Reflect.getMetadata(ROLES_KEY, InvoicingController) as string[]) ?? [];
  const methodRoles = Reflect.getMetadata(ROLES_KEY, prototype[method]) as string[] | undefined;
  return methodRoles ?? classRoles;
}

/** Bir ucu gercekten kimler cagirabilir: @Roles ∩ (global yazma + genisletme). */
function effectiveWriteRoles(method: string): string[] {
  const writers = new Set([...OPERATIONAL_WRITE_ROLES, ...extraWriteRoles(method)]);
  return rolesFor(method).filter((role) => writers.has(role)).sort();
}

/** Office'in de kesebildigi giden fatura uclari. */
const INVOICE_WRITE_ENDPOINTS = [
  'createDraft',
  'updateDraft',
  'addDraftLine',
  'updateDraftLine',
  'deleteDraftLine',
  'finalizeInvoice',
  'sendInvoice',
  'addPayment',
];

/**
 * Faturalama controller'inda olup office'e KAPALI kalan uclar.
 *
 * Sirketin kendi banka/vergi bilgileri, DATEV ihracati ve odeme silme
 * "giden fatura kesmek" degil; office'in fatura kesmesi gerekiyor, sirketin
 * IBAN'ini degistirmesi gerekmiyor.
 */
const FINANCE_ONLY_ENDPOINTS = ['upsertBillingProfile', 'deletePayment', 'exportDatev'];

const WRITE_ENDPOINTS = [...INVOICE_WRITE_ENDPOINTS, ...FINANCE_ONLY_ENDPOINTS];

describe('invoicing role matrix', () => {
  it('her yazma ucu yazma korumasi istiyor', () => {
    for (const method of WRITE_ENDPOINTS) {
      assert.equal(requiresWrite(method), true, `${method} yazma korumasi istemiyor`);
    }
  });

  it('giden faturayi office dahil dort rol kesebiliyor', () => {
    for (const method of INVOICE_WRITE_ENDPOINTS) {
      assert.deepEqual(
        effectiveWriteRoles(method),
        ['accounting', 'admin', 'boss', 'office'],
        `${method} icin yanlis rol kumesi`,
      );
    }
  });

  it('banka bilgisi, DATEV ve odeme silme office\'e KAPALI', () => {
    // Fatura kesmek ile sirketin mali kimligini degistirmek ayni yetki degil.
    for (const method of FINANCE_ONLY_ENDPOINTS) {
      assert.deepEqual(
        effectiveWriteRoles(method),
        ['accounting', 'admin', 'boss'],
        `${method} office'e acilmis`,
      );
    }
  });

  it('Lohnvorbereitung office\'e KAPALI kaliyor', () => {
    // Bu testin varlik sebebi: fatura yetkisi verilirken maas verisinin de
    // acilmasi en kolay yapilacak hata. INVOICING_ROLES bu yuzden
    // FINANCIAL_ROLES'ten ayri duruyor.
    const payrollRoles = (Reflect.getMetadata(ROLES_KEY, PayrollController) as string[]) ?? [];
    assert.equal(payrollRoles.includes('office'), false);
    assert.equal(FINANCIAL_ROLES.includes('office' as never), false);
  });

  it('does not widen the global write list', () => {
    // Genisletme uc bazinda kalmali: muhasebe global listeye eklenirse gorev,
    // surucu, arac gibi her seyde yazma hakki kazanir.
    assert.equal(OPERATIONAL_WRITE_ROLES.includes('accounting' as never), false);
  });
});
