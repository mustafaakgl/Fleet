import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { CreateFuelEntryDto } from './dto/create-fuel-entry.dto';
import { CreateFuelEntryOfficeDto } from './dto/create-fuel-entry-office.dto';
import { FuelAnalyticsQueryDto } from './dto/fuel-analytics.query';
import { FleetFuelOverviewQueryDto } from './dto/fleet-fuel-overview.query';
import { ListFuelEntriesQueryDto } from './dto/list-fuel-entries.query';
import { FleetFuelService } from './fleet-fuel.service';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const FUEL_RECEIPT_UPLOAD_INTERCEPTOR = FileInterceptor('receipt', {
  storage: diskStorage({
    destination: DOCUMENT_UPLOAD_ABSOLUTE_DIR,
    filename: (_req, file, cb) => {
      const extension = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
        : '';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          'Unsupported receipt type. Allowed types: JPG, PNG, WEBP, PDF.',
        ) as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
});

type UploadedReceiptFile = {
  originalname: string;
  filename: string;
  mimetype: string;
};

@Controller('driver/fleet/fuel-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FleetFuelDriverController {
  constructor(private readonly fleetFuel: FleetFuelService) {}

  @Post()
  @UseInterceptors(FUEL_RECEIPT_UPLOAD_INTERCEPTOR)
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFuelEntryDto,
    @UploadedFile() receipt?: UploadedReceiptFile,
  ) {
    return this.fleetFuel.createFuelEntryForDriver(userId, dto, receipt);
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListFuelEntriesQueryDto) {
    return this.fleetFuel.listFuelEntriesForDriver(userId, query);
  }
}

@Controller('driver/fleet/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FleetFuelAnalyticsDriverController {
  constructor(private readonly fleetFuel: FleetFuelService) {}

  @Get(':vehicleId/fuel-analytics')
  getAnalytics(
    @CurrentUser('id') userId: string,
    @Param('vehicleId') vehicleId: string,
    @Query() query: FuelAnalyticsQueryDto,
  ) {
    return this.fleetFuel.getVehicleFuelAnalyticsForDriver(userId, vehicleId, query);
  }
}

@Controller('fleet/fuel-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetFuelOverviewController {
  constructor(private readonly fleetFuel: FleetFuelService) {}

  @Get()
  getOverview(@Query() query: FleetFuelOverviewQueryDto) {
    return this.fleetFuel.getFleetFuelOverview(query);
  }
}

@Controller('fleet/fuel-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetFuelController {
  constructor(private readonly fleetFuel: FleetFuelService) {}

  @Get()
  list(@Query() query: ListFuelEntriesQueryDto) {
    return this.fleetFuel.listFuelEntries(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.fleetFuel.getFuelEntryById(id);
  }

  @Post()
  create(@Body() dto: CreateFuelEntryOfficeDto) {
    return this.fleetFuel.createFuelEntry(dto);
  }
}

@Controller('fleet/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetVehicleFuelAnalyticsController {
  constructor(private readonly fleetFuel: FleetFuelService) {}

  @Get(':vehicleId/fuel-analytics')
  getAnalytics(
    @Param('vehicleId') vehicleId: string,
    @Query() query: FuelAnalyticsQueryDto,
  ) {
    return this.fleetFuel.getVehicleFuelAnalytics(vehicleId, query);
  }
}
