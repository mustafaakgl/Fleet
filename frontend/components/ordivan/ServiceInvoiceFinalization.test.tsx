import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Servis faturasi onay bloku (Faz 13).
 *
 * Sinanan sey: aracin ve kaydedilecek tutarin KULLANICI karari olmasi, EUR'nun
 * varsayilmamasi ve onaylandiginda ne olusacaginin ekranda yazmasi.
 */

const listVehiclesFn = vi.fn();

vi.mock('@/lib/api', () => ({
  vehiclesApi: { list: (...args: unknown[]) => listVehiclesFn(...args) },
}));

import type { AutomationProposalDetail } from '@/lib/types';
import {
  ServiceInvoiceFinalization,
  type ServiceInvoiceConfirmation,
} from './ServiceInvoiceFinalization';

function detail(overrides: Partial<AutomationProposalDetail> = {}): AutomationProposalDetail {
  return {
    id: 'prop-1',
    proposalType: 'service_invoice.draft',
    schemaVersion: 1,
    status: 'pending_review',
    payload: {
      vendorName: 'Werkstatt Nord GmbH',
      serviceDate: '2026-08-10',
      plateNumber: 'DU-AB 123',
      vin: 'WDB9634031L123456',
      mileageKm: 412000,
      currency: 'EUR',
      netAmount: 1000,
      taxAmount: 190,
      grossAmount: 1190,
      serviceDescription: 'Inspektion',
      lineItems: [{ description: 'Inspektion', totalPrice: 400 }],
    },
    confidence: { vendorName: 0.97 },
    evidence: { vehicleMatch: { status: 'verified', vehicleId: 'veh-1', reason: 'exact_vin' } },
    checks: [],
    checkSummary: { total: 0, verified: 0, failed: 0, unknown: 0, allVerified: false, hasUnknown: false },
    lowConfidenceFields: [],
    lowConfidenceThreshold: 0.7,
    job: { id: 'job-1', jobType: 'document.service_invoice.extract', schemaVersion: 1 },
    agentRun: null,
    approvalTasks: [],
    approvalTask: null,
    document: null,
    serviceRecord: null,
    expiresAt: null,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

/** Bilesen kontrollu; testte kucuk bir durum tutucu yeterli. */
function Harness({ data }: { data: AutomationProposalDetail }) {
  const [value, setValue] = useState<ServiceInvoiceConfirmation | null>(null);
  return <ServiceInvoiceFinalization detail={data} value={value} onChange={setValue} />;
}

describe('ServiceInvoiceFinalization', () => {
  beforeEach(() => {
    listVehiclesFn.mockReset();
    listVehiclesFn.mockResolvedValue({
      data: [
        { id: 'veh-1', plate_number: 'DU-AB 123', brand: 'MAN', model: 'TGX', status: 'active' },
        { id: 'veh-2', plate_number: 'DU-CD 456', brand: 'MAN', model: 'TGS', status: 'active' },
      ],
      total: 2,
      page: 1,
      limit: 500,
    });
  });

  it('net, vergi ve brut UCU DE gosterilir', async () => {
    render(<Harness data={detail()} />);
    await waitFor(() => expect(screen.getByTestId('service-invoice-amounts')).toBeDefined());

    const text = screen.getByTestId('service-invoice-amounts').textContent ?? '';
    expect(text).toContain('1000');
    expect(text).toContain('190');
    expect(text).toContain('1190');
  });

  it('kaydedilecek tutar acikca SECILIR — sessiz karar yok', async () => {
    const user = userEvent.setup();
    render(<Harness data={detail()} />);
    await waitFor(() => expect(screen.getByTestId('service-invoice-basis-net')).toBeDefined());

    await user.click(screen.getByTestId('service-invoice-basis-gross'));
    await waitFor(() =>
      expect(screen.getByTestId('service-invoice-summary').textContent).toContain('1190'),
    );
  });

  it('kesin eslesmede arac onceden secili gelir', async () => {
    render(<Harness data={detail()} />);
    await waitFor(() =>
      expect((screen.getByTestId('service-invoice-vehicle-select') as HTMLSelectElement).value).toBe(
        'veh-1',
      ),
    );
    expect(screen.getByTestId('service-invoice-match').textContent).toContain(
      'automation.serviceInvoice.match.verified',
    );
  });

  it('eslesme belirsizse arac BOS gelir ve uyari cikar', async () => {
    render(
      <Harness
        data={detail({
          evidence: { vehicleMatch: { status: 'unknown', vehicleId: null, reason: 'no_matching_vehicle' } },
        })}
      />,
    );

    await waitFor(() =>
      expect((screen.getByTestId('service-invoice-vehicle-select') as HTMLSelectElement).value).toBe(
        '',
      ),
    );
    expect(screen.getByTestId('service-invoice-vehicle-required')).toBeDefined();
    expect(screen.getByTestId('service-invoice-match').textContent).toContain(
      'automation.serviceInvoice.match.unknown',
    );
  });

  it('celiskili eslesmede de kullanici secmek zorunda', async () => {
    render(
      <Harness
        data={detail({
          evidence: {
            vehicleMatch: { status: 'failed', vehicleId: null, reason: 'vin_and_plate_disagree' },
          },
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('service-invoice-match').textContent).toContain(
        'automation.serviceInvoice.match.failed',
      ),
    );
    expect((screen.getByTestId('service-invoice-vehicle-select') as HTMLSelectElement).value).toBe('');
  });

  it('para birimi belgeden gelmiyorsa BOS kalir — EUR yazilmaz', async () => {
    render(<Harness data={detail({ payload: { ...detail().payload, currency: null } })} />);
    await waitFor(() => expect(screen.getByTestId('service-invoice-currency')).toBeDefined());

    expect((screen.getByTestId('service-invoice-currency') as HTMLInputElement).value).toBe('');
  });

  it('onaylandiginda ne olusacagi yazar', async () => {
    render(<Harness data={detail()} />);
    await waitFor(() => expect(screen.getByTestId('service-invoice-summary')).toBeDefined());

    expect(screen.getByTestId('service-invoice-summary').textContent).toContain(
      'automation.serviceInvoice.summaryTitle',
    );
  });

  it('fatura satirlari onerinin icinde korunur', async () => {
    render(<Harness data={detail()} />);
    await waitFor(() => expect(screen.getByTestId('service-invoice-line-items')).toBeDefined());
  });

  it('kayit olustuysa arac gecmisine baglanti cikar', async () => {
    render(
      <Harness
        data={detail({
          serviceRecord: {
            id: 'svc-1',
            vehicleId: 'veh-1',
            date: '2026-08-10T00:00:00.000Z',
            costAmount: 1190,
            currency: 'EUR',
          },
        })}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('service-invoice-created')).toBeDefined());
    expect(screen.getByRole('link', { name: 'automation.serviceInvoice.openHistory' })).toBeDefined();
  });
});
