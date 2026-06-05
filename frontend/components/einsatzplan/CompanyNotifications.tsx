'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTodayDate, getTomorrowDate, useFleetData } from '@/context/FleetDataContext';

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
  assignmentSignature: string;
  lastSent: string | null;
}

interface CompanyNotificationsProps {
  onAttentionCountChange?: (count: number) => void;
}

const COMPANY_EMAILS: Record<string, string> = {
  DHL: 'dispo@dhl-example.com',
  Amazon: 'logistics@amazon-example.com',
  UPS: 'dispatch@ups-example.com',
  Hermes: 'touren@hermes-example.com',
  'DB Schenker': 'planung@dbschenker-example.com',
};

function keyFor(company: string, date: string) {
  return `${company}__${date}`;
}

function badgeClass(status: EmailStatus) {
  switch (status) {
    case 'Not Prepared':
      return 'border-slate-300 bg-slate-100 text-slate-700';
    case 'Draft Ready':
      return 'border-blue-200 bg-blue-100 text-blue-700';
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

function buildAssignmentSignature(items: CompanyAssignmentItem[]) {
  return items
    .map(
      (item) =>
        `${item.assignmentId}|${item.driverName}|${item.vehiclePlate}|${item.startTime}|${item.route}|${item.cargo ?? ''}|${item.pickupAddress ?? ''}|${item.deliveryAddress ?? ''}`,
    )
    .sort()
    .join('||');
}

function formatRowsForBody(items: CompanyAssignmentItem[]) {
  return items
    .map(
      (item) =>
        `- Fahrer: ${item.driverName} | Fahrzeug: ${item.vehiclePlate || '-'} | Start: ${item.startTime || '-'} | Auftrag/Route: ${item.route || '-'} | Fracht: ${item.cargo || '-'} | Pickup: ${item.pickupAddress || '-'} | Delivery: ${item.deliveryAddress || '-'}`,
    )
    .join('\n');
}

export function CompanyNotifications({ onAttentionCountChange }: CompanyNotificationsProps) {
  const { t } = useTranslation();
  const { assignments, drivers } = useFleetData();
  const [notificationState, setNotificationState] = useState<Record<string, CompanyNotificationRecord>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const previousSignaturesRef = useRef<Record<string, string>>({});

  const dates = useMemo(() => [getTodayDate(), getTomorrowDate()], []);

  const driverNameById = useMemo(() => {
    return drivers.reduce<Record<string, string>>((acc, driver) => {
      acc[driver.id] = driver.name;
      return acc;
    }, {});
  }, [drivers]);

  function groupAssignmentsByCompany(date: string) {
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
  }

  const groupedByDate = useMemo(() => {
    const output: Record<string, Map<string, CompanyAssignmentItem[]>> = {};
    dates.forEach((date) => {
      output[date] = groupAssignmentsByCompany(date);
    });
    return output;
  }, [assignments, dates, driverNameById]);

  const assignmentSignatures = useMemo(() => {
    const signatures: Record<string, string> = {};

    dates.forEach((date) => {
      groupedByDate[date].forEach((items, company) => {
        signatures[keyFor(company, date)] = buildAssignmentSignature(items);
      });
    });

    return signatures;
  }, [dates, groupedByDate]);

  function generateCompanyEmailDraft(company: string, date: string) {
    const items = groupedByDate[date].get(company) ?? [];
    const rows = formatRowsForBody(items);
    const subject = `Einsatzplan für ${date} – ${company}`;
    const body = [
      'Sehr geehrte Damen und Herren,',
      '',
      `anbei erhalten Sie den Einsatzplan für ${date}.`,
      '',
      `Firma: ${company}`,
      '',
      'Geplante Fahrer und Fahrzeuge:',
      '',
      rows,
      '',
      'Mit freundlichen Grüßen',
      'Fleet Management Team',
    ].join('\n');

    const nextKey = keyFor(company, date);
    const nextSignature = assignmentSignatures[nextKey] ?? '';

    setNotificationState((current) => {
      const existing = current[nextKey];
      return {
        ...current,
        [nextKey]: {
          company,
          date,
          recipientEmail: COMPANY_EMAILS[company] ?? `ops@${company.toLowerCase().replace(/\s+/g, '-')}-example.com`,
          assignments: items,
          assignedDrivers: [...new Set(items.map((item) => item.driverName))],
          vehicles: [...new Set(items.map((item) => item.vehiclePlate).filter(Boolean))],
          plannedJobs: [...new Set(items.map((item) => item.route).filter(Boolean))],
          status: 'Draft Ready',
          subject,
          body,
          assignmentSignature: nextSignature,
          lastSent: existing?.lastSent ?? null,
        },
      };
    });
  }

  function markCompanyEmailAsSent(company: string, date: string) {
    const nextKey = keyFor(company, date);
    const sentAt = new Date().toLocaleString('de-DE');

    setNotificationState((current) => {
      const existing = current[nextKey];
      if (!existing) return current;

      return {
        ...current,
        [nextKey]: {
          ...existing,
          status: 'Sent',
          lastSent: sentAt,
        },
      };
    });
  }

  function updateCompanyNotificationAfterAssignmentChange(company: string, date: string) {
    const nextKey = keyFor(company, date);
    const nextSignature = assignmentSignatures[nextKey] ?? '';

    if (!nextSignature) return;

    const items = groupedByDate[date].get(company) ?? [];

    setNotificationState((current) => {
      const existing = current[nextKey];

      if (!existing) {
        return {
          ...current,
          [nextKey]: {
            company,
            date,
            recipientEmail: COMPANY_EMAILS[company] ?? `ops@${company.toLowerCase().replace(/\s+/g, '-')}-example.com`,
            assignments: items,
            assignedDrivers: [...new Set(items.map((item) => item.driverName))],
            vehicles: [...new Set(items.map((item) => item.vehiclePlate).filter(Boolean))],
            plannedJobs: [...new Set(items.map((item) => item.route).filter(Boolean))],
            status: 'Not Prepared',
            subject: '',
            body: '',
            assignmentSignature: nextSignature,
            lastSent: null,
          },
        };
      }

      if (existing.assignmentSignature === nextSignature) {
        return {
          ...current,
          [nextKey]: {
            ...existing,
            assignments: items,
            assignedDrivers: [...new Set(items.map((item) => item.driverName))],
            vehicles: [...new Set(items.map((item) => item.vehiclePlate).filter(Boolean))],
            plannedJobs: [...new Set(items.map((item) => item.route).filter(Boolean))],
          },
        };
      }

      const hasDraft = existing.subject.trim().length > 0 || existing.body.trim().length > 0;

      return {
        ...current,
        [nextKey]: {
          ...existing,
          assignments: items,
          assignedDrivers: [...new Set(items.map((item) => item.driverName))],
          vehicles: [...new Set(items.map((item) => item.vehiclePlate).filter(Boolean))],
          plannedJobs: [...new Set(items.map((item) => item.route).filter(Boolean))],
          assignmentSignature: nextSignature,
          status: hasDraft ? 'Needs Review' : 'Not Prepared',
        },
      };
    });
  }

  useEffect(() => {
    const activeKeys = new Set(Object.keys(assignmentSignatures));

    setNotificationState((current) => {
      const next: Record<string, CompanyNotificationRecord> = {};
      Object.entries(current).forEach(([currentKey, value]) => {
        if (activeKeys.has(currentKey)) {
          next[currentKey] = value;
        }
      });
      return next;
    });

    Object.keys(assignmentSignatures).forEach((currentKey) => {
      const previousSignature = previousSignaturesRef.current[currentKey];
      const nextSignature = assignmentSignatures[currentKey];
      if (previousSignature !== nextSignature) {
        const [company, date] = currentKey.split('__');
        updateCompanyNotificationAfterAssignmentChange(company, date);
      }
    });

    previousSignaturesRef.current = assignmentSignatures;
  }, [assignmentSignatures]);

  const notificationRows = useMemo(() => {
    return Object.values(notificationState)
      .sort((a, b) => {
        if (a.date === b.date) return a.company.localeCompare(b.company);
        return a.date.localeCompare(b.date);
      });
  }, [notificationState]);

  const attentionCount = useMemo(() => {
    return notificationRows.filter((row) => row.status === 'Not Prepared' || row.status === 'Needs Review').length;
  }, [notificationRows]);

  useEffect(() => {
    onAttentionCountChange?.(attentionCount);
  }, [attentionCount, onAttentionCountChange]);

  const previewRecord = previewKey ? notificationState[previewKey] : null;

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('compNotif.title')}</h2>
        <p className="text-sm text-slate-600">{t('compNotif.subtitle')}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1520px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colCompany')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colDate')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colAssignedDrivers')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colVehicles')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colPlannedJobs')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colEmailStatus')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colRecipientEmail')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colLastSent')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('compNotif.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {notificationRows.map((row) => {
                const rowKey = keyFor(row.company, row.date);

                return (
                  <tr key={rowKey} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{row.company}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.date}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.assignedDrivers.join(', ') || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.vehicles.join(', ') || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.plannedJobs.join(', ') || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(row.status)}`}>
                        {t(EMAIL_STATUS_KEY[row.status])}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.recipientEmail}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.lastSent ?? '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => generateCompanyEmailDraft(row.company, row.date)}
                          className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          {t('compNotif.generateDraft')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewKey(rowKey)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t('compNotif.preview')}
                        </button>
                        <button
                          type="button"
                          onClick={() => markCompanyEmailAsSent(row.company, row.date)}
                          className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          {t('compNotif.markSent')}
                        </button>
                        <button
                          type="button"
                          onClick={() => showToast(t('compNotif.sendToast'))}
                          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        >
                          {t('compNotif.sendEmail')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {notificationRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('compNotif.empty')}
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
                  value={previewRecord.subject}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNotificationState((current) => ({
                      ...current,
                      [keyFor(previewRecord.company, previewRecord.date)]: {
                        ...previewRecord,
                        subject: value,
                      },
                    }));
                  }}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('compNotif.body')}</span>
                <textarea
                  value={previewRecord.body}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNotificationState((current) => ({
                      ...current,
                      [keyFor(previewRecord.company, previewRecord.date)]: {
                        ...previewRecord,
                        body: value,
                      },
                    }));
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
                onClick={() => markCompanyEmailAsSent(previewRecord.company, previewRecord.date)}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                {t('compNotif.markSent')}
              </button>
              <button
                type="button"
                onClick={() => showToast(t('compNotif.sendToast'))}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
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