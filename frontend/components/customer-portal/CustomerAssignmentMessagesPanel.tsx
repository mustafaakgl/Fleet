'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { assignmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { CustomerAssignmentMessage } from '@/lib/types';

interface CustomerAssignmentMessagesPanelProps {
  assignmentId: string | null;
  variant?: 'fleet' | 'portal';
}

export function CustomerAssignmentMessagesPanel({
  assignmentId,
  variant = 'fleet',
}: CustomerAssignmentMessagesPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<CustomerAssignmentMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assignmentId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await assignmentsApi.listCustomerMessages(assignmentId);
      setMessages(rows);
    } catch {
      setError(t('customerMessages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSend() {
    if (!assignmentId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const sent = await assignmentsApi.sendCustomerMessage(assignmentId, draft.trim());
      setMessages((current) => [...current, sent]);
      setDraft('');
    } catch {
      setError(t('customerMessages.sendError'));
    } finally {
      setSending(false);
    }
  }

  if (!assignmentId) return null;

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <MessageSquare className="h-3.5 w-3.5" />
        {t('customerMessages.title')}
      </h4>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('common.loading')}
        </p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-slate-500">{t('customerMessages.empty')}</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-md px-2.5 py-2 text-xs ${
                message.isFromCustomer
                  ? 'ml-4 bg-white text-slate-800 shadow-sm'
                  : 'mr-4 bg-blue-100 text-blue-950'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span className="font-semibold">
                  {message.isFromCustomer
                    ? t('customerMessages.fromCustomer', { name: message.senderName })
                    : t('customerMessages.fromFleet')}
                </span>
                <span>{new Date(message.createdAt).toLocaleString('de-DE')}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      {variant === 'fleet' ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder={t('customerMessages.replyPlaceholder')}
            className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            {sending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('customerMessages.sendReply')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
