import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  IncidentStatus,
  IncidentType,
  MorningCheckinStatus,
  NotificationStatus,
  Prisma,
  RequestType,
  RequestStatus,
  TransportRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverMorningCheckinDto } from './dto/create-driver-morning-checkin.dto';
import { CreateDriverRequestDto } from './dto/create-driver-request.dto';
import { CreateDriverTransportRequestDto } from './dto/create-driver-transport-request.dto';
import { CreateDriverAccidentDto } from './dto/create-driver-accident.dto';
import { CreateDriverHandoverDto } from './dto/create-driver-handover.dto';
import { StorageService } from '../storage/storage.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { TrackingService } from '../tracking/tracking.service';
import type { SubmitLocationDto } from '../tracking/dto/submit-location.dto';

const assignmentInclude = {
  driver: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.AssignmentInclude;

const handoverInclude = {
  driver: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  assignment: { select: { id: true, workDate: true, startTime: true, endTime: true } },
} satisfies Prisma.VehicleHandoverInclude;

const requestInclude = {
  driver: { select: { id: true, firstName: true, lastName: true } },
  calendarEvents: { select: { id: true, date: true, status: true } },
} satisfies Prisma.RequestInclude;

const incidentInclude = {
  driver: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  company: { select: { id: true, name: true } },
  assignment: { select: { id: true, workDate: true } },
} satisfies Prisma.AccidentInclude;

const SUPPORTED_DRIVER_LANGUAGES = new Set(['de', 'tr', 'en', 'pl', 'nl', 'it', 'es', 'ru']);

@Injectable()
export class DriverMobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly tracking: TrackingService,
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

  private dayRange(value: string): { start: Date; end: Date } {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private ensureDateTime(value: string): Date {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException('Invalid datetime value');
    }
    return dt;
  }

  private async resolveDriver(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        language: true,
        status: true,
        fullName: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
        riskLevel: true,
        locationTrackingConsentAt: true,
        locationTrackingStatus: true,
      },
    });
    if (!driver) {
      throw new ForbiddenException('No driver profile linked to this user');
    }

    return { user, driver };
  }

  async me(userId: string) {
    const { user, driver } = await this.resolveDriver(userId);
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        language: user.language,
        status: user.status,
        fullName: user.fullName,
      },
      driver: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        email: driver.email,
        status: driver.status,
        riskLevel: driver.riskLevel,
      },
    };
  }

  async updatePreferredLanguage(userId: string, language: string) {
    if (!SUPPORTED_DRIVER_LANGUAGES.has(language)) {
      throw new BadRequestException('Unsupported language');
    }
    const { user } = await this.resolveDriver(userId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { language },
    });
    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.language_updated',
      entityType: 'user',
      entityId: user.id,
      summary: 'Driver preferred language updated',
      metadata: { language },
    });
    return this.me(userId);
  }

  async registerPushToken(userId: string, token: string) {
    const { user } = await this.resolveDriver(userId);
    const result = await this.pushNotifications.registerToken(user.id, token);
    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.push_token_registered',
      entityType: 'user',
      entityId: user.id,
      summary: 'Driver push token registered',
    });
    return result;
  }

  async clearPushToken(userId: string) {
    const { user } = await this.resolveDriver(userId);
    return this.pushNotifications.clearToken(user.id);
  }

  async grantLocationConsent(userId: string) {
    const { user, driver } = await this.resolveDriver(userId);
    const result = await this.tracking.grantLocationConsent(driver.id);

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.location_consent_granted',
      entityType: 'driver',
      entityId: driver.id,
      summary: 'Driver granted location tracking consent',
    });

    return result;
  }

  async getLocationStatus(userId: string) {
    const { driver } = await this.resolveDriver(userId);
    return this.tracking.getLocationStatus(driver);
  }

  async submitLocation(userId: string, dto: SubmitLocationDto) {
    const { user, driver } = await this.resolveDriver(userId);
    const result = await this.tracking.submitLocation(driver, dto);

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.location_submitted',
      entityType: 'driver',
      entityId: driver.id,
      summary: 'Driver location submitted',
      metadata: {
        vehicleId: result.vehicleId,
        deduplicated: result.deduplicated,
      },
    });

    return result;
  }

  async listTodayAssignments(userId: string, date?: string) {
    const { driver } = await this.resolveDriver(userId);
    const baseDate = date ?? new Date().toISOString();
    const { start, end } = this.dayRange(baseDate);

    const rows = await this.prisma.assignment.findMany({
      where: {
        driverId: driver.id,
        workDate: { gte: start, lt: end },
      },
      include: assignmentInclude,
      orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      driver: {
        id: row.driver.id,
        name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
      },
      vehicle: {
        id: row.vehicle.id,
        plateNumber: row.vehicle.plateNumber,
      },
      company: {
        id: row.company.id,
        name: row.company.name,
      },
      cargoName: row.cargoName,
      cargoOwner: row.cargoOwner,
      pickupAddress: row.pickupAddress,
      deliveryAddress: row.deliveryAddress,
      workDate: row.workDate.toISOString(),
      startTime: row.startTime,
      endTime: row.endTime,
      routeName: row.routeName,
      notes: row.notes,
      status: row.status,
    }));
  }

  async getAssignmentById(userId: string, assignmentId: string) {
    const { driver } = await this.resolveDriver(userId);
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: assignmentInclude,
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.driverId !== driver.id) {
      throw new ForbiddenException('You can only access your own assignments');
    }

    return {
      id: assignment.id,
      driver: {
        id: assignment.driver.id,
        name: `${assignment.driver.firstName} ${assignment.driver.lastName}`.trim(),
      },
      vehicle: {
        id: assignment.vehicle.id,
        plateNumber: assignment.vehicle.plateNumber,
      },
      company: {
        id: assignment.company.id,
        name: assignment.company.name,
      },
      cargoName: assignment.cargoName,
      cargoOwner: assignment.cargoOwner,
      pickupAddress: assignment.pickupAddress,
      deliveryAddress: assignment.deliveryAddress,
      workDate: assignment.workDate.toISOString(),
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      routeName: assignment.routeName,
      notes: assignment.notes,
      status: assignment.status,
    };
  }

  async listMorningCheckins(userId: string, date?: string) {
    const { driver } = await this.resolveDriver(userId);
    const where: Prisma.MorningCheckinWhereInput = { driverId: driver.id };
    if (date) {
      const { start, end } = this.dayRange(date);
      where.date = { gte: start, lt: end };
    }

    const rows = await this.prisma.morningCheckin.findMany({
      where,
      orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString(),
      submittedAt: row.submittedAt.toISOString(),
      vehiclePlate: row.vehiclePlate,
      companyName: row.companyName,
      status: row.status,
      conflictReason: row.conflictReason,
      assignmentId: row.assignmentId,
      notes: row.notes,
    }));
  }

  async createMorningCheckin(userId: string, dto: CreateDriverMorningCheckinDto) {
    const { driver } = await this.resolveDriver(userId);
    const { start, end } = this.dayRange(dto.date);
    const existing = await this.prisma.morningCheckin.findFirst({
      where: { driverId: driver.id, date: { gte: start, lt: end } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('A morning check-in already exists for this date');
    }

    const row = await this.prisma.morningCheckin.create({
      data: {
        driverId: driver.id,
        date: start,
        vehiclePlate: dto.vehiclePlate ?? null,
        companyName: dto.companyName ?? null,
        notes: dto.notes,
        status: MorningCheckinStatus.waiting_for_review,
      },
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'driver_mobile.morning_checkin_created',
      entityType: 'morning_checkin',
      entityId: row.id,
      summary: 'Driver morning check-in created',
      metadata: {
        driverId: driver.id,
        date: row.date.toISOString(),
        status: row.status,
      },
    });

    return {
      id: row.id,
      date: row.date.toISOString(),
      submittedAt: row.submittedAt.toISOString(),
      vehiclePlate: row.vehiclePlate,
      companyName: row.companyName,
      status: row.status,
      conflictReason: row.conflictReason,
      assignmentId: row.assignmentId,
      notes: row.notes,
    };
  }

  async listHandovers(
    userId: string,
    query: { status?: string; photoStatus?: string; date?: string },
  ) {
    const { driver } = await this.resolveDriver(userId);
    const where: Prisma.VehicleHandoverWhereInput = {
      driverId: driver.id,
    };
    if (query.status) {
      where.status = query.status as Prisma.EnumHandoverStatusFilter;
    }
    if (query.photoStatus) {
      where.photoStatus = query.photoStatus as Prisma.EnumHandoverPhotoStatusFilter;
    }
    if (query.date) {
      const { start, end } = this.dayRange(query.date);
      where.handoverDateTime = { gte: start, lt: end };
    }

    return this.prisma.vehicleHandover.findMany({
      where,
      include: handoverInclude,
      orderBy: { handoverDateTime: 'desc' },
    });
  }

  async createHandover(userId: string, dto: CreateDriverHandoverDto) {
    const { driver } = await this.resolveDriver(userId);

    if (dto.assignmentId) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: dto.assignmentId },
        select: { id: true, driverId: true, vehicleId: true, status: true },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }
      if (assignment.driverId !== driver.id) {
        throw new ForbiddenException('You can only create handovers for your assignments');
      }
      if (
        assignment.status === AssignmentStatus.cancelled ||
        assignment.status === AssignmentStatus.completed
      ) {
        throw new BadRequestException('Cannot create handover for completed/cancelled assignment');
      }
    }

    const handoverDateTime = dto.handoverDateTime
      ? this.ensureDateTime(dto.handoverDateTime)
      : new Date();

    const previousAssignment = await this.prisma.assignment.findFirst({
      where: {
        driverId: driver.id,
        workDate: { lt: handoverDateTime },
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      select: { vehicleId: true },
    });

    const previousVehicleId = dto.previousVehicleId ?? previousAssignment?.vehicleId ?? null;
    const sameVehicle = previousVehicleId === dto.vehicleId && previousVehicleId !== null;
    const photoRequired = !sameVehicle;

    return this.prisma.vehicleHandover.create({
      data: {
        driverId: driver.id,
        vehicleId: dto.vehicleId,
        previousVehicleId,
        assignmentId: dto.assignmentId,
        handoverType: dto.handoverType ?? 'pickup',
        handoverDateTime,
        damageDetected: dto.damageDetected ?? false,
        damageNotes: dto.damageNotes,
        notes: dto.notes,
        photoRequired,
        photoStatus: photoRequired ? 'missing' : 'not_required',
        status: photoRequired ? 'pending' : 'completed',
      },
      include: handoverInclude,
    });
  }

  async uploadHandoverPhoto(
    userId: string,
    handoverId: string,
    file: {
      originalname: string;
      filename: string;
    },
  ) {
    const { user, driver } = await this.resolveDriver(userId);
    const handover = await this.prisma.vehicleHandover.findUnique({
      where: { id: handoverId },
      select: { id: true, driverId: true },
    });
    if (!handover) {
      throw new NotFoundException('Vehicle handover not found');
    }
    if (handover.driverId !== driver.id) {
      throw new ForbiddenException('You can only upload photo for your own handovers');
    }

    const document = await this.prisma.document.create({
      data: {
        ownerType: 'vehicle_handover',
        ownerId: handoverId,
        documentType: 'handover_photo',
        fileName: file.originalname,
        fileUrl: this.storage.buildPublicUrl('documents', file.filename),
        uploadedById: user.id,
      },
    });

    const updatedHandover = await this.prisma.vehicleHandover.update({
      where: { id: handoverId },
      data: {
        photoStatus: 'uploaded',
        status: 'pending',
      },
      include: handoverInclude,
    });

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.handover_photo_uploaded',
      entityType: 'vehicle_handover',
      entityId: updatedHandover.id,
      summary: 'Driver uploaded handover photo',
      metadata: {
        handoverId,
        photoDocumentId: document.id,
        photoStatus: updatedHandover.photoStatus,
      },
    });

    return {
      handover: updatedHandover,
      photo: {
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
      },
    };
  }

  async listRequests(userId: string, status?: string, type?: string) {
    const { driver } = await this.resolveDriver(userId);
    const where: Prisma.RequestWhereInput = { driverId: driver.id };
    if (status) {
      where.status = status as RequestStatus;
    }
    if (type) {
      where.type = type as RequestType;
    }

    return this.prisma.request.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequest(userId: string, dto: CreateDriverRequestDto) {
    const { driver } = await this.resolveDriver(userId);
    const startDate = this.ensureDateTime(dto.startDate);
    const endDate = this.ensureDateTime(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const created = await this.prisma.request.create({
      data: {
        driverId: driver.id,
        type: dto.type,
        startDate,
        endDate,
        reason: dto.reason,
      },
      include: requestInclude,
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'driver_mobile.request_created',
      entityType: 'request',
      entityId: created.id,
      summary: 'Driver created request',
      metadata: {
        driverId: driver.id,
        type: created.type,
        status: created.status,
      },
    });

    return created;
  }

  async listTransportRequests(userId: string, status?: string) {
    const { driver } = await this.resolveDriver(userId);
    const where: Prisma.TransportRequestWhereInput = { driverId: driver.id };
    if (status && Object.values(TransportRequestStatus).includes(status as TransportRequestStatus)) {
      where.status = status as TransportRequestStatus;
    }

    const rows = await this.prisma.transportRequest.findMany({
      where,
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ requestedDate: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      companyId: row.companyId,
      vehicle: row.vehicle,
      company: row.company,
      cargoName: row.cargoName,
      cargoOwner: row.cargoOwner,
      pickupAddress: row.pickupAddress,
      deliveryAddress: row.deliveryAddress,
      requestedDate: row.requestedDate.toISOString().slice(0, 10),
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      conflictReason: row.conflictReason,
      assignmentId: row.assignmentId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getTransportFormOptions(userId: string) {
    const { driver } = await this.resolveDriver(userId);
    const baseDate = new Date().toISOString();
    const { start, end } = this.dayRange(baseDate);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId: driver.id,
        workDate: { gte: start, lt: end },
        status: { notIn: [AssignmentStatus.cancelled] },
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const vehicleMap = new Map<string, { id: string; plateNumber: string }>();
    const companyMap = new Map<string, { id: string; name: string }>();
    for (const assignment of assignments) {
      vehicleMap.set(assignment.vehicle.id, assignment.vehicle);
      companyMap.set(assignment.company.id, assignment.company);
    }

    return {
      vehicles: Array.from(vehicleMap.values()),
      companies: Array.from(companyMap.values()),
      assignments: assignments.map((row) => ({
        id: row.id,
        vehicleId: row.vehicle.id,
        companyId: row.company.id,
        vehiclePlate: row.vehicle.plateNumber,
        companyName: row.company.name,
        workDate: row.workDate.toISOString().slice(0, 10),
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    };
  }

  async createTransportRequest(userId: string, dto: CreateDriverTransportRequestDto) {
    const { driver } = await this.resolveDriver(userId);
    const requestedDate = this.ensureDateTime(dto.requestedDate);

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const created = await this.prisma.transportRequest.create({
      data: {
        driverId: driver.id,
        vehicleId: dto.vehicleId,
        companyId: dto.companyId,
        cargoName: dto.cargoName,
        cargoOwner: dto.cargoOwner,
        pickupAddress: dto.pickupAddress,
        deliveryAddress: dto.deliveryAddress,
        requestedDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plateNumber: true } },
        company: { select: { id: true, name: true } },
      },
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'driver_mobile.transport_request_created',
      entityType: 'transport_request',
      entityId: created.id,
      summary: 'Driver created transport request',
      metadata: {
        driverId: driver.id,
        status: created.status,
      },
    });

    return created;
  }

  async listAccidents(userId: string, type?: string, status?: string) {
    const { driver } = await this.resolveDriver(userId);
    const where: Prisma.AccidentWhereInput = { driverId: driver.id };
    if (type) {
      where.type = type as IncidentType;
    }
    if (status) {
      where.status = status as IncidentStatus;
    }

    return this.prisma.accident.findMany({
      where,
      include: incidentInclude,
      orderBy: { incidentDateTime: 'desc' },
    });
  }

  async createAccident(userId: string, dto: CreateDriverAccidentDto) {
    const { driver } = await this.resolveDriver(userId);

    const assignment = dto.assignmentId
      ? await this.prisma.assignment.findUnique({
          where: { id: dto.assignmentId },
          select: { id: true, driverId: true, vehicleId: true, companyId: true },
        })
      : null;

    if (dto.assignmentId && !assignment) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment && assignment.driverId !== driver.id) {
      throw new ForbiddenException('You can only report incidents for your assignments');
    }

    const vehicleId = dto.vehicleId ?? assignment?.vehicleId;
    if (!vehicleId) {
      throw new BadRequestException('vehicleId is required when assignmentId is not provided');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const companyId = dto.companyId ?? assignment?.companyId ?? null;

    const created = await this.prisma.accident.create({
      data: {
        type: dto.type,
        driverId: driver.id,
        vehicleId,
        assignmentId: dto.assignmentId,
        companyId,
        incidentDateTime: this.ensureDateTime(dto.incidentDateTime),
        location: dto.location,
        description: dto.description,
        cargoName: dto.cargoName,
        cargoOwner: dto.cargoOwner,
      },
      include: incidentInclude,
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'driver_mobile.incident_created',
      entityType: 'incident',
      entityId: created.id,
      summary: 'Driver created incident',
      metadata: {
        driverId: driver.id,
        type: created.type,
        status: created.status,
      },
    });

    return created;
  }

  async listNotifications(userId: string, status?: string) {
    await this.resolveDriver(userId);
    const where: Prisma.NotificationWhereInput = { userId };
    if (status) {
      where.status = status as NotificationStatus;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async unreadNotificationCount(userId: string) {
    await this.resolveDriver(userId);
    const count = await this.prisma.notification.count({
      where: {
        userId,
        status: NotificationStatus.unread,
      },
    });
    return { count };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    await this.resolveDriver(userId);
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot mark another user notifications');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.read },
    });
  }

  async markAllNotificationsRead(userId: string) {
    await this.resolveDriver(userId);
    return this.prisma.notification.updateMany({
      where: {
        userId,
        status: NotificationStatus.unread,
      },
      data: {
        status: NotificationStatus.read,
      },
    });
  }
}
