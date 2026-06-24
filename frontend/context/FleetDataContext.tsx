'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { USE_MOCK_FLEET_DATA } from '@/lib/fleet-data-config';
import { hydrateFleetData } from '@/lib/fleet-hydration';
import {
  createPlanningPlaceholder,
  isPlanningDraftAssignmentId,
  parsePlanningDraftId,
} from '@/lib/planning-assignment';
import type { AssignmentWritePayload } from '@/lib/types';
import {
  assignmentsApi,
  leaveRequestsApi,
  morningCheckinsApi,
  transportRequestsApi,
} from '@/lib/api';
import { LicenseComplianceWarningDialog } from '@/components/license-checks/LicenseComplianceWarningDialog';
import {
  createAssignmentWithLicenseAck,
  shouldWarnLicenseCompliance,
} from '@/lib/license-compliance-assignment';
import { getDriverRiskScore, type DriverRiskScore } from '@/lib/utils';

export type CalendarStatusCode = 'UT' | 'KT' | 'FT' | 'AT' | 'HO' | 'GR' | 'SCH';
export type CalendarStatusSource = 'manual' | 'request' | 'assignment';
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
export type AssignmentSource = 'manual' | 'mobile_checkin' | 'transport_request';
export type TransportRequestStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';
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
  vacationEntitlementDays: number;
  vacationCarryOverDays: number;
}

export interface FleetCalendarStatus {
  id: string;
  driverId: string;
  date: string;
  status: CalendarStatusCode;
  source: CalendarStatusSource;
  requestId?: string;
  assignmentId?: string;
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
  routeName?: string;
  cargoName?: string;
  cargoOwner?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  startTime: string;
  endTime: string;
  status: PlanningStatus;
  source: AssignmentSource;
  expectedRevenue: number;
  notes: string;
}

export interface TransportRequest {
  id: string;
  driverId: string;
  date: string;
  submittedAt: string;
  vehicleId: string;
  companyId: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  startTime: string;
  endTime?: string;
  routeName?: string;
  notes?: string;
  status: TransportRequestStatus;
  conflictReason?: string;
  source: 'mobile_app';
}

export interface AssignmentHistoryEntry {
  assignmentId: string;
  driverId: string;
  vehicleId: string;
  companyId: string;
  date: string;
  startTime: string;
  endTime?: string;
  source: AssignmentSource;
}

export interface CompanyEmailDraft {
  id: string;
  companyId: string;
  date: string;
  subject: string;
  body: string;
  status: 'draft_ready' | 'needs_review';
  lastUpdatedAt: string;
}

export interface MorningCheckin {
  id: string;
  driverId: string;
  date: string;
  submittedAt: string;
  vehiclePlate?: string;
  company?: string;
  cargoName?: string;
  cargoQuantity?: string;
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
  assignmentId?: string;
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

interface FleetDataContextValue {
  drivers: FleetDriver[];
  calendarStatuses: FleetCalendarStatus[];
  requests: FleetRequest[];
  assignments: FleetAssignment[];
  morningCheckins: MorningCheckin[];
  transportRequests: TransportRequest[];
  companyEmailDrafts: CompanyEmailDraft[];
  driverAssignmentHistory: AssignmentHistoryEntry[];
  vehicleAssignmentHistory: AssignmentHistoryEntry[];
  companyAssignmentHistory: AssignmentHistoryEntry[];
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
  completeAssignment: (assignmentId: string) => Promise<{ success: boolean; message: string }>;
  cancelAssignment: (assignmentId: string) => Promise<{ success: boolean; message: string }>;
  validateMorningCheckin: (checkin: MorningCheckin) => MorningCheckinValidation;
  addCheckinToEinsatzplan: (checkinId: string) => { success: boolean; message: string };
  rejectMorningCheckin: (checkinId: string) => void;
  updateMorningCheckin: (checkinId: string, data: Partial<MorningCheckin>) => void;
  approveTransportRequest: (requestId: string) => { success: boolean; message: string };
  rejectTransportRequest: (requestId: string) => void;
  getAssignmentById: (assignmentId: string) => FleetAssignment | undefined;
  isHydrating: boolean;
  hydrateError: string | null;
  refetchHydrate: () => void;
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
  { id: 'ilker-cukur', name: 'Ilker Cukur', department: 'Go', accidentCount: 1, riskScore: getDriverRiskScore(1), vacationEntitlementDays: 28, vacationCarryOverDays: 3 },
  { id: 'thomas-scharein', name: 'Thomas Scharein', department: 'Go', accidentCount: 2, riskScore: getDriverRiskScore(2), vacationEntitlementDays: 26, vacationCarryOverDays: 1 },
  { id: 'sita-diallo', name: 'Sita Diallo', department: 'Krage', accidentCount: 3, riskScore: getDriverRiskScore(3), vacationEntitlementDays: 24, vacationCarryOverDays: 0 },
  { id: 'andrii-dudiak', name: 'Andrii Dudiak', department: 'Krage', accidentCount: 0, riskScore: getDriverRiskScore(0), vacationEntitlementDays: 24, vacationCarryOverDays: 0 },
  { id: 'nesrin-feyzula', name: 'Nesrin Feyzula', department: 'Krage', accidentCount: 1, riskScore: getDriverRiskScore(1), vacationEntitlementDays: 24, vacationCarryOverDays: 2 },
  { id: 'gundrum-andreas', name: 'Gundrum Andreas', department: 'Krage', accidentCount: 0, riskScore: getDriverRiskScore(0), vacationEntitlementDays: 24, vacationCarryOverDays: 0 },
  { id: 'ozdemir-hakan', name: 'Ozdemir Hakan', department: 'Office', accidentCount: 0, riskScore: getDriverRiskScore(0), vacationEntitlementDays: 24, vacationCarryOverDays: -1 },
];

const COMPANY_DEFAULT_REVENUE: Record<string, number> = {
  DHL: 850,
  Amazon: 1200,
  UPS: 900,
  Hermes: 800,
  'DB Schenker': 1050,
  'Internal Dispatch': 0,
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
    vehicle: 'B-SG 1556',
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
    vehicle: 'B-SG 1544',
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
    vehicle: 'B-SG 1556',
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
    vehicle: 'B-SG 1569',
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

const initialTransportRequests: TransportRequest[] = [
  {
    id: 'tr-1',
    driverId: 'ilker-cukur',
    date: tomorrow,
    submittedAt: `${today} 17:12`,
    vehicleId: 'B-SG 1544',
    companyId: 'DHL',
    cargoName: 'Electronics pallets',
    cargoOwner: 'DHL Customer',
    pickupAddress: 'Berlin Neukolln',
    deliveryAddress: 'Berlin Mitte',
    startTime: '07:00',
    status: 'pending',
    source: 'mobile_app',
  },
  {
    id: 'tr-2',
    driverId: 'thomas-scharein',
    date: tomorrow,
    submittedAt: `${today} 17:20`,
    vehicleId: 'B-SG 1556',
    companyId: 'Amazon',
    cargoName: 'Parcel boxes',
    cargoOwner: 'Amazon',
    pickupAddress: 'Berlin Spandau',
    deliveryAddress: 'Leipzig',
    startTime: '06:30',
    status: 'pending',
    source: 'mobile_app',
  },
  {
    id: 'tr-3',
    driverId: 'sita-diallo',
    date: tomorrow,
    submittedAt: `${today} 17:25`,
    vehicleId: 'B-SG 1569',
    companyId: 'DB Schenker',
    cargoName: 'Furniture',
    cargoOwner: 'DB Customer',
    pickupAddress: 'Berlin Tempelhof',
    deliveryAddress: 'Hamburg',
    startTime: '08:00',
    status: 'needs_review',
    conflictReason: 'Driver marked Urlaub',
    source: 'mobile_app',
  },
  {
    id: 'tr-4',
    driverId: 'andrii-dudiak',
    date: tomorrow,
    submittedAt: `${today} 17:28`,
    vehicleId: 'B-SG 1567',
    companyId: 'Hermes',
    cargoName: 'Packages',
    cargoOwner: 'Hermes',
    pickupAddress: 'Berlin Lichtenberg',
    deliveryAddress: 'Potsdam',
    startTime: '07:15',
    status: 'needs_review',
    conflictReason: 'Driver marked Krank',
    source: 'mobile_app',
  },
  {
    id: 'tr-5',
    driverId: 'nesrin-feyzula',
    date: tomorrow,
    submittedAt: `${today} 17:31`,
    vehicleId: 'B-SG 1544',
    companyId: 'UPS',
    cargoName: 'Medical goods',
    cargoOwner: 'UPS Client',
    pickupAddress: 'Berlin Wedding',
    deliveryAddress: 'Dresden',
    startTime: '07:30',
    status: 'needs_review',
    conflictReason: 'Vehicle already assigned',
    source: 'mobile_app',
  },
];

const initialMorningCheckins: MorningCheckin[] = [
  {
    id: 'mc-1',
    driverId: 'ilker-cukur',
    date: today,
    submittedAt: '06:58',
    vehiclePlate: 'B-SG 1544',
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
    vehiclePlate: 'B-SG 1556',
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
    vehiclePlate: 'B-SG 1569',
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
    vehiclePlate: 'B-SG 1567',
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
    vehiclePlate: 'B-SG 1570',
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

export function FleetDataProvider({ children }: { children: React.ReactNode }) {
  const [drivers, setDrivers] = useState<FleetDriver[]>(USE_MOCK_FLEET_DATA ? initialDrivers : []);
  const [calendarStatuses, setCalendarStatuses] = useState<FleetCalendarStatus[]>(
    USE_MOCK_FLEET_DATA ? initialCalendarStatuses : [],
  );
  const [requests, setRequests] = useState<FleetRequest[]>(USE_MOCK_FLEET_DATA ? initialRequests : []);
  const [assignments, setAssignments] = useState<FleetAssignment[]>(
    USE_MOCK_FLEET_DATA ? initialAssignments : [],
  );
  const [morningCheckins, setMorningCheckins] = useState<MorningCheckin[]>(
    USE_MOCK_FLEET_DATA ? initialMorningCheckins : [],
  );
  const [transportRequests, setTransportRequests] = useState<TransportRequest[]>(
    USE_MOCK_FLEET_DATA ? initialTransportRequests : [],
  );
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [hydrateKey, setHydrateKey] = useState(0);
  const refetchHydrate = useCallback(() => setHydrateKey((key) => key + 1), []);
  const persistAssignmentTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [companyEmailDrafts, setCompanyEmailDrafts] = useState<CompanyEmailDraft[]>([]);
  const [driverAssignmentHistory, setDriverAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [vehicleAssignmentHistory, setVehicleAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [companyAssignmentHistory, setCompanyAssignmentHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [licenseWarningPayload, setLicenseWarningPayload] = useState<AssignmentWritePayload | null>(
    null,
  );
  const [licenseWarningSaving, setLicenseWarningSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const departmentByDriverId = new Map<string, string>(
      (USE_MOCK_FLEET_DATA ? initialDrivers : []).map((d) => [d.id, d.department]),
    );

    setIsHydrating(true);
    setHydrateError(null);

    void (async () => {
      const data = await hydrateFleetData(departmentByDriverId);
      if (cancelled) return;

      const apply = <T,>(key: string, setter: (value: T[]) => void, value: T[]) => {
        if (!data.errors.includes(key)) {
          setter(value);
        } else if (!USE_MOCK_FLEET_DATA) {
          setter([]);
        }
      };

      apply('drivers', setDrivers, data.drivers);
      apply('calendar', setCalendarStatuses, data.calendarStatuses);
      apply('assignments', setAssignments, data.assignments);
      apply('transportRequests', setTransportRequests, data.transportRequests);
      apply('morningCheckins', setMorningCheckins, data.morningCheckins);
      apply('requests', setRequests, data.requests);
      apply('companyEmails', setCompanyEmailDrafts, data.companyEmailDrafts);

      setHydrateError(data.errors.length > 0 ? data.errors.join(', ') : null);
      setIsHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateKey]);

  function toMinutes(value: string | undefined) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  function hasTimeOverlap(aStart: string, aEnd: string | undefined, bStart: string, bEnd: string | undefined) {
    const aStartMin = toMinutes(aStart);
    const bStartMin = toMinutes(bStart);
    if (aStartMin == null || bStartMin == null) return aStart === bStart;
    const aEndMin = toMinutes(aEnd) ?? aStartMin + 60;
    const bEndMin = toMinutes(bEnd) ?? bStartMin + 60;
    return aStartMin < bEndMin && bStartMin < aEndMin;
  }

  function validateTransportRequest(request: TransportRequest) {
    if (!request.vehicleId || !request.companyId || !request.cargoName || !request.pickupAddress || !request.deliveryAddress) {
      return { valid: false, reason: 'Required fields are missing.' };
    }

    const calendarStatus = getCalendarStatusEntry(request.driverId, request.date);
    if (calendarStatus?.status === 'UT') {
      return { valid: false, reason: 'Driver marked Urlaub' };
    }
    if (calendarStatus?.status === 'KT') {
      return { valid: false, reason: 'Driver marked Krank' };
    }

    const driverConflict = assignments.some(
      (assignment) =>
        assignment.date === request.date
        && assignment.driverId === request.driverId
        && hasTimeOverlap(request.startTime, request.endTime, assignment.startTime, assignment.endTime),
    );
    if (driverConflict) {
      return { valid: false, reason: 'Driver already has assignment at this time' };
    }

    const vehicleConflict = assignments.some(
      (assignment) =>
        assignment.date === request.date
        && assignment.vehicle === request.vehicleId
        && hasTimeOverlap(request.startTime, request.endTime, assignment.startTime, assignment.endTime),
    );
    if (vehicleConflict) {
      return { valid: false, reason: 'Vehicle already assigned at this time' };
    }

    return { valid: true as const };
  }

  function upsertCompanyEmailDraftFromTransport(request: TransportRequest, driverName: string) {
    const draftId = `draft-${request.companyId}-${request.date}`;
    const nextDraft: CompanyEmailDraft = {
      id: draftId,
      companyId: request.companyId,
      date: request.date,
      subject: `Einsatzplan ${request.date} - ${request.companyId}`,
      body: [
        `Driver: ${driverName}`,
        `Vehicle: ${request.vehicleId}`,
        `Cargo: ${request.cargoName}`,
        `Pickup Address: ${request.pickupAddress}`,
        `Delivery Address: ${request.deliveryAddress}`,
        `Start Time: ${request.startTime}`,
      ].join('\n'),
      status: 'draft_ready',
      lastUpdatedAt: new Date().toISOString(),
    };

    setCompanyEmailDrafts((current) => {
      const existingIndex = current.findIndex((item) => item.id === draftId);
      if (existingIndex < 0) return [...current, nextDraft];
      return current.map((item, index) => (index === existingIndex ? nextDraft : item));
    });
  }

  function getAssignmentById(assignmentId: string) {
    return assignments.find((item) => item.id === assignmentId);
  }

  function approveTransportRequest(requestId: string) {
    const request = transportRequests.find((item) => item.id === requestId);
    if (!request) {
      return { success: false, message: 'Transport request not found.' };
    }

    const validation = validateTransportRequest(request);
    if (!validation.valid) {
      setTransportRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? { ...item, status: 'needs_review', conflictReason: validation.reason }
            : item,
        ),
      );
      return { success: false, message: validation.reason };
    }

    const driver = drivers.find((item) => item.id === request.driverId);
    const assignmentId = `tp-transport-${request.id}`;
    const assignmentDate = request.date;
    const assignment: FleetAssignment = {
      id: assignmentId,
      date: assignmentDate,
      driverId: request.driverId,
      department: driver?.department ?? 'Unknown',
      availability: 'Available',
      vehicle: request.vehicleId,
      company: request.companyId,
      routeJob: request.routeName || request.cargoName,
      routeName: request.routeName,
      cargoName: request.cargoName,
      cargoOwner: request.cargoOwner,
      pickupAddress: request.pickupAddress,
      deliveryAddress: request.deliveryAddress,
      startTime: request.startTime,
      endTime: request.endTime ?? '',
      status: 'Planned',
      source: 'transport_request',
      expectedRevenue: COMPANY_DEFAULT_REVENUE[request.companyId] ?? 0,
      notes: request.notes ?? '',
    };

    setAssignments((current) => [...current, assignment]);

    setCalendarStatuses((current) => {
      const withoutSameDay = current.filter(
        (entry) => !(entry.driverId === request.driverId && entry.date === request.date),
      );
      return [
        ...withoutSameDay,
        {
          id: `status-assignment-${assignmentId}`,
          driverId: request.driverId,
          date: request.date,
          status: 'AT',
          source: 'assignment',
          assignmentId,
        },
      ];
    });

    const historyItem: AssignmentHistoryEntry = {
      assignmentId,
      driverId: request.driverId,
      vehicleId: request.vehicleId,
      companyId: request.companyId,
      date: request.date,
      startTime: request.startTime,
      endTime: request.endTime,
      source: 'transport_request',
    };

    setDriverAssignmentHistory((current) => [...current, historyItem]);
    setVehicleAssignmentHistory((current) => [...current, historyItem]);
    setCompanyAssignmentHistory((current) => [...current, historyItem]);

    upsertCompanyEmailDraftFromTransport(request, driver?.name ?? request.driverId);

    setTransportRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? { ...item, status: 'approved', conflictReason: undefined }
          : item,
      ),
    );

    void transportRequestsApi.approve(requestId).catch((e) => {
      console.error('Failed to persist approveTransportRequest', e);
    });

    return { success: true, message: 'Transport request approved and added to Einsatzplan.' };
  }

  function rejectTransportRequest(requestId: string) {
    setTransportRequests((current) =>
      current.map((item) =>
        item.id === requestId
          ? { ...item, status: 'rejected' }
          : item,
      ),
    );

    void transportRequestsApi.reject(requestId).catch((e) => {
      console.error('Failed to persist rejectTransportRequest', e);
    });
  }

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

    void leaveRequestsApi.approve(requestId).catch((e) => {
      console.error('Failed to persist approveRequest', e);
    });

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

    void leaveRequestsApi.reject(requestId).catch((e) => {
      console.error('Failed to persist rejectRequest', e);
    });
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

    void leaveRequestsApi.cancel(requestId).catch((e) => {
      console.error('Failed to persist cancelRequest', e);
    });
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

    void leaveRequestsApi.needsReview(requestId).catch((e) => {
      console.error('Failed to persist moveRequestToNeedsReview', e);
    });
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

  function buildAssignmentPatch(assignment: FleetAssignment): AssignmentWritePayload {
    const patch: AssignmentWritePayload = {};
    const company = assignment.company.trim();
    const vehicle = assignment.vehicle.trim();
    const from = assignment.pickupAddress?.trim();
    const to = assignment.deliveryAddress?.trim();
    const route = assignment.routeJob?.trim();

    if (company) patch.company_name = company;
    if (vehicle) patch.vehicle_plate = vehicle;
    if (from) patch.pickup_address = from;
    if (to) patch.delivery_address = to;
    if (from && to) patch.route_name = assignment.routeName?.trim() || `${from} → ${to}`;
    else if (route) patch.route_name = route;
    if (Number.isFinite(assignment.expectedRevenue)) {
      patch.expected_daily_revenue = Math.max(0, Math.round(assignment.expectedRevenue * 100) / 100);
    }
    if (assignment.startTime) patch.start_time = assignment.startTime;
    if (assignment.endTime) patch.end_time = assignment.endTime;
    if (assignment.notes !== undefined) patch.notes = assignment.notes;
    if (assignment.cargoName?.trim()) patch.cargo_name = assignment.cargoName.trim();
    if (assignment.cargoOwner?.trim()) patch.cargo_owner = assignment.cargoOwner.trim();
    return patch;
  }

  async function persistAssignmentToApi(assignment: FleetAssignment) {
    const company = assignment.company.trim();
    const vehicle = assignment.vehicle.trim();

    if (isPlanningDraftAssignmentId(assignment.id)) {
      if (!company || !vehicle) return;
      const parsed = parsePlanningDraftId(assignment.id);
      if (!parsed) return;

      const payload: AssignmentWritePayload = {
        driver_id: parsed.driverId,
        company_name: company,
        vehicle_plate: vehicle,
        work_date: parsed.date,
        start_time: assignment.startTime || '07:00',
        end_time: assignment.endTime || '15:00',
        route_name:
          assignment.routeName?.trim() ||
          (assignment.pickupAddress?.trim() && assignment.deliveryAddress?.trim()
            ? `${assignment.pickupAddress.trim()} → ${assignment.deliveryAddress.trim()}`
            : assignment.routeJob?.trim() || undefined),
        expected_daily_revenue: Math.max(0, Math.round((assignment.expectedRevenue || 0) * 100) / 100),
        cargo_name: assignment.cargoName?.trim() || 'Office planning',
        cargo_owner: assignment.cargoOwner?.trim() || company,
        pickup_address: assignment.pickupAddress?.trim() || 'TBD',
        delivery_address: assignment.deliveryAddress?.trim() || 'TBD',
        notes: assignment.notes?.trim() || 'Created from office planning',
      };

      if (await shouldWarnLicenseCompliance(parsed.driverId)) {
        setLicenseWarningPayload(payload);
        return;
      }

      await createAssignmentWithLicenseAck(payload, false);
      refetchHydrate();
      return;
    }

    const patch = buildAssignmentPatch(assignment);
    if (Object.keys(patch).length === 0) return;
    await assignmentsApi.update(assignment.id, patch);
  }

  function scheduleAssignmentPersist(assignment: FleetAssignment) {
    const existingTimer = persistAssignmentTimersRef.current.get(assignment.id);
    if (existingTimer) clearTimeout(existingTimer);

    persistAssignmentTimersRef.current.set(
      assignment.id,
      setTimeout(() => {
        void persistAssignmentToApi(assignment).catch((error) => {
          console.error('Failed to persist assignment', error);
        });
      }, 600),
    );
  }

  async function tryAssignmentTransition(
    assignmentId: string,
    to: 'confirmed' | 'in_progress' | 'completed',
  ): Promise<boolean> {
    try {
      await assignmentsApi.transition(assignmentId, to);
      return true;
    } catch {
      return false;
    }
  }

  async function completeAssignment(assignmentId: string) {
    if (isPlanningDraftAssignmentId(assignmentId)) {
      return { success: false, message: 'Save the assignment before marking it completed.' };
    }

    await tryAssignmentTransition(assignmentId, 'confirmed');
    await tryAssignmentTransition(assignmentId, 'in_progress');
    const completed = await tryAssignmentTransition(assignmentId, 'completed');
    if (!completed) {
      return { success: false, message: 'Could not mark assignment as completed.' };
    }

    refetchHydrate();
    return { success: true, message: 'Assignment marked completed.' };
  }

  async function cancelAssignment(assignmentId: string) {
    if (isPlanningDraftAssignmentId(assignmentId)) {
      return { success: false, message: 'Save the assignment before cancelling it.' };
    }

    try {
      await assignmentsApi.cancel(assignmentId);
      refetchHydrate();
      return { success: true, message: 'Assignment cancelled.' };
    } catch {
      return { success: false, message: 'Could not cancel assignment.' };
    }
  }

  function updateAssignment(assignmentId: string, updates: Partial<FleetAssignment>) {
    setAssignments((current) => {
      let working = current;
      if (!working.some((item) => item.id === assignmentId) && isPlanningDraftAssignmentId(assignmentId)) {
        const parsed = parsePlanningDraftId(assignmentId);
        const driver = parsed ? drivers.find((item) => item.id === parsed.driverId) : undefined;
        if (parsed && driver) {
          working = [
            ...working,
            createPlanningPlaceholder(parsed.driverId, parsed.date, driver.department),
          ];
        }
      }

      const next = working.map((item) => {
        if (item.id !== assignmentId) return item;

        const merged = { ...item, ...updates };
        if (merged.availability !== 'Available') {
          const unavailable: FleetAssignment = {
            ...merged,
            vehicle: '',
            company: '',
            routeJob: '',
            pickupAddress: '',
            deliveryAddress: '',
            startTime: '',
            endTime: '',
            status: 'Unavailable',
            expectedRevenue: 0,
          };
          return unavailable;
        }

        const pickup = merged.pickupAddress?.trim();
        const delivery = merged.deliveryAddress?.trim();
        const routeJob = pickup && delivery ? `${pickup} → ${delivery}` : merged.routeJob;
        const status: PlanningStatus =
          merged.status === 'In Progress' ? 'In Progress' : 'Planned';

        const updated: FleetAssignment = {
          ...merged,
          routeJob,
          status,
          source: merged.source ?? 'manual',
        };
        return updated;
      });

      const merged = next.find((item) => item.id === assignmentId);
      if (merged) {
        scheduleAssignmentPersist(merged);
      }

      return next;
    });
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

    // Vehicle handover persistence happens server-side via
    // morningCheckinsApi.addToEinsatzplan (creates assignment + calendar event).

    void morningCheckinsApi.addToEinsatzplan(checkinId).catch((e) => {
      console.error('Failed to persist addCheckinToEinsatzplan', e);
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

    void morningCheckinsApi.update(checkinId, { status: 'rejected' }).catch((e) => {
      console.error('Failed to persist rejectMorningCheckin', e);
    });
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

        // Vehicle handover is created server-side when the check-in is added to Einsatzplan.

        return {
          ...merged,
          status: validation.status,
          conflictReason: validation.conflictReason,
        };
      }),
    );

    // Persist a minimal subset of fields to backend.
    const patch: Record<string, string> = {};
    if (data.vehiclePlate !== undefined) patch.vehicle_plate = data.vehiclePlate;
    if (data.company !== undefined) patch.company_name = data.company;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length > 0) {
      void morningCheckinsApi.update(checkinId, patch).catch((e) => {
        console.error('Failed to persist updateMorningCheckin', e);
      });
    }
  }

  const value = useMemo<FleetDataContextValue>(
    () => ({
      drivers,
      calendarStatuses,
      requests,
      assignments,
      morningCheckins,
      transportRequests,
      companyEmailDrafts,
      driverAssignmentHistory,
      vehicleAssignmentHistory,
      companyAssignmentHistory,
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
      completeAssignment,
      cancelAssignment,
      validateMorningCheckin,
      addCheckinToEinsatzplan,
      rejectMorningCheckin,
      updateMorningCheckin,
      approveTransportRequest,
      rejectTransportRequest,
      getAssignmentById,
      isHydrating,
      hydrateError,
      refetchHydrate,
    }),
    [
      assignments,
      calendarStatuses,
      companyAssignmentHistory,
      companyEmailDrafts,
      driverAssignmentHistory,
      drivers,
      hydrateError,
      isHydrating,
      morningCheckins,
      refetchHydrate,
      requests,
      transportRequests,
      vehicleAssignmentHistory,
    ],
  );

  return (
    <FleetDataContext.Provider value={value}>
      {children}
      <LicenseComplianceWarningDialog
        open={licenseWarningPayload !== null}
        onOpenChange={(open) => {
          if (!open) setLicenseWarningPayload(null);
        }}
        loading={licenseWarningSaving}
        onConfirm={() => {
          if (!licenseWarningPayload) return;
          setLicenseWarningSaving(true);
          void createAssignmentWithLicenseAck(licenseWarningPayload, true)
            .then(() => {
              setLicenseWarningPayload(null);
              refetchHydrate();
            })
            .catch((error) => {
              console.error('Failed to persist assignment with license ack', error);
            })
            .finally(() => setLicenseWarningSaving(false));
        }}
        onCancel={() => setLicenseWarningPayload(null)}
      />
    </FleetDataContext.Provider>
  );
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
