'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, FileText, ClipboardList, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/driver', icon: Home, labelKey: 'driverPortal.nav.home', match: (path: string) =>
    path === '/driver' ||
    path.startsWith('/driver/assignments') ||
    path.startsWith('/driver/morning-checkin') ||
    path.startsWith('/driver/handover') ||
    path.startsWith('/driver/notifications') ||
    path.startsWith('/driver/documents'),
  },
  { href: '/driver/messages', icon: MessageSquare, labelKey: 'driverPortal.nav.messages', match: (path: string) =>
    path.startsWith('/driver/messages'),
  },
  { href: '/driver/requests', icon: FileText, labelKey: 'driverPortal.nav.requests', match: (path: string) =>
    path === '/driver/requests',
  },
  { href: '/driver/reports', icon: ClipboardList, labelKey: 'driverPortal.nav.reports', match: (path: string) =>
    path === '/driver/reports' ||
    path.startsWith('/driver/accident-report') ||
    path.startsWith('/driver/cargo-damage-report'),
  },
  { href: '/driver/profile', icon: User, labelKey: 'driverPortal.nav.profile', match: (path: string) =>
    path === '/driver/profile',
  },
] as const;

export function DriverPortalNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition',
                active ? 'text-brand-primary' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5px]')} />
              <span className="truncate">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
