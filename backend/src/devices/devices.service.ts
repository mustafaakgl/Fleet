import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceModel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

type DeviceStatus = 'online' | 'offline' | 'never';

const ONLINE_WINDOW_MS = 30 * 60 * 1000;

function normalizeImei(raw: string): string {
  return raw.trim();
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.device.findMany({
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    });

    return rows.map((row) => this.toClientRow(row));
  }

  async listUnassigned() {
    const rows = await this.prisma.device.findMany({
      where: {
        vehicleId: null,
        lastSeenAt: { not: null },
      },
      orderBy: { lastSeenAt: 'desc' },
      include: {
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    });

    return rows.map((row) => this.toClientRow(row));
  }

  async create(dto: CreateDeviceDto) {
    const imei = normalizeImei(dto.imei);

    if (dto.vehicleId) {
      await this.assertVehicleExists(dto.vehicleId);
    }

    try {
      const row = await this.prisma.device.create({
        data: {
          imei,
          model: dto.model,
          vehicleId: dto.vehicleId ?? null,
        },
        include: {
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
            },
          },
        },
      });

      return this.toClientRow(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        throw new ConflictException('IMEI already exists in this tenant');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.assertDeviceExists(id);

    if (dto.vehicleId) {
      await this.assertVehicleExists(dto.vehicleId);
    }

    const data: Prisma.DeviceUpdateInput = {};
    if (dto.model !== undefined) {
      data.model = dto.model as DeviceModel;
    }
    if (dto.vehicleId !== undefined) {
      data.vehicle = dto.vehicleId
        ? { connect: { id: dto.vehicleId } }
        : { disconnect: true };
    }

    const row = await this.prisma.device.update({
      where: { id },
      data,
      include: {
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    });

    return this.toClientRow(row);
  }

  async remove(id: string) {
    await this.assertDeviceExists(id);

    await this.prisma.device.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertDeviceExists(id: string): Promise<void> {
    const exists = await this.prisma.device.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Device not found');
    }
  }

  private async assertVehicleExists(id: string): Promise<void> {
    const exists = await this.prisma.vehicle.findFirst({
      where: {
        id,
        deletedAt: null,
      } as Prisma.VehicleWhereInput,
      select: { id: true },
    } as any);

    if (!exists) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private toClientRow(row: {
    id: string;
    imei: string;
    model: DeviceModel;
    vehicleId: string | null;
    lastSeenAt: Date | null;
    vehicle?: { id: string; plateNumber: string } | null;
  }) {
    return {
      id: row.id,
      imei: row.imei,
      model: row.model,
      vehicleId: row.vehicleId,
      plateNumber: row.vehicle?.plateNumber ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      status: this.getStatus(row.lastSeenAt),
    };
  }

  private getStatus(lastSeenAt: Date | null): DeviceStatus {
    if (!lastSeenAt) {
      return 'never';
    }

    if (Date.now() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS) {
      return 'online';
    }

    return 'offline';
  }
}
