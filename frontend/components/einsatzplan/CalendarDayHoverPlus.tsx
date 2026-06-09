import { Plus } from 'lucide-react';

export function CalendarDayHoverPlus() {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      aria-hidden
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#163a5c]/30 bg-white/95 text-[#1a4d7a] shadow-sm">
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </span>
  );
}

export const CALENDAR_DAY_CELL_HOVER =
  'group border-l border-slate-200 px-1 py-1.5 transition-colors hover:bg-[#e8f0f8] hover:shadow-[inset_0_0_0_1px_rgba(22,58,92,0.18)]';

export const CALENDAR_DAY_CELL_CONTENT_HOVER = 'transition-opacity duration-150 group-hover:opacity-25';
