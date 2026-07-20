#!/usr/bin/env node
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const prisma = new PrismaClient();
const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(backendRoot, '..');
const manifestPath = join(repoRoot, 'qa-agents/e2e/.auth/p0-fixture.json');
const uploadDirectory = join(backendRoot, 'uploads/documents');
const password = 'QaOnly-2026!';
const roles = ['admin', 'boss', 'accounting', 'office', 'driver'];
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required to generate local P0 session fixtures');
}

const jwt = new JwtService({ secret: jwtSecret });

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function writeFixturePdf(fileName, label) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 240]);
  page.drawText(label, { x: 40, y: 180, size: 16 });
  mkdirSync(uploadDirectory, { recursive: true });
  writeFileSync(join(uploadDirectory, fileName), await pdf.save());
}

async function seedTenant(suffix, passwordHash) {
  const tenantId = `qa-p0-tenant-${suffix}`;
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { status: 'active' },
    create: {
      id: tenantId,
      name: `QA P0 Tenant ${suffix.toUpperCase()}`,
      slug: `qa-p0-${suffix}`,
      status: 'active',
      language: 'de',
    },
  });

  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({ where: { tenantId } }),
    prisma.transportRequest.deleteMany({ where: { tenantId } }),
    prisma.assignment.deleteMany({ where: { tenantId } }),
    prisma.request.deleteMany({ where: { tenantId } }),
    prisma.reminder.deleteMany({ where: { tenantId } }),
  ]);

  const users = {};
  for (const role of roles) {
    const id = `qa-p0-user-${suffix}-${role}`;
    const email = `${role}@qa-p0-${suffix}.invalid`;
    users[role] = await prisma.user.upsert({
      where: { id },
      update: { tenantId, email, passwordHash, role, status: 'active', mfaEnabled: false },
      create: {
        id,
        tenantId,
        email,
        fullName: `QA ${role} ${suffix.toUpperCase()}`,
        passwordHash,
        role,
        status: 'active',
        language: 'de',
      },
      select: { id: true, email: true, role: true, tenantId: true },
    });
  }

  const driver = await prisma.driver.upsert({
    where: { id: `qa-p0-driver-${suffix}` },
    update: { tenantId, userId: users.driver.id, status: 'active' },
    create: {
      id: `qa-p0-driver-${suffix}`,
      tenantId,
      userId: users.driver.id,
      employeeNumber: `QA-P0-${suffix.toUpperCase()}-001`,
      firstName: 'QA',
      lastName: `Driver ${suffix.toUpperCase()}`,
      email: users.driver.email,
      status: 'active',
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { id: `qa-p0-vehicle-${suffix}` },
    update: { tenantId, status: 'active' },
    create: {
      id: `qa-p0-vehicle-${suffix}`,
      tenantId,
      plateNumber: `QA-${suffix.toUpperCase()} 1001`,
      internalCode: `QA-P0-VEH-${suffix.toUpperCase()}`,
      brand: 'QA Brand',
      model: 'Fixture',
      vin: `QA0P0${suffix.toUpperCase()}00000000001`,
      status: 'active',
    },
  });

  const company = await prisma.company.upsert({
    where: { id: `qa-p0-company-${suffix}` },
    update: { tenantId, name: `QA P0 Company ${suffix.toUpperCase()}` },
    create: {
      id: `qa-p0-company-${suffix}`,
      tenantId,
      name: `QA P0 Company ${suffix.toUpperCase()}`,
      email: `company@qa-p0-${suffix}.invalid`,
      defaultDailyRevenue: 1234.56,
    },
  });

  const documents = {};
  for (const documentType of ['public', 'private', 'salary', 'medical']) {
    const id = `qa-p0-document-${suffix}-${documentType}`;
    const fileName = `${id}.pdf`;
    const expiryDate = documentType === 'public'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;
    await writeFixturePdf(fileName, `QA ${suffix.toUpperCase()} ${documentType}`);
    documents[documentType] = await prisma.document.upsert({
      where: { id },
      update: {
        tenantId,
        ownerType: 'driver',
        ownerId: driver.id,
        documentType,
        fileName,
        fileUrl: `/uploads/documents/${fileName}`,
        uploadedById: users.admin.id,
        expiryDate,
        status: expiryDate ? 'expiring_soon' : 'valid',
      },
      create: {
        id,
        tenantId,
        ownerType: 'driver',
        ownerId: driver.id,
        documentType,
        fileName,
        fileUrl: `/uploads/documents/${fileName}`,
        uploadedById: users.admin.id,
        expiryDate,
        status: expiryDate ? 'expiring_soon' : 'valid',
      },
      select: { id: true, documentType: true, ownerId: true, tenantId: true },
    });
  }

  return { tenantId, users, driver, vehicle, company, documents };
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const tenantA = await seedTenant('a', passwordHash);
  const tenantB = await seedTenant('b', passwordHash);
  const sessionUser = tenantA.users.admin;
  const activeRefreshToken = jwt.sign(
    { sub: sessionUser.id, purpose: 'refresh', tokenId: 'qa-p0-refresh-active' },
    { expiresIn: '1d' },
  );
  const expiredRefreshToken = jwt.sign(
    { sub: sessionUser.id, purpose: 'refresh', tokenId: 'qa-p0-refresh-expired' },
    { expiresIn: -60 },
  );

  await prisma.refreshToken.deleteMany({
    where: { userId: sessionUser.id },
  });
  await prisma.refreshToken.createMany({
    data: [
      {
        id: 'qa-p0-refresh-active',
        userId: sessionUser.id,
        tokenHash: hashToken(activeRefreshToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'qa-p0-fixture',
      },
      {
        id: 'qa-p0-refresh-expired',
        userId: sessionUser.id,
        tokenHash: hashToken(expiredRefreshToken),
        expiresAt: new Date(Date.now() - 60_000),
        ipAddress: '127.0.0.1',
        userAgent: 'qa-p0-fixture',
      },
    ],
  });

  const accessPayload = {
    sub: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.role,
    tenantId: sessionUser.tenantId,
  };
  const accessTokens = {};
  for (const tenant of [tenantA, tenantB]) {
    accessTokens[tenant.tenantId] = {};
    for (const role of roles) {
      const user = tenant.users[role];
      accessTokens[tenant.tenantId][role] = jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      }, { expiresIn: '15m' });
    }
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    password,
    tenantA,
    tenantB,
    accessTokens,
    sessions: {
      activeAccessToken: jwt.sign(accessPayload, { expiresIn: '15m' }),
      expiredAccessToken: jwt.sign(accessPayload, { expiresIn: -60 }),
      activeRefreshToken,
      expiredRefreshToken,
    },
  };

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    tenantIds: [tenantA.tenantId, tenantB.tenantId],
    users: roles.length * 2,
    documents: Object.keys(tenantA.documents).length + Object.keys(tenantB.documents).length,
    manifestPath,
  })}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });