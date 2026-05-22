import type { CargoDamageReport, CargoDamageStatus } from './types';

export interface CargoDamageTimelineItem {
  id: string;
  at: string;
  title: string;
  note: string;
}

export interface CargoDamageCompany {
  id: string;
  name: string;
  email: string;
}

export const cargoDamageCompanies: CargoDamageCompany[] = [
  { id: 'cmp-dhl', name: 'DHL', email: 'dispo@dhl-example.com' },
  { id: 'cmp-amazon', name: 'Amazon', email: 'logistics@amazon-example.com' },
  { id: 'cmp-ups', name: 'UPS', email: 'dispatch@ups-example.com' },
  { id: 'cmp-hermes', name: 'Hermes', email: 'touren@hermes-example.com' },
  { id: 'cmp-dbs', name: 'DB Schenker', email: 'planung@dbschenker-example.com' },
];

const cargoDamageStore: CargoDamageReport[] = [
  {
    id: 'cdr-1001',
    driverId: 'drv-101',
    vehicleId: 'veh-001',
    companyId: 'cmp-dhl',
    assignmentId: 'asg-101',
    date: '2026-05-20',
    time: '10:22',
    damageType: 'cargo_damaged',
    cargoName: 'Electronics pallets',
    cargoOwner: 'DHL Customer',
    companyName: 'DHL',
    description: 'Two pallets shifted during unloading and outer cartons were damaged.',
    photos: ['cargo-damage-1001-1.jpg', 'cargo-damage-1001-2.jpg'],
    documentPhoto: 'delivery-note-1001.jpg',
    damageValue: 2400,
    status: 'pending',
    createdAt: '2026-05-20T10:25:00Z',
  },
  {
    id: 'cdr-1002',
    driverId: 'drv-102',
    vehicleId: 'veh-002',
    companyId: 'cmp-amazon',
    assignmentId: 'asg-102',
    date: '2026-05-19',
    time: '15:05',
    damageType: 'packaging_damage',
    cargoName: 'Parcel box',
    cargoOwner: 'Amazon',
    companyName: 'Amazon',
    description: 'Parcel box corner damaged during transfer from ramp to truck.',
    photos: ['cargo-damage-1002-1.jpg'],
    documentPhoto: 'proof-of-delivery-1002.jpg',
    damageValue: 380,
    status: 'under_review',
    createdAt: '2026-05-19T15:09:00Z',
  },
];

export function getCargoDamageReports() {
  return [...cargoDamageStore].sort((a, b) => {
    if (a.date === b.date) return b.time.localeCompare(a.time);
    return b.date.localeCompare(a.date);
  });
}

export function getCargoDamageReportById(id: string) {
  return cargoDamageStore.find((item) => item.id === id) ?? null;
}

export function getCargoDamageReportsByDriver(driverId: string) {
  return getCargoDamageReports().filter((item) => item.driverId === driverId);
}

export function getCargoDamageReportsByVehicle(vehicleId: string) {
  return getCargoDamageReports().filter((item) => item.vehicleId === vehicleId);
}

export function getCargoDamageReportsByCompany(companyId: string) {
  return getCargoDamageReports().filter((item) => item.companyId === companyId);
}

export function countApprovedCargoDamageForDriver(driverId: string) {
  return cargoDamageStore.filter((item) => item.driverId === driverId && item.status === 'approved').length;
}

export function updateCargoDamageStatus(id: string, status: CargoDamageStatus) {
  const target = cargoDamageStore.find((item) => item.id === id);
  if (!target) return null;
  target.status = status;
  return target;
}

export function createCargoDamageReport(input: {
  id: string;
  driverId: string;
  vehicleId: string;
  companyId?: string;
  companyName?: string;
  assignmentId?: string;
  date: string;
  time: string;
  description?: string;
}) {
  if (input.assignmentId) {
    const existing = cargoDamageStore.find((item) => item.assignmentId === input.assignmentId);
    if (existing) return existing;
  }

  const report: CargoDamageReport = {
    id: input.id,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    companyId: input.companyId ?? 'cmp-dhl',
    assignmentId: input.assignmentId,
    date: input.date,
    time: input.time,
    damageType: 'other',
    cargoName: 'Vehicle handover damage',
    cargoOwner: input.companyName ?? 'Fleet Operations',
    companyName: input.companyName ?? 'Fleet Operations',
    description: input.description ?? 'Damage detected during vehicle handover.',
    photos: [],
    documentPhoto: undefined,
    damageValue: undefined,
    status: 'pending',
    createdAt: `${input.date}T${input.time}:00Z`,
  };

  cargoDamageStore.push(report);
  return report;
}

export function getCargoDamageTimeline(report: CargoDamageReport): CargoDamageTimelineItem[] {
  const base: CargoDamageTimelineItem[] = [
    {
      id: `${report.id}-t1`,
      at: report.createdAt,
      title: 'Report created',
      note: report.description || 'Driver submitted cargo damage with photos.',
    },
  ];

  if (report.status === 'under_review' || report.status === 'approved' || report.status === 'rejected' || report.status === 'closed') {
    base.push({
      id: `${report.id}-t2`,
      at: '2026-05-20T12:00:00Z',
      title: 'Under review',
      note: 'Admin started verification.',
    });
  }

  if (report.status === 'approved') {
    base.push({
      id: `${report.id}-t3`,
      at: '2026-05-20T13:30:00Z',
      title: 'Approved',
      note: 'Damage value accepted for compensation workflow.',
    });
  }

  if (report.status === 'rejected') {
    base.push({
      id: `${report.id}-t3`,
      at: '2026-05-20T13:30:00Z',
      title: 'Rejected',
      note: 'Insufficient evidence.',
    });
  }

  if (report.status === 'closed') {
    base.push({
      id: `${report.id}-t4`,
      at: '2026-05-20T15:00:00Z',
      title: 'Closed',
      note: 'Case archived by admin.',
    });
  }

  return base;
}
