const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
  'welcome',
  'welcome1',
  'fleet123',
  'fleet1234',
]);

export function getPasswordPolicyMessage(): string {
  return 'Password must be at least 10 characters and include uppercase, lowercase, and a digit.';
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return getPasswordPolicyMessage();
  }
  if (!/[a-z]/.test(password)) {
    return getPasswordPolicyMessage();
  }
  if (!/[A-Z]/.test(password)) {
    return getPasswordPolicyMessage();
  }
  if (!/\d/.test(password)) {
    return getPasswordPolicyMessage();
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Password is too common. Choose a stronger password.';
  }
  return null;
}

export function assertValidPassword(password: string): void {
  const message = validatePassword(password);
  if (message) {
    throw new Error(message);
  }
}
