import { Injectable } from '@nestjs/common';
import { DriverStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_DRIVER_STATUSES: DriverStatus[] = ['active', 'on_leave', 'sick'];

type BirthdayCopy = {
  title: string;
  message: (firstName: string) => string;
};

const BIRTHDAY_COPY_BY_LANGUAGE: Record<string, BirthdayCopy> = {
  tr: {
    title: 'Doğum günün kutlu olsun!',
    message: (firstName) =>
      `${firstName}, doğum günün kutlu olsun! MyFleet ailesi olarak nice senelere dileriz.`,
  },
  de: {
    title: 'Alles Gute zum Geburtstag!',
    message: (firstName) =>
      `${firstName}, alles Gute zum Geburtstag! Das MyFleet-Team wünscht dir einen wundervollen Tag.`,
  },
  en: {
    title: 'Happy birthday!',
    message: (firstName) =>
      `Happy birthday, ${firstName}! Wishing you a great day from the MyFleet team.`,
  },
  pl: {
    title: 'Wszystkiego najlepszego!',
    message: (firstName) =>
      `${firstName}, wszystkiego najlepszego z okazji urodzin! Zespół MyFleet.`,
  },
  nl: {
    title: 'Gefeliciteerd!',
    message: (firstName) =>
      `${firstName}, gefeliciteerd met je verjaardag! Het MyFleet-team.`,
  },
  it: {
    title: 'Buon compleanno!',
    message: (firstName) =>
      `${firstName}, buon compleanno! Auguri dal team MyFleet.`,
  },
  es: {
    title: '¡Feliz cumpleaños!',
    message: (firstName) =>
      `${firstName}, ¡feliz cumpleaños! Te desea un gran día el equipo MyFleet.`,
  },
  ru: {
    title: 'С днём рождения!',
    message: (firstName) =>
      `${firstName}, с днём рождения! Команда MyFleet желает вам всего наилучшего.`,
  },
};

const DEFAULT_COPY = BIRTHDAY_COPY_BY_LANGUAGE.tr;

function isBirthdayToday(dateOfBirth: Date, today: Date): boolean {
  return (
    dateOfBirth.getUTCMonth() === today.getUTCMonth() &&
    dateOfBirth.getUTCDate() === today.getUTCDate()
  );
}

function resolveBirthdayCopy(language: string | null | undefined): BirthdayCopy {
  const key = language?.trim().toLowerCase();
  if (key && BIRTHDAY_COPY_BY_LANGUAGE[key]) {
    return BIRTHDAY_COPY_BY_LANGUAGE[key];
  }
  return DEFAULT_COPY;
}

@Injectable()
export class DriverBirthdaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendTodayBirthdayNotifications(referenceDate = new Date()) {
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();
    const day = referenceDate.getUTCDate();

    const drivers = await this.prisma.driver.findMany({
      where: {
        dateOfBirth: { not: null },
        userId: { not: null },
        status: { in: ACTIVE_DRIVER_STATUSES },
        OR: [{ lastBirthdayNotifiedYear: null }, { lastBirthdayNotifiedYear: { not: year } }],
      },
      select: {
        id: true,
        firstName: true,
        dateOfBirth: true,
        userId: true,
        user: {
          select: {
            language: true,
          },
        },
      },
    });

    const birthdayDrivers = drivers.filter(
      (driver) => driver.dateOfBirth && isBirthdayToday(driver.dateOfBirth, referenceDate),
    );

    const sent: Array<{ driverId: string; userId: string; firstName: string }> = [];
    const skipped: Array<{ driverId: string; reason: string }> = [];

    for (const driver of birthdayDrivers) {
      if (!driver.userId) {
        skipped.push({ driverId: driver.id, reason: 'no_linked_user' });
        continue;
      }

      const copy = resolveBirthdayCopy(driver.user?.language);
      const firstName = driver.firstName.trim() || 'Driver';

      try {
        await this.notificationsService.createNotification({
          userId: driver.userId,
          title: copy.title,
          message: copy.message(firstName),
          type: 'system',
          priority: 'medium',
          relatedEntityType: 'driver',
          relatedEntityId: driver.id,
        });

        await this.prisma.driver.update({
          where: { id: driver.id },
          data: { lastBirthdayNotifiedYear: year },
        });

        sent.push({
          driverId: driver.id,
          userId: driver.userId,
          firstName,
        });
      } catch {
        skipped.push({ driverId: driver.id, reason: 'notification_failed' });
      }
    }

    return {
      referenceDate: referenceDate.toISOString().slice(0, 10),
      checkedMonth: month + 1,
      checkedDay: day,
      candidates: birthdayDrivers.length,
      sent: sent.length,
      skipped: skipped.length,
      drivers: sent,
      skippedDetails: skipped,
    };
  }
}
