'use client';

import { NotificationCenter } from './NotificationCenter';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';
import { WorkspaceSelector } from './WorkspaceSelector';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white px-3 py-2 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:min-w-[10rem] lg:min-w-[12rem]">
          <WorkspaceSelector />
          {title ? (
            <h1 className="truncate text-base font-semibold text-gray-900 md:hidden">{title}</h1>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 sm:max-w-md lg:max-w-lg xl:max-w-xl">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NotificationCenter />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
