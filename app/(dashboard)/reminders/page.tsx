'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { remindersApi } from '@/lib/api';
import type { Reminder, ReminderType } from '@/lib/types';
import { formatDate, daysUntil } from '@/lib/utils';

type ReminderCategory = 'service' | 'vehicle' | 'contact_renewals';
type TrackedDocType = 'license' | 'passport' | 'ruhsat';

interface TrackedDocument {
  id: string;
  person_name: string;
  type: TrackedDocType;
  expiry_date: string;
}

interface ServiceReminderRow {
  id: string;
  vehicle: string;
  service_task: string;
  completed_time: string;
}

const SERVICE_REMINDERS: ServiceReminderRow[] = [
  {
    id: 'sr-001',
    vehicle: 'Mercedes-Benz Actros 1845',
    service_task: 'Tire Rotation',
    completed_time: '2026-05-12',
  },
  {
    id: 'sr-002',
    vehicle: 'MAN TGX 18.510',
    service_task: 'Engine Oil Change',
    completed_time: '2026-05-08',
  },
  {
    id: 'sr-003',
    vehicle: 'Scania R 450',
    service_task: 'Filter Replacement',
    completed_time: '2026-04-29',
  },
  {
    id: 'sr-004',
    vehicle: 'Volvo FH16',
    service_task: 'Brake Inspection',
    completed_time: '2026-04-21',
  },
];

const TRACKED_DOCUMENTS: TrackedDocument[] = [
  { id: 'drv-101-license', person_name: 'Ali Yilmaz', type: 'license', expiry_date: '2026-08-14' },
  { id: 'drv-101-passport', person_name: 'Ali Yilmaz', type: 'passport', expiry_date: '2026-10-20' },
  { id: 'drv-101-ruhsat', person_name: 'Ali Yilmaz', type: 'ruhsat', expiry_date: '2026-07-15' },
  { id: 'drv-102-license', person_name: 'Mehmet Demir', type: 'license', expiry_date: '2026-09-01' },
  { id: 'drv-102-passport', person_name: 'Mehmet Demir', type: 'passport', expiry_date: '2026-11-05' },
  { id: 'drv-102-ruhsat', person_name: 'Mehmet Demir', type: 'ruhsat', expiry_date: '2026-08-10' },
];

const typeLabels: Record<ReminderType, string> = {
  license_expiry: 'License Expiry',
  passport_expiry: 'Passport Expiry',
  tuv_expiry: 'TÜV Expiry',
  sp_expiry: 'SP Expiry',
  contract_expiry: 'Contract Expiry',
  custom: 'Custom',
};

function DaysChip({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return <span className="text-xs font-semibold text-red-600">Expired</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-600">Today</span>;
  return (
    <span
      className={`text-xs font-semibold ${
        days <= 30 ? 'text-red-600' : days <= 60 ? 'text-yellow-600' : 'text-green-600'
      }`}
    >
      {days}d left
    </span>
  );
}

function reminderTypeFromDocType(type: TrackedDocType): ReminderType {
  if (type === 'license') return 'license_expiry';
  if (type === 'passport') return 'passport_expiry';
  return 'custom';
}

function noticeWindow(days: number): number | null {
  if (days < 0 || days > 90) return null;
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  return 90;
}

function getReminderSubcategory(reminder: Reminder): ReminderCategory {
  if (reminder.type === 'tuv_expiry' || reminder.type === 'sp_expiry') return 'vehicle';
  if (reminder.type === 'license_expiry' || reminder.type === 'passport_expiry' || reminder.type === 'contract_expiry') {
    return 'contact_renewals';
  }

  if (reminder.type === 'custom') {
    const text = `${reminder.title} ${reminder.message}`.toLowerCase();
    if (text.includes('ruhsat') || text.includes('vehicle') || text.includes('tuv') || text.includes('sp')) {
      return 'vehicle';
    }
    return 'contact_renewals';
  }

  return 'service';
}

function buildLocalReminders(selectedStatus: string, category: ReminderCategory, resolvedIds: Set<string>): Reminder[] {
  return TRACKED_DOCUMENTS
    .map((doc): Reminder | null => {
      const days = daysUntil(doc.expiry_date);
      if (days === null) return null;

      const notifyBefore = noticeWindow(days);
      if (notifyBefore === null) return null;

      const id = `local-${doc.id}`;
      const reminderStatus = resolvedIds.has(id) ? 'resolved' : 'open';
      if (selectedStatus && selectedStatus !== reminderStatus) return null;

      const typeLabel = doc.type === 'license' ? 'Lisans' : doc.type === 'passport' ? 'Pasaport' : 'Ruhsat';
      const monthLabel = notifyBefore === 30 ? '1 ay' : notifyBefore === 60 ? '2 ay' : '3 ay';

      const reminder: Reminder = {
        id,
        type: reminderTypeFromDocType(doc.type),
        title: `${typeLabel} bitis uyarisi`,
        message: `${doc.person_name} icin ${typeLabel.toLowerCase()} belgesinin bitisine ${monthLabel} kaldi.`,
        due_date: doc.expiry_date,
        notify_before_days: notifyBefore,
        status: reminderStatus,
        related_entity_type: 'driver',
        related_entity_id: doc.id,
        related_entity_name: doc.person_name,
      };

      return getReminderSubcategory(reminder) === category ? reminder : null;
    })
    .filter((item): item is Reminder => item !== null);
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState<ReminderCategory>('service');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resolvedLocalIds, setResolvedLocalIds] = useState<Set<string>>(new Set());

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    let apiReminders: Reminder[] = [];
    try {
      const res = await remindersApi.list({ status: status || undefined });
      apiReminders = Array.isArray(res) ? res : [];
    } catch {
      apiReminders = [];
    } finally {
      const localReminders = buildLocalReminders(status, category, resolvedLocalIds);
      const categoryFilteredApi = apiReminders.filter((reminder) => getReminderSubcategory(reminder) === category);
      setReminders([...localReminders, ...categoryFilteredApi]);
      setLoading(false);
    }
  }, [status, category, resolvedLocalIds]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  async function handleResolve(id: string) {
    if (id.startsWith('local-')) {
      setResolvedLocalIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      return;
    }

    try {
      await remindersApi.resolve(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // handle error
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await remindersApi.generate();
      await fetchReminders();
    } catch {
      // handle error
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">Reminders</h1>
          {!loading && (
            <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
              {reminders.length}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
          Generate Reminders
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={category === 'service' ? 'default' : 'outline'}
            onClick={() => setCategory('service')}
          >
            Service Reminders
          </Button>
          <Button
            size="sm"
            variant={category === 'vehicle' ? 'default' : 'outline'}
            onClick={() => setCategory('vehicle')}
          >
            Vehicle Reminders
          </Button>
          <Button
            size="sm"
            variant={category === 'contact_renewals' ? 'default' : 'outline'}
            onClick={() => setCategory('contact_renewals')}
          >
            Contact Renewals
          </Button>
        </div>

        <div className="flex gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </Select>
        </div>
      </div>

      {/* Reminders list */}
      {category === 'service' ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-700">Vehicle</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Service Task</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Completed Time</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE_REMINDERS.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.vehicle}</td>
                    <td className="px-4 py-3 text-gray-700">{row.service_task}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.completed_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No reminders found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {reminders.map((r) => {
            const days = daysUntil(r.due_date);
            const urgency =
              days === null
                ? 'border-gray-200'
                : days < 0
                ? 'border-red-300 bg-red-50'
                : days <= 30
                ? 'border-red-200 bg-red-50'
                : days <= 60
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-green-200 bg-green-50';

            return (
              <Card key={r.id} className={`border-l-4 ${urgency}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                        <Badge className="bg-gray-100 text-gray-600 text-xs">
                          {typeLabels[r.type] ?? r.type}
                        </Badge>
                        {r.related_entity_name && (
                          <span className="text-xs text-gray-500">· {r.related_entity_name}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{r.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-500">Due: {formatDate(r.due_date)}</span>
                        <DaysChip date={r.due_date} />
                        <span className="text-xs text-gray-400">
                          · {r.notify_before_days}d notice
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        className={
                          r.status === 'open'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-green-100 text-green-700'
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(r.id)}
                        >
                          <CheckCheck className="w-3.5 h-3.5 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
