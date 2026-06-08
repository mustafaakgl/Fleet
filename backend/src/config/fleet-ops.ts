export function getFleetOpsEmails(): string[] {
  const raw = process.env.FLEET_OPS_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isFleetOpsEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getFleetOpsEmails().includes(normalized);
}

export function isFleetOpsApiKey(value: string | undefined | null): boolean {
  const expected = process.env.FLEET_OPS_API_KEY?.trim();
  if (!expected || !value) return false;
  return value.trim() === expected;
}
