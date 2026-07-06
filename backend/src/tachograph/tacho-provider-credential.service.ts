import { Injectable } from '@nestjs/common';
import { TachoProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TachoProviderCredentialCryptoService } from './tacho-provider-credential-crypto.service';

export type TachoProviderCredentialPayload = Record<string, unknown>;

export type TachoProviderCredentialListItem = {
  id: string;
  tenantId: string;
  provider: TachoProvider;
  encryptedPayload: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TachoProviderCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TachoProviderCredentialCryptoService,
  ) {}

  async upsertCredential(
    tenantId: string,
    provider: TachoProvider,
    payload: TachoProviderCredentialPayload,
  ): Promise<TachoProviderCredentialListItem> {
    const encryptedPayload = this.crypto.encryptJson(payload);
    return this.prisma.tachoProviderCredential.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider,
        },
      },
      create: {
        tenantId,
        provider,
        encryptedPayload,
      },
      update: {
        encryptedPayload,
      },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        encryptedPayload: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listCredentials(tenantId: string): Promise<TachoProviderCredentialListItem[]> {
    return this.prisma.tachoProviderCredential.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        encryptedPayload: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async resolveCredential(
    tenantId: string,
    provider: TachoProvider,
  ): Promise<{ payload: TachoProviderCredentialPayload; credential: TachoProviderCredentialListItem } | null> {
    const credential = await this.prisma.tachoProviderCredential.findFirst({
      where: { tenantId, provider },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        encryptedPayload: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!credential) {
      return null;
    }

    const payload = this.crypto.decryptJson(credential.encryptedPayload);
    await this.prisma.tachoProviderCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return { credential, payload };
  }
}
