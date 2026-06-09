import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowedDepartmentsForRole,
  canAccessDepartment,
  normalizeDriverConversationDepartment,
  normalizeMessengerDepartment,
} from './messenger-departments.util';
import { buildMessengerConversationsCsv } from './messenger-export.util';

describe('messenger-departments.util', () => {
  it('normalizes unknown departments to general', () => {
    assert.equal(normalizeMessengerDepartment('DISPATCH'), 'dispatch');
    assert.equal(normalizeMessengerDepartment(''), 'general');
    assert.equal(normalizeMessengerDepartment(undefined), 'general');
  });

  it('normalizes driver conversation audience aliases', () => {
    assert.equal(normalizeDriverConversationDepartment('office'), 'dispatch');
    assert.equal(normalizeDriverConversationDepartment('ofis'), 'dispatch');
    assert.equal(normalizeDriverConversationDepartment('accounting'), 'accounting');
    assert.equal(normalizeDriverConversationDepartment('all'), 'general');
    assert.equal(normalizeDriverConversationDepartment('hepsi'), 'general');
  });

  it('scopes office users to allowed departments', () => {
    assert.deepEqual(allowedDepartmentsForRole('office'), [
      'dispatch',
      'hr',
      'maintenance',
      'general',
    ]);
    assert.equal(canAccessDepartment('office', 'accounting'), false);
    assert.equal(canAccessDepartment('accounting', 'accounting'), true);
  });
});

describe('messenger-export.util', () => {
  it('builds csv with escaped values', () => {
    const csv = buildMessengerConversationsCsv([
      {
        driverName: 'Ali, Veli',
        employeeNumber: 'D-100',
        department: 'dispatch',
        subject: 'Route "A"',
        lastMessageAt: '2026-06-09T10:00:00.000Z',
        unreadCount: 2,
        lastMessagePreview: 'Hello',
      },
    ]);

    assert.equal(csv.startsWith('\uFEFFdriver_name'), true);
    assert.match(csv, /"Ali, Veli"/);
    assert.match(csv, /"Route ""A"""/);
  });
});
