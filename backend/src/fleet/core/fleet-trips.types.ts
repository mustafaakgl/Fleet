import type { FleetDrivingEvent, FleetTelemetrySource, FleetTrip, FleetTripLocationPoint } from '@prisma/client';

export type FleetTripSummary = Pick<
  FleetTrip,
  | 'id'
  | 'vehicleId'
  | 'driverId'
  | 'source'
  | 'startedAt'
  | 'endedAt'
  | 'distanceKm'
  | 'durationS'
  | 'avgSpeedKmh'
  | 'maxSpeedKmh'
  | 'idleS'
  | 'score'
  | 'hasDataGap'
  | 'status'
  | 'assignmentId'
  | 'workSessionId'
  | 'createdAt'
  | 'updatedAt'
  | 'purpose'
  | 'purposeNote'
  | 'businessContact'
  | 'classifiedAt'
  | 'classifiedById'
  | 'purposeLockedAt'
> & {
  odoStartKm?: number | null;
  odoEndKm?: number | null;
  dataGapStartAt?: string | null;
  dataGapEndAt?: string | null;
  dataGapDurationS?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  routeStartLatitude?: number | null;
  routeStartLongitude?: number | null;
  routeEndLatitude?: number | null;
  routeEndLongitude?: number | null;
};

export type FleetTripSummaryWithRelations = FleetTripSummary & {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  };
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  };
  route: {
    assignmentId: string;
  } | null;
};

export type FleetTripLocationPointDto = {
  recordedAt: string;
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
  accuracyM?: number;
};

export type NormalizedFleetTripLocationPoint = {
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  source: FleetTelemetrySource;
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
    source: FleetTelemetrySource;
  }>;
  drivingEvents: Array<{
    id: string;
    type: FleetDrivingEvent['type'];
    occurredAt: string;
    lat: number;
    lng: number;
    value: number;
    threshold: number;
  }>;
};

export type FleetTripTimelineTrip = FleetTripSummaryWithRelations & {
  kind: 'trip';
};

export type FleetTripTimelineEntry = FleetTripTimelineTrip | FleetTripStopEntry;

export type FleetTripStopEntry = {
  kind: 'stop';
  afterTripId: string;
  beforeTripId: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  label: string;
  coordinates: { lat: number; lng: number } | null;
};

export type FleetTripTimelineDay = {
  dayKey: string;
  label: string;
  tripCount: number;
  totalKm: number;
  totalDrivingS: number;
  dayOdoStartKm: number | null;
  dayOdoEndKm: number | null;
  entries: FleetTripTimelineEntry[];
};

export type FleetTripTimelineResponse = {
  from: string | null;
  to: string | null;
  totalTrips: number;
  totalDistanceKm: number;
  totalDrivingS: number;
  dataGapCount: number;
  days: FleetTripTimelineDay[];
};
