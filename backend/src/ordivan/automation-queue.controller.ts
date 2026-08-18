import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AUTOMATION_ROLES } from '../common/utils/permissions';
import { AutomationJobService } from './automation-job.service';
import { AutomationProposalService } from './automation-proposal.service';
import {
  CreateAutomationJobDto,
  DecideProposalDto,
  ListProposalsQueryDto,
} from './dto/ordivan.dto';

/**
 * Otomasyon kuyrugu — insan tarafi (Faz 12).
 *
 * ROL: `AUTOMATION_ROLES` (admin, boss).
 *
 * ONAY HICBIR DOMAIN KAYDI URETMEZ: ne Assignment, ne Tour, ne belge, ne
 * fatura. Yalnizca onerinin durumu degisir ve insanin ne yaptigi olculur.
 */
@Controller('ordivan/automation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUTOMATION_ROLES)
export class AutomationQueueController {
  constructor(
    private readonly jobs: AutomationJobService,
    private readonly proposals: AutomationProposalService,
  ) {}

  /** Is olusturma. Registry disi tur ya da surum BURADA duser. */
  @Post('jobs')
  @HttpCode(201)
  createJob(@CurrentUser('id') userId: string, @Body() dto: CreateAutomationJobDto) {
    return this.jobs.createJob(userId, dto);
  }

  @Get('proposals')
  list(@Query() query: ListProposalsQueryDto) {
    return this.proposals.list(query);
  }

  @Get('proposals/metrics')
  metrics() {
    return this.proposals.reviewMetrics();
  }

  @Get('proposals/:id')
  detail(@Param('id') id: string) {
    return this.proposals.detail(id);
  }

  /** Karar. Aciklama zorunlu, `expectedUpdatedAt` cakismayi engeller. */
  @Post('proposals/:id/decide')
  @HttpCode(200)
  decide(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: DecideProposalDto,
  ) {
    return this.proposals.decide(userId, id, dto);
  }
}
