'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTodayDate, getTomorrowDate, useFleetData } from '@/context/FleetDataContext';
import { companiesApi, companyEmailsApi } from '@/lib/api';
import type { CompanyEmail, CompanyEmailStatus } from '@/lib/types';
import {
  FLEET_LIST_CARD,
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

type EmailStatus = 'Not Prepared' | 'Draft Ready' | 'Sent' | 'Failed' | 'Needs Review';

const EMAIL_STATUS_KEY: Record<EmailStatus, string> = {
  'Not Prepared': 'compNotif.status.notPrepared',
  'Draft Ready': 'compNotif.status.draftReady',
  Sent: 'compNotif.status.sent',
  Failed: 'compNotif.status.failed',
  'Needs Review': 'compNotif.status.needsReview',
};

interface CompanyAssignmentItem {
  assignmentId: string;
  driverName: string;
  vehiclePlate: string;
  startTime: string;
  route: string;
  cargo?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
}

interface CompanyNotificationRecord {
  key: string;
  emailId?: string;
  companyId: string;
  company: string;
  date: string;
  recipientEmail: string;
  assignments: CompanyAssignmentItem[];
  assignedDrivers: string[];
  vehicles: string[];
  plannedJobs: string[];
  status: EmailStatus;
  subject: string;
  body: string;
  lastSent: string | null;
}

interface CompanyNotificationsProps {
  onAttentionCountChange?: (count: number) => void;
}

function keyFor(companyId: string, date: string) {
  return `${companyId}__${date}`;
}

function badgeClass(status: EmailStatus) {
  switch (status) {
    case 'Not Prepared':
      return 'border-slate-300 bg-slate-100 text-slate-700';
    case 'Draft Ready':
      return 'border-surface-border bg-surface text-brand-primary';
    case 'Sent':
      return 'border-emerald-200 bg-emerald-100 text-emerald-700';
    case 'Failed':
      return 'border-rose-200 bg-rose-100 text-rose-700';
    case 'Needs Review':
      return 'border-amber-200 bg-amber-100 text-amber-700';
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700';
  }
}

function formatRowsForBody(items: CompanyAssignmentItem[]) {
  return items
    .map(
      (item) =>
        `- Fahrer: ${item.driverName} | Fahrzeug: ${item.vehiclePlate || '-'} | Start: ${item.startTime || '-'} | Auftrag/Route: ${item.route || '-'} | Fracht: ${item.cargo || '-'} | Pickup: ${item.pickupAddress || '-'} | Delivery: ${item.deliveryAddress || '-'}`,
    )
    .join('\n');
}

function mapApiStatus(status?: CompanyEmailStatus): EmailStatus {
  switch (status) {
    case 'draft_ready':
      return 'Draft Ready';
    case 'sent':
      return 'Sent';
    case 'failed':
      return 'Failed';
    case 'needs_review':
    case 'draft':
      return 'Needs Review';
    default:
      return 'Not Prepared';
  }
}

function formatLastSent(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('de-DE');
}

export function CompanyNotifications({ onAttentionCountChange }: CompanyNotificationsProps) {
  const { t } = useTranslation();
  const { assignments, drivers } = useFleetData();
  const [companyDirectory, setCompanyDirectory] = useState<
    Record<string, { id: string; name: string; email?: string | null }>
  >({});
  const [apiEmails, setApiEmails] = useState<CompanyEmail[]>([]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(true);

  const dates = useMemo(() => [getTodayDate(), getTomorrowDate()], []);

  const driverNameById = useMemo(() => {
    return drivers.reduce<Record<string, string>>((acc, driver) => {
      acc[driver.id] = driver.name;
      return acc;
    }, {});
  }, [drivers]);

  const refreshEmails = useCallback(async () => {
    setLoadingEmails(true);
    try {
      const results = await Promise.all(dates.map((date) => companyEmailsApi.list({ date })));
      setApiEmails(results.flat());
    } catch {
      showToast(t('compNotif.loadFailed'));
    } finally {
      setLoadingEmails(false);
    }
  }, [dates, t]);

  useEffect(() => {
    companiesApi
      .list({ limit: 200 })
      .then((response) => {
        const next: Record<string, { id: string; name: string; email?: string | null }> = {};
        for (const company of response.data) {
          next[company.name] = {
            id: company.id,
            name: company.name,
            email: company.email,
          };
        }
        setCompanyDirectory(next);
      })
      .catch(() => {
        showToast(t('compNotif.loadFailed'));
      });
  }, [t]);

  useEffect(() => {
    void refreshEmails();
  }, [refreshEmails]);

  const groupAssignmentsByCompany = useCallback((date: string) => {
    const grouped = new Map<string, CompanyAssignmentItem[]>();

    assignments
      .filter(
        (assignment) =>
          assignment.date === date
          && assignment.availability === 'Available'
          && assignment.company.trim().length > 0,
      )
      .forEach((assignment) => {
        const item: CompanyAssignmentItem = {
          assignmentId: assignment.id,
          driverName: driverNameById[assignment.driverId] ?? assignment.driverId,
          vehiclePlate: assignment.vehicle,
          startTime: assignment.startTime,
          route: assignment.routeJob,
          cargo: assignment.cargoName,
          pickupAddress: assignment.pickupAddress,
          deliveryAddress: assignment.deliveryAddress,
        };

        const existing = grouped.get(assignment.company) ?? [];
        grouped.set(assignment.company, [...existing, item]);
      });

    return grouped;
  }, [assignments, driverNameById]);

  const groupedByDate = useMemo(() => {
    const output: Record<string, Map<string, CompanyAssignmentItem[]>> = {};
    dates.forEach((date) => {
      output[date] = groupAssignmentsByCompany(date);
    });
    return output;
  }, [dates, groupAssignmentsByCompany]);

  const notificationRows = useMemo(() => {
    const emailByKey = new Map<string, CompanyEmail>();
    for (const email of apiEmails) {
      const date = (email.date ?? '').slice(0, 10);
      emailByKey.set(keyFor(email.companyId, date), email);
    }

    const rows: CompanyNotificationRecord[] = [];

    dates.forEach((date) => {
      groupedByDate[date].forEach((items, companyName) => {
        const company = companyDirectory[companyName];
        if (!company) return;

        const rowKey = keyFor(company.id, date);
        const email = emailByKey.get(rowKey);
        const assignedDrivers = [...new Set(items.map((item) => item.driverName))];
        const vehicles = [...new Set(items.map((item) => item.vehiclePlate).filter(Boolean))];
        const plannedJobs = [...new Set(items.map((item) => item.route).filter(Boolean))];

        rows.push({
          key: rowKey,
          emailId: email?.id,
          companyId: company.id,
          company: companyName,
          date,
          recipientEmail: email?.recipientEmail?.trim() || company.email?.trim() || '-',
          assignments: items,
          assignedDrivers,
          vehicles,
          plannedJobs,
          status: email ? mapApiStatus(email.status) : 'Not Prepared',
          subject: email?.subject ?? '',
          body: email?.body ?? formatRowsForBody(items),
          lastSent: formatLastSent(email?.lastSentAt),
        });
      });
    });

    return rows.sort((a, b) => {
      if (a.date === b.date) return a.company.localeCompare(b.company);
      return a.date.localeCompare(b.date);
    });
  }, [apiEmails, companyDirectory, dates, groupedByDate]);

  const attentionCount = useMemo(() => {
    return notificationRows.filter((row) => row.status === 'Not Prepared' || row.status === 'Needs Review').length;
  }, [notificationRows]);

  useEffect(() => {
    onAttentionCountChange?.(attentionCount);
  }, [attentionCount, onAttentionCountChange]);

  const previewRecord = previewKey ? notificationRows.find((row) => row.key === previewKey) ?? null : null;

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2800);
  }

  async function generateCompanyEmailDraft(row: CompanyNotificationRecord) {
    setBusyKey(row.key);
    try {
      await companyEmailsApi.generateForCompany(row.date, row.companyId);
      await refreshEmails();
      showToast(t('compNotif.draftGenerated'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('compNotif.generateFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  async function sendCompanyEmail(row: CompanyNotificationRecord) {
    if (!row.emailId) {
      showToast(t('compNotif.generateFirst'));
      return;
    }

    setBusyKey(row.key);
    try {
      const result = await companyEmailsApi.send(row.emailId);
      await refreshEmails();
      if (result.mail_sent || result.mail_mode === 'log') {
        showToast(t('compNotif.sendSuccess'));
      } else {
        showToast(t('compNotif.sendFailed'));
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('compNotif.sendFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  async function markCompanyEmailAsSent(row: CompanyNotificationRecord) {
    if (!row.emailId) {
      showToast(t('compNotif.generateFirst'));
      return;
    }

    setBusyKey(row.key);
    try {
      await companyEmailsApi.markSent(row.emailId);
      await refreshEmails();
      showToast(t('compNotif.markedSent'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('compNotif.generateFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  async function savePreviewDraft(subject: string, body: string) {
    if (!previewRecord?.emailId) return;
    try {
      await companyEmailsApi.update(previewRecord.emailId, { subject, body });
      await refreshEmails();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('compNotif.generateFailed'));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('compNotif.title')}</h2>
        <p className="text-sm text-slate-600">{t('compNotif.subtitle')}</p>
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[1520px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('compNotif.colCompany')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colDate')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colAssignedDrivers')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colVehicles')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colPlannedJobs')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colEmailStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colRecipientEmail')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colLastSent')}</th>
                <th className={FLEET_RAW_TH}>{t('compNotif.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {notificationRows.map((row) => {
                const isBusy = busyKey === row.key;

                return (
                  <tr key={row.key} className={FLEET_RAW_TR}>
                    <td className={FLEET_RAW_TD_PRIMARY}>{row.company}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.date}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.assignedDrivers.join(', ') || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.vehicles.join(', ') || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.plannedJobs.join(', ') || '-'}</td>
                    <td className={FLEET_RAW_TD}>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(row.status)}`}>
                        {t(EMAIL_STATUS_KEY[row.status])}
                      </span>
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.recipientEmail}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{row.lastSent ?? '-'}</td>
                    <td className={FLEET_RAW_TD}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void generateCompanyEmailDraft(row)}
                          className="rounded-md border border-brand-primary px-2 py-1 text-xs font-medium text-brand-primary hover:bg-surface disabled:opacity-50"
                        >
                          {t('compNotif.generateDraft')}
                        </button>
                        <button
                          type="button"
                          disabled={!row.emailId}
                          onClick={() => setPreviewKey(row.key)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {t('compNotif.preview')}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || !row.emailId}
                          onClick={() => void markCompanyEmailAsSent(row)}
                          className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {t('compNotif.markSent')}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || !row.emailId}
                          onClick={() => void sendCompanyEmail(row)}
                          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {t('compNotif.sendEmail')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loadingEmails && notificationRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('compNotif.empty')}
                  </td>
                </tr>
              )}

              {loadingEmails && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewRecord && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setPreviewKey(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('compNotif.emailPreview')}</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{t('compNotif.colCompany')}</p>
                  <p className="mt-1 font-medium text-slate-900">{previewRecord.company}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{t('compNotif.colRecipientEmail')}</p>
                  <p className="mt-1 font-medium text-slate-900">{previewRecord.recipientEmail}</p>
                </div>
              </div>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('compNotif.subject')}</span>
                <input
                  defaultValue={previewRecord.subject}
                  onBlur={(event) => {
                    void savePreviewDraft(event.target.value, previewRecord.body);
                  }}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('compNotif.body')}</span>
                <textarea
                  defaultValue={previewRecord.body}
                  onBlur={(event) => {
                    void savePreviewDraft(previewRecord.subject, event.target.value);
                  }}
                  rows={14}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('compNotif.assignmentList')}</p>
                <ul className="mt-2 space-y-2">
                  {previewRecord.assignments.map((item) => (
                    <li key={item.assignmentId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      Fahrer: {item.driverName} | Fahrzeug: {item.vehiclePlate || '-'} | Start: {item.startTime || '-'} | Auftrag/Route:{' '}
                      {item.route || '-'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                disabled={busyKey === previewRecord.key}
                onClick={() => void markCompanyEmailAsSent(previewRecord)}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {t('compNotif.markSent')}
              </button>
              <button
                type="button"
                disabled={busyKey === previewRecord.key}
                onClick={() => void sendCompanyEmail(previewRecord)}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {t('compNotif.sendEmail')}
              </button>
              <button
                type="button"
                onClick={() => setPreviewKey(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {t('compNotif.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-30 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
