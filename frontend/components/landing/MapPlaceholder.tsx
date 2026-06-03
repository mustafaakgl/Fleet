'use client';

import { MapPin, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const vehicles = [
  { id: 1, top: '22%', left: '18%', label: 'DE-AB 1234' },
  { id: 2, top: '45%', left: '52%', label: 'DE-CD 5678' },
  { id: 3, top: '68%', left: '72%', label: 'DE-EF 9012' },
  { id: 4, top: '35%', left: '78%', label: 'DE-GH 3456' },
];

export function MapPlaceholder() {
  const { t } = useTranslation('landing');

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#e8f0f8] shadow-2xl shadow-black/20">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#dbeafe_0%,#e0f2fe_40%,#f0f9ff_100%)]" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative aspect-[16/10] p-6">
        <div className="absolute left-6 top-6 rounded-xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('map.liveMap')}</p>
          <p className="text-lg font-bold text-slate-950">{t('map.vehiclesOnline')}</p>
        </div>

        {vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ top: vehicle.top, left: vehicle.left }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0066CC] text-white shadow-lg ring-4 ring-white">
              <Truck className="h-5 w-5" aria-hidden />
            </div>
            <span className="mt-1 rounded-md bg-white/95 px-2 py-0.5 text-xs font-bold text-slate-800 shadow">
              {vehicle.label}
            </span>
          </div>
        ))}

        <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
          <MapPin className="h-4 w-4 text-[#0066CC]" aria-hidden />
          <span className="text-sm font-semibold text-slate-700">{t('map.realtimeGps')}</span>
        </div>
      </div>
    </div>
  );
}
