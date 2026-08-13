'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { driverPortalApi } from '@/lib/api';
import type { FuelingIntent } from '@/lib/types';

/**
 * Surucunun aktif yakit duragi.
 *
 * Ayri bir hook cunku IKI ekran ayni kaydi gosteriyor (istasyon arama ekrani ve
 * tur ekrani) ve iki kopya kacinilmaz sekilde birbirinden ayrisirdi — biri
 * iptalden sonra karti gizlerken digeri gostermeye devam ederdi.
 *
 * Yalnizca KENDI backend'imize tek bir GET yapiyor: konum izni istemiyor ve
 * istasyon saglayicisinin kotasini harcamiyor. Ilk render'da bu cagriyi yapmak
 * bu yuzden guvenli.
 */
export function useActiveFuelingIntent() {
  const [intent, setIntent] = useState<FuelingIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await driverPortalApi.activeFuelingIntent(controller.signal);
      if (controller.signal.aborted) return;
      setIntent(result);
    } catch {
      // Aktif yakit duragi ekranin ANA isi degil: yuklenemezse ekranin geri
      // kalani calismaya devam etmeli. Hata metni gostermek, surucuye
      // yapabilecegi bir sey olmayan bir uyari vermek olurdu.
      if (!controller.signal.aborted) setIntent(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [reload]);

  return { intent, setIntent, loading, reload };
}
