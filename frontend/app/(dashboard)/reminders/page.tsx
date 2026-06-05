'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { remindersApi } from '@/lib/api';
import type { Reminder } from '@/lib/types';
import { formatDate, daysUntil } from '@/lib/utils';

type ReminderCategory = 'all' | 'vehicle' | 'contact_renewals' | 'service';

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

function getReminderCategory(reminder: Reminder): ReminderCategory {
  if (reminder.type === 'tuv_expiry' || reminder.type === 'sp_expiry') return 'vehicle';
  if (
    reminder.type === 'license_expiry' ||
    reminder.type === 'passport_expiry' ||
    reminder.type === 'contract_expiry'
  ) {
    return 'contact_renewals';
  }
  if (reminder.type === 'custom') {
    const text = `${reminder.title} ${reminder.message}`.toLowerCase();
    if (
      text.includes('ruhsat') ||
      text.includes('vehicle') ||
      text.includes('tuv') ||
      text.includes('sp') ||
      text.includes('service')
    ) {
      return 'vehicle';
    }
    return 'contact_renewals';
  }
  return 'service';
}

export default function RemindersPage() {
  const { t } = useTranslation();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState<ReminderCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await remindersApi.list({ status: status || undefined });
      setReminders(Array.isArray(res) ? res : []);
    } catch (e) {
      setReminders([]);
      setError(e instanceof Error ? e.message : t('reminders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const visibleReminders = useMemo(() => {
    if (category === 'all') return reminders;
    return reminders.filter((r) => getReminderCategory(r) === category);
  }, [reminders, category]);

  async function handleResolve(id: string) {
    try {
      await remindersApi.resolve(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('reminders.resolveError'));
    }
  }

  async function handleIgnore(id: string) {
    try {
      await remindersApi.ignore(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
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
          <Bell className="w-6 h-6 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">{t('reminders.title')}</h1>
          {!loading && (
            <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
              {visibleReminders.length}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
          {t('reminders.generate')}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={category === 'all' ? 'default' : 'outline'}
            onClick={() => setCategory('all')}
          >
            {t('reminders.catAll')}
          </Button>
          <Button
            size="sm"
            variant={category === 'vehicle' ? 'default' : 'outline'}
            onClick={() => setCategory('vehicle')}
          >
            {t('reminders.catVehicle')}
          </Button>
          <Button
            size="sm"
            variant={category === 'contact_renewals' ? 'default' : 'outline'}
            onClick={() => setCategory('contact_renewals')}
          >
            {t('reminders.catContact')}
          </Button>
          <Button
            size="sm"
            variant={category === 'service' ? 'default' : 'outline'}
            onClick={() => setCategory('service')}
          >
            {t('reminders.catService')}
          </Button>
        </div>

        <div className="flex gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">{t('reminders.statusAll')}</option>
            <option value="open">{t('reminders.statusOpen')}</option>
            <option value="resolved">{t('reminders.statusResolved')}</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-gray-500">
            <p>{error}</p>
            <Button variant="outline" className="mt-3" onClick={fetchReminders}>
              {t('reminders.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : visibleReminders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t('reminders.empty')}</p>
          {category === 'service' && (
            <p className="text-xs mt-2">{t('reminders.serviceHint')}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {visibleReminders.map((r) => {
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
                          {t(`reminders.type.${r.type}`)}
                        </Badge>
                        {r.related_entity_name && (
                          <span className="text-xs text-gray-500">· {r.related_entity_name}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{r.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-500">{t('reminders.due')} {formatDate(r.due_date)}</span>
                        <DaysChip date={r.due_date} />
                        <span className="text-xs text-gray-400">
                          · {t('reminders.notice', { days: r.notify_before_days })}
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
                        {r.status === 'open'
                          ? t('reminders.statusOpen')
                          : r.status === 'resolved'
                            ? t('reminders.statusResolved')
                            : r.status}
                      </Badge>
                      {r.status === 'open' && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleResolve(r.id)}>
                            <CheckCheck className="w-3.5 h-3.5 mr-1" />
                            {t('reminders.resolve')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleIgnore(r.id)}>
                            <X className="w-3.5 h-3.5 mr-1" />
                            {t('reminders.ignore')}
                          </Button>
                        </div>
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
