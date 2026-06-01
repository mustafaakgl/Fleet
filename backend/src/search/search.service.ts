import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SearchType = 'driver' | 'vehicle' | 'company' | 'document' | 'assignment' | 'transport_request' | 'all';
type SearchResultType = Exclude<SearchType, 'all'>;

type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  relatedEntityType: string;
  relatedEntityId: string;
};

const ALLOWED_TYPES: SearchType[] = [
  'driver',
  'vehicle',
  'company',
  'document',
  'assignment',
  'transport_request',
  'all',
];

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeType(type?: string): SearchType {
    const normalized = (type ?? 'all').trim() as SearchType;
    if (!ALLOWED_TYPES.includes(normalized)) {
      throw new BadRequestException('Invalid search type');
    }
    return normalized;
  }

  private normalizeRole(role?: string): string {
    return (role ?? 'office').trim();
  }

  private formatDate(value: Date | null | undefined): string {
    if (!value) {
      return '-';
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  async search(query?: string, type?: string, role?: string) {
    const searchQuery = (query ?? '').trim();
    const normalizedRole = this.normalizeRole(role);

    if (normalizedRole === 'driver') {
      throw new ForbiddenException('Drivers are not allowed to use global search');
    }

    if (searchQuery.length < 2) {
      return {
        query: searchQuery,
        results: [] as SearchResult[],
      };
    }

    const normalizedType = this.normalizeType(type);

    const buckets: SearchResult[][] = [];

    if (normalizedType === 'driver' || normalizedType === 'all') {
      buckets.push(await this.searchDrivers(searchQuery));
    }
    if (normalizedType === 'vehicle' || normalizedType === 'all') {
      buckets.push(await this.searchVehicles(searchQuery));
    }
    if (normalizedType === 'company' || normalizedType === 'all') {
      buckets.push(await this.searchCompanies(searchQuery));
    }
    if (normalizedType === 'document' || normalizedType === 'all') {
      buckets.push(await this.searchDocuments(searchQuery));
    }
    if (normalizedType === 'assignment' || normalizedType === 'all') {
      buckets.push(await this.searchAssignments(searchQuery));
    }
    if (normalizedType === 'transport_request' || normalizedType === 'all') {
      buckets.push(await this.searchTransportRequests(searchQuery));
    }

    const results = buckets.flat().slice(0, 20);

    return {
      query: searchQuery,
      results,
    };
  }

  async searchDrivers(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.driver.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
      },
    });

    return rows.map((row: any) => ({
      type: 'driver' as const,
      id: row.id,
      title: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || 'Unknown driver',
      subtitle: row.phone || `Status: ${row.status}`,
      relatedEntityType: 'driver',
      relatedEntityId: row.id,
    }));
  }

  async searchVehicles(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.vehicle.findMany({
      where: {
        OR: [
          { plateNumber: { contains: query, mode: 'insensitive' } },
          { internalCode: { contains: query, mode: 'insensitive' } },
          { vin: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: [{ plateNumber: 'asc' }],
      select: {
        id: true,
        plateNumber: true,
        internalCode: true,
        status: true,
      },
    });

    return rows.map((row: any) => ({
      type: 'vehicle' as const,
      id: row.id,
      title: row.plateNumber,
      subtitle: row.internalCode || `Status: ${row.status}`,
      relatedEntityType: 'vehicle',
      relatedEntityId: row.id,
    }));
  }

  async searchCompanies(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.company.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { contactPerson: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        contactPerson: true,
        email: true,
      },
    });

    return rows.map((row: any) => ({
      type: 'company' as const,
      id: row.id,
      title: row.name,
      subtitle: row.contactPerson || row.email || '-',
      relatedEntityType: 'company',
      relatedEntityId: row.id,
    }));
  }

  async searchDocuments(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.document.findMany({
      where: {
        OR: [
          { fileName: { contains: query, mode: 'insensitive' } },
          { documentType: { contains: query, mode: 'insensitive' } },
          { notes: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        fileName: true,
        documentType: true,
        status: true,
      },
    });

    return rows.map((row: any) => ({
      type: 'document' as const,
      id: row.id,
      title: row.fileName,
      subtitle: `${row.documentType} - ${row.status}`,
      relatedEntityType: 'document',
      relatedEntityId: row.id,
    }));
  }

  async searchAssignments(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.assignment.findMany({
      where: {
        OR: [
          { routeName: { contains: query, mode: 'insensitive' } },
          { cargoName: { contains: query, mode: 'insensitive' } },
          { cargoOwner: { contains: query, mode: 'insensitive' } },
          { pickupAddress: { contains: query, mode: 'insensitive' } },
          { deliveryAddress: { contains: query, mode: 'insensitive' } },
          { driver: { firstName: { contains: query, mode: 'insensitive' } } },
          { driver: { lastName: { contains: query, mode: 'insensitive' } } },
          { vehicle: { plateNumber: { contains: query, mode: 'insensitive' } } },
          { company: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true } },
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: [{ workDate: 'desc' }, { startTime: 'asc' }],
    });

    return rows.map((row: any) => ({
      type: 'assignment' as const,
      id: row.id,
      title: `${row.driver?.firstName ?? ''} ${row.driver?.lastName ?? ''}`.trim() +
        ` / ${row.vehicle?.plateNumber ?? '-'} / ${row.company?.name ?? '-'}`,
      subtitle: `${this.formatDate(row.workDate)} - ${row.status}`,
      relatedEntityType: 'assignment',
      relatedEntityId: row.id,
    }));
  }

  async searchTransportRequests(query: string): Promise<SearchResult[]> {
    const db = this.prisma as any;
    const rows = await db.transportRequest.findMany({
      where: {
        OR: [
          { cargoName: { contains: query, mode: 'insensitive' } },
          { cargoOwner: { contains: query, mode: 'insensitive' } },
          { pickupAddress: { contains: query, mode: 'insensitive' } },
          { deliveryAddress: { contains: query, mode: 'insensitive' } },
          { driver: { firstName: { contains: query, mode: 'insensitive' } } },
          { driver: { lastName: { contains: query, mode: 'insensitive' } } },
          { vehicle: { plateNumber: { contains: query, mode: 'insensitive' } } },
          { company: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true } },
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: [{ requestedDate: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row: any) => ({
      type: 'transport_request' as const,
      id: row.id,
      title: `${row.driver?.firstName ?? ''} ${row.driver?.lastName ?? ''}`.trim() + ` / ${row.company?.name ?? '-'}`,
      subtitle: `${this.formatDate(row.requestedDate)} - ${row.status}`,
      relatedEntityType: 'transport_request',
      relatedEntityId: row.id,
    }));
  }
}
