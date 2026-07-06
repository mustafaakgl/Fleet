import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PrismaClient, TachoProvider } from '@prisma/client';
import { TachoProviderCredentialCryptoService } from './tacho-provider-credential-crypto.service';
import { TachoProviderCredentialService } from './tacho-provider-credential.service';

class TestPrismaService extends PrismaClient {
  constructor() {
    super();
  }
}

describe('TachoProviderCredentialService', () => {
  const previousKey = process.env.TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  process.env.TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  const prisma = new TestPrismaService();
  const crypto = new TachoProviderCredentialCryptoService();
  const service = new TachoProviderCredentialService(prisma as unknown as import('../prisma/prisma.service').PrismaService, crypto);

  before(async () => {
    await prisma.tachoProviderCredential.deleteMany({ where: { tenantId: 'default-tenant' } });
  });

  after(async () => {
    await prisma.tachoProviderCredential.deleteMany({ where: { tenantId: 'default-tenant' } });
    await prisma.$disconnect();
    if (previousKey === undefined) {
      delete process.env.TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY = previousKey;
    }
  });

  it('stores encrypted payloads and never returns plaintext from list()', async () => {
    const payload = {
      accessToken: 'plain-token',
      accountId: 'tenant-account-1',
    };

    await service.upsertCredential('default-tenant', TachoProvider.tis_web, payload);
    const listed = await service.listCredentials('default-tenant');

    assert.equal(listed.length, 1);
    assert.notEqual(listed[0]?.encryptedPayload, JSON.stringify(payload));

    const resolved = await service.resolveCredential('default-tenant', TachoProvider.tis_web);
    assert.deepEqual(resolved?.payload, payload);
    assert.equal(typeof listed[0]?.encryptedPayload, 'string');
  });
});
