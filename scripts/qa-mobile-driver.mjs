#!/usr/bin/env node

const baseUrl = process.env.QA_MOBILE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const email = process.env.QA_MOBILE_EMAIL ?? 'driver@fleet.com';
const password = process.env.QA_MOBILE_PASSWORD ?? 'driver123';

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function printStep(label, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}${detail ? ` - ${detail}` : ''}`);
}

async function run() {
  const results = [];

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = login.body?.accessToken;
  const loginPass = login.ok && typeof token === 'string' && token.length > 0;
  results.push(['login', loginPass, `status=${login.status}`]);

  if (!loginPass) {
    for (const [label, passed, detail] of results) {
      printStep(label, passed, detail);
    }
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  const me = await request('/driver/me', { headers: authHeaders });
  const mePass = me.ok && typeof me.body?.driver?.id === 'string';
  results.push(['driver/me', mePass, `status=${me.status}`]);

  const assignments = await request('/driver/assignments/today', { headers: authHeaders });
  const assignmentCount = Array.isArray(assignments.body) ? assignments.body.length : 0;
  const assignmentsPass = assignments.ok && assignmentCount > 0;
  results.push(['driver/assignments/today', assignmentsPass, `status=${assignments.status}, count=${assignmentCount}`]);

  const unread = await request('/driver/notifications/unread-count', { headers: authHeaders });
  const unreadPass = unread.ok && typeof unread.body?.count === 'number';
  results.push(['driver/notifications/unread-count', unreadPass, `status=${unread.status}, count=${unread.body?.count ?? 'n/a'}`]);

  let failed = 0;
  for (const [label, passed, detail] of results) {
    if (!passed) failed += 1;
    printStep(label, passed, detail);
  }

  console.log(`\nSummary: ${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error('[FAIL] qa-mobile-driver execution error');
  console.error(error);
  process.exit(1);
});
