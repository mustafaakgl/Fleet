import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BreakCandidateStatus, WorkTimeEventSource } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { BreakCandidateService } from './break-candidate.service';

/**
 * Ofis tarafinin mola adayi ekrani.
 *
 * Surucu tarafi ayri: o `driver-mobile` altinda ve kendi vardiyasiyla sinirli.
 * Ikisinin ayri olmasinin sebebi yetki: burada ofis BASKA birinin gunune karar
 * veriyor ve bu karar denetim kaydina yaziliyor.
 */

const MAX_RANGE_DAYS = 62;

function parseDay(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({ code: `invalid_${field}` });
  }
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

@Controller('break-candidates')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class BreakCandidateController {
  constructor(
    private readonly candidates: BreakCandidateService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Aralikta bekleyen adaylar.
   *
   * Once tazeleme kosuyor: takograf verisi gec gelebiliyor ve surucu uygulamayi
   * hic acmamis olabilir. Aralik sinirli — tazeleme vardiya basina sorgu
   * demek ve sinirsiz bir tarih araligi ekrani kilitlerdi.
   */
  @Get()
  async list(
    @Query('driver_id') driverId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: BreakCandidateStatus,
  ) {
    const from = parseDay(dateFrom, 'date_from');
    const to = parseDay(dateTo, 'date_to');

    if (from && to) {
      if (to < from) {
        throw new BadRequestException({ code: 'date_to_before_date_from' });
      }
      const days = (to.getTime() - from.getTime()) / 86_400_000;
      if (days > MAX_RANGE_DAYS) {
        throw new BadRequestException({ code: 'date_range_too_wide' });
      }
    }

    if (from && to) {
      // `to` gun BASI olarak ayristirildi; o gunun tamami kapsansin diye bir
      // gun ileri kaydiriliyor.
      const toExclusive = new Date(to);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      await this.candidates.syncRange({ driverId, from, to: toExclusive });
    }

    const candidates = await this.candidates.listForOffice({
      driverId,
      dateFrom: from,
      dateTo: to
        ? new Date(new Date(to).setUTCDate(to.getUTCDate() + 1))
        : undefined,
      status,
    });

    return { candidates };
  }

  @Post(':id/confirm')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    const candidate = await this.candidates.confirm(id, {
      userId: actorUserId,
      source: WorkTimeEventSource.office,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'work_time.break_candidate_confirmed',
      entityType: 'break_candidate',
      entityId: candidate.id,
      summary: `Tachograph rest ${candidate.startedAt} – ${candidate.endedAt} recorded as a break`,
      metadata: {
        driverId: candidate.driverId,
        workSessionId: candidate.workSessionId,
        durationMinutes: candidate.durationMinutes,
        reason: 'tachograph_reconciliation',
      },
    });

    return candidate;
  }

  @Post(':id/dismiss')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async dismiss(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    const candidate = await this.candidates.dismiss(id, {
      userId: actorUserId,
      source: WorkTimeEventSource.office,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'work_time.break_candidate_dismissed',
      entityType: 'break_candidate',
      entityId: candidate.id,
      summary: `Tachograph rest ${candidate.startedAt} – ${candidate.endedAt} rejected as a break`,
      metadata: {
        driverId: candidate.driverId,
        workSessionId: candidate.workSessionId,
        durationMinutes: candidate.durationMinutes,
      },
    });

    return candidate;
  }
}
