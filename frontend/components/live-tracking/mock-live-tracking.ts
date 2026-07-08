import type { LiveTrackingItem, LiveTrackingTrailPoint } from '@/lib/types';

type MockLiveTrackingOptions = {
  search?: string;
  includeOffline?: boolean;
};

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function baseMockItems(): LiveTrackingItem[] {
  return [
    {
      driverId: 'mock-driver-berlin',
      driverName: 'Max Mueller',
      vehicleId: 'mock-vehicle-berlin',
      plateNumber: 'B-FL 2401',
      latitude: 52.5208,
      longitude: 13.4095,
      speedKmh: 68,
      headingDeg: 118,
      accuracyM: 9,
      recordedAt: isoMinutesAgo(2),
      receivedAt: isoMinutesAgo(1),
      status: 'online',
      motionState: 'moving',
      hasCriticalDtc: false,
      fuelDropFlag: false,
      isSilent: false,
      locationSource: 'telematics',
      assignmentId: 'mock-assignment-berlin',
      companyName: 'DHL Freight Berlin',
      cargoName: 'Night pallets',
    },
    {
      driverId: 'mock-driver-hamburg',
      driverName: 'Ayse Kaya',
      vehicleId: 'mock-vehicle-hamburg',
      plateNumber: 'HH-FL 1188',
      latitude: 53.5519,
      longitude: 9.9937,
      speedKmh: 0,
      headingDeg: 12,
      accuracyM: 6,
      recordedAt: isoMinutesAgo(6),
      receivedAt: isoMinutesAgo(5),
      status: 'online',
      motionState: 'idle',
      idleSinceMs: Date.now() - 18 * 60_000,
      hasCriticalDtc: true,
      fuelDropFlag: false,
      isSilent: false,
      locationSource: 'mobile',
      assignmentId: 'mock-assignment-hamburg',
      companyName: 'Kaya Logistics Hamburg',
      cargoName: 'Cold chain supplies',
    },
    {
      driverId: 'mock-driver-munich',
      driverName: 'Lukas Schneider',
      vehicleId: 'mock-vehicle-munich',
      plateNumber: 'M-FL 7610',
      latitude: 48.1377,
      longitude: 11.5761,
      speedKmh: 0,
      headingDeg: 260,
      accuracyM: 15,
      recordedAt: isoMinutesAgo(14),
      receivedAt: isoMinutesAgo(12),
      status: 'stale',
      motionState: 'stopped',
      hasCriticalDtc: false,
      fuelDropFlag: true,
      isSilent: false,
      locationSource: 'telematics',
      assignmentId: null,
      companyName: 'Operion South Hub',
      cargoName: 'Returns staging',
    },
    {
      driverId: 'mock-driver-cologne',
      driverName: 'Emre Demir',
      vehicleId: 'mock-vehicle-cologne',
      plateNumber: 'K-FL 3320',
      latitude: 50.9378,
      longitude: 6.9603,
      speedKmh: 0,
      headingDeg: 180,
      accuracyM: 20,
      recordedAt: isoMinutesAgo(55),
      receivedAt: isoMinutesAgo(54),
      status: 'offline',
      motionState: 'offline',
      hasCriticalDtc: false,
      fuelDropFlag: false,
      isSilent: true,
      locationSource: 'mobile',
      assignmentId: null,
      companyName: 'Rhein Cargo',
      cargoName: 'Driver break',
    },
  ];
}

function matchesSearch(item: LiveTrackingItem, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;

  return [item.driverName, item.plateNumber, item.companyName, item.cargoName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

export function getMockLiveTrackingItems(options?: MockLiveTrackingOptions): LiveTrackingItem[] {
  const items = baseMockItems();
  const search = options?.search ?? '';
  const includeOffline = options?.includeOffline ?? false;

  return items.filter((item) => {
    if (!includeOffline && item.status === 'offline') {
      return false;
    }
    return matchesSearch(item, search);
  });
}

export function getMockLiveTrackingTrail(driverId: string): LiveTrackingTrailPoint[] {
  const routeMap: Record<string, LiveTrackingTrailPoint[]> = {
    'mock-driver-berlin': [
      { at: isoMinutesAgo(18), lat: 52.5149, lng: 13.3501, speedKph: 42 },
      { at: isoMinutesAgo(12), lat: 52.5167, lng: 13.3729, speedKph: 51 },
      { at: isoMinutesAgo(8), lat: 52.5189, lng: 13.3905, speedKph: 61 },
      { at: isoMinutesAgo(3), lat: 52.5208, lng: 13.4095, speedKph: 68 },
    ],
    'mock-driver-hamburg': [
      { at: isoMinutesAgo(28), lat: 53.5481, lng: 9.9872, speedKph: 33 },
      { at: isoMinutesAgo(22), lat: 53.5498, lng: 9.9914, speedKph: 16 },
      { at: isoMinutesAgo(18), lat: 53.5511, lng: 9.9926, speedKph: 3 },
      { at: isoMinutesAgo(5), lat: 53.5519, lng: 9.9937, speedKph: 0 },
    ],
    'mock-driver-munich': [
      { at: isoMinutesAgo(40), lat: 48.1339, lng: 11.5667, speedKph: 24 },
      { at: isoMinutesAgo(31), lat: 48.1356, lng: 11.5719, speedKph: 11 },
      { at: isoMinutesAgo(20), lat: 48.1371, lng: 11.5748, speedKph: 4 },
      { at: isoMinutesAgo(12), lat: 48.1377, lng: 11.5761, speedKph: 0 },
    ],
    'mock-driver-cologne': [
      { at: isoMinutesAgo(90), lat: 50.9341, lng: 6.9547, speedKph: 28 },
      { at: isoMinutesAgo(75), lat: 50.9354, lng: 6.9579, speedKph: 19 },
      { at: isoMinutesAgo(60), lat: 50.9369, lng: 6.9594, speedKph: 0 },
      { at: isoMinutesAgo(54), lat: 50.9378, lng: 6.9603, speedKph: 0 },
    ],
  };

  return routeMap[driverId] ?? [];
}