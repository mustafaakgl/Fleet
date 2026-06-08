import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type EquipmentStatus = 'active' | 'retired';

@Injectable()
export class VehicleEquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  async listByVehicle(vehicleId: string, status?: EquipmentStatus) {
    await this.ensureVehicle(vehicleId);
    const where: Record<string, unknown> = { vehicleId };
    if (status) {
      where.status = status;
    }
    return this.prisma.vehicleEquipment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    vehicleId: string,
    data: { name: string; quantity?: number; serialNumber?: string; notes?: string },
  ) {
    await this.ensureVehicle(vehicleId);
    const name = data.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    return this.prisma.vehicleEquipment.create({
      data: {
        vehicleId,
        name,
        quantity: data.quantity ?? 1,
        serialNumber: data.serialNumber?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });
  }

  async update(
    vehicleId: string,
    equipmentId: string,
    data: {
      name?: string;
      quantity?: number;
      serialNumber?: string | null;
      notes?: string | null;
      status?: EquipmentStatus;
    },
  ) {
    await this.ensureVehicle(vehicleId);
    const existing = await this.prisma.vehicleEquipment.findFirst({
      where: { id: equipmentId, vehicleId },
    });
    if (!existing) {
      throw new NotFoundException('Equipment item not found');
    }

    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.quantity !== undefined) payload.quantity = data.quantity;
    if (data.serialNumber !== undefined) payload.serialNumber = data.serialNumber?.trim() || null;
    if (data.notes !== undefined) payload.notes = data.notes?.trim() || null;
    if (data.status !== undefined) payload.status = data.status;

    return this.prisma.vehicleEquipment.update({
      where: { id: equipmentId },
      data: payload,
    });
  }

  async remove(vehicleId: string, equipmentId: string) {
    await this.ensureVehicle(vehicleId);
    const existing = await this.prisma.vehicleEquipment.findFirst({
      where: { id: equipmentId, vehicleId },
    });
    if (!existing) {
      throw new NotFoundException('Equipment item not found');
    }
    await this.prisma.vehicleEquipment.delete({ where: { id: equipmentId } });
    return { id: equipmentId, deleted: true };
  }
}
