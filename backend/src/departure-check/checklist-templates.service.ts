import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { DEFAULT_CHECKLIST_ITEMS, DEFAULT_TEMPLATE_NAMES } from './departure-check.util';

@Injectable()
export class ChecklistTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultTemplates(tenantId: string) {
    const categories = Object.values(VehicleCategory);
    for (const category of categories) {
      const existing = await this.prisma.checklistTemplate.findFirst({
        where: { tenantId, vehicleCategory: category, isDefault: true, isActive: true },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.checklistTemplate.create({
        data: {
          tenantId,
          name: DEFAULT_TEMPLATE_NAMES[category],
          vehicleCategory: category,
          description: 'Standard-Abfahrtskontrolle',
          isDefault: true,
          isActive: true,
          items: {
            create: DEFAULT_CHECKLIST_ITEMS.map((item, index) => ({
              sortOrder: index,
              itemKey: item.itemKey,
              label: item.label,
              description: item.description,
              requiresPhotoOnDefect: item.requiresPhotoOnDefect ?? true,
            })),
          },
        },
      });
    }
  }

  async list(tenantId: string, query?: { vehicle_category?: VehicleCategory; active_only?: boolean }) {
    await this.ensureDefaultTemplates(tenantId);
    const where: Prisma.ChecklistTemplateWhereInput = { tenantId };
    if (query?.vehicle_category) where.vehicleCategory = query.vehicle_category;
    if (query?.active_only !== false) where.isActive = true;

    const rows = await this.prisma.checklistTemplate.findMany({
      where,
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ vehicleCategory: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.toClient(row));
  }

  async getById(id: string) {
    const row = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Checklist template not found');
    return this.toClient(row);
  }

  async resolveForVehicle(vehicleId: string, tenantId: string) {
    await this.ensureDefaultTemplates(tenantId);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, category: true, tenantId: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const template = await this.prisma.checklistTemplate.findFirst({
      where: {
        tenantId: vehicle.tenantId,
        vehicleCategory: vehicle.category,
        isActive: true,
        isDefault: true,
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('No checklist template configured for this vehicle category');
    }

    return template;
  }

  async create(tenantId: string, dto: CreateChecklistTemplateDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one checklist item is required');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.checklistTemplate.updateMany({
          where: { tenantId, vehicleCategory: dto.vehicle_category, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.checklistTemplate.create({
        data: {
          tenantId,
          name: dto.name,
          vehicleCategory: dto.vehicle_category,
          description: dto.description,
          isDefault: dto.is_default ?? false,
          isActive: dto.is_active ?? true,
          items: {
            create: dto.items.map((item) => ({
              sortOrder: item.sort_order,
              itemKey: item.item_key,
              label: item.label,
              description: item.description,
              requiresPhotoOnDefect: item.requires_photo_on_defect ?? true,
              isActive: item.is_active ?? true,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      return this.toClient(created);
    });
  }

  async update(id: string, dto: UpdateChecklistTemplateDto) {
    const existing = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, vehicleCategory: true },
    });
    if (!existing) throw new NotFoundException('Checklist template not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.checklistTemplate.updateMany({
          where: {
            tenantId: existing.tenantId,
            vehicleCategory: dto.vehicle_category ?? existing.vehicleCategory,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }

      await tx.checklistTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          vehicleCategory: dto.vehicle_category,
          description: dto.description,
          isDefault: dto.is_default,
          isActive: dto.is_active,
        },
      });

      if (dto.items) {
        if (!dto.items.length) {
          throw new BadRequestException('At least one checklist item is required');
        }

        const keepIds = dto.items.map((item) => item.id).filter(Boolean) as string[];
        if (keepIds.length) {
          await tx.checklistTemplateItem.deleteMany({
            where: { templateId: id, id: { notIn: keepIds } },
          });
        } else {
          await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
        }

        for (const item of dto.items) {
          if (item.id) {
            await tx.checklistTemplateItem.update({
              where: { id: item.id },
              data: {
                sortOrder: item.sort_order,
                itemKey: item.item_key,
                label: item.label,
                description: item.description,
                requiresPhotoOnDefect: item.requires_photo_on_defect ?? true,
                isActive: item.is_active ?? true,
              },
            });
          } else {
            await tx.checklistTemplateItem.create({
              data: {
                templateId: id,
                sortOrder: item.sort_order,
                itemKey: item.item_key,
                label: item.label,
                description: item.description,
                requiresPhotoOnDefect: item.requires_photo_on_defect ?? true,
                isActive: item.is_active ?? true,
              },
            });
          }
        }
      }

      const row = await tx.checklistTemplate.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      return this.toClient(row!);
    });
  }

  private toClient(
    row: Prisma.ChecklistTemplateGetPayload<{ include: { items: true } }>,
  ) {
    return {
      id: row.id,
      name: row.name,
      vehicle_category: row.vehicleCategory,
      description: row.description,
      is_default: row.isDefault,
      is_active: row.isActive,
      items: row.items.map((item) => ({
        id: item.id,
        item_key: item.itemKey,
        label: item.label,
        description: item.description,
        sort_order: item.sortOrder,
        requires_photo_on_defect: item.requiresPhotoOnDefect,
        is_active: item.isActive,
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
