import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addMinutes,
  dayRange,
  DEFAULT_MATCH_TOLERANCE_MINUTES,
  parseTimeOnDate,
} from './fine-management.util';

export type FineMatchCandidate = {
  driver_id: string;
  driver_name: string;
  employee_number: string;
  work_session_id: string;
  assignment_id: string | null;
  company_name: string | null;
  session_started_at: string;
  session_ended_at: string | null;
  assignment_start_time: string | null;
  assignment_end_time: string | null;
  match_score: number;
};

export type FineMatchPreviewResult = {
  vehicle_id: string;
  violation_at: string;
  tolerance_minutes: number;
  candidates: FineMatchCandidate[];
  suggested: FineMatchCandidate | null;
  match_type: 'auto' | 'manual' | 'unmatched';
};

const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
  AssignmentStatus.completed,
];

@Injectable()
export class FineMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    vehicleId: string,
    violationAt: Date,
    toleranceMinutes = DEFAULT_MATCH_TOLERANCE_MINUTES,
  ): Promise<FineMatchPreviewResult> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, plateNumber: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const candidates = await this.findCandidates(vehicleId, violationAt, toleranceMinutes);
    const suggested = candidates.length === 1 ? candidates[0] : null;

    return {
      vehicle_id: vehicleId,
      violation_at: violationAt.toISOString(),
      tolerance_minutes: toleranceMinutes,
      candidates,
      suggested,
      match_type: suggested ? 'auto' : candidates.length > 1 ? 'manual' : 'unmatched',
    };
  }

  async findCandidates(
    vehicleId: string,
    violationAt: Date,
    toleranceMinutes = DEFAULT_MATCH_TOLERANCE_MINUTES,
  ): Promise<FineMatchCandidate[]> {
    const { start, end } = dayRange(violationAt);
    const assignments = await this.prisma.assignment.findMany({
      where: {
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: ASSIGNMENT_STATUSES },
      },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
        company: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    if (!assignments.length) return [];

    const driverIds = [...new Set(assignments.map((row) => row.driverId))];
    const sessions = await this.prisma.workSession.findMany({
      where: {
        driverId: { in: driverIds },
        startedAt: { gte: start, lt: end },
      },
      orderBy: { startedAt: 'asc' },
    });

    const candidates: FineMatchCandidate[] = [];

    for (const session of sessions) {
      const sessionStart = addMinutes(session.startedAt, -toleranceMinutes);
      const sessionEnd = addMinutes(session.endedAt ?? end, toleranceMinutes);
      if (violationAt < sessionStart || violationAt > sessionEnd) continue;

      const driverAssignments = assignments.filter((row) => row.driverId === session.driverId);
      const bestAssignment = this.pickBestAssignment(driverAssignments, violationAt, toleranceMinutes);
      const driver = bestAssignment?.driver ?? driverAssignments[0]?.driver;
      if (!driver) continue;

      const score = this.scoreCandidate(violationAt, session, bestAssignment, toleranceMinutes);

      candidates.push({
        driver_id: driver.id,
        driver_name: `${driver.firstName} ${driver.lastName}`.trim(),
        employee_number: driver.employeeNumber,
        work_session_id: session.id,
        assignment_id: bestAssignment?.id ?? null,
        company_name: bestAssignment?.company.name ?? null,
        session_started_at: session.startedAt.toISOString(),
        session_ended_at: session.endedAt?.toISOString() ?? null,
        assignment_start_time: bestAssignment?.startTime ?? null,
        assignment_end_time: bestAssignment?.endTime ?? null,
        match_score: score,
      });
    }

    const deduped = new Map<string, FineMatchCandidate>();
    for (const candidate of candidates.sort((a, b) => b.match_score - a.match_score)) {
      const key = `${candidate.driver_id}:${candidate.work_session_id}`;
      if (!deduped.has(key)) deduped.set(key, candidate);
    }

    return [...deduped.values()].sort((a, b) => b.match_score - a.match_score);
  }

  private pickBestAssignment(
    assignments: Array<
      Prisma.AssignmentGetPayload<{
        include: {
          driver: { select: { id: true; firstName: true; lastName: true; employeeNumber: true } };
          company: { select: { name: true } };
        };
      }>
    >,
    violationAt: Date,
    toleranceMinutes: number,
  ) {
    let best: (typeof assignments)[number] | null = null;
    let bestScore = -1;

    for (const assignment of assignments) {
      const workDate = assignment.workDate;
      const assignmentStart = addMinutes(parseTimeOnDate(workDate, assignment.startTime), -toleranceMinutes);
      const assignmentEnd = addMinutes(parseTimeOnDate(workDate, assignment.endTime), toleranceMinutes);
      if (violationAt < assignmentStart || violationAt > assignmentEnd) continue;

      const midpoint =
        (parseTimeOnDate(workDate, assignment.startTime).getTime() +
          parseTimeOnDate(workDate, assignment.endTime).getTime()) /
        2;
      const score = 100 - Math.abs(violationAt.getTime() - midpoint) / 60_000;
      if (score > bestScore) {
        bestScore = score;
        best = assignment;
      }
    }

    return best ?? assignments[0] ?? null;
  }

  private scoreCandidate(
    violationAt: Date,
    session: { startedAt: Date; endedAt: Date | null },
    assignment: {
      workDate: Date;
      startTime: string;
      endTime: string;
    } | null,
    toleranceMinutes: number,
  ): number {
    const sessionMidpoint =
      (session.startedAt.getTime() + (session.endedAt ?? violationAt).getTime()) / 2;
    let score = 100 - Math.abs(violationAt.getTime() - sessionMidpoint) / 60_000;

    if (assignment) {
      const assignmentStart = parseTimeOnDate(assignment.workDate, assignment.startTime);
      const assignmentEnd = parseTimeOnDate(assignment.workDate, assignment.endTime);
      if (
        violationAt >= addMinutes(assignmentStart, -toleranceMinutes) &&
        violationAt <= addMinutes(assignmentEnd, toleranceMinutes)
      ) {
        score += 25;
      }
    }

    return Math.round(score);
  }
}
