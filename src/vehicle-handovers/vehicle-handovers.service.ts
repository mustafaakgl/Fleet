import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleHandoverDto } from './dto/create-vehicle-handover.dto';
import { UpdateVehicleHandoverDto } from './dto/update-vehicle-handover.dto';

type HandoverType = 'pickup' | 'return';
type HandoverPhotoStatus = 'not_required' | 'missing' | 'uploaded' | 'approved' | 'rejected';
type HandoverStatus = 'pending' | 'completed';

@Injectable()
export class VehicleHandoversService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureDate(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid handoverDateTime');
    }
    return parsed;
  }

  private ensureHandoverType(value: string): HandoverType {
    if (value !== 'pickup' && value !== 'return') {
      throw new BadRequestException('Invalid handoverType');
    }
    return value;
  }

  private ensurePhotoStatus(value: string): HandoverPhotoStatus {
    if (!['not_required', 'missing', 'uploaded', 'approved', 'rejected'].includes(value)) {
      throw new BadRequestException('Invalid photoStatus');
    }
    return value as HandoverPhotoStatus;
  }

  private ensureHandoverStatus(value: string): HandoverStatus {
    if (!['pending', 'completed'].includes(value)) {
      throw new BadRequestException('Invalid handover status');
    }
    return value as HandoverStatus;
  }

  private parseAssignmentDateTime(workDate: Date, startTime: string): Date {
    const datePart = new Date(workDate);
    datePart.setHours(0, 0, 0, 0);

    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
    if (!timeMatch) {
      return new Date();
    }

    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
      return new Date();
    }

    datePart.setHours(hours, minutes, 0, 0);
    return datePart;
  }

  calculatePhotoRequirement(previousVehicleId: string | null | undefined, currentVehicleId: string): {
    photoRequired: boolean;
    photoStatus: HandoverPhotoStatus;
    status: HandoverStatus;
  } {
    const sameVehicle = Boolean(previousVehicleId) && previousVehicleId === currentVehicleId;

    if (sameVehicle) {
      return {
        photoRequired: false,
        photoStatus: 'not_required',
        status: 'completed',
      };
    }

    return {
      photoRequired: true,
      photoStatus: 'missing',
      status: 'pending',
    };
  }

  async createHandover(dto: CreateVehicleHandoverDto) {
    const handoverDateTime = this.ensureDate(dto.handoverDateTime);
    const handoverType = this.ensureHandoverType(dto.handoverType);

    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (dto.previousVehicleId) {
      const previousVehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.previousVehicleId },
        select: { id: true },
      });
      if (!previousVehicle) {
        throw new NotFoundException('Previous vehicle not found');
      }
    }

    if (dto.assignmentId) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: dto.assignmentId },
        select: { id: true },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }
    }

    const rule = this.calculatePhotoRequirement(dto.previousVehicleId ?? null, dto.vehicleId);

    const db = this.prisma as any;
    return db.vehicleHandover.create({
      data: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        previousVehicleId: dto.previousVehicleId ?? null,
        assignmentId: dto.assignmentId ?? null,
        handoverType,
        handoverDateTime,
        photoRequired: rule.photoRequired,
        photoStatus: rule.photoStatus,
        damageDetected: dto.damageDetected ?? false,
        damageNotes: dto.damageNotes ?? null,
        status: rule.status,
        notes: dto.notes ?? null,
      },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });
  }

  async createHandoverFromAssignment(assignmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const assignment = await db.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          driver: true,
          vehicle: true,
        },
      });

      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }

      const previousAssignment = await db.assignment.findFirst({
        where: {
          driverId: assignment.driverId,
          workDate: {
            lt: assignment.workDate,
          },
        },
        orderBy: [
          { workDate: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      const previousVehicleId = previousAssignment?.vehicleId ?? null;
      const rule = this.calculatePhotoRequirement(previousVehicleId, assignment.vehicleId);
      const handoverDateTime = this.parseAssignmentDateTime(assignment.workDate, assignment.startTime);

      return db.vehicleHandover.create({
        data: {
          driverId: assignment.driverId,
          vehicleId: assignment.vehicleId,
          previousVehicleId,
          assignmentId: assignment.id,
          handoverType: 'pickup',
          handoverDateTime,
          photoRequired: rule.photoRequired,
          photoStatus: rule.photoStatus,
          damageDetected: false,
          status: rule.status,
        },
        include: {
          driver: true,
          vehicle: true,
          assignment: true,
        },
      });
    });
  }

  async listHandovers(filters: {
    driverId?: string;
    vehicleId?: string;
    assignmentId?: string;
    status?: string;
    photoStatus?: string;
    date?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.driverId) {
      where.driverId = filters.driverId;
    }
    if (filters.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }
    if (filters.assignmentId) {
      where.assignmentId = filters.assignmentId;
    }
    if (filters.status) {
      where.status = this.ensureHandoverStatus(filters.status);
    }
    if (filters.photoStatus) {
      where.photoStatus = this.ensurePhotoStatus(filters.photoStatus);
    }
    if (filters.date) {
      const day = this.ensureDate(filters.date);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      where.handoverDateTime = {
        gte: start,
        lte: end,
      };
    }

    const db = this.prisma as any;
    return db.vehicleHandover.findMany({
      where,
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
      orderBy: {
        handoverDateTime: 'desc',
      },
    });
  }

  async getHandoverById(handoverId: string) {
    const db = this.prisma as any;
    const handover = await db.vehicleHandover.findUnique({
      where: { id: handoverId },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });

    if (!handover) {
      throw new NotFoundException('Vehicle handover not found');
    }

    return handover;
  }

  async updateHandover(handoverId: string, dto: UpdateVehicleHandoverDto) {
    await this.getHandoverById(handoverId);

    const payload: Record<string, unknown> = {};

    if (dto.photoStatus !== undefined) {
      payload.photoStatus = this.ensurePhotoStatus(dto.photoStatus);
    }

    if (dto.damageDetected !== undefined) {
      payload.damageDetected = dto.damageDetected;
    }

    if (dto.damageNotes !== undefined) {
      payload.damageNotes = dto.damageNotes;
    }

    if (dto.status !== undefined) {
      payload.status = this.ensureHandoverStatus(dto.status);
    }

    if (dto.notes !== undefined) {
      payload.notes = dto.notes;
    }

    const db = this.prisma as any;
    return db.vehicleHandover.update({
      where: { id: handoverId },
      data: payload,
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });
  }

  async approvePhoto(handoverId: string) {
    const handover = await this.getHandoverById(handoverId);

    if (handover.photoStatus !== 'uploaded') {
      throw new BadRequestException('Photo can only be approved when status is uploaded');
    }

    const db = this.prisma as any;
    return db.vehicleHandover.update({
      where: { id: handoverId },
      data: {
        photoStatus: 'approved',
        status: 'completed',
      },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });
  }

  async rejectPhoto(handoverId: string) {
    await this.getHandoverById(handoverId);

    const db = this.prisma as any;
    return db.vehicleHandover.update({
      where: { id: handoverId },
      data: {
        photoStatus: 'rejected',
        status: 'pending',
      },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });
  }

  async markCompleted(handoverId: string) {
    await this.getHandoverById(handoverId);

    const db = this.prisma as any;
    return db.vehicleHandover.update({
      where: { id: handoverId },
      data: {
        status: 'completed',
      },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
    });
  }
}
