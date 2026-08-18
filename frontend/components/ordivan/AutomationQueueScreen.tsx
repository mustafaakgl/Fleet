'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, HelpCircle, Inbox, Loader2, Upload, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ordivanApi } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
} from '@/lib/fleet-table';
import {
  REJECTION_CATEGORIES,
  canSubmitDecision,
  checkLabelKey,
  checkTone,
  formatDuration,
  isCriticalField,
  isFastDecision,
  isLowConfidence,
  proposalStatusKey,
  proposalTone,
  rejectionCategoryKey,
  resolveNoteRequirement,
  type FieldReviewState,
  type Tone,
} from '@/lib/ordivan-view';
import {
  ServiceInvoiceFinalization,
  type ServiceInvoiceConfirmation,
} from './ServiceInvoiceFinalization';
import type {
  AutomationProposalDetail,
  AutomationProposalRow,
  AutomationProposalStatus,
  AutomationRejectionCategory,
  AutomationReviewMetrics,
} from '@/lib/types';

const TONE_BADGE: Record<Tone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
};

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: HelpCircle,
};

const STATUSES: Array<AutomationProposalStatus | 'all'> = [
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'all',
];

/**
 * Otomasyon kuyrugu — insan incelemesi (Faz 12).
 *
 * ONAY HICBIR DOMAIN KAYDI URETMEZ: ne gorev, ne tur, ne belge, ne fatura.
 * Ekranda da boyle yaziyor — kullanicinin "onaylarsam kayit olusur mu"
 * sorusuna tahminle cevap vermesi gerekmemeli.
 *
 * INLINE DUZELTME bir DEGER YAZMAZ: insanin bir alani duzeltmesi, o alanin
 * `changed` olarak isaretlenmesi demektir ve kalite sinyali olarak kaydedilir.
 * Faz 12'de onerinin govdesi degistirilemez, cunku onay zaten hicbir yere
 * yazmiyor.
 */
export function AutomationQueueScreen() {
  const { t, i18n } = useTranslation();

  const [status, setStatus] = useState<AutomationProposalStatus | 'all'>('pending_review');
  const [rows, setRows] = useState<AutomationProposalRow[]>([]);
  const [metrics, setMetrics] = useState<AutomationReviewMetrics | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AutomationProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [changedFields, setChangedFields] = useState<Record<string, boolean>>({});
  const [verifiedFields, setVerifiedFields] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [rejectionCategory, setRejectionCategory] = useState<AutomationRejectionCategory | ''>('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<ServiceInvoiceConfirmation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNoticeKey, setUploadNoticeKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorKey(null);
    try {
      const [list, reviewMetrics] = await Promise.all([
        ordivanApi.listProposals(
          { status: status === 'all' ? undefined : status, pageSize: 50 },
          controller.signal,
        ),
        ordivanApi.reviewMetrics(controller.signal),
      ]);
      setRows(list.rows);
      setMetrics(reviewMetrics);
    } catch {
      if (!controller.signal.aborted) setErrorKey('automation.queue.loadFailed');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    setChangedFields({});
    setVerifiedFields({});
    setNote('');
    setRejectionCategory('');
    setConfirmation(null);
    void ordivanApi
      .proposalDetail(openId)
      .then(setDetail)
      .catch(() => setErrorKey('automation.queue.loadFailed'));
  }, [openId]);

  const fieldStates: FieldReviewState[] = detail
    ? Object.keys(detail.payload).map((fieldName) => ({
        fieldName,
        changed: changedFields[fieldName] ?? false,
        criticalLowConfidence:
          isCriticalField(detail.proposalType, fieldName) && isLowConfidence(detail, fieldName),
      }))
    : [];

  const isServiceInvoice = detail?.proposalType === 'service_invoice.draft';

  /**
   * Servis faturasi onayinda eksiksiz olmasi gereken alanlar.
   *
   * ARAC ZORUNLU: eslestirme belirsizse kullanici secmeden onay verilemez.
   * PARA BIRIMI ZORUNLU: EUR varsayilmiyor.
   */
  const serviceInvoiceReady =
    !isServiceInvoice ||
    (!!confirmation &&
      confirmation.vehicleId.length > 0 &&
      confirmation.currency.trim().length === 3 &&
      confirmation.serviceDate.length > 0 &&
      confirmation.repairCompany.trim().length > 0 &&
      confirmation.serviceType.trim().length > 0 &&
      confirmation.costAmount > 0);

  const uploadInvoice = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadNoticeKey(null);
    setErrorKey(null);
    try {
      const uploaded = await ordivanApi.uploadServiceInvoice(file);
      setUploadNoticeKey(
        uploaded.duplicate
          ? 'automation.upload.duplicate'
          : 'automation.upload.accepted',
      );
      await load();
    } catch {
      setErrorKey('automation.upload.failed');
    } finally {
      setUploading(false);
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!detail) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await ordivanApi.decideProposal(detail.id, {
        expectedUpdatedAt: detail.updatedAt,
        decision,
        note: note.trim() || undefined,
        rejectionCategory:
          decision === 'rejected' ? (rejectionCategory as AutomationRejectionCategory) : undefined,
        corrections: fieldStates.map((field) => ({
          fieldName: field.fieldName,
          fieldType: typeof detail.payload[field.fieldName],
          changed: field.changed,
          category: field.changed ? 'value_corrected' : 'accepted_as_is',
          criticalLowConfidence: field.criticalLowConfidence,
          verifiedByReviewer: verifiedFields[field.fieldName] ?? false,
        })),
        // Servis faturasi onayinda INSANIN onayladigi degerler gidiyor.
        ...(isServiceInvoice && decision === 'approved' && confirmation
          ? { serviceInvoice: confirmation }
          : {}),
      });
      setOpenId(null);
      await load();
    } catch {
      setErrorKey('automation.queue.decideFailed');
    } finally {
      setBusy(false);
    }
  };

  const requirement = resolveNoteRequirement({
    decision: rejectionCategory ? 'rejected' : 'approved',
    rejectionCategory: rejectionCategory || null,
    fields: fieldStates,
  });

  return (
    <div className="space-y-4" data-testid="automation-queue">
      {/* Bu satirin amaci: onayin gercekten okunup okunmadigini gorunur kilmak. */}
      {metrics ? (
        <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 p-3 text-sm" data-testid="automation-metrics">
          <span>{t('automation.metrics.decided', { count: metrics.decided })}</span>
          <span>{t('automation.metrics.fast', { count: metrics.fastDecisions })}</span>
          <span>{t('automation.metrics.changed', { count: metrics.withChanges })}</span>
          <span>{t('automation.metrics.criticalVerified', { count: metrics.criticalVerified })}</span>
        </div>
      ) : null}

      {/* Servis faturasi yukleme (Faz 13) — yalnizca gercek PDF. */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm" htmlFor="service-invoice-upload">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('automation.upload.label')}
        </label>
        <input
          id="service-invoice-upload"
          type="file"
          accept="application/pdf"
          disabled={uploading}
          className="text-xs"
          onChange={(event) => void uploadInvoice(event.target.files?.[0])}
          data-testid="automation-upload-input"
        />
        {uploadNoticeKey ? (
          <span className="text-xs text-muted-foreground" data-testid="automation-upload-notice">
            {t(uploadNoticeKey)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('automation.queue.statusFilter')}
          className={FLEET_FILTER_SELECT}
          value={status}
          onChange={(event) => setStatus(event.target.value as AutomationProposalStatus | 'all')}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? t('automation.queue.allStatuses') : t(proposalStatusKey(value))}
            </option>
          ))}
        </select>
      </div>

      {errorKey ? <p className="text-sm text-red-600">{t(errorKey)}</p> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t('automation.queue.emptyTitle')}
          subtitle={t('automation.queue.emptyBody')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.queue.proposalType')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.queue.jobType')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.queue.status')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.queue.checks')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('automation.queue.lowConfidence')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD} />
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="automation-row">
                  <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{row.proposalType}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>{row.jobType}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Badge variant={TONE_BADGE[proposalTone(row.status)]}>
                      {t(proposalStatusKey(row.status))}
                    </Badge>
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {/* `unknown` varsa "hepsi dogrulandi" DENMEZ. */}
                    {t('automation.queue.checkSummary', {
                      verified: row.checkSummary.verified,
                      total: row.checkSummary.total,
                      unknown: row.checkSummary.unknown,
                    })}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {row.lowConfidenceFields.length === 0
                      ? '—'
                      : row.lowConfidenceFields.join(', ')}
                  </TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Button size="sm" onClick={() => setOpenId(row.id)}>
                      {t('automation.queue.review')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {detail ? (
        <section className="space-y-3 rounded-md border p-4" data-testid="automation-detail">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{detail.proposalType}</h3>
              <p className="text-xs text-muted-foreground">
                {t('automation.detail.noDomainWrite')}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpenId(null)}>
              {t('common.close')}
            </Button>
          </div>

          {/* Yetkili PDF onizlemesi — ham depolama yolu istemcide YOK. */}
          {detail.document ? (
            <a
              href={detail.document.fileDownloadPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs underline"
              data-testid="automation-document-link"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {detail.document.originalName}
            </a>
          ) : null}

          {/* Alanlar: dusuk guven VURGULU, kritik olan ayrica isaretli. */}
          <div className="space-y-2" data-testid="automation-fields">
            {Object.entries(detail.payload).map(([fieldName, value]) => {
              const low = isLowConfidence(detail, fieldName);
              const critical = isCriticalField(detail.proposalType, fieldName);
              return (
                <div
                  key={fieldName}
                  className={`rounded-md border p-2 ${low ? 'border-amber-400 bg-amber-50' : ''}`}
                  data-testid={`automation-field-${fieldName}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">{fieldName}</span>
                    {low ? <Badge variant="secondary">{t('automation.detail.lowConfidence')}</Badge> : null}
                    {critical ? <Badge variant="outline">{t('automation.detail.critical')}</Badge> : null}
                    <span className="text-muted-foreground">
                      {detail.confidence?.[fieldName] !== undefined
                        ? t('automation.detail.confidenceValue', {
                            value: Math.round((detail.confidence[fieldName] ?? 0) * 100),
                          })
                        : t('automation.detail.confidenceUnknown')}
                    </span>
                  </div>
                  <Input
                    className="mt-1 text-xs"
                    defaultValue={String(value ?? '')}
                    onChange={(event) =>
                      setChangedFields((current) => ({
                        ...current,
                        [fieldName]: event.target.value !== String(value ?? ''),
                      }))
                    }
                    data-testid={`automation-input-${fieldName}`}
                  />
                  {low && critical ? (
                    <label className="mt-1 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={verifiedFields[fieldName] ?? false}
                        onChange={(event) =>
                          setVerifiedFields((current) => ({
                            ...current,
                            [fieldName]: event.target.checked,
                          }))
                        }
                        data-testid={`automation-verify-${fieldName}`}
                      />
                      {t('automation.detail.verifiedManually')}
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* UC DURUMLU KONTROLLER */}
          <ul className="space-y-1" data-testid="automation-checks">
            {detail.checks.map((check) => {
              const Icon = TONE_ICON[checkTone(check.status)];
              return (
                <li key={check.code} className="flex items-start gap-2 text-xs">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{t(checkLabelKey(check.status))}</span>{' '}
                    {t(check.messageKey, check.messageKey)}
                    {check.status === 'unknown' && check.unknownReason ? (
                      <span className="block text-muted-foreground">
                        {t('automation.check.unknownReason', { reason: check.unknownReason })}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Denetlenebilir yetki izi */}
          {detail.agentRun ? (
            <p className="text-xs text-muted-foreground" data-testid="automation-agent-run">
              {t('automation.detail.agentRun', {
                connector: detail.agentRun.connector.displayName,
                attempt: detail.agentRun.attempt,
                toolset: detail.agentRun.toolset.length === 0
                  ? t('automation.detail.noTools')
                  : detail.agentRun.toolset.join(', '),
              })}
            </p>
          ) : null}

          {detail.approvalTask?.decidedAt ? (
            <p className="rounded-md border bg-muted/30 p-2 text-xs" data-testid="automation-decided">
              {t('automation.detail.decided', {
                decision: t(`automation.decision.${detail.approvalTask.decision}`),
                name: detail.approvalTask.decidedBy?.fullName ?? '—',
                duration: formatDuration(detail.approvalTask.reviewDurationMs, i18n.language) ?? '—',
              })}
              {isFastDecision(detail.approvalTask.reviewDurationMs) ? (
                <span className="ml-1 font-medium">{t('automation.detail.fastDecision')}</span>
              ) : null}
            </p>
          ) : null}

          {/* Servis faturasi: arac ve kaydedilecek tutar KULLANICININ karari. */}
          {isServiceInvoice ? (
            <ServiceInvoiceFinalization
              detail={detail}
              value={confirmation}
              onChange={setConfirmation}
            />
          ) : null}

          {detail.status === 'pending_review' ? (
            <div className="space-y-2 border-t pt-2" data-testid="automation-decision-form">
              <label className="block text-xs font-medium" htmlFor="automation-rejection">
                {t('automation.detail.rejectionCategory')}
              </label>
              <select
                id="automation-rejection"
                className={FLEET_FILTER_SELECT}
                value={rejectionCategory}
                onChange={(event) =>
                  setRejectionCategory(event.target.value as AutomationRejectionCategory | '')
                }
              >
                <option value="">{t('automation.detail.noRejection')}</option>
                {REJECTION_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(rejectionCategoryKey(category))}
                  </option>
                ))}
              </select>

              <label className="block text-xs font-medium" htmlFor="automation-note">
                {requirement.required
                  ? t('automation.detail.noteRequired', {
                      reason: t(`automation.detail.noteReason.${requirement.reason}`),
                    })
                  : t('automation.detail.noteOptional')}
              </label>
              <textarea
                id="automation-note"
                className="w-full rounded-md border px-2 py-1 text-xs"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                data-testid="automation-note"
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    !!rejectionCategory ||
                    !serviceInvoiceReady ||
                    !canSubmitDecision({ decision: 'approved', note, fields: fieldStates })
                  }
                  onClick={() => decide('approved')}
                  data-testid="automation-approve"
                >
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  {t('automation.detail.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={
                    busy ||
                    !canSubmitDecision({
                      decision: 'rejected',
                      rejectionCategory: rejectionCategory || null,
                      note,
                      fields: fieldStates,
                    })
                  }
                  onClick={() => decide('rejected')}
                  data-testid="automation-reject"
                >
                  {t('automation.detail.reject')}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
