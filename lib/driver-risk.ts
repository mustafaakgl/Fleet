import { getCargoDamageReportsByDriver } from './cargo-damage';
import { mockDrivers } from './mock-data';

export type DriverRiskTone = 'green' | 'yellow' | 'red';
export type DriverRiskLabel = 'Low' | 'Medium' | 'High';

export interface DriverRiskBreakdown {
  trafficAccidents: number;
  vehicleDamages: number;
  cargoDamages: number;
  missingDocuments: number;
  lateDeliveries: number;
}

export interface DriverRiskSummary {
  safetyRisk: { points: number; tone: DriverRiskTone; label: DriverRiskLabel };
  operationalRisk: { points: number; tone: DriverRiskTone; label: DriverRiskLabel };
  overallRisk: { points: number; tone: DriverRiskTone; label: DriverRiskLabel };
  breakdown: DriverRiskBreakdown;
}

const DRIVER_VEHICLE_DAMAGE: Record<string, number> = {
  'drv-101': 1,
  'drv-102': 0,
  'drv-103': 0,
  'drv-104': 2,
  'drv-105': 0,
};

const DRIVER_LATE_DELIVERIES: Record<string, number> = {
  'drv-101': 1,
  'drv-102': 2,
  'drv-103': 0,
  'drv-104': 1,
  'drv-105': 0,
};

function levelForPoints(points: number): { tone: DriverRiskTone; label: DriverRiskLabel } {
  if (points <= 2) return { tone: 'green', label: 'Low' };
  if (points <= 5) return { tone: 'yellow', label: 'Medium' };
  return { tone: 'red', label: 'High' };
}

function getMissingDocumentCount(driverId: string) {
  const driver = mockDrivers.find((item) => item.id === driverId);
  if (!driver) return 0;

  let missing = 0;
  if (!driver.license_number || !driver.license_expiry_date) missing += 1;
  if (!driver.passport_number || !driver.passport_expiry_date) missing += 1;
  return missing;
}

function getApprovedCargoDamageCount(driverId: string) {
  return getCargoDamageReportsByDriver(driverId).filter((item) => item.status === 'approved').length;
}

export function calculateDriverRisk(driverId: string): DriverRiskSummary {
  const driver = mockDrivers.find((item) => item.id === driverId);

  const trafficAccidents = driver?.accident_count ?? 0;
  const vehicleDamages = DRIVER_VEHICLE_DAMAGE[driverId] ?? 0;
  const cargoDamages = getApprovedCargoDamageCount(driverId);
  const missingDocuments = getMissingDocumentCount(driverId);
  const lateDeliveries = DRIVER_LATE_DELIVERIES[driverId] ?? 0;

  const safetyPoints = trafficAccidents * 3 + vehicleDamages * 2;
  const operationalPoints = cargoDamages + missingDocuments + lateDeliveries;
  const overallPoints = safetyPoints + operationalPoints;

  return {
    safetyRisk: { points: safetyPoints, ...levelForPoints(safetyPoints) },
    operationalRisk: { points: operationalPoints, ...levelForPoints(operationalPoints) },
    overallRisk: { points: overallPoints, ...levelForPoints(overallPoints) },
    breakdown: {
      trafficAccidents,
      vehicleDamages,
      cargoDamages,
      missingDocuments,
      lateDeliveries,
    },
  };
}
