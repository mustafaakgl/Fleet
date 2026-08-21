'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  RefreshCw,
  Route,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dispatchApi } from '@/lib/api';
import { showToast } from '@/lib/toast';
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
  blockingChecks,
  canApplyCandidate,
  checkLabelKey,
  checkStatusLabelKey,
  checkTone,
  checksNeedingData,
  checksNeedingDeclaration,
  createDecisionKey,
  decisionLabelKey,
  decisionTone,
  dispatchErrorKey,
  displayNumber,
  formatDurationMinutes,
  generationLabelKey,
  generationTone,
  isRouteEstimated,
  isStaleDecisionError,
  proposalStatusLabelKey,
  proposalStatusTone,
  reasonLabelKey,
  routeTone,
  type DeclarationDraft,
  type Tone,
} from '@/lib/dispatch-view';
import { OverrideDeclarationDialog } from './OverrideDeclarationDialog';
import type {
  DispatchCandidateView,
  DispatchCheckView,
  DispatchGeneration,
  DispatchProposalDetail,
  DispatchProposalRow,
  DispatchProposalStatus,
  DispatchTourView,
} from '@/lib/types';

/**
 * Harita YALNIZCA ISTEMCIDE: Leaflet `window`a dokunuyor ve sunucuda
 * render edilirse acilista patlar.
 */
const DispatchRouteMap = dynamic(
  () => import('./DispatchRouteMap').then((module) => module.DispatchRouteMap),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

const TONE_BADGE: Record<Tone, 'success' | 'warning' | 'destructive' | 'outline'> = {
  positive: 'success',
  warning: 'warning',
  danger: 'destructive',
  neutral: 'outline',
};

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: HelpCircle,
};

const STATUS_FILTERS: Array<DispatchProposalStatus | 'all'> = [
  'open',
  'approved',
  'rejected',
  'superseded',
  'expired',
  'all',
];

const GENERATION_FILTERS: Array<DispatchGeneration | 'all'> = [
  'all',
  'queued',
  'processing',
  'ready',
  'failed',
  'expired',
];

/** Uretim bitmemisken kuyrugu tazeleme araligi. */
const POLL_MS = 4000;

/**
 * DISPATCH KUYRUGU (Faz 17g).
 *
 * FINANS ISTEMCIDE GIZLENMIYOR — SUNUCUDAN ZATEN GELMIYOR. Office
 * kullanicisinda `contractedRevenue`, `currency` ve `plannedTollCents`
 * `null` gelir ve `financialFieldsMasked` bayragi acikti. Ekran o bayraga
 * gore "gorme yetkiniz yok" diyor; degeri alip CSS ile saklamak, ayni ucu
 * `curl` ile cagirana hicbir sey yapmazdi.
 *
 * UYGUNLUK ISTEMCIDE HESAPLANMIYOR: `eligible/blocked/review_required`
 * kararini sunucu veriyor. Burada yapilan tek sey, o karari dogru gostermek
 * ve sunucunun REDDEDECEGI bir eylemi mumkun gostermemek.
 *
 * ARAC/SURUCU DEGISINCE UYGUNLUK YENIDEN: her aday KENDI kontrol listesini
 * tasiyor. Baska bir aday secildiginde ekranda o adayin kontrolleri, kendi
 * engelleri ve kendi beyan ihtiyaci gorunuyor; onceki adayin beyanlari
 * TASINMIYOR — sunucudaki kapsam dogrulamasi da zaten tasinmasina izin
 * vermezdi.
 *
 * EKSIK ALANA DAYANIKLI: `null` gelen her deger "dogrulanamadi" olarak
 * gosteriliyor, "0" ya da "-" olarak DEGIL.
 */
export function DispatchQueueScreen() {
  const { t, i18n } = useTranslation();

  const [status, setStatus] = useState<DispatchProposalStatus | 'all'>('open');
  const [generation, setGeneration] = useState<DispatchGeneration | 'all'>('all');
  const [rows, setRows] = useState<DispatchProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErrorKey, setListErrorKey] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DispatchProposalDetail | null>(null);
  const [candidates, setCandidates] = useState<DispatchCandidateView[]>([]);
  const [tour, setTour] = useState<DispatchTourView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErrorKey, setDetailErrorKey] = useState<string | null>(null);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DeclarationDraft>>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionErrorKey, setDecisionErrorKey] = useState<string | null>(null);

  const listAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  /**
   * KARAR ANAHTARI KARAR BASINA URETILIYOR, TIKLAMA BASINA DEGIL.
   *
   * Ag hatasi sonrasi yeniden deneme AYNI anahtari tasimali: sunucu ayni
   * anahtari gorunce mevcut sonucu doner. Her tiklamada yeni anahtar
   * uretseydik, ikinci deneme "baskasi karar verdi" hatasi alirdi.
   */
  const decisionKey = useRef<{ approve: string | null; reject: string | null }>({
    approve: null,
    reject: null,
  });

  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language],
  );

  const loadList = useCallback(async () => {
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setListErrorKey(null);
    try {
      const page = await dispatchApi.listProposals(
        {
          status: status === 'all' ? undefined : status,
          generation: generation === 'all' ? undefined : generation,
          pageSize: 50,
        },
        controller.signal,
      );
      setRows(page.rows);
    } catch (error) {
      if (controller.signal.aborted) return;
      setListErrorKey(dispatchErrorKey(error, 'dispatch.error.loadList'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [generation, status]);

  useEffect(() => {
    setLoading(true);
    void loadList();
    return () => listAbort.current?.abort();
  }, [loadList]);

  /**
   * URETIM BITMEDIYSE KUYRUK TAZELENIYOR.
   *
   * `queued`/`processing` bir ARA durum: worker bitirince `ready` olur.
   * Kullaniciyi F5'e mecbur birakmak, planlama ekraninda "bir sey oluyor mu"
   * belirsizligi yaratirdi. Bitmis kuyrukta zamanlayici KURULMUYOR.
   */
  const hasPending = useMemo(
    () => rows.some((row) => row.generation === 'queued' || row.generation === 'processing'),
    [rows],
  );

  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setInterval(() => void loadList(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasPending, loadList]);

  const loadDetail = useCallback(async (id: string) => {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setDetailLoading(true);
    setDetailErrorKey(null);
    setDecisionErrorKey(null);
    try {
      const [proposal, candidateList] = await Promise.all([
        dispatchApi.detail(id, controller.signal),
        dispatchApi.candidates(id, controller.signal),
      ]);
      setDetail(proposal);
      setCandidates(candidateList);
      setSelectedCandidateId(
        candidateList.find((candidate) => candidate.selected)?.id ?? candidateList[0]?.id ?? null,
      );
      setDrafts({});

      // Uygulanmis plan: tur bagi ayri bir uctan. 404 "henuz uygulanmadi"
      // demektir ve bir HATA DEGILDIR.
      if (proposal.resultTourId) {
        try {
          setTour(await dispatchApi.resultTour(id, controller.signal));
        } catch {
          setTour(null);
        }
      } else {
        setTour(null);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setDetailErrorKey(dispatchErrorKey(error, 'dispatch.error.loadDetail'));
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }, []);

  const openProposal = useCallback(
    (id: string) => {
      setOpenId(id);
      decisionKey.current = { approve: null, reject: null };
      setRejectReason('');
      void loadDetail(id);
    },
    [loadDetail],
  );

  const closeProposal = useCallback(() => {
    detailAbort.current?.abort();
    setOpenId(null);
    setDetail(null);
    setCandidates([]);
    setTour(null);
    setDrafts({});
  }, []);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId],
  );

  const pendingDeclarations = useMemo(
    () => (selectedCandidate ? checksNeedingDeclaration(selectedCandidate.checks) : []),
    [selectedCandidate],
  );

  const applicable = useMemo(
    () => (selectedCandidate ? canApplyCandidate(selectedCandidate.checks, drafts) : false),
    [drafts, selectedCandidate],
  );

  /** Aday degisince ONCEKI beyanlar DUSUYOR — kapsam tasinmaz. */
  const chooseCandidate = useCallback((candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setDrafts({});
    setDecisionErrorKey(null);
  }, []);

  const submitApproval = useCallback(async () => {
    if (!detail || !selectedCandidate || busy) return;
    if (!selectedCandidate.vehicleId || !selectedCandidate.driverId) return;

    setBusy(true);
    setDecisionErrorKey(null);
    decisionKey.current.approve ??= createDecisionKey('approve', detail.id);

    const scope = {
      dispatchProposalId: detail.id,
      vehicleId: selectedCandidate.vehicleId,
      driverId: selectedCandidate.driverId,
      workDate: detail.workDate,
      proposalRevision: detail.jobAttempt,
    };

    try {
      const result = await dispatchApi.approve(detail.id, {
        vehicleId: selectedCandidate.vehicleId,
        driverId: selectedCandidate.driverId,
        expectedUpdatedAt: detail.updatedAt,
        proposalRevision: detail.jobAttempt,
        idempotencyKey: decisionKey.current.approve,
        overrides: pendingDeclarations.map((check) => ({
          code: check.code,
          note: drafts[check.code]?.note || undefined,
          answer: drafts[check.code]?.answer || undefined,
          scope,
        })),
      });

      showToast({
        message: result.repeated
          ? t('dispatch.approve.repeated')
          : t('dispatch.approve.success', { count: result.assignmentIds.length }),
        type: 'success',
      });
      setOverrideOpen(false);
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (error) {
      const key = dispatchErrorKey(error, 'dispatch.error.approveFailed');
      setDecisionErrorKey(key);
      showToast({ message: t(key), type: 'error' });
      if (isStaleDecisionError(error)) {
        // Veri degismis: "tekrar dene" anlamsiz, once yeniden yukle.
        decisionKey.current.approve = null;
        await Promise.all([loadDetail(detail.id), loadList()]);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, detail, drafts, loadDetail, loadList, pendingDeclarations, selectedCandidate, t]);

  const onApproveClick = useCallback(() => {
    if (pendingDeclarations.length > 0) {
      // Beyan bekleyen kontrol varsa ONCE modal — onay tek tiklamayla
      // gecilemez.
      setOverrideOpen(true);
      return;
    }
    void submitApproval();
  }, [pendingDeclarations.length, submitApproval]);

  const submitRejection = useCallback(async () => {
    if (!detail || busy) return;
    setBusy(true);
    setDecisionErrorKey(null);
    decisionKey.current.reject ??= createDecisionKey('reject', detail.id);
    try {
      await dispatchApi.reject(detail.id, {
        reason: rejectReason.trim(),
        expectedUpdatedAt: detail.updatedAt,
        proposalRevision: detail.jobAttempt,
        idempotencyKey: decisionKey.current.reject,
      });
      showToast({ message: t('dispatch.reject.success'), type: 'success' });
      setRejectReason('');
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (error) {
      const key = dispatchErrorKey(error, 'dispatch.error.rejectFailed');
      setDecisionErrorKey(key);
      showToast({ message: t(key), type: 'error' });
      if (isStaleDecisionError(error)) {
        decisionKey.current.reject = null;
        await Promise.all([loadDetail(detail.id), loadList()]);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, detail, loadDetail, loadList, rejectReason, t]);

  const retryGeneration = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await dispatchApi.retry(id);
        showToast({ message: t('dispatch.retry.queued'), type: 'success' });
        await Promise.all([loadList(), openId === id ? loadDetail(id) : Promise.resolve()]);
      } catch (error) {
        const key = dispatchErrorKey(error, 'dispatch.error.retryFailed');
        showToast({ message: t(key), type: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [loadDetail, loadList, openId, t],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('dispatch.queue.title')}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="dispatch-status-filter">
                {t('dispatch.queue.statusFilter')}
              </label>
              <select
                id="dispatch-status-filter"
                data-testid="dispatch-status-filter"
                className={FLEET_FILTER_SELECT}
                value={status}
                onChange={(event) => setStatus(event.target.value as DispatchProposalStatus | 'all')}
              >
                {STATUS_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'all'
                      ? t('dispatch.queue.allStatuses')
                      : t(proposalStatusLabelKey(value))}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="dispatch-generation-filter">
                {t('dispatch.queue.generationFilter')}
              </label>
              <select
                id="dispatch-generation-filter"
                data-testid="dispatch-generation-filter"
                className={FLEET_FILTER_SELECT}
                value={generation}
                onChange={(event) =>
                  setGeneration(event.target.value as DispatchGeneration | 'all')
                }
              >
                {GENERATION_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'all'
                      ? t('dispatch.queue.allGenerations')
                      : t(generationLabelKey(value))}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadList()}
                data-testid="dispatch-refresh"
              >
                <span className="inline-flex items-center">
                  <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('dispatch.queue.refresh')}
                </span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2" data-testid="dispatch-queue-skeleton">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : listErrorKey ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p role="alert" className="text-sm text-red-700">
                {t(listErrorKey)}
              </p>
              <Button variant="outline" size="sm" onClick={() => void loadList()}>
                {t('dispatch.queue.retry')}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Route}
              title={t('dispatch.queue.emptyTitle')}
              subtitle={t('dispatch.queue.emptyDescription')}
            />
          ) : (
            <>
              {/* Genis ekran: tablo. Dar ekran: kart listesi — tabloyu yatay
                  kaydirtmak mobilde kullanilamaz hale getiriyordu. */}
              <div className="hidden overflow-x-auto md:block">
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.workDate')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.generation')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.status')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.orders')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.candidates')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>{t('dispatch.queue.route')}</TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        <span className="sr-only">{t('dispatch.queue.actions')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {rows.map((row) => (
                      <TableRow key={row.id} data-testid={`dispatch-row-${row.id}`}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{row.workDate}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <ToneBadge tone={generationTone(row.generation)}>
                            {t(generationLabelKey(row.generation))}
                          </ToneBadge>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <ToneBadge tone={proposalStatusTone(row.status)}>
                            {t(proposalStatusLabelKey(row.status))}
                          </ToneBadge>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{row.orderCount}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{row.candidateCount}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <ToneBadge tone={routeTone(row.routeStatus)}>
                            {t(`dispatch.route.${row.routeStatus}`)}
                          </ToneBadge>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openProposal(row.id)}
                            data-testid={`dispatch-open-${row.id}`}
                          >
                            {t('dispatch.queue.open')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-slate-200 p-3"
                    data-testid={`dispatch-card-${row.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{row.workDate}</span>
                      <ToneBadge tone={proposalStatusTone(row.status)}>
                        {t(proposalStatusLabelKey(row.status))}
                      </ToneBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ToneBadge tone={generationTone(row.generation)}>
                        {t(generationLabelKey(row.generation))}
                      </ToneBadge>
                      <ToneBadge tone={routeTone(row.routeStatus)}>
                        {t(`dispatch.route.${row.routeStatus}`)}
                      </ToneBadge>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {t('dispatch.queue.summary', {
                        orders: row.orderCount,
                        candidates: row.candidateCount,
                      })}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => openProposal(row.id)}
                    >
                      {t('dispatch.queue.open')}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {openId ? (
        <DispatchDetailPanel
          detail={detail}
          candidates={candidates}
          tour={tour}
          loading={detailLoading}
          errorKey={detailErrorKey}
          selectedCandidate={selectedCandidate}
          applicable={applicable}
          busy={busy}
          decisionErrorKey={decisionErrorKey}
          rejectReason={rejectReason}
          numberFormat={numberFormat}
          dateTimeFormat={dateTimeFormat}
          onSelectCandidate={chooseCandidate}
          onApprove={onApproveClick}
          onReject={() => void submitRejection()}
          onRejectReasonChange={setRejectReason}
          onRetry={(id) => void retryGeneration(id)}
          onClose={closeProposal}
          onReload={() => void loadDetail(openId)}
        />
      ) : null}

      <OverrideDeclarationDialog
        open={overrideOpen}
        checks={pendingDeclarations}
        drafts={drafts}
        onChange={(code, draft) => setDrafts((previous) => ({ ...previous, [code]: draft }))}
        onConfirm={() => void submitApproval()}
        onCancel={() => setOverrideOpen(false)}
      />
    </div>
  );
}

function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <Badge variant={TONE_BADGE[tone]}>
      {/* Renk TEK BASINA anlam tasimiyor: ikon + metin birlikte. */}
      <Icon className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
      {children}
    </Badge>
  );
}

interface DetailPanelProps {
  detail: DispatchProposalDetail | null;
  candidates: DispatchCandidateView[];
  tour: DispatchTourView | null;
  loading: boolean;
  errorKey: string | null;
  selectedCandidate: DispatchCandidateView | null;
  applicable: boolean;
  busy: boolean;
  decisionErrorKey: string | null;
  rejectReason: string;
  numberFormat: Intl.NumberFormat;
  dateTimeFormat: Intl.DateTimeFormat;
  onSelectCandidate: (id: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onRejectReasonChange: (value: string) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
  onReload: () => void;
}

function DispatchDetailPanel(props: DetailPanelProps) {
  const { t } = useTranslation();
  const { detail, candidates, tour, selectedCandidate } = props;

  if (props.loading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6" data-testid="dispatch-detail-skeleton">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (props.errorKey || !detail) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-red-700">
            {t(props.errorKey ?? 'dispatch.error.loadDetail')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={props.onReload}>
              {t('dispatch.queue.retry')}
            </Button>
            <Button variant="outline" size="sm" onClick={props.onClose}>
              {t('dispatch.detail.close')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const distance = displayNumber(detail.route.totalDistanceKm, 'de-DE', {
    maximumFractionDigits: 1,
  });
  const duration = formatDurationMinutes(detail.route.totalDurationMin);
  const generationPending =
    detail.generation === 'queued' || detail.generation === 'processing';
  const canDecide = detail.status === 'open' && detail.generation === 'ready';

  return (
    <Card data-testid="dispatch-detail">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t('dispatch.detail.title', { date: detail.workDate })}</CardTitle>
            <p className="mt-1 flex flex-wrap gap-2">
              <ToneBadge tone={generationTone(detail.generation)}>
                {t(generationLabelKey(detail.generation))}
              </ToneBadge>
              <ToneBadge tone={proposalStatusTone(detail.status)}>
                {t(proposalStatusLabelKey(detail.status))}
              </ToneBadge>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            {t('dispatch.detail.close')}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* --- Uretim durumu --- */}
        {generationPending ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
            data-testid="dispatch-generation-pending"
          >
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>{t('dispatch.detail.generationPending')}</span>
          </p>
        ) : null}

        {detail.generation === 'failed' || detail.generation === 'expired' ? (
          <div
            className="flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="dispatch-generation-failed"
          >
            <p role="alert" className="flex items-start gap-2 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t(`dispatch.detail.generation.${detail.generation}`)}</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={props.busy}
              onClick={() => props.onRetry(detail.id)}
              data-testid="dispatch-retry"
            >
              {t('dispatch.detail.retry')}
            </Button>
          </div>
        ) : null}

        {/* --- Rota --- */}
        <section aria-labelledby="dispatch-route-heading" className="space-y-3">
          <h3 id="dispatch-route-heading" className="text-sm font-semibold text-slate-900">
            {t('dispatch.detail.routeHeading')}
          </h3>

          {isRouteEstimated(detail.route.status) ? (
            /* VALHALLA BOZULMASI ACIKCA GORUNUYOR: uydurulmus bir ETA gercek
               bir ETA gibi gosterilmemeli. */
            <p
              role="status"
              data-testid="dispatch-route-degraded"
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  detail.route.status === 'failed'
                    ? 'dispatch.detail.routeFailed'
                    : 'dispatch.detail.routeDegraded',
                )}
              </span>
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-600">{t('dispatch.detail.distance')}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {distance.unknown ? (
                  <UnknownValue />
                ) : (
                  `${distance.text} km${isRouteEstimated(detail.route.status) ? ` · ${t('dispatch.detail.estimate')}` : ''}`
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">{t('dispatch.detail.duration')}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {duration ?? <UnknownValue />}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">{t('dispatch.detail.stops')}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {detail.route.plannedStops.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">{t('dispatch.detail.computedAt')}</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {props.dateTimeFormat.format(new Date(detail.computedAt))}
              </dd>
            </div>
          </dl>

          <DispatchRouteMap stops={detail.route.plannedStops} />

          {detail.route.plannedStops.length > 0 ? (
            <ol className="space-y-1" data-testid="dispatch-stop-list">
              {detail.route.plannedStops.map((stop) => (
                <li
                  key={`${stop.sequence}-${stop.locationId ?? 'x'}`}
                  className="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs"
                >
                  <span className="font-semibold text-slate-900">{stop.sequence}.</span>
                  <span className="text-slate-700">
                    {t(`dispatch.stopKind.${stop.kind}`, { defaultValue: stop.kind })}
                  </span>
                  {stop.locationLabel ? (
                    <span className="text-slate-600">{stop.locationLabel}</span>
                  ) : null}
                  <span className="ml-auto text-slate-600">
                    {stop.etaAt ? (
                      `${t('dispatch.detail.eta')} ${props.dateTimeFormat.format(new Date(stop.etaAt))}`
                    ) : (
                      <UnknownValue />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {/* --- Siparisler --- */}
        <section aria-labelledby="dispatch-orders-heading" className="space-y-2">
          <h3 id="dispatch-orders-heading" className="text-sm font-semibold text-slate-900">
            {t('dispatch.detail.ordersHeading')}
          </h3>
          {detail.financialFieldsMasked ? (
            /* SUNUCU BU ALANLARI HIC GONDERMEDI. Ekran degeri saklamiyor —
               elinde deger YOK. */
            <p className="text-xs text-slate-600" data-testid="dispatch-financial-masked">
              {t('dispatch.detail.financialMasked')}
            </p>
          ) : null}
          <ul className="space-y-2">
            {detail.orders.map((order) => (
              <li
                key={order.transportOrderId}
                className="rounded-lg border border-slate-200 p-3 text-sm"
                data-testid={`dispatch-order-${order.transportOrderId}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{order.orderNumber}</span>
                  {order.companyName ? (
                    <span className="text-slate-600">{order.companyName}</span>
                  ) : null}
                  {order.stale ? (
                    <Badge variant="warning">
                      <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                      {t('dispatch.detail.staleOrder')}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {t('dispatch.detail.consignmentCount', { count: order.consignmentCount })}
                  {' · '}
                  {t('dispatch.detail.revision', {
                    source: order.sourceRevision,
                    current: order.currentRevision,
                  })}
                </p>
                {order.contractedRevenue !== null && order.currency ? (
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    {props.numberFormat.format(order.contractedRevenue)} {order.currency}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* --- Adaylar --- */}
        <section aria-labelledby="dispatch-candidates-heading" className="space-y-3">
          <h3 id="dispatch-candidates-heading" className="text-sm font-semibold text-slate-900">
            {t('dispatch.detail.candidatesHeading')}
          </h3>

          {candidates.length === 0 ? (
            <p role="status" className="text-sm text-slate-600">
              {t('dispatch.detail.noCandidates')}
            </p>
          ) : (
            <div
              className="grid grid-cols-1 gap-2 lg:grid-cols-2"
              role="radiogroup"
              aria-labelledby="dispatch-candidates-heading"
            >
              {candidates.map((candidate) => {
                const selected = candidate.id === selectedCandidate?.id;
                const blocked = blockingChecks(candidate.checks).length > 0;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`dispatch-candidate-${candidate.id}`}
                    onClick={() => props.onSelectCandidate(candidate.id)}
                    className={`rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#1a4d7a] ${
                      selected ? 'border-[#1a4d7a] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {t('dispatch.detail.rank', { rank: candidate.rank })}
                      </span>
                      <ToneBadge tone={decisionTone(candidate.decision)}>
                        {t(decisionLabelKey(candidate.decision))}
                      </ToneBadge>
                    </div>
                    <p className="mt-1 text-sm text-slate-800">
                      {candidate.vehiclePlate ?? t('dispatch.detail.unknownVehicle')}
                      {' · '}
                      {candidate.driverName ?? t('dispatch.detail.unknownDriver')}
                    </p>
                    {blocked ? (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        {t('dispatch.detail.blockedHint')}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {selectedCandidate ? (
            <CandidateChecks candidate={selectedCandidate} />
          ) : null}
        </section>

        {/* --- Karar --- */}
        {canDecide ? (
          <section aria-labelledby="dispatch-decision-heading" className="space-y-3">
            <h3 id="dispatch-decision-heading" className="text-sm font-semibold text-slate-900">
              {t('dispatch.detail.decisionHeading')}
            </h3>

            {props.decisionErrorKey ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {t(props.decisionErrorKey)}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={props.onApprove}
                // CIFT TIKLAMA: `busy` dugmeyi kilitliyor. Sunucudaki
                // `idempotencyKey` + `resultTourId @unique` asil koruma; bu
                // yalnizca kullaniciya geri bildirim.
                disabled={props.busy || !props.applicable || !selectedCandidate}
                data-testid="dispatch-approve"
              >
                {props.busy ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('dispatch.detail.working')}
                  </span>
                ) : (
                  t('dispatch.detail.approve')
                )}
              </Button>
            </div>

            {!props.applicable && selectedCandidate ? (
              <p role="status" className="text-xs text-amber-900">
                {blockingChecks(selectedCandidate.checks).length > 0
                  ? t('dispatch.detail.cannotApplyBlocked')
                  : checksNeedingData(selectedCandidate.checks).length > 0
                    ? t('dispatch.detail.cannotApplyMissingData')
                    : t('dispatch.detail.needsDeclaration')}
              </p>
            ) : null}

            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <label
                htmlFor="dispatch-reject-reason"
                className="block text-xs font-medium text-slate-700"
              >
                {t('dispatch.detail.rejectReason')}
              </label>
              <textarea
                id="dispatch-reject-reason"
                data-testid="dispatch-reject-reason"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                value={props.rejectReason}
                onChange={(event) => props.onRejectReasonChange(event.target.value)}
              />
              <Button
                variant="outline"
                onClick={props.onReject}
                // SEBEPSIZ RED, neyin duzeltilecegini bilinmez kilar.
                disabled={props.busy || props.rejectReason.trim().length < 5}
                data-testid="dispatch-reject"
              >
                {t('dispatch.detail.reject')}
              </Button>
            </div>
          </section>
        ) : null}

        {/* --- Uygulanmis sonuc --- */}
        {detail.resultTourId ? (
          <section
            aria-labelledby="dispatch-tour-heading"
            className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-3"
            data-testid="dispatch-applied-tour"
          >
            <h3 id="dispatch-tour-heading" className="flex items-center gap-2 text-sm font-semibold text-green-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('dispatch.detail.appliedHeading')}
            </h3>
            <p className="text-sm text-green-900">
              {t('dispatch.detail.appliedTour', { id: detail.resultTourId })}
            </p>
            {tour ? (
              <p className="text-xs text-green-900">
                {t('dispatch.detail.appliedSummary', {
                  stops: tour.stops.length,
                  assignments: tour.assignmentIds.length,
                })}
              </p>
            ) : null}
            <a
              className="inline-block text-sm font-medium text-[#1a4d7a] underline"
              href={`/assignments/planning?tour=${detail.resultTourId}`}
              data-testid="dispatch-tour-link"
            >
              {t('dispatch.detail.openTour')}
            </a>
          </section>
        ) : null}

        {detail.rejectionReason ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {t('dispatch.detail.rejectedWith', { reason: detail.rejectionReason })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CandidateChecks({ candidate }: { candidate: DispatchCandidateView }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2" data-testid="dispatch-candidate-checks">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {t('dispatch.detail.checksHeading')}
      </h4>
      <ul className="space-y-1">
        {candidate.checks.map((check) => (
          <CheckRow key={check.code} check={check} />
        ))}
      </ul>
    </div>
  );
}

function CheckRow({ check }: { check: DispatchCheckView }) {
  const { t } = useTranslation();
  const tone = checkTone(check.status);
  const Icon = TONE_ICON[tone];
  const labelKey = checkLabelKey(check.code);
  const evidence = Object.entries(check.evidence ?? {});

  return (
    <li
      className="flex flex-col gap-1 rounded border border-slate-200 px-2 py-2 text-xs sm:flex-row sm:items-start sm:gap-2"
      data-testid={`dispatch-check-${check.code}`}
    >
      <span className="flex items-center gap-1 font-medium text-slate-900">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            tone === 'positive'
              ? 'text-green-700'
              : tone === 'danger'
                ? 'text-red-700'
                : 'text-amber-700'
          }`}
          aria-hidden="true"
        />
        {/* Bilinmeyen kod ham gosteriliyor — gizlemek dispatcher'i sebebi
            bilinmeyen bir engelle bas basa birakirdi. */}
        {labelKey ? t(labelKey) : check.code}
      </span>
      <span className="text-slate-700">
        {/* Durum METINLE de yaziliyor, yalnizca ikon rengiyle degil. */}
        {t(checkStatusLabelKey(check.status))} · {t(reasonLabelKey(check.reasonKey))}
      </span>
      {evidence.length > 0 ? (
        <span className="text-slate-500 sm:ml-auto">
          {evidence
            .map(([key, value]) =>
              value === null
                ? `${key}: ${t('dispatch.detail.maskedValue')}`
                : `${key}: ${String(value)}`,
            )
            .join(' · ')}
        </span>
      ) : null}
    </li>
  );
}

function UnknownValue() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-amber-800">
      <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t('dispatch.detail.unverified')}
    </span>
  );
}
