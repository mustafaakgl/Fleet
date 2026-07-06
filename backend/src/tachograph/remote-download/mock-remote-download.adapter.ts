import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DddRemoteDownloadPort, DddRemoteDownloadSchedule, DddRemoteFileReference } from './ddd-remote-download.port';

const FIXTURE_PATH = join(__dirname, '..', 'ddd', '__fixtures__', 'sample-driver-card.ddd');

@Injectable()
export class MockRemoteAdapter implements DddRemoteDownloadPort {
  private readonly fixture = readFileSync(FIXTURE_PATH);

  listCalls = 0;
  downloadCalls = 0;

  async listAvailableFiles(schedule: DddRemoteDownloadSchedule): Promise<DddRemoteFileReference[]> {
    this.listCalls += 1;
    const reference: DddRemoteFileReference = {
      tenantId: schedule.tenantId,
      subject: schedule.subject,
      remoteId: `${schedule.id}:sample-driver-card`,
      fileName: 'sample-driver-card.ddd',
      capturedAt: '2026-07-06T00:00:00.000Z',
      driverId: schedule.driverId,
      vehicleId: schedule.vehicleId,
    };

    return [reference];
  }

  async downloadFile(_reference: DddRemoteFileReference): Promise<Buffer> {
    this.downloadCalls += 1;
    return Buffer.from(this.fixture);
  }
}
