import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AUTOMATION_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { OrdivanAdminController } from './ordivan-admin.controller';
import { AutomationQueueController } from './automation-queue.controller';
import { OrdivanConnectorService } from './ordivan-connector.service';

type Row = Record<string, unknown>;

/**
 * Connector kimligi (Faz 12).
 *
 * Prisma MOCK ama kosullu `updateMany`yi GERCEKTEN uyguluyor: enrollment
 * kodunun tek kullanimligi ve iptal davranisi ancak boyle anlamli sinanir.
 */
function build(options: { connectors?: Row[] } = {}) {
  const rows: Row[] = (options.connectors ?? []).map((row) => ({ ...row }));
  const audits: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'tenantId') continue;
      const actual = row[key];
      if (expected === null) {
        if (actual !== null && actual !== undefined) return false;
        continue;
      }
      if (actual !== expected) return false;
    }
    return true;
  };

  const delegate = {
    create: async (args: { data: Row; select?: Row }) => {
      seq += 1;
      const row: Row = {
        id: `conn-${seq}`,
        tenantId: 'tenant-a',
        status: 'pending_enrollment',
        enrolledAt: null,
        credentialHash: null,
        credentialPrefix: null,
        credentialIssuedAt: null,
        credentialRotatedAt: null,
        credentialRevokedAt: null,
        lastHeartbeatAt: null,
        connectorVersion: null,
        protocolVersion: null,
        platform: null,
        architecture: null,
        createdAt: new Date(),
        ...args.data,
      };
      rows.push(row);
      return { ...row };
    },
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = rows.find((row) => matches(row, args.where));
      return found ? { ...found } : null;
    },
    findMany: async () => rows.map((row) => ({ ...row })),
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };

  const client = { ordivanConnector: delegate };
  const prisma = { ...client, unscoped: client };
  const audit = { logAction: async (entry: Row) => { audits.push(entry); return {}; } };

  const service = new OrdivanConnectorService(prisma as never, audit as never);
  return { service, rows, audits };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('OrdivanConnectorService — enrollment', () => {
  it('kod uretir, DUZ METNI saklamaz ve denetime yazmaz', async () => {
    const { service, rows, audits } = build();

    const result = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });

    assert.ok(result.enrollmentCode.length > 20);
    // Veritabaninda YALNIZCA ozet duruyor.
    assert.equal(rows[0]!.enrollmentCodeHash, sha256(result.enrollmentCode));
    assert.equal(rows[0]!.enrollmentCode, undefined);

    const logged = JSON.stringify(audits);
    assert.ok(!logged.includes(result.enrollmentCode), 'kod denetime sizdi');
    assert.ok(!logged.includes(sha256(result.enrollmentCode)), 'ozet denetime sizdi');
  });

  it('taninmayan yetenek sessizce dusurulur, uydurma yetkiye donusmez', async () => {
    const { service, rows } = build();

    await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo', 'shell.exec', 'sql.query'],
    });

    assert.deepEqual(rows[0]!.capabilities, ['system.echo']);
  });

  it('hicbir gecerli yetenek yoksa kod URETILMEZ', async () => {
    const { service } = build();
    await assert.rejects(
      service.createEnrollment('user-admin', {
        displayName: 'Buro-PC',
        capabilities: ['shell.exec'],
      }),
    );
  });

  it('kod TEK KULLANIMLIK — ikinci deneme reddedilir', async () => {
    const { service } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });

    const first = await service.enroll({ enrollmentCode: created.enrollmentCode });
    assert.ok(first.credential.length > 20);

    await assert.rejects(
      service.enroll({ enrollmentCode: created.enrollmentCode }),
      UnauthorizedException,
    );
  });

  it('kiraci ISTEMCIDEN gelmez — koda bagli kayittan okunur', async () => {
    const { service, rows } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });
    rows[0]!.tenantId = 'tenant-b';

    const enrolled = await service.enroll({
      enrollmentCode: created.enrollmentCode,
      // Istemci baska bir kiraci empoze etmeye calissa bile okunmuyor:
      // enroll DTO'sunda boyle bir alan YOK.
    });

    assert.equal(enrolled.connectorId, rows[0]!.id);
    assert.equal(rows[0]!.tenantId, 'tenant-b');
  });

  it('suresi dolmus kod gecersizdir', async () => {
    const { service, rows } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });
    rows[0]!.enrollmentExpiresAt = new Date(Date.now() - 1000);

    await assert.rejects(
      service.enroll({ enrollmentCode: created.enrollmentCode }),
      UnauthorizedException,
    );
  });

  it('gecersiz kod ile kullanilmis kod AYNI cevabi alir', async () => {
    const { service } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });
    await service.enroll({ enrollmentCode: created.enrollmentCode });

    const codes: string[] = [];
    for (const code of [created.enrollmentCode, 'tamamen-uydurma-kod-123456']) {
      try {
        await service.enroll({ enrollmentCode: code });
      } catch (error) {
        codes.push((error as UnauthorizedException).getResponse() as never);
      }
    }
    assert.equal(codes.length, 2);
    assert.deepEqual(codes[0], codes[1]);
  });
});

describe('OrdivanConnectorService — anahtar', () => {
  async function enrolled() {
    const ctx = build();
    const created = await ctx.service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo', 'document.classification'],
    });
    const result = await ctx.service.enroll({ enrollmentCode: created.enrollmentCode });
    return { ...ctx, credential: result.credential, connectorId: result.connectorId };
  }

  it('anahtar DUZ METIN saklanmaz', async () => {
    const { rows, credential } = await enrolled();
    assert.equal(rows[0]!.credentialHash, sha256(credential));
    assert.notEqual(rows[0]!.credentialHash, credential);
    assert.equal((rows[0]!.credentialPrefix as string).length, 8);
  });

  it('gecerli anahtar kiraci ve yetenekleri cozer', async () => {
    const { service, credential, connectorId } = await enrolled();
    const authenticated = await service.authenticate(credential);

    assert.equal(authenticated.connectorId, connectorId);
    assert.equal(authenticated.tenantId, 'tenant-a');
    assert.deepEqual(authenticated.capabilities, ['system.echo', 'document.classification']);
  });

  it('yanlis ve eksik anahtar reddedilir', async () => {
    const { service } = await enrolled();
    await assert.rejects(service.authenticate('yanlis'), UnauthorizedException);
    await assert.rejects(service.authenticate(undefined), UnauthorizedException);
    await assert.rejects(service.authenticate('   '), UnauthorizedException);
  });

  it('rotation eski anahtari ANINDA gecersiz kilar', async () => {
    const { service, credential, connectorId } = await enrolled();
    const rotated = await service.rotateCredential('user-admin', connectorId);

    await assert.rejects(service.authenticate(credential), UnauthorizedException);
    const authenticated = await service.authenticate(rotated.credential);
    assert.equal(authenticated.connectorId, connectorId);
  });

  it('iptal kaydi SILMEZ ama anahtari dusurur', async () => {
    const { service, rows, credential, connectorId } = await enrolled();
    await service.revoke('user-admin', connectorId);

    assert.equal(rows.length, 1, 'kayit silinmemeli');
    assert.equal(rows[0]!.status, 'revoked');
    assert.equal(rows[0]!.credentialHash, null);
    await assert.rejects(service.authenticate(credential), UnauthorizedException);
  });

  it('iptalli connector heartbeat gonderemez', async () => {
    const { service, connectorId } = await enrolled();
    await service.revoke('user-admin', connectorId);
    await assert.rejects(service.heartbeat(connectorId, {}), ForbiddenException);
  });

  it('liste ne anahtari ne ozetini icerir', async () => {
    const { service, credential } = await enrolled();
    const listed = await service.list();
    const serialized = JSON.stringify(listed);

    assert.ok(!serialized.includes(credential));
    assert.ok(!serialized.includes(sha256(credential)));
    assert.ok(!serialized.includes('credentialHash'));
    assert.ok(!serialized.includes('enrollmentCodeHash'));
  });

  it('cevrimici durumu TURETILIR, saklanmaz', async () => {
    const { service, rows, connectorId } = await enrolled();

    rows[0]!.lastHeartbeatAt = new Date();
    assert.equal((await service.list())[0]!.online, true);

    // Surec cokup heartbeat kesildiginde kayit "online" olarak DONUP KALMAZ.
    rows[0]!.lastHeartbeatAt = new Date(Date.now() - 10 * 60_000);
    assert.equal((await service.list())[0]!.online, false);
    void connectorId;
  });

  it('surum bildirmeyen connector "uyumlu" sayilmaz', async () => {
    const { service, rows } = await enrolled();
    rows[0]!.protocolVersion = null;
    assert.equal((await service.list())[0]!.protocolCompatibility, 'unknown');
  });
});

describe('Ordivan uclari — rol siniri', () => {
  it('connector yonetimi ve kuyruk YALNIZCA admin/boss', () => {
    for (const controller of [OrdivanAdminController, AutomationQueueController]) {
      const roles = Reflect.getMetadata(ROLES_KEY, controller) as string[];
      assert.deepEqual([...roles].sort(), [...AUTOMATION_ROLES].sort());
      assert.ok(!roles.includes('accounting'));
      assert.ok(!roles.includes('office'));
      assert.ok(!roles.includes('driver'));
      assert.notDeepEqual([...roles].sort(), [...OPERATIONAL_ROLES].sort());
    }
  });
});

describe('Ordivan — brute force ve saat kaynagi (ek sartname)', () => {
  it('basarisiz enrollment denetime yazilir ama KOD sizmaz', async () => {
    const { service, audits } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });
    await service.enroll({ enrollmentCode: created.enrollmentCode });

    audits.length = 0;
    await assert.rejects(service.enroll({ enrollmentCode: created.enrollmentCode }));

    const failure = audits.find(
      (entry) => entry.action === 'ordivan_connector.enrollment_failed',
    );
    assert.ok(failure, 'basarisiz deneme denetime yazilmadi');
    assert.equal((failure!.metadata as Row).reason, 'already_used');

    const serialized = JSON.stringify(audits);
    assert.ok(!serialized.includes(created.enrollmentCode), 'kod denetime sizdi');
    assert.ok(!serialized.includes(sha256(created.enrollmentCode)), 'ozet denetime sizdi');
  });

  it('taninmayan kod da denetime yazilir', async () => {
    const { service, audits } = build();
    await assert.rejects(service.enroll({ enrollmentCode: 'hic-olmayan-kod-000' }));

    const failure = audits.find(
      (entry) => entry.action === 'ordivan_connector.enrollment_failed',
    );
    assert.ok(failure);
    assert.equal((failure!.metadata as Row).reason, 'unknown_code');
  });

  it('gecersiz anahtar denemesi denetime duser, anahtar sizmaz', async () => {
    const { service, audits } = build();
    await assert.rejects(service.authenticate('tamamen-yanlis-anahtar'));

    const rejected = audits.find(
      (entry) => entry.action === 'ordivan_connector.credential_rejected',
    );
    assert.ok(rejected);
    assert.ok(!JSON.stringify(audits).includes('tamamen-yanlis-anahtar'));
  });

  it('enrollment suresi SUNUCU saatiyle degerlendirilir', async () => {
    const { service, rows } = build();
    const created = await service.createEnrollment('user-admin', {
      displayName: 'Buro-PC',
      capabilities: ['system.echo'],
    });

    // Sunucudaki son kullanma gecmis: istemcinin ne bildirdigi onemsiz —
    // enroll govdesinde zaman alani ZATEN YOK.
    rows[0]!.enrollmentExpiresAt = new Date(Date.now() - 1);
    await assert.rejects(service.enroll({ enrollmentCode: created.enrollmentCode }));
  });
});
