import { BadRequestException, Injectable } from '@nestjs/common';
import { DriverStatus, Prisma, UserRole, UserStatus, VehicleStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { DriversService } from '../drivers/drivers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { parseCsv, pickField } from './csv.util';

type ImportError = { row: number; message: string };
type ImportResult = {
  created: number;
  skipped: number;
  errors: ImportError[];
};

const DRIVER_STATUS_VALUES = new Set<string>([
  'active',
  'on_leave',
  'sick',
  'inactive',
  'terminated',
]);

const VEHICLE_STATUS_VALUES = new Set<string>([
  'active',
  'maintenance',
  'broken',
  'inactive',
]);

const USER_ROLE_VALUES = new Set<string>(['office', 'accounting', 'boss']);

function generateImportPassword(): string {
  const suffix = randomBytes(12).toString('base64url');
  return `Import-${suffix}!9a`;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
    private readonly vehiclesService: VehiclesService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async importDriversCsv(fileContent: string, actorUserId?: string): Promise<ImportResult> {
    const { rows } = parseCsv(fileContent);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const firstName = pickField(row, ['first_name', 'firstname', 'vorname']);
        const lastName = pickField(row, ['last_name', 'lastname', 'nachname']);
        if (!firstName || !lastName) {
          result.errors.push({ row: rowNumber, message: 'first_name and last_name are required' });
          continue;
        }

        const employeeNumber = pickField(row, ['employee_number', 'personalnummer']);
        const email = pickField(row, ['email', 'e-mail']);
        const phone = pickField(row, ['phone', 'telefon']);
        const licenseNumber = pickField(row, ['license_number', 'fuehrerschein', 'führerschein']);
        const licenseExpiry = pickField(row, ['license_expiry_date', 'license_expiry', 'fuehrerschein_ablauf']);
        const statusRaw = pickField(row, ['status']) || 'active';
        const status = DRIVER_STATUS_VALUES.has(statusRaw) ? (statusRaw as DriverStatus) : 'active';

        if (!licenseNumber || !licenseExpiry) {
          result.errors.push({
            row: rowNumber,
            message: 'license_number and license_expiry_date are required',
          });
          continue;
        }

        if (employeeNumber) {
          const existing = await this.prisma.driver.findFirst({
            where: { employeeNumber },
            select: { id: true },
          });
          if (existing) {
            result.skipped += 1;
            continue;
          }
        }

        await this.driversService.create(
          {
            first_name: firstName,
            last_name: lastName,
            employee_number: employeeNumber || undefined,
            email: email || undefined,
            phone: phone || undefined,
            license_number: licenseNumber,
            license_expiry_date: licenseExpiry,
            status,
          },
          actorUserId,
        );
        result.created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        result.errors.push({ row: rowNumber, message });
      }
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'import.drivers_csv',
      entityType: 'import',
      summary: 'Drivers CSV import completed',
      metadata: {
        created: result.created,
        skipped: result.skipped,
        error_count: result.errors.length,
      },
    });

    return result;
  }

  async importVehiclesCsv(fileContent: string, actorUserId?: string): Promise<ImportResult> {
    const { rows } = parseCsv(fileContent);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const plateNumber = pickField(row, ['plate_number', 'plate', 'kennzeichen']);
        const brand = pickField(row, ['brand', 'marke']);
        const model = pickField(row, ['model', 'modell']);
        if (!plateNumber || !brand || !model) {
          result.errors.push({
            row: rowNumber,
            message: 'plate_number, brand, and model are required',
          });
          continue;
        }

        const existing = await this.prisma.vehicle.findFirst({
          where: { plateNumber },
          select: { id: true },
        });
        if (existing) {
          result.skipped += 1;
          continue;
        }

        const yearRaw = pickField(row, ['year', 'baujahr']);
        const year = yearRaw ? Number(yearRaw) : undefined;
        const vin = pickField(row, ['vin', 'fin']);
        const internalCode = pickField(row, ['internal_code', 'interner_code']);
        const statusRaw = pickField(row, ['status']) || 'active';
        const status = VEHICLE_STATUS_VALUES.has(statusRaw) ? (statusRaw as VehicleStatus) : 'active';
        const tuvExpiry = pickField(row, ['tuv_expiry_date', 'tuv_ablauf']);
        const spExpiry = pickField(row, ['sp_expiry_date', 'sp_ablauf']);

        await this.vehiclesService.create(
          {
            plate_number: plateNumber,
            brand,
            model,
            year: Number.isFinite(year) ? year : undefined,
            vin: vin || undefined,
            internal_code: internalCode || undefined,
            status,
            tuv_expiry_date: tuvExpiry || undefined,
            sp_expiry_date: spExpiry || undefined,
          },
          actorUserId,
        );
        result.created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        result.errors.push({ row: rowNumber, message });
      }
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'import.vehicles_csv',
      entityType: 'import',
      summary: 'Vehicles CSV import completed',
      metadata: {
        created: result.created,
        skipped: result.skipped,
        error_count: result.errors.length,
      },
    });

    return result;
  }

  async importCompaniesCsv(fileContent: string, actorUserId?: string): Promise<ImportResult> {
    const { rows } = parseCsv(fileContent);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const name = pickField(row, ['name', 'firma', 'company']);
        if (!name) {
          result.errors.push({ row: rowNumber, message: 'name is required' });
          continue;
        }

        const email = pickField(row, ['email', 'e-mail']);
        const companyOr: Prisma.CompanyWhereInput[] = [
          { name: { equals: name, mode: Prisma.QueryMode.insensitive } },
        ];
        if (email) {
          companyOr.push({ email: { equals: email, mode: Prisma.QueryMode.insensitive } });
        }

        const existing = await this.prisma.company.findFirst({
          where: { OR: companyOr },
          select: { id: true },
        });
        if (existing) {
          result.skipped += 1;
          continue;
        }

        const revenueRaw = pickField(row, ['default_daily_revenue', 'tagesumsatz']);
        const revenue = revenueRaw ? Number(revenueRaw) : undefined;

        await this.companiesService.create(
          {
            name,
            email: email || undefined,
            phone: pickField(row, ['phone', 'telefon']) || undefined,
            address: pickField(row, ['address', 'adresse']) || undefined,
            contact_person: pickField(row, ['contact_person', 'ansprechpartner']) || undefined,
            default_daily_revenue: Number.isFinite(revenue) ? revenue : undefined,
            notes: pickField(row, ['notes', 'notizen']) || undefined,
          },
          actorUserId,
        );
        result.created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        result.errors.push({ row: rowNumber, message });
      }
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'import.companies_csv',
      entityType: 'import',
      summary: 'Companies CSV import completed',
      metadata: {
        created: result.created,
        skipped: result.skipped,
        error_count: result.errors.length,
      },
    });

    return result;
  }

  async importUsersCsv(fileContent: string, actorUserId?: string): Promise<ImportResult> {
    const { rows } = parseCsv(fileContent);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const fullName = pickField(row, ['full_name', 'name', 'vollstaendiger_name']);
        const email = pickField(row, ['email', 'e-mail']);
        if (!fullName || !email) {
          result.errors.push({ row: rowNumber, message: 'full_name and email are required' });
          continue;
        }

        const roleRaw = pickField(row, ['role']) || 'office';
        if (!USER_ROLE_VALUES.has(roleRaw)) {
          result.errors.push({
            row: rowNumber,
            message: 'role must be one of: office, accounting, boss',
          });
          continue;
        }

        const existing = await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: Prisma.QueryMode.insensitive } },
          select: { id: true },
        });
        if (existing) {
          result.skipped += 1;
          continue;
        }

        const statusRaw = pickField(row, ['status']) || 'active';
        const status = statusRaw === 'inactive' ? UserStatus.inactive : UserStatus.active;
        const password = pickField(row, ['password']) || generateImportPassword();

        await this.usersService.create(
          {
            full_name: fullName,
            email,
            password,
            role: roleRaw as UserRole,
            status,
            language: pickField(row, ['language', 'sprache']) || 'de',
          },
          actorUserId,
        );
        result.created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        result.errors.push({ row: rowNumber, message });
      }
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'import.users_csv',
      entityType: 'import',
      summary: 'Users CSV import completed',
      metadata: {
        created: result.created,
        skipped: result.skipped,
        error_count: result.errors.length,
      },
    });

    return result;
  }
}
