import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomerCompanyIds } from './customer-companies.decorator';
import { CustomerAssignmentsService } from './customer-assignments.service';
import { CustomerTenantGuard } from './customer-tenant.guard';
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
}
