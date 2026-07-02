import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TELEMATICS_THRESHOLDS } from '../queue/telematics-thresholds';
import { FleetMaintenanceService } from '../fleet/fleet-maintenance.service';
import { TachographApiService } from './tachograph-api.service';

describe('tachograph dashboard integration endpoints', () => {
  it('exposes idle fuel cost constants', () => {
    assert.equal(TELEMATICS_THRESHOLDS.idleFuelLitersPerHourTruck, 3.0);
    assert.equal(TELEMATICS_THRESHOLDS.idleFuelLitersPerHourVan, 1.0);
    assert.equal(TELEMATICS_THRESHOLDS.defaultFuelEurPerLiter, 1.75);
  });

  it('aggregates vehicle costs by calendar month', async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10));

    const prisma = {
      vehicle: {
        findFirst: async () => ({ id: 'veh-1' }),
      },
      fleetFuelEntry: {
        findMany: async () => [
          { enteredAt: thisMonth, totalCost: 120.5 },
          { enteredAt: prevMonth, totalCost: 80 },
        ],
      },
      serviceRecord: {
        findMany: async () => [{ date: thisMonth, costAmount: 250 }],
      },
      fine: {
        findMany: async () => [{ violationAt: thisMonth, amount: 45 }],
      },
    };

    const service = new FleetMaintenanceService(
      prisma as never,
      { getVehicleStatus: async () => ({ maintenanceRules: [], currentOdometerKm: 0 }) } as never,
    );

    const result = await service.getVehicleCosts('tenant-1', 'veh-1', 6);
    assert.equal(result.serviceCostUnavailable, false);
    assert.equal(result.months.length, 6);
    assert.ok(result.totalEur > 0);

    const currentKey = `${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentMonth = result.months.find(
      (month) =>
        month.monthStart.startsWith(`${thisMonth.getUTCFullYear()}-${String(thisMonth.getUTCMonth() + 1).padStart(2, '0')}`) ||
        month.monthStart.includes(currentKey),
    );
    assert.ok(currentMonth);
    assert.equal(currentMonth!.fuelEur, 120.5);
    assert.equal(currentMonth!.serviceEur, 250);
    assert.equal(currentMonth!.fineEur, 45);
  });

  it('counts drivers out of time from remaining snapshot', async () => {
    const prisma = {
      driver: { findMany: async () => [{ id: 'd1' }, { id: 'd2' }] },
    };
    const api = new TachographApiService(prisma as never, {} as never);

    api.getBadges = async () => ({
      openCriticalInfringements: 2,
      unacknowledgedInfringements: 3,
      overdueCardDownloads: 1,
      overdueVuDownloads: 2,
      activeCriticalDtcs: 0,
    });
    (api as unknown as Record<string, unknown>)['computeFleetComplianceScore'] = async () => ({
      current: 88,
      trend: 3,
    });
    (api as unknown as Record<string, unknown>)['buildWeeklyComplianceScoreTrend'] = async () => [
      { weekStart: new Date().toISOString(), scorePct: 88 },
    ];
    api.getRemainingDriving = async () => ({
      generatedAt: new Date().toISOString(),
      hasActivityData: true,
      drivers: [
        { todayRemainingDrivingS: 0, exceedsRemaining: false },
        { todayRemainingDrivingS: 3600, exceedsRemaining: true },
        { todayRemainingDrivingS: 7200, exceedsRemaining: false },
      ],
      warnings: [],
    } as never);

    const summary = await api.getDashboardSummary('tenant-1');
    assert.equal(summary.complianceScorePct, 88);
    assert.equal(summary.openCriticalCount, 2);
    assert.equal(summary.driversOutOfTimeToday, 2);
    assert.equal(summary.overdueDownloadsTotal, 3);
  });
});
