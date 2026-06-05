import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
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
	@RequiresWrite()
	createRequest(@Body() dto: CreateRequestDto, @CurrentUser('id') currentUserId?: string) {
		return this.requestsService.createRequest(dto, currentUserId);
	}

	@Post(':id/approve')
	@RequiresWrite()
	approveRequest(
		@Param('id') id: string,
		@Body('currentUserId') currentUserId: string,
		@CurrentUser('id') actorUserId?: string,
	) {
		return this.requestsService.approveRequest(id, currentUserId, actorUserId);
	}

	@Post(':id/reject')
	@RequiresWrite()
	rejectRequest(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
		return this.requestsService.rejectRequest(id, currentUserId);
	}

	@Post(':id/cancel')
	@RequiresWrite()
	cancelRequest(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
		return this.requestsService.cancelRequest(id, currentUserId);
	}

	@Patch(':id')
	@RequiresWrite()
	updateRequest(@Param('id') id: string, @Body() dto: UpdateRequestDto, @CurrentUser('id') currentUserId?: string) {
		return this.requestsService.updateRequest(id, dto, currentUserId);
	}
}
