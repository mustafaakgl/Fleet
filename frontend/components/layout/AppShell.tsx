import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[#F4F6FA]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        <main className="flex-1 overflow-x-hidden px-4 pb-10 pt-14 sm:px-7 sm:pb-10 sm:pt-6 lg:px-7 lg:pt-7">
          {children}
        </main>
      </div>
    </div>
  );
}
