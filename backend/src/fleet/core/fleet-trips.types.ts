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
>;

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
