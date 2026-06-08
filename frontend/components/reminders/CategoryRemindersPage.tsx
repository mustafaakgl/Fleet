'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, CheckCheck, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { remindersApi } from '@/lib/api';
import type { Reminder } from '@/lib/types';
import { getReminderCategory, normalizeReminder, type ReminderCategory } from '@/lib/reminder-utils';
import { formatDate, daysUntil } from '@/lib/utils';

function DaysChip({ date }: { date: string }) {
  const { t } = useTranslation();
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return <span className="text-xs font-semibold text-red-600">{t('reminders.expired')}</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-600">{t('reminders.today')}</span>;
  return (
    <span
      className={`text-xs font-semibold ${
        days <= 30 ? 'text-red-600' : days <= 60 ? 'text-yellow-600' : 'text-green-600'
      }`}
    >
      {t('reminders.daysLeft', { days })}
    </span>
  );
}

export function CategoryRemindersPage({ category }: { category: ReminderCategory }) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [status, setStatus] = useState(() => searchParams.get('status') || 'open');
  const [urgency, setUrgency] = useState<'all' | 'overdue' | 'due_soon'>(() => {
    const raw = searchParams.get('urgency');
    if (raw === 'overdue' || raw === 'due_soon') return raw;
    return 'all';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const titleKey =
    category === 'vehicle'
      ? 'vehicleReminders.title'
      : category === 'contact'
        ? 'contactReminders.title'
        : 'serviceReminders.title';

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await remindersApi.list({ status: status || undefined });
      const normalized = (Array.isArray(res) ? res : []).map((row) =>
        normalizeReminder(row as unknown as Record<string, unknown>),
      );
      setReminders(normalized);
    } catch (e) {
      setReminders([]);
      setError(e instanceof Error ? e.message : t('reminders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    void fetchReminders();
  }, [fetchReminders]);

  const visibleReminders = useMemo(() => {
    let rows = reminders.filter((reminder) => getReminderCategory(reminder) === category);
    if (urgency === 'overdue') {
      rows = rows.filter((reminder) => {
        const days = daysUntil(reminder.due_date);
        return days !== null && days < 0;
      });
    } else if (urgency === 'due_soon') {
      rows = rows.filter((reminder) => {
        const days = daysUntil(reminder.due_date);
        return days !== null && days >= 0 && days <= 30;
      });
    }
    return rows;
  }, [reminders, category, urgency]);

  async function handleResolve(id: string) {
    try {
      await remindersApi.resolve(id);
      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('reminders.resolveError'));
    }
  }

  async function handleIgnore(id: string) {
    try {
      await remindersApi.ignore(id);
      setReminders((prev) => prev.filter((reminder) => reminder.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('reminders.ignoreError'));
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await remindersApi.generate();
      await fetchReminders();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('reminders.generateError'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">{t(titleKey)}</h1>
          {!loading && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-500">
              {visibleReminders.length}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleGenerate()} disabled={generating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {t('reminders.generate')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={urgency === 'all' ? 'default' : 'outline'} onClick={() => setUrgency('all')}>
          {t('reminders.catAll')}
        </Button>
        <Button size="sm" variant={urgency === 'due_soon' ? 'default' : 'outline'} onClick={() => setUrgency('due_soon')}>
          {t('dashboard.widgets.dueSoon')}
        </Button>
        <Button size="sm" variant={urgency === 'overdue' ? 'default' : 'outline'} onClick={() => setUrgency('overdue')}>
          {t('dashboard.widgets.overdue')}
        </Button>
      </div>

      <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-40">
        <option value="">{t('reminders.statusAll')}</option>
        <option value="open">{t('reminders.statusOpen')}</option>
        <option value="resolved">{t('reminders.statusResolved')}</option>
      </Select>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-gray-500">
            <p>{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => void fetchReminders()}>
              {t('reminders.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : visibleReminders.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Bell className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>{t('reminders.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visibleReminders.map((reminder) => {
            const days = daysUntil(reminder.due_date);
            const urgencyClass =
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
              <Card key={reminder.id} className={`border-l-4 ${urgencyClass}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{reminder.title}</p>
                        <Badge className="bg-gray-100 text-xs text-gray-600">
                          {t(`reminders.type.${reminder.type}`)}
                        </Badge>
                        {reminder.related_entity_name ? (
                          <span className="text-xs text-gray-500">· {reminder.related_entity_name}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{reminder.message}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {t('reminders.due')} {formatDate(reminder.due_date)}
                        </span>
                        <DaysChip date={reminder.due_date} />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-orange-100 text-orange-700">{t('reminders.statusOpen')}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleResolve(reminder.id)}>
                          <CheckCheck className="mr-1 h-3.5 w-3.5" />
                          {t('reminders.resolve')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleIgnore(reminder.id)}>
                          <X className="mr-1 h-3.5 w-3.5" />
                          {t('reminders.ignore')}
                        </Button>
                      </div>
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
