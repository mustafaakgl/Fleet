import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomerCompanyIds } from './customer-companies.decorator';
import { CustomerAssignmentsService } from './customer-assignments.service';
import { CustomerMessagesService } from './customer-messages.service';
import { CustomerProofsService } from './customer-proofs.service';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';
import { CustomerTenantGuard } from './customer-tenant.guard';
import {
  CUSTOMER_PROOF_MAX_BYTES,
  CUSTOMER_PROOF_UPLOAD_INTERCEPTOR,
  type CustomerUploadedFile,
} from './customer-upload.config';
import { CustomerPortalService } from './customer-portal.service';
import type { CustomerTenantRequest } from './customer-portal.types';
import { ListCustomerAssignmentsQueryDto } from './dto/list-customer-assignments-query.dto';

@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard, CustomerTenantGuard)
@Roles('customer')
export class CustomerPortalController {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly customerAssignmentsService: CustomerAssignmentsService,
    private readonly customerProofsService: CustomerProofsService,
    private readonly customerMessagesService: CustomerMessagesService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser, @Req() req: CustomerTenantRequest) {
    return this.customerPortalService.getMe(user.id, req.customerCompanies ?? []);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser, @CustomerCompanyIds() companyIds: string[]) {
    return this.customerAssignmentsService.getDashboard(user.id, companyIds);
  }

  @Get('assignments')
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Query() query: ListCustomerAssignmentsQueryDto,
  ) {
    return this.customerAssignmentsService.listAssignments(user.id, companyIds, query);
  }

  @Get('assignments/:id')
  getAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('id') assignmentId: string,
  ) {
    return this.customerAssignmentsService.getAssignmentById(user.id, companyIds, assignmentId);
  }

  @Get('assignments/:id/proofs')
  listProofs(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('id') assignmentId: string,
  ) {
    return this.customerProofsService.listProofs(assignmentId, companyIds, user.id);
  }

  @Post('assignments/:id/proofs')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(CUSTOMER_PROOF_UPLOAD_INTERCEPTOR)
  uploadProof(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('id') assignmentId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: CUSTOMER_PROOF_MAX_BYTES })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: CustomerUploadedFile,
    @Body('notes') notes?: string,
  ) {
    return this.customerProofsService.uploadProof(
      assignmentId,
      companyIds,
      user.id,
      { originalname: file.originalname, filename: file.filename },
      notes,
    );
  }

  @Get('assignments/:assignmentId/proofs/:documentId/download')
  async downloadProof(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('assignmentId') assignmentId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const file = await this.customerProofsService.downloadProof(
      assignmentId,
      documentId,
      companyIds,
      user.id,
    );

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });

    file.stream.pipe(res);
  }

  @Get('assignments/:id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('id') assignmentId: string,
  ) {
    return this.customerMessagesService.listForCustomer(assignmentId, companyIds, user.id);
  }

  @Post('assignments/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @CustomerCompanyIds() companyIds: string[],
    @Param('id') assignmentId: string,
    @Body() dto: SendCustomerMessageDto,
  ) {
    return this.customerMessagesService.sendFromCustomer(
      assignmentId,
      companyIds,
      user.id,
      dto.body,
    );
  }
}
