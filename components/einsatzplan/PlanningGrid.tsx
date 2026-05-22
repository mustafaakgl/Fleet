import { StatusBadge } from './StatusBadge';
import { TIME_SLOTS } from './mockData';
import type { DriverPlanRow, PlanAssignment } from './types';

interface PlanningGridProps {
  rows: DriverPlanRow[];
  selectedRowId: string | null;
  onSelect: (row: DriverPlanRow, assignment: PlanAssignment | null) => void;
}

const blockStyleByStatus: Record<PlanAssignment['status'], string> = {
  planned: 'bg-blue-100 border-blue-300 text-blue-800',
  in_progress: 'bg-amber-100 border-amber-300 text-amber-800',
  completed: 'bg-emerald-100 border-emerald-300 text-emerald-800',
  cancelled: 'bg-red-100 border-red-300 text-red-800',
  sick: 'bg-rose-100 border-rose-300 text-rose-800',
  vacation: 'bg-violet-100 border-violet-300 text-violet-800',
  empty: 'bg-gray-100 border-gray-300 text-gray-700',
};

function timelineLeft(startHour: number): string {
  return `${((startHour - 6) / 14) * 100}%`;
}

function timelineWidth(startHour: number, endHour: number): string {
  return `${((endHour - startHour) / 14) * 100}%`;
}

export function PlanningGrid({ rows, selectedRowId, onSelect }: PlanningGridProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="min-w-[1280px]">
          <div className="grid grid-cols-[120px_200px_120px_180px_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <div className="px-4 py-3">Department</div>
          <div className="px-4 py-3">Driver</div>
          <div className="px-4 py-3">Vehicle</div>
          <div className="px-4 py-3">Company</div>
            <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] border-l border-gray-200">
            {TIME_SLOTS.map((hour) => (
              <div key={hour} className="border-l border-gray-200 px-2 py-3 text-center first:border-l-0">
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid cursor-pointer grid-cols-[120px_200px_120px_180px_1fr] border-b border-gray-100 transition-colors hover:bg-blue-50/40 ${
              selectedRowId === row.id ? 'bg-blue-50/70' : 'bg-white'
            }`}
            onClick={() => onSelect(row, row.assignments[0] ?? null)}
          >
            <div className="px-4 py-4 text-sm font-medium capitalize text-gray-700">{row.department}</div>
            <div className="px-4 py-4 text-sm font-semibold text-gray-900">{row.driverName}</div>
            <div className="px-4 py-4 text-sm text-gray-700">{row.vehiclePlate}</div>
            <div className="px-4 py-4 text-sm text-gray-700">{row.company}</div>

            <div className="relative border-l border-gray-200 px-2 py-2">
              <div className="pointer-events-none absolute inset-0 grid grid-cols-[repeat(14,minmax(0,1fr))]">
                {Array.from({ length: 14 }).map((_, index) => (
                  <div key={index} className="border-l border-gray-100 first:border-l-0" />
                ))}
              </div>

              {row.dayStatus ? (
                <button
                  type="button"
                  className={`relative mt-1 h-10 w-full rounded-md border px-3 text-left text-xs font-semibold ${blockStyleByStatus[row.dayStatus]}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(row, null);
                  }}
                >
                  {row.dayStatus === 'sick' ? 'Sick Leave' : 'Vacation'}
                </button>
              ) : row.assignments.length > 0 ? (
                row.assignments.map((assignment) => (
                  <button
                    key={assignment.id}
                    type="button"
                    className={`absolute top-3 h-10 rounded-md border px-2 text-left text-xs font-semibold shadow-sm ${blockStyleByStatus[assignment.status]}`}
                    style={{
                      left: timelineLeft(assignment.startHour),
                      width: timelineWidth(assignment.startHour, assignment.endHour),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row, assignment);
                    }}
                  >
                    <div className="truncate">{assignment.serviceTask}</div>
                    <div className="truncate text-[10px] font-medium opacity-80">
                      {String(Math.floor(assignment.startHour)).padStart(2, '0')}:00 - {String(Math.floor(assignment.endHour)).padStart(2, '0')}:00
                    </div>
                  </button>
                ))
              ) : (
                <div className="relative mt-1 flex h-10 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-500">
                  <StatusBadge status="empty" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
