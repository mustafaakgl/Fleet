import type { AssignmentStatus } from '@prisma/client';

export type CustomerAssignmentDto = {
  id: string;
  status: AssignmentStatus;
  workDate: string;
  startTime: string;
  endTime: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  routeName: string | null;
  companyName: string;
  vehiclePlateNumber: string;
  driverDisplayName: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDashboardStats = {
  activeTransports: number;
  inProgress: number;
  completedToday: number;
  upcoming: number;
  pendingProofs: number;
};

export type CustomerPortalSettingsSnapshot = {
  showDriverFullName: boolean;
  showInternalNotes: boolean;
};

export type CustomerAssignmentRecord = {
  id: string;
  status: AssignmentStatus;
  workDate: Date;
  startTime: string;
  endTime: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  routeName: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  driver: { firstName: string; lastName: string };
  vehicle: { plateNumber: string };
  company: {
    name: string;
    portalSettings: CustomerPortalSettingsSnapshot | null;
  };
};
