'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CreateTimelineAssignmentDialog,
  type TimelineDraft,
} from '@/components/vehicles/CreateTimelineAssignmentDialog';
import { MiniCalendarSidebar } from '@/components/vehicles/MiniCalendarSidebar';
import { useFleetData } from '@/context/FleetDataContext';
import { usePlanningDate } from '@/hooks/usePlanningDate';
import { assignmentsApi, companiesApi, driversApi, vehiclesApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { einsatzplanHref } from '@/lib/office-deep-links';
import type { Assignment, Company, Driver, Vehicle } from '@/lib/types';
import {
  formatHourLabel,
  formatTime12h,
  minutesFromClientX,
  minutesFromTime,
  positionPercent,
  rangesOverlap,
  timeFromMinutes,
  timelineRangeMinutes,
  TIMELINE_END_HOUR,
  TIMELINE_START_HOUR,
  vehicleAbbreviation,
} from '@/lib/timeline-utils';
import { cn } from '@/lib/utils';

const ROW_HEIGHT = 56;
const VEHICLE_COLUMN_WIDTH = 240;
const HOUR_WIDTH = 72;

type DragState = {
  vehicleId: string;
  anchorMinutes: number;
  currentMinutes: number;
};

function assignmentBlockClass(status: string) {
  if (status === 'in_progress') return 'bg-emerald-500/90 border-emerald-600';
  if (status === 'completed') return 'bg-slate-400/90 border-slate-500';
  if (status === 'confirmed') return 'bg-teal-500/90 border-teal-600';
  if (status === 'cancelled') return 'bg-rose-300/90 border-rose-400';
  return 'bg-blue-500/90 border-blue-600';
}

function vehicleStatusDot(status: Vehicle['status']) {
  if (status === 'active') return 'bg-emerald-500';
  if (status === 'maintenance') return 'bg-orange-500';
  if (status === 'broken') return 'bg-red-500';
  return 'bg-slate-400';
}

export function VehicleAssignmentsTimeline() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { refetchHydrate } = useFleetData();
  const { planningDate: workDate, today, setPlanningDate, shiftPlanningDate } = usePlanningDate();
  const isOfficeRole = getUser()?.role === 'office';
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<TimelineDraft | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vehiclePage, assignmentPage, driverPage, companyPage] = await Promise.all([
        vehiclesApi.list({ limit: 200 }),
        assignmentsApi.list({ date: workDate, limit: 300 }),
        driversApi.list({ status: 'active', limit: 200 }),
        companiesApi.list({ limit: 200 }),
      ]);
      setVehicles(vehiclePage.data);
      setAssignments(assignmentPage.data.filter((item) => item.status !== 'cancelled'));
      setDrivers(driverPage.data);
      setCompanies(companyPage.data);
    } catch (e) {
      setVehicles([]);
      setAssignments([]);
      setError(e instanceof Error ? e.message : t('vehicleAssignments.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t, workDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) => {
      const haystack = `${vehicle.plate_number} ${vehicle.brand} ${vehicle.model}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, vehicles]);

  const assignmentsByVehicle = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const list = map.get(assignment.vehicle.id) ?? [];
      list.push(assignment);
      map.set(assignment.vehicle.id, list);
    }
    return map;
  }, [assignments]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let hour = TIMELINE_START_HOUR; hour <= TIMELINE_END_HOUR; hour += 1) {
      list.push(hour);
    }
    return list;
  }, []);

  const timelineWidth = (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1) * HOUR_WIDTH;

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${workDate}T12:00:00`)),
    [i18n.language, workDate],
  );

  const nowIndicator = useMemo(() => {
    if (workDate !== today) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const { start, end } = timelineRangeMinutes();
    if (minutes < start || minutes > end) return null;
    return positionPercent(minutes, minutes + 1).left;
  }, [workDate]);

  const activeDrag = useMemo(() => {
    if (!drag) return null;
    const startMinutes = Math.min(drag.anchorMinutes, drag.currentMinutes);
    const endMinutes = Math.max(drag.anchorMinutes, drag.currentMinutes);
    if (endMinutes <= startMinutes) return null;
    const minEnd = startMinutes + 30;
    return {
      vehicleId: drag.vehicleId,
      startMinutes,
      endMinutes: Math.max(minEnd, endMinutes),
    };
  }, [drag]);

  const dragHasConflict = useMemo(() => {
    if (!activeDrag) return false;
    const existing = assignmentsByVehicle.get(activeDrag.vehicleId) ?? [];
    return existing.some((assignment) =>
      rangesOverlap(
        activeDrag.startMinutes,
        activeDrag.endMinutes,
        minutesFromTime(assignment.start_time),
        minutesFromTime(assignment.end_time),
      ),
    );
  }, [activeDrag, assignmentsByVehicle]);

  const finishDrag = useCallback(
    (state: DragState) => {
      const startMinutes = Math.min(state.anchorMinutes, state.currentMinutes);
      const endMinutes = Math.max(state.anchorMinutes, state.currentMinutes);
      const normalizedEnd = Math.max(startMinutes + 30, endMinutes);

      if (normalizedEnd <= startMinutes) return;

      const vehicle = vehicles.find((item) => item.id === state.vehicleId);
      if (!vehicle) return;

      const existing = assignmentsByVehicle.get(state.vehicleId) ?? [];
      const conflict = existing.some((assignment) =>
        rangesOverlap(
          startMinutes,
          normalizedEnd,
          minutesFromTime(assignment.start_time),
          minutesFromTime(assignment.end_time),
        ),
      );
      if (conflict) return;

      setDraft({
        vehicle,
        workDate,
        startTime: timeFromMinutes(startMinutes),
        endTime: timeFromMinutes(normalizedEnd),
      });
      setDialogOpen(true);
    },
    [assignmentsByVehicle, vehicles, workDate],
  );

  function startDrag(event: React.MouseEvent<HTMLDivElement>, vehicleId: string) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-assignment-block="true"]')) return;

    event.preventDefault();

    const timelineEl = event.currentTarget;

    function timelineRect() {
      return timelineEl.getBoundingClientRect();
    }

    const minutes = minutesFromClientX(event.clientX, timelineRect());
    const initial: DragState = { vehicleId, anchorMinutes: minutes, currentMinutes: minutes };
    setDrag(initial);

    function handleMove(moveEvent: MouseEvent) {
      setDrag((current) =>
        current
          ? {
              ...current,
              currentMinutes: minutesFromClientX(moveEvent.clientX, timelineRect()),
            }
          : current,
      );
    }

    function handleUp() {
      setDrag((current) => {
        if (current) finishDrag(current);
        return null;
      });
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function openAddAssignment() {
    const defaultVehicle = filteredVehicles[0] ?? vehicles[0];
    if (!defaultVehicle) return;
    setDraft({
      vehicle: defaultVehicle,
      workDate,
      startTime: '07:00',
      endTime: '15:00',
    });
    setDialogOpen(true);
  }

  function openAssignmentInEinsatzplan() {
    router.push(
      einsatzplanHref({
        date: workDate,
        view: 'planning',
        office: isOfficeRole,
        tab: isOfficeRole ? 'betrieb' : undefined,
        panel: isOfficeRole ? undefined : 'tagesplanung',
      }),
    );
  }

  function handleAssignmentCreated() {
    void load();
    refetchHydrate();
  }

  const einsatzplanLink = einsatzplanHref({
    date: workDate,
    view: 'daily-overview',
    office: isOfficeRole,
    tab: isOfficeRole ? 'heute' : undefined,
    panel: isOfficeRole ? undefined : 'tagesplanung',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Truck className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">{t('vehicleAssignments.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('vehicleAssignments.timelineHint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={einsatzplanLink}>
              <CalendarDays className="mr-1.5 h-4 w-4" />
              {t('vehicleAssignments.openEinsatzplan')}
            </Link>
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={openAddAssignment}
            disabled={loading || vehicles.length === 0}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('vehicleAssignments.addAssignment')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('vehicleAssignments.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftPlanningDate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[220px] text-center text-sm font-semibold text-slate-900">{formattedDate}</div>
          <Button variant="outline" size="icon" onClick={() => shiftPlanningDate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPlanningDate(today)}>
            {t('vehicleAssignments.today')}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState
              icon={Truck}
              title={t('vehicleAssignments.loadError')}
              subtitle={error}
              actionLabel={t('vehicleAssignments.retry')}
              onAction={() => void load()}
            />
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Truck}
              title={t('vehicleAssignments.emptyTitle')}
              subtitle={t('vehicleAssignments.emptySubtitle')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div className="flex border-b border-slate-200 bg-slate-50">
                <div
                  className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  style={{ width: VEHICLE_COLUMN_WIDTH }}
                >
                  {t('vehicleAssignments.colVehicle')}
                </div>
                <div className="flex" style={{ width: timelineWidth }}>
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="shrink-0 border-r border-slate-200 px-2 py-3 text-center text-xs font-medium text-slate-500"
                      style={{ width: HOUR_WIDTH }}
                    >
                      {formatHourLabel(hour)}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {filteredVehicles.map((vehicle) => {
                  const vehicleAssignments = assignmentsByVehicle.get(vehicle.id) ?? [];
                  const isDraggingRow = activeDrag?.vehicleId === vehicle.id;

                  return (
                    <div key={vehicle.id} className="flex border-b border-slate-100 last:border-b-0">
                      <div
                        className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-white px-3 py-2"
                        style={{ width: VEHICLE_COLUMN_WIDTH, height: ROW_HEIGHT }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                            {vehicleAbbreviation(vehicle.brand, vehicle.model, vehicle.plate_number)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/vehicles/${vehicle.id}`}
                              className="block truncate text-sm font-bold text-slate-900 hover:text-blue-600"
                            >
                              {vehicle.plate_number}
                            </Link>
                            <p className="truncate text-xs text-slate-500">
                              <span className={cn('mr-1 inline-block h-2 w-2 rounded-full', vehicleStatusDot(vehicle.status))} />
                              {vehicle.status} · {vehicle.brand} {vehicle.model}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div
                        className="relative shrink-0 select-none"
                        style={{ width: timelineWidth, height: ROW_HEIGHT }}
                        onMouseDown={(event) => startDrag(event, vehicle.id)}
                      >
                        <div className="absolute inset-0 flex">
                          {hours.map((hour) => (
                            <div
                              key={`${vehicle.id}-${hour}`}
                              className="relative shrink-0 border-r border-slate-100"
                              style={{ width: HOUR_WIDTH, height: ROW_HEIGHT }}
                            >
                              <div className="absolute left-1/2 top-0 h-full w-px border-l border-dashed border-slate-100" />
                            </div>
                          ))}
                        </div>

                        {nowIndicator !== null ? (
                          <div
                            className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-red-500"
                            style={{ left: `${nowIndicator}%` }}
                          />
                        ) : null}

                        {vehicleAssignments.map((assignment) => {
                          const start = minutesFromTime(assignment.start_time);
                          const end = minutesFromTime(assignment.end_time);
                          const box = positionPercent(start, end);
                          return (
                            <div
                              key={assignment.id}
                              data-assignment-block="true"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                openAssignmentInEinsatzplan();
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openAssignmentInEinsatzplan();
                                }
                              }}
                              className={cn(
                                'absolute top-2 z-10 flex h-[calc(100%-16px)] min-w-[48px] cursor-pointer items-center overflow-hidden rounded-md border px-2 text-xs font-medium text-white shadow-sm hover:brightness-110',
                                assignmentBlockClass(assignment.status),
                              )}
                              style={{ left: `${box.left}%`, width: `${box.width}%` }}
                              title={`${assignment.driver.name} · ${assignment.company_name} · ${t('vehicleAssignments.openEinsatzplan')}`}
                            >
                              <span className="truncate">
                                {assignment.driver.name} · {assignment.start_time}–{assignment.end_time}
                              </span>
                            </div>
                          );
                        })}

                        {isDraggingRow && activeDrag ? (
                          <div
                            className={cn(
                              'pointer-events-none absolute top-2 z-30 h-[calc(100%-16px)] rounded-md border-2 border-dashed px-2 text-xs font-semibold text-white',
                              dragHasConflict
                                ? 'border-red-500 bg-red-400/70'
                                : 'border-emerald-600 bg-emerald-500/70',
                            )}
                            style={{
                              left: `${positionPercent(activeDrag.startMinutes, activeDrag.endMinutes).left}%`,
                              width: `${positionPercent(activeDrag.startMinutes, activeDrag.endMinutes).width}%`,
                            }}
                          >
                            {formatTime12h(timeFromMinutes(activeDrag.startMinutes))} –{' '}
                            {formatTime12h(timeFromMinutes(activeDrag.endMinutes))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
        </div>

        <MiniCalendarSidebar
          selectedDate={workDate}
          today={today}
          onDateChange={setPlanningDate}
        />
      </div>

      <CreateTimelineAssignmentDialog
        open={dialogOpen}
        draft={draft}
        vehicles={vehicles}
        drivers={drivers}
        companies={companies}
        onClose={() => {
          setDialogOpen(false);
          setDraft(null);
        }}
        onCreated={handleAssignmentCreated}
      />
    </div>
  );
}
