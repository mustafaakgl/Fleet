'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  FileText,
  Radar,
  MapPinned,
  CalendarDays,
  Bell,
  MessageSquare,
  Shield,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { clearAuth, getUser } from '@/lib/auth';
import { canManageSettings } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/types';
import { useTranslation } from 'react-i18next';

const navItems = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/drivers', labelKey: 'nav.drivers', icon: Users },
  { href: '/vehicles', labelKey: 'nav.vehicles', icon: Truck },
  { href: '/companies', labelKey: 'nav.companies', icon: Building2 },
  { href: '/documents', labelKey: 'nav.documents', icon: FileText },
  { href: '/live-tracking', labelKey: 'nav.liveTracking', icon: MapPinned },
  { href: '/flottenmonitor', labelKey: 'nav.flottenmonitor', icon: Radar },
  { href: '/assignments', labelKey: 'nav.assignments', icon: CalendarDays },
  { href: '/cargo-damage', labelKey: 'nav.cargoDamage', icon: ClipboardList },
  { href: '/service-history', labelKey: 'nav.serviceHistory', icon: CalendarDays },
  { href: '/requests', labelKey: 'nav.requests', icon: ClipboardList },
  { href: '/reminders', labelKey: 'nav.reminders', icon: Bell },
  { href: '/messenger', labelKey: 'nav.messenger', icon: MessageSquare },
  { href: '/dsgvo', labelKey: 'nav.dsgvo', icon: Shield },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const visibleNavItems = navItems.filter((item) => {
    if (item.href === '/settings') {
      return user ? canManageSettings(user.role) : false;
    }
    return true;
  });

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
        <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-900">Fleet</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNavItems.map(({ href, labelKey, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 min-h-screen bg-white border-r border-gray-200">
        <NavContent />
      </aside>

      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-md border border-gray-200"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 w-64 min-h-screen bg-white shadow-xl">
            <button
              className="absolute top-4 right-4 p-1 rounded-md hover:bg-gray-100"
              onClick={() => setMobileOpen(false)}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
