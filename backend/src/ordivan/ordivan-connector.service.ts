import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdivanConnectorStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { sanitizeCapabilities } from './core/job-type-registry';
import { evaluateProtocolCompatibility } from './ordivan.config';

/** Enrollment kodunun omru. Kisa: bu kod bir makineyi kiraciya baglar. */
const ENROLLMENT_TTL_MS = 15 * 60_000;
/** Bu sureden beri haber yoksa connector cevrimdisi sayilir. */
const OFFLINE_AFTER_MS = 3 * 60_000;

export interface AuthenticatedConnector {
  connectorId: string;
  tenantId: string;
  capabilities: string[];
  displayName: string;
}

/**
 * Connector kimligi ve yetkileri (Faz 12).
 *
 * UC KURAL:
 *   1. Connector KENDI kiracisini ya da rolunu SECEMEZ. Kiraci, enrollment
 *      kodunu ureten kullanicidan gelir; istemciden gelen hicbir tenant alani
 *      okunmaz.
 *   2. Duz metin secret VERITABANINDA DURMAZ. Yalnizca SHA-256 ozeti saklanir;
 *      duz metin uretildigi anda bir kez doner (refresh-token.service ile ayni
 *      desen).
 *   3. Connector yalnizca tanimli connector uclarini cagirabilir. Genel SQL,
 *      shell ya da keyfi HTTP araci YOKTUR (bkz. FORBIDDEN_TOOLS).
 */
@Injectable()
export class OrdivanConnectorService {
  private readonly logger = new Logger(OrdivanConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** Sabit zamanli karsilastirma — ozet uzunlugu sabit oldugu icin guvenli. */
  private hashEquals(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private secret(): string {
    return randomBytes(32).toString('base64url');
  }

  // =====================================================================
  // Yonetim (admin/boss)
  // =====================================================================

  /**
   * Tek kullanimlik, kisa omurlu enrollment kodu uretir.
   *
   * Kodun KENDISI yalnizca burada, bir kez doner. Veritabaninda ozeti durur:
   * kod da bir secret'tir ve sizmasi baska bir makinenin bu kiraciya
   * baglanmasi demektir.
   */
  async createEnrollment(
    actorUserId: string,
    input: { displayName: string; capabilities: string[] },
  ): Promise<{ connectorId: string; enrollmentCode: string; expiresAt: string }> {
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new BadRequestException({ code: 'ordivan_display_name_required' });
    }

    // Connector'in isteyebilecegi yetenekler REGISTRY ile sinirli; taninmayan
    // bir yetenek sessizce dusurulur, uydurulmus bir yetkiye donusmez.
    const capabilities = sanitizeCapabilities(input.capabilities);
    if (capabilities.length === 0) {
      throw new BadRequestException({ code: 'ordivan_capability_required' });
    }

    const code = this.secret();
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS);

    const connector = await this.prisma.ordivanConnector.create({
      data: {
        displayName,
        capabilities,
        enrollmentCodeHash: this.hash(code),
        enrollmentExpiresAt: expiresAt,
        status: OrdivanConnectorStatus.pending_enrollment,
        createdById: actorUserId,
      },
      select: { id: true },
    });

    await this.audit.logAction({
      actorUserId,
      action: 'ordivan_connector.enrollment_created',
      entityType: 'OrdivanConnector',
      entityId: connector.id,
      summary: `Ordivan-Connector vorbereitet (${displayName})`,
      // KOD VE OZETI DENETIME GIRMEZ.
      metadata: { connectorId: connector.id, displayName, capabilities },
    });

    return {
      connectorId: connector.id,
      enrollmentCode: code,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Yonetim listesi — secret ya da ozet ICERMEZ. */
  async list(): Promise<
    Array<{
      id: string;
      displayName: string;
      status: string;
      online: boolean;
      lastHeartbeatAt: string | null;
      capabilities: string[];
      connectorVersion: string | null;
      protocolVersion: string | null;
      protocolCompatibility: string;
      platform: string | null;
      architecture: string | null;
      credentialPrefix: string | null;
      credentialIssuedAt: string | null;
      credentialRotatedAt: string | null;
      credentialRevokedAt: string | null;
      enrolledAt: string | null;
    }>
  > {
    const rows = await this.prisma.ordivanConnector.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        displayName: true,
        status: true,
        lastHeartbeatAt: true,
        capabilities: true,
        connectorVersion: true,
        protocolVersion: true,
        platform: true,
        architecture: true,
        credentialPrefix: true,
        credentialIssuedAt: true,
        credentialRotatedAt: true,
        credentialRevokedAt: true,
        enrolledAt: true,
      },
    });

    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      status: row.status,
      // Cevrimici DURUMU turetilir, saklanmaz: saklanan bir bayrak surec
      // cokunce "online" olarak donup kalirdi.
      online:
        row.status === OrdivanConnectorStatus.active &&
        row.lastHeartbeatAt !== null &&
        now - row.lastHeartbeatAt.getTime() < OFFLINE_AFTER_MS,
      lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
      capabilities: row.capabilities,
      connectorVersion: row.connectorVersion,
      protocolVersion: row.protocolVersion,
      protocolCompatibility: evaluateProtocolCompatibility(row.protocolVersion),
      platform: row.platform,
      architecture: row.architecture,
      credentialPrefix: row.credentialPrefix,
      credentialIssuedAt: row.credentialIssuedAt?.toISOString() ?? null,
      credentialRotatedAt: row.credentialRotatedAt?.toISOString() ?? null,
      credentialRevokedAt: row.credentialRevokedAt?.toISOString() ?? null,
      enrolledAt: row.enrolledAt?.toISOString() ?? null,
    }));
  }

  /** Anahtari yeniler. Eski anahtar ANINDA gecersizdir. */
  async rotateCredential(
    actorUserId: string,
    connectorId: string,
  ): Promise<{ credential: string; credentialPrefix: string }> {
    const existing = await this.prisma.ordivanConnector.findFirst({
      where: { id: connectorId },
      select: { id: true, status: true, displayName: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'ordivan_connector_not_found' });
    }
    if (existing.status === OrdivanConnectorStatus.revoked) {
      throw new BadRequestException({ code: 'ordivan_connector_revoked' });
    }

    const credential = this.secret();
    const prefix = credential.slice(0, 8);

    await this.prisma.ordivanConnector.updateMany({
      where: { id: connectorId },
      data: {
        credentialHash: this.hash(credential),
        credentialPrefix: prefix,
        credentialRotatedAt: new Date(),
        credentialRevokedAt: null,
        status: OrdivanConnectorStatus.active,
      },
    });

    await this.audit.logAction({
      actorUserId,
      action: 'ordivan_connector.credential_rotated',
      entityType: 'OrdivanConnector',
      entityId: connectorId,
      summary: `Ordivan-Connector Zugangsschlüssel erneuert (${existing.displayName})`,
      metadata: { connectorId, credentialPrefix: prefix },
    });

    return { credential, credentialPrefix: prefix };
  }

  /**
   * Connector'i iptal eder.
   *
   * KAYIT SILINMEZ: hangi connector ne zaman hangi isi aldi sorusunun cevabi
   * denetimde kalmali. Yalnizca anahtar dusuruluyor — iptalden sonra tek bir
   * istek bile gecemez.
   */
  async revoke(actorUserId: string, connectorId: string): Promise<void> {
    const existing = await this.prisma.ordivanConnector.findFirst({
      where: { id: connectorId },
      select: { id: true, displayName: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'ordivan_connector_not_found' });
    }

    await this.prisma.ordivanConnector.updateMany({
      where: { id: connectorId },
      data: {
        status: OrdivanConnectorStatus.revoked,
        credentialHash: null,
        credentialRevokedAt: new Date(),
      },
    });

    await this.audit.logAction({
      actorUserId,
      action: 'ordivan_connector.revoked',
      entityType: 'OrdivanConnector',
      entityId: connectorId,
      summary: `Ordivan-Connector gesperrt (${existing.displayName})`,
      metadata: { connectorId },
    });
  }

  /**
   * Basarisiz enrollment denemesi.
   *
   * Denetim kaydi kiraci BILINIYORSA o kiracida, bilinmiyorsa kiracisiz
   * yazilir. Cevap her durumda AYNI oldugu icin bu kayit disari hicbir sey
   * sizdirmiyor; yalnizca operatore "bu makineye saldiri deneniyor" diyor.
   */
  private async auditFailedEnrollment(
    tenantId: string | null,
    reason: string,
    connectorId: string | null,
  ): Promise<void> {
    const write = () =>
      this.audit.logAction({
        action: 'ordivan_connector.enrollment_failed',
        entityType: 'OrdivanConnector',
        entityId: connectorId,
        summary: 'Ordivan-Connector Anmeldung fehlgeschlagen',
        metadata: { reason, connectorId },
      });

    try {
      if (tenantId) {
        await TenantContext.run(tenantId, write);
      } else {
        await TenantContext.runUnscoped(write);
      }
    } catch (error) {
      // Denetim yazilamadi diye kimlik dogrulamasi patlamamali.
      this.logger.warn(`enrollment failure audit skipped: ${error}`);
    }
  }

  private async auditFailedCredential(tenantId: string | null, reason: string): Promise<void> {
    const write = () =>
      this.audit.logAction({
        action: 'ordivan_connector.credential_rejected',
        entityType: 'OrdivanConnector',
        summary: 'Ordivan-Connector Zugang abgelehnt',
        metadata: { reason },
      });

    try {
      if (tenantId) {
        await TenantContext.run(tenantId, write);
      } else {
        await TenantContext.runUnscoped(write);
      }
    } catch (error) {
      this.logger.warn(`credential failure audit skipped: ${error}`);
    }
  }

  // =====================================================================
  // Connector protokolu
  // =====================================================================

  /**
   * Enrollment: kod karsiliginda kalici anahtar.
   *
   * KIRACI ISTEMCIDEN GELMEZ — kodun bagli oldugu connector kaydindan okunur.
   * Kod tek kullanimliktir: `enrolledAt` kosullu `updateMany` ile aliniyor,
   * yani ayni kodu ayni anda gonderen iki makineden yalnizca biri kazanir.
   */
  async enroll(input: {
    enrollmentCode: string;
    connectorVersion?: string;
    protocolVersion?: string;
    platform?: string;
    architecture?: string;
  }): Promise<{
    connectorId: string;
    credential: string;
    capabilities: string[];
    protocolVersion: number;
  }> {
    const codeHash = this.hash(input.enrollmentCode ?? '');

    // Kiraci baglami HENIZ YOK: kodun hangi kiraciya ait oldugunu bulmak icin
    // kapsamsiz okuma sart. Yazma islemi asagida yine bu satirla sinirli.
    const connector = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.ordivanConnector.findFirst({
        where: { enrollmentCodeHash: codeHash },
        select: {
          id: true,
          tenantId: true,
          displayName: true,
          capabilities: true,
          enrollmentExpiresAt: true,
          enrolledAt: true,
          status: true,
        },
      }),
    );

    // Gecersiz kod, suresi dolmus kod ve kullanilmis kod AYNI cevabi alir:
    // saldirgan hangisinin dogru oldugunu ogrenememeli.
    if (
      !connector ||
      connector.enrolledAt !== null ||
      // Sure kontrolu SUNUCU SAATIYLE: istemcinin bildirdigi hicbir zaman
      // damgasi bu karara girmiyor.
      connector.enrollmentExpiresAt.getTime() < Date.now() ||
      connector.status === OrdivanConnectorStatus.revoked
    ) {
      // Basarisiz deneme DENETIME yazilir ama KOD ve OZETI yazilmaz; ayrica
      // hangi sebeple dustugu de kaydedilir — cevap bunu ele vermez.
      await this.auditFailedEnrollment(
        connector?.tenantId ?? null,
        !connector
          ? 'unknown_code'
          : connector.enrolledAt !== null
            ? 'already_used'
            : connector.status === OrdivanConnectorStatus.revoked
              ? 'revoked'
              : 'expired',
        connector?.id ?? null,
      );
      throw new UnauthorizedException({ code: 'ordivan_enrollment_invalid' });
    }

    const credential = this.secret();
    const prefix = credential.slice(0, 8);
    const now = new Date();

    const claimed = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.ordivanConnector.updateMany({
        // `enrolledAt: null` KOSULU tek kullanimligi VERITABANINDA tasiyor.
        where: { id: connector.id, enrolledAt: null },
        data: {
          enrolledAt: now,
          status: OrdivanConnectorStatus.active,
          credentialHash: this.hash(credential),
          credentialPrefix: prefix,
          credentialIssuedAt: now,
          connectorVersion: input.connectorVersion?.slice(0, 60) ?? null,
          protocolVersion: input.protocolVersion?.slice(0, 20) ?? null,
          platform: input.platform?.slice(0, 60) ?? null,
          architecture: input.architecture?.slice(0, 30) ?? null,
        },
      }),
    );

    if (claimed.count === 0) {
      // Yaris: ayni kodu ayni anda gonderen ikinci makine.
      await this.auditFailedEnrollment(connector.tenantId, 'race_lost', connector.id);
      throw new UnauthorizedException({ code: 'ordivan_enrollment_invalid' });
    }

    await TenantContext.run(connector.tenantId, () =>
      this.audit.logAction({
        action: 'ordivan_connector.enrolled',
        entityType: 'OrdivanConnector',
        entityId: connector.id,
        summary: `Ordivan-Connector angemeldet (${connector.displayName})`,
        metadata: {
          connectorId: connector.id,
          credentialPrefix: prefix,
          connectorVersion: input.connectorVersion ?? null,
          protocolVersion: input.protocolVersion ?? null,
        },
      }),
    );

    return {
      connectorId: connector.id,
      credential,
      capabilities: connector.capabilities,
      protocolVersion: 1,
    };
  }

  /**
   * Anahtardan connector kimligini cozer.
   *
   * Kiraci BURADAN gelir. Istekteki hicbir alan kiraci belirleyemez.
   */
  async authenticate(credential: string | undefined): Promise<AuthenticatedConnector> {
    if (!credential?.trim()) {
      throw new UnauthorizedException({ code: 'ordivan_credential_missing' });
    }

    const credentialHash = this.hash(credential.trim());
    const connector = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.ordivanConnector.findFirst({
        where: { credentialHash },
        select: {
          id: true,
          tenantId: true,
          displayName: true,
          capabilities: true,
          status: true,
          credentialHash: true,
        },
      }),
    );

    if (
      !connector ||
      connector.status !== OrdivanConnectorStatus.active ||
      !connector.credentialHash ||
      !this.hashEquals(connector.credentialHash, credentialHash)
    ) {
      // Gecersiz anahtar denemesi denetime duser. ANAHTAR VE OZETI YAZILMAZ.
      await this.auditFailedCredential(
        connector?.tenantId ?? null,
        connector ? 'inactive_or_revoked' : 'unknown_credential',
      );
      throw new UnauthorizedException({ code: 'ordivan_credential_invalid' });
    }

    return {
      connectorId: connector.id,
      tenantId: connector.tenantId,
      capabilities: connector.capabilities,
      displayName: connector.displayName,
    };
  }

  /** Heartbeat — surum bilgisi connector'in KENDI bildirimidir. */
  async heartbeat(
    connectorId: string,
    input: {
      connectorVersion?: string;
      protocolVersion?: string;
      platform?: string;
      architecture?: string;
    },
  ): Promise<{ acknowledgedAt: string; protocolCompatibility: string }> {
    const data: Prisma.OrdivanConnectorUpdateManyMutationInput = {
      lastHeartbeatAt: new Date(),
    };
    if (input.connectorVersion) data.connectorVersion = input.connectorVersion.slice(0, 60);
    if (input.protocolVersion) data.protocolVersion = input.protocolVersion.slice(0, 20);
    if (input.platform) data.platform = input.platform.slice(0, 60);
    if (input.architecture) data.architecture = input.architecture.slice(0, 30);

    const updated = await this.prisma.ordivanConnector.updateMany({
      where: { id: connectorId, status: OrdivanConnectorStatus.active },
      data,
    });
    if (updated.count === 0) {
      throw new ForbiddenException({ code: 'ordivan_connector_not_active' });
    }

    return {
      acknowledgedAt: new Date().toISOString(),
      protocolCompatibility: evaluateProtocolCompatibility(input.protocolVersion),
    };
  }
}
