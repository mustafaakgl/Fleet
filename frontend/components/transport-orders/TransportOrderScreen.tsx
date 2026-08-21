'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  Lock,
  Plus,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { transportOrdersApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { canPlanDispatch as roleCanPlanDispatch } from '@/lib/permissions';
import { CreateDispatchProposalAction } from '@/components/dispatch/CreateDispatchProposalAction';
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
  CANCELLATION_CATEGORIES,
  ORDER_STATUSES,
  adrLabelKey,
  adrNeedsAttention,
  amendActionKey,
  billingLabelKey,
  canSubmitCancellation,
  cancellationNoteRequired,
  changeConsignmentIndex,
  changeFieldLabelKey,
  changeIsMasked,
  financialsMasked,
  formatOrderAmount,
  fulfillmentLabelKey,
  fulfillmentTone,
  orderStatusLabelKey,
  orderStatusTone,
  pendingRevision,
  revenueNeedsAttention,
  staleAssignments,
} from '@/lib/transport-order-view';
import type { Tone } from '@/lib/ordivan-view';
import type {
  CancellationImpact,
  TransportOrderDetail,
  TransportOrderRow,
  TransportOrderStatus,
} from '@/lib/types';

const TONE_BADGE: Record<Tone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
};

function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; code?: string };
  return (
    candidate.name === 'AbortError' ||
    candidate.name === 'CanceledError' ||
    candidate.code === 'ERR_CANCELED'
  );
}

function errorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

/**
 * TASIMA SIPARISLERI (Faz 15).
 *
 * TICARI DURUM ILE OPERASYON DURUMU AYRI ROZETLERDE: `confirmed` bir siparis
 * `unplanned` olabilir ve ekran bunu tek bir rozette birlestirmiyor.
 *
 * FINANS ALANLARI SUNUCUDA maskeleniyor; ekran yalnizca "gorme yetkiniz yok"
 * diyor. `financialFieldsMasked` sayesinde bu, "deger girilmemis"ten ayrilir —
 * ikisini ayni gostermek muhasebeye yanlis bilgi verirdi.
 */
export function TransportOrderScreen() {
  const { t } = useTranslation();

  const [rows, setRows] = useState<TransportOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TransportOrderStatus | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransportOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await transportOrdersApi.list(
          {
            ...(status === 'all' ? {} : { status }),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
          signal,
        );
        setRows(result.rows);
      } catch (loadError) {
        // Iptal edilen istek hata DEGIL.
        if (isAbort(loadError)) return;
        setError(t('transportOrders.loadFailed'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [status, from, to, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openDetail = useCallback(
    async (id: string, trigger?: HTMLElement | null) => {
      lastTriggerRef.current = trigger ?? null;
      setSelectedId(id);
      setDetailLoading(true);
      setDetail(null);
      try {
        setDetail(await transportOrdersApi.detail(id));
      } catch {
        setError(t('transportOrders.loadFailed'));
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (detail) detailHeadingRef.current?.focus();
  }, [detail]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    lastTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closeDetail]);

  const refresh = useCallback(async () => {
    if (selectedId) setDetail(await transportOrdersApi.detail(selectedId));
    await load();
  }, [selectedId, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{t('transportOrders.intro')}</p>
        <Button type="button" onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          {t('transportOrders.newOrder')}
        </Button>
      </div>

      {creating ? (
        <TransportOrderForm
          onCancel={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await load();
            await openDetail(id);
          }}
        />
      ) : null}

      {/* ------------------------------ Filtreler ---------------------------- */}
      <section className="flex flex-wrap gap-3" aria-label={t('transportOrders.filters')}>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.filter.status')}</span>
          <select
            className={FLEET_FILTER_SELECT}
            value={status}
            onChange={(event) => setStatus(event.target.value as TransportOrderStatus | 'all')}
          >
            <option value="all">{t('transportOrders.filter.all')}</option>
            {ORDER_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(orderStatusLabelKey(item))}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.filter.from')}</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.filter.to')}</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* -------------------------------- Liste ------------------------------ */}
      {loading ? (
        <p className="text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          {t('common.loading')}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('transportOrders.emptyTitle')}
          subtitle={t('transportOrders.emptyBody')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('transportOrders.column.order')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('transportOrders.column.customer')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('transportOrders.column.date')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('transportOrders.column.status')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('transportOrders.column.fulfillment')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('transportOrders.column.revenue')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  <span className="sr-only">{t('transportOrders.column.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {rows.map((row) => {
                const amount = formatOrderAmount(
                  row.contractedRevenue,
                  row.currency,
                  financialsMasked(row),
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                      {row.orderNumber}
                      {row.externalReference ? (
                        <span className="ml-2 text-xs text-slate-500">{row.externalReference}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{row.company.name}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {new Date(row.orderDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {/* TICARI durum */}
                      <Badge variant={TONE_BADGE[orderStatusTone(row.status)]}>
                        {t(orderStatusLabelKey(row.status))}
                      </Badge>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {/* OPERASYON durumu — ticari durumdan AYRI rozet */}
                      <Badge variant={TONE_BADGE[fulfillmentTone(row.fulfillment)]}>
                        {t(fulfillmentLabelKey(row.fulfillment))}
                      </Badge>
                      {row.staleAssignmentCount > 0 ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {t('transportOrders.staleShort', { count: row.staleAssignmentCount })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {amount.kind === 'masked' ? (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Lock className="h-3 w-3" aria-hidden />
                          {t('transportOrders.financialsHidden')}
                        </span>
                      ) : amount.kind === 'empty' ? (
                        <span className="text-slate-400">{t('transportOrders.noRevenue')}</span>
                      ) : (
                        amount.text
                      )}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => void openDetail(row.id, event.currentTarget)}
                      >
                        {t('transportOrders.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* -------------------------------- Detay ------------------------------ */}
      {selectedId ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-heading"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          {detailLoading || !detail ? (
            <p className="text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : (
            <TransportOrderDetailPanel
              detail={detail}
              headingRef={detailHeadingRef}
              onClose={closeDetail}
              onChanged={refresh}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Manuel siparis formu — birden fazla kalem. */
function TransportOrderForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [consignments, setConsignments] = useState([
    { pickupAddress: '', deliveryAddress: '', cargoDescription: '' },
  ]);

  const submit = useCallback(
    async (acknowledgeDuplicateReference = false) => {
      setBusy(true);
      setError(null);
      try {
        const created = await transportOrdersApi.create({
          companyId,
          orderNumber,
          externalReference: externalReference || undefined,
          orderDate: new Date(orderDate).toISOString(),
          consignments,
          ...(acknowledgeDuplicateReference ? { acknowledgeDuplicateReference: true } : {}),
        });
        await onCreated(created.id);
      } catch (submitError) {
        const code = errorCode(submitError);
        setError(
          code
            ? t(`transportOrders.error.${code}`, t('transportOrders.createFailed'))
            : t('transportOrders.createFailed'),
        );
      } finally {
        setBusy(false);
      }
    },
    [companyId, orderNumber, externalReference, orderDate, consignments, onCreated, t],
  );

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      aria-label={t('transportOrders.newOrder')}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-sm font-semibold text-slate-900">{t('transportOrders.newOrder')}</h2>
      {/* FINANS ALANLARI FORMDA YOK: para birimi ve tutar yalnizca finansal
          rollerin duzenleyebilecegi alanlar ve sunucu bunu ayrica dogruluyor. */}
      <p className="text-xs text-slate-500">{t('transportOrders.financialHint')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.field.companyId')}</span>
          <Input value={companyId} onChange={(event) => setCompanyId(event.target.value)} required />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.field.orderNumber')}</span>
          <Input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {t('transportOrders.field.externalReference')}
          </span>
          <Input
            value={externalReference}
            onChange={(event) => setExternalReference(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('transportOrders.field.orderDate')}</span>
          <Input
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
            required
          />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-800">
          {t('transportOrders.consignments')}
        </legend>
        {consignments.map((item, index) => (
          <div key={index} className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t('transportOrders.field.pickupAddress')}
              </span>
              <Input
                value={item.pickupAddress}
                onChange={(event) =>
                  setConsignments((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, pickupAddress: event.target.value } : row,
                    ),
                  )
                }
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t('transportOrders.field.deliveryAddress')}
              </span>
              <Input
                value={item.deliveryAddress}
                onChange={(event) =>
                  setConsignments((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, deliveryAddress: event.target.value } : row,
                    ),
                  )
                }
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t('transportOrders.field.cargoDescription')}
              </span>
              <Input
                value={item.cargoDescription}
                onChange={(event) =>
                  setConsignments((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, cargoDescription: event.target.value } : row,
                    ),
                  )
                }
                required
              />
            </label>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setConsignments((current) => [
              ...current,
              { pickupAddress: '', deliveryAddress: '', cargoDescription: '' },
            ])
          }
        >
          {t('transportOrders.addConsignment')}
        </Button>
      </fieldset>

      {error ? (
        <div role="alert" className="space-y-2 text-sm text-red-700">
          <p>{error}</p>
          {errorIsDuplicate(error, t) ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void submit(true)}>
              {t('transportOrders.createAnyway')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('transportOrders.createDraft')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function errorIsDuplicate(message: string, t: (key: string) => string): boolean {
  return message === t('transportOrders.error.transport_order_duplicate_reference');
}

/** Detay paneli — kalemler, gorevler, revizyon gecmisi, iptal. */
function TransportOrderDetailPanel({
  detail,
  headingRef,
  onClose,
  onChanged,
}: {
  detail: TransportOrderDetail;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<CancellationImpact | null>(null);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  /**
   * Planlama bir OPERASYON yazma yetkisi: muhasebe siparisi ve fiyatini gorur
   * ama plan ACAMAZ. Sunucuda `@RequiresWrite()` ayni kisiti tasiyor; ikisi
   * birlikte degismeli, yoksa arayuz dugme acar ve kullanici 403 alir.
   */
  const canPlanDispatch = roleCanPlanDispatch(getUser()?.role ?? 'customer');

  const masked = financialsMasked(detail);
  const pending = pendingRevision(detail);
  const stale = staleAssignments(detail);
  const amount = formatOrderAmount(detail.contractedRevenue, detail.currency, masked);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await onChanged();
      } catch (actionError) {
        const code = errorCode(actionError);
        setError(
          code
            ? t(`transportOrders.error.${code}`, t('transportOrders.actionFailed'))
            : t('transportOrders.actionFailed'),
        );
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  const loadImpact = useCallback(async () => {
    setImpact(await transportOrdersApi.cancellationImpact(detail.id));
  }, [detail.id]);

  const canCancel = useMemo(
    () =>
      canSubmitCancellation({
        category,
        note,
        requiresConfirmation: impact?.requiresConfirmation ?? false,
        acknowledged,
      }),
    [category, note, impact, acknowledged],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2
          id="order-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-slate-900"
        >
          {detail.orderNumber}
          <span className="ml-2 text-sm font-normal text-slate-500">{detail.company.name}</span>
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant={TONE_BADGE[orderStatusTone(detail.status)]}>
          {t(orderStatusLabelKey(detail.status))}
        </Badge>
        <Badge variant={TONE_BADGE[fulfillmentTone(detail.fulfillment)]}>
          {t(fulfillmentLabelKey(detail.fulfillment))}
        </Badge>
        <Badge variant="outline">
          {t('transportOrders.revisionBadge', { number: detail.currentRevision })}
        </Badge>
      </div>

      {/* --------------------- Faturalama modu ve POD notu -------------------- */}
      <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-medium">
          {masked
            ? t('transportOrders.financialsHidden')
            : t(`transportOrders.billingMode.${detail.billingMode}`)}
        </p>
        <p className="mt-1">{t(billingLabelKey(detail.billing))}</p>
        {/* POD BAGLANMADI: ekran bunu GIZLEMIYOR, aciklikla yaziyor. */}
        {!detail.billing.deliveryVerificationAvailable ? (
          <p className="mt-1 text-xs">{t('transportOrders.podNotConnected')}</p>
        ) : null}
      </div>

      {/* --------------- Faz 17: planlama onerisi olusturma ------------------- */}
      <CreateDispatchProposalAction
        transportOrderId={detail.id}
        orderStatus={detail.status}
        canPlan={canPlanDispatch}
      />

      {/* ------------------------------ Finans ------------------------------- */}
      <div className="rounded border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">{t('transportOrders.commercial')}</h3>
        {amount.kind === 'masked' ? (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
            <Lock className="h-4 w-4" aria-hidden />
            {t('transportOrders.financialsHiddenHint')}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-700">
              {amount.kind === 'empty' ? t('transportOrders.noRevenue') : amount.text}
            </p>
            {detail.revenueAllocation ? (
              <p
                className={`mt-1 text-xs ${
                  revenueNeedsAttention(detail.revenueAllocation)
                    ? 'text-amber-700'
                    : 'text-slate-500'
                }`}
              >
                {t('transportOrders.allocation', {
                  allocated: detail.revenueAllocation.allocated,
                  remaining: detail.revenueAllocation.remaining ?? '—',
                  missing: detail.revenueAllocation.assignmentsWithoutRevenue,
                })}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* ------------------------------ Kalemler ----------------------------- */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t('transportOrders.consignments')}</h3>
        <ul className="mt-2 space-y-2">
          {detail.consignments.map((item) => (
            <li key={item.id} className="rounded border border-slate-200 p-2 text-sm">
              <span className="font-medium">#{item.sequence}</span> {item.pickupAddress} →{' '}
              {item.deliveryAddress}
              <span className="ml-2 text-slate-500">{item.cargoDescription}</span>
              <Badge
                variant={adrNeedsAttention(item.adrStatus) ? 'secondary' : 'outline'}
                className="ml-2"
              >
                {t(adrLabelKey(item.adrStatus))}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------ Gorevler ----------------------------- */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t('transportOrders.assignments')}</h3>
        {detail.assignments.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t('transportOrders.noAssignments')}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {detail.assignments.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <a className="text-blue-700 underline" href={`/assignments?id=${item.id}`}>
                  {new Date(item.workDate).toLocaleDateString()}
                </a>
                <Badge variant="outline">{item.status}</Badge>
                {item.staleAgainstOrder ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {t('transportOrders.staleAssignment', {
                      revision: item.sourceRevision ?? '—',
                      current: detail.currentRevision,
                    })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {stale.length > 0 ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            {t('transportOrders.staleHint', { count: stale.length })}
          </p>
        ) : null}
      </div>

      {/* ------------------------- Bekleyen degisiklik ------------------------ */}
      {pending ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <h3 className="text-sm font-semibold text-amber-900">
            {t('transportOrders.pendingAmendment', { number: pending.revisionNumber })}
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {(pending.changedFields ?? []).map((change, index) => (
              <li key={`${change.field}-${index}`}>
                {changeConsignmentIndex(change.field) ? (
                  <span className="mr-1 text-xs">
                    {t('transportOrders.consignmentNo', {
                      number: changeConsignmentIndex(change.field),
                    })}
                  </span>
                ) : null}
                <span className="font-medium">{t(changeFieldLabelKey(change.field), change.field)}</span>
                {': '}
                {changeIsMasked(change) ? (
                  <span className="text-slate-500">{t('transportOrders.financialsHidden')}</span>
                ) : (
                  <>
                    <span className="line-through">{String(change.before ?? '—')}</span>
                    {' → '}
                    <span className="font-medium">{String(change.after ?? '—')}</span>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  transportOrdersApi.approveAmendment(detail.id, pending.id, detail.updatedAt),
                )
              }
            >
              {t('transportOrders.approveAmendment')}
            </Button>
            <label className="min-w-[14rem] flex-1 text-sm">
              <span className="mb-1 block text-amber-900">{t('transportOrders.rejectReason')}</span>
              <Input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy || rejectReason.trim().length < 5}
              onClick={() =>
                void run(() =>
                  transportOrdersApi.rejectAmendment(detail.id, pending.id, rejectReason),
                )
              }
            >
              {t('transportOrders.rejectAmendment')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------- Revizyonlar ---------------------------- */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          <History className="mr-2 inline h-4 w-4" aria-hidden />
          {t('transportOrders.revisionHistory')}
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {detail.revisions.map((revision) => (
            <li key={revision.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">#{revision.revisionNumber}</span>
              <Badge variant="outline">{t(`transportOrders.revision.${revision.status}`)}</Badge>
              <span className="text-slate-500">
                {new Date(revision.createdAt).toLocaleString()}
              </span>
              {revision.rejectionReason ? (
                <span className="text-xs text-slate-500">{revision.rejectionReason}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------ Aksiyonlar --------------------------- */}
      <div className="flex flex-wrap gap-2">
        {detail.status === 'draft' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run(() => transportOrdersApi.confirm(detail.id, detail.updatedAt))}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            {t('transportOrders.confirm')}
          </Button>
        ) : null}
        <span className="text-xs text-slate-500 self-center">
          {t(amendActionKey(detail.status))}
        </span>
      </div>

      {/* -------------------------------- Iptal ------------------------------ */}
      {detail.status !== 'cancelled' ? (
        <div className="rounded border border-slate-300 p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            <XCircle className="mr-2 inline h-4 w-4" aria-hidden />
            {t('transportOrders.cancelOrder')}
          </h3>

          {!impact ? (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void loadImpact()}>
              {t('transportOrders.showImpact')}
            </Button>
          ) : (
            <div className="mt-2 space-y-2 text-sm">
              {/* IPTAL HICBIR KAYDI SILMEZ — ekran bunu acikca yaziyor. */}
              <p className="rounded bg-slate-50 p-2">
                {t('transportOrders.impactSummary', {
                  assignments: impact.assignmentCount,
                  active: impact.activeAssignmentCount,
                  tours: impact.releasedTourCount,
                })}
              </p>
              <p className="text-xs text-slate-600">{t('transportOrders.cancelKeepsRecords')}</p>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('transportOrders.cancelReason')}</span>
                <select
                  className={FLEET_FILTER_SELECT}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">{t('transportOrders.selectReason')}</option>
                  {CANCELLATION_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {t(`transportOrders.cancelCategory.${item}`)}
                    </option>
                  ))}
                </select>
              </label>

              {cancellationNoteRequired(category) ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('transportOrders.cancelNote')}</span>
                  <Input value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
              ) : null}

              {impact.requiresConfirmation ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  {t('transportOrders.acknowledgeImpact')}
                </label>
              ) : null}

              <Button
                type="button"
                variant="outline"
                disabled={busy || !canCancel}
                onClick={() =>
                  void run(() =>
                    transportOrdersApi.cancel(detail.id, {
                      expectedUpdatedAt: detail.updatedAt,
                      category,
                      note: note || undefined,
                      acknowledgeImpact: acknowledged,
                    }),
                  )
                }
              >
                {t('transportOrders.cancelOrder')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {t('transportOrders.cancelledWith', {
            category: detail.cancellation?.category
              ? t(`transportOrders.cancelCategory.${detail.cancellation.category}`)
              : '—',
          })}
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
