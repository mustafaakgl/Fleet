export type TrackingPresenceStatus = 'online' | 'stale' | 'offline';

export type LocationSourceType = 'mobile' | 'telematics';

export type LiveTrackingItem = {
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  plateNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  recordedAt: string | null;
  receivedAt: string | null;
  status: TrackingPresenceStatus;
  locationSource: LocationSourceType | null;
  assignmentId: string | null;
  companyName: string | null;
  cargoName: string | null;
};

export type LocationHistoryPoint = {
  id: string;
  driverId: string;
  vehicleId: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  recordedAt: string;
  receivedAt: string;
  locationSource: LocationSourceType;
};

export type LiveTrackingParams = {
  staleAfterSec: number;
  includeOffline: boolean;
  search?: string;
};

export type LocationHistoryParams = {
  from?: string;
  to?: string;
  limit: number;
};
