import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { EquipmentIssuancesService } from './equipment-issuances.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { DocumentsService } from '../documents/documents.service';
import type { DriverNotifyService } from '../notifications/driver-notify.service';
import type { OperationalNotifyService } from '../notifications/operational-notify.service';
import type { LocalStorageService } from '../storage/local-storage.service';
import type { ObjectStorageService } from '../storage/object-storage.service';

function buildService(deps?: {
  prisma?: Partial<PrismaService>;
  audit?: Partial<AuditService>;
  documents?: Partial<DocumentsService>;
  driverNotify?: Partial<DriverNotifyService>;
  operationalNotify?: Partial<OperationalNotifyService>;
  storage?: Partial<LocalStorageService>;
  objectStorage?: Partial<ObjectStorageService>;
}) {
  return new EquipmentIssuancesService(
    (deps?.prisma ?? {}) as PrismaService,
    ({ logAction: async () => undefined, ...deps?.audit } as AuditService),
    ({ createDocument: async () => ({ id: 'doc-1', fileUrl: '/uploads/documents/doc-1.pdf' }), ...deps?.documents } as DocumentsService),
    ({ notifyUser: async () => undefined, ...deps?.driverNotify } as DriverNotifyService),
    ({ notifyOperationalUsers: async () => undefined, ...deps?.operationalNotify } as OperationalNotifyService),
    ({ buildDocumentDownloadPath: (id: string) => `/documents/${id}/download`, buildStoredPath: (_bucket: 'documents', name: string) => `/uploads/documents/${name}` } as LocalStorageService),
    ({ syncLocalFile: async () => undefined, ...deps?.objectStorage } as ObjectStorageService),
  );
}

async function createPdfUpload(valid: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'equipment-issuance-'));
  const path = join(directory, 'form.pdf');

  if (valid) {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    writeFileSync(path, await pdf.save());
  } else {
    writeFileSync(path, '%PDF-1.4\ntrailer<<>>\n%%EOF');
  }

  return {
    file: { originalname: 'form.pdf', filename: 'form.pdf', mimetype: 'application/pdf', path },
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

describe('EquipmentIssuancesService', () => {
  it('notifies the driver when an issuance is created', async () => {
    const notifications: Array<{ userId: string; key: string }> = [];
    const upload = await createPdfUpload(true);

    const service = buildService({
      prisma: {
        driver: {
          findUnique: async () => ({
            id: 'drv-1',
            firstName: 'Ada',
            lastName: 'Driver',
            userId: 'usr-driver',
          }),
        },
        equipmentIssuance: {
          create: async () => ({
            id: 'iss-1',
            driverId: 'drv-1',
            issuedById: 'usr-office',
            title: 'Arbeitskleidung Ausgabe',
            items: [{ name: 'Helmet', quantity: 1 }],
            formDocumentPath: '/uploads/documents/form.pdf',
            status: 'pending_signature',
            issuedAt: new Date('2026-01-01T10:00:00.000Z'),
            signedAt: null,
            signatureMethod: null,
            signatureImagePath: null,
            finalDocumentId: null,
            approvedById: null,
            approvedAt: null,
            cancelledAt: null,
            clientMeta: null,
            createdAt: new Date('2026-01-01T10:00:00.000Z'),
            updatedAt: new Date('2026-01-01T10:00:00.000Z'),
            driver: { id: 'drv-1', firstName: 'Ada', lastName: 'Driver', userId: 'usr-driver' },
            issuedBy: { id: 'usr-office', fullName: 'Office User', email: 'office@example.com' },
            approvedBy: null,
            finalDocument: null,
          }),
        },
      } as unknown as PrismaService,
      driverNotify: {
        notifyUser: async (input) => {
          notifications.push({ userId: input.userId, key: input.key });
        },
      },
    });

    try {
      await service.create(
        {
          driverId: 'drv-1',
          title: 'Arbeitskleidung Ausgabe',
          itemsJson: JSON.stringify([{ name: 'Helmet', quantity: 1 }]),
        },
        upload.file,
        'usr-office',
        {},
      );
    } finally {
      upload.cleanup();
    }

    assert.deepEqual(notifications, [{ userId: 'usr-driver', key: 'equipment_issuance_created' }]);
  });

  it('blocks a driver from reading another driver\'s issuance', async () => {
    const service = buildService({
      prisma: {
        driver: {
          findUnique: async ({ where }: { where: { userId: string } }) => {
            if (where.userId === 'usr-driver') {
              return { id: 'drv-1', firstName: 'Ada', lastName: 'Driver', userId: 'usr-driver' };
            }
            return null;
          },
        },
        equipmentIssuance: {
          findUnique: async () => ({
            id: 'iss-1',
            driverId: 'drv-2',
            issuedById: 'usr-office',
            title: 'Arbeitskleidung Ausgabe',
            items: [{ name: 'Helmet', quantity: 1 }],
            formDocumentPath: '/uploads/documents/form.pdf',
            status: 'pending_signature',
            issuedAt: new Date('2026-01-01T10:00:00.000Z'),
            signedAt: null,
            signatureMethod: null,
            signatureImagePath: null,
            finalDocumentId: null,
            approvedById: null,
            approvedAt: null,
            cancelledAt: null,
            clientMeta: null,
            createdAt: new Date('2026-01-01T10:00:00.000Z'),
            updatedAt: new Date('2026-01-01T10:00:00.000Z'),
            driver: { id: 'drv-2', firstName: 'Other', lastName: 'Driver', userId: 'usr-other' },
            issuedBy: { id: 'usr-office', fullName: 'Office User', email: 'office@example.com' },
            approvedBy: null,
            finalDocument: null,
          }),
        },
      } as unknown as PrismaService,
    });

    await assert.rejects(
      service.getByIdForDriver('usr-driver', 'iss-1'),
      ForbiddenException,
    );
  });

  it('requires a form PDF when creating an issuance', async () => {
    const service = buildService();

    await assert.rejects(
      service.create(
        {
          driverId: 'drv-1',
          title: 'Arbeitskleidung Ausgabe',
        },
        { originalname: 'form.png', filename: 'form.png', mimetype: 'image/png', path: '' },
        'usr-office',
        {},
      ),
    );
  });

  it('rejects a malformed PDF before creating an issuance', async () => {
    const service = buildService();
    const upload = await createPdfUpload(false);

    await assert.rejects(
      service.create(
        {
          driverId: 'drv-1',
          title: 'Arbeitskleidung Ausgabe',
        },
        upload.file,
        'usr-office',
        {},
      ),
      /Uploaded file is not a valid PDF/,
    );

    upload.cleanup();
  });
});