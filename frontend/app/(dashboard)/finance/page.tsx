'use client';

import { FinanceOverview } from '@/components/finance/FinanceOverview';

/**
 * Finance merkezi (Faz 18C) — TEK rota, alti alt sayfa YOK.
 *
 * Yetki iki yerde: kenar cubugu `nav-access.ts` uzerinden yalnizca finansal
 * rollere baglantiyi gosteriyor, veri ise `@Roles(...FINANCIAL_ROLES)` ile
 * korunan `/finance/summary`den geliyor. Rotanin kendisi acik kalsa bile
 * yetkisiz bir rol HICBIR finansal alan alamaz — asil kapi sunucuda.
 */
export default function FinancePage() {
  return <FinanceOverview />;
}
