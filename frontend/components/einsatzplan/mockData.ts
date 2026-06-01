import type { AlertItem, DriverPlanRow } from './types';

function toDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export const TODAY = toDateString(0);
export const TOMORROW = toDateString(1);

export const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => 6 + i);

export const mockDriverRows: DriverPlanRow[] = [
  {
    id: 'd-1',
    department: 'go',
    driverName: 'Ilker Cukur',
    vehiclePlate: 'AP101',
    company: 'DHL',
    phone: '+49 151 111 1101',
    licenseExpiry: '2026-06-20',
    accidentCount: 1,
    riskLevel: 'medium',
    assignments: [
      {
        id: 'a-1',
        date: TOMORROW,
        startHour: 7,
        endHour: 14,
        status: 'planned',
        serviceTask: 'Linehaul Delivery',
        notes: 'Morning route for Berlin north zone.',
      },
    ],
  },
  {
    id: 'd-2',
    department: 'go',
    driverName: 'Thomas Scharein',
    vehiclePlate: 'AP102',
    company: 'Amazon',
    phone: '+49 151 111 1102',
    licenseExpiry: '2026-08-12',
    accidentCount: 0,
    riskLevel: 'low',
    assignments: [
      {
        id: 'a-2',
        date: TOMORROW,
        startHour: 9,
        endHour: 17,
        status: 'in_progress',
        serviceTask: 'Warehouse Transfer',
        notes: 'Transfer between depots A and C.',
      },
    ],
  },
  {
    id: 'd-3',
    department: 'krage',
    driverName: 'Sita Diallo',
    vehiclePlate: 'AP103',
    company: 'UPS',
    phone: '+49 151 111 1103',
    licenseExpiry: '2027-01-04',
    accidentCount: 0,
    riskLevel: 'low',
    assignments: [
      {
        id: 'a-3',
        date: TOMORROW,
        startHour: 6,
        endHour: 12,
        status: 'completed',
        serviceTask: 'Priority Shipment Run',
        notes: 'Priority parcels to airport logistics hub.',
      },
    ],
  },
  {
    id: 'd-4',
    department: 'krage',
    driverName: 'Andrii Dudiak',
    vehiclePlate: 'AP104',
    company: 'Hermes',
    phone: '+49 151 111 1104',
    licenseExpiry: '2026-11-30',
    accidentCount: 2,
    riskLevel: 'high',
    assignments: [],
    dayStatus: 'sick',
  },
  {
    id: 'd-5',
    department: 'krage',
    driverName: 'Nesrin Feyzula',
    vehiclePlate: 'AP105',
    company: 'DB Schenker',
    phone: '+49 151 111 1105',
    licenseExpiry: '2026-09-18',
    accidentCount: 0,
    riskLevel: 'medium',
    assignments: [],
    dayStatus: 'vacation',
  },
];

export const mockAlerts: AlertItem[] = [
  { id: 'al-1', title: 'AP102 TUV expires in 14 days', description: 'Vehicle inspection renewal required soon.', tone: 'warning' },
  { id: 'al-2', title: 'Ilker Cukur license expires in 30 days', description: 'Driver document renewal should be scheduled.', tone: 'danger' },
  { id: 'al-3', title: '2 drivers are on vacation tomorrow', description: 'Coverage impact on Krage department.', tone: 'info' },
  { id: 'al-4', title: '1 sick leave request waiting for approval', description: 'HR confirmation pending.', tone: 'success' },
];
