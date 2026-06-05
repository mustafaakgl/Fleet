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
import { OperationalNotifyService } from '../notifications/operational-notify.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { TrackingService } from '../tracking/tracking.service';
import type { SubmitLocationDto } from '../tracking/dto/submit-location.dto';
import {
  allRequiredHandoverPhotosUploaded,
  findYesterdayVehicleId,
  calculatePhotoRequirement,
  handoverPhotoDocumentType,
  HANDOVER_PHOTO_SLOTS,
  loadHandoverPhotosBySlot,
  missingHandoverPhotoSlots,
  parseHandoverPhotoSlot,
} from '../vehicle-handovers/handover-photo.util';
import { dedupeDriverDayAssignments } from '../assignments/assignment-dedupe';
import { MAX_REQUEST_ATTACHMENTS } from './driver-upload.config';
import {
  loadRequestAttachmentsByOwner,
  requestAttachmentDocumentType,
} from './request-attachments.util';
import { DocumentsService } from '../documents/documents.service';
import { UploadDriverDocumentDto } from './dto/upload-driver-document.dto';
import {
  DRIVER_REQUIRED_DOCUMENT_TYPES,
  DRIVER_UPLOAD_DOCUMENT_TYPES,
  isDriverUploadDocumentType,
} from './driver-document-types';

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
    private readonly operationalNotify: OperationalNotifyService,
    private readonly tracking: TrackingService,
    private readonly documentsService: DocumentsService,
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

  private localCalendarDateString(base = new Date()): string {
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        locationSharingStartedAt: true,
        locationSharingEndedAt: true,
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

  async startLocationSharing(userId: string) {
    const { user, driver } = await this.resolveDriver(userId);
    const result = await this.tracking.startLocationSharing(driver.id);
    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.location_sharing_started',
      entityType: 'driver',
      entityId: driver.id,
      summary: 'Driver started location sharing session',
    });
    return result;
  }

  async endLocationSharing(userId: string) {
    const { user, driver } = await this.resolveDriver(userId);
    const result = await this.tracking.endLocationSharing(driver.id);
    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.location_sharing_ended',
      entityType: 'driver',
      entityId: driver.id,
      summary: 'Driver ended location sharing session',
    });
    return result;
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
    const baseDate = date ?? this.localCalendarDateString();
    const { start, end } = this.dayRange(baseDate);

    await dedupeDriverDayAssignments(this.prisma, {
      driverId: driver.id,
      date: baseDate,
    });

    const rows = await this.prisma.assignment.findMany({
      where: {
        driverId: driver.id,
        workDate: { gte: start, lt: end },
        status: { not: AssignmentStatus.cancelled },
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
      cargoName: row.cargoName,
      cargoQuantity: row.cargoQuantity,
      status: row.status,
      conflictReason: row.conflictReason,
      assignmentId: row.assignmentId,
      notes: row.notes,
    }));
  }

  async createMorningCheckin(userId: string, dto: CreateDriverMorningCheckinDto) {
    const { driver } = await this.resolveDriver(userId);
    const driverWithConsent = await this.prisma.driver.findUniqueOrThrow({
      where: { id: driver.id },
      select: { id: true, locationTrackingConsentAt: true },
    });
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
        cargoName: dto.cargoName?.trim() || null,
        cargoQuantity: dto.cargoQuantity?.trim() || null,
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

    let locationSharing: Awaited<ReturnType<TrackingService['startLocationSharing']>> | null = null;
    if (driverWithConsent.locationTrackingConsentAt) {
      try {
        locationSharing = await this.tracking.startLocationSharing(driver.id);
      } catch {
        locationSharing = null;
      }
    }

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
      locationSharingStarted: locationSharing?.sharingActive ?? false,
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

    const rows = await this.prisma.vehicleHandover.findMany({
      where,
      include: handoverInclude,
      orderBy: { handoverDateTime: 'desc' },
    });

    return Promise.all(rows.map((row) => this.enrichHandover(row)));
  }

  async getHandover(userId: string, handoverId: string) {
    const { driver } = await this.resolveDriver(userId);
    const handover = await this.prisma.vehicleHandover.findUnique({
      where: { id: handoverId },
      include: handoverInclude,
    });
    if (!handover) {
      throw new NotFoundException('Vehicle handover not found');
    }
    if (handover.driverId !== driver.id) {
      throw new ForbiddenException('You can only view your own handovers');
    }

    return this.enrichHandover(handover);
  }

  private async enrichHandover(
    handover: Prisma.VehicleHandoverGetPayload<{ include: typeof handoverInclude }>,
  ) {
    const photos = await loadHandoverPhotosBySlot(this.prisma, handover.id);
    const missingSlots = missingHandoverPhotoSlots(handover.photoRequired, photos);

    return {
      ...handover,
      handoverDateTime: handover.handoverDateTime.toISOString(),
      requiredPhotoSlots: handover.photoRequired ? [...HANDOVER_PHOTO_SLOTS] : [],
      photos,
      missingSlots,
      photosComplete: allRequiredHandoverPhotosUploaded(handover.photoRequired, photos),
    };
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

    const yesterdayVehicleId =
      dto.previousVehicleId ?? (await findYesterdayVehicleId(this.prisma, driver.id, handoverDateTime));
    const rule = calculatePhotoRequirement(yesterdayVehicleId, dto.vehicleId);

    const created = await this.prisma.vehicleHandover.create({
      data: {
        driverId: driver.id,
        vehicleId: dto.vehicleId,
        previousVehicleId: yesterdayVehicleId,
        assignmentId: dto.assignmentId,
        handoverType: dto.handoverType ?? 'pickup',
        handoverDateTime,
        damageDetected: dto.damageDetected ?? false,
        damageNotes: dto.damageNotes,
        notes: dto.notes,
        photoRequired: rule.photoRequired,
        photoStatus: rule.photoStatus,
        status: rule.status,
      },
      include: handoverInclude,
    });

    return this.enrichHandover(created);
  }

  async uploadHandoverPhoto(
    userId: string,
    handoverId: string,
    slotValue: string,
    file: {
      originalname: string;
      filename: string;
    },
  ) {
    const { user, driver } = await this.resolveDriver(userId);
    const slot = parseHandoverPhotoSlot(slotValue);
    if (!slot) {
      throw new BadRequestException(
        `Invalid photo slot. Expected one of: ${HANDOVER_PHOTO_SLOTS.join(', ')}`,
      );
    }

    const handover = await this.prisma.vehicleHandover.findUnique({
      where: { id: handoverId },
      select: { id: true, driverId: true, photoRequired: true, photoStatus: true },
    });
    if (!handover) {
      throw new NotFoundException('Vehicle handover not found');
    }
    if (handover.driverId !== driver.id) {
      throw new ForbiddenException('You can only upload photo for your own handovers');
    }
    if (!handover.photoRequired) {
      throw new BadRequestException('Photos are not required for this handover');
    }

    const documentType = handoverPhotoDocumentType(slot);

    await this.prisma.document.deleteMany({
      where: {
        ownerType: 'vehicle_handover',
        ownerId: handoverId,
        documentType,
      },
    });

    const document = await this.prisma.document.create({
      data: {
        ownerType: 'vehicle_handover',
        ownerId: handoverId,
        documentType,
        fileName: file.originalname,
        fileUrl: this.storage.buildPublicUrl('documents', file.filename),
        uploadedById: user.id,
      },
    });

    const photos = await loadHandoverPhotosBySlot(this.prisma, handoverId);
    const photosComplete = allRequiredHandoverPhotosUploaded(handover.photoRequired, photos);

    const updatedHandover = await this.prisma.vehicleHandover.update({
      where: { id: handoverId },
      data: {
        photoStatus: photosComplete ? 'uploaded' : 'missing',
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
        slot,
        photoDocumentId: document.id,
        photoStatus: updatedHandover.photoStatus,
        photosComplete,
      },
    });

    const enriched = await this.enrichHandover(updatedHandover);

    return {
      handover: enriched,
      slot,
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

    const rows = await this.prisma.request.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });

    const attachmentMap = await loadRequestAttachmentsByOwner(
      this.prisma,
      'request',
      rows.map((row) => row.id),
    );

    return rows.map((row) => ({
      ...row,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      attachments: attachmentMap.get(row.id) ?? [],
    }));
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

    const driverName = `${driver.firstName} ${driver.lastName}`.trim();
    this.operationalNotify.notifyOperationalUsersSafely({
      key: 'driver_request_created',
      params: {
        driverName,
        requestType: created.type.replaceAll('_', ' '),
      },
      type: 'request',
      relatedEntityType: 'request',
      relatedEntityId: created.id,
      excludeUserId: userId,
    });

    return {
      ...created,
      startDate: created.startDate.toISOString(),
      endDate: created.endDate.toISOString(),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      attachments: [],
    };
  }

  async uploadLeaveRequestAttachment(
    userId: string,
    requestId: string,
    file: { originalname: string; filename: string },
  ) {
    const { user, driver } = await this.resolveDriver(userId);
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, driverId: true, type: true },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.driverId !== driver.id) {
      throw new ForbiddenException('You can only upload files for your own requests');
    }

    const existingCount = await this.prisma.document.count({
      where: {
        ownerType: 'request',
        ownerId: requestId,
        status: { not: 'archived' },
      },
    });
    if (existingCount >= MAX_REQUEST_ATTACHMENTS) {
      throw new BadRequestException(`Maximum ${MAX_REQUEST_ATTACHMENTS} attachments per request`);
    }

    const document = await this.documentsService.createUploadedDocument(
      {
        ownerType: 'request',
        ownerId: requestId,
        documentType: requestAttachmentDocumentType(existingCount),
        notes: `Attachment for ${request.type} request`,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: this.storage.buildPublicUrl('documents', file.filename),
      },
      user.id,
    );

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.request_attachment_uploaded',
      entityType: 'request',
      entityId: requestId,
      summary: 'Driver uploaded leave request attachment',
      metadata: { documentId: document.id, fileName: document.fileName },
    });

    return {
      id: document.id,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      attachmentCount: existingCount + 1,
    };
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

    const attachmentMap = await loadRequestAttachmentsByOwner(
      this.prisma,
      'transport_request',
      rows.map((row) => row.id),
    );

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
      attachments: attachmentMap.get(row.id) ?? [],
    }));
  }

  async getTransportFormOptions(userId: string) {
    const { driver } = await this.resolveDriver(userId);
    const { start, end } = this.dayRange(this.localCalendarDateString());

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

    const driverName = `${created.driver.firstName} ${created.driver.lastName}`.trim();
    this.operationalNotify.notifyOperationalUsersSafely({
      key: 'transport_request_created',
      params: {
        driverName,
        companyName: created.company.name,
        date: created.requestedDate.toISOString().slice(0, 10),
      },
      type: 'transport_request',
      relatedEntityType: 'transport_request',
      relatedEntityId: created.id,
      excludeUserId: userId,
    });

    return {
      id: created.id,
      driverId: created.driverId,
      vehicleId: created.vehicleId,
      companyId: created.companyId,
      vehicle: created.vehicle,
      company: created.company,
      cargoName: created.cargoName,
      cargoOwner: created.cargoOwner,
      pickupAddress: created.pickupAddress,
      deliveryAddress: created.deliveryAddress,
      requestedDate: created.requestedDate.toISOString().slice(0, 10),
      startTime: created.startTime,
      endTime: created.endTime,
      status: created.status,
      conflictReason: created.conflictReason,
      assignmentId: created.assignmentId,
      createdAt: created.createdAt.toISOString(),
      attachments: [],
    };
  }

  async uploadTransportRequestAttachment(
    userId: string,
    transportRequestId: string,
    file: { originalname: string; filename: string },
  ) {
    const { user, driver } = await this.resolveDriver(userId);
    const transportRequest = await this.prisma.transportRequest.findUnique({
      where: { id: transportRequestId },
      select: { id: true, driverId: true },
    });
    if (!transportRequest) {
      throw new NotFoundException('Transport request not found');
    }
    if (transportRequest.driverId !== driver.id) {
      throw new ForbiddenException('You can only upload files for your own transport requests');
    }

    const existingCount = await this.prisma.document.count({
      where: {
        ownerType: 'transport_request',
        ownerId: transportRequestId,
        status: { not: 'archived' },
      },
    });
    if (existingCount >= MAX_REQUEST_ATTACHMENTS) {
      throw new BadRequestException(`Maximum ${MAX_REQUEST_ATTACHMENTS} attachments per request`);
    }

    const document = await this.documentsService.createUploadedDocument(
      {
        ownerType: 'transport_request',
        ownerId: transportRequestId,
        documentType: requestAttachmentDocumentType(existingCount),
        notes: 'Attachment for transport request',
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: this.storage.buildPublicUrl('documents', file.filename),
      },
      user.id,
    );

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.transport_request_attachment_uploaded',
      entityType: 'transport_request',
      entityId: transportRequestId,
      summary: 'Driver uploaded transport request attachment',
      metadata: { documentId: document.id, fileName: document.fileName },
    });

    return {
      id: document.id,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      attachmentCount: existingCount + 1,
    };
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

  private mapDriverDocument(row: {
    id: string;
    documentType: string;
    fileName: string;
    fileUrl: string | null;
    status: string;
    expiryDate: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      documentType: row.documentType,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      status: row.status,
      expiryDate: row.expiryDate?.toISOString() ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listDriverDocuments(userId: string) {
    const { driver } = await this.resolveDriver(userId);
    const rows = await this.prisma.document.findMany({
      where: {
        ownerType: 'driver',
        ownerId: driver.id,
        status: { not: 'archived' },
      },
      orderBy: [{ documentType: 'asc' }, { updatedAt: 'desc' }],
    });

    const items = rows.map((row) => this.mapDriverDocument(row));
    const presentTypes = new Set(items.map((item) => item.documentType));
    const missingRequired = DRIVER_REQUIRED_DOCUMENT_TYPES.filter(
      (documentType) => !presentTypes.has(documentType),
    );

    return {
      uploadTypes: [...DRIVER_UPLOAD_DOCUMENT_TYPES],
      requiredTypes: [...DRIVER_REQUIRED_DOCUMENT_TYPES],
      missingRequired,
      items,
    };
  }

  async uploadDriverDocument(
    userId: string,
    dto: UploadDriverDocumentDto,
    file: { originalname: string; filename: string },
  ) {
    const { user, driver } = await this.resolveDriver(userId);
    if (!isDriverUploadDocumentType(dto.documentType)) {
      throw new BadRequestException(
        `Invalid document type. Allowed: ${DRIVER_UPLOAD_DOCUMENT_TYPES.join(', ')}`,
      );
    }

    await this.prisma.document.deleteMany({
      where: {
        ownerType: 'driver',
        ownerId: driver.id,
        documentType: dto.documentType,
        status: { not: 'archived' },
      },
    });

    const created = await this.documentsService.createUploadedDocument(
      {
        ownerType: 'driver',
        ownerId: driver.id,
        documentType: dto.documentType,
        expiryDate: dto.expiryDate,
        notes: dto.notes,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: this.storage.buildPublicUrl('documents', file.filename),
      },
      user.id,
    );

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'driver_mobile.document_uploaded',
      entityType: 'document',
      entityId: created.id,
      summary: 'Driver uploaded personal document',
      metadata: {
        driverId: driver.id,
        documentType: dto.documentType,
      },
    });

    return this.mapDriverDocument(created);
  }
}
