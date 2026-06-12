export type FleetTripSummary = {
  id: string;
  vehicleId: string;
  driverId: string;
  source: 'phone' | 'device' | 'api';
  startedAt: string;
  endedAt: string | null;
  distanceKm: string | number | null;
  durationS: number | null;
  avgSpeedKmh: string | number | null;
  maxSpeedKmh: string | number | null;
  idleS: number | null;
  score: string | number | null;
  hasDataGap: boolean;
  status: 'active' | 'closed';
  assignmentId: string | null;
  workSessionId: string | null;
};

export type FleetTripLocationPointInput = {
  recordedAt: string;
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
  accuracyM?: number;
};

export type FleetTripLocationBatchResponse = {
  tripId: string;
  received: number;
  deduplicatedInBatch: number;
  inserted: number;
  skippedDuplicates: number;
};

export type FleetTripDetail = FleetTripSummary & {
  locationPoints: Array<{
    id: string;
    recordedAt: string;
    lat: number;
    lng: number;
    speedKmh: number | null;
    headingDeg: number | null;
    accuracyM: number | null;
    source: 'phone' | 'device' | 'api';
  }>;
  drivingEvents: Array<{
    id: string;
    type: 'speeding' | 'harsh_accel' | 'harsh_brake';
    occurredAt: string;
    lat: number;
    lng: number;
    value: number;
    threshold: number;
  }>;
};

export type FleetDriverScore = {
  driverId: string;
  from: string | null;
  to: string | null;
  score: number;
  tripCount: number;
  totalDistanceKm: number;
  totalDurationS: number;
  idleRatio: number;
  events: {
    speeding: number;
    harsh_accel: number;
    harsh_brake: number;
  };
  trips: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    distanceKm: number;
    score: number | null;
    events: {
      speeding: number;
      harsh_accel: number;
      harsh_brake: number;
    };
  }>;
};

export type FleetFuelEntry = {
  id: string;
  vehicleId: string;
  driverId: string;
  enteredAt: string;
  liters: number;
  totalCost: number;
  currency: string;
  odometerKm: number | null;
  isFullTank: boolean;
  hasReceipt: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FleetFuelConsumptionInterval = {
  startEntryId: string;
  endEntryId: string;
  startAt: string;
  endAt: string;
  litersTotal: number;
  costTotal: number;
  distanceKm: number;
  litersPer100Km: number;
  distanceSource: 'odometer' | 'gps';
};

export type FleetFuelWeeklyTrend = {
  weekStart: string;
  tripDistanceKm: number;
  realDistanceKm: number;
  realLiters: number;
  estimatedLiters: number;
  realLitersPer100Km: number | null;
  estimatedLitersPer100Km: number | null;
};

export type FleetFuelAnalytics = {
  vehicleId: string;
  from: string | null;
  to: string | null;
  avgConsumptionLPer100Km: number;
  intervals: FleetFuelConsumptionInterval[];
  avgLitersPer100Km: number | null;
  avgEstimatedLitersPer100Km: number | null;
  totalLiters: number;
  totalEstimatedLiters: number;
  totalCost: number;
  totalDistanceKm: number;
  tripDistanceKm: number;
  estimatedVsRealDeltaLiters: number | null;
  weeklyTrend: FleetFuelWeeklyTrend[];
  entries: FleetFuelEntry[];
};

export type FleetMaintenanceRuleStatus = {
  id: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  nextDueAtKm: number | null;
  nextDueAtDate: string | null;
  status: 'ok' | 'due_soon' | 'overdue' | 'unknown';
};

export type FleetVehicleStatus = {
  vehicleId: string;
  plateNumber: string;
  currentOdometerKm: number;
  gpsAccumulatedKm: number;
  baselineKm: number;
  baselineSource: 'correction' | 'initial' | 'none';
  odometerCorrectedAt: string | null;
  maintenanceRules: FleetMaintenanceRuleStatus[];
};
