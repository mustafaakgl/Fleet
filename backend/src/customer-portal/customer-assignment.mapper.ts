import type {
  CustomerAssignmentDto,
  CustomerAssignmentRecord,
  CustomerPortalSettingsSnapshot,
} from './customer-assignment.types';

const DEFAULT_PORTAL_SETTINGS: CustomerPortalSettingsSnapshot = {
  showDriverFullName: false,
  showInternalNotes: false,
};

export function formatCustomerDriverDisplayName(
  firstName: string,
  lastName: string,
  showDriverFullName: boolean,
): string {
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  if (showDriverFullName) {
    return `${trimmedFirst} ${trimmedLast}`.trim();
  }

  if (!trimmedLast) {
    return trimmedFirst;
  }

  return `${trimmedFirst} ${trimmedLast.charAt(0).toUpperCase()}.`;
}

export function toCustomerAssignmentDto(assignment: CustomerAssignmentRecord): CustomerAssignmentDto {
  const portalSettings = assignment.company.portalSettings ?? DEFAULT_PORTAL_SETTINGS;
  const dto: CustomerAssignmentDto = {
    id: assignment.id,
    status: assignment.status,
    workDate: assignment.workDate.toISOString(),
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    cargoName: assignment.cargoName,
    cargoOwner: assignment.cargoOwner,
    pickupAddress: assignment.pickupAddress,
    deliveryAddress: assignment.deliveryAddress,
    routeName: assignment.routeName,
    companyName: assignment.company.name,
    vehiclePlateNumber: assignment.vehicle.plateNumber,
    driverDisplayName: formatCustomerDriverDisplayName(
      assignment.driver.firstName,
      assignment.driver.lastName,
      portalSettings.showDriverFullName,
    ),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };

  if (portalSettings.showInternalNotes && assignment.notes) {
    dto.notes = assignment.notes;
  }

  return dto;
}
