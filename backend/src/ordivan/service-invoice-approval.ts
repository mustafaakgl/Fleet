import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CostBasis, ServiceInvoiceDraft } from './core/service-invoice';
import { costOptions } from './core/service-invoice';

/**
 * Servis faturasi onayinin SUNUCU TARAFI dogrulamasi (Faz 13).
 *
 * INSANIN ONAYLADIGI DEGERLER kaydediliyor, ajanin urettikleri degil. Ama
 * insanin gonderdigi her sey de korlemesine kabul edilmiyor:
 *   - `vehicleId` kiraci icinde COZULMEK ZORUNDA (cagiran dogrular),
 *   - `costBasis` acikca secilmis olmali — net/brut karari sessizce
 *     verilmiyor cunku `ServiceRecord.costAmount`in anlami repoda ACIK DEGIL,
 *   - para birimi ZORUNLU: EUR varsayilmiyor,
 *   - tutar makul aralikta ve pozitif olmali.
 */
export interface ServiceInvoiceFinalization {
  vehicleId: string;
  costBasis: CostBasis;
  costAmount: number;
  currency: string;
  serviceDate: string;
  repairCompany: string;
  serviceType: string;
  mileageKm?: number;
  notes?: string;
}

export const MAX_SERVICE_COST = 1_000_000;

export interface FinalizationResult {
  data: {
    vehicleId: string;
    date: Date;
    serviceType: string;
    repairCompany: string;
    vendor: string;
    costAmount: Prisma.Decimal;
    currency: string;
    mileageKm: number | null;
    notes: string | null;
  };
  /** Ajanin onerdigi tutardan sapma var mi — denetime ve duzeltmeye giriyor. */
  amountDiffersFromExtraction: boolean;
  extractedAmount: number | null;
}

export function buildServiceRecordData(
  input: ServiceInvoiceFinalization,
  draft: ServiceInvoiceDraft,
): FinalizationResult {
  const currency = (input.currency ?? '').trim().toUpperCase();
  if (currency.length !== 3) {
    // EUR VARSAYILMIYOR. Para birimi eksikse kayit acilmiyor.
    throw new BadRequestException({ code: 'service_invoice_currency_required' });
  }

  if (input.costBasis !== 'net' && input.costBasis !== 'gross') {
    throw new BadRequestException({ code: 'service_invoice_cost_basis_required' });
  }

  const amount = Number(input.costAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SERVICE_COST) {
    throw new BadRequestException({ code: 'service_invoice_cost_invalid' });
  }

  const date = new Date(input.serviceDate);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ code: 'service_invoice_service_date_invalid' });
  }

  const repairCompany = (input.repairCompany ?? '').trim();
  if (!repairCompany) {
    throw new BadRequestException({ code: 'service_invoice_repair_company_required' });
  }

  const serviceType = (input.serviceType ?? '').trim();
  if (!serviceType) {
    throw new BadRequestException({ code: 'service_invoice_service_type_required' });
  }

  const extracted =
    costOptions(draft).find((option) => option.basis === input.costBasis)?.amount ?? null;

  return {
    data: {
      vehicleId: input.vehicleId,
      date,
      serviceType: serviceType.slice(0, 120),
      repairCompany: repairCompany.slice(0, 200),
      vendor: repairCompany.slice(0, 200),
      // Decimal(10,2): kurus hassasiyeti korunuyor, float toplamasi yok.
      costAmount: new Prisma.Decimal(amount.toFixed(2)),
      currency,
      mileageKm:
        typeof input.mileageKm === 'number' && Number.isInteger(input.mileageKm)
          ? input.mileageKm
          : null,
      notes: input.notes?.trim()?.slice(0, 1000) || null,
    },
    amountDiffersFromExtraction:
      extracted !== null && Math.abs(extracted - amount) > 0.005,
    extractedAmount: extracted,
  };
}
