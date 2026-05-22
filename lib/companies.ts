import { getUser } from './auth';
import { cargoDamageCompanies, getCargoDamageReportsByCompany } from './cargo-damage';
import { getDocumentsByOwner } from './documents';
import { mockDrivers, mockVehicles } from './mock-data';
import { canViewFinancials } from './permissions';

export interface Company {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  defaultDailyRevenue: number;
  contactPerson?: string;
  notes?: string;
  createdAt: string;
}

export interface CompanyAssignment {
  id: string;
  companyId: string;
  date: string;
  driverId: string;
  vehicleId: string;
  route: string;
  startTime: string;
  endTime: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  expectedRevenue: number;
}

export interface CompanyEmailItem {
  id: string;
  companyId: string;
  date: string;
  subject: string;
  recipient: string;
  status: 'sent' | 'pending' | 'failed';
  lastSent: string;
}

export const companiesStore: Company[] = [
  {
    id: 'cmp-dhl',
    name: 'DHL',
    email: 'dispo@dhl-example.com',
    phone: '+49 30 100100',
    address: 'DHL Platz 1, Berlin',
    defaultDailyRevenue: 1100,
    contactPerson: 'Julia Kramer',
    notes: 'Primary city distribution customer.',
    createdAt: '2025-01-10',
  },
  {
    id: 'cmp-amazon',
    name: 'Amazon',
    email: 'logistics@amazon-example.com',
    phone: '+49 30 200200',
    address: 'Amazon Hub 2, Leipzig',
    defaultDailyRevenue: 1200,
    contactPerson: 'Felix Hartmann',
    notes: 'High volume morning shifts.',
    createdAt: '2025-02-18',
  },
  {
    id: 'cmp-ups',
    name: 'UPS',
    email: 'dispatch@ups-example.com',
    phone: '+49 30 300300',
    address: 'UPS Ring 3, Hamburg',
    defaultDailyRevenue: 950,
    contactPerson: 'Mona Weiss',
    notes: 'Evening pickup windows.',
    createdAt: '2025-03-02',
  },
  {
    id: 'cmp-hermes',
    name: 'Hermes',
    email: 'touren@hermes-example.com',
    phone: '+49 30 400400',
    address: 'Hermes Strasse 4, Hannover',
    defaultDailyRevenue: 880,
    contactPerson: 'Deniz Aslan',
    notes: 'Weekend load peaks.',
    createdAt: '2025-04-09',
  },
  {
    id: 'cmp-dbs',
    name: 'DB Schenker',
    email: 'planung@dbschenker-example.com',
    phone: '+49 30 500500',
    address: 'Schenker Campus 5, Frankfurt',
    defaultDailyRevenue: 1050,
    contactPerson: 'Markus Geiger',
    notes: 'Stable route contracts.',
    createdAt: '2025-05-22',
  },
];

const assignmentsStore: CompanyAssignment[] = [
  {
    id: 'ca-1',
    companyId: 'cmp-dhl',
    date: '2026-05-21',
    driverId: 'drv-101',
    vehicleId: 'veh-001',
    route: 'Berlin Route 1',
    startTime: '07:00',
    endTime: '16:00',
    status: 'in_progress',
    expectedRevenue: 1100,
  },
  {
    id: 'ca-2',
    companyId: 'cmp-amazon',
    date: '2026-05-21',
    driverId: 'drv-102',
    vehicleId: 'veh-002',
    route: 'Leipzig Tour',
    startTime: '06:30',
    endTime: '15:30',
    status: 'in_progress',
    expectedRevenue: 1200,
  },
  {
    id: 'ca-3',
    companyId: 'cmp-dhl',
    date: '2026-05-20',
    driverId: 'drv-101',
    vehicleId: 'veh-001',
    route: 'Airport Hub',
    startTime: '08:00',
    endTime: '16:30',
    status: 'completed',
    expectedRevenue: 980,
  },
  {
    id: 'ca-4',
    companyId: 'cmp-dbs',
    date: '2026-05-19',
    driverId: 'drv-103',
    vehicleId: 'veh-003',
    route: 'Hamburg Transfer',
    startTime: '09:00',
    endTime: '18:00',
    status: 'completed',
    expectedRevenue: 1040,
  },
  {
    id: 'ca-5',
    companyId: 'cmp-hermes',
    date: '2026-05-18',
    driverId: 'drv-104',
    vehicleId: 'veh-004',
    route: 'Night Depot',
    startTime: '20:00',
    endTime: '04:30',
    status: 'cancelled',
    expectedRevenue: 700,
  },
];

const emailHistoryStore: CompanyEmailItem[] = [
  {
    id: 'mail-1',
    companyId: 'cmp-dhl',
    date: '2026-05-20',
    subject: 'Daily dispatch summary',
    recipient: 'dispo@dhl-example.com',
    status: 'sent',
    lastSent: '2026-05-20 18:10',
  },
  {
    id: 'mail-2',
    companyId: 'cmp-dhl',
    date: '2026-05-21',
    subject: 'Missing POD attachment',
    recipient: 'dispo@dhl-example.com',
    status: 'pending',
    lastSent: '2026-05-21 10:05',
  },
  {
    id: 'mail-3',
    companyId: 'cmp-amazon',
    date: '2026-05-21',
    subject: 'Shift ETA update',
    recipient: 'logistics@amazon-example.com',
    status: 'sent',
    lastSent: '2026-05-21 07:40',
  },
];

export function getCompanies() {
  return [...companiesStore];
}

export function getCompanyById(id: string) {
  return companiesStore.find((item) => item.id === id) ?? null;
}

export function getCompanyAssignments(companyId: string) {
  return assignmentsStore.filter((item) => item.companyId === companyId);
}

export function getCompanyEmailHistory(companyId: string) {
  return emailHistoryStore.filter((item) => item.companyId === companyId);
}

export function getCompanyDriverHistory(companyId: string) {
  const rows = getCompanyAssignments(companyId);
  const grouped: Record<string, { first: string; last: string; total: number }> = {};

  rows.forEach((row) => {
    const current = grouped[row.driverId];
    if (!current) {
      grouped[row.driverId] = { first: row.date, last: row.date, total: 1 };
      return;
    }

    grouped[row.driverId] = {
      first: row.date < current.first ? row.date : current.first,
      last: row.date > current.last ? row.date : current.last,
      total: current.total + 1,
    };
  });

  return Object.entries(grouped).map(([driverId, value]) => {
    const driver = mockDrivers.find((item) => item.id === driverId);
    return {
      driverId,
      driverName: driver ? `${driver.first_name} ${driver.last_name}` : driverId,
      firstAssignmentDate: value.first,
      lastAssignmentDate: value.last,
      totalAssignments: value.total,
    };
  });
}

export function getCompanyVehicleHistory(companyId: string) {
  const rows = getCompanyAssignments(companyId);
  const grouped: Record<string, { first: string; last: string; total: number }> = {};

  rows.forEach((row) => {
    const current = grouped[row.vehicleId];
    if (!current) {
      grouped[row.vehicleId] = { first: row.date, last: row.date, total: 1 };
      return;
    }

    grouped[row.vehicleId] = {
      first: row.date < current.first ? row.date : current.first,
      last: row.date > current.last ? row.date : current.last,
      total: current.total + 1,
    };
  });

  return Object.entries(grouped).map(([vehicleId, value]) => {
    const vehicle = mockVehicles.find((item) => item.id === vehicleId);
    return {
      vehicleId,
      plateNumber: vehicle?.plate_number ?? vehicleId,
      firstAssignmentDate: value.first,
      lastAssignmentDate: value.last,
      totalAssignments: value.total,
    };
  });
}

export function getCompanyCurrentStats(companyId: string) {
  const current = getCompanyAssignments(companyId).filter((item) => item.status === 'in_progress' || item.status === 'planned');
  const drivers = new Set(current.map((item) => item.driverId));
  const vehicles = new Set(current.map((item) => item.vehicleId));

  return {
    activeAssignments: current.length,
    currentDrivers: drivers.size,
    currentVehicles: vehicles.size,
  };
}

export function getCompanyDocuments(companyId: string) {
  return getDocumentsByOwner('company', companyId);
}

export function getCompanyCargoDamages(companyId: string) {
  return getCargoDamageReportsByCompany(companyId);
}

export function canCurrentUserViewFinancials() {
  const user = getUser();
  if (!user) return false;
  return canViewFinancials(user.role);
}

export function resolveCompanyName(companyId: string) {
  return cargoDamageCompanies.find((item) => item.id === companyId)?.name ?? getCompanyById(companyId)?.name ?? companyId;
}
