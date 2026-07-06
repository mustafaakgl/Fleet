import { Injectable } from '@nestjs/common';
import { TachoProvider } from '@prisma/client';
import { TachoProviderCredentialService } from '../tacho-provider-credential.service';
import { DddRemoteDownloadPort, DddRemoteDownloadSchedule, DddRemoteFileReference } from './ddd-remote-download.port';

type TisWebCredentialPayload = {
  accessToken?: string;
  apiKey?: string;
  username?: string;
  password?: string;
};

@Injectable()
export class TisWebAdapter implements DddRemoteDownloadPort {
  constructor(private readonly credentials: TachoProviderCredentialService) {}

  private get baseUrl(): string {
    const raw = process.env.TIS_WEB_BASE_URL?.trim();
    if (!raw) {
      throw new Error('TIS_WEB_BASE_URL is not configured');
    }
    return raw;
  }

  private buildHeaders(payload: TisWebCredentialPayload): HeadersInit {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (payload.accessToken) {
      headers.Authorization = `Bearer ${payload.accessToken}`;
    } else if (payload.apiKey) {
      headers['X-API-Key'] = payload.apiKey;
    } else if (payload.username && payload.password) {
      headers.Authorization = `Basic ${Buffer.from(`${payload.username}:${payload.password}`).toString('base64')}`;
    }

    return headers;
  }

  async listAvailableFiles(schedule: DddRemoteDownloadSchedule): Promise<DddRemoteFileReference[]> {
    const resolved = await this.credentials.resolveCredential(schedule.tenantId, TachoProvider.tis_web);
    if (!resolved) {
      throw new Error(`No TIS-Web credential configured for tenant ${schedule.tenantId}`);
    }

    const listPath = process.env.TIS_WEB_LIST_PATH?.trim() || '/api/ddd/files';
    const url = new URL(listPath, this.baseUrl);
    url.searchParams.set('tenantId', schedule.tenantId);
    url.searchParams.set('subject', schedule.subject);
    url.searchParams.set('scheduleId', schedule.id);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(resolved.payload as TisWebCredentialPayload),
    });

    if (!response.ok) {
      throw new Error(`TIS-Web listAvailableFiles failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as unknown;
    const items = Array.isArray(body)
      ? body
      : Array.isArray((body as { files?: unknown }).files)
        ? (body as { files: unknown[] }).files
        : Array.isArray((body as { items?: unknown }).items)
          ? (body as { items: unknown[] }).items
          : [];

    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const record = item as Record<string, unknown>;
      const remoteId = typeof record.remoteId === 'string'
        ? record.remoteId
        : typeof record.id === 'string'
          ? record.id
          : typeof record.referenceId === 'string'
            ? record.referenceId
            : '';
      if (!remoteId) {
        return [];
      }

      const fileName = typeof record.fileName === 'string'
        ? record.fileName
        : typeof record.name === 'string'
          ? record.name
          : `${remoteId}.ddd`;

      const capturedAt = typeof record.capturedAt === 'string'
        ? record.capturedAt
        : typeof record.createdAt === 'string'
          ? record.createdAt
          : undefined;

      const reference: DddRemoteFileReference = {
        tenantId: schedule.tenantId,
        subject: schedule.subject,
        remoteId,
        fileName,
        capturedAt,
        driverId: schedule.driverId,
        vehicleId: schedule.vehicleId,
      };

      return [reference];
    });
  }

  async downloadFile(reference: DddRemoteFileReference): Promise<Buffer> {
    const resolved = await this.credentials.resolveCredential(reference.tenantId, TachoProvider.tis_web);
    if (!resolved) {
      throw new Error(`No TIS-Web credential configured for tenant ${reference.tenantId}`);
    }

    const downloadTemplate = process.env.TIS_WEB_DOWNLOAD_PATH?.trim() || '/api/ddd/files/{remoteId}';
    const downloadPath = downloadTemplate.replace('{remoteId}', encodeURIComponent(reference.remoteId));
    const url = new URL(downloadPath, this.baseUrl);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(resolved.payload as TisWebCredentialPayload),
    });

    if (!response.ok) {
      throw new Error(`TIS-Web downloadFile failed with HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
