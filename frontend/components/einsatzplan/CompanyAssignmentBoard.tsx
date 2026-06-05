'use client';

import { useTranslation } from 'react-i18next';
import type { FleetAssignment } from '@/context/FleetDataContext';
import {
  assignmentStatusBadge,
  TRAILER_BY_VEHICLE,
  type CompanyAssignmentGroup,
} from './companyBoard';

interface CompanyAssignmentBoardProps {
  groups: CompanyAssignmentGroup[];
  drivers: Array<{ id: string; name: string }>;
  onAssignmentClick?: (assignment: FleetAssignment) => void;
  emptyMessage?: string;
}

export function CompanyAssignmentBoard({
  groups,
  drivers,
  onAssignmentClick,
  emptyMessage,
}: CompanyAssignmentBoardProps) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('board.empty');
  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        {resolvedEmptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ company, rows }) => (
        <div key={company.key} className="border border-slate-300 bg-white">
          <div
            className={`border-b border-slate-300 px-2 py-1 text-xs font-bold uppercase tracking-wide ${company.headerClass}`}
          >
            {company.label}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="border-b border-r border-slate-300 px-2 py-1">{t('board.colDriver')}</th>
                  <th className="border-b border-r border-slate-300 px-2 py-1">{t('board.colVehicle')}</th>
                  <th className="border-b border-r border-slate-300 px-2 py-1">{t('board.colTrailer')}</th>
                  <th className="border-b border-r border-slate-300 px-2 py-1">{t('board.colStart')}</th>
                  <th className="border-b border-slate-300 px-2 py-1">{t('board.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((assignment) => {
                  const driverName =
                    drivers.find((driver) => driver.id === assignment.driverId)?.name ?? assignment.driverId;
                  const trailer = TRAILER_BY_VEHICLE[assignment.vehicle.replace(/-/g, '')] ?? '---';

                  return (
                    <tr
                      key={assignment.id}
                      className={onAssignmentClick ? 'cursor-pointer hover:bg-slate-50' : undefined}
                      onClick={onAssignmentClick ? () => onAssignmentClick(assignment) : undefined}
                    >
                      <td className="border-b border-r border-slate-200 px-2 py-1 text-slate-900">{driverName}</td>
                      <td className="border-b border-r border-slate-200 px-2 py-1 text-slate-800">
                        {assignment.vehicle || '-'}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1 text-slate-800">{trailer}</td>
                      <td className="border-b border-r border-slate-200 px-2 py-1 text-slate-800">
                        {assignment.startTime || '-'}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${assignmentStatusBadge(assignment.status)}`}
                        >
                          {assignment.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
