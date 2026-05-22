import type {
  VehicleHandover,
  VehicleHandoverPhotoStatus,
  VehicleHandoverStatus,
} from './types';

interface HandoverSeedInput {
  id: string;
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string;
  handoverType: 'pickup' | 'return';
  date: string;
  time: string;
  photoStatus: VehicleHandoverPhotoStatus;
  photos: string[];
  damageDetected: boolean;
  damageNotes?: string;
  status: VehicleHandoverStatus;
  equipmentChecklist?: VehicleHandover['equipmentChecklist'];
}

function isSameVehicle(currentVehicle: string, previousVehicle?: string) {
  if (!previousVehicle) return false;
  return currentVehicle.trim().toUpperCase() === previousVehicle.trim().toUpperCase();
}

function withRule(input: HandoverSeedInput): VehicleHandover {
  const photoRequired = !isSameVehicle(input.vehicleId, input.previousVehicleId);
  const safePhotoStatus = photoRequired ? input.photoStatus : 'not_required';

  return {
    id: input.id,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    previousVehicleId: input.previousVehicleId,
    handoverType: input.handoverType,
    date: input.date,
    time: input.time,
    photoRequired,
    photoStatus: safePhotoStatus,
    photos: input.photos,
    damageDetected: input.damageDetected,
    damageNotes: input.damageNotes,
    equipmentChecklist: input.equipmentChecklist ?? {
      firstAidKit: true,
      fireExtinguisher: true,
      straps: true,
      safetyVest: true,
    },
    status: input.status,
  };
}

const handoverStore: VehicleHandover[] = [
  withRule({
    id: 'vh-1',
    driverId: 'ilker-cukur',
    vehicleId: 'AP-101',
    previousVehicleId: 'AP-101',
    handoverType: 'pickup',
    date: '2026-05-21',
    time: '06:58',
    photoStatus: 'not_required',
    photos: [],
    damageDetected: false,
    status: 'completed',
  }),
  withRule({
    id: 'vh-2',
    driverId: 'thomas-scharein',
    vehicleId: 'AP-102',
    previousVehicleId: 'AP-105',
    handoverType: 'pickup',
    date: '2026-05-21',
    time: '07:15',
    photoStatus: 'missing',
    photos: [],
    damageDetected: false,
    damageNotes: 'Front bumper scratch',
    status: 'pending',
  }),
  withRule({
    id: 'vh-3',
    driverId: 'sita-diallo',
    vehicleId: 'AP-103',
    previousVehicleId: 'AP-101',
    handoverType: 'pickup',
    date: '2026-05-21',
    time: '07:12',
    photoStatus: 'submitted',
    photos: ['handover-sita-1.jpg', 'handover-sita-2.jpg'],
    damageDetected: true,
    damageNotes: 'Minor scratch',
    status: 'pending',
  }),
];

function normalizeDate(date: string) {
  return date.slice(0, 10);
}

function previousDay(value: string) {
  const d = new Date(`${normalizeDate(value)}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getVehicleHandovers() {
  return [...handoverStore].sort((a, b) => {
    if (a.date === b.date) return b.time.localeCompare(a.time);
    return b.date.localeCompare(a.date);
  });
}

export function getVehicleHandoversByDriver(driverId: string) {
  return getVehicleHandovers().filter((item) => item.driverId === driverId);
}

export function getVehicleHandoversByVehicle(vehicleId: string) {
  const target = vehicleId.trim().toUpperCase();
  return getVehicleHandovers().filter((item) => item.vehicleId.trim().toUpperCase() === target);
}

export function getVehicleHandoverSummary() {
  const rows = getVehicleHandovers();
  return {
    requiredPhotos: rows.filter((item) => item.photoRequired).length,
    missingPhotos: rows.filter((item) => item.photoRequired && item.photoStatus === 'missing').length,
    submitted: rows.filter((item) => item.photoStatus === 'submitted').length,
    approved: rows.filter((item) => item.photoStatus === 'approved').length,
    damageReports: rows.filter((item) => item.damageDetected).length,
  };
}

export function getMissingHandoverPhotoCount() {
  return getVehicleHandoverSummary().missingPhotos;
}

export function updateVehicleHandoverPhotoStatus(id: string, status: VehicleHandoverPhotoStatus) {
  const item = handoverStore.find((entry) => entry.id === id);
  if (!item) return null;
  item.photoStatus = status;
  if (status === 'approved') item.status = 'completed';
  if (status === 'rejected') item.status = 'pending';
  return item;
}

export function upsertVehicleHandover(params: {
  id: string;
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string;
  date: string;
  time: string;
  handoverType?: 'pickup' | 'return';
}) {
  const existing = handoverStore.find(
    (item) => item.driverId === params.driverId && item.date === params.date && item.handoverType === (params.handoverType ?? 'pickup'),
  );

  const photoRequired = !isSameVehicle(params.vehicleId, params.previousVehicleId);
  const nextPhotoStatus: VehicleHandoverPhotoStatus = photoRequired ? (existing?.photoStatus ?? 'missing') : 'not_required';

  if (existing) {
    existing.vehicleId = params.vehicleId;
    existing.previousVehicleId = params.previousVehicleId;
    existing.time = params.time;
    existing.photoRequired = photoRequired;
    existing.photoStatus = nextPhotoStatus;
    if (!photoRequired) {
      existing.photos = [];
      existing.status = 'completed';
    }
    return existing;
  }

  const next = withRule({
    id: params.id,
    driverId: params.driverId,
    vehicleId: params.vehicleId,
    previousVehicleId: params.previousVehicleId,
    handoverType: params.handoverType ?? 'pickup',
    date: params.date,
    time: params.time,
    photoStatus: nextPhotoStatus,
    photos: [],
    damageDetected: false,
    status: photoRequired ? 'pending' : 'completed',
  });

  handoverStore.push(next);
  return next;
}

export function findPreviousVehicleFromAssignments(
  assignments: Array<{ driverId: string; date: string; vehicle: string }>,
  driverId: string,
  date: string,
) {
  const targetDate = normalizeDate(date);
  const prevDate = previousDay(targetDate);

  const exactPrev = assignments.find(
    (item) => item.driverId === driverId && normalizeDate(item.date) === prevDate && item.vehicle,
  );
  if (exactPrev?.vehicle) return exactPrev.vehicle;

  const historical = assignments
    .filter((item) => item.driverId === driverId && normalizeDate(item.date) < targetDate && item.vehicle)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  return historical?.vehicle;
}

export function getHandoverLabelByAssignment(params: {
  driverId: string;
  vehicle: string;
  date: string;
}) {
  const row = handoverStore.find(
    (item) =>
      item.driverId === params.driverId
      && item.date === params.date
      && item.vehicleId.trim().toUpperCase() === params.vehicle.trim().toUpperCase(),
  );

  if (!row) return 'Not Required';
  if (!row.photoRequired) return 'Not Required';
  if (row.photoStatus === 'missing') return 'Missing';
  if (row.photoStatus === 'submitted' || row.photoStatus === 'approved') return 'Completed';
  return 'Required';
}
