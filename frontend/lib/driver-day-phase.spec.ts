import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  phaseStartsWorkSession,
  resolveDriverDayPhase,
  type DriverDayInput,
  type DriverDayPhase,
} from './driver-day-phase';

const base: DriverDayInput = {
  assignmentStatus: 'confirmed',
  departureCheckDone: true,
  morningCheckinDone: false,
  handoverPhotosPending: false,
  workSessionActive: false,
};

const phaseFor = (overrides: Partial<DriverDayInput>): DriverDayPhase =>
  resolveDriverDayPhase({ ...base, ...overrides });

describe('resolveDriverDayPhase', () => {
  it('walks a normal day from vehicle check to shift end', () => {
    assert.equal(phaseFor({ departureCheckDone: false }), 'departure_check');
    assert.equal(phaseFor({ departureCheckDone: true }), 'start_tour');
    assert.equal(phaseFor({ morningCheckinDone: true }), 'on_tour');
    assert.equal(
      phaseFor({ assignmentStatus: 'completed', handoverPhotosPending: true }),
      'handover',
    );
    assert.equal(
      phaseFor({ assignmentStatus: 'completed', workSessionActive: true }),
      'end_shift',
    );
    assert.equal(phaseFor({ assignmentStatus: 'completed' }), 'day_closed');
  });

  it('treats the vehicle check as a gate the tour cannot skip', () => {
    for (const assignmentStatus of ['planned', 'confirmed']) {
      assert.equal(
        phaseFor({ assignmentStatus, departureCheckDone: false }),
        'departure_check',
        `${assignmentStatus} should be gated by the vehicle check`,
      );
    }
  });

  /**
   * The check has no page in the portal yet (plan step 4). Until it does, an
   * unknown result must not park the driver on a phase that leads nowhere.
   */
  it('skips the vehicle check while the feature is unwired', () => {
    assert.equal(phaseFor({ departureCheckDone: null }), 'start_tour');
    assert.equal(
      phaseFor({ assignmentStatus: 'planned', departureCheckDone: null }),
      'start_tour',
    );
  });

  it('shows nothing to do when no work is planned', () => {
    assert.equal(phaseFor({ assignmentStatus: null }), 'no_assignment');
  });

  /**
   * A session can be open without an assignment — standby, or a day that was
   * never closed. Reporting 'no_assignment' there would leave the driver with no
   * way to stop the clock, and the office with an open session.
   */
  it('still offers to close an open session with no assignment', () => {
    assert.equal(
      phaseFor({ assignmentStatus: null, workSessionActive: true }),
      'end_shift',
    );
  });

  it('asks for missing handover photos before letting the shift end', () => {
    assert.equal(
      phaseFor({
        assignmentStatus: 'completed',
        handoverPhotosPending: true,
        workSessionActive: true,
      }),
      'handover',
    );
  });

  it('treats a cancelled assignment as a finished one', () => {
    assert.equal(phaseFor({ assignmentStatus: 'cancelled' }), 'day_closed');
    assert.equal(
      phaseFor({ assignmentStatus: 'cancelled', workSessionActive: true }),
      'end_shift',
    );
  });

  it('does not gate a tour that is already running', () => {
    assert.equal(
      phaseFor({ assignmentStatus: 'in_progress', departureCheckDone: false }),
      'on_tour',
    );
  });

  it('falls through to start_tour for statuses it does not know', () => {
    assert.equal(phaseFor({ assignmentStatus: 'some_future_status' }), 'start_tour');
  });

  /**
   * The driver's assignment endpoints are read-only, so a driver can never move
   * an assignment to in_progress. Today's check-in is what marks the tour as
   * under way; hanging this on the status would strand the driver on
   * 'start_tour' for the whole day.
   */
  it('treats the check-in as the signal that the tour is under way', () => {
    assert.equal(phaseFor({ assignmentStatus: 'confirmed', morningCheckinDone: true }), 'on_tour');
    assert.equal(phaseFor({ assignmentStatus: 'planned', morningCheckinDone: true }), 'on_tour');
  });

  it('honours an office-set in_progress even before the driver checks in', () => {
    assert.equal(
      phaseFor({ assignmentStatus: 'in_progress', morningCheckinDone: false }),
      'on_tour',
    );
  });

  /**
   * The gate outranks the check-in: a driver who somehow checked in without the
   * vehicle check must still be sent back to it.
   */
  it('keeps the vehicle check ahead of a completed check-in', () => {
    assert.equal(
      phaseFor({ departureCheckDone: false, morningCheckinDone: true }),
      'departure_check',
    );
  });
});

describe('phaseStartsWorkSession', () => {
  it('marks only the phases that open the day', () => {
    assert.equal(phaseStartsWorkSession('departure_check'), true);
    assert.equal(phaseStartsWorkSession('start_tour'), true);
    for (const phase of ['on_tour', 'handover', 'end_shift', 'day_closed', 'no_assignment'] as const) {
      assert.equal(phaseStartsWorkSession(phase), false, `${phase} must not open a session`);
    }
  });
});
