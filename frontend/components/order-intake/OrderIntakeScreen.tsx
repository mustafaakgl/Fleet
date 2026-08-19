'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Copy,
  FileText,
  HelpCircle,
  Loader2,
  Mail,
  Paperclip,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { orderIntakeApi } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-errors';
import { FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import {
  INTENT_FILTERS,
  channelLabelKey,
  fieldLabelKey,
  intentLabelKey,
  intentTone,
  isLowConfidence,
  matchLabelKey,
  operationalFields,
  rejectionLabelKey,
  taskLabelKey,
  type IntentFilter,
} from '@/lib/order-intake-view';
import type {
  OrderIntakeMessageDetail,
  OrderIntakeMessageRow,
  OrderIntakeTask,
} from '@/lib/types';

/**
 * SIPARIS GELEN KUTUSU (Faz 16).
 *
 * EKRAN HICBIR SEYE KARAR VERMEZ. Niyet, musteri/siparis eslestirmesi ve alan
 * maskelemesi SUNUCUDA belirlenir; burada yalnizca gosterilir. Ekranda bir
 * alani gizlemek ya da bir dugmeyi saklamak bir guvenlik onlemi DEGILDIR —
 * ayni ucu `curl` ile cagiran biri icin hicbir sey degismez.
 *
 * KAYNAK ONIZLEMESI GUVENLI: `bodyHtml` sunucuda sanitize edilmis olarak
 * SAKLANIYOR (script, uzak gorsel, tiklanabilir link yok) ve ham HTML hicbir
 * zaman doner. Yine de burada `dangerouslySetInnerHTML` KULLANILMIYOR —
 * ikinci bir savunma katmani olarak duz metin gosteriliyor; ham belgeyi
 * gormek isteyen yetkili rol dosyayi indirir.
 */

type Feedback = { tone: 'success' | 'error'; text: string } | null;

export function OrderIntakeScreen() {
  const { t } = useTranslation();

  const [rows, setRows] = useState<OrderIntakeMessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [intent, setIntent] = useState<IntentFilter>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderIntakeMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<Record<string, unknown> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await orderIntakeApi.list(
          intent === 'all' ? {} : { intent },
          signal,
        );
        setRows(result.items);
        setTotal(result.total);
      } catch (error) {
        if (!signal?.aborted) {
          setFeedback({ tone: 'error', text: getApiErrorMessage(error, 'orderIntake.errors.load') });
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [intent],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  const loadDetail = useCallback(async (messageId: string) => {
    setDetailLoading(true);
    setImpact(null);
    try {
      setDetail(await orderIntakeApi.detail(messageId));
    } catch (error) {
      setFeedback({ tone: 'error', text: getApiErrorMessage(error, 'orderIntake.errors.load') });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openMessage = useCallback(
    (messageId: string) => {
      setSelectedId(messageId);
      void loadDetail(messageId);
      // ODAK YONETIMI: liste satirindan ayrintiya gecerken odak da tasiniyor,
      // yoksa klavye kullanicisi listenin basina donerdi.
      window.requestAnimationFrame(() => detailRef.current?.focus());
    },
    [loadDetail],
  );

  const onUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      setFeedback(null);
      try {
        const result = await orderIntakeApi.upload(file);
        setFeedback({
          tone: 'success',
          text: result.duplicate ? t('orderIntake.upload.duplicate') : t('orderIntake.upload.done'),
        });
        await loadList();
        openMessage(result.messageId);
      } catch (error) {
        setFeedback({ tone: 'error', text: getApiErrorMessage(error, 'orderIntake.errors.upload') });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [loadList, openMessage, t],
  );

  const review = detail?.review ?? null;
  const proposed = detail?.proposed ?? null;
  const payload = (proposed?.payload ?? {}) as Record<string, unknown>;
  const confidence = proposed?.confidence ?? {};

  const resolvedIntent = review?.resolvedIntent ?? review?.proposedIntent ?? 'unknown';
  const requiresOrderSelection = review?.orderCandidates?.requiresOrderSelection === true;
  const selectedOrder = review?.selectedOrder ?? review?.matchedOrder ?? null;
  const selectedCompany = review?.selectedCompany ?? review?.matchedCompany ?? null;

  const tasks = useMemo<OrderIntakeTask[]>(() => review?.tasks ?? [], [review]);
  const openTasks = tasks.filter((task) => task.status === 'open');

  const canApprove =
    review?.status === 'open' &&
    resolvedIntent !== 'unknown' &&
    openTasks.length === 0 &&
    (resolvedIntent === 'new_order' ? Boolean(selectedCompany) : Boolean(selectedOrder));

  const runAction = useCallback(
    async (action: () => Promise<string>) => {
      setBusy(true);
      setFeedback(null);
      try {
        setFeedback({ tone: 'success', text: await action() });
        await loadList();
        if (selectedId) await loadDetail(selectedId);
      } catch (error) {
        setFeedback({ tone: 'error', text: getApiErrorMessage(error, 'orderIntake.errors.action') });
      } finally {
        setBusy(false);
      }
    },
    [loadDetail, loadList, selectedId],
  );

  return (
    <div className="space-y-6">
      {/* ---------------- Yukleme ---------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">{t('orderIntake.upload.title')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('orderIntake.upload.hint')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".eml,message/rfc822,application/pdf"
            aria-label={t('orderIntake.upload.field')}
            disabled={uploading}
            onChange={(event) => void onUpload(event.target.files?.[0])}
            className="sm:max-w-md"
          />
          {uploading ? (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('orderIntake.upload.busy')}
            </span>
          ) : (
            <Upload className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
          )}
        </div>
      </section>

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border p-3 text-sm ${
            feedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {/* ---------------- Niyet filtreleri ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="order-intake-intent" className="text-sm font-medium text-slate-700">
          {t('orderIntake.filter.label')}
        </label>
        <select
          id="order-intake-intent"
          className={FLEET_FILTER_SELECT}
          value={intent}
          onChange={(event) => setIntent(event.target.value as IntentFilter)}
        >
          {INTENT_FILTERS.map((value) => (
            <option key={value} value={value}>
              {t(intentLabelKey(value))}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{t('orderIntake.filter.count', { count: total })}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* ---------------- Mesaj listesi ---------------- */}
        <section aria-label={t('orderIntake.list.title')} className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('common.loading')}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={t('orderIntake.list.emptyTitle')}
              subtitle={t('orderIntake.list.emptyBody')}
            />
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const rowIntent = row.review?.proposedIntent ?? 'unknown';
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openMessage(row.id)}
                      aria-current={selectedId === row.id}
                      className={`w-full rounded-lg border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        selectedId === row.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={intentTone(rowIntent)}>{t(intentLabelKey(rowIntent))}</Badge>
                        {row.review?.possibleDuplicate ? (
                          <Badge variant="destructive" className="gap-1">
                            <Copy className="h-3 w-3" aria-hidden />
                            {t('orderIntake.duplicate.badge')}
                          </Badge>
                        ) : null}
                        {row.attachmentCount > 0 ? (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Paperclip className="h-3 w-3" aria-hidden />
                            {row.attachmentCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">
                        {row.subject ?? t('orderIntake.masked.subject')}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {row.fromDisplayName ?? row.fromAddress ?? t(channelLabelKey(row.channel))}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------------- Ayrinti ---------------- */}
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label={t('orderIntake.detail.title')}
          className="rounded-lg border border-slate-200 bg-white p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {detailLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('common.loading')}
            </div>
          ) : !detail ? (
            <EmptyState
              icon={FileText}
              title={t('orderIntake.detail.emptyTitle')}
              subtitle={t('orderIntake.detail.emptyBody')}
            />
          ) : (
            <div className="space-y-5">
              {/* Zarf ozeti */}
              <header className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  {detail.subject ?? t('orderIntake.masked.subject')}
                </h2>
                <p className="text-sm text-slate-600">
                  {detail.fromDisplayName ? `${detail.fromDisplayName} · ` : ''}
                  {detail.fromAddress ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  {t(channelLabelKey(detail.channel))}
                  {detail.mailbox ? ` · ${detail.mailbox}` : ''}
                </p>
                {/* GONDEREN YETKI DEGILDIR — ekranda da acikca soyluyoruz. */}
                <p className="text-xs text-amber-700">{t('orderIntake.detail.senderNotAuthority')}</p>
              </header>

              {/* Duplicate uyarisi */}
              {review?.possibleDuplicate ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="flex items-center gap-2 font-medium">
                    <Copy className="h-4 w-4" aria-hidden />
                    {t('orderIntake.duplicate.title')}
                  </p>
                  <p className="mt-1">
                    {t('orderIntake.duplicate.body', {
                      orderNumber: review.duplicateOfOrder?.orderNumber ?? '—',
                    })}
                  </p>
                </div>
              ) : null}

              {/* Guvenli kaynak onizlemesi */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t('orderIntake.preview.title')}
                </h3>
                <p className="text-xs text-slate-500">{t('orderIntake.preview.safeNote')}</p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
                  {detail.bodyText ?? t('orderIntake.masked.body')}
                </pre>
                {detail.rawDocumentAvailable ? null : (
                  <p className="mt-1 text-xs text-slate-500">{t('orderIntake.masked.rawDocument')}</p>
                )}
              </div>

              {/* Ekler */}
              {detail.attachments.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t('orderIntake.attachments.title')}
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {detail.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Paperclip className="h-3 w-3 text-slate-400" aria-hidden />
                        <span className="text-slate-700">{attachment.fileName}</span>
                        {attachment.rejectionCode ? (
                          <Badge variant="destructive">
                            {t(rejectionLabelKey(attachment.rejectionCode))}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('orderIntake.attachments.accepted')}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Kontroller — enjeksiyon isareti dahil */}
              {proposed?.checks?.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t('orderIntake.checks.title')}
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {proposed.checks.map((check) => (
                      <li key={check.code} className="flex items-center gap-2 text-sm">
                        {check.status === 'verified' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                        ) : check.status === 'failed' ? (
                          <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden />
                        ) : (
                          <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden />
                        )}
                        <span className="text-slate-700">{t(`orderIntake.checkCodes.${check.code}`)}</span>
                        <span className="text-xs text-slate-500">
                          {t(`orderIntake.checkStatus.${check.status}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Cikarilan alanlar + kanit */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {t('orderIntake.fields.title')}
                </h3>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {operationalFields(payload).map(({ field, value }) => {
                    const score = confidence[field];
                    const low = isLowConfidence(score);
                    return (
                      <div key={field} className="rounded border border-slate-200 p-2">
                        <dt className="text-xs font-medium text-slate-500">{t(fieldLabelKey(field))}</dt>
                        <dd className="flex items-center gap-2 text-sm text-slate-900">
                          {value === null ? t('orderIntake.fields.absent') : value}
                          {low ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {t('orderIntake.fields.lowConfidence')}
                            </Badge>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>

              {proposed?.evidence?.entries?.length ? (
                <details className="rounded border border-slate-200 p-2">
                  <summary className="cursor-pointer text-sm font-medium text-slate-800">
                    {t('orderIntake.evidence.title')}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {proposed.evidence.entries.map((entry, index) => (
                      <li key={`${entry.field}-${index}`}>
                        <span className="font-medium">{t(fieldLabelKey(entry.field))}</span>{' '}
                        <span className="text-slate-400">({entry.source})</span>{' '}
                        {entry.snippet ?? t('orderIntake.evidence.masked')}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {/* Eslestirme */}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-500">{t('orderIntake.match.company')}</p>
                  <p className="text-sm text-slate-900">
                    {selectedCompany?.name ?? t('orderIntake.match.none')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t(matchLabelKey('company', review?.companyMatchStatus))}
                  </p>
                </div>
                <div className="rounded border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-500">{t('orderIntake.match.order')}</p>
                  <p className="text-sm text-slate-900">
                    {selectedOrder?.orderNumber ?? t('orderIntake.match.none')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t(matchLabelKey('order', review?.orderMatchStatus))}
                  </p>
                </div>
              </div>

              {requiresOrderSelection ? (
                <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                  {t('orderIntake.match.selectionRequired')}
                </p>
              ) : null}

              {/* Inceleme gorevleri */}
              {tasks.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t('orderIntake.tasks.title')}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {tasks.map((task) => (
                      <li
                        key={task.sequence}
                        className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2"
                      >
                        <span className="text-sm text-slate-800">{t(taskLabelKey(task.sequence))}</span>
                        {task.status === 'decided' ? (
                          <Badge variant={task.decision === 'approved' ? 'default' : 'destructive'}>
                            {t(`orderIntake.tasks.${task.decision ?? 'open'}`)}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !review}
                            onClick={() =>
                              void runAction(async () => {
                                await orderIntakeApi.decideTask(review!.id, task.sequence, 'approved');
                                return t('orderIntake.tasks.decided');
                              })
                            }
                          >
                            {t('orderIntake.tasks.approve')}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Iptal etkisi */}
              {resolvedIntent === 'cancellation' && selectedOrder ? (
                <div className="rounded border border-slate-200 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {t('orderIntake.cancellation.title')}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !review}
                      onClick={() =>
                        void (async () => {
                          try {
                            setImpact(await orderIntakeApi.cancellationImpact(review!.id));
                          } catch (error) {
                            setFeedback({
                              tone: 'error',
                              text: getApiErrorMessage(error, 'orderIntake.errors.action'),
                            });
                          }
                        })()
                      }
                    >
                      {t('orderIntake.cancellation.preview')}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t('orderIntake.cancellation.note')}</p>
                  {impact ? (
                    <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                      {JSON.stringify(impact, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}

              {/* Sonuc baglantisi */}
              {review?.resultTransportOrderId ? (
                <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
                  {t('orderIntake.result.draft')}
                </p>
              ) : null}
              {review?.resultTransportOrderRevisionId ? (
                <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
                  {t('orderIntake.result.revision')}
                </p>
              ) : null}

              {/* Karar */}
              {review?.status === 'open' ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <Button
                    disabled={!canApprove || busy}
                    onClick={() =>
                      void runAction(async () => {
                        const result = await orderIntakeApi.approve(review.id, {
                          intent: resolvedIntent as 'new_order' | 'amendment' | 'cancellation',
                          companyId: selectedCompany?.id,
                          orderId: selectedOrder?.id,
                          expectedUpdatedAt: selectedOrder?.updatedAt,
                          values: payload,
                          acknowledgeDuplicate: review.possibleDuplicate,
                        });
                        return result.transportOrderId
                          ? t('orderIntake.result.draft')
                          : t('orderIntake.result.saved');
                      })
                    }
                  >
                    {t('orderIntake.actions.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void runAction(async () => {
                        await orderIntakeApi.reject(review.id, t('orderIntake.actions.rejectReason'));
                        return t('orderIntake.actions.rejected');
                      })
                    }
                  >
                    <XCircle className="mr-1 h-4 w-4" aria-hidden />
                    {t('orderIntake.actions.reject')}
                  </Button>
                  {!canApprove ? (
                    <p className="w-full text-xs text-slate-500">
                      {resolvedIntent === 'unknown'
                        ? t('orderIntake.actions.blockedUnknown')
                        : openTasks.length > 0
                          ? t('orderIntake.actions.blockedTasks')
                          : t('orderIntake.actions.blockedSelection')}
                    </p>
                  ) : null}
                </div>
              ) : review ? (
                <p className="flex items-center gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
                  <CircleSlash className="h-4 w-4" aria-hidden />
                  {t(`orderIntake.reviewStatus.${review.status}`)}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
