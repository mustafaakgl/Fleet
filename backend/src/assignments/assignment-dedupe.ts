import { Assignment, AssignmentStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const ACTIVE_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

const STATUS_RANK: Record<AssignmentStatus, number> = {
  [AssignmentStatus.in_progress]: 50,
  [AssignmentStatus.confirmed]: 40,
  [AssignmentStatus.planned]: 30,
  [AssignmentStatus.completed]: 20,
  [AssignmentStatus.cancelled]: 0,
};

function calendarDayKey(workDate: Date): string {
  const year = workDate.getFullYear();
  const month = String(workDate.getMonth() + 1).padStart(2, '0');
  const day = String(workDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRangeFromKey(dayKey: string): { start: Date; end: Date } {
  const start = new Date(`${dayKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function rankAssignment(
  assignment: Assignment & { morningCheckins: { id: string }[] },
  preferredAssignmentIds: Set<string>,
): number {
  let score = STATUS_RANK[assignment.status] ?? 0;
  if (preferredAssignmentIds.has(assignment.id)) {
    score += 1000;
  }
  if (assignment.morningCheckins.length > 0) {
    score += 500;
  }
  return score;
}

export type AssignmentDedupeScope = {
  driverId?: string;
  /** Inclusive calendar day YYYY-MM-DD */
  date?: string;
};

export type AssignmentDedupeResult = {
  groupsProcessed: number;
  cancelled: number;
  keeperIds: string[];
};

/**
 * Ensures at most one active assignment per driver per calendar work day.
 * Extra rows are cancelled and FKs are repointed to the kept assignment.
 */
export async function dedupeDriverDayAssignments(
  prisma: PrismaService,
  scope?: AssignmentDedupeScope,
): Promise<AssignmentDedupeResult> {
  const where: Prisma.AssignmentWhereInput = {
    status: { in: ACTIVE_STATUSES },
  };

  if (scope?.driverId) {
    where.driverId = scope.driverId;
  }

  if (scope?.date) {
    const { start, end } = dayRangeFromKey(scope.date);
    where.workDate = { gte: start, lt: end };
  }

  const rows = await prisma.assignment.findMany({
    where,
    include: { morningCheckins: { select: { id: true } } },
    orderBy: [{ workDate: 'asc' }, { updatedAt: 'desc' }],
  });

  const groups = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const key = `${row.driverId}:${calendarDayKey(row.workDate)}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  let cancelled = 0;
  const keeperIds: string[] = [];

  for (const [, group] of groups) {
    if (group.length <= 1) {
      continue;
    }

    const dayKey = calendarDayKey(group[0].workDate);
    const { start, end } = dayRangeFromKey(dayKey);
    const driverId = group[0].driverId;

    const checkins = await prisma.morningCheckin.findMany({
      where: {
        driverId,
        date: { gte: start, lt: end },
        assignmentId: { not: null },
      },
      select: { assignmentId: true },
    });
    const preferredAssignmentIds = new Set(
      checkins.map((c) => c.assignmentId).filter((id): id is string => Boolean(id)),
    );

    const sorted = [...group].sort((a, b) => {
      const diff = rankAssignment(b, preferredAssignmentIds) - rankAssignment(a, preferredAssignmentIds);
      if (diff !== 0) return diff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const keeper = sorted[0];
    const duplicateIds = sorted.slice(1).map((row) => row.id);
    keeperIds.push(keeper.id);

    await prisma.$transaction(async (tx) => {
      await tx.assignment.updateMany({
        where: { id: { in: duplicateIds } },
        data: {
          status: AssignmentStatus.cancelled,
          notes: 'Auto-cancelled: duplicate assignment for same driver/day',
        },
      });

      await tx.morningCheckin.updateMany({
        where: { assignmentId: { in: duplicateIds } },
        data: { assignmentId: keeper.id },
      });

      await tx.vehicleHandover.updateMany({
        where: { assignmentId: { in: duplicateIds } },
        data: { assignmentId: keeper.id },
      });

      await tx.calendarEvent.updateMany({
        where: { assignmentId: { in: duplicateIds } },
        data: { assignmentId: keeper.id },
      });

      await tx.accident.updateMany({
        where: { assignmentId: { in: duplicateIds } },
        data: { assignmentId: keeper.id },
      });

      const transportLinked = await tx.transportRequest.findMany({
        where: { assignmentId: { in: duplicateIds } },
        select: { id: true, assignmentId: true },
      });
      for (const request of transportLinked) {
        const keeperTaken = await tx.transportRequest.findFirst({
          where: { assignmentId: keeper.id },
          select: { id: true },
        });
        if (!keeperTaken) {
          await tx.transportRequest.update({
            where: { id: request.id },
            data: { assignmentId: keeper.id },
          });
        } else {
          await tx.transportRequest.update({
            where: { id: request.id },
            data: { assignmentId: null },
          });
        }
      }
    });

    cancelled += duplicateIds.length;
  }

  return {
    groupsProcessed: [...groups.values()].filter((g) => g.length > 1).length,
    cancelled,
    keeperIds,
  };
}
