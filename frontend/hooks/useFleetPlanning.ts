'use client';

import { useMemo } from 'react';
import { useFleetData, type FleetAssignment } from '@/context/FleetDataContext';
import { usePlanningDate } from './usePlanningDate';

export function useFleetPlanning(defaultDate?: string) {
  const { assignments, drivers, getDriverAvailability, calculateDailyRevenue } = useFleetData();
  const { planningDate, today, setPlanningDate, shiftPlanningDate, isToday } = usePlanningDate(defaultDate);

  const dayAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.date === planningDate),
    [assignments, planningDate],
  );

  const planningRows = useMemo(() => {
    return dayAssignments.map((assignment) => {
      const driver = drivers.find((item) => item.id === assignment.driverId);
      const effectiveAvailability = getDriverAvailability(assignment.driverId, planningDate);
      return {
        assignment,
        driverName: driver?.name ?? assignment.driverId,
        effectiveAvailability,
        accidentCount: driver?.accidentCount ?? 0,
        riskScore: driver?.riskScore ?? ('green' as const),
      };
    });
  }, [dayAssignments, drivers, getDriverAvailability, planningDate]);

  const expectedDailyRevenue = useMemo(
    () => calculateDailyRevenue(planningDate),
    [calculateDailyRevenue, planningDate],
  );

  return {
    planningDate,
    today,
    isToday,
    setPlanningDate,
    shiftPlanningDate,
    dayAssignments,
    planningRows,
    expectedDailyRevenue,
  };
}

export type PlanningRow = ReturnType<typeof useFleetPlanning>['planningRows'][number];

export function filterAssignmentsByDate(assignments: FleetAssignment[], date: string) {
  return assignments.filter((assignment) => assignment.date === date);
}
