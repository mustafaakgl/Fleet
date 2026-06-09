'use client';

import { useTranslation } from 'react-i18next';
import type { FleetAssignment } from '@/context/FleetDataContext';
import {
  assignmentStatusBadge,
  TRAILER_BY_VEHICLE,
  type CompanyAssignmentGroup,
} from './companyBoard';
import {
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

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
            <table className={cn(FLEET_RAW_TABLE, 'w-full min-w-[560px] border-collapse')}>
              <thead className={FLEET_RAW_THEAD}>
                <tr>
                  <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('board.colDriver')}</th>
                  <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('board.colVehicle')}</th>
                  <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('board.colTrailer')}</th>
                  <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('board.colStart')}</th>
                  <th className={FLEET_RAW_TH}>{t('board.colStatus')}</th>
                </tr>
              </thead>
              <tbody className={FLEET_RAW_TBODY}>
                {rows.map((assignment) => {
                  const driverName =
                    drivers.find((driver) => driver.id === assignment.driverId)?.name ?? assignment.driverId;
                  const trailer = TRAILER_BY_VEHICLE[assignment.vehicle.replace(/-/g, '')] ?? '---';

                  return (
                    <tr
                      key={assignment.id}
                      className={cn(FLEET_RAW_TR, onAssignmentClick && 'cursor-pointer')}
                      onClick={onAssignmentClick ? () => onAssignmentClick(assignment) : undefined}
                    >
                      <td className={cn(FLEET_RAW_TD_PRIMARY, 'border-r border-slate-100')}>{driverName}</td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'border-r border-slate-100')}>
                        {assignment.vehicle || '-'}
                      </td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'border-r border-slate-100')}>{trailer}</td>
                      <td className={cn(FLEET_RAW_TD_MUTED, 'border-r border-slate-100')}>
                        {assignment.startTime || '-'}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${assignmentStatusBadge(assignment.status)}`}
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
