'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { publicSlotApi } from '@/lib/api';
import { slotErrorKey } from '@/lib/dispatch-view';
import type { PublicSlotView } from '@/lib/types';

type Phase = 'starting' | 'ready' | 'invalid';

/**
 * Token'i URL FRAGMENT'indan okur ve fragment'i ANINDA temizler.
 *
 * `history.replaceState`: adres cubugundan ve GECMIS KAYDINDAN siliyor.
 * `pushState` olsaydi kullanici "geri" tusuyla token'li adrese donebilirdi.
 * Temizleme, token okunur okunmaz — ag istegi BEKLENMEDEN — yapiliyor:
 * istek sirasinda kullanici sekmeyi paylasabilir ya da ekran goruntusu
 * alabilir.
 */
function takeTokenFromFragment(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!raw) return null;

  const token = new URLSearchParams(raw).get('token');
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
  return token && token.trim() ? token.trim() : null;
}

/**
 * PUBLIC SLOT REZERVASYONU (Faz 17g).
 *
 * TOKEN HICBIR YERDE SAKLANMIYOR: ne `localStorage`, ne `sessionStorage`, ne
 * bir React state'i, ne de modul degiskeni. Fragment'tan okunuyor, TEK bir
 * `POST session` istegiyle gonderiliyor ve yerel degiskenle birlikte
 * kayboluyor. Sonraki her istek HttpOnly cookie ile gidiyor — cookie'ye
 * JavaScript erisemedigi icin bir XSS onu okuyamaz.
 *
 * HATA MESAJINDA TOKEN YOK: asagida hicbir `catch` yakalanan hatayi ya da
 * URL'yi metne cevirmiyor; yalnizca sunucunun makine kodu bir CEVIRI
 * ANAHTARINA donuyor. Ham hata nesnesini gostermek, token'i ekrana ve hata
 * loguna tasirdi.
 *
 * BUTUN GECERSIZ DURUMLAR AYNI EKRANI GOSTERIR: gecersiz, suresi dolmus,
 * iptal edilmis, kilitli ve bayat davet — hepsi ayni guvenli mesaj. Ayirt
 * edilebilselerdi linki eline gecirmis biri kalemin VARLIGINI ogrenirdi.
 */
export function PublicSlotBooking() {
  const { t, i18n } = useTranslation();

  const [phase, setPhase] = useState<Phase>('starting');
  const [slots, setSlots] = useState<PublicSlotView[]>([]);
  const [kind, setKind] = useState<string>('delivery');
  const [bookedSlotId, setBookedSlotId] = useState<string | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'full',
        timeStyle: 'short',
      }),
    [i18n.language],
  );

  const refresh = useCallback(async () => {
    const response = await publicSlotApi.listSlots();
    setKind(response.kind);
    setSlots(response.slots);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const token = takeTokenFromFragment();
      try {
        // Token VARSA yeni oturum acilir. Yoksa MEVCUT cookie denenir: sayfa
        // yenilendiginde kullanici linke tekrar tiklamak zorunda kalmasin.
        if (token) {
          const session = await publicSlotApi.openSession(token);
          if (!cancelled) setKind(session.kind);
        }
        await refresh();
        if (!cancelled) setPhase('ready');
      } catch {
        // Hata NESNESI kullanilmiyor: icinde istek URL'si ve govdesi olabilir.
        if (!cancelled) setPhase('invalid');
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const book = useCallback(
    async (slotId: string) => {
      setBusySlotId(slotId);
      setErrorKey(null);
      setNoticeKey(null);
      try {
        const result = await publicSlotApi.book(slotId);
        setBookedSlotId(slotId);
        setNoticeKey(result.repeated ? 'publicSlot.alreadyBooked' : 'publicSlot.bookingConfirmed');
        await refresh();
      } catch (error) {
        setErrorKey(slotErrorKey(error, 'publicSlot.error.generic'));
      } finally {
        setBusySlotId(null);
      }
    },
    [refresh],
  );

  const cancel = useCallback(async () => {
    setBusySlotId('cancel');
    setErrorKey(null);
    setNoticeKey(null);
    try {
      const result = await publicSlotApi.cancel();
      setBookedSlotId(null);
      setNoticeKey(result.cancelled ? 'publicSlot.cancelConfirmed' : 'publicSlot.nothingToCancel');
      await refresh();
    } catch (error) {
      setErrorKey(slotErrorKey(error, 'publicSlot.error.generic'));
    } finally {
      setBusySlotId(null);
    }
  }, [refresh]);

  const finish = useCallback(async () => {
    try {
      await publicSlotApi.closeSession();
    } finally {
      setPhase('invalid');
      setSlots([]);
    }
  }, []);

  if (phase === 'starting') {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('publicSlot.loading')}
      </p>
    );
  }

  if (phase === 'invalid') {
    return (
      <div
        role="alert"
        className="mx-auto max-w-lg rounded-lg border border-slate-300 bg-white p-6 text-center"
        data-testid="public-slot-invalid"
      >
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">
          {t('publicSlot.invalidTitle')}
        </h2>
        {/* TEK GUVENLI MESAJ: gecersiz / suresi dolmus / iptal edilmis /
            kilitli ayirt EDILMIYOR. */}
        <p className="mt-2 text-sm text-slate-600">{t('publicSlot.invalidBody')}</p>
      </div>
    );
  }

  const bookable = slots.filter((slot) => slot.available);

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="public-slot-ready">
      <header className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarClock className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
          {t(`publicSlot.heading.${kind === 'pickup' ? 'pickup' : 'delivery'}`)}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('publicSlot.intro')}</p>
      </header>

      {noticeKey ? (
        <p
          role="status"
          data-testid="public-slot-notice"
          className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(noticeKey)}</span>
        </p>
      ) : null}

      {errorKey ? (
        <p
          role="alert"
          data-testid="public-slot-error"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(errorKey)}</span>
        </p>
      ) : null}

      {slots.length === 0 ? (
        <p role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          {t('publicSlot.noSlots')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="public-slot-list">
          {slots.map((slot) => {
            const isBooked = bookedSlotId === slot.id;
            const disabled = !slot.available || busySlotId !== null;
            return (
              <li
                key={slot.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`public-slot-${slot.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {timeFormat.format(new Date(slot.startsAt))}
                  </p>
                  <p className="text-xs text-slate-600">
                    {t('publicSlot.until', {
                      value: new Intl.DateTimeFormat(i18n.language, {
                        timeStyle: 'short',
                      }).format(new Date(slot.endsAt)),
                    })}
                    {slot.resourceRef ? ` · ${slot.resourceRef}` : ''}
                  </p>
                  {!slot.available ? (
                    /* DOLU/GECMIS/KAPALI AYIRT EDILMIYOR: musteri icin
                       hepsi "secilemez" ve sebebi onu ilgilendirmiyor. */
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('publicSlot.unavailable')}
                    </p>
                  ) : null}
                </div>
                <Button
                  onClick={() => void book(slot.id)}
                  disabled={disabled}
                  variant={isBooked ? 'outline' : 'default'}
                  data-testid={`public-slot-book-${slot.id}`}
                  className="w-full sm:w-auto"
                >
                  {busySlotId === slot.id ? (
                    <span className="inline-flex items-center">
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                      {t('publicSlot.working')}
                    </span>
                  ) : isBooked ? (
                    t('publicSlot.selected')
                  ) : (
                    t('publicSlot.choose')
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {bookable.length === 0 && slots.length > 0 ? (
        <p role="status" className="text-center text-sm text-amber-900">
          {t('publicSlot.noneSelectable')}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          onClick={() => void cancel()}
          disabled={busySlotId !== null}
          data-testid="public-slot-cancel"
          className="w-full sm:w-auto"
        >
          {t('publicSlot.cancelBooking')}
        </Button>
        {/* OTURUMU KAPAT: paylasilan bir bilgisayarda sekmeyi kapatmak
            yetmez — cookie sunucuda da iptal ediliyor. */}
        <Button
          variant="outline"
          onClick={() => void finish()}
          disabled={busySlotId !== null}
          data-testid="public-slot-finish"
          className="w-full sm:w-auto"
        >
          {t('publicSlot.finish')}
        </Button>
      </div>
    </div>
  );
}
