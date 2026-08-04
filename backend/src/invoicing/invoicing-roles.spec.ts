import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import {
  REQUIRES_WRITE_KEY,
  WRITE_EXTRA_ROLES_KEY,
} from '../common/decorators/requires-write.decorator';
import { OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
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

/** Bir ucu gercekten kimler cagirabilir: @Roles ∩ (global yazma + genisletme). */
function effectiveWriteRoles(method: string): string[] {
  const classRoles = (Reflect.getMetadata(ROLES_KEY, InvoicingController) as string[]) ?? [];
  const writers = new Set([...OPERATIONAL_WRITE_ROLES, ...extraWriteRoles(method)]);
  return classRoles.filter((role) => writers.has(role)).sort();
}

const WRITE_ENDPOINTS = [
  'upsertBillingProfile',
  'createDraft',
  'updateDraft',
  'addDraftLine',
  'updateDraftLine',
  'deleteDraftLine',
  'finalizeInvoice',
  'sendInvoice',
  'addPayment',
  'deletePayment',
  'exportDatev',
];

describe('invoicing role matrix', () => {
  it('lets exactly admin, boss and accounting write', () => {
    for (const method of WRITE_ENDPOINTS) {
      assert.equal(requiresWrite(method), true, `${method} yazma korumasi istemiyor`);
      assert.deepEqual(
        effectiveWriteRoles(method),
        ['accounting', 'admin', 'boss'],
        `${method} icin yanlis rol kumesi`,
      );
    }
  });

  it('keeps office out of invoicing', () => {
    // Office operasyonel yazma listesinde VAR; faturalamadan onu disarida tutan
    // sey controller'daki @Roles. O kaldirilirsa disponent fatura kesebilir.
    const classRoles = (Reflect.getMetadata(ROLES_KEY, InvoicingController) as string[]) ?? [];
    assert.equal(classRoles.includes('office'), false);
    for (const method of WRITE_ENDPOINTS) {
      assert.equal(effectiveWriteRoles(method).includes('office'), false, method);
    }
  });

  it('does not widen the global write list', () => {
    // Genisletme uc bazinda kalmali: muhasebe global listeye eklenirse gorev,
    // surucu, arac gibi her seyde yazma hakki kazanir.
    assert.equal(OPERATIONAL_WRITE_ROLES.includes('accounting' as never), false);
  });
});
