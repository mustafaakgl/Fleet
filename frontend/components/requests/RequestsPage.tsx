'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFleetData } from '@/context/FleetDataContext';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FLEET_LINK_ACTION,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

type RequestTab = 'Pending' | 'Approved' | 'Rejected' | 'Needs Review' | 'Cancelled';

const TAB_KEY: Record<RequestTab, string> = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  'Needs Review': 'needsReview',
  Cancelled: 'cancelled',
};

export function RequestsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type');
  const statusLabel = (status: string) =>
    status in TAB_KEY ? t(`requests.tab.${TAB_KEY[status as RequestTab]}`) : status;
  const {
    requests,
    drivers,
    approveRequest,
    rejectRequest,
    cancelRequest,
    moveRequestToNeedsReview,
  } = useFleetData();

  const [activeTab, setActiveTab] = useState<RequestTab>('Pending');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== activeTab) return false;
        if (!typeFilter) return true;
        return request.type === typeFilter;
      }),
    [activeTab, requests, typeFilter],
  );

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );

  function getDriverName(driverId: string, fallback: string) {
    return drivers.find((driver) => driver.id === driverId)?.name ?? fallback;
  }

  function runToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  function handleApprove(requestId: string) {
    approveRequest(requestId);
    runToast(t('requests.toastApproved'));
    setSelectedRequestId(null);
  }

  function handleReject(requestId: string) {
    rejectRequest(requestId);
    runToast(t('requests.toastRejected'));
    setSelectedRequestId(null);
  }

  function handleNeedsReview(requestId: string) {
    moveRequestToNeedsReview(requestId);
    runToast(t('requests.toastNeedsReview'));
    setSelectedRequestId(null);
  }

  function handleCancel(requestId: string) {
    cancelRequest(requestId);
    runToast(t('requests.toastCancelled'));
    setSelectedRequestId(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{typeFilter ? t('requests.titleAccidents') : t('requests.titleRequests')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('requests.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['Pending', 'Approved', 'Rejected', 'Needs Review', 'Cancelled'] as RequestTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              activeTab === tab
                ? 'border-blue-700 bg-blue-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(`requests.tab.${TAB_KEY[tab]}`)}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {filteredRequests.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title={typeFilter ? t('requests.emptyTitleAccidents') : t('requests.emptyTitleRequests')}
              subtitle={t('requests.emptySubtitle')}
              actionLabel={t('requests.clearFilters')}
              onAction={() => setActiveTab('Pending')}
            />
          </div>
        ) : (
        <>
        <div className="space-y-3 p-3 md:hidden">
          {filteredRequests.map((request) => (
            <div key={`request-card-${request.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-900">{request.id}</p>
              <p className="text-xs text-slate-600">{getDriverName(request.driverId, request.driverName)} · {request.type}</p>
              <p className="text-xs text-slate-600">{request.dateFrom ?? '-'} - {request.dateTo ?? '-'}</p>
              <button
                type="button"
                className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setSelectedRequestId(request.id)}
              >
                {t('requests.view')}
              </button>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[1500px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('requests.colRequestId')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colDriver')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colDepartment')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colType')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colDateFrom')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colDateTo')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colUploadedDoc')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colResponsibleDept')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colSubmittedAt')}</th>
                <th className={FLEET_RAW_TH}>{t('requests.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {filteredRequests.map((request) => (
                <tr key={request.id} className={FLEET_RAW_TR}>
                  <td className={FLEET_RAW_TD_PRIMARY}>{request.id}</td>
                  <td className={FLEET_RAW_TD}>{getDriverName(request.driverId, request.driverName)}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.department}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.type}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.dateFrom ?? '-'}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.dateTo ?? '-'}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.uploadedDocument}</td>
                  <td className={FLEET_RAW_TD}>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {statusLabel(request.status)}
                    </span>
                  </td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.responsibleDepartment}</td>
                  <td className={FLEET_RAW_TD_MUTED}>{request.submittedAt}</td>
                  <td className={FLEET_RAW_TD}>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => setSelectedRequestId(request.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t('requests.view')}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleApprove(request.id)}
                      >
                        {t('requests.approve')}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        onClick={() => handleReject(request.id)}
                      >
                        {t('requests.reject')}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        onClick={() => handleNeedsReview(request.id)}
                      >
                        {t('requests.askMoreInfo')}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => handleCancel(request.id)}
                      >
                        {t('requests.cancel')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>

      {selectedRequest && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setSelectedRequestId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-lg border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">{t('requests.detailTitle')}</h2>
              <button
                type="button"
                onClick={() => setSelectedRequestId(null)}
                className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <DetailRow label={t('requests.rowRequest')} value={selectedRequest.id} />
              <DetailRow label={t('requests.colDriver')} value={getDriverName(selectedRequest.driverId, selectedRequest.driverName)} />
              <DetailRow label={t('requests.colDepartment')} value={selectedRequest.department} />
              <DetailRow label={t('requests.colType')} value={selectedRequest.type} />
              <DetailRow label={t('requests.colDateFrom')} value={selectedRequest.dateFrom ?? '-'} />
              <DetailRow label={t('requests.colDateTo')} value={selectedRequest.dateTo ?? '-'} />
              <DetailRow label={t('requests.rowResponsible')} value={selectedRequest.responsibleDepartment} />

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('requests.uploadedDocPreview')}</p>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <FileText className="h-4 w-4" />
                  <span>{selectedRequest.uploadedDocument || '-'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('requests.notes')}</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedRequest.notes}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('requests.timeline')}</p>
                <ul className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <li>{t('requests.submittedAtLabel')} {selectedRequest.submittedAt}</li>
                  <li>{t('requests.currentStatusLabel')} {statusLabel(selectedRequest.status)}</li>
                  <li>{t('requests.responsibleLabel')} {selectedRequest.responsibleDepartment}</li>
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button type="button" className="rounded border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => handleApprove(selectedRequest.id)}>
                  {t('requests.approve')}
                </button>
                <button type="button" className="rounded border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => handleReject(selectedRequest.id)}>
                  {t('requests.reject')}
                </button>
                <button type="button" className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={() => handleNeedsReview(selectedRequest.id)}>
                  {t('requests.askMoreInfo')}
                </button>
                <button type="button" className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleCancel(selectedRequest.id)}>
                  {t('requests.cancel')}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
