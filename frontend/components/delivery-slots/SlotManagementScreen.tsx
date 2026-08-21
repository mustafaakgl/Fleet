'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Copy, Link2, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { deliverySlotsApi } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { slotErrorKey } from '@/lib/dispatch-view';
import type {
  DeliverySlotKind,
  ManagedSlotRow,
  SlotInvitationRow,
} from '@/lib/types';

/** Davet linkinin gidecegi public sayfa. Token FRAGMENT'ta tasiniyor. */
function invitationLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/public/delivery-slot#token=${encodeURIComponent(token)}`;
}

/**
 * TESLIMAT SLOTLARI — IC YONETIM (Faz 17g).
 *
 * DUZ METIN TOKEN YALNIZCA URETILDIGI ANDA, BIR KEZ gorunur. Liste ucu
 * yalnizca kirilmis oneki tasiyor; token ozeti hicbir uctan cikmiyor. Bu
 * yuzden ekran, olusturulan linki KAPATILANA KADAR gosteriyor ve "bir daha
 * gosterilemez" uyarisini birlikte veriyor — kullanici kopyalamadan kapatirsa
 * yeni bir davet uretmek zorunda.
 *
 * LINK FRAGMENT TASIYOR (`#token=`): fragment sunucuya HIC gitmez ve `Referer`
 * ile de tasinmaz. `?token=` olsaydi deger ters vekil loglarina, tarayici
 * gecmisine ve `Referer` basligina duserdi.
 */
export function SlotManagementScreen() {
  const { t, i18n } = useTranslation();

  const [slots, setSlots] = useState<ManagedSlotRow[]>([]);
  const [invitations, setInvitations] = useState<SlotInvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Slot formu ---
  const [locationId, setLocationId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [resourceRef, setResourceRef] = useState('');
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null);

  // --- Davet formu ---
  const [consignmentId, setConsignmentId] = useState('');
  const [kind, setKind] = useState<DeliverySlotKind>('delivery');
  const [issued, setIssued] = useState<{ token: string; expiresAt: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorKey(null);
    try {
      const [slotPage, invitationPage] = await Promise.all([
        deliverySlotsApi.listSlots({ pageSize: 50 }, controller.signal),
        deliverySlotsApi.listInvitations({ pageSize: 50 }, controller.signal),
      ]);
      setSlots(slotPage.rows);
      setInvitations(invitationPage.rows);
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorKey(slotErrorKey(error, 'slots.error.load'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const createSlot = useCallback(async () => {
    setBusy(true);
    setFormErrorKey(null);
    try {
      await deliverySlotsApi.createSlot({
        locationId: locationId.trim(),
        // `datetime-local` yerel bir an verir; UTC'ye cevirip gonderiyoruz.
        // Sunucu `timezone`u konumdan ya da kiracidan KENDISI cozuyor.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        capacity: Number(capacity),
        resourceRef: resourceRef.trim() || undefined,
      });
      showToast({ message: t('slots.slot.created'), type: 'success' });
      setStartsAt('');
      setEndsAt('');
      setResourceRef('');
      await load();
    } catch (error) {
      const key = slotErrorKey(error, 'slots.error.createSlot');
      setFormErrorKey(key);
      showToast({ message: t(key), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [capacity, endsAt, load, locationId, resourceRef, startsAt, t]);

  const updateSlot = useCallback(
    async (slot: ManagedSlotRow, patch: { capacity?: number; status?: 'open' | 'closed' }) => {
      setBusy(true);
      try {
        await deliverySlotsApi.updateSlot(slot.id, patch);
        showToast({ message: t('slots.slot.updated'), type: 'success' });
        await load();
      } catch (error) {
        showToast({ message: t(slotErrorKey(error, 'slots.error.updateSlot')), type: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const createInvitation = useCallback(async () => {
    setBusy(true);
    setFormErrorKey(null);
    try {
      const result = await deliverySlotsApi.createInvitation({
        consignmentId: consignmentId.trim(),
        kind,
      });
      setIssued({ token: result.token, expiresAt: result.expiresAt });
      showToast({ message: t('slots.invitation.created'), type: 'success' });
      await load();
    } catch (error) {
      const key = slotErrorKey(error, 'slots.error.createInvitation');
      setFormErrorKey(key);
      showToast({ message: t(key), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [consignmentId, kind, load, t]);

  const revokeInvitation = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await deliverySlotsApi.revokeInvitation(id);
        showToast({ message: t('slots.invitation.revoked'), type: 'success' });
        await load();
      } catch (error) {
        showToast({ message: t(slotErrorKey(error, 'slots.error.revoke')), type: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const reissueInvitation = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const result = await deliverySlotsApi.reissueInvitation(id);
        setIssued({ token: result.token, expiresAt: result.expiresAt });
        showToast({ message: t('slots.invitation.reissued'), type: 'success' });
        await load();
      } catch (error) {
        showToast({ message: t(slotErrorKey(error, 'slots.error.reissue')), type: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  const copyLink = useCallback(
    async (token: string) => {
      try {
        await navigator.clipboard.writeText(invitationLink(token));
        showToast({ message: t('slots.invitation.copied'), type: 'success' });
      } catch {
        // Pano izni yoksa link zaten ekranda seciliyor durumda.
        showToast({ message: t('slots.invitation.copyFailed'), type: 'error' });
      }
    },
    [t],
  );

  const slotFormValid =
    locationId.trim().length > 0 &&
    startsAt.length > 0 &&
    endsAt.length > 0 &&
    Number(capacity) >= 1;

  return (
    <div className="space-y-4">
      {/* --- Yeni davet: TOKEN BIR KEZ --- */}
      {issued ? (
        <Card className="border-amber-300 bg-amber-50" data-testid="slot-issued-link">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <Link2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t('slots.invitation.linkTitle')}
            </CardTitle>
            <p className="text-sm text-amber-900">{t('slots.invitation.linkOnce')}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="sr-only" htmlFor="slot-issued-value">
              {t('slots.invitation.linkTitle')}
            </label>
            <input
              id="slot-issued-value"
              data-testid="slot-issued-value"
              readOnly
              className="w-full rounded-md border border-amber-300 bg-white px-2 py-2 font-mono text-xs text-slate-900"
              value={invitationLink(issued.token)}
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="text-xs text-amber-900">
              {t('slots.invitation.expiresAt', {
                value: dateTimeFormat.format(new Date(issued.expiresAt)),
              })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void copyLink(issued.token)} data-testid="slot-copy-link">
                <span className="inline-flex items-center">
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('slots.invitation.copy')}
                </span>
              </Button>
              <Button variant="outline" onClick={() => setIssued(null)}>
                {t('slots.invitation.dismiss')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Slot tanimlama --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t('slots.slot.formTitle')}</CardTitle>
          <p className="text-sm text-slate-500">{t('slots.slot.formHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              id="slot-location"
              label={t('slots.slot.locationId')}
              value={locationId}
              onChange={setLocationId}
            />
            <Field
              id="slot-starts"
              type="datetime-local"
              label={t('slots.slot.startsAt')}
              value={startsAt}
              onChange={setStartsAt}
            />
            <Field
              id="slot-ends"
              type="datetime-local"
              label={t('slots.slot.endsAt')}
              value={endsAt}
              onChange={setEndsAt}
            />
            <Field
              id="slot-capacity"
              type="number"
              label={t('slots.slot.capacity')}
              value={capacity}
              onChange={setCapacity}
            />
            <Field
              id="slot-resource"
              label={t('slots.slot.resourceRef')}
              value={resourceRef}
              onChange={setResourceRef}
            />
          </div>
          {formErrorKey ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              {t(formErrorKey)}
            </p>
          ) : null}
          <Button
            onClick={() => void createSlot()}
            disabled={busy || !slotFormValid}
            data-testid="slot-create"
          >
            {t('slots.slot.create')}
          </Button>
        </CardContent>
      </Card>

      {/* --- Davet olusturma --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t('slots.invitation.formTitle')}</CardTitle>
          <p className="text-sm text-slate-500">{t('slots.invitation.formHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              id="invitation-consignment"
              label={t('slots.invitation.consignmentId')}
              value={consignmentId}
              onChange={setConsignmentId}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="invitation-kind" className="text-sm font-medium text-slate-800">
                {t('slots.invitation.kind')}
              </label>
              <select
                id="invitation-kind"
                data-testid="invitation-kind"
                className={FLEET_FILTER_SELECT}
                value={kind}
                onChange={(event) => setKind(event.target.value as DeliverySlotKind)}
              >
                <option value="pickup">{t('slots.kind.pickup')}</option>
                <option value="delivery">{t('slots.kind.delivery')}</option>
              </select>
            </div>
          </div>
          <Button
            onClick={() => void createInvitation()}
            disabled={busy || consignmentId.trim().length === 0}
            data-testid="invitation-create"
          >
            {t('slots.invitation.create')}
          </Button>
        </CardContent>
      </Card>

      {/* --- Slot listesi --- */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('slots.slot.listTitle')}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <span className="inline-flex items-center">
                <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('slots.refresh')}
              </span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : errorKey ? (
            <p role="alert" className="text-sm text-red-700">
              {t(errorKey)}
            </p>
          ) : slots.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t('slots.slot.emptyTitle')}
              subtitle={t('slots.slot.emptySubtitle')}
            />
          ) : (
            <ul className="space-y-2" data-testid="slot-list">
              {slots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`slot-row-${slot.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {dateTimeFormat.format(new Date(slot.startsAt))} –{' '}
                      {dateTimeFormat.format(new Date(slot.endsAt))}
                    </p>
                    <p className="break-words text-xs text-slate-600">
                      {slot.resourceRef || t('slots.slot.noResource')} · {slot.timezone}
                    </p>
                    <p className="text-xs text-slate-700">
                      {t('slots.slot.capacityLine', {
                        booked: slot.bookedCount,
                        capacity: slot.capacity,
                        remaining: slot.remaining,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={slot.status === 'open' ? 'success' : 'secondary'}>
                      {t(`slots.slot.status.${slot.status}`)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void updateSlot(slot, {
                          status: slot.status === 'open' ? 'closed' : 'open',
                        })
                      }
                      data-testid={`slot-toggle-${slot.id}`}
                    >
                      {t(slot.status === 'open' ? 'slots.slot.close' : 'slots.slot.reopen')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Davet listesi ve gecmis --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t('slots.invitation.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : invitations.length === 0 ? (
            <EmptyState
              icon={Link2}
              title={t('slots.invitation.emptyTitle')}
              subtitle={t('slots.invitation.emptySubtitle')}
            />
          ) : (
            <ul className="space-y-2" data-testid="invitation-list">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`invitation-row-${invitation.id}`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {t(`slots.kind.${invitation.kind}`)}
                      <Badge variant="outline">{`${invitation.tokenPrefix}…`}</Badge>
                      {invitation.locked ? (
                        <Badge variant="destructive">
                          <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                          {t('slots.invitation.locked')}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="break-words text-xs text-slate-600">
                      {t('slots.invitation.expiresAt', {
                        value: dateTimeFormat.format(new Date(invitation.expiresAt)),
                      })}
                      {invitation.failedAttempts > 0
                        ? ` · ${t('slots.invitation.failedAttempts', {
                            count: invitation.failedAttempts,
                          })}`
                        : ''}
                    </p>
                    {invitation.activeBooking ? (
                      <p className="text-xs text-green-800" data-testid={`invitation-booking-${invitation.id}`}>
                        {t('slots.invitation.booked', {
                          value: dateTimeFormat.format(new Date(invitation.activeBooking.bookedAt)),
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600">{t('slots.invitation.notBooked')}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        invitation.status === 'open'
                          ? 'default'
                          : invitation.status === 'booked'
                            ? 'success'
                            : 'secondary'
                      }
                    >
                      {t(`slots.invitation.status.${invitation.status}`)}
                    </Badge>
                    {invitation.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void revokeInvitation(invitation.id)}
                        data-testid={`invitation-revoke-${invitation.id}`}
                      >
                        <span className="inline-flex items-center">
                          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          {t('slots.invitation.revoke')}
                        </span>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void reissueInvitation(invitation.id)}
                      data-testid={`invitation-reissue-${invitation.id}`}
                    >
                      {t('slots.invitation.reissue')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type={type}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#1a4d7a]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
