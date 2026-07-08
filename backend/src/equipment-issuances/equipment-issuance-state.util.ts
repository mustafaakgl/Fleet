import { BadRequestException } from '@nestjs/common';

export type EquipmentIssuanceStatus =
  | 'pending_signature'
  | 'signed'
  | 'manual_uploaded'
  | 'approved'
  | 'cancelled';

export function canApprove(status: EquipmentIssuanceStatus): boolean {
  return status === 'signed' || status === 'manual_uploaded';
}

export function ensureMutable(status: EquipmentIssuanceStatus): void {
  if (status === 'approved') {
    throw new BadRequestException('Approved issuance is immutable');
  }
  if (status === 'cancelled') {
    throw new BadRequestException('Cancelled issuance cannot be modified');
  }
}

export function ensureSignable(status: EquipmentIssuanceStatus): void {
  if (status !== 'pending_signature') {
    throw new BadRequestException('Issuance is not awaiting signature');
  }
}

export function ensureApprovable(status: EquipmentIssuanceStatus): void {
  if (!canApprove(status)) {
    throw new BadRequestException('Issuance cannot be approved in current state');
  }
}
