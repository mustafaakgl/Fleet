import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ConnectionBannerProvider, ConnectionBannerSlot } from '@/components/connection/ConnectionBannerProvider';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  return (
    <ConnectionBannerProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header title={title} />
          <ConnectionBannerSlot />
          <main className="flex-1 overflow-x-hidden px-4 pb-10 pt-14 sm:px-7 sm:pb-10 sm:pt-6 lg:px-7 lg:pt-7">
            {children}
          </main>
        </div>
      </div>
    </ConnectionBannerProvider>
  );
}
