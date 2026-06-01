import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class RequestsController {
	constructor(private readonly requestsService: RequestsService) {}

	@Get()
	listRequests(
		@Query('driverId') driverId?: string,
		@Query('status') status?: string,
		@Query('type') type?: string,
		@Query('startDate') startDate?: string,
		@Query('endDate') endDate?: string,
	) {
		return this.requestsService.listRequests({
			driverId,
			status,
			type,
			startDate,
			endDate,
		});
	}

	@Get(':id')
	getRequestById(@Param('id') id: string) {
		return this.requestsService.getRequestById(id);
	}

	@Post()
	@Roles(...OPERATIONAL_WRITE_ROLES)
	createRequest(@Body() dto: CreateRequestDto) {
		return this.requestsService.createRequest(dto);
	}

	@Post(':id/approve')
	@Roles(...OPERATIONAL_WRITE_ROLES)
	approveRequest(@Param('id') id: string, @Body('currentUserId') currentUserId: string) {
		return this.requestsService.approveRequest(id, currentUserId);
	}

	@Post(':id/reject')
	@Roles(...OPERATIONAL_WRITE_ROLES)
	rejectRequest(@Param('id') id: string) {
		return this.requestsService.rejectRequest(id);
	}

	@Post(':id/cancel')
	@Roles(...OPERATIONAL_WRITE_ROLES)
	cancelRequest(@Param('id') id: string) {
		return this.requestsService.cancelRequest(id);
	}

	@Patch(':id')
	@Roles(...OPERATIONAL_WRITE_ROLES)
	updateRequest(@Param('id') id: string, @Body() dto: UpdateRequestDto) {
		return this.requestsService.updateRequest(id, dto);
	}
}
