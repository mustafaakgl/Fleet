'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  Wallet,
  ClipboardCheck,
  Sun,
  UserRoundCheck,
  Users,
  X,
  Plus,
} from 'lucide-react';
import { Benutzerverwaltung } from './Benutzerverwaltung';
import { RevenueSummary } from './RevenueSummary';
import { Tagesplanung } from './Tagesplanung';
import { UrlaubsplanerPanel } from './UrlaubsplanerPanel';

type TopTab = 'dashboard' | 'urlaub' | 'tagesplanung' | 'revenue' | 'status' | 'users';
type DocStatus = 'Valid' | 'Expiring soon' | 'Expired';

interface SummaryCard {
  label: string;
  value: number;
}

interface TomorrowPlanItem {
  driver: string;
  vehicle: string;
  company: string;
  startTime: string;
  status: 'Planned' | 'In Progress' | 'Completed';
}

interface DocumentItem {
  type: string;
  name: string;
  category: string;
  expiryDate: string;
  status: DocStatus;
}

const topTabs: Array<{ id: TopTab; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'urlaub', label: 'Urlaubsplaner', icon: Sun },
  { id: 'tagesplanung', label: 'Tagesplanung', icon: ClipboardCheck },
  { id: 'revenue', label: 'Revenue Summary', icon: Wallet },
  { id: 'status', label: 'Statusubersicht', icon: UserRoundCheck },
  { id: 'users', label: 'Benutzerverwaltung', icon: Users },
];

const summaryCards: SummaryCard[] = [
  { label: 'Active drivers', value: 42 },
  { label: 'Vehicles in use', value: 31 },
  { label: 'Vacation today', value: 4 },
  { label: 'Sick drivers', value: 2 },
];

const tomorrowPlan: TomorrowPlanItem[] = [
  { driver: 'Ilker Cukur', vehicle: 'AP101', company: 'DHL', startTime: '07:00', status: 'Planned' },
  { driver: 'Thomas Scharein', vehicle: 'AP102', company: 'Amazon', startTime: '08:30', status: 'In Progress' },
  { driver: 'Sita Diallo', vehicle: 'AP103', company: 'UPS', startTime: '09:00', status: 'Completed' },
  { driver: 'Andrii Dudiak', vehicle: 'AP104', company: 'Hermes', startTime: '06:45', status: 'Planned' },
];

const documentItems: DocumentItem[] = [
  { type: 'License', name: 'Ilker Cukur', category: 'Driver', expiryDate: '2026-06-21', status: 'Expiring soon' },
  { type: 'Passport', name: 'Sita Diallo', category: 'Driver', expiryDate: '2026-12-14', status: 'Valid' },
  { type: 'TUV', name: 'AP102', category: 'Vehicle', expiryDate: '2026-05-25', status: 'Expiring soon' },
  { type: 'Insurance', name: 'AP104', category: 'Vehicle', expiryDate: '2026-05-10', status: 'Expired' },
];

function badgeClasses(status: TomorrowPlanItem['status'] | DocStatus) {
  switch (status) {
    case 'Planned':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'In Progress':
    case 'Expiring soon':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Completed':
    case 'Valid':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Expired':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function EinsatzplanPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TopTab>('dashboard');

  return (
    <div className="space-y-5 bg-[#f5f7fb]">
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-300 bg-slate-100 p-2">
          {topTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-fit items-center gap-2 rounded-t-md border px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}

          <div className="ml-auto flex items-center pr-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Close tab bar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-gradient-to-r from-blue-700 to-blue-600 p-5 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Fleet ERP</p>
                  <h1 className="mt-2 text-2xl font-bold">{t('einsatzplan.title')}</h1>
                  <p className="mt-1 text-sm text-blue-100">{t('einsatzplan.subtitle')}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" />
                  Neue Planung
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Tomorrow&apos;s Einsatzplan</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Driver</th>
                        <th className="px-4 py-3">Vehicle</th>
                        <th className="px-4 py-3">Company</th>
                        <th className="px-4 py-3">Start time</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tomorrowPlan.map((row) => (
                        <tr key={`${row.driver}-${row.vehicle}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.driver}</td>
                          <td className="px-4 py-3 text-slate-700">{row.vehicle}</td>
                          <td className="px-4 py-3 text-slate-700">{row.company}</td>
                          <td className="px-4 py-3 text-slate-700">{row.startTime}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'urlaub' && (
            <UrlaubsplanerPanel />
          )}

          {activeTab === 'tagesplanung' && <Tagesplanung />}

          {activeTab === 'revenue' && <RevenueSummary />}

          {activeTab === 'status' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{t('einsatzplan.statusOverview')}</h2>
                <p className="text-sm text-slate-600">Operational totals and document expiries in a compact administration view.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Drivers total</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">58</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Vehicles total</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">46</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Documents total</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">124</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">Document expiry overview</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Expiry date</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentItems.map((item) => (
                        <tr key={`${item.type}-${item.name}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-800">{item.type}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                          <td className="px-4 py-3 text-slate-700">{item.category}</td>
                          <td className="px-4 py-3 text-slate-700">{item.expiryDate}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <Benutzerverwaltung />
          )}
        </div>
      </div>
    </div>
  );
}
