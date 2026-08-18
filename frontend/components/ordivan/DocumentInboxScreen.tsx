'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Scissors,
  Upload,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { documentInboxApi } from '@/lib/api';
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
  DOCUMENT_TYPE_KEYS,
  blockReasonKey,
  documentTypeLabelKey,
  formatPageRange,
  isLowConfidence,
  mergeSegments,
  needsAttention,
  planSummaryKey,
  requiresDriver,
  sourceLabelKey,
  splitAt,
  statusLabelKey,
  statusTone,
  supportsSubtype,
  typeFamily,
  validateSegments,
  type SegmentDraft,
} from '@/lib/document-inbox-view';
import { checkTone, type Tone } from '@/lib/ordivan-view';
import type {
  IntakeDocumentDetail,
  IntakeDocumentRow,
  IntakeDocumentStatus,
  DocumentIntakeSource,
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

const STATUSES: Array<IntakeDocumentStatus | 'all'> = [
  'needs_review',
  'needs_domain_review',
  'routed',
  'rejected',
  'failed',
  'all',
];

const SOURCES: Array<DocumentIntakeSource | 'all'> = ['web', 'mobile', 'connector', 'all'];

/** Iptal edilen istek — beklenen bir sonuc, kullaniciya gosterilecek bir hata degil. */
function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; code?: string };
  return candidate.name === 'AbortError' || candidate.name === 'CanceledError' || candidate.code === 'ERR_CANCELED';
}

/**
 * BELGE GELEN KUTUSU (Faz 14).
 *
 * EKRAN SUNUCUNUN KURALINI TEKRARLAR, KENDI KURALINI KOYMAZ: "onaylandiginda
 * ne olacak" ozeti sunucudan gelen `plan` nesnesinden okunuyor. Ekranda bir
 * cumle, sunucuda baska bir davranis olmasi, guvenin en hizli kaybedildigi
 * yerdir.
 *
 * SURUCU BU EKRANI GORMEZ: uc `OPERATIONAL_ROLES` ile korunuyor ve mevcut
 * surucu yakit fisi akisi DEGISMEDI. Menuyu gizlemek guvenlik degildir —
 * asil kisit sunucuda.
 *
 * DUSUK GUVEN VURGULANIR: `unknown` tur ve esik alti guven, listede ve detayda
 * isaretleniyor. Kullanicinin hangi satira bakmasi gerektigini tahmin etmesi
 * beklenmemeli.
 */
export function DocumentInboxScreen() {
  const { t } = useTranslation();

  const [rows, setRows] = useState<IntakeDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [status, setStatus] = useState<IntakeDocumentStatus | 'all'>('needs_review');
  const [source, setSource] = useState<DocumentIntakeSource | 'all'>('all');
  const [typeKey, setTypeKey] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntakeDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  /** Detay acildiginda odak paneline gecsin — klavye kullanicisi kaybolmasin. */
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  /** Panel kapaninca odak GERI dondugu satira. */
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await documentInboxApi.list(
          {
            ...(status === 'all' ? {} : { status }),
            ...(source === 'all' ? {} : { source }),
            ...(typeKey === 'all' ? {} : { typeKey }),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
          signal,
        );
        setRows(result.rows);
      } catch (loadError) {
        // IPTAL EDILEN ISTEK BIR HATA DEGIL: bilesen yeniden baglandiginda
        // (React strict mode, filtre degisimi) onceki istek bilincli olarak
        // iptal ediliyor. Bunu "yuklenemedi" diye gostermek, veri EKRANDA
        // dururken kullaniciya yanlis bir alarm verirdi.
        if (isAbort(loadError)) return;
        setError(t('documentInbox.loadFailed'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [status, source, typeKey, from, to, t],
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
        setDetail(await documentInboxApi.detail(id));
      } catch {
        setError(t('documentInbox.loadFailed'));
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (detail) {
      detailHeadingRef.current?.focus();
    }
  }, [detail]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    lastTriggerRef.current?.focus();
  }, []);

  /** Esc paneli kapatir — fare olmadan da cikis olmali. */
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closeDetail]);

  const upload = useCallback(
    async (file: File | undefined, uploadSource: 'web' | 'mobile') => {
      if (!file) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await documentInboxApi.upload(file, uploadSource);
        setNotice(
          result.duplicate
            ? t('documentInbox.upload.duplicate')
            : t('documentInbox.upload.accepted', { count: result.documents.length }),
        );
        await load();
      } catch (uploadError) {
        const code = (uploadError as { response?: { data?: { code?: string } } })?.response?.data
          ?.code;
        // KULLANICI DOSTU HATA: HEIC ve sifreli PDF icin ayri, anlasilir mesaj.
        setError(code ? t(`documentInbox.uploadError.${code}`, t('documentInbox.upload.failed')) : t('documentInbox.upload.failed'));
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    setDetail(await documentInboxApi.detail(selectedId));
    await load();
  }, [selectedId, load]);

  return (
    <div className="space-y-6">
      {/* ------------------------------ Yukleme ------------------------------ */}
      <section
        className="rounded-lg border border-slate-200 bg-white p-4"
        aria-labelledby="inbox-upload-heading"
      >
        <h2 id="inbox-upload-heading" className="text-sm font-semibold text-slate-900">
          {t('documentInbox.upload.title')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('documentInbox.upload.hint')}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t('documentInbox.upload.selectFile')}
          </Button>

          {/* Mobil kamera: `capture` telefonda dogrudan kamerayi acar. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
            className="gap-2 sm:hidden"
          >
            <Camera className="h-4 w-4" />
            {t('documentInbox.upload.camera')}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png"
          aria-label={t('documentInbox.upload.selectFile')}
          onChange={(event) => {
            void upload(event.target.files?.[0], 'web');
            event.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png"
          capture="environment"
          aria-label={t('documentInbox.upload.camera')}
          onChange={(event) => {
            void upload(event.target.files?.[0], 'mobile');
            event.target.value = '';
          }}
        />

        {notice ? (
          <p role="status" className="mt-3 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {/* ------------------------------ Filtreler ---------------------------- */}
      <section className="flex flex-wrap gap-3" aria-label={t('documentInbox.filters')}>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('documentInbox.filter.status')}</span>
          <select
            className={FLEET_FILTER_SELECT}
            value={status}
            onChange={(event) => setStatus(event.target.value as IntakeDocumentStatus | 'all')}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? t('documentInbox.filter.all') : t(statusLabelKey(item))}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('documentInbox.filter.source')}</span>
          <select
            className={FLEET_FILTER_SELECT}
            value={source}
            onChange={(event) => setSource(event.target.value as DocumentIntakeSource | 'all')}
          >
            {SOURCES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? t('documentInbox.filter.all') : t(sourceLabelKey(item))}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('documentInbox.filter.type')}</span>
          <select
            className={FLEET_FILTER_SELECT}
            value={typeKey}
            onChange={(event) => setTypeKey(event.target.value)}
          >
            <option value="all">{t('documentInbox.filter.all')}</option>
            {DOCUMENT_TYPE_KEYS.map((item) => (
              <option key={item} value={item}>
                {t(documentTypeLabelKey(item))}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('documentInbox.filter.from')}</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('documentInbox.filter.to')}</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>

      {/* -------------------------------- Liste ------------------------------ */}
      {loading ? (
        <p className="text-sm text-slate-600">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          {t('common.loading')}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('documentInbox.emptyTitle')}
          subtitle={t('documentInbox.emptyBody')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={FLEET_TABLE}>
            <TableHeader>
              <TableRow className={FLEET_TABLE_HEADER_ROW}>
                <TableHead className={FLEET_TABLE_HEAD}>{t('documentInbox.column.type')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('documentInbox.column.pages')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('documentInbox.column.source')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>{t('documentInbox.column.status')}</TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  {t('documentInbox.column.confidence')}
                </TableHead>
                <TableHead className={FLEET_TABLE_HEAD}>
                  <span className="sr-only">{t('documentInbox.column.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={FLEET_TABLE_BODY}>
              {rows.map((row) => {
                const attention = needsAttention(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                      <span>{t(documentTypeLabelKey(row.typeKey))}</span>
                      {row.corrected ? (
                        <Badge variant="outline" className="ml-2">
                          {t('documentInbox.corrected')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {formatPageRange(row.pageFrom, row.pageTo)} / {row.intake.pageCount}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {t(sourceLabelKey(row.intake.source))}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Badge variant={TONE_BADGE[statusTone(row.status)]}>
                        {t(statusLabelKey(row.status))}
                      </Badge>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      {row.confidence === null ? (
                        t('documentInbox.confidenceUnknown')
                      ) : (
                        <span
                          className={
                            attention ? 'font-semibold text-amber-700' : 'text-slate-700'
                          }
                        >
                          {Math.round(row.confidence * 100)}%
                        </span>
                      )}
                      {attention ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {t('documentInbox.needsAttention')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => void openDetail(row.id, event.currentTarget)}
                      >
                        {t('documentInbox.review')}
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
          aria-labelledby="inbox-detail-heading"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          {detailLoading || !detail ? (
            <p className="text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : (
            <DocumentInboxDetail
              detail={detail}
              headingRef={detailHeadingRef}
              onClose={closeDetail}
              onChanged={refreshDetail}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Detay paneli — onizleme, bolme, duzeltme ve yonlendirme. */
function DocumentInboxDetail({
  detail,
  headingRef,
  onClose,
  onChanged,
}: {
  detail: IntakeDocumentDetail;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [segments, setSegments] = useState<SegmentDraft[]>([
    { pageFrom: detail.pageFrom, pageTo: detail.pageTo },
  ]);
  const [splitPage, setSplitPage] = useState<number>(detail.pageFrom + 1);

  const plan = detail.plan;
  const pageCount = detail.intake.pageCount;
  const attention = needsAttention(detail);

  const segmentError = useMemo(
    () => validateSegments(segments, pageCount),
    [segments, pageCount],
  );

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await onChanged();
      } catch (actionError) {
        const code = (actionError as { response?: { data?: { code?: string } } })?.response?.data
          ?.code;
        setError(code ? t(`documentInbox.error.${code}`, t('documentInbox.actionFailed')) : t('documentInbox.actionFailed'));
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2
          id="inbox-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-slate-900"
        >
          {t(documentTypeLabelKey(detail.typeKey))}{' '}
          <span className="text-sm font-normal text-slate-500">
            {t('documentInbox.pagesLabel', {
              range: formatPageRange(detail.pageFrom, detail.pageTo),
              total: pageCount,
            })}
          </span>
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      {attention ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden />
          {t('documentInbox.lowConfidenceHint')}
        </p>
      ) : null}

      {/* ---------------------------- Onizleme ---------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {t('documentInbox.preview')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{detail.intake.document.originalName}</p>
          <a
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-700 underline"
            href={detail.intake.document.fileDownloadPath}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('documentInbox.openPreview')}
          </a>

          {/* Sayfa kucuk resimleri: gomulu onizleme yerine sayfa isaretleri —
              ham dosya yalnizca YETKILI uctan aciliyor. */}
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('documentInbox.pageThumbnails')}>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => {
              const inRange = page >= detail.pageFrom && page <= detail.pageTo;
              return (
                <li
                  key={page}
                  className={`flex h-14 w-11 items-center justify-center rounded border text-xs ${
                    inRange
                      ? 'border-blue-500 bg-blue-50 font-semibold text-blue-800'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  {page}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---------------------------- Kontroller ---------------------------- */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('documentInbox.checks')}</h3>
          <ul className="mt-2 space-y-1">
            {detail.checks.map((check) => {
              const tone = checkTone(check.status);
              const Icon = TONE_ICON[tone];
              return (
                <li key={check.code} className="flex items-start gap-2 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {t(`documentInbox.check.${check.code}`, check.code)}{' '}
                    {/* Faz 12'nin `automation.check.status.*` anahtarlari bir
                        ONEK olarak tasarlandi ve iki nokta iceriyor; rozet
                        icinde yanlis okunuyordu. Ortak anahtarlari bozmadan
                        kendi etiketimizi kullaniyoruz. */}
                    <Badge variant={TONE_BADGE[tone]}>
                      {t(`documentInbox.checkStatus.${check.status}`)}
                    </Badge>
                    {check.unknownReason ? (
                      <span className="ml-1 text-xs text-slate-500">
                        {' '}
                        ({t(`documentInbox.unknownReason.${check.unknownReason}`, check.unknownReason)})
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>

          <h3 className="mt-4 text-sm font-semibold text-slate-900">
            {t('documentInbox.evidence')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('documentInbox.classifier', { version: detail.intake.classifierVersion ?? '—' })}
          </p>
        </div>
      </div>

      {/* ------------------------- Bolme / birlestirme ------------------------ */}
      {pageCount > 1 && detail.status !== 'routed' ? (
        <div className="rounded border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            <Scissors className="mr-2 inline h-4 w-4" aria-hidden />
            {t('documentInbox.segmentation')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{t('documentInbox.segmentationHint')}</p>

          <ul className="mt-2 space-y-1 text-sm">
            {segments.map((segment, index) => (
              <li key={`${segment.pageFrom}-${segment.pageTo}`} className="flex items-center gap-2">
                <span>{formatPageRange(segment.pageFrom, segment.pageTo)}</span>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const merged = mergeSegments(segments[index - 1]!, segment);
                      if (!merged) return;
                      setSegments([
                        ...segments.slice(0, index - 1),
                        merged,
                        ...segments.slice(index + 1),
                      ]);
                    }}
                  >
                    {t('documentInbox.merge')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t('documentInbox.splitAtPage')}</span>
              <Input
                type="number"
                min={1}
                max={pageCount}
                value={splitPage}
                onChange={(event) => setSplitPage(Number(event.target.value))}
                className="w-24"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const index = segments.findIndex(
                  (segment) => splitPage > segment.pageFrom && splitPage <= segment.pageTo,
                );
                if (index < 0) return;
                const parts = splitAt(segments[index]!, splitPage);
                if (!parts) return;
                setSegments([...segments.slice(0, index), ...parts, ...segments.slice(index + 1)]);
              }}
            >
              {t('documentInbox.split')}
            </Button>
            <Button
              type="button"
              disabled={busy || segmentError !== null}
              onClick={() =>
                void run(() => documentInboxApi.resegment(detail.intake.id, segments))
              }
            >
              {t('documentInbox.applySegmentation')}
            </Button>
          </div>

          {segmentError ? (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t(`documentInbox.segmentError.${segmentError}`)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ----------------------------- Duzeltme ------------------------------ */}
      {detail.status !== 'routed' && detail.status !== 'rejected' ? (
        <div className="rounded border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {t('documentInbox.correction')}
          </h3>

          <div className="mt-2 flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t('documentInbox.column.type')}</span>
              <select
                className={FLEET_FILTER_SELECT}
                value={detail.typeKey}
                onChange={(event) =>
                  void run(() =>
                    documentInboxApi.correct(detail.id, { typeKey: event.target.value }),
                  )
                }
              >
                {DOCUMENT_TYPE_KEYS.map((item) => (
                  <option key={item} value={item}>
                    {t(documentTypeLabelKey(item))}
                  </option>
                ))}
              </select>
            </label>

            {supportsSubtype(detail.typeKey) ? (
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{t('documentInbox.subtype')}</span>
                <select
                  className={FLEET_FILTER_SELECT}
                  value={detail.subtype ?? 'unknown'}
                  onChange={(event) =>
                    void run(() =>
                      documentInboxApi.correct(detail.id, { subtype: event.target.value }),
                    )
                  }
                >
                  {['tuv', 'sp', 'unknown'].map((item) => (
                    <option key={item} value={item}>
                      {t(`documentInbox.subtype.${item}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {/* Ajanin ILK ciktisi — insanin karariyla karsilastirilabilsin. */}
          {detail.corrected ? (
            <p className="mt-2 text-xs text-slate-500">
              {t('documentInbox.originalProposal', {
                type: t(documentTypeLabelKey(detail.proposed.typeKey)),
                range: formatPageRange(detail.proposed.pageFrom, detail.proposed.pageTo),
              })}
            </p>
          ) : null}

          {detail.candidates ? (
            <p className="mt-2 text-xs text-slate-500">
              {t('documentInbox.candidates', {
                plates: detail.candidates.plateNumbers.join(', ') || '—',
                vins: detail.candidates.vins.join(', ') || '—',
              })}
            </p>
          ) : null}

          {requiresDriver(detail.typeKey) && !detail.driverId ? (
            <p className="mt-2 text-sm text-amber-800">{t('documentInbox.driverRequiredHint')}</p>
          ) : null}
        </div>
      ) : null}

      {/* -------------------- "Onaylandiginda ne olacak?" -------------------- */}
      <div className="rounded border border-blue-200 bg-blue-50 p-3">
        <h3 className="text-sm font-semibold text-blue-900">
          {t('documentInbox.whatHappens')}
        </h3>
        <p className="mt-1 text-sm text-blue-900">{t(planSummaryKey(plan))}</p>

        {plan.blockedBy.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-blue-900">
            {plan.blockedBy.map((reason) => (
              <li key={reason}>{t(blockReasonKey(reason))}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* --------------------------- Yonlendirme ----------------------------- */}
      {detail.routing ? (
        <p className="text-sm text-emerald-800">
          <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden />
          {t('documentInbox.routedTo', {
            entity: detail.routing.entityType,
            id: detail.routing.entityId,
          })}
        </p>
      ) : detail.status === 'rejected' ? (
        <p className="text-sm text-slate-700">
          {t('documentInbox.rejectedWith', { reason: detail.rejectionReason ?? '—' })}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[16rem] flex-1 text-sm">
            <span className="mb-1 block text-slate-600">{t('documentInbox.rejectReason')}</span>
            <Input
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t('documentInbox.rejectReasonPlaceholder')}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={busy || rejectReason.trim().length < 5}
            onClick={() => void run(() => documentInboxApi.reject(detail.id, rejectReason))}
          >
            {t('documentInbox.reject')}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Kurtarma: `unknown` ve basarisiz belgede ne yapilacagi ACIKCA yazili. */}
      {typeFamily(detail.typeKey) === 'unknown' || detail.status === 'failed' ? (
        <p className="rounded border border-slate-300 bg-slate-50 p-2 text-sm text-slate-700">
          {t('documentInbox.recoveryHint')}
        </p>
      ) : null}

      {isLowConfidence(detail.confidence) ? (
        <p className="text-xs text-slate-500">{t('documentInbox.confidenceFootnote')}</p>
      ) : null}
    </div>
  );
}
