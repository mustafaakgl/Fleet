/**
 * Which single thing should the driver do right now?
 *
 * The portal home used to show every capability at once — work session, check-in,
 * handover, location, counters, quick actions — leaving the driver to work out
 * the order themselves. This resolves the day into one phase so the screen can
 * offer exactly one primary action.
 *
 * Kept as a pure function on purpose: getting the order wrong sends a driver to
 * the wrong task, so the rules need to be testable without rendering anything.
 */

export type DriverDayPhase =
  | 'no_assignment'
  | 'departure_check'
  | 'start_tour'
  | 'on_tour'
  | 'handover'
  | 'end_shift'
  | 'day_closed';

export interface DriverDayInput {
  /** Today's assignment status, or null when nothing is planned. */
  assignmentStatus: string | null;
  /**
   * Whether the daily vehicle check (Abfahrtskontrolle) is done.
   * `null` means the feature is not wired into the portal yet — the phase is
   * then skipped rather than blocking the driver on a page that does not exist.
   */
  departureCheckDone: boolean | null;
  /**
   * Whether today's check-in exists. This, not the assignment status, marks the
   * tour as under way: the driver's assignment endpoints are read-only, so the
   * driver cannot move an assignment to in_progress themselves. The office still
   * can, and that is honoured below.
   */
  morningCheckinDone: boolean;
  /** Handover photos the office is still waiting for. */
  handoverPhotosPending: boolean;
  /** A work session is currently running. */
  workSessionActive: boolean;
}

const FINISHED_STATUSES = new Set(['completed', 'cancelled']);

export function resolveDriverDayPhase(input: DriverDayInput): DriverDayPhase {
  const {
    assignmentStatus,
    departureCheckDone,
    morningCheckinDone,
    handoverPhotosPending,
    workSessionActive,
  } = input;

  if (assignmentStatus === null) {
    // No planned work. A session can still be open — from standby, or from a day
    // that was never closed — and the driver needs a way to end it.
    return workSessionActive ? 'end_shift' : 'no_assignment';
  }

  if (FINISHED_STATUSES.has(assignmentStatus)) {
    if (handoverPhotosPending) {
      return 'handover';
    }
    return workSessionActive ? 'end_shift' : 'day_closed';
  }

  // The office moved it along; do not send the driver back to a start step.
  if (assignmentStatus === 'in_progress') {
    return 'on_tour';
  }

  // planned / confirmed: the vehicle check gates the tour.
  if (departureCheckDone === false) {
    return 'departure_check';
  }

  return morningCheckinDone ? 'on_tour' : 'start_tour';
}

/**
 * Phases that begin the working day. Reaching one of these acts on the driver's
 * behalf — the work session starts from the first action rather than a separate
 * button — so the screen must say that the session opened.
 */
export function phaseStartsWorkSession(phase: DriverDayPhase): boolean {
  return phase === 'departure_check' || phase === 'start_tour';
}
