'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, FileText, X } from 'lucide-react';
import { useFleetData } from '@/context/FleetDataContext';
import { EmptyState } from '@/components/ui/empty-state';

type RequestTab = 'Pending' | 'Approved' | 'Rejected' | 'Needs Review' | 'Cancelled';

export function RequestsPage() {
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type');
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
    const result = approveRequest(requestId);
    runToast(result.calendarUpdated ? 'Request approved and calendar updated.' : 'Request approved and calendar updated.');
    setSelectedRequestId(null);
  }

  function handleReject(requestId: string) {
    rejectRequest(requestId);
    runToast('Request rejected.');
    setSelectedRequestId(null);
  }

  function handleNeedsReview(requestId: string) {
    moveRequestToNeedsReview(requestId);
    runToast('Request moved to Needs Review.');
    setSelectedRequestId(null);
  }

  function handleCancel(requestId: string) {
    cancelRequest(requestId);
    runToast('Request cancelled and calendar entries removed.');
    setSelectedRequestId(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{typeFilter ? 'Accidents' : 'Requests'}</h1>
        <p className="mt-1 text-sm text-slate-600">Anfragen aus der Driver-App prufen und bei Freigabe in den Kalender ubernehmen.</p>
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
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {filteredRequests.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title={typeFilter ? 'No accident requests found' : 'No requests found'}
              subtitle="No requests match current filters."
              actionLabel="Clear filters"
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
                View
              </button>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-[1500px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">Request ID</th>
                <th className="border-b border-slate-200 px-3 py-3">Driver</th>
                <th className="border-b border-slate-200 px-3 py-3">Department</th>
                <th className="border-b border-slate-200 px-3 py-3">Type</th>
                <th className="border-b border-slate-200 px-3 py-3">Date From</th>
                <th className="border-b border-slate-200 px-3 py-3">Date To</th>
                <th className="border-b border-slate-200 px-3 py-3">Uploaded Document</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Responsible Department</th>
                <th className="border-b border-slate-200 px-3 py-3">Submitted At</th>
                <th className="border-b border-slate-200 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{request.id}</td>
                  <td className="px-3 py-2.5 text-slate-700">{getDriverName(request.driverId, request.driverName)}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.department}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.type}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.dateFrom ?? '-'}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.dateTo ?? '-'}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.uploadedDocument}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{request.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{request.responsibleDepartment}</td>
                  <td className="px-3 py-2.5 text-slate-700">{request.submittedAt}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => setSelectedRequestId(request.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleApprove(request.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        onClick={() => handleReject(request.id)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        onClick={() => handleNeedsReview(request.id)}
                      >
                        Ask for more info
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => handleCancel(request.id)}
                      >
                        Cancel
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
              <h2 className="text-sm font-semibold text-slate-900">Request Detail</h2>
              <button
                type="button"
                onClick={() => setSelectedRequestId(null)}
                className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <DetailRow label="Request" value={selectedRequest.id} />
              <DetailRow label="Driver" value={getDriverName(selectedRequest.driverId, selectedRequest.driverName)} />
              <DetailRow label="Department" value={selectedRequest.department} />
              <DetailRow label="Type" value={selectedRequest.type} />
              <DetailRow label="Date From" value={selectedRequest.dateFrom ?? '-'} />
              <DetailRow label="Date To" value={selectedRequest.dateTo ?? '-'} />
              <DetailRow label="Responsible" value={selectedRequest.responsibleDepartment} />

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Uploaded document preview</p>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <FileText className="h-4 w-4" />
                  <span>{selectedRequest.uploadedDocument || '-'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedRequest.notes}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
                <ul className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <li>Submitted at: {selectedRequest.submittedAt}</li>
                  <li>Current status: {selectedRequest.status}</li>
                  <li>Responsible: {selectedRequest.responsibleDepartment}</li>
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button type="button" className="rounded border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => handleApprove(selectedRequest.id)}>
                  Approve
                </button>
                <button type="button" className="rounded border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => handleReject(selectedRequest.id)}>
                  Reject
                </button>
                <button type="button" className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={() => handleNeedsReview(selectedRequest.id)}>
                  Ask for more info
                </button>
                <button type="button" className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleCancel(selectedRequest.id)}>
                  Cancel
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
