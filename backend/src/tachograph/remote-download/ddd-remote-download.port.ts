import { TachoDownloadSubject } from '@prisma/client';

export type DddRemoteDownloadSchedule = {
  id: string;
  tenantId: string;
  subject: TachoDownloadSubject;
  driverId: string | null;
  vehicleId: string | null;
  intervalDays: number;
  nextDueAt: Date;
  lastDownloadAt: Date | null;
};

export type DddRemoteFileReference = {
  tenantId: string;
  subject: TachoDownloadSubject;
  remoteId: string;
  fileName: string;
  capturedAt?: string;
  driverId?: string | null;
  vehicleId?: string | null;
};

export interface DddRemoteDownloadPort {
  listAvailableFiles(schedule: DddRemoteDownloadSchedule): Promise<DddRemoteFileReference[]>;
  downloadFile(reference: DddRemoteFileReference): Promise<Buffer>;
}

export const DDD_REMOTE_DOWNLOAD_PORT = Symbol('DDD_REMOTE_DOWNLOAD_PORT');
