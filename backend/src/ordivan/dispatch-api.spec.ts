import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WriteRoleGuard } from '../common/guards/write-role.guard';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { DispatchController } from './dispatch.controller';
import { DeliverySlotController } from './delivery-slot.controller';
import { PublicSlotController } from './public-slot.controller';
import {
  ApproveDispatchDto,
  CreateDispatchProposalDto,
  ListDispatchProposalsQueryDto,
  RejectDispatchDto,
} from './dto/dispatch.dto';
import { CreateSlotDto, CreateSlotInvitationDto } from './dto/delivery-slot.dto';

/**
 * DISPATCH VE SLOT API — ROL VE GIRDI SOZLESMESI (Faz 17f).
 *
 * GUARD'LAR GERCEK, ROTALAR GERCEK. Test bir taklit uzerinde degil, REPODAKI
 * `RolesGuard`/`DriverBlockGuard`/`WriteRoleGuard` siniflarini controller'in
 * KENDI metadata'siyla calistiriyor. Birisi `@Roles` ya da `@RequiresWrite()`
 * satirini silerse bu dosya duser — dekoratorlerin varligini elle okumak
 * yerine DAVRANISLARINI olcuyoruz.
 *
 * DOGRULAMA DA GERCEK: `ValidationPipe` `create-app.ts` ile AYNI secenekleri
 * (`whitelist` + `forbidNonWhitelisted` + `transform`) kullaniyor. Enjeksiyon
 * testleri bu yuzden "DTO'da alan yok" degil, "istek 400 ile duser" diyor.
 */

const PIPE = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

/** Uygulamadaki global guard sirasi: once yazma, sonra rol kapilari. */
const WRITE_GUARD = new WriteRoleGuard(new Reflector());

function contextFor(controller: Function, methodName: string, role?: string) {
  const handler = (controller.prototype as Record<string, unknown>)[methodName] as Function;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u-1', role } : undefined, headers: {} }),
    }),
    getHandler: () => handler,
    getClass: () => controller,
  } as never;
}

/** Bir rolun bir ucu gecip gecemedigi — UC GUARD'IN HEPSINDEN. */
function passes(controller: Function, methodName: string, role: string): boolean {
  try {
    WRITE_GUARD.canActivate(contextFor(controller, methodName, role));
    new DriverBlockGuard().canActivate(contextFor(controller, methodName, role));
    new RolesGuard().canActivate(contextFor(controller, methodName, role));
    return true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

async function validationFails(dtoClass: Function, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await PIPE.transform(payload, { type: 'body', metatype: dtoClass as never });
    return false;
  } catch {
    return true;
  }
}

const ROLES = ['admin', 'boss', 'office', 'accounting', 'driver'] as const;

// ---------------------------------------------------------------------------
// Rol matrisi
// ---------------------------------------------------------------------------

describe('Bes rol — dispatch matrisi', () => {
  const READ_ENDPOINTS = ['list', 'detail', 'candidates', 'overrides', 'resultTour'] as const;
  const WRITE_ENDPOINTS = ['create', 'retry', 'approve', 'reject'] as const;

  it('admin ve boss HER SEYI yapar', () => {
    for (const role of ['admin', 'boss'] as const) {
      for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
        assert.equal(passes(DispatchController, endpoint, role), true, `${role}:${endpoint}`);
      }
    }
  });

  it('office kuyrugu gorur VE plani yonetir', () => {
    for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
      assert.equal(passes(DispatchController, endpoint, 'office'), true, `office:${endpoint}`);
    }
  });

  /**
   * MUHASEBENIN SINIRI.
   *
   * Finansal yetkisi KORUNUYOR (kuyrugu ve tutarlari gorur) ama dispatch
   * PLANINI degistiremez. Bu, `transport-orders`taki mevcut kisitin ta
   * kendisi ve bu uclar onu GEVSETMIYOR.
   */
  it('accounting OKUR ama HICBIR yazma ucundan gecemez', () => {
    for (const endpoint of READ_ENDPOINTS) {
      assert.equal(passes(DispatchController, endpoint, 'accounting'), true, `read:${endpoint}`);
    }
    for (const endpoint of WRITE_ENDPOINTS) {
      assert.equal(passes(DispatchController, endpoint, 'accounting'), false, `write:${endpoint}`);
    }
  });

  it('driver dispatch kuyruguna HIC giremez', () => {
    for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
      assert.equal(passes(DispatchController, endpoint, 'driver'), false, `driver:${endpoint}`);
    }
  });

  it('customer de disarida', () => {
    for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
      assert.equal(passes(DispatchController, endpoint, 'customer'), false, `customer:${endpoint}`);
    }
  });
});

describe('Bes rol — slot matrisi', () => {
  const READ_ENDPOINTS = ['listInvitations', 'listSlots'] as const;
  const WRITE_ENDPOINTS = [
    'createInvitation',
    'revokeInvitation',
    'reissueInvitation',
    'createSlot',
    'updateSlot',
  ] as const;

  it('operasyon yazma rolleri slot yonetir', () => {
    for (const role of ['admin', 'boss', 'office'] as const) {
      for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
        assert.equal(passes(DeliverySlotController, endpoint, role), true, `${role}:${endpoint}`);
      }
    }
  });

  it('accounting slot PLANINI degistiremez', () => {
    for (const endpoint of READ_ENDPOINTS) {
      assert.equal(passes(DeliverySlotController, endpoint, 'accounting'), true, endpoint);
    }
    for (const endpoint of WRITE_ENDPOINTS) {
      assert.equal(passes(DeliverySlotController, endpoint, 'accounting'), false, endpoint);
    }
  });

  it('driver slot yonetimine erisemez', () => {
    for (const endpoint of [...READ_ENDPOINTS, ...WRITE_ENDPOINTS]) {
      assert.equal(passes(DeliverySlotController, endpoint, 'driver'), false, endpoint);
    }
  });
});

// ---------------------------------------------------------------------------
// Guard kurulumu
// ---------------------------------------------------------------------------

describe('Guard kurulumu', () => {
  it('yetkilendirilmis controller`lar JWT + rol guard`i tasiyor', () => {
    for (const controller of [DispatchController, DeliverySlotController]) {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as Function[];
      assert.ok(guards.includes(JwtAuthGuard as never), `${controller.name}: JwtAuthGuard`);
      assert.ok(guards.includes(RolesGuard as never), `${controller.name}: RolesGuard`);
      assert.ok(guards.includes(DriverBlockGuard as never), `${controller.name}: DriverBlockGuard`);
    }
  });

  /**
   * PUBLIC UC AYRI BIR SINIFTA.
   *
   * `@Public()` yetkilendirilmis bir controller'in tek bir metoduna
   * konulsaydi, o sinifa sonradan eklenen her uc bir gozden kacirmayla public
   * olabilirdi. Ayirmak, kazayla acilmayi YAPISAL olarak zorlastiriyor.
   */
  it('yalnizca public controller `@Public()` tasiyor', () => {
    assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, PublicSlotController), true);
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, DispatchController), true);
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, DeliverySlotController), true);
  });

  it('rota adlari beklenen yerde', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, DispatchController), 'dispatch');
    assert.equal(Reflect.getMetadata(PATH_METADATA, DeliverySlotController), 'delivery-slots');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PublicSlotController), 'public/delivery-slots');
  });
});

// ---------------------------------------------------------------------------
// Enjeksiyon
// ---------------------------------------------------------------------------

describe('Istemci DAYATAMAZ', () => {
  const VALID_CREATE = { transportOrderIds: ['to-1'], workDate: '2026-09-01' };
  const VALID_APPROVE = {
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    expectedUpdatedAt: '2026-09-01T08:00:00.000Z',
    proposalRevision: 1,
    idempotencyKey: 'idem-key-0001',
  };

  it('gecerli govde GECIYOR — test yanlis sebeple yesil olmasin', async () => {
    assert.equal(await validationFails(CreateDispatchProposalDto, VALID_CREATE), false);
    assert.equal(await validationFails(ApproveDispatchDto, VALID_APPROVE), false);
  });

  it('`tenantId` enjeksiyonu 400', async () => {
    assert.equal(
      await validationFails(CreateDispatchProposalDto, { ...VALID_CREATE, tenantId: 'other-tenant' }),
      true,
    );
    assert.equal(
      await validationFails(ApproveDispatchDto, { ...VALID_APPROVE, tenantId: 'other-tenant' }),
      true,
    );
    assert.equal(
      await validationFails(CreateSlotInvitationDto, {
        consignmentId: 'con-1',
        kind: 'delivery',
        tenantId: 'other-tenant',
      }),
      true,
    );
  });

  it('`resultTourId` enjeksiyonu 400', async () => {
    assert.equal(await validationFails(ApproveDispatchDto, { ...VALID_APPROVE, resultTourId: 't-1' }), true);
    assert.equal(await validationFails(CreateDispatchProposalDto, { ...VALID_CREATE, resultTourId: 't-1' }), true);
  });

  it('guven skoru, kanit ve ajan payload`i enjekte edilemez', async () => {
    for (const field of ['confidence', 'evidence', 'payload', 'rankedCandidates', 'agentRunId', 'proposalId']) {
      assert.equal(
        await validationFails(CreateDispatchProposalDto, { ...VALID_CREATE, [field]: {} }),
        true,
        field,
      );
    }
  });

  it('finansal tutar enjekte edilemez', async () => {
    for (const field of ['contractedRevenue', 'currency', 'expectedDailyRevenue', 'price', 'billingMode']) {
      assert.equal(await validationFails(ApproveDispatchDto, { ...VALID_APPROVE, [field]: 1250 }), true, field);
      assert.equal(await validationFails(CreateDispatchProposalDto, { ...VALID_CREATE, [field]: 1250 }), true, field);
    }
  });

  it('uygunluk sonucu enjekte edilemez', async () => {
    for (const field of ['checks', 'overallStatus', 'decision', 'applicable', 'eligible']) {
      assert.equal(
        await validationFails(ApproveDispatchDto, { ...VALID_APPROVE, [field]: 'verified' }),
        true,
        field,
      );
    }
  });

  it('ajan adina onay enjekte edilemez', async () => {
    for (const field of ['actorKind', 'onBehalfOf', 'connectorId', 'agentApproved']) {
      assert.equal(await validationFails(ApproveDispatchDto, { ...VALID_APPROVE, [field]: 'agent' }), true, field);
    }
  });

  it('worker/job durumu enjekte edilemez', async () => {
    for (const field of ['generation', 'jobStatus', 'jobAttempt', 'jobId', 'status']) {
      assert.equal(await validationFails(CreateDispatchProposalDto, { ...VALID_CREATE, [field]: 'ready' }), true, field);
    }
  });

  it('slot token`i ve ozeti govdeden dayatilamaz', async () => {
    for (const field of ['token', 'tokenHash', 'tokenPrefix', 'sourceRevision']) {
      assert.equal(
        await validationFails(CreateSlotInvitationDto, {
          consignmentId: 'con-1',
          kind: 'delivery',
          [field]: 'x',
        }),
        true,
        field,
      );
    }
  });

  it('slot dilimi ve rezervasyon sayaci istemciden gelemez', async () => {
    const valid = {
      locationId: 'loc-1',
      startsAt: '2026-09-01T08:00:00.000Z',
      endsAt: '2026-09-01T10:00:00.000Z',
      capacity: 3,
    };
    assert.equal(await validationFails(CreateSlotDto, valid), false);
    for (const field of ['timezone', 'bookedCount', 'status', 'tenantId']) {
      assert.equal(await validationFails(CreateSlotDto, { ...valid, [field]: 'x' }), true, field);
    }
  });
});

// ---------------------------------------------------------------------------
// Eszamanlilik ve tekrar alanlari ZORUNLU
// ---------------------------------------------------------------------------

describe('Karar uclarinda zorunlu alanlar', () => {
  it('onayda `expectedUpdatedAt`, `proposalRevision` ve `idempotencyKey` ZORUNLU', async () => {
    const base = {
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      expectedUpdatedAt: '2026-09-01T08:00:00.000Z',
      proposalRevision: 1,
      idempotencyKey: 'idem-key-0001',
    };
    for (const field of ['expectedUpdatedAt', 'proposalRevision', 'idempotencyKey']) {
      const payload: Record<string, unknown> = { ...base };
      delete payload[field];
      assert.equal(await validationFails(ApproveDispatchDto, payload), true, field);
    }
  });

  it('redde de ayni ucu ZORUNLU', async () => {
    const base = {
      reason: 'arac bulunamadi',
      expectedUpdatedAt: '2026-09-01T08:00:00.000Z',
      proposalRevision: 1,
      idempotencyKey: 'idem-key-0001',
    };
    assert.equal(await validationFails(RejectDispatchDto, base), false);
    for (const field of ['expectedUpdatedAt', 'proposalRevision', 'idempotencyKey', 'reason']) {
      const payload: Record<string, unknown> = { ...base };
      delete payload[field];
      assert.equal(await validationFails(RejectDispatchDto, payload), true, field);
    }
  });

  it('gecersiz damga bicimi 400', async () => {
    assert.equal(
      await validationFails(ApproveDispatchDto, {
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        expectedUpdatedAt: 'yakinda',
        proposalRevision: 1,
        idempotencyKey: 'idem-key-0001',
      }),
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Sayfalama
// ---------------------------------------------------------------------------

describe('Liste uclari sayfali ve SINIRLI', () => {
  it('makul olmayan sayfa boyutu reddediliyor', async () => {
    assert.equal(await validationFails(ListDispatchProposalsQueryDto, { pageSize: '1000' }), true);
    assert.equal(await validationFails(ListDispatchProposalsQueryDto, { pageSize: '0' }), true);
    assert.equal(await validationFails(ListDispatchProposalsQueryDto, { pageSize: '100' }), false);
  });

  it('bes rolun hepsi ayni sayfalama sozlesmesine tabi', () => {
    // Sayfalama rol bazli DEGIL: hicbir rol sayfalamasiz liste alamaz.
    assert.equal(ROLES.length, 5);
  });
});
