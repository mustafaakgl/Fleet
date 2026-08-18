import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Otomasyon kuyrugu (Faz 12).
 *
 * Sinanan sey: dusuk guven vurgusu, uc durumlu kontrollerin gorunurlugu,
 * kosullu aciklama zorunlulugu, red kategorisi ve onayin domain kaydi
 * URETMEDIGININ ekranda yazmasi.
 */

const listFn = vi.fn();
const detailFn = vi.fn();
const metricsFn = vi.fn();
const decideFn = vi.fn();

vi.mock('@/lib/api', () => ({
  ordivanApi: {
    listProposals: (...args: unknown[]) => listFn(...args),
    proposalDetail: (...args: unknown[]) => detailFn(...args),
    reviewMetrics: (...args: unknown[]) => metricsFn(...args),
    decideProposal: (...args: unknown[]) => decideFn(...args),
  },
}));

import type { AutomationProposalDetail, AutomationProposalRow } from '@/lib/types';
import { AutomationQueueScreen } from './AutomationQueueScreen';

function row(overrides: Partial<AutomationProposalRow> = {}): AutomationProposalRow {
  return {
    id: 'prop-1',
    proposalType: 'document.classification',
    status: 'pending_review',
    jobId: 'job-1',
    jobType: 'document.mock_classification',
    lowConfidenceFields: ['documentKind'],
    checkSummary: { total: 2, verified: 1, failed: 0, unknown: 1, allVerified: false, hasUnknown: true },
    decision: null,
    decidedAt: null,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<AutomationProposalDetail> = {}): AutomationProposalDetail {
  return {
    id: 'prop-1',
    proposalType: 'document.classification',
    schemaVersion: 1,
    status: 'pending_review',
    payload: { documentKind: 'other', confidence: 0.42 },
    confidence: { documentKind: 0.42 },
    evidence: { source: 'file_name_rules' },
    checks: [
      { code: 'document_kind_rule', status: 'verified', messageKey: 'k.verified' },
      {
        code: 'content_consistency',
        status: 'unknown',
        messageKey: 'k.unknown',
        unknownReason: 'content_not_read_in_mock_mode',
      },
    ],
    checkSummary: { total: 2, verified: 1, failed: 0, unknown: 1, allVerified: false, hasUnknown: true },
    lowConfidenceFields: ['documentKind'],
    lowConfidenceThreshold: 0.7,
    job: { id: 'job-1', jobType: 'document.mock_classification', schemaVersion: 1 },
    agentRun: {
      id: 'run-1',
      attempt: 1,
      toolset: [],
      capabilities: ['document.classification'],
      credentialScope: ['document.classification'],
      connectorVersion: '0.1.0-mock',
      protocolVersion: '1',
      modelVersion: 'mock-rules-1',
      promptVersion: 'mock-none',
      connector: { id: 'conn-1', displayName: 'Buro-PC' },
    },
    approvalTasks: [],
    approvalTask: {
      id: 'task-1',
      sequence: 1,
      status: 'open',
      assignedRole: null,
      assignedUserId: null,
      openedAt: '2026-08-18T09:05:00.000Z',
      decision: null,
      rejectionCategory: null,
      decidedAt: null,
      decisionNote: null,
      reviewDurationMs: null,
      changedFieldCount: 0,
      criticalLowConfidenceVerified: false,
      decidedBy: null,
    },
    expiresAt: '2026-08-25T09:00:00.000Z',
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

async function openDetail() {
  const user = userEvent.setup();
  render(<AutomationQueueScreen />);
  await waitFor(() => expect(screen.getByTestId('automation-row')).toBeDefined());
  await user.click(screen.getByText('automation.queue.review'));
  await waitFor(() => expect(screen.getByTestId('automation-detail')).toBeDefined());
  return user;
}

describe('AutomationQueueScreen', () => {
  beforeEach(() => {
    listFn.mockReset();
    detailFn.mockReset();
    metricsFn.mockReset();
    decideFn.mockReset();
    listFn.mockResolvedValue({ rows: [row()], page: 1, pageSize: 50, total: 1, totalPages: 1 });
    metricsFn.mockResolvedValue({ decided: 4, fastDecisions: 1, withChanges: 2, criticalVerified: 3 });
    detailFn.mockResolvedValue(detail());
    decideFn.mockResolvedValue({ proposal: detail({ status: 'approved' }), changed: true });
  });

  it('inceleme metriklerini gosterir — rubber-stamping gorunur olsun', async () => {
    render(<AutomationQueueScreen />);
    await waitFor(() => expect(screen.getByTestId('automation-metrics')).toBeDefined());

    const text = screen.getByTestId('automation-metrics').textContent ?? '';
    expect(text).toContain('automation.metrics.decided');
    expect(text).toContain('automation.metrics.fast');
    expect(text).toContain('automation.metrics.criticalVerified');
  });

  it('kontrol ozeti "hepsi dogrulandi" DEMEZ, acik sayisini yazar', async () => {
    render(<AutomationQueueScreen />);
    await waitFor(() => expect(screen.getByTestId('automation-row')).toBeDefined());

    expect(screen.getByTestId('automation-row').textContent).toContain(
      'automation.queue.checkSummary',
    );
  });

  it('onayin domain kaydi URETMEDIGI ekranda yazar', async () => {
    await openDetail();
    expect(screen.getByTestId('automation-detail').textContent).toContain(
      'automation.detail.noDomainWrite',
    );
  });

  it('dusuk guvenli kritik alan vurgulanir ve dogrulama kutusu cikar', async () => {
    await openDetail();

    const field = screen.getByTestId('automation-field-documentKind');
    expect(field.textContent).toContain('automation.detail.lowConfidence');
    expect(field.textContent).toContain('automation.detail.critical');
    expect(screen.getByTestId('automation-verify-documentKind')).toBeDefined();
  });

  it('unknown kontrol GEREKCESIYLE gorunur', async () => {
    await openDetail();

    const checks = screen.getByTestId('automation-checks').textContent ?? '';
    expect(checks).toContain('automation.check.status.unknown');
    expect(checks).toContain('automation.check.unknownReason');
  });

  it('denetlenebilir yetki izi gorunur ve arac seti bos yazar', async () => {
    await openDetail();
    expect(screen.getByTestId('automation-agent-run').textContent).toContain(
      'automation.detail.agentRun',
    );
  });

  it('kritik dusuk guvenli alan DEGISTIRILMEDEN onaylanamaz — aciklama ister', async () => {
    await openDetail();

    const approve = screen.getByTestId('automation-approve') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByTestId('automation-detail').textContent).toContain(
      'automation.detail.noteRequired',
    );
  });

  it('aciklama yazilinca onay acilir ve duzeltmeler gonderilir', async () => {
    const user = await openDetail();

    await user.type(screen.getByTestId('automation-note'), 'Am Original geprüft');
    const approve = screen.getByTestId('automation-approve') as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(false));

    await user.click(approve);
    await waitFor(() => expect(decideFn).toHaveBeenCalled());

    const [, body] = decideFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.decision).toBe('approved');
    expect(body.expectedUpdatedAt).toBe('2026-08-18T09:00:00.000Z');
    const corrections = body.corrections as Array<{ fieldName: string; criticalLowConfidence: boolean }>;
    expect(corrections.find((item) => item.fieldName === 'documentKind')?.criticalLowConfidence).toBe(
      true,
    );
  });

  it('alan duzeltilirse aciklama zorunlulugu KALKAR', async () => {
    const user = await openDetail();

    await user.clear(screen.getByTestId('automation-input-documentKind'));
    await user.type(screen.getByTestId('automation-input-documentKind'), 'invoice');

    const approve = screen.getByTestId('automation-approve') as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(false));
  });

  it('red kategorisi secilmeden reddedilemez', async () => {
    const user = await openDetail();

    await user.type(screen.getByTestId('automation-note'), 'Passt nicht zum Beleg');
    const reject = screen.getByTestId('automation-reject') as HTMLButtonElement;
    expect(reject.disabled).toBe(true);

    await user.selectOptions(
      screen.getByLabelText('automation.detail.rejectionCategory'),
      'incorrect_value',
    );
    await waitFor(() => expect(reject.disabled).toBe(false));
  });

  it('karar verilmis oneride karar formu ACILMAZ', async () => {
    detailFn.mockResolvedValue(
      detail({
        status: 'approved',
        approvalTask: {
          ...detail().approvalTask!,
          status: 'decided',
          decision: 'approved',
          decidedAt: '2026-08-18T09:10:00.000Z',
          reviewDurationMs: 1200,
          decidedBy: { id: 'u-1', fullName: 'Ayşe Yılmaz' },
        },
      }),
    );
    await openDetail();

    expect(screen.queryByTestId('automation-decision-form')).toBeNull();
    // Cok hizli karar bir SINYAL olarak isaretlenir.
    expect(screen.getByTestId('automation-decided').textContent).toContain(
      'automation.detail.fastDecision',
    );
  });
});
