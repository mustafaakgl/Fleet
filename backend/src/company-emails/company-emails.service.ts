import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { companyEmailMail } from '../mail/mail-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyEmailDto } from './dto/update-company-email.dto';

type CompanyEmailStatus = 'draft' | 'draft_ready' | 'needs_review' | 'sent' | 'failed';
const COMPANY_EMAIL_STATUSES: CompanyEmailStatus[] = [
  'draft',
  'draft_ready',
  'needs_review',
  'sent',
  'failed',
];

type EmailRow = {
  companyId: string;
  companyName: string;
  driverName: string;
  plateNumber: string;
  startTime: string | null;
  routeName: string | null;
  cargoName: string;
  pickupAddress: string;
  deliveryAddress: string;
};

@Injectable()
export class CompanyEmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  private async safeAuditLog(params: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.auditService.logAction(params);
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private normalizeDate(dateInput: string | Date): Date {
    const parsed = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private getDayRange(dateInput: string | Date): { start: Date; end: Date } {
    const start = this.normalizeDate(dateInput);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private ensureStatus(value: string): CompanyEmailStatus {
    if (!COMPANY_EMAIL_STATUSES.includes(value as CompanyEmailStatus)) {
      throw new BadRequestException('Invalid company email status');
    }

    return value as CompanyEmailStatus;
  }

  private formatDateForSubject(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private buildSubject(date: Date, companyName: string): string {
    return `Einsatzplan fur ${this.formatDateForSubject(date)} - ${companyName}`;
  }

  private buildBody(date: Date, companyName: string, rows: EmailRow[]): string {
    const lines = rows.map((row) => {
      const routeLabel = row.routeName ?? '-';
      return `- Fahrer: ${row.driverName} | Fahrzeug: ${row.plateNumber} | Start: ${row.startTime} | Auftrag/Route: ${routeLabel} | Ladung: ${row.cargoName} | Abholung: ${row.pickupAddress} | Lieferung: ${row.deliveryAddress}`;
    });

    return [
      'Sehr geehrte Damen und Herren,',
      '',
      `anbei erhalten Sie den Einsatzplan fuer ${this.formatDateForSubject(date)}.`,
      '',
      `Firma: ${companyName}`,
      '',
      'Geplante Fahrer und Fahrzeuge:',
      '',
      ...lines,
      '',
      'Mit freundlichen Grussen',
      'Fleet Management Team',
    ].join('\n');
  }

  private async loadCompanyAssignmentsForDate(companyId: string, date: Date) {
    const { start, end } = this.getDayRange(date);
    return this.prisma.assignment.findMany({
      where: {
        companyId,
        workDate: {
          gte: start,
          lt: end,
        },
        // Iptal edilen is musteriye bildirilmez. Filtre yoktu: iptal edilmis bir
        // gorev de e-postaya giriyor ve musteri gelmeyecek bir araci bekliyordu.
        status: { not: AssignmentStatus.cancelled },
      },
      include: {
        company: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        vehicle: {
          select: {
            plateNumber: true,
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async generateDraftForCompany(dateInput: string | Date, companyId: string, actorUserId?: string) {
    const date = this.normalizeDate(dateInput);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, email: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const assignments = await this.loadCompanyAssignmentsForDate(companyId, date);
    if (assignments.length === 0) {
      throw new BadRequestException('No assignments found for the selected company/date');
    }

    const rows: EmailRow[] = assignments.map((a) => ({
      companyId: a.companyId,
      companyName: a.company.name,
      driverName: `${a.driver.firstName} ${a.driver.lastName}`,
      plateNumber: a.vehicle.plateNumber,
      startTime: a.startTime,
      routeName: a.routeName,
      cargoName: a.cargoName,
      pickupAddress: a.pickupAddress,
      deliveryAddress: a.deliveryAddress,
    }));

    const subject = this.buildSubject(date, company.name);
    const body = this.buildBody(date, company.name, rows);
    const recipientEmail = company.email ?? '';

    let createdNewDraft = false;
    const result = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;
      const existing = await db.companyEmail.findUnique({
        where: {
          companyId_date: {
            companyId,
            date,
          },
        },
      });

      if (existing) {
        // Elle duzenlenmis metin korunur. Gorevler degismis olabilir, bu yuzden
        // durum yine needs_review olur — ama ofisin yazdigini silmek yerine
        // karari insana birakiyoruz. Alici adresi firma kartindan tazelenir:
        // o metin degil, adres duzeltmesidir.
        const keepText = Boolean(existing.manuallyEditedAt);

        return db.companyEmail.update({
          where: { id: existing.id },
          data: {
            ...(keepText ? {} : { subject, body }),
            recipientEmail,
            status: 'needs_review',
          },
          include: {
            company: true,
          },
        });
      }

      const created = await db.companyEmail.create({
        data: {
          companyId,
          date,
          subject,
          recipientEmail,
          body,
          status: 'draft',
        },
        include: {
          company: true,
        },
      });

      createdNewDraft = true;
      return created;
    });

    if (createdNewDraft) {
      await this.safeAuditLog({
        actorUserId,
        action: 'company_email.created',
        entityType: 'company_email',
        entityId: result.id,
        summary: 'Company email draft created',
        metadata: {
          companyId: result.companyId,
          status: result.status,
          date: result.date.toISOString(),
        },
      });
    }

    return result;
  }

  async generateDraftsForDate(dateInput: string | Date, actorUserId?: string) {
    const { start, end } = this.getDayRange(dateInput);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        workDate: {
          gte: start,
          lt: end,
        },
        status: { not: AssignmentStatus.cancelled },
      },
      select: {
        companyId: true,
      },
      distinct: ['companyId'],
    });

    const drafts = [] as Array<unknown>;
    for (const item of assignments) {
      const draft = await this.generateDraftForCompany(start, item.companyId, actorUserId);
      drafts.push(draft);
    }

    return drafts;
  }

  async listCompanyEmails(filters: {
    companyId?: string;
    date?: string;
    status?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.companyId) {
      where.companyId = filters.companyId;
    }

    if (filters.status) {
      where.status = this.ensureStatus(filters.status);
    }

    if (filters.date) {
      const { start, end } = this.getDayRange(filters.date);
      where.date = {
        gte: start,
        lt: end,
      };
    }

    const db = this.prisma as any;
    return db.companyEmail.findMany({
      where,
      include: {
        company: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getCompanyEmailById(id: string) {
    const db = this.prisma as any;
    const row = await db.companyEmail.findUnique({
      where: { id },
      include: {
        company: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Company email draft not found');
    }

    return row;
  }

  async updateDraft(id: string, input: UpdateCompanyEmailDto, actorUserId?: string) {
    await this.getCompanyEmailById(id);

    const payload: Record<string, unknown> = {};
    if (input.subject !== undefined) payload.subject = input.subject;
    if (input.recipientEmail !== undefined) payload.recipientEmail = input.recipientEmail;
    if (input.body !== undefined) payload.body = input.body;
    if (input.status !== undefined) payload.status = this.ensureStatus(input.status);

    // Metne insan eli degdiyse damgala; yeniden uretim bundan sonra bu kaydin
    // konusunu ve govdesini ezmez. Yalnizca durum degistiren cagrilar
    // (ornegin "gonderildi isaretle") damga birakmaz.
    if (input.subject !== undefined || input.body !== undefined) {
      payload.manuallyEditedAt = new Date();
    }

    const db = this.prisma as any;
    const updated = await db.companyEmail.update({
      where: { id },
      data: payload,
      include: {
        company: true,
      },
    });

    if (input.status !== undefined) {
      await this.safeAuditLog({
        actorUserId,
        action: 'company_email.status_changed',
        entityType: 'company_email',
        entityId: updated.id,
        summary: 'Company email status changed',
        metadata: {
          status: updated.status,
        },
      });
    }

    return updated;
  }

  async markAsDraftReady(emailId: string, actorUserId?: string) {
    await this.getCompanyEmailById(emailId);

    const db = this.prisma as any;
    const updated = await db.companyEmail.update({
      where: { id: emailId },
      data: { status: 'draft_ready' },
      include: { company: true },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'company_email.marked_draft_ready',
      entityType: 'company_email',
      entityId: updated.id,
      summary: 'Company email marked as draft ready',
      metadata: {
        status: updated.status,
      },
    });

    return updated;
  }

  /**
   * Verilen gunlerdeki gonderilebilir tum firma e-postalarini tek seferde yollar.
   *
   * Zaten gonderilmis olanlar ATLANIR — disponent butona iki kez basarsa musteri
   * ayni bildirimi iki kez almamali. Alicisi olmayan taslak da atlanir; bunlar
   * hata degil, henuz hazir olmayan satirlardir.
   *
   * Tek bir adres patlarsa islem durmaz: her sonuc toplanir ve ozet dondurulur,
   * boylece disponent hangi firmaya ulasilamadigini gorur. Gonderim sirali
   * yapilir — paralel gonderim SMTP tarafinda hiz sinirina takiliyor.
   */
  async sendAllForDates(dates: Array<string | Date>, actorUserId?: string) {
    if (dates.length === 0) {
      throw new BadRequestException('At least one date is required');
    }

    const ranges = dates.map((date) => this.getDayRange(date));
    const candidates = await this.prisma.companyEmail.findMany({
      where: {
        OR: ranges.map((range) => ({ date: { gte: range.start, lt: range.end } })),
        status: { not: 'sent' },
        // Durum tek basina yetmiyor: yeniden uretim gonderilmis bir kaydi
        // needs_review'a cekiyor, o satir da bu filtreden geciyordu.
        lastSentAt: null,
      },
      select: { id: true, recipientEmail: true, company: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });

    const results: Array<{ companyName: string; ok: boolean; reason?: string }> = [];

    for (const candidate of candidates) {
      const companyName = candidate.company?.name ?? 'unknown';

      if (!candidate.recipientEmail?.trim()) {
        results.push({ companyName, ok: false, reason: 'missing_recipient' });
        continue;
      }

      try {
        const sent = await this.sendEmail(candidate.id, actorUserId);
        // mode 'log' gelistirme ortami: posta gercekten gitmez ama akis basarilidir.
        const delivered = sent.mail_sent || sent.mail_mode === 'log';
        results.push({
          companyName,
          ok: delivered,
          reason: delivered ? undefined : 'delivery_failed',
        });
      } catch (error) {
        results.push({
          companyName,
          ok: false,
          reason: error instanceof Error ? error.name : 'unknown_error',
        });
      }
    }

    const sentCount = results.filter((item) => item.ok).length;

    await this.safeAuditLog({
      actorUserId,
      action: 'company_email.bulk_sent',
      entityType: 'company_email',
      summary: `Bulk send: ${sentCount}/${results.length}`,
      metadata: {
        requested: results.length,
        sent: sentCount,
        failed: results.length - sentCount,
      },
    });

    return {
      total: results.length,
      sent: sentCount,
      failed: results.filter((item) => !item.ok).map((item) => ({
        company: item.companyName,
        reason: item.reason ?? 'unknown_error',
      })),
    };
  }

  /**
   * Tek bir firma e-postasini gonderir.
   *
   * Zaten gonderilmis bir kaydi ikinci kez gondermez: musteriye ayni postanin
   * iki kez gitmesi geri alinamaz. Bilerek tekrarlamak isteyen cagirici
   * `allowResend` vermek zorunda — otomatik yollar bunu asla vermez.
   */
  async sendEmail(emailId: string, actorUserId?: string, options?: { allowResend?: boolean }) {
    const row = await this.getCompanyEmailById(emailId);

    if (row.lastSentAt && !options?.allowResend) {
      throw new ConflictException('Company email was already sent');
    }

    const recipient = row.recipientEmail?.trim();
    if (!recipient) {
      throw new BadRequestException('Recipient email is required before sending');
    }

    const template = companyEmailMail({
      subject: row.subject,
      body: row.body,
      companyName: row.company?.name,
    });
    const mailResult = await this.mailService.sendMail({
      to: recipient,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    const db = this.prisma as any;
    const updated = await db.companyEmail.update({
      where: { id: emailId },
      data: {
        status: mailResult.sent || mailResult.mode === 'log' ? 'sent' : 'failed',
        lastSentAt: new Date(),
      },
      include: { company: true },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'company_email.sent',
      entityType: 'company_email',
      entityId: updated.id,
      summary: 'Company email sent',
      metadata: {
        mail_mode: mailResult.mode,
        mail_sent: mailResult.sent,
        recipient_domain: recipient.split('@')[1] ?? 'unknown',
      },
    });

    return {
      email: updated,
      mail_sent: mailResult.sent,
      mail_mode: mailResult.mode,
    };
  }

  async markAsSent(emailId: string, actorUserId?: string) {
    await this.getCompanyEmailById(emailId);

    const db = this.prisma as any;
    const updated = await db.companyEmail.update({
      where: { id: emailId },
      data: {
        status: 'sent',
        lastSentAt: new Date(),
      },
      include: {
        company: true,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'company_email.status_changed',
      entityType: 'company_email',
      entityId: updated.id,
      summary: 'Company email marked sent',
      metadata: {
        status: updated.status,
      },
    });

    return updated;
  }

  async markAsFailed(emailId: string, actorUserId?: string) {
    await this.getCompanyEmailById(emailId);

    const db = this.prisma as any;
    const updated = await db.companyEmail.update({
      where: { id: emailId },
      data: {
        status: 'failed',
      },
      include: {
        company: true,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'company_email.status_changed',
      entityType: 'company_email',
      entityId: updated.id,
      summary: 'Company email marked failed',
      metadata: {
        status: updated.status,
      },
    });

    return updated;
  }

  async runScheduledEmailsForDate(
    dateInput: string | Date,
    options?: { autoSend?: boolean; actorUserId?: string },
  ) {
    // Varsayilan KAPALI: cron yalnizca taslak hazirlar, gonderme karari insanda
    // kalir. Acmak icin COMPANY_EMAIL_AUTO_SEND=true.
    const autoSend =
      options?.autoSend ??
      (process.env.COMPANY_EMAIL_AUTO_SEND ?? 'false').toLowerCase() === 'true';
    const date = this.normalizeDate(dateInput);
    const drafts = await this.generateDraftsForDate(date, options?.actorUserId);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const draft of drafts as Array<{
      id: string;
      status: CompanyEmailStatus;
      recipientEmail?: string | null;
      lastSentAt?: Date | null;
    }>) {
      // Duruma degil, lastSentAt'e bakiyoruz: yeniden uretim durumu
      // needs_review'a cekiyor, yani "sent" damgasi bu noktada zaten silinmis
      // oluyordu ve ayni posta ikinci kez gidiyordu.
      if (draft.lastSentAt) {
        skipped += 1;
        continue;
      }

      if (!autoSend) {
        skipped += 1;
        continue;
      }

      if (!draft.recipientEmail?.trim()) {
        await this.markAsFailed(draft.id, options?.actorUserId);
        failed += 1;
        continue;
      }

      if (draft.status === 'draft') {
        await this.markAsDraftReady(draft.id, options?.actorUserId);
      }

      try {
        const result = await this.sendEmail(draft.id, options?.actorUserId);
        if (result.mail_sent || result.mail_mode === 'log') {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch {
        await this.markAsFailed(draft.id, options?.actorUserId);
        failed += 1;
      }
    }

    return {
      date: date.toISOString().slice(0, 10),
      draftsCreated: drafts.length,
      sent,
      failed,
      skipped,
      autoSend,
    };
  }

  async updateEmailStatusAfterAssignmentChange(companyId: string, dateInput: string | Date) {
    const date = this.normalizeDate(dateInput);

    const db = this.prisma as any;
    const existing = await db.companyEmail.findUnique({
      where: {
        companyId_date: {
          companyId,
          date,
        },
      },
    });

    if (!existing) {
      return null;
    }

    return db.companyEmail.update({
      where: { id: existing.id },
      data: {
        status: 'needs_review',
      },
      include: {
        company: true,
      },
    });
  }
}
