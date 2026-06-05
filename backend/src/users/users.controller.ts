import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...ADMIN_ONLY_ROLES)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.users.list({ role, status, search });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.users.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string | undefined,
  ) {
    return this.users.create(dto, actorUserId, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.users.update(id, dto, actorUserId);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    return this.users.deactivate(id, actorUserId);
  }
}
