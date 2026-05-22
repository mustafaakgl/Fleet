'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { getDriverRiskScore, type DriverRiskScore } from '@/lib/utils';
import { findPreviousVehicleFromAssignments, upsertVehicleHandover } from '@/lib/vehicle-handovers';

export type CalendarStatusCode = 'UT' | 'KT' | 'FT' | 'AT' | 'HO' | 'GR' | 'SCH';
export type CalendarStatusSource = 'manual' | 'request';
export type DriverAvailability = 'Available' | 'Urlaub' | 'Krank' | 'Feiertag' | 'Not Assigned';
export type PlanningStatus = 'Planned' | 'In Progress' | 'Unavailable';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Needs Review' | 'Cancelled';
export type RequestType =
  | 'Krankheit melden'
  | 'Urlaub beantragen'
  | 'Sonstige Abwesenheit'
  | 'Dokument hochladen'
  | 'Unfall melden'
  | 'Fahrzeugschaden melden'
  | 'Arbeitskleidung bestätigen';
export type SonstigeAbwesenheitType =
  | 'Krankenstand'
  | 'Sonderurlaub'
  | 'Pflegefreistellung'
  | 'Schulung'
  | 'Homeoffice'
  | 'Geschäftsreise';
export type AssignmentSource = 'manual' | 'mobile_checkin';
export type MorningCheckinStatus =
  | 'Confirmed'
  | 'Waiting for Review'
  | 'Missing Vehicle Plate'
  | 'Missing Company'
  | 'Conflict'
  | 'Added to Einsatzplan'
  | 'Rejected';

export interface FleetDriver {
  id: string;
  name: string;
  department: string;
  accidentCount: number;
  riskScore: DriverRiskScore;
}

export interface FleetCalendarStatus {
  id: string;
  driverId: string;
  date: string;
  status: CalendarStatusCode;
  source: CalendarStatusSource;
  requestId?: string;
}

export interface FleetAssignment {
  id: string;
  date: string;
  driverId: string;
  department: string;
  availability: DriverAvailability;
  vehicle: string;
  company: string;
  routeJob: string;
  startTime: string;
  endTime: string;
  status: PlanningStatus;
  source: AssignmentSource;
  expectedRevenue: number;
  notes: string;
}

export interface MorningCheckin {
  id: string;
  driverId: string;
  date: string;
  submittedAt: string;
  vehiclePlate?: string;
  company?: string;
  startLocation?: string;
  gps?: {
    lat: number;
    lng: number;
  };
  status: MorningCheckinStatus;
  conflictReason?: string;
  source: 'mobile_app';
  notes?: string;
  phone?: string;
}

export interface MorningCheckinValidation {
  status: MorningCheckinStatus;
  conflictReason?: string;
}

export interface FleetRequest {
  id: string;
  driverId: string;
  driverName: string;
  department: string;
  type: RequestType;
  sonstigeAbwesenheitType?: SonstigeAbwesenheitType;
  dateFrom: string | null;
  dateTo: string | null;
  uploadedDocument: string;
  status: RequestStatus;
  responsibleDepartment: string;
  submittedAt: string;
  notes: string;
}

interface RevenueData {
  monthlyRevenue: number;
  todayRevenue: number;
  tomorrowForecast: number;
  lostRevenueThisMonth: number;
  revenueByCompany: Array<{ name: string; amount: number }>;
  revenueByVehicle: Array<{ name: string; amount: number }>;
  revenueByDriver: Array<{ name: string; amount: number }>;
}

interface FleetDataContextValue {
  drivers: FleetDriver[];
  calendarStatuses: FleetCalendarStatus[];
  requests: FleetRequest[];
  assignments: FleetAssignment[];
  morningCheckins: MorningCheckin[];
  revenueData: RevenueData;
  approveRequest: (requestId: string) => { calendarUpdated: boolean };
  rejectRequest: (requestId: string) => void;
  cancelRequest: (requestId: string) => void;
  moveRequestToNeedsReview: (requestId: string) => void;
  updateCalendarFromRequest: (request: FleetRequest) => boolean;
  getDriverAvailability: (driverId: string, date: string) => DriverAvailability;
  getCalendarStatusEntry: (driverId: string, date: string) => FleetCalendarStatus | undefined;
  calculateDailyRevenue: (date: string) => number;
  calculateMonthlyRevenue: (month: number, year: number) => number;
  updateAssignment: (assignmentId: string, updates: Partial<FleetAssignment>) => void;
  validateMorningCheckin: (checkin: MorningCheckin) => MorningCheckinValidation;
  addCheckinToEinsatzplan: (checkinId: string) => { success: boolean; message: string };
  rejectMorningCheckin: (checkinId: string) => void;
  updateMorningCheckin: (checkinId: string, data: Partial<MorningCheckin>) => void;
}

const FleetDataContext = createContext<FleetDataContextValue | undefined>(undefined);

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number) {
  const value = new Date(base);
  value.setDate(value.getDate() + days);
  return value;
}

function toDateRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const output: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    output.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return output;
}

function mapRequestToCalendarStatus(request: FleetRequest): CalendarStatusCode | null {
  if (request.type === 'Urlaub beantragen') return 'UT';
  if (request.type === 'Krankheit melden') return 'KT';
  if (request.type === 'Sonstige Abwesenheit') {
    if (request.sonstigeAbwesenheitType === 'Krankenstand') return 'KT';
    if (request.sonstigeAbwesenheitType === 'Sonderurlaub') return 'UT';
    if (request.sonstigeAbwesenheitType === 'Pflegefreistellung') return 'UT';
    if (request.sonstigeAbwesenheitType === 'Schulung') return 'SCH';
    if (request.sonstigeAbwesenheitType === 'Homeoffice') return 'HO';
    if (request.sonstigeAbwesenheitType === 'Geschäftsreise') return 'GR';
  }
  return null;
}

const now = new Date();
const today = formatDate(now);
const tomorrow = formatDate(addDays(now, 1));

const initialDrivers: FleetDriver[] = [
  { id: 'ilker-cukur', name: 'Ilker Cukur', department: 'Go', accidentCount: 1, riskScore: getDriverRiskScore(1) },
  { id: 'thomas-scharein', name: 'Thomas Scharein', department: 'Go', accidentCount: 2, riskScore: getDriverRiskScore(2) },
  { id: 'sita-diallo', name: 'Sita Diallo', department: 'Krage', accidentCount: 3, riskScore: getDriverRiskScore(3) },
  { id: 'andrii-dudiak', name: 'Andrii Dudiak', department: 'Krage', accidentCount: 0, riskScore: getDriverRiskScore(0) },
  { id: 'nesrin-feyzula', name: 'Nesrin Feyzula', department: 'Krage', accidentCount: 1, riskScore: getDriverRiskScore(1) },
  { id: 'gundrum-andreas', name: 'Gundrum Andreas', department: 'Krage', accidentCount: 0, riskScore: getDriverRiskScore(0) },
  { id: 'ozdemir-hakan', name: 'Ozdemir Hakan', department: 'Office', accidentCount: 0, riskScore: getDriverRiskScore(0) },
];

const COMPANY_DEFAULT_REVENUE: Record<string, number> = {
  DHL: 850,
  Amazon: 1200,
  UPS: 900,
  Hermes: 800,
  'DB Schenker': 1050,
};

const initialCalendarStatuses: FleetCalendarStatus[] = [
  {
    id: `status-${today}-sita-ut`,
    driverId: 'sita-diallo',
    date: today,
    status: 'UT',
    source: 'manual',
  },
  {
    id: `status-${today}-andrii-kt`,
    driverId: 'andrii-dudiak',
    date: today,
    status: 'KT',
    source: 'manual',
  },
];

const initialAssignments: FleetAssignment[] = [
  {
    id: 'tp-today-1',
    date: today,
    driverId: 'ozdemir-hakan',
    department: 'Office',
    availability: 'Available',
    vehicle: 'AP-102',
    company: 'Internal Dispatch',
    routeJob: 'Yard Planning',
    startTime: '06:30',
    endTime: '14:30',
    status: 'In Progress',
    source: 'manual',
    expectedRevenue: 0,
    notes: 'Office dispatch shift',
  },
  {
    id: 'tp-1',
    date: tomorrow,
    driverId: 'ilker-cukur',
    department: 'Go',
    availability: 'Available',
    vehicle: 'AP-101',
    company: 'DHL',
    routeJob: 'Berlin Route 1',
    startTime: '07:00',
    endTime: '16:00',
    status: 'Planned',
    source: 'manual',
    expectedRevenue: 850,
    notes: '',
  },
  {
    id: 'tp-2',
    date: tomorrow,
    driverId: 'thomas-scharein',
    department: 'Go',
    availability: 'Available',
    vehicle: 'AP-102',
    company: 'Amazon',
    routeJob: 'Leipzig Tour',
    startTime: '06:30',
    endTime: '15:30',
    status: 'Planned',
    source: 'manual',
    expectedRevenue: 1200,
    notes: '',
  },
  {
    id: 'tp-3',
    date: tomorrow,
    driverId: 'sita-diallo',
    department: 'Krage',
    availability: 'Urlaub',
    vehicle: '',
    company: '',
    routeJob: '',
    startTime: '',
    endTime: '',
    status: 'Unavailable',
    source: 'manual',
    expectedRevenue: 0,
    notes: '',
  },
  {
    id: 'tp-4',
    date: tomorrow,
    driverId: 'andrii-dudiak',
    department: 'Krage',
    availability: 'Krank',
    vehicle: '',
    company: '',
    routeJob: '',
    startTime: '',
    endTime: '',
    status: 'Unavailable',
    source: 'manual',
    expectedRevenue: 0,
    notes: '',
  },
  {
    id: 'tp-5',
    date: tomorrow,
    driverId: 'nesrin-feyzula',
    department: 'Krage',
    availability: 'Available',
    vehicle: 'AP-105',
    company: 'DB Schenker',
    routeJob: 'Hamburg Tour',
    startTime: '08:00',
    endTime: '17:00',
    status: 'Planned',
    source: 'manual',
    expectedRevenue: 1050,
    notes: '',
  },
];

const initialMorningCheckins: MorningCheckin[] = [
  {
    id: 'mc-1',
    driverId: 'ilker-cukur',
    date: today,
    submittedAt: '06:58',
    vehiclePlate: 'AP-101',
    company: 'DHL',
    startLocation: 'Berlin Neukolln',
    gps: { lat: 52.4811, lng: 13.4369 },
    status: 'Confirmed',
    source: 'mobile_app',
    notes: 'On-site and ready.',
    phone: '+49 151 0000001',
  },
  {
    id: 'mc-2',
    driverId: 'thomas-scharein',
    date: today,
    submittedAt: '07:05',
    vehiclePlate: 'AP-102',
    company: 'Amazon',
    startLocation: 'Berlin Spandau',
    gps: { lat: 52.534, lng: 13.1976 },
    status: 'Waiting for Review',
    conflictReason: 'Vehicle already planned',
    source: 'mobile_app',
    notes: 'Started loading.',
    phone: '+49 151 0000002',
  },
  {
    id: 'mc-3',
    driverId: 'sita-diallo',
    date: today,
    submittedAt: '07:10',
    vehiclePlate: 'AP-105',
    company: 'DB Schenker',
    startLocation: 'Berlin Mitte',
    gps: { lat: 52.52, lng: 13.405 },
    status: 'Waiting for Review',
    conflictReason: 'Driver marked Urlaub',
    source: 'mobile_app',
    notes: 'Requesting manual override.',
    phone: '+49 151 0000003',
  },
  {
    id: 'mc-4',
    driverId: 'andrii-dudiak',
    date: today,
    submittedAt: '07:12',
    vehiclePlate: 'AP-104',
    company: 'Hermes',
    startLocation: 'Berlin Lichtenberg',
    gps: { lat: 52.513, lng: 13.4994 },
    status: 'Waiting for Review',
    conflictReason: 'Driver marked Krank',
    source: 'mobile_app',
    notes: 'Checked in by mistake.',
    phone: '+49 151 0000004',
  },
  {
    id: 'mc-5',
    driverId: 'nesrin-feyzula',
    date: today,
    submittedAt: '07:20',
    company: 'UPS',
    startLocation: 'Berlin Wedding',
    gps: { lat: 52.5504, lng: 13.3517 },
    status: 'Missing Vehicle Plate',
    source: 'mobile_app',
    notes: 'Forgot to select vehicle.',
    phone: '+49 151 0000005',
  },
  {
    id: 'mc-6',
    driverId: 'gundrum-andreas',
    date: today,
    submittedAt: '07:25',
    vehiclePlate: 'AP-106',
    startLocation: 'Berlin Tempelhof',
    gps: { lat: 52.469, lng: 13.3857 },
    status: 'Missing Company',
    source: 'mobile_app',
    notes: 'Customer not selected yet.',
    phone: '+49 151 0000006',
  },
];

const initialRequests: FleetRequest[] = [
  {
    id: 'REQ-1001',
    driverId: 'andrii-dudiak',
    driverName: 'Andrii Dudiak',
    department: 'Krage',
    type: 'Krankheit melden',
    dateFrom: '2026-05-14',
    dateTo: '2026-05-15',
    uploadedDocument: 'sick_note.pdf',
    status: 'Pending',
    responsibleDepartment: 'Office',
    submittedAt: '2026-05-13 18:10',
    notes: 'Fever and doctor consultation.',
  },
  {
    id: 'REQ-1002',
    driverId: 'sita-diallo',
    driverName: 'Sita Diallo',
    department: 'Krage',
    type: 'Urlaub beantragen',
    dateFrom: '2026-05-04',
    dateTo: '2026-05-08',
    uploadedDocument: '-',
    status: 'Pending',
    responsibleDepartment: 'Office',
    submittedAt: '2026-05-02 09:45',
    notes: 'Family trip request.',
  },
  {
    id: 'REQ-1003',
    driverId: 'ilker-cukur',
    driverName: 'Ilker Cukur',
    department: 'Go',
    type: 'Dokument hochladen',
    dateFrom: null,
    dateTo: null,
    uploadedDocument: 'license.pdf',
    status: 'Needs Review',
    responsibleDepartment: 'Office',
    submittedAt: '2026-05-10 11:23',
    notes: 'New license scan.',
  },
  {
    id: 'REQ-1003B',
    driverId: 'ilker-cukur',
    driverName: 'Ilker Cukur',
    department: 'Go',
    type: 'Sonstige Abwesenheit',
    sonstigeAbwesenheitType: 'Homeoffice',
    dateFrom: '2026-05-22',
    dateTo: '2026-05-22',
    uploadedDocument: '-',
    status: 'Pending',
    responsibleDepartment: 'Office',
    submittedAt: '2026-05-21 09:30',
    notes: 'One day homeoffice due to admin paperwork.',
  },
  {
    id: 'REQ-1004',
    driverId: 'thomas-scharein',
    driverName: 'Thomas Scharein',
    department: 'Go',
    type: 'Unfall melden',
    dateFrom: '2026-05-12',
    dateTo: '2026-05-12',
    uploadedDocument: 'accident_photos.zip',
    status: 'Pending',
    responsibleDepartment: 'Accident Department',
    submittedAt: '2026-05-12 17:35',
    notes: 'Minor collision report.',
  },
];

const initialRevenueData: RevenueData = {
  todayRevenue: 3100,
  tomorrowForecast: 3900,
  monthlyRevenue: 78350,
  lostRevenueThisMonth: 8100,
  revenueByCompany: [
    { name: 'DHL', amount: 16200 },
    { name: 'Amazon', amount: 14100 },
    { name: 'UPS', amount: 12500 },
    { name: 'Hermes', amount: 10750 },
    { name: 'DB Schenker', amount: 14500 },
  ],
  revenueByVehicle: [
    { name: 'AP-101', amount: 11400 },
    { name: 'AP-102', amount: 15300 },
    { name: 'AP-103', amount: 9800 },
    { name: 'AP-104', amount: 12300 },
    { name: 'AP-105', amount: 14450 },
  ],
  revenueByDriver: [
    { name: 'Ilker Cukur', amount: 15300 },
    { name: 'Thomas Scharein', amount: 16800 },
    { name: 'Sita Diallo', amount: 8100 },
    { name: 'Andrii Dudiak', amount: 7900 },
    { name: 'Nesrin Feyzula', amount: 14250 },
  ],
};

export function FleetDataProvider({ children }: { children: React.ReactNode }) {
  const [drivers] = useState<FleetDriver[]>(initialDrivers);
  const [calendarStatuses, setCalendarStatuses] = useState<FleetCalendarStatus[]>(initialCalendarStatuses);
  const [requests, setRequests] = useState<FleetRequest[]>(initialRequests);
  const [assignments, setAssignments] = useState<FleetAssignment[]>(initialAssignments);
  const [morningCheckins, setMorningCheckins] = useState<MorningCheckin[]>(initialMorningCheckins);
  const [revenueData] = useState<RevenueData>(initialRevenueData);

  function validateMorningCheckinInternal(
    checkin: MorningCheckin,
    currentAssignments: FleetAssignment[],
  ): MorningCheckinValidation {
    const vehiclePlate = checkin.vehiclePlate?.trim();
    const company = checkin.company?.trim();

    if (!company) {
      return { status: 'Missing Company' };
    }

    if (!vehiclePlate) {
      return { status: 'Missing Vehicle Plate' };
    }

    const availability = getDriverAvailability(checkin.driverId, checkin.date);
    if (availability === 'Urlaub') {
      return { status: 'Waiting for Review', conflictReason: 'Driver marked Urlaub' };
    }

    if (availability === 'Krank') {
      return { status: 'Waiting for Review', conflictReason: 'Driver marked Krank' };
    }

    const hasVehicleConflict = currentAssignments.some(
      (assignment) =>
        assignment.date === checkin.date
        && assignment.vehicle === vehiclePlate
        && assignment.driverId !== checkin.driverId
        && assignment.status !== 'Unavailable',
    );

    if (hasVehicleConflict) {
      return { status: 'Waiting for Review', conflictReason: 'Vehicle already planned' };
    }

    return { status: 'Confirmed' };
  }

  function updateCalendarFromRequest(request: FleetRequest) {
    const requestedStatus = mapRequestToCalendarStatus(request);

    if (!requestedStatus || !request.dateFrom) {
      return false;
    }

    const to = request.dateTo ?? request.dateFrom;
    const dates = toDateRange(request.dateFrom, to);

    setCalendarStatuses((current) => {
      const withoutOld = current.filter((entry) => entry.requestId !== request.id);
      const nextEntries = dates.map((date) => ({
        id: `${request.id}-${date}-${requestedStatus}`,
        driverId: request.driverId,
        date,
        status: requestedStatus,
        source: 'request' as const,
        requestId: request.id,
      }));
      return [...withoutOld, ...nextEntries];
    });

    return true;
  }

  function approveRequest(requestId: string) {
    const request = requests.find((item) => item.id === requestId);
    if (!request) {
      return { calendarUpdated: false };
    }

    const calendarUpdated = updateCalendarFromRequest(request);
    setRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Approved',
            }
          : item,
      ),
    );

    return { calendarUpdated };
  }

  function rejectRequest(requestId: string) {
    setRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Rejected',
            }
          : item,
      ),
    );

    setCalendarStatuses((current) => current.filter((entry) => entry.requestId !== requestId));
  }

  function cancelRequest(requestId: string) {
    setRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Cancelled',
            }
          : item,
      ),
    );

    setCalendarStatuses((current) => current.filter((entry) => entry.requestId !== requestId));
  }

  function moveRequestToNeedsReview(requestId: string) {
    setRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Needs Review',
            }
          : item,
      ),
    );
  }

  function getCalendarStatusEntry(driverId: string, date: string) {
    return calendarStatuses.find((entry) => entry.driverId === driverId && entry.date === date);
  }

  function getDriverAvailability(driverId: string, date: string): DriverAvailability {
    const statusEntry = getCalendarStatusEntry(driverId, date);

    if (statusEntry?.status === 'UT') return 'Urlaub';
    if (statusEntry?.status === 'KT') return 'Krank';
    if (statusEntry?.status === 'FT') return 'Feiertag';

    const assignment = assignments.find((item) => item.driverId === driverId && item.date === date);
    if (!assignment) return 'Not Assigned';

    return assignment.availability;
  }

  function calculateDailyRevenue(date: string) {
    return assignments
      .filter(
        (item) =>
          item.date === date
          && (item.status === 'Planned' || item.status === 'In Progress')
          && item.availability === 'Available',
      )
      .reduce((total, item) => total + item.expectedRevenue, 0);
  }

  function calculateMonthlyRevenue(month: number, year: number) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    return assignments
      .filter((item) => item.date.startsWith(monthKey) && (item.status === 'Planned' || item.status === 'In Progress'))
      .reduce((total, item) => total + item.expectedRevenue, 0);
  }

  function updateAssignment(assignmentId: string, updates: Partial<FleetAssignment>) {
    setAssignments((current) =>
      current.map((item) => {
        if (item.id !== assignmentId) return item;

        const merged = { ...item, ...updates };
        if (merged.availability !== 'Available') {
          return {
            ...merged,
            vehicle: '',
            company: '',
            routeJob: '',
            startTime: '',
            endTime: '',
            status: 'Unavailable',
            expectedRevenue: 0,
          };
        }

        return {
          ...merged,
          status: merged.status === 'In Progress' ? 'In Progress' : 'Planned',
          source: merged.source ?? 'manual',
        };
      }),
    );
  }

  function validateMorningCheckin(checkin: MorningCheckin) {
    return validateMorningCheckinInternal(checkin, assignments);
  }

  function addCheckinToEinsatzplan(checkinId: string) {
    const checkin = morningCheckins.find((item) => item.id === checkinId);
    if (!checkin) {
      return { success: false, message: 'Check-in not found.' };
    }

    if (checkin.status === 'Rejected') {
      return { success: false, message: 'Rejected check-ins cannot be added.' };
    }

    const validation = validateMorningCheckin(checkin);
    if (validation.status !== 'Confirmed') {
      return { success: false, message: validation.conflictReason ?? 'Check-in needs review before adding.' };
    }

    const availability = getDriverAvailability(checkin.driverId, checkin.date);
    if (availability === 'Urlaub' || availability === 'Krank') {
      return { success: false, message: `Cannot assign: driver marked ${availability}.` };
    }

    const company = checkin.company?.trim() ?? '';
    const vehiclePlate = checkin.vehiclePlate?.trim() ?? '';
    const expectedRevenue = COMPANY_DEFAULT_REVENUE[company] ?? 0;
    const previousVehicle = findPreviousVehicleFromAssignments(
      assignments.map((item) => ({ driverId: item.driverId, date: item.date, vehicle: item.vehicle })),
      checkin.driverId,
      checkin.date,
    );

    setAssignments((current) => {
      const existing = current.find(
        (item) => item.date === checkin.date && item.driverId === checkin.driverId,
      );

      if (existing) {
        return current.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                vehicle: vehiclePlate,
                company,
                startTime: checkin.submittedAt,
                status: checkin.date === today ? 'In Progress' : 'Planned',
                source: 'mobile_checkin',
                routeJob: item.routeJob || `${company} Shift`,
                expectedRevenue,
                notes: checkin.notes ?? item.notes,
              }
            : item,
        );
      }

      const driver = drivers.find((entry) => entry.id === checkin.driverId);
      return [
        ...current,
        {
          id: `tp-mobile-${checkin.id}`,
          date: checkin.date,
          driverId: checkin.driverId,
          department: driver?.department ?? 'Unknown',
          availability: 'Available',
          vehicle: vehiclePlate,
          company,
          routeJob: `${company} Shift`,
          startTime: checkin.submittedAt,
          endTime: '',
          status: checkin.date === today ? 'In Progress' : 'Planned',
          source: 'mobile_checkin',
          expectedRevenue,
          notes: checkin.notes ?? '',
        },
      ];
    });

    setMorningCheckins((current) =>
      current.map((item) =>
        item.id === checkinId
          ? {
              ...item,
              status: 'Added to Einsatzplan',
              conflictReason: undefined,
            }
          : item,
      ),
    );

    upsertVehicleHandover({
      id: `vh-auto-${checkin.id}`,
      driverId: checkin.driverId,
      vehicleId: vehiclePlate,
      previousVehicleId: previousVehicle,
      date: checkin.date,
      time: checkin.submittedAt,
      handoverType: 'pickup',
    });

    return { success: true, message: 'Check-in added to Einsatzplan.' };
  }

  function rejectMorningCheckin(checkinId: string) {
    setMorningCheckins((current) =>
      current.map((item) =>
        item.id === checkinId
          ? {
              ...item,
              status: 'Rejected',
            }
          : item,
      ),
    );
  }

  function updateMorningCheckin(checkinId: string, data: Partial<MorningCheckin>) {
    setMorningCheckins((current) =>
      current.map((item) => {
        if (item.id !== checkinId) return item;

        const merged = { ...item, ...data };
        if (merged.status === 'Added to Einsatzplan' || merged.status === 'Rejected') {
          return merged;
        }

        const validation = validateMorningCheckinInternal(merged, assignments);

        if (merged.vehiclePlate?.trim()) {
          const previousVehicle = findPreviousVehicleFromAssignments(
            assignments.map((entry) => ({ driverId: entry.driverId, date: entry.date, vehicle: entry.vehicle })),
            merged.driverId,
            merged.date,
          );
          upsertVehicleHandover({
            id: `vh-auto-${merged.id}`,
            driverId: merged.driverId,
            vehicleId: merged.vehiclePlate,
            previousVehicleId: previousVehicle,
            date: merged.date,
            time: merged.submittedAt,
            handoverType: 'pickup',
          });
        }

        return {
          ...merged,
          status: validation.status,
          conflictReason: validation.conflictReason,
        };
      }),
    );
  }

  const value = useMemo<FleetDataContextValue>(
    () => ({
      drivers,
      calendarStatuses,
      requests,
      assignments,
      morningCheckins,
      revenueData,
      approveRequest,
      rejectRequest,
      cancelRequest,
      moveRequestToNeedsReview,
      updateCalendarFromRequest,
      getDriverAvailability,
      getCalendarStatusEntry,
      calculateDailyRevenue,
      calculateMonthlyRevenue,
      updateAssignment,
      validateMorningCheckin,
      addCheckinToEinsatzplan,
      rejectMorningCheckin,
      updateMorningCheckin,
    }),
    [assignments, calendarStatuses, drivers, morningCheckins, requests, revenueData],
  );

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const context = useContext(FleetDataContext);
  if (!context) {
    throw new Error('useFleetData must be used within FleetDataProvider');
  }
  return context;
}

export function getTodayDate() {
  return today;
}

export function getTomorrowDate() {
  return tomorrow;
}
