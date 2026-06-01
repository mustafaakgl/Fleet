import bcrypt from 'bcrypt';
import {
  AssignmentStatus,
  CalendarSource,
  CalendarStatus,
  CompanyEmailStatus,
  DocumentOwnerType,
  DocumentStatus,
  DriverStatus,
  HandoverPhotoStatus,
  HandoverStatus,
  HandoverType,
  IncidentStatus,
  IncidentType,
  MessageTranslationStatus,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  ReminderStatus,
  ReminderType,
  RequestStatus,
  RequestType,
  RiskLevel,
  TransportRequestStatus,
  UserRole,
  UserStatus,
  VehicleStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function atTime(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function upsertUser(params: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  status?: UserStatus;
  language?: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      fullName: params.fullName,
      passwordHash,
      role: params.role,
      status: params.status ?? UserStatus.active,
      language: params.language ?? 'de',
    },
    create: {
      fullName: params.fullName,
      email: params.email,
      passwordHash,
      role: params.role,
      status: params.status ?? UserStatus.active,
      language: params.language ?? 'de',
    },
  });
}

async function upsertDriver(params: {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiryDate?: Date;
  passportExpiryDate?: Date;
  status?: DriverStatus;
  riskLevel?: RiskLevel;
  notes?: string;
  userId?: string | null;
}) {
  return prisma.driver.upsert({
    where: { employeeNumber: params.employeeNumber },
    update: {
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      email: params.email,
      licenseNumber: params.licenseNumber,
      licenseExpiryDate: params.licenseExpiryDate,
      passportExpiryDate: params.passportExpiryDate,
      status: params.status ?? DriverStatus.active,
      riskLevel: params.riskLevel ?? RiskLevel.green,
      notes: params.notes,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
    },
    create: {
      ...(params.id ? { id: params.id } : {}),
      employeeNumber: params.employeeNumber,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      email: params.email,
      licenseNumber: params.licenseNumber,
      licenseExpiryDate: params.licenseExpiryDate,
      passportExpiryDate: params.passportExpiryDate,
      status: params.status ?? DriverStatus.active,
      riskLevel: params.riskLevel ?? RiskLevel.green,
      notes: params.notes,
      userId: params.userId ?? null,
    },
  });
}

async function upsertVehicle(params: {
  id?: string;
  plateNumber: string;
  internalCode: string;
  brand: string;
  model: string;
  year?: number;
  status?: VehicleStatus;
  tuvExpiryDate?: Date;
  spExpiryDate?: Date;
  insuranceExpiryDate?: Date;
  currentDriverId?: string | null;
  notes?: string;
}) {
  return prisma.vehicle.upsert({
    where: { plateNumber: params.plateNumber },
    update: {
      internalCode: params.internalCode,
      brand: params.brand,
      model: params.model,
      year: params.year,
      status: params.status ?? VehicleStatus.active,
      tuvExpiryDate: params.tuvExpiryDate,
      spExpiryDate: params.spExpiryDate,
      insuranceExpiryDate: params.insuranceExpiryDate,
      currentDriverId: params.currentDriverId ?? null,
      notes: params.notes,
    },
    create: {
      ...(params.id ? { id: params.id } : {}),
      plateNumber: params.plateNumber,
      internalCode: params.internalCode,
      brand: params.brand,
      model: params.model,
      year: params.year,
      status: params.status ?? VehicleStatus.active,
      tuvExpiryDate: params.tuvExpiryDate,
      spExpiryDate: params.spExpiryDate,
      insuranceExpiryDate: params.insuranceExpiryDate,
      currentDriverId: params.currentDriverId ?? null,
      notes: params.notes,
    },
  });
}

async function upsertCompany(params: {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  defaultDailyRevenue?: number;
  notes?: string;
}) {
  return prisma.company.upsert({
    where: { name: params.name },
    update: {
      email: params.email,
      phone: params.phone,
      address: params.address,
      contactPerson: params.contactPerson,
      defaultDailyRevenue: params.defaultDailyRevenue,
      notes: params.notes,
    },
    create: {
      ...(params.id ? { id: params.id } : {}),
      name: params.name,
      email: params.email,
      phone: params.phone,
      address: params.address,
      contactPerson: params.contactPerson,
      defaultDailyRevenue: params.defaultDailyRevenue,
      notes: params.notes,
    },
  });
}

async function upsertAssignment(params: {
  driverId: string;
  vehicleId: string;
  companyId: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  workDate: Date;
  startTime: string;
  endTime: string;
  routeName: string;
  status: AssignmentStatus;
  createdById: string;
  notes?: string;
}) {
  const existing = await prisma.assignment.findFirst({
    where: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      companyId: params.companyId,
      workDate: params.workDate,
      startTime: params.startTime,
      endTime: params.endTime,
      cargoName: params.cargoName,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.assignment.update({
      where: { id: existing.id },
      data: {
        cargoOwner: params.cargoOwner,
        pickupAddress: params.pickupAddress,
        deliveryAddress: params.deliveryAddress,
        routeName: params.routeName,
        status: params.status,
        createdById: params.createdById,
        notes: params.notes,
      },
    });
  }

  return prisma.assignment.create({
    data: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      companyId: params.companyId,
      cargoName: params.cargoName,
      cargoOwner: params.cargoOwner,
      pickupAddress: params.pickupAddress,
      deliveryAddress: params.deliveryAddress,
      workDate: params.workDate,
      startTime: params.startTime,
      endTime: params.endTime,
      routeName: params.routeName,
      status: params.status,
      createdById: params.createdById,
      notes: params.notes,
    },
  });
}

async function upsertDocument(params: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  documentType: string;
  fileName: string;
  fileUrl?: string;
  expiryDate?: Date;
  status: DocumentStatus;
  notes?: string;
  uploadedById?: string;
}) {
  const existing = await prisma.document.findFirst({
    where: {
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      documentType: params.documentType,
      fileName: params.fileName,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.document.update({
      where: { id: existing.id },
      data: {
        fileUrl: params.fileUrl,
        expiryDate: params.expiryDate,
        status: params.status,
        notes: params.notes,
        uploadedById: params.uploadedById ?? null,
      },
    });
  }

  return prisma.document.create({
    data: {
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      documentType: params.documentType,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      expiryDate: params.expiryDate,
      status: params.status,
      notes: params.notes,
      uploadedById: params.uploadedById ?? null,
    },
  });
}

async function upsertCalendarEvent(params: {
  driverId: string;
  date: Date;
  status: CalendarStatus;
  source: CalendarSource;
  assignmentId?: string;
  requestId?: string;
}) {
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      driverId: params.driverId,
      date: params.date,
      status: params.status,
      source: params.source,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.calendarEvent.update({
      where: { id: existing.id },
      data: {
        assignmentId: params.assignmentId ?? null,
        requestId: params.requestId ?? null,
      },
    });
  }

  return prisma.calendarEvent.create({
    data: {
      driverId: params.driverId,
      date: params.date,
      status: params.status,
      source: params.source,
      assignmentId: params.assignmentId,
      requestId: params.requestId,
    },
  });
}

async function upsertRequest(params: {
  driverId: string;
  type: RequestType;
  startDate: Date;
  endDate: Date;
  reason?: string;
  status: RequestStatus;
  approvedById?: string;
}) {
  const existing = await prisma.request.findFirst({
    where: {
      driverId: params.driverId,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.request.update({
      where: { id: existing.id },
      data: {
        reason: params.reason,
        status: params.status,
        approvedById: params.approvedById ?? null,
      },
    });
  }

  return prisma.request.create({
    data: {
      driverId: params.driverId,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason,
      status: params.status,
      approvedById: params.approvedById,
    },
  });
}

async function upsertTransportRequest(params: {
  driverId: string;
  vehicleId: string;
  companyId: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  requestedDate: Date;
  startTime: string;
  endTime: string;
  status: TransportRequestStatus;
  conflictReason?: string;
  assignmentId?: string | null;
}) {
  const existing = await prisma.transportRequest.findFirst({
    where: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      companyId: params.companyId,
      requestedDate: params.requestedDate,
      startTime: params.startTime,
      endTime: params.endTime,
      cargoName: params.cargoName,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.transportRequest.update({
      where: { id: existing.id },
      data: {
        cargoOwner: params.cargoOwner,
        pickupAddress: params.pickupAddress,
        deliveryAddress: params.deliveryAddress,
        status: params.status,
        conflictReason: params.conflictReason ?? null,
        assignmentId: params.assignmentId ?? null,
      },
    });
  }

  return prisma.transportRequest.create({
    data: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      companyId: params.companyId,
      cargoName: params.cargoName,
      cargoOwner: params.cargoOwner,
      pickupAddress: params.pickupAddress,
      deliveryAddress: params.deliveryAddress,
      requestedDate: params.requestedDate,
      startTime: params.startTime,
      endTime: params.endTime,
      status: params.status,
      conflictReason: params.conflictReason,
      assignmentId: params.assignmentId,
    },
  });
}

async function upsertVehicleHandover(params: {
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string | null;
  assignmentId?: string | null;
  handoverType: HandoverType;
  handoverDateTime: Date;
  photoRequired: boolean;
  photoStatus: HandoverPhotoStatus;
  damageDetected: boolean;
  damageNotes?: string;
  status: HandoverStatus;
  notes?: string;
}) {
  const existing = await prisma.vehicleHandover.findFirst({
    where: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      handoverType: params.handoverType,
      handoverDateTime: params.handoverDateTime,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.vehicleHandover.update({
      where: { id: existing.id },
      data: {
        previousVehicleId: params.previousVehicleId ?? null,
        assignmentId: params.assignmentId ?? null,
        photoRequired: params.photoRequired,
        photoStatus: params.photoStatus,
        damageDetected: params.damageDetected,
        damageNotes: params.damageNotes,
        status: params.status,
        notes: params.notes,
      },
    });
  }

  return prisma.vehicleHandover.create({
    data: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      previousVehicleId: params.previousVehicleId,
      assignmentId: params.assignmentId,
      handoverType: params.handoverType,
      handoverDateTime: params.handoverDateTime,
      photoRequired: params.photoRequired,
      photoStatus: params.photoStatus,
      damageDetected: params.damageDetected,
      damageNotes: params.damageNotes,
      status: params.status,
      notes: params.notes,
    },
  });
}

async function upsertAccident(params: {
  type: IncidentType;
  driverId: string;
  vehicleId: string;
  companyId?: string;
  assignmentId?: string;
  incidentDateTime: Date;
  location?: string;
  description: string;
  cargoName?: string;
  cargoOwner?: string;
  damageValue?: number;
  status: IncidentStatus;
}) {
  const existing = await prisma.accident.findFirst({
    where: {
      type: params.type,
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      incidentDateTime: params.incidentDateTime,
      description: params.description,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.accident.update({
      where: { id: existing.id },
      data: {
        companyId: params.companyId ?? null,
        assignmentId: params.assignmentId ?? null,
        location: params.location,
        cargoName: params.cargoName,
        cargoOwner: params.cargoOwner,
        damageValue: params.damageValue,
        status: params.status,
      },
    });
  }

  return prisma.accident.create({
    data: {
      type: params.type,
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      companyId: params.companyId,
      assignmentId: params.assignmentId,
      incidentDateTime: params.incidentDateTime,
      location: params.location,
      description: params.description,
      cargoName: params.cargoName,
      cargoOwner: params.cargoOwner,
      damageValue: params.damageValue,
      status: params.status,
    },
  });
}

async function upsertNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  status?: NotificationStatus;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      title: params.title,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.notification.update({
      where: { id: existing.id },
      data: {
        message: params.message,
        type: params.type,
        priority: params.priority,
        status: params.status ?? NotificationStatus.unread,
      },
    });
  }

  return prisma.notification.create({
    data: {
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type,
      priority: params.priority,
      status: params.status ?? NotificationStatus.unread,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
    },
  });
}

async function upsertReminder(params: {
  targetType: string;
  targetId: string;
  reminderType: ReminderType;
  title: string;
  description?: string;
  dueDate: Date;
  notifyBeforeDays: number;
  status?: ReminderStatus;
}) {
  const existing = await prisma.reminder.findFirst({
    where: {
      targetType: params.targetType,
      targetId: params.targetId,
      reminderType: params.reminderType,
      dueDate: params.dueDate,
      notifyBeforeDays: params.notifyBeforeDays,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.reminder.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        description: params.description,
        status: params.status ?? ReminderStatus.open,
      },
    });
  }

  return prisma.reminder.create({
    data: {
      targetType: params.targetType,
      targetId: params.targetId,
      reminderType: params.reminderType,
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
      notifyBeforeDays: params.notifyBeforeDays,
      status: params.status ?? ReminderStatus.open,
    },
  });
}

async function main(): Promise<void> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const adminUser = await upsertUser({
    fullName: 'Fleet Admin',
    email: 'admin@fleet.com',
    password: 'admin123',
    role: UserRole.admin,
  });

  const bossUser = await upsertUser({
    fullName: 'Fleet Boss',
    email: 'boss@fleet.com',
    password: 'boss123',
    role: UserRole.boss,
  });

  const accountingUser = await upsertUser({
    fullName: 'Fleet Accounting',
    email: 'accounting@fleet.com',
    password: 'accounting123',
    role: UserRole.accounting,
  });

  const officeUser = await upsertUser({
    fullName: 'Fleet Office',
    email: 'office@fleet.com',
    password: 'office123',
    role: UserRole.office,
  });

  const driverQaUser = await upsertUser({
    fullName: 'Ilker Cukur',
    email: 'driver@fleet.com',
    password: 'driver123',
    role: UserRole.driver,
    status: UserStatus.active,
  });

  const drivers = [
    {
      id: 'drv_ilker_cukur',
      key: 'Ilker Cukur',
      employeeNumber: 'DRV-001',
      firstName: 'Ilker',
      lastName: 'Cukur',
      phone: '+49 170 1000001',
      email: 'ilker.cukur@fleet.com',
      licenseNumber: 'LIC-DE-ILK-2001',
      licenseExpiryDate: addDays(today, 45),
      passportExpiryDate: addDays(today, 400),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
      userId: driverQaUser.id,
    },
    {
      id: 'drv_thomas_scharein',
      key: 'Thomas Scharein',
      employeeNumber: 'DRV-002',
      firstName: 'Thomas',
      lastName: 'Scharein',
      phone: '+49 170 1000002',
      email: 'thomas.scharein@fleet.com',
      licenseNumber: 'LIC-DE-THO-2002',
      licenseExpiryDate: addDays(today, 210),
      passportExpiryDate: addDays(today, 310),
      status: DriverStatus.active,
      riskLevel: RiskLevel.yellow,
    },
    {
      id: 'drv_sita_diallo',
      key: 'Sita Diallo',
      employeeNumber: 'DRV-003',
      firstName: 'Sita',
      lastName: 'Diallo',
      phone: '+49 170 1000003',
      email: 'sita.diallo@fleet.com',
      licenseNumber: 'LIC-DE-SIT-2003',
      licenseExpiryDate: addDays(today, 160),
      passportExpiryDate: addDays(today, 500),
      status: DriverStatus.on_leave,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_andrii_dudiak',
      key: 'Andrii Dudiak',
      employeeNumber: 'DRV-004',
      firstName: 'Andrii',
      lastName: 'Dudiak',
      phone: '+49 170 1000004',
      email: 'andrii.dudiak@fleet.com',
      licenseNumber: 'LIC-DE-AND-2004',
      licenseExpiryDate: addDays(today, 95),
      passportExpiryDate: addDays(today, 275),
      status: DriverStatus.sick,
      riskLevel: RiskLevel.yellow,
    },
    {
      id: 'drv_nesrin_feyzula',
      key: 'Nesrin Feyzula',
      employeeNumber: 'DRV-005',
      firstName: 'Nesrin',
      lastName: 'Feyzula',
      phone: '+49 170 1000005',
      email: 'nesrin.feyzula@fleet.com',
      licenseNumber: 'LIC-DE-NES-2005',
      licenseExpiryDate: addDays(today, 365),
      passportExpiryDate: addDays(today, 600),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_baldeh_saidou',
      key: 'Baldeh Saidou',
      employeeNumber: 'DRV-006',
      firstName: 'Baldeh',
      lastName: 'Saidou',
      phone: '+49 170 1000006',
      email: 'baldeh.saidou@fleet.com',
      licenseNumber: 'LIC-DE-BAL-2006',
      licenseExpiryDate: addDays(today, 520),
      passportExpiryDate: addDays(today, 680),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_kalisch_mario',
      key: 'Kalisch Mario',
      employeeNumber: 'DRV-007',
      firstName: 'Kalisch',
      lastName: 'Mario',
      phone: '+49 170 1000007',
      email: 'kalisch.mario@fleet.com',
      licenseNumber: 'LIC-DE-KAL-2007',
      licenseExpiryDate: addDays(today, 130),
      passportExpiryDate: addDays(today, 360),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_michalski_mateusz',
      key: 'Michalski Mateusz',
      employeeNumber: 'DRV-008',
      firstName: 'Michalski',
      lastName: 'Mateusz',
      phone: '+49 170 1000008',
      email: 'michalski.mateusz@fleet.com',
      licenseNumber: 'LIC-DE-MIC-2008',
      licenseExpiryDate: addDays(today, 260),
      passportExpiryDate: addDays(today, 560),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_gundrum_andreas',
      key: 'Gundrum Andreas',
      employeeNumber: 'DRV-009',
      firstName: 'Gundrum',
      lastName: 'Andreas',
      phone: '+49 170 1000009',
      email: 'gundrum.andreas@fleet.com',
      licenseNumber: 'LIC-DE-GUN-2009',
      licenseExpiryDate: addDays(today, 410),
      passportExpiryDate: addDays(today, 720),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
    {
      id: 'drv_ozdemir_hakan',
      key: 'Ozdemir Hakan',
      employeeNumber: 'DRV-010',
      firstName: 'Ozdemir',
      lastName: 'Hakan',
      phone: '+49 170 1000010',
      email: 'ozdemir.hakan@fleet.com',
      licenseNumber: 'LIC-DE-OZD-2010',
      licenseExpiryDate: addDays(today, 200),
      passportExpiryDate: addDays(today, 500),
      status: DriverStatus.active,
      riskLevel: RiskLevel.green,
    },
  ] as const;

  const driversByName = new Map<string, Awaited<ReturnType<typeof upsertDriver>>>();
  for (const driver of drivers) {
    const record = await upsertDriver(driver);
    driversByName.set(driver.key, record);
  }

  const vehicles = [
    {
      id: 'veh_ap_101',
      plateNumber: 'AP-101',
      internalCode: 'VH-101',
      brand: 'Mercedes-Benz',
      model: 'Actros 1845',
      year: 2021,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 28),
      spExpiryDate: addDays(today, 90),
      insuranceExpiryDate: addDays(today, 250),
    },
    {
      id: 'veh_ap_102',
      plateNumber: 'AP-102',
      internalCode: 'VH-102',
      brand: 'MAN',
      model: 'TGX 18.510',
      year: 2020,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 130),
      spExpiryDate: addDays(today, 22),
      insuranceExpiryDate: addDays(today, 210),
    },
    {
      id: 'veh_ap_103',
      plateNumber: 'AP-103',
      internalCode: 'VH-103',
      brand: 'Scania',
      model: 'R450',
      year: 2022,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 320),
      spExpiryDate: addDays(today, 260),
      insuranceExpiryDate: addDays(today, 18),
    },
    {
      id: 'veh_ap_104',
      plateNumber: 'AP-104',
      internalCode: 'VH-104',
      brand: 'Volvo',
      model: 'FH 500',
      year: 2019,
      status: VehicleStatus.maintenance,
      tuvExpiryDate: addDays(today, 75),
      spExpiryDate: addDays(today, 110),
      insuranceExpiryDate: addDays(today, 170),
    },
    {
      id: 'veh_ap_105',
      plateNumber: 'AP-105',
      internalCode: 'VH-105',
      brand: 'DAF',
      model: 'XF 480',
      year: 2021,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 190),
      spExpiryDate: addDays(today, 200),
      insuranceExpiryDate: addDays(today, 280),
    },
    {
      id: 'veh_b_sg_1540',
      plateNumber: 'B-SG 1540',
      internalCode: 'VH-106',
      brand: 'Iveco',
      model: 'S-WAY',
      year: 2020,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 60),
      spExpiryDate: addDays(today, 145),
      insuranceExpiryDate: addDays(today, 330),
    },
    {
      id: 'veh_b_sg_1553',
      plateNumber: 'B-SG 1553',
      internalCode: 'VH-107',
      brand: 'Renault',
      model: 'T High',
      year: 2018,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 15),
      spExpiryDate: addDays(today, 14),
      insuranceExpiryDate: addDays(today, 120),
    },
    {
      id: 'veh_b_tk_710',
      plateNumber: 'B-TK 710',
      internalCode: 'VH-108',
      brand: 'Ford',
      model: 'Transit',
      year: 2022,
      status: VehicleStatus.active,
      tuvExpiryDate: addDays(today, 280),
      spExpiryDate: addDays(today, 240),
      insuranceExpiryDate: addDays(today, 355),
    },
  ] as const;

  const vehiclesByPlate = new Map<string, Awaited<ReturnType<typeof upsertVehicle>>>();
  for (const vehicle of vehicles) {
    const record = await upsertVehicle(vehicle);
    vehiclesByPlate.set(vehicle.plateNumber, record);
  }

  const companies = [
    {
      id: 'cmp_dhl',
      name: 'DHL',
      email: 'dispatch@dhl.de',
      phone: '+49 30 1110001',
      address: 'DHL Hub, Berlin',
      contactPerson: 'Laura Schneider',
      defaultDailyRevenue: 1250,
    },
    {
      id: 'cmp_amazon',
      name: 'Amazon',
      email: 'routing@amazon.de',
      phone: '+49 30 1110002',
      address: 'Amazon FC, Leipzig',
      contactPerson: 'Dennis Koch',
      defaultDailyRevenue: 1400,
    },
    {
      id: 'cmp_ups',
      name: 'UPS',
      email: 'ops@ups.de',
      phone: '+49 30 1110003',
      address: 'UPS Depot, Hannover',
      contactPerson: 'Marco Heinz',
      defaultDailyRevenue: 1180,
    },
    {
      id: 'cmp_hermes',
      name: 'Hermes',
      email: 'transport@hermes.de',
      phone: '+49 30 1110004',
      address: 'Hermes Hub, Hamburg',
      contactPerson: 'Nina Hartmann',
      defaultDailyRevenue: 990,
    },
    {
      id: 'cmp_db_schenker',
      name: 'DB Schenker',
      email: 'fleet@dbschenker.de',
      phone: '+49 30 1110005',
      address: 'DB Schenker Terminal, Frankfurt',
      contactPerson: 'Tobias Engel',
      defaultDailyRevenue: 1650,
    },
    {
      id: 'cmp_krage',
      name: 'Krage',
      email: 'planung@krage.de',
      phone: '+49 30 1110006',
      address: 'Krage Lager, Bremen',
      contactPerson: 'Katrin Vogt',
      defaultDailyRevenue: 860,
    },
    {
      id: 'cmp_raben',
      name: 'Raben',
      email: 'dispo@raben.de',
      phone: '+49 30 1110007',
      address: 'Raben Standort, Dortmund',
      contactPerson: 'Sebastian Wolf',
      defaultDailyRevenue: 1120,
    },
    {
      id: 'cmp_penny',
      name: 'Penny',
      email: 'lieferung@penny.de',
      phone: '+49 30 1110008',
      address: 'Penny Logistikzentrum, Kassel',
      contactPerson: 'Fatma Aydin',
      defaultDailyRevenue: 1010,
    },
    {
      id: 'cmp_internal_dispatch',
      name: 'Internal Dispatch',
      email: 'dispatch@fleet.local',
      phone: '+49 30 1110000',
      address: 'Fleet HQ, Berlin',
      contactPerson: 'Dispatcher Office',
      defaultDailyRevenue: 0,
      notes: 'Internal route / dispatch placeholder company.',
    },
  ] as const;

  const companiesByName = new Map<string, Awaited<ReturnType<typeof upsertCompany>>>();
  for (const company of companies) {
    const record = await upsertCompany(company);
    companiesByName.set(company.name, record);
  }

  const ilker = driversByName.get('Ilker Cukur');
  const thomas = driversByName.get('Thomas Scharein');
  const sita = driversByName.get('Sita Diallo');
  const andrii = driversByName.get('Andrii Dudiak');
  const nesrin = driversByName.get('Nesrin Feyzula');
  const baldeh = driversByName.get('Baldeh Saidou');
  const kalisch = driversByName.get('Kalisch Mario');
  const michalski = driversByName.get('Michalski Mateusz');

  const ap101 = vehiclesByPlate.get('AP-101');
  const ap102 = vehiclesByPlate.get('AP-102');
  const ap103 = vehiclesByPlate.get('AP-103');
  const ap104 = vehiclesByPlate.get('AP-104');
  const ap105 = vehiclesByPlate.get('AP-105');
  const bsg1540 = vehiclesByPlate.get('B-SG 1540');
  const bsg1553 = vehiclesByPlate.get('B-SG 1553');
  const btk710 = vehiclesByPlate.get('B-TK 710');

  const dhl = companiesByName.get('DHL');
  const amazon = companiesByName.get('Amazon');
  const ups = companiesByName.get('UPS');
  const hermes = companiesByName.get('Hermes');
  const dbSchenker = companiesByName.get('DB Schenker');
  const krage = companiesByName.get('Krage');
  const raben = companiesByName.get('Raben');
  const penny = companiesByName.get('Penny');

  if (
    !ilker ||
    !thomas ||
    !sita ||
    !andrii ||
    !nesrin ||
    !baldeh ||
    !kalisch ||
    !michalski ||
    !ap101 ||
    !ap102 ||
    !ap103 ||
    !ap104 ||
    !ap105 ||
    !bsg1540 ||
    !bsg1553 ||
    !btk710 ||
    !dhl ||
    !amazon ||
    !ups ||
    !hermes ||
    !dbSchenker ||
    !krage ||
    !raben ||
    !penny
  ) {
    throw new Error('Seed references are incomplete.');
  }

  await prisma.conversation.upsert({
    where: { id: 'conv_office_driver_ilker' },
    update: {
      driverId: ilker.id,
      createdById: officeUser.id,
      subject: 'Today route updates',
      lastMessageAt: atTime(today, 8, 20),
    },
    create: {
      id: 'conv_office_driver_ilker',
      driverId: ilker.id,
      createdById: officeUser.id,
      subject: 'Today route updates',
      lastMessageAt: atTime(today, 8, 20),
    },
  });

  await prisma.conversation.upsert({
    where: { id: 'conv_admin_driver_ilker' },
    update: {
      driverId: ilker.id,
      createdById: adminUser.id,
      subject: 'Invoice and document follow-up',
      lastMessageAt: atTime(today, 11, 5),
    },
    create: {
      id: 'conv_admin_driver_ilker',
      driverId: ilker.id,
      createdById: adminUser.id,
      subject: 'Invoice and document follow-up',
      lastMessageAt: atTime(today, 11, 5),
    },
  });

  const participantRows = [
    { conversationId: 'conv_office_driver_ilker', userId: officeUser.id, role: UserRole.office, lastReadAt: atTime(today, 8, 20) },
    { conversationId: 'conv_office_driver_ilker', userId: driverQaUser.id, role: UserRole.driver, lastReadAt: atTime(today, 8, 5) },
    { conversationId: 'conv_admin_driver_ilker', userId: adminUser.id, role: UserRole.admin, lastReadAt: atTime(today, 11, 5) },
    { conversationId: 'conv_admin_driver_ilker', userId: accountingUser.id, role: UserRole.accounting, lastReadAt: atTime(today, 10, 50) },
    { conversationId: 'conv_admin_driver_ilker', userId: bossUser.id, role: UserRole.boss, lastReadAt: atTime(today, 10, 45) },
    { conversationId: 'conv_admin_driver_ilker', userId: driverQaUser.id, role: UserRole.driver, lastReadAt: atTime(today, 10, 40) },
  ] as const;

  for (const participant of participantRows) {
    await prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: participant.conversationId,
          userId: participant.userId,
        },
      },
      update: {
        role: participant.role,
        lastReadAt: participant.lastReadAt,
      },
      create: {
        conversationId: participant.conversationId,
        userId: participant.userId,
        role: participant.role,
        lastReadAt: participant.lastReadAt,
      },
    });
  }

  const messageRows = [
    {
      id: 'msg_office_driver_1',
      conversationId: 'conv_office_driver_ilker',
      senderUserId: officeUser.id,
      originalText: 'Heute bitte zuerst Leipzig Hub anfahren.',
      translatedText: 'Bugun lutfen once Leipzig hub noktasina gidin.',
      originalLanguage: 'de',
      targetLanguage: 'tr',
      translationStatus: MessageTranslationStatus.translated,
      translatedAt: atTime(today, 7, 46),
      createdAt: atTime(today, 7, 45),
    },
    {
      id: 'msg_office_driver_2',
      conversationId: 'conv_office_driver_ilker',
      senderUserId: driverQaUser.id,
      originalText: 'Tamam, once Leipzig teslimatini yapacagim.',
      translatedText: 'Verstanden, ich erledige zuerst die Leipzig-Lieferung.',
      originalLanguage: 'tr',
      targetLanguage: 'de',
      translationStatus: MessageTranslationStatus.translated,
      translatedAt: atTime(today, 8, 6),
      createdAt: atTime(today, 8, 5),
    },
    {
      id: 'msg_admin_driver_1',
      conversationId: 'conv_admin_driver_ilker',
      senderUserId: accountingUser.id,
      originalText: 'Please upload the handover photo before end of shift.',
      translatedText: 'Vardiya bitmeden once teslim fotografini yukleyin.',
      originalLanguage: 'en',
      targetLanguage: 'tr',
      translationStatus: MessageTranslationStatus.translated,
      translatedAt: atTime(today, 10, 41),
      createdAt: atTime(today, 10, 40),
    },
    {
      id: 'msg_admin_driver_2',
      conversationId: 'conv_admin_driver_ilker',
      senderUserId: bossUser.id,
      originalText: 'Danke fur die schnelle Ruckmeldung.',
      translatedText: null,
      originalLanguage: 'de',
      targetLanguage: null,
      translationStatus: MessageTranslationStatus.not_requested,
      translatedAt: null,
      createdAt: atTime(today, 11, 5),
    },
  ] as const;

  for (const message of messageRows) {
    await prisma.message.upsert({
      where: { id: message.id },
      update: {
        conversationId: message.conversationId,
        senderUserId: message.senderUserId,
        originalText: message.originalText,
        translatedText: message.translatedText,
        originalLanguage: message.originalLanguage,
        targetLanguage: message.targetLanguage,
        translationStatus: message.translationStatus,
        translatedAt: message.translatedAt,
        createdAt: message.createdAt,
      },
      create: message,
    });
  }

  const readRows = [
    { messageId: 'msg_office_driver_1', userId: officeUser.id, readAt: atTime(today, 7, 46) },
    { messageId: 'msg_office_driver_1', userId: driverQaUser.id, readAt: atTime(today, 7, 50) },
    { messageId: 'msg_office_driver_2', userId: officeUser.id, readAt: atTime(today, 8, 7) },
    { messageId: 'msg_admin_driver_1', userId: accountingUser.id, readAt: atTime(today, 10, 41) },
    { messageId: 'msg_admin_driver_1', userId: driverQaUser.id, readAt: atTime(today, 10, 55) },
    { messageId: 'msg_admin_driver_2', userId: bossUser.id, readAt: atTime(today, 11, 5) },
  ] as const;

  for (const read of readRows) {
    await prisma.messageRead.upsert({
      where: {
        messageId_userId: {
          messageId: read.messageId,
          userId: read.userId,
        },
      },
      update: { readAt: read.readAt },
      create: read,
    });
  }

  await upsertVehicle({
    plateNumber: 'AP-101',
    internalCode: 'VH-101',
    brand: 'Mercedes-Benz',
    model: 'Actros 1845',
    year: 2021,
    status: VehicleStatus.active,
    tuvExpiryDate: addDays(today, 28),
    spExpiryDate: addDays(today, 90),
    insuranceExpiryDate: addDays(today, 250),
    currentDriverId: ilker.id,
  });

  await upsertVehicle({
    plateNumber: 'AP-102',
    internalCode: 'VH-102',
    brand: 'MAN',
    model: 'TGX 18.510',
    year: 2020,
    status: VehicleStatus.active,
    tuvExpiryDate: addDays(today, 130),
    spExpiryDate: addDays(today, 22),
    insuranceExpiryDate: addDays(today, 210),
    currentDriverId: thomas.id,
  });

  const assignmentData = [
    {
      key: 'a1',
      driverId: ilker.id,
      vehicleId: ap101.id,
      companyId: dhl.id,
      cargoName: 'Electronics Pallets',
      cargoOwner: 'DHL',
      pickupAddress: 'Berlin South Hub',
      deliveryAddress: 'Leipzig Distribution Center',
      workDate: today,
      startTime: '07:00',
      endTime: '15:00',
      routeName: 'BER-LEJ-01',
      status: AssignmentStatus.confirmed,
      createdById: adminUser.id,
      notes: 'High priority route.',
    },
    {
      key: 'a2',
      driverId: thomas.id,
      vehicleId: ap102.id,
      companyId: amazon.id,
      cargoName: 'E-commerce Parcels',
      cargoOwner: 'Amazon',
      pickupAddress: 'Leipzig FC 3',
      deliveryAddress: 'Berlin Last-Mile Depot',
      workDate: today,
      startTime: '08:00',
      endTime: '16:00',
      routeName: 'LEJ-BER-04',
      status: AssignmentStatus.confirmed,
      createdById: adminUser.id,
    },
    {
      key: 'a3',
      driverId: nesrin.id,
      vehicleId: ap105.id,
      companyId: dbSchenker.id,
      cargoName: 'Industrial Components',
      cargoOwner: 'DB Schenker',
      pickupAddress: 'Frankfurt Cargo Port',
      deliveryAddress: 'Erfurt Plant',
      workDate: today,
      startTime: '06:30',
      endTime: '14:30',
      routeName: 'FRA-ERF-02',
      status: AssignmentStatus.in_progress,
      createdById: adminUser.id,
    },
    {
      key: 'a4',
      driverId: baldeh.id,
      vehicleId: bsg1540.id,
      companyId: ups.id,
      cargoName: 'Express Shipment',
      cargoOwner: 'UPS',
      pickupAddress: 'Hannover Hub',
      deliveryAddress: 'Hamburg City Depot',
      workDate: today,
      startTime: '09:00',
      endTime: '17:00',
      routeName: 'HAJ-HAM-EXP',
      status: AssignmentStatus.planned,
      createdById: adminUser.id,
    },
    {
      key: 'a5',
      driverId: kalisch.id,
      vehicleId: bsg1553.id,
      companyId: hermes.id,
      cargoName: 'Parcel Containers',
      cargoOwner: 'Hermes',
      pickupAddress: 'Hamburg Parcel Hub',
      deliveryAddress: 'Bremen North Depot',
      workDate: tomorrow,
      startTime: '07:30',
      endTime: '15:30',
      routeName: 'HAM-BRE-07',
      status: AssignmentStatus.confirmed,
      createdById: adminUser.id,
    },
    {
      key: 'a6',
      driverId: michalski.id,
      vehicleId: btk710.id,
      companyId: penny.id,
      cargoName: 'Retail Dry Goods',
      cargoOwner: 'Penny',
      pickupAddress: 'Kassel Central Warehouse',
      deliveryAddress: 'Dortmund Stores Cluster',
      workDate: tomorrow,
      startTime: '08:15',
      endTime: '16:15',
      routeName: 'KSF-DTM-11',
      status: AssignmentStatus.confirmed,
      createdById: adminUser.id,
    },
    {
      key: 'a7',
      driverId: ilker.id,
      vehicleId: ap101.id,
      companyId: raben.id,
      cargoName: 'Cross-Dock Freight',
      cargoOwner: 'Raben',
      pickupAddress: 'Dortmund Cargo Gate',
      deliveryAddress: 'Berlin East Dock',
      workDate: tomorrow,
      startTime: '17:00',
      endTime: '22:00',
      routeName: 'DTM-BER-22',
      status: AssignmentStatus.planned,
      createdById: adminUser.id,
    },
    {
      key: 'a8',
      driverId: nesrin.id,
      vehicleId: ap103.id,
      companyId: krage.id,
      cargoName: 'Warehouse Equipment',
      cargoOwner: 'Krage',
      pickupAddress: 'Bremen Harbor',
      deliveryAddress: 'Hanover Equipment Yard',
      workDate: tomorrow,
      startTime: '10:00',
      endTime: '18:00',
      routeName: 'BRE-HAJ-09',
      status: AssignmentStatus.confirmed,
      createdById: officeUser.id,
    },
  ] as const;

  const assignmentsByKey = new Map<string, Awaited<ReturnType<typeof upsertAssignment>>>();
  for (const assignment of assignmentData) {
    const record = await upsertAssignment(assignment);
    assignmentsByKey.set(assignment.key, record);

    await upsertCalendarEvent({
      driverId: assignment.driverId,
      date: assignment.workDate,
      status: CalendarStatus.AT,
      source: CalendarSource.assignment,
      assignmentId: record.id,
    });
  }

  const vacationApproved = await upsertRequest({
    driverId: sita.id,
    type: RequestType.vacation,
    startDate: tomorrow,
    endDate: addDays(tomorrow, 3),
    reason: 'Family vacation.',
    status: RequestStatus.approved,
    approvedById: bossUser.id,
  });

  const sickApproved = await upsertRequest({
    driverId: andrii.id,
    type: RequestType.sick_leave,
    startDate: today,
    endDate: addDays(today, 2),
    reason: 'Flu symptoms.',
    status: RequestStatus.approved,
    approvedById: adminUser.id,
  });

  await upsertRequest({
    driverId: thomas.id,
    type: RequestType.training,
    startDate: addDays(today, 7),
    endDate: addDays(today, 8),
    reason: 'ADR safety refresh.',
    status: RequestStatus.pending,
  });

  const businessTripApproved = await upsertRequest({
    driverId: ilker.id,
    type: RequestType.business_trip,
    startDate: addDays(today, 10),
    endDate: addDays(today, 12),
    reason: 'Branch support in Munich.',
    status: RequestStatus.approved,
    approvedById: bossUser.id,
  });

  await upsertRequest({
    driverId: baldeh.id,
    type: RequestType.vacation,
    startDate: addDays(today, 14),
    endDate: addDays(today, 16),
    reason: 'Annual leave.',
    status: RequestStatus.pending,
  });

  await upsertCalendarEvent({
    driverId: sita.id,
    date: vacationApproved.startDate,
    status: CalendarStatus.UT,
    source: CalendarSource.leave,
    requestId: vacationApproved.id,
  });

  await upsertCalendarEvent({
    driverId: andrii.id,
    date: sickApproved.startDate,
    status: CalendarStatus.KT,
    source: CalendarSource.leave,
    requestId: sickApproved.id,
  });

  await upsertCalendarEvent({
    driverId: ilker.id,
    date: businessTripApproved.startDate,
    status: CalendarStatus.GR,
    source: CalendarSource.leave,
    requestId: businessTripApproved.id,
  });

  const trainingApproved = await upsertRequest({
    driverId: michalski.id,
    type: RequestType.training,
    startDate: addDays(today, 4),
    endDate: addDays(today, 4),
    reason: 'Fuel-efficient driving training.',
    status: RequestStatus.approved,
    approvedById: adminUser.id,
  });

  await upsertCalendarEvent({
    driverId: michalski.id,
    date: trainingApproved.startDate,
    status: CalendarStatus.SCH,
    source: CalendarSource.leave,
    requestId: trainingApproved.id,
  });

  const ilkerLicenseDoc = await upsertDocument({
    ownerType: DocumentOwnerType.driver,
    ownerId: ilker.id,
    documentType: 'Driving License',
    fileName: 'ilker-driving-license.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/drivers/ilker-driving-license.pdf',
    expiryDate: addDays(today, 45),
    status: DocumentStatus.expiring_soon,
    uploadedById: adminUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.driver,
    ownerId: thomas.id,
    documentType: 'Passport',
    fileName: 'thomas-passport.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/drivers/thomas-passport.pdf',
    expiryDate: addDays(today, -10),
    status: DocumentStatus.expired,
    uploadedById: officeUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.driver,
    ownerId: nesrin.id,
    documentType: 'Contract',
    fileName: 'nesrin-contract.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/drivers/nesrin-contract.pdf',
    expiryDate: addDays(today, 365),
    status: DocumentStatus.valid,
    uploadedById: accountingUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.vehicle,
    ownerId: ap101.id,
    documentType: 'TUV',
    fileName: 'ap-101-tuv.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/vehicles/ap-101-tuv.pdf',
    expiryDate: addDays(today, 28),
    status: DocumentStatus.expiring_soon,
    uploadedById: officeUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.vehicle,
    ownerId: ap102.id,
    documentType: 'SP',
    fileName: 'ap-102-sp.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/vehicles/ap-102-sp.pdf',
    expiryDate: addDays(today, -5),
    status: DocumentStatus.expired,
    uploadedById: officeUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.vehicle,
    ownerId: ap103.id,
    documentType: 'Insurance',
    fileName: 'ap-103-insurance.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/vehicles/ap-103-insurance.pdf',
    expiryDate: addDays(today, 18),
    status: DocumentStatus.expiring_soon,
    uploadedById: officeUser.id,
  });

  const dhlContractDoc = await upsertDocument({
    ownerType: DocumentOwnerType.company,
    ownerId: dhl.id,
    documentType: 'Company Contract',
    fileName: 'dhl-contract.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/companies/dhl-contract.pdf',
    expiryDate: addDays(today, 320),
    status: DocumentStatus.valid,
    uploadedById: accountingUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.company,
    ownerId: amazon.id,
    documentType: 'Company Contract',
    fileName: 'amazon-contract.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/companies/amazon-contract.pdf',
    expiryDate: addDays(today, -20),
    status: DocumentStatus.expired,
    uploadedById: accountingUser.id,
  });

  await upsertDocument({
    ownerType: DocumentOwnerType.company,
    ownerId: ups.id,
    documentType: 'Company Contract',
    fileName: 'ups-contract.pdf',
    fileUrl: 'https://cdn.fleet.local/docs/companies/ups-contract.pdf',
    expiryDate: addDays(today, 40),
    status: DocumentStatus.expiring_soon,
    uploadedById: accountingUser.id,
  });

  const pendingTransportRequest = await upsertTransportRequest({
    driverId: kalisch.id,
    vehicleId: bsg1553.id,
    companyId: ups.id,
    cargoName: 'Medical Supplies',
    cargoOwner: 'UPS',
    pickupAddress: 'Berlin Med Logistics',
    deliveryAddress: 'Rostock Clinic Warehouse',
    requestedDate: tomorrow,
    startTime: '12:00',
    endTime: '19:00',
    status: TransportRequestStatus.pending,
  });

  const approvedTransportRequest = await upsertTransportRequest({
    driverId: nesrin.id,
    vehicleId: ap103.id,
    companyId: krage.id,
    cargoName: 'Heavy Duty Shelving',
    cargoOwner: 'Krage',
    pickupAddress: 'Bremen Harbor',
    deliveryAddress: 'Hanover Equipment Yard',
    requestedDate: tomorrow,
    startTime: '10:00',
    endTime: '18:00',
    status: TransportRequestStatus.approved,
    assignmentId: assignmentsByKey.get('a8')?.id,
  });

  const needsReviewDriverRequest = await upsertTransportRequest({
    driverId: andrii.id,
    vehicleId: ap104.id,
    companyId: amazon.id,
    cargoName: 'Temperature Sensitive Goods',
    cargoOwner: 'Amazon',
    pickupAddress: 'Leipzig Pharma Dock',
    deliveryAddress: 'Berlin Temperature Depot',
    requestedDate: today,
    startTime: '11:30',
    endTime: '18:30',
    status: TransportRequestStatus.needs_review,
    conflictReason: 'Driver is on approved sick leave (KT).',
  });

  const needsReviewVehicleRequest = await upsertTransportRequest({
    driverId: michalski.id,
    vehicleId: ap101.id,
    companyId: raben.id,
    cargoName: 'Overflow Freight',
    cargoOwner: 'Raben',
    pickupAddress: 'Dortmund Cargo Gate',
    deliveryAddress: 'Berlin East Dock',
    requestedDate: today,
    startTime: '07:15',
    endTime: '13:00',
    status: TransportRequestStatus.needs_review,
    conflictReason: 'Vehicle AP-101 is already assigned to another driver today.',
  });

  await upsertVehicleHandover({
    driverId: ilker.id,
    vehicleId: ap101.id,
    previousVehicleId: ap101.id,
    assignmentId: assignmentsByKey.get('a1')?.id,
    handoverType: HandoverType.pickup,
    handoverDateTime: atTime(today, 6, 35),
    photoRequired: false,
    photoStatus: HandoverPhotoStatus.not_required,
    damageDetected: false,
    status: HandoverStatus.completed,
    notes: 'Same vehicle as yesterday, photo not required.',
  });

  const missingPhotoHandover = await upsertVehicleHandover({
    driverId: thomas.id,
    vehicleId: ap102.id,
    previousVehicleId: ap101.id,
    assignmentId: assignmentsByKey.get('a2')?.id,
    handoverType: HandoverType.pickup,
    handoverDateTime: atTime(today, 7, 50),
    photoRequired: true,
    photoStatus: HandoverPhotoStatus.missing,
    damageDetected: false,
    status: HandoverStatus.pending,
    notes: 'Vehicle changed from AP-101 to AP-102, pickup photo missing.',
  });

  await upsertVehicleHandover({
    driverId: nesrin.id,
    vehicleId: ap105.id,
    previousVehicleId: ap105.id,
    assignmentId: assignmentsByKey.get('a3')?.id,
    handoverType: HandoverType.return,
    handoverDateTime: atTime(today, 15, 0),
    photoRequired: true,
    photoStatus: HandoverPhotoStatus.uploaded,
    damageDetected: false,
    status: HandoverStatus.completed,
    notes: 'Return photo uploaded and waiting approval.',
  });

  await upsertVehicleHandover({
    driverId: baldeh.id,
    vehicleId: bsg1540.id,
    previousVehicleId: bsg1540.id,
    assignmentId: assignmentsByKey.get('a4')?.id,
    handoverType: HandoverType.return,
    handoverDateTime: atTime(today, 17, 20),
    photoRequired: true,
    photoStatus: HandoverPhotoStatus.approved,
    damageDetected: false,
    status: HandoverStatus.completed,
    notes: 'Return photo reviewed and approved by office.',
  });

  const vehicleAccidentOne = await upsertAccident({
    type: IncidentType.vehicle_accident,
    driverId: thomas.id,
    vehicleId: ap102.id,
    companyId: amazon.id,
    assignmentId: assignmentsByKey.get('a2')?.id,
    incidentDateTime: atTime(today, 12, 10),
    location: 'A10 Berlin Ring, Exit 3',
    description: 'Minor collision while reversing at loading bay.',
    damageValue: 2800,
    status: IncidentStatus.reported,
  });

  const vehicleAccidentTwo = await upsertAccident({
    type: IncidentType.vehicle_accident,
    driverId: ilker.id,
    vehicleId: ap101.id,
    companyId: dhl.id,
    assignmentId: assignmentsByKey.get('a1')?.id,
    incidentDateTime: atTime(today, 10, 45),
    location: 'Leipzig industrial zone',
    description: 'Side mirror damaged during narrow turn.',
    damageValue: 900,
    status: IncidentStatus.under_review,
  });

  await upsertAccident({
    type: IncidentType.cargo_damage,
    driverId: nesrin.id,
    vehicleId: ap105.id,
    companyId: dbSchenker.id,
    assignmentId: assignmentsByKey.get('a3')?.id,
    incidentDateTime: atTime(today, 13, 40),
    location: 'Erfurt unloading dock',
    description: 'Two pallets had crushed corner protection.',
    cargoName: 'Industrial Components',
    cargoOwner: 'DB Schenker',
    damageValue: 1350,
    status: IncidentStatus.reported,
  });

  await upsertAccident({
    type: IncidentType.cargo_damage,
    driverId: kalisch.id,
    vehicleId: bsg1553.id,
    companyId: hermes.id,
    assignmentId: assignmentsByKey.get('a5')?.id,
    incidentDateTime: atTime(tomorrow, 14, 5),
    location: 'Bremen receiving gate',
    description: 'Parcel cages shifted due to emergency braking.',
    cargoName: 'Parcel Containers',
    cargoOwner: 'Hermes',
    damageValue: 780,
    status: IncidentStatus.resolved,
  });

  await prisma.driver.update({
    where: { id: thomas.id },
    data: { riskLevel: RiskLevel.red },
  });

  await prisma.driver.update({
    where: { id: ilker.id },
    data: { riskLevel: RiskLevel.yellow },
  });

  await prisma.companyEmail.upsert({
    where: {
      companyId_date: {
        companyId: dhl.id,
        date: today,
      },
    },
    update: {
      subject: `Daily Dispatch Overview ${today.toISOString().slice(0, 10)}`,
      recipientEmail: dhl.email ?? 'dispatch@dhl.de',
      body: 'Assignments prepared for today.',
      status: CompanyEmailStatus.draft,
      lastSentAt: null,
    },
    create: {
      companyId: dhl.id,
      date: today,
      subject: `Daily Dispatch Overview ${today.toISOString().slice(0, 10)}`,
      recipientEmail: dhl.email ?? 'dispatch@dhl.de',
      body: 'Assignments prepared for today.',
      status: CompanyEmailStatus.draft,
      lastSentAt: null,
    },
  });

  await prisma.companyEmail.upsert({
    where: {
      companyId_date: {
        companyId: amazon.id,
        date: tomorrow,
      },
    },
    update: {
      subject: `Route Change Confirmation ${tomorrow.toISOString().slice(0, 10)}`,
      recipientEmail: amazon.email ?? 'routing@amazon.de',
      body: 'One transport request needs manual review.',
      status: CompanyEmailStatus.needs_review,
      lastSentAt: null,
    },
    create: {
      companyId: amazon.id,
      date: tomorrow,
      subject: `Route Change Confirmation ${tomorrow.toISOString().slice(0, 10)}`,
      recipientEmail: amazon.email ?? 'routing@amazon.de',
      body: 'One transport request needs manual review.',
      status: CompanyEmailStatus.needs_review,
      lastSentAt: null,
    },
  });

  await prisma.companyEmail.upsert({
    where: {
      companyId_date: {
        companyId: dbSchenker.id,
        date: addDays(today, 2),
      },
    },
    update: {
      subject: 'Approved Request Dispatch',
      recipientEmail: dbSchenker.email ?? 'fleet@dbschenker.de',
      body: `Approved transport request ID: ${approvedTransportRequest.id}`,
      status: CompanyEmailStatus.sent,
      lastSentAt: atTime(addDays(today, 2), 8, 45),
    },
    create: {
      companyId: dbSchenker.id,
      date: addDays(today, 2),
      subject: 'Approved Request Dispatch',
      recipientEmail: dbSchenker.email ?? 'fleet@dbschenker.de',
      body: `Approved transport request ID: ${approvedTransportRequest.id}`,
      status: CompanyEmailStatus.sent,
      lastSentAt: atTime(addDays(today, 2), 8, 45),
    },
  });

  const failedEmail = await prisma.companyEmail.upsert({
    where: {
      companyId_date: {
        companyId: penny.id,
        date: addDays(today, 3),
      },
    },
    update: {
      subject: 'Delivery Slot Update',
      recipientEmail: penny.email ?? 'lieferung@penny.de',
      body: 'SMTP timeout while sending update.',
      status: CompanyEmailStatus.failed,
      lastSentAt: atTime(addDays(today, 3), 9, 15),
    },
    create: {
      companyId: penny.id,
      date: addDays(today, 3),
      subject: 'Delivery Slot Update',
      recipientEmail: penny.email ?? 'lieferung@penny.de',
      body: 'SMTP timeout while sending update.',
      status: CompanyEmailStatus.failed,
      lastSentAt: atTime(addDays(today, 3), 9, 15),
    },
  });

  await upsertNotification({
    userId: officeUser.id,
    title: 'New transport request',
    message: 'A new pending transport request requires dispatch planning.',
    type: NotificationType.transport_request,
    priority: NotificationPriority.medium,
    relatedEntityType: 'TransportRequest',
    relatedEntityId: pendingTransportRequest.id,
  });

  await upsertNotification({
    userId: officeUser.id,
    title: 'Missing handover photo',
    message: 'Pickup handover photo is missing for changed vehicle assignment.',
    type: NotificationType.handover,
    priority: NotificationPriority.high,
    relatedEntityType: 'VehicleHandover',
    relatedEntityId: missingPhotoHandover.id,
  });

  await upsertNotification({
    userId: accountingUser.id,
    title: 'Expiring document',
    message: 'Driver license will expire soon and requires renewal.',
    type: NotificationType.document,
    priority: NotificationPriority.high,
    relatedEntityType: 'Document',
    relatedEntityId: ilkerLicenseDoc.id,
  });

  await upsertNotification({
    userId: bossUser.id,
    title: 'Accident reported',
    message: 'A vehicle accident has been reported and is under review.',
    type: NotificationType.accident,
    priority: NotificationPriority.critical,
    relatedEntityType: 'Accident',
    relatedEntityId: vehicleAccidentOne.id,
  });

  await upsertNotification({
    userId: adminUser.id,
    title: 'Company email failed',
    message: 'Outgoing company email failed and needs retry.',
    type: NotificationType.company_email,
    priority: NotificationPriority.high,
    relatedEntityType: 'CompanyEmail',
    relatedEntityId: failedEmail.id,
  });

  await upsertNotification({
    userId: driverQaUser.id,
    title: 'Driver mobile QA ready',
    message: 'Your account is seeded and linked to an active driver profile.',
    type: NotificationType.system,
    priority: NotificationPriority.low,
  });

  await upsertReminder({
    targetType: 'driver',
    targetId: ilker.id,
    reminderType: ReminderType.license_expiry,
    title: 'Driver license expiry reminder',
    description: 'Ilker Cukur license expires soon.',
    dueDate: addDays(today, 45),
    notifyBeforeDays: 30,
  });

  await upsertReminder({
    targetType: 'vehicle',
    targetId: ap101.id,
    reminderType: ReminderType.tuv_expiry,
    title: 'TUV expiry reminder',
    description: 'AP-101 TUV due date is approaching.',
    dueDate: addDays(today, 28),
    notifyBeforeDays: 14,
  });

  await upsertReminder({
    targetType: 'document',
    targetId: dhlContractDoc.id,
    reminderType: ReminderType.document_expiry,
    title: 'Company contract review reminder',
    description: 'DHL contract validity should be reviewed before expiry.',
    dueDate: addDays(today, 320),
    notifyBeforeDays: 60,
  });

  await upsertReminder({
    targetType: 'vehicle',
    targetId: ap103.id,
    reminderType: ReminderType.insurance_expiry,
    title: 'Insurance expiry reminder',
    description: 'AP-103 insurance expires soon.',
    dueDate: addDays(today, 18),
    notifyBeforeDays: 10,
  });

  await upsertNotification({
    userId: officeUser.id,
    title: 'Transport request needs review',
    message: 'Driver availability conflict was detected for transport request.',
    type: NotificationType.transport_request,
    priority: NotificationPriority.high,
    relatedEntityType: 'TransportRequest',
    relatedEntityId: needsReviewDriverRequest.id,
  });

  await upsertNotification({
    userId: officeUser.id,
    title: 'Vehicle assignment conflict',
    message: 'Requested vehicle is already assigned and needs manual review.',
    type: NotificationType.transport_request,
    priority: NotificationPriority.high,
    relatedEntityType: 'TransportRequest',
    relatedEntityId: needsReviewVehicleRequest.id,
  });

  await upsertNotification({
    userId: bossUser.id,
    title: 'Accident under review',
    message: 'Second vehicle accident has been logged by operations.',
    type: NotificationType.accident,
    priority: NotificationPriority.high,
    relatedEntityType: 'Accident',
    relatedEntityId: vehicleAccidentTwo.id,
  });

  const serviceRecords = [
    {
      vehicleId: 'veh_ap_101',
      date: addDays(today, -42),
      serviceType: 'Periodic Maintenance',
      repairCompany: 'Berlin Truck Service GmbH',
      costAmount: 1350,
      mileageKm: 142300,
      notes: 'Full inspection + oil change.',
    },
    {
      vehicleId: 'veh_ap_101',
      date: addDays(today, -10),
      serviceType: 'Brake Inspection',
      repairCompany: 'Nord Werkstatt AG',
      costAmount: 640,
      mileageKm: 145100,
    },
    {
      vehicleId: 'veh_ap_102',
      date: addDays(today, -28),
      serviceType: 'Tire Replacement',
      repairCompany: 'Berlin Truck Service GmbH',
      costAmount: 2100,
      mileageKm: 119900,
    },
    {
      vehicleId: 'veh_ap_104',
      date: addDays(today, -3),
      serviceType: 'Engine Diagnostics',
      repairCompany: 'Mercedes Service Berlin',
      costAmount: 890,
      mileageKm: 88450,
      notes: 'Awaiting parts for clutch repair.',
    },
    {
      vehicleId: 'veh_b_sg_1540',
      date: addDays(today, -65),
      serviceType: 'TÜV Inspection',
      repairCompany: 'TÜV Süd',
      costAmount: 220,
      mileageKm: 134000,
    },
    {
      vehicleId: 'veh_b_sg_1553',
      date: addDays(today, -7),
      serviceType: 'Oil Change',
      repairCompany: 'Renault Werkstatt Hannover',
      costAmount: 380,
      mileageKm: 167200,
    },
  ];

  for (const rec of serviceRecords) {
    await prisma.serviceRecord.create({ data: rec });
  }

  const morningCheckins = [
    {
      driverId: 'drv_ilker_cukur',
      date: today,
      submittedAt: atTime(today, 6, 30),
      vehiclePlate: 'AP-101',
      companyName: 'DHL',
      status: 'confirmed' as const,
    },
    {
      driverId: 'drv_thomas_scharein',
      date: today,
      submittedAt: atTime(today, 6, 45),
      vehiclePlate: 'AP-102',
      companyName: 'Amazon',
      status: 'waiting_for_review' as const,
    },
    {
      driverId: 'drv_baldeh_saidou',
      date: today,
      submittedAt: atTime(today, 6, 50),
      vehiclePlate: 'B-SG 1540',
      companyName: 'UPS',
      status: 'waiting_for_review' as const,
    },
    {
      driverId: 'drv_nesrin_feyzula',
      date: today,
      submittedAt: atTime(today, 7, 5),
      vehiclePlate: undefined,
      companyName: 'DB Schenker',
      status: 'missing_vehicle_plate' as const,
      conflictReason: 'No vehicle plate provided',
    },
  ];

  for (const c of morningCheckins) {
    await prisma.morningCheckin.create({ data: c });
  }

  console.log('Fleet seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
