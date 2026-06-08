'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildYearOptions } from '@/lib/calendar-vacation';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'fleet:vehicle-assignments:mini-calendar';

type CalendarCell = {
  iso: string;
  inMonth: boolean;
};

function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(iso: string): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

function buildCalendarGrid(viewYear: number, viewMonthIndex: number): CalendarCell[] {
  const firstWeekday = new Date(viewYear, viewMonthIndex, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonthIndex, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    const day = daysInPrevMonth - index;
    const monthIndex = viewMonthIndex === 0 ? 11 : viewMonthIndex - 1;
    const year = viewMonthIndex === 0 ? viewYear - 1 : viewYear;
    cells.push({ iso: formatIsoDate(year, monthIndex, day), inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ iso: formatIsoDate(viewYear, viewMonthIndex, day), inMonth: true });
  }

  let trailingMonthIndex = viewMonthIndex === 11 ? 0 : viewMonthIndex + 1;
  let trailingYear = viewMonthIndex === 11 ? viewYear + 1 : viewYear;
  let trailingDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ iso: formatIsoDate(trailingYear, trailingMonthIndex, trailingDay), inMonth: false });
    trailingDay += 1;
    if (trailingDay > new Date(trailingYear, trailingMonthIndex + 1, 0).getDate()) {
      trailingDay = 1;
      if (trailingMonthIndex === 11) {
        trailingMonthIndex = 0;
        trailingYear += 1;
      } else {
        trailingMonthIndex += 1;
      }
    }
  }

  return cells;
}

interface MiniCalendarProps {
  selectedDate: string;
  today: string;
  onDateChange: (iso: string) => void;
}

function MiniCalendar({ selectedDate, today, onDateChange }: MiniCalendarProps) {
  const { t, i18n } = useTranslation();
  const selectedParts = parseIsoDate(selectedDate);
  const [viewYear, setViewYear] = useState(selectedParts.year);
  const [viewMonthIndex, setViewMonthIndex] = useState(selectedParts.monthIndex);

  useEffect(() => {
    const parts = parseIsoDate(selectedDate);
    setViewYear(parts.year);
    setViewMonthIndex(parts.monthIndex);
  }, [selectedDate]);

  const yearOptions = useMemo(() => buildYearOptions(new Date(`${selectedDate}T12:00:00`)), [selectedDate]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: index,
        label: new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
          new Date(2024, index, 1),
        ),
      })),
    [i18n.language],
  );

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2023, 0, 1 + index)),
    );
  }, [i18n.language]);

  const cells = useMemo(
    () => buildCalendarGrid(viewYear, viewMonthIndex),
    [viewMonthIndex, viewYear],
  );

  function shiftViewMonth(delta: number) {
    setViewMonthIndex((currentMonth) => {
      let nextMonth = currentMonth + delta;
      let nextYear = viewYear;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      } else if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      setViewYear(nextYear);
      return nextMonth;
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <select
          value={viewMonthIndex}
          onChange={(event) => setViewMonthIndex(Number(event.target.value))}
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label={t('vehicleAssignments.miniCalendar.month')}
        >
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={viewYear}
          onChange={(event) => setViewYear(Number(event.target.value))}
          className="h-9 w-[88px] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label={t('vehicleAssignments.miniCalendar.year')}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => shiftViewMonth(-1)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label={t('vehicleAssignments.miniCalendar.prevMonth')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => shiftViewMonth(1)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label={t('vehicleAssignments.miniCalendar.nextMonth')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-xs font-medium text-slate-500">
        {weekdayLabels.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {cells.map((cell) => {
          const isSelected = cell.iso === selectedDate;
          const isToday = cell.iso === today;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onDateChange(cell.iso)}
              className={cn(
                'mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                !cell.inMonth && 'text-slate-300 hover:text-slate-400',
                cell.inMonth && !isSelected && 'text-slate-700 hover:bg-slate-100',
                isSelected && 'bg-amber-100 font-semibold text-amber-900 hover:bg-amber-100',
                isToday && !isSelected && 'font-semibold text-emerald-700 ring-1 ring-emerald-200',
              )}
            >
              {parseIsoDate(cell.iso).day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MiniCalendarSidebarProps {
  selectedDate: string;
  today: string;
  onDateChange: (iso: string) => void;
}

export function MiniCalendarSidebar({ selectedDate, today, onDateChange }: MiniCalendarSidebarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '0') setOpen(false);
    } catch {
      // ignore storage errors
    }
  }, []);

  function setSidebarOpen(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }

  if (!open) {
    return (
      <div className="flex shrink-0 justify-end lg:w-10">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          title={t('vehicleAssignments.miniCalendar.show')}
          aria-label={t('vehicleAssignments.miniCalendar.show')}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-full shrink-0 lg:w-[280px]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-end border-b border-slate-100 px-2 py-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title={t('vehicleAssignments.miniCalendar.hide')}
            aria-label={t('vehicleAssignments.miniCalendar.hide')}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <MiniCalendar selectedDate={selectedDate} today={today} onDateChange={onDateChange} />
      </div>
    </aside>
  );
}
